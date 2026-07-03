import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface SeedBook {
  title: string;
  author: string;
  synopsis: string;
  fileName: string;
  sourceUrl: string;
}

export interface BrokenSeedBook {
  title: string;
  author: string;
  synopsis: string;
  epubUrl: string;
}

/** One deliberately dead EPUB URL, used to exercise reader failure handling. */
export const BROKEN_ROW: BrokenSeedBook = {
  title: 'The Missing Manuscript',
  author: 'Unknown',
  synopsis: 'A deliberately broken catalog entry for testing failure handling.',
  epubUrl: '/epubs/does-not-exist.epub',
};

/** Public-domain Project Gutenberg titles seeded on a fresh checkout. */
export const GUTENBERG_BOOKS: SeedBook[] = [
  {
    title: 'Moby-Dick; or, The Whale',
    author: 'Herman Melville',
    synopsis: 'The voyage of the whaling ship Pequod and Captain Ahab’s hunt for the white whale.',
    fileName: 'moby-dick.epub',
    sourceUrl: 'https://www.gutenberg.org/ebooks/2701.epub.images',
  },
  {
    title: 'Frankenstein; or, The Modern Prometheus',
    author: 'Mary Shelley',
    synopsis: 'A scientist creates a living being with tragic consequences.',
    fileName: 'frankenstein.epub',
    sourceUrl: 'https://www.gutenberg.org/ebooks/84.epub.images',
  },
  {
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    synopsis: 'The Bennet sisters navigate love and social standing in Regency England.',
    fileName: 'pride-and-prejudice.epub',
    sourceUrl: 'https://www.gutenberg.org/ebooks/1342.epub.images',
  },
  {
    title: 'Dracula',
    author: 'Bram Stoker',
    synopsis: 'Jonathan Harker’s encounter with Count Dracula unleashes horror across England.',
    fileName: 'dracula.epub',
    sourceUrl: 'https://www.gutenberg.org/ebooks/345.epub.images',
  },
  {
    title: 'The Time Machine',
    author: 'H. G. Wells',
    synopsis: 'An inventor travels far into the future and finds humanity transformed.',
    fileName: 'the-time-machine.epub',
    sourceUrl: 'https://www.gutenberg.org/ebooks/35.epub.images',
  },
  {
    title: "Alice's Adventures in Wonderland",
    author: 'Lewis Carroll',
    synopsis: 'Alice falls down a rabbit hole into a world of curious logic and stranger creatures.',
    fileName: 'alices-adventures-in-wonderland.epub',
    sourceUrl: 'https://www.gutenberg.org/ebooks/11.epub.images',
  },
  {
    title: 'The Odyssey',
    author: 'Homer',
    synopsis: 'Odysseus’s long journey home after the Trojan War.',
    fileName: 'the-odyssey.epub',
    sourceUrl: 'https://www.gutenberg.org/ebooks/1727.epub.images',
  },
  {
    title: 'Metamorphosis',
    author: 'Franz Kafka',
    synopsis: 'Gregor Samsa wakes to find himself transformed into an insect.',
    fileName: 'metamorphosis.epub',
    sourceUrl: 'https://www.gutenberg.org/ebooks/5200.epub.images',
  },
];

const SCHEMA = `
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS books (
      id          INTEGER PRIMARY KEY,
      title       TEXT    NOT NULL,
      author      TEXT    NOT NULL,
      synopsis    TEXT,
      epub_url    TEXT    NOT NULL UNIQUE,
      spine_color TEXT,
      page_count  INTEGER,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_books_author ON books(author, title);
`;

export function migrate(db: DatabaseSync): void {
  db.exec(SCHEMA);
}

/**
 * Idempotent: upserts by epub_url, so re-running the script (or including
 * BROKEN_ROW on one run and not another) never duplicates rows.
 */
export function buildCatalog(db: DatabaseSync, books: Array<SeedBook | BrokenSeedBook>): void {
  const upsert = db.prepare(`
    INSERT INTO books (title, author, synopsis, epub_url)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (epub_url) DO UPDATE SET
      title = excluded.title,
      author = excluded.author,
      synopsis = excluded.synopsis
  `);

  for (const book of books) {
    const epubUrl = 'epubUrl' in book ? book.epubUrl : `/epubs/${book.fileName}`;
    upsert.run(book.title, book.author, book.synopsis, epubUrl);
  }
}

const DOWNLOAD_ATTEMPTS = 3;

async function downloadEpub(url: string, destPath: string): Promise<void> {
  if (existsSync(destPath)) return; // idempotent: skip already-downloaded files

  let lastError: unknown;
  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`failed to download ${url}: HTTP ${response.status}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      await writeFile(destPath, buffer);
      return;
    } catch (err) {
      lastError = err;
      if (attempt < DOWNLOAD_ATTEMPTS) {
        console.warn(`  retry ${attempt}/${DOWNLOAD_ATTEMPTS - 1} for ${url}: ${(err as Error).message}`);
      }
    }
  }
  throw lastError;
}

async function main(): Promise<void> {
  const withBroken = process.argv.includes('--with-broken');

  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const dataDir = resolve(repoRoot, 'data');
  const epubDir = resolve(dataDir, 'epubs');
  const dbPath = resolve(dataDir, 'books.sqlite');

  mkdirSync(epubDir, { recursive: true });

  console.log(`Downloading ${GUTENBERG_BOOKS.length} public-domain EPUBs...`);
  for (const book of GUTENBERG_BOOKS) {
    const destPath = resolve(epubDir, book.fileName);
    await downloadEpub(book.sourceUrl, destPath);
    console.log(`  ${book.fileName}`);
  }

  const db = new DatabaseSync(dbPath);
  migrate(db);
  const books: Array<SeedBook | BrokenSeedBook> = withBroken
    ? [...GUTENBERG_BOOKS, BROKEN_ROW]
    : GUTENBERG_BOOKS;
  buildCatalog(db, books);
  db.close();

  console.log(`Seeded ${books.length} books into ${dbPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
