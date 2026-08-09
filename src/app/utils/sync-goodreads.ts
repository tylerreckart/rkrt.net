import fs from "fs";
import path from "path";
import colors from "colors";

const DEFAULT_USER_ID = "28962435";
const DEFAULT_PROFILE = "tylerreckart";
const SHELVES = ["currently-reading", "read"] as const;
const CSV_HEADERS = [
  "Book Id",
  "Title",
  "Author",
  "Author l-f",
  "Additional Authors",
  "ISBN",
  "ISBN13",
  "My Rating",
  "Publisher",
  "Binding",
  "Number of Pages",
  "Year Published",
  "Original Publication Year",
  "Date Read",
  "Date Added",
  "Bookshelves",
  "Bookshelves with positions",
  "Exclusive Shelf",
  "My Review",
  "Spoiler",
  "Private Notes",
  "Read Count",
  "Owned Copies",
] as const;

type Shelf = (typeof SHELVES)[number];

type GoodreadsItem = {
  bookId: string;
  title: string;
  author: string;
  isbn: string;
  isbn13: string;
  rating: number;
  pages: string;
  yearPublished: string;
  dateRead: string;
  dateAdded: string;
  shelves: string[];
  exclusiveShelf: Shelf;
  review: string;
};

type SyncOptions = {
  csvPath?: string;
  userId?: string;
  profile?: string;
  dryRun?: boolean;
};

type SyncResult = {
  scanned: number;
  appended: number;
  skipped: number;
  titles: string[];
};

const USER_AGENT =
  "rkrt.net-goodreads-sync/1.0 (personal static site; https://rkrt.net)";

function csvPathDefault(): string {
  return path.resolve(__dirname, "../../../data/goodreads_library_export.csv");
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const next = content[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char === "\r") {
      // ignore CR in CRLF
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function serializeCsv(rows: string[][]): string {
  return (
    rows.map((row) => row.map(escapeCsvField).join(",")).join("\n") + "\n"
  );
}

function textContent(xml: string): string {
  return xml
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function tagValue(block: string, tag: string): string {
  const match = block.match(
    new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i")
  );
  if (!match) {
    return "";
  }
  return textContent(match[1]);
}

function nestedTagValue(block: string, parent: string, tag: string): string {
  const parentMatch = block.match(
    new RegExp(`<${parent}>([\\s\\S]*?)</${parent}>`, "i")
  );
  if (!parentMatch) {
    return "";
  }
  return tagValue(parentMatch[1], tag);
}

/**
 * Convert Goodreads RSS dates like "Thu, 6 Aug 2026 00:00:00 +0000"
 * into export-style YYYY/MM/DD.
 */
function toExportDate(value: string): string {
  const raw = value.trim();
  if (!raw) {
    return "";
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

function authorLastFirst(author: string): string {
  const cleaned = author.replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.includes(",")) {
    return cleaned;
  }

  const parts = cleaned.split(" ");
  if (parts.length === 1) {
    return cleaned;
  }

  const last = parts[parts.length - 1];
  const first = parts.slice(0, -1).join(" ");
  return `${last}, ${first}`;
}

function splitIsbn(raw: string): { isbn: string; isbn13: string } {
  const cleaned = raw.replace(/[^\dX]/gi, "").toUpperCase();
  if (cleaned.length === 13) {
    return { isbn: "", isbn13: cleaned };
  }
  if (cleaned.length === 10) {
    return { isbn: cleaned, isbn13: "" };
  }
  return { isbn: "", isbn13: "" };
}

function ratingField(rating: number): string {
  if (!rating) {
    return "0";
  }
  return `${rating}.0`;
}

function bookshelvesFields(
  exclusiveShelf: Shelf,
  shelves: string[]
): { bookshelves: string; withPositions: string } {
  const extras = shelves
    .map((shelf) => shelf.trim().toLowerCase())
    .filter(
      (shelf) =>
        shelf &&
        shelf !== exclusiveShelf &&
        shelf !== "read" &&
        shelf !== "currently-reading" &&
        shelf !== "to-read"
    );

  if (exclusiveShelf === "currently-reading") {
    return {
      bookshelves: "currently-reading",
      withPositions: "currently-reading",
    };
  }

  // Read shelf usually leaves Bookshelves blank unless tagged (e.g. favorites).
  return {
    bookshelves: extras.join(", "),
    withPositions: extras.join(", "),
  };
}

function parseItem(block: string, exclusiveShelf: Shelf): GoodreadsItem | null {
  const bookId = tagValue(block, "book_id");
  const title = tagValue(block, "title");
  if (!bookId || !title) {
    return null;
  }

  const { isbn, isbn13 } = splitIsbn(tagValue(block, "isbn"));
  const shelves = tagValue(block, "user_shelves")
    .split(",")
    .map((shelf) => shelf.trim())
    .filter(Boolean);

  const dateAdded =
    toExportDate(tagValue(block, "user_date_created")) ||
    toExportDate(tagValue(block, "user_date_added"));

  return {
    bookId,
    title,
    author: tagValue(block, "author_name"),
    isbn,
    isbn13,
    rating: Math.round(Number(tagValue(block, "user_rating") || 0)) || 0,
    pages: nestedTagValue(block, "book", "num_pages"),
    yearPublished: tagValue(block, "book_published"),
    dateRead: toExportDate(tagValue(block, "user_read_at")),
    dateAdded,
    shelves,
    exclusiveShelf,
    review: tagValue(block, "user_review"),
  };
}

function parseRssItems(xml: string, exclusiveShelf: Shelf): GoodreadsItem[] {
  const blocks = xml.match(/<item>([\s\S]*?)<\/item>/gi) || [];
  return blocks
    .map((block) => parseItem(block, exclusiveShelf))
    .filter((item): item is GoodreadsItem => Boolean(item));
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/rss+xml, application/xml, text/xml, text/html;q=0.9",
    },
  });

  if (!response.ok) {
    throw new Error(`Goodreads ${response.status} for ${url}`);
  }

  return response.text();
}

async function resolveUserId(profile: string): Promise<string | null> {
  const html = await fetchText(`https://www.goodreads.com/${profile}`);
  const match = html.match(/\/review\/list\/(\d+)/);
  return match?.[1] || null;
}

async function fetchShelf(
  userId: string,
  shelf: Shelf
): Promise<GoodreadsItem[]> {
  const items: GoodreadsItem[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= 50; page++) {
    const url = `https://www.goodreads.com/review/list_rss/${userId}?shelf=${encodeURIComponent(
      shelf
    )}&page=${page}`;
    const xml = await fetchText(url);
    const pageItems = parseRssItems(xml, shelf);

    if (!pageItems.length) {
      break;
    }

    let added = 0;
    for (const item of pageItems) {
      if (seen.has(item.bookId)) {
        continue;
      }
      seen.add(item.bookId);
      items.push(item);
      added += 1;
    }

    // A partially empty/repeated page means we've reached the end.
    if (added === 0 || pageItems.length < 100) {
      break;
    }
  }

  return items;
}

function toCsvRow(item: GoodreadsItem): string[] {
  const { bookshelves, withPositions } = bookshelvesFields(
    item.exclusiveShelf,
    item.shelves
  );

  const record: Record<(typeof CSV_HEADERS)[number], string> = {
    "Book Id": item.bookId,
    Title: item.title,
    Author: item.author,
    "Author l-f": authorLastFirst(item.author),
    "Additional Authors": "",
    ISBN: item.isbn,
    ISBN13: item.isbn13,
    "My Rating": ratingField(item.rating),
    Publisher: "",
    Binding: "",
    "Number of Pages": item.pages,
    "Year Published": item.yearPublished,
    "Original Publication Year": "",
    "Date Read": item.dateRead,
    "Date Added": item.dateAdded,
    Bookshelves: bookshelves,
    "Bookshelves with positions": withPositions,
    "Exclusive Shelf": item.exclusiveShelf,
    "My Review": item.review,
    Spoiler: "",
    "Private Notes": "",
    "Read Count": "1",
    "Owned Copies": "0",
  };

  return CSV_HEADERS.map((header) => record[header]);
}

/**
 * Crawl public Goodreads shelf RSS feeds and append any brand-new books
 * (by Book Id) to the local library export CSV. Existing rows are never
 * modified.
 */
export default async function syncGoodreads(
  options: SyncOptions = {}
): Promise<SyncResult> {
  const csvPath = options.csvPath || csvPathDefault();
  const profile = (
    options.profile ||
    process.env.GOODREADS_PROFILE ||
    DEFAULT_PROFILE
  ).trim();
  let userId = (
    options.userId ||
    process.env.GOODREADS_USER_ID ||
    ""
  ).trim();

  if (!userId) {
    userId = (await resolveUserId(profile)) || DEFAULT_USER_ID;
  }

  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV not found: ${csvPath}`);
  }

  const existingContent = fs.readFileSync(csvPath, "utf8");
  const rows = parseCsv(existingContent);

  if (!rows.length) {
    throw new Error("CSV is empty");
  }

  const headers = rows[0];
  const bookIdIndex = headers.indexOf("Book Id");
  if (bookIdIndex < 0) {
    throw new Error('CSV missing "Book Id" column');
  }

  const existingIds = new Set(
    rows.slice(1).map((row) => (row[bookIdIndex] || "").trim()).filter(Boolean)
  );

  const remote: GoodreadsItem[] = [];
  for (const shelf of SHELVES) {
    console.log(colors.cyan(`[goodreads] fetching shelf "${shelf}"…`));
    const shelfItems = await fetchShelf(userId, shelf);
    console.log(
      colors.cyan(`[goodreads] ${shelf}: ${shelfItems.length} items`)
    );
    remote.push(...shelfItems);
  }

  // Prefer currently-reading over read if a book somehow appears in both.
  const byId = new Map<string, GoodreadsItem>();
  for (const item of remote) {
    const prior = byId.get(item.bookId);
    if (!prior || item.exclusiveShelf === "currently-reading") {
      byId.set(item.bookId, item);
    }
  }

  const fresh = Array.from(byId.values()).filter(
    (item) => !existingIds.has(item.bookId)
  );

  // Newest activity first, matching how Goodreads export tends to list updates.
  fresh.sort((a, b) => b.dateAdded.localeCompare(a.dateAdded));

  const appendedRows = fresh.map(toCsvRow);
  const nextRows = [headers, ...appendedRows, ...rows.slice(1)];

  if (!options.dryRun && appendedRows.length) {
    fs.writeFileSync(csvPath, serializeCsv(nextRows), "utf8");
  }

  return {
    scanned: byId.size,
    appended: appendedRows.length,
    skipped: byId.size - appendedRows.length,
    titles: fresh.map((item) => item.title),
  };
}

export async function runSyncGoodreadsCli(
  argv: string[] = process.argv.slice(2)
): Promise<void> {
  const dryRun = argv.includes("--dry-run");
  const result = await syncGoodreads({ dryRun });

  if (result.appended === 0) {
    console.log(
      colors.cyan(
        `[goodreads] scanned ${result.scanned}, nothing new to append`
      )
    );
    return;
  }

  console.log(
    colors.cyan(
      `[goodreads] scanned ${result.scanned}, ${dryRun ? "would append" : "appended"} ${result.appended}, skipped ${result.skipped}`
    )
  );
  for (const title of result.titles) {
    console.log(colors.green(`  + ${title}`));
  }
}
