import fs from "fs";
import path from "path";

export type ReadingBook = {
  id: string;
  title: string;
  author: string;
  dateRead: string | null;
  dateAdded: string;
  rating: number;
  favorite: boolean;
  shelf: string;
  isbn: string | null;
  coverUrl: string | null;
  snippet: string | null;
};

export type ReadingYearGroup = {
  year: string;
  books: ReadingBook[];
};

export type ReadingData = {
  currentlyReading: ReadingBook[];
  years: ReadingYearGroup[];
};

/**
 * Parse a CSV string into rows of string values, handling quoted fields.
 */
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

function formatDisplayDate(date: string): string {
  const [year, month, day] = date.split("/");
  if (!year || !month || !day) {
    return date;
  }

  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day)
  ).toLocaleString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  });
}

/**
 * Goodreads exports ISBNs as ="978..." — strip that wrapping.
 */
function cleanIsbn(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const cleaned = value.replace(/[^\dX]/gi, "").toUpperCase();
  if (cleaned.length === 10 || cleaned.length === 13) {
    return cleaned;
  }

  return null;
}

function toBook(record: Record<string, string>): ReadingBook {
  const rating = Math.round(Number(record["My Rating"] || 0));
  const isbn = cleanIsbn(record.ISBN13) || cleanIsbn(record.ISBN);
  const shelves = (record.Bookshelves || "")
    .split(",")
    .map((shelf) => shelf.trim().toLowerCase())
    .filter(Boolean);

  return {
    id: record["Book Id"] || "",
    title: record.Title || "",
    author: record.Author || "",
    dateRead: record["Date Read"]?.trim() || null,
    dateAdded: record["Date Added"] || "",
    rating: Number.isFinite(rating) ? rating : 0,
    favorite: shelves.includes("favorites"),
    shelf: record["Exclusive Shelf"] || "",
    isbn,
    coverUrl: null,
    snippet: null,
  };
}

/**
 * Load Goodreads export data and group read books by year.
 */
export default function getReading(): ReadingData {
  const csvPath = path.resolve(
    __dirname,
    "../../../data/goodreads_library_export.csv"
  );
  const content = fs.readFileSync(csvPath, "utf8");
  const rows = parseCsv(content);

  if (rows.length < 2) {
    return { currentlyReading: [], years: [] };
  }

  const headers = rows[0];
  const books = rows.slice(1).map((values) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = values[index] ?? "";
    });
    return toBook(record);
  });

  const currentlyReading = books
    .filter((book) => book.shelf === "currently-reading")
    .sort((a, b) => b.dateAdded.localeCompare(a.dateAdded));

  const readBooks = books.filter(
    (book) => book.shelf === "read" && book.dateRead
  );
  const byYear = new Map<string, ReadingBook[]>();

  readBooks.forEach((book) => {
    const year = book.dateRead!.slice(0, 4);
    const group = byYear.get(year) || [];
    group.push(book);
    byYear.set(year, group);
  });

  const years: ReadingYearGroup[] = Array.from(byYear.entries())
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([year, yearBooks]) => ({
      year,
      books: yearBooks
        .slice()
        .sort((a, b) => b.dateRead!.localeCompare(a.dateRead!))
        .map((book) => ({
          ...book,
          dateRead: formatDisplayDate(book.dateRead!),
        })),
    }));

  return { currentlyReading, years };
}
