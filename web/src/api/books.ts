import type { BookMeta } from './types';

/** Fetches the full catalog, ordered by id (doc 03 contract). */
export async function fetchBooks(): Promise<BookMeta[]> {
  const response = await fetch('/api/books');
  if (!response.ok) {
    throw new Error(`GET /api/books failed: ${response.status}`);
  }
  return response.json();
}
