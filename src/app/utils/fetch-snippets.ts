import "dotenv/config";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import colors from "colors";
import { ReadingBook, ReadingData } from "./get-reading";

type BookPayload = {
  id: string;
  title: string;
  author: string;
  isbn: string | null;
  shelf: string;
  rating: number;
  favorite: boolean;
  dateRead: string | null;
  dateAdded: string;
  summary?: string;
};

type SnippetCacheEntry = {
  snippet: string | null;
  source: string | null;
  book: BookPayload;
  updatedAt: string;
};

type SnippetCache = Record<string, SnippetCacheEntry>;

const CACHE_PATH = path.resolve(__dirname, "../../../data/snippet-cache.json");
const SEEDS_PATH = path.resolve(__dirname, "../../../data/summary-seeds.json");
const SOURCE = "byline";
const CHUNK_SIZE = 8;
const INSUFFICIENT = "Insufficient summary.";
const BOT_UA =
  "rkrt.net-snippet-bot/1.0 (personal static site; https://rkrt.net)";

function loadSummarySeeds(): Record<string, string> {
  if (!fs.existsSync(SEEDS_PATH)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(SEEDS_PATH, "utf8")) as Record<
      string,
      string
    >;
  } catch {
    return {};
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const BYLINE_RULES = [
  "INPUT: one library record JSON with fields snippet, source, book{title,author,isbn?,summary?}, updatedAt. Read book.summary first; use book.title and book.author for identity and for lookup if needed. Ignore shelf, rating, favorite, dates.",
  "OUTPUT: exactly one sentence, 20–26 words, present tense. No quotes, no label, no markdown, no title, no author name, no series number, no second sentence.",
  "FICTION template (mandatory): When [specific spoiler-free premise], [who] must [active verb phrase] [stakes]. Example: When the apocalypse turns Earth into a televised death trap, Carl must fight through eighteen levels of monsters and mayhem to survive for a galactic audience.",
  "NONFICTION template (mandatory): [Concrete subject — never the author] [active verb] [what the book shows], [participle/relative clause with the core insight]. Example: Ancient DNA analysis rewrites the story of human migration, revealing a far more tangled prehistory than fossils alone suggested.",
  "BANNED openers: Tracing, Drawing on, Following, Through, By analyzing/cultivating, Stop, Mastering, Uncover/Uncovering, A definitive/sweeping/provocative/riveting, This book/account/guide/narrative/volume, author first+last name.",
  "BANNED words/phrases: masterfully, definitive, groundbreaking, riveting, compelling, essential, timeless, profound, catalog, chronicles, explores how, strips away, pulls back the curtain, offers a, provides a.",
  "No spoilers of endings, twists, or mid-book reveals. Prefer premise + pressure. Match genre register lightly but keep the fixed template.",
  'If book.summary is missing/empty but title (and optional author) exists: /search "<title> <author> synopsis" → /fetch the best publisher/bookstore/encyclopedia hit; /browse only if /fetch is a JS shell. Then write the snippet from that premise. Never invent plot.',
  "If a usable summary is already present, do not search. If lookup fails or there is no title, reply exactly: Insufficient summary.",
];

function bylineAgentDef(hasSummary: boolean) {
  return {
    id: "byline",
    name: "byline",
    role: "library-snippet-writer",
    model: "google/gemini-3.1-flash-lite",
    max_tokens: 512,
    temperature: 0.2,
    goal:
      "Write one library snippet (byline) for a single book record. Same shape every time. No voice drift.",
    personality:
      "Jacket flap, not review. Concrete premise only. Identical cadence across the shelf.",
    brevity: "lite",
    rules: hasSummary
      ? [
          ...BYLINE_RULES,
          "book.summary is already present and usable. Write the byline from it only. Do not call tools. Reply with the single sentence only.",
          "Never reply Insufficient summary when a SUMMARY block or book.summary is provided.",
        ]
      : BYLINE_RULES,
    // Flash-lite often returns tool writs as final content; only enable lookup when needed.
    capabilities: hasSummary ? [] : ["/search", "/fetch", "/browse"],
  };
}

function loadCache(): SnippetCache {
  if (!fs.existsSync(CACHE_PATH)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8")) as SnippetCache;
  } catch {
    return {};
  }
}

function saveCache(cache: SnippetCache): void {
  const next = JSON.stringify(cache, null, 2) + "\n";

  if (fs.existsSync(CACHE_PATH)) {
    const current = fs.readFileSync(CACHE_PATH, "utf8");
    if (current === next) {
      return;
    }
  }

  fs.writeFileSync(CACHE_PATH, next, "utf8");
}

function bookKey(book: ReadingBook): string {
  if (book.isbn) {
    return book.isbn;
  }

  return `id-${book.id}`;
}

function toBookPayload(book: ReadingBook, summary?: string | null): BookPayload {
  const payload: BookPayload = {
    id: book.id,
    title: book.title,
    author: book.author,
    isbn: book.isbn,
    shelf: book.shelf,
    rating: book.rating,
    favorite: book.favorite,
    dateRead: book.dateRead,
    dateAdded: book.dateAdded,
  };

  if (summary && summary.trim()) {
    payload.summary = summary.trim();
  }

  return payload;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function cleanByline(content: string): string | null {
  if (/Insufficient summary\.?\s*$/i.test(content.trim())) {
    return null;
  }

  const cleaned = content
    .replace(/^```(?:\w+)?\s*/g, "")
    .replace(/\s*```$/g, "")
    // Strip inline writ commands left in the final turn text.
    .replace(
      /\/(?:search|fetch|browse|mem|exec|agent|parallel|write|read|mcp|a2a)\b[^\n/]*/gi,
      "\n"
    )
    .replace(/Insufficient summary\.?/gi, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n+/g, "\n")
    .trim();

  // Prefer the last prose line after any writ noise.
  const lines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("/"));
  const candidate = (lines[lines.length - 1] || cleaned)
    .replace(/^["“]+|["”]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!candidate || candidate.startsWith("/") || candidate.length < 40) {
    return null;
  }

  // Prefer a full terminal sentence; avoid truncating on abbreviations (Jr., U.S., etc.).
  const terminal = candidate.match(
    /^([\s\S]*?[.!?])(?=\s*$|\s+[A-Z"“])/
  );
  let sentence = (terminal ? terminal[1] : candidate).trim();
  // If the only period was inside an abbreviation, keep the whole candidate.
  if (sentence.split(/\s+/).filter(Boolean).length < 14) {
    sentence = candidate.replace(/\s*[.!?]*$/, "").trim() + ".";
  }

  const words = sentence.split(/\s+/).filter(Boolean);

  // Agent contract is 20–26 words; allow slack for model variance.
  if (words.length < 14 || words.length > 40) {
    return null;
  }

  return sentence;
}

function parseSseDoneContent(streamText: string): string | null {
  const frames = streamText.split(/\n\n+/);
  let content: string | null = null;

  for (const frame of frames) {
    const lines = frame.split(/\n/);
    let event = "message";
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith("event:")) {
        event = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (!dataLines.length) {
      continue;
    }

    try {
      const data = JSON.parse(dataLines.join("\n"));
      if (event === "done") {
        if (data?.ok === false) {
          return null;
        }
        if (typeof data?.content === "string") {
          content = data.content;
        }
      }
    } catch {
      // ignore non-JSON data frames
    }
  }

  return content;
}

function bylineEndpoint(): string {
  const raw = (process.env.BYLINE_API_URL || "").trim();
  if (!raw) {
    return "";
  }

  const base = raw.replace(/\/+$/, "");
  if (/\/v1\/orchestrate$/i.test(base)) {
    return base;
  }

  return `${base}/v1/orchestrate`;
}

function metaContent(html: string, key: string): string | null {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']*)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${key}["'][^>]*>`,
      "i"
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return match[1]
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ")
        .trim();
    }
  }

  return null;
}

function bareTitle(title: string): string {
  return title
    .replace(/\s*\([^)]*#\d+[^)]*\)\s*$/g, "")
    .replace(/\s*\(Penguin classics\)\s*$/i, "")
    .trim();
}

/** Reject truncated/meta blurbs that make the agent bail with Insufficient summary. */
function isUsableSummary(summary: string | null | undefined): boolean {
  const text = (summary || "").replace(/\s+/g, " ").trim();
  if (text.length < 100) {
    return false;
  }
  if (/…|\.\.\.\s*$/.test(text)) {
    return false;
  }
  if (/^read [\d,.]+\s+reviews/i.test(text)) {
    return false;
  }
  // Wikipedia/Goodreads stubs with no premise.
  if (
    /\bmay refer to\b/i.test(text) ||
    /\bis the \w+ (nonfiction )?book authored by\b/i.test(text) ||
    /\bis an? (?:\w+\s+){0,4}author of\b/i.test(text)
  ) {
    return false;
  }
  // Short award/publication stubs without premise ("is a 1983 horror novel by…").
  // Longer multi-sentence Wikipedia intros are still usable for bylines.
  if (
    text.length < 220 &&
    /^.{0,80}\bis a (?:\d{4} )?(?:horror |science fiction |fantasy )?novel by\b/i.test(
      text
    ) &&
    !/\b(tells|follows|when|after|must|about)\b/i.test(text)
  ) {
    return false;
  }

  return true;
}

/**
 * Seed book.summary from Goodreads og:description so the byline agent
 * can skip brittle lookup for titles it otherwise fails to identify.
 */
async function seedSummaryFromGoodreads(
  bookId: string
): Promise<string | null> {
  if (!bookId) {
    return null;
  }

  try {
    const response = await fetch(
      `https://www.goodreads.com/book/show/${bookId}`,
      {
        headers: {
          "User-Agent": BOT_UA,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
      }
    );

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const og = metaContent(html, "og:description");
    return isUsableSummary(og) ? og : null;
  } catch {
    return null;
  }
}

async function wikipediaExtract(pageTitle: string): Promise<string | null> {
  await sleep(900);
  const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
    pageTitle
  )}`;
  const summaryRes = await fetch(summaryUrl, {
    headers: {
      "User-Agent": BOT_UA,
      Accept: "application/json",
    },
  });
  if (!summaryRes.ok) {
    return null;
  }

  const summaryJson = (await summaryRes.json()) as {
    extract?: string;
    type?: string;
    title?: string;
  };
  if (summaryJson.type === "disambiguation") {
    return null;
  }

  const extract = summaryJson.extract?.replace(/\s+/g, " ").trim() || "";
  return isUsableSummary(extract) ? extract : null;
}

async function seedSummaryFromWikipedia(
  title: string,
  author: string
): Promise<string | null> {
  const bare = bareTitle(title);
  const short = bare.replace(/\s*:.*/, "").trim();
  if (!bare) {
    return null;
  }

  try {
    const directPages = Array.from(
      new Set(
        [bare, short, `${short} (novel)`, `${short} (book)`].filter(
          (page) => page.length > 3
        )
      )
    );

    for (const page of directPages) {
      const extract = await wikipediaExtract(page);
      if (extract) {
        return extract;
      }
    }

    const query = `${short} ${author}`.trim();
    const searchUrl =
      "https://en.wikipedia.org/w/api.php?" +
      new URLSearchParams({
        action: "query",
        list: "search",
        srsearch: query,
        srlimit: "5",
        format: "json",
      });

    const searchRes = await fetch(searchUrl, {
      headers: {
        "User-Agent": BOT_UA,
        Accept: "application/json",
      },
    });
    if (!searchRes.ok) {
      return null;
    }

    const searchJson = (await searchRes.json()) as {
      query?: { search?: Array<{ title: string }> };
    };
    const hits = searchJson.query?.search || [];
    const needle = short.toLowerCase();

    for (const hit of hits) {
      const hitTitle = hit.title.toLowerCase();
      // Prefer pages that look like the book, not the author bio.
      if (
        !hitTitle.includes(needle.slice(0, Math.min(12, needle.length))) &&
        !needle.includes(hitTitle.slice(0, Math.min(12, hitTitle.length)))
      ) {
        continue;
      }

      const extract = await wikipediaExtract(hit.title);
      if (extract) {
        return extract;
      }
    }

    return null;
  } catch {
    return null;
  }
}

async function seedSummaryFromUrl(url: string): Promise<string | null> {
  if (!/^https?:\/\//i.test(url)) {
    return null;
  }
  // Skip search pages and JS-app shells that rarely expose og:description.
  if (
    /google\.[^/]+\/search|bing\.com\/search|duckduckgo\.com/i.test(url)
  ) {
    return null;
  }

  const wikiTitle = url.match(
    /(?:en\.)?wikipedia\.org\/wiki\/([^#?]+)/i
  )?.[1];
  if (wikiTitle) {
    return wikipediaExtract(decodeURIComponent(wikiTitle.replace(/_/g, " ")));
  }

  try {
    await sleep(400);
    const response = await fetch(url, {
      headers: {
        "User-Agent": BOT_UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });
    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const og =
      metaContent(html, "og:description") ||
      metaContent(html, "description");
    return isUsableSummary(og) ? og : null;
  } catch {
    return null;
  }
}

function extractFetchUrls(content: string): string[] {
  const urls = new Set<string>();
  const re = /\/fetch\s+(https?:\/\/\S+)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content))) {
    urls.add(match[1].replace(/[.,);]+$/, ""));
  }
  // Bare Wikipedia links the model often emits after a failed lookup.
  const wiki = /https?:\/\/en\.wikipedia\.org\/wiki\/[^\s)"']+/gi;
  while ((match = wiki.exec(content))) {
    urls.add(match[0].replace(/[.,);]+$/, ""));
  }
  return Array.from(urls).slice(0, 4);
}

async function resolveSummary(
  book: ReadingBook,
  priorSummary: string | null | undefined
): Promise<string | null> {
  const seeds = loadSummarySeeds();
  const seeded = seeds[book.id];
  if (isUsableSummary(seeded)) {
    return seeded.trim();
  }

  if (isUsableSummary(priorSummary)) {
    return priorSummary!.trim();
  }

  const fromGoodreads = await seedSummaryFromGoodreads(book.id);
  if (fromGoodreads) {
    return fromGoodreads;
  }

  await sleep(1200);
  return seedSummaryFromWikipedia(book.title, book.author);
}

async function requestBylineOnce(
  record: SnippetCacheEntry
): Promise<{ byline: string | null; content: string | null }> {
  const url = bylineEndpoint();
  const token = process.env.BYLINE_API_TOKEN;

  if (!url || !token) {
    throw new Error(
      "BYLINE_API_URL and BYLINE_API_TOKEN must be set to generate reading snippets"
    );
  }

  const summary = record.book.summary?.trim() || "";
  const hasSummary = isUsableSummary(summary);
  const message = hasSummary
    ? [
        "Write exactly one byline sentence from the SUMMARY below.",
        "Do not search, fetch, browse, or invent facts. Do not emit /search, /fetch, or /browse.",
        "Never reply Insufficient summary when a SUMMARY block is provided.",
        "Reply with the sentence only — no labels, no markdown.",
        "",
        `TITLE: ${record.book.title}`,
        `AUTHOR: ${record.book.author}`,
        "",
        "SUMMARY:",
        summary,
        "",
        "RECORD:",
        JSON.stringify(record),
      ].join("\n")
    : JSON.stringify(record);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      agent: "byline",
      agent_def: bylineAgentDef(hasSummary),
      message,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Byline API ${response.status}: ${body.slice(0, 200) || response.statusText}`
    );
  }

  const streamText = await response.text();
  const content = parseSseDoneContent(streamText);
  if (!content) {
    return { byline: null, content: null };
  }

  return { byline: cleanByline(content), content };
}

/**
 * Arbiter /search often fails for this model; recover by fetching any
 * publisher/wiki URLs the agent mentioned, then rewriting from that summary.
 */
async function requestByline(record: SnippetCacheEntry): Promise<{
  byline: string | null;
  summary: string | null;
}> {
  let working: SnippetCacheEntry = record;
  const first = await requestBylineOnce(working);
  if (first.byline) {
    return { byline: first.byline, summary: working.book.summary || null };
  }

  const urls = extractFetchUrls(first.content || "");
  for (const url of urls) {
    const seeded = await seedSummaryFromUrl(url);
    if (!seeded) {
      continue;
    }

    working = {
      ...working,
      book: { ...working.book, summary: seeded },
    };
    const retry = await requestBylineOnce(working);
    if (retry.byline) {
      return { byline: retry.byline, summary: seeded };
    }
  }

  if (first.content) {
    console.log(
      colors.yellow(
        `[snippets] rejected byline for ${record.book.title}: ${first.content
          .replace(/\s+/g, " ")
          .slice(0, 160)}`
      )
    );
  }

  return {
    byline: null,
    summary: working.book.summary || record.book.summary || null,
  };
}

function allBooks(reading: ReadingData): ReadingBook[] {
  return [
    ...reading.currentlyReading,
    ...reading.years.flatMap((group) => group.books),
  ];
}

function applySnippets(reading: ReadingData, cache: SnippetCache): ReadingData {
  const withSnippet = (book: ReadingBook): ReadingBook => ({
    ...book,
    snippet: cache[bookKey(book)]?.snippet || null,
  });

  return {
    currentlyReading: reading.currentlyReading.map(withSnippet),
    years: reading.years.map((group) => ({
      ...group,
      books: group.books.map(withSnippet),
    })),
  };
}

/**
 * Generate one-line bylines via the local Arbiter byline agent.
 * Books are sent one-at-a-time (chunked through the library) with full book JSON.
 */
export default async function fetchSnippets(
  reading: ReadingData
): Promise<ReadingData> {
  const cache = loadCache();
  const books = allBooks(reading);

  if (!process.env.BYLINE_API_URL || !process.env.BYLINE_API_TOKEN) {
    console.log(
      colors.yellow(
        "[snippets] BYLINE_API_URL / BYLINE_API_TOKEN unset — using cache only"
      )
    );
    return applySnippets(reading, cache);
  }

  const pending: ReadingBook[] = [];
  let reused = 0;

  for (const book of books) {
    const key = bookKey(book);
    const cached = cache[key];

    // Only reuse snippets produced with this agent contract.
    if (
      cached?.snippet &&
      cached.source === SOURCE &&
      cached.book &&
      !cached.snippet.startsWith("/") &&
      !cached.snippet.includes("/search")
    ) {
      reused += 1;
      continue;
    }

    pending.push(book);
  }

  let fetched = 0;
  let missing = 0;
  const chunks = chunkArray(pending, CHUNK_SIZE);

  console.log(
    colors.cyan(
      `[snippets] generating ${pending.length} bylines in ${chunks.length} chunks`
    )
  );

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex];

    for (const book of chunk) {
      const key = bookKey(book);
      const prior = cache[key];
      const priorSummary =
        prior?.book?.summary ||
        (prior?.source && prior.source !== SOURCE ? prior.snippet : null);
      const summary = await resolveSummary(book, priorSummary);

      const payload = toBookPayload(book, summary);
      const record: SnippetCacheEntry = {
        snippet: null,
        source: null,
        book: payload,
        updatedAt: new Date().toISOString(),
      };

      try {
        const { byline, summary: resolvedSummary } = await requestByline(record);
        const bookPayload = toBookPayload(
          book,
          resolvedSummary || payload.summary
        );
        cache[key] = {
          snippet: byline,
          source: byline ? SOURCE : null,
          book: bookPayload,
          updatedAt: new Date().toISOString(),
        };

        if (byline) {
          fetched += 1;
        } else {
          missing += 1;
        }
      } catch (error) {
        missing += 1;
        console.log(
          colors.red(
            `[snippets] failed ${book.title}: ${
              error instanceof Error ? error.message : String(error)
            }`
          )
        );
        cache[key] = {
          snippet: null,
          source: null,
          book: payload,
          updatedAt: new Date().toISOString(),
        };
      }
    }

    saveCache(cache);
    console.log(
      colors.cyan(
        `[snippets] chunk ${chunkIndex + 1}/${chunks.length} · fetched ${fetched}, missing ${missing}`
      )
    );
  }

  saveCache(cache);

  console.log(
    colors.cyan(
      `[snippets] reused ${reused}, fetched ${fetched}, missing ${missing}`
    )
  );

  return applySnippets(reading, cache);
}
