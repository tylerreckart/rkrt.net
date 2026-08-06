import fs from "fs";
import path from "path";
import colors from "colors";
import { ReadingBook, ReadingData } from "./get-reading";

type CoverCache = Record<
  string,
  {
    source: string | null;
    file: string | null;
    updatedAt: string;
  }
>;

const COVERS_DIR = path.resolve(__dirname, "../../../images/covers");
const CACHE_PATH = path.resolve(__dirname, "../../../data/cover-cache.json");
const USER_AGENT = "rkrt.net-cover-bot/1.0 (personal blog; local build)";

function loadCache(): CoverCache {
  if (!fs.existsSync(CACHE_PATH)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8")) as CoverCache;
  } catch {
    return {};
  }
}

function saveCache(cache: CoverCache): void {
  const next = JSON.stringify(cache, null, 2) + "\n";

  if (fs.existsSync(CACHE_PATH)) {
    const current = fs.readFileSync(CACHE_PATH, "utf8");
    if (current === next) {
      return;
    }
  }

  fs.writeFileSync(CACHE_PATH, next, "utf8");
}

function ensureCoversDir(): void {
  if (!fs.existsSync(COVERS_DIR)) {
    fs.mkdirSync(COVERS_DIR, { recursive: true });
  }
}

function cleanTitle(title: string): string {
  return title
    .replace(/\s*\([^)]*#\d+[^)]*\)\s*$/g, "")
    .replace(/\s*:.*/, "")
    .trim();
}

function coverKey(book: ReadingBook): string {
  if (book.isbn) {
    return book.isbn;
  }

  return `id-${book.id}`;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "image/*" },
      redirect: "follow",
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("image")) {
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    // Open Library sometimes returns a tiny placeholder gif/png.
    if (buffer.length < 1000) {
      return null;
    }

    return buffer;
  } catch {
    return null;
  }
}

function normalizeCoverUrl(coverUrl: string | undefined): string | null {
  if (!coverUrl) {
    return null;
  }

  // Open Library sometimes returns placeholder cover ids like -1.
  if (/\/b\/id\/-?\d*-?[SML]\.jpg/i.test(coverUrl)) {
    const match = coverUrl.match(/\/b\/id\/(-?\d+)/i);
    if (!match || Number(match[1]) <= 0) {
      return null;
    }
  }

  return coverUrl.replace(/^http:\/\//, "https://");
}

async function resolveOpenLibraryByIsbn(isbn: string): Promise<string | null> {
  const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`;
  const data = await fetchJson<
    Record<string, { cover?: { medium?: string; large?: string; small?: string } }>
  >(url);

  const cover = data?.[`ISBN:${isbn}`]?.cover;
  return normalizeCoverUrl(cover?.medium || cover?.large || cover?.small);
}

async function resolveOpenLibraryBySearch(
  title: string,
  author: string
): Promise<string | null> {
  const cleanedTitle = cleanTitle(title);
  const queries = [
    new URLSearchParams({ title: cleanedTitle, author, limit: "8" }),
    new URLSearchParams({ q: `${cleanedTitle} ${author}`, limit: "8" }),
    new URLSearchParams({ title: cleanedTitle, limit: "8" }),
  ];

  for (const query of queries) {
    const data = await fetchJson<{
      docs?: Array<{
        cover_i?: number;
        isbn?: string[];
        title?: string;
        author_name?: string[];
      }>;
    }>(`https://openlibrary.org/search.json?${query.toString()}`);

    const docs = data?.docs || [];
    const withCover = docs.find((doc) => doc.cover_i && doc.cover_i > 0);
    if (withCover?.cover_i) {
      return `https://covers.openlibrary.org/b/id/${withCover.cover_i}-M.jpg`;
    }

    const withIsbn = docs.find((doc) => doc.isbn && doc.isbn.length > 0);
    if (withIsbn?.isbn?.[0]) {
      return googleBooksContentUrl(withIsbn.isbn[0]);
    }
  }

  return null;
}

function googleBooksContentUrl(isbn: string): string {
  return `https://books.google.com/books/content?vid=ISBN${isbn}&printsec=frontcover&img=1&zoom=1`;
}

async function resolveGoogleBooks(
  isbn: string | null,
  title: string,
  author: string
): Promise<string | null> {
  if (isbn) {
    // Direct content URL is more reliable than the volumes API (fewer 429s).
    return googleBooksContentUrl(isbn);
  }

  const q = `intitle:${cleanTitle(title)} inauthor:${author}`;
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(
    q
  )}&maxResults=5`;
  const data = await fetchJson<{
    items?: Array<{
      volumeInfo?: {
        imageLinks?: { thumbnail?: string; smallThumbnail?: string };
      };
    }>;
  }>(url);

  for (const item of data?.items || []) {
    const links = item.volumeInfo?.imageLinks;
    const coverUrl = links?.thumbnail || links?.smallThumbnail;
    if (coverUrl) {
      return coverUrl.replace(/^http:\/\//, "https://").replace("&edge=curl", "");
    }
  }

  return null;
}

async function resolveCoverUrl(book: ReadingBook): Promise<{
  url: string;
  source: string;
} | null> {
  if (book.isbn) {
    const byIsbn = await resolveOpenLibraryByIsbn(book.isbn);
    if (byIsbn) {
      return { url: byIsbn, source: "openlibrary-isbn" };
    }

    const byGoogleContent = await resolveGoogleBooks(book.isbn, book.title, book.author);
    if (byGoogleContent) {
      return { url: byGoogleContent, source: "google-books" };
    }
  }

  const bySearch = await resolveOpenLibraryBySearch(book.title, book.author);
  if (bySearch) {
    return { url: bySearch, source: "openlibrary-search" };
  }

  if (!book.isbn) {
    const byGoogle = await resolveGoogleBooks(null, book.title, book.author);
    if (byGoogle) {
      return { url: byGoogle, source: "google-books" };
    }
  }

  return null;
}

function allBooks(reading: ReadingData): ReadingBook[] {
  return [
    ...reading.currentlyReading,
    ...reading.years.flatMap((group) => group.books),
  ];
}

function applyCoverUrls(reading: ReadingData, cache: CoverCache): ReadingData {
  const withCover = (book: ReadingBook): ReadingBook => {
    const entry = cache[coverKey(book)];
    if (entry?.file && fs.existsSync(path.join(COVERS_DIR, entry.file))) {
      return { ...book, coverUrl: `/images/covers/${entry.file}` };
    }

    return { ...book, coverUrl: null };
  };

  return {
    currentlyReading: reading.currentlyReading.map(withCover),
    years: reading.years.map((group) => ({
      ...group,
      books: group.books.map(withCover),
    })),
  };
}

/**
 * Resolve and download book covers at build time, caching results on disk.
 * Local files avoid Open Library's runtime ISBN rate limit in the browser.
 */
export default async function fetchCovers(
  reading: ReadingData
): Promise<ReadingData> {
  ensureCoversDir();
  const cache = loadCache();
  const books = allBooks(reading);

  let fetched = 0;
  let reused = 0;
  let missing = 0;

  const pending: ReadingBook[] = [];

  for (const book of books) {
    const key = coverKey(book);
    const cached = cache[key];

    if (cached?.file && fs.existsSync(path.join(COVERS_DIR, cached.file))) {
      reused += 1;
      continue;
    }

    if (cached && cached.file === null) {
      // Previously unresolved; skip unless cache is older than 30 days.
      const age = Date.now() - Date.parse(cached.updatedAt);
      if (!Number.isNaN(age) && age < 30 * 24 * 60 * 60 * 1000) {
        missing += 1;
        continue;
      }
    }

    pending.push(book);
  }

  const concurrency = 4;
  let index = 0;

  async function worker(): Promise<void> {
    while (index < pending.length) {
      const current = index;
      index += 1;
      const book = pending[current];
      const key = coverKey(book);
      const filename = `${key}.jpg`;
      const filepath = path.join(COVERS_DIR, filename);

      const resolved = await resolveCoverUrl(book);
      if (!resolved) {
        cache[key] = {
          source: null,
          file: null,
          updatedAt: new Date().toISOString(),
        };
        missing += 1;
        continue;
      }

      const image = await downloadImage(resolved.url);
      if (!image) {
        cache[key] = {
          source: null,
          file: null,
          updatedAt: new Date().toISOString(),
        };
        missing += 1;
        continue;
      }

      fs.writeFileSync(filepath, image);
      cache[key] = {
        source: resolved.source,
        file: filename,
        updatedAt: new Date().toISOString(),
      };
      fetched += 1;

      if (fetched % 25 === 0) {
        saveCache(cache);
        console.log(
          colors.cyan(
            `[covers] progress ${fetched}/${pending.length} fetched`
          )
        );
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, pending.length || 1) }, () =>
      worker()
    )
  );

  saveCache(cache);

  console.log(
    colors.cyan(
      `[covers] reused ${reused}, fetched ${fetched}, missing ${missing}`
    )
  );

  return applyCoverUrls(reading, cache);
}
