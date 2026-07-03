// @vitest-environment node
//
// This suite (and the scripts/seed.ts module it exercises) uses Node
// built-ins (node:sqlite, node:fs) directly. Under the project-wide jsdom
// environment, Vite's client-bundling pipeline can — depending on exact
// Vite/vitest dependency resolution — refuse to externalize node: imports
// ("Cannot bundle Node.js built-in ... Consider disabling
// environments.client.noExternal"), which is what broke CI once even
// though it passed locally on a clean install. Forcing the plain Node
// environment for this file sidesteps client bundling entirely.
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { buildCatalog, migrate, BROKEN_ROW, type SeedBook } from '../../scripts/seed';

const FAKE_BOOKS: SeedBook[] = [
  {
    title: 'Moby-Dick; or, The Whale',
    author: 'Herman Melville',
    synopsis: 'The voyage of the whaling ship Pequod.',
    fileName: 'moby-dick.epub',
    sourceUrl: 'https://www.gutenberg.org/ebooks/2701',
  },
  {
    title: 'Frankenstein',
    author: 'Mary Shelley',
    synopsis: 'A scientist creates a living being.',
    fileName: 'frankenstein.epub',
    sourceUrl: 'https://www.gutenberg.org/ebooks/84',
  },
];

function openDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  migrate(db);
  return db;
}

describe('buildCatalog', () => {
  it('inserts one row per book with the expected shape', () => {
    const db = openDb();
    buildCatalog(db, FAKE_BOOKS);

    const rows = db.prepare('SELECT * FROM books ORDER BY id ASC').all();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      title: 'Moby-Dick; or, The Whale',
      author: 'Herman Melville',
      synopsis: 'The voyage of the whaling ship Pequod.',
      epub_url: '/epubs/moby-dick.epub',
    });
  });

  it('is idempotent: re-running does not duplicate or error', () => {
    const db = openDb();
    buildCatalog(db, FAKE_BOOKS);
    buildCatalog(db, FAKE_BOOKS);

    const rows = db.prepare('SELECT * FROM books').all();
    expect(rows).toHaveLength(FAKE_BOOKS.length);
  });

  it('adds the broken row only when explicitly included', () => {
    const withoutBroken = openDb();
    buildCatalog(withoutBroken, FAKE_BOOKS);
    const withoutRows = withoutBroken.prepare('SELECT * FROM books').all();
    expect(withoutRows.some((r: any) => r.epub_url === BROKEN_ROW.epubUrl)).toBe(false);

    const withBroken = openDb();
    buildCatalog(withBroken, [...FAKE_BOOKS, BROKEN_ROW]);
    const withRows = withBroken.prepare('SELECT * FROM books').all();
    const broken = withRows.find((r: any) => r.epub_url === BROKEN_ROW.epubUrl) as any;
    expect(broken).toBeDefined();
    expect(broken.epub_url).toBe('/epubs/does-not-exist.epub');
  });
});
