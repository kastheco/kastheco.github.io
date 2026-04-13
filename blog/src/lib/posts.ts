import { getCollection } from 'astro:content';
import type { CollectionEntry } from 'astro:content';

export type PostEntry = CollectionEntry<'posts'>;

/**
 * The single call-site for getCollection('posts').
 * Filters drafts in production by default; sorts newest-first by pubDate.
 */
export async function getPublishedPosts(
  options?: { includeDrafts?: boolean }
): Promise<PostEntry[]> {
  const includeDrafts = options?.includeDrafts ?? !import.meta.env.PROD;

  const entries = await getCollection('posts');

  const filtered = includeDrafts
    ? entries
    : entries.filter((p) => !p.data.draft);

  return filtered.sort(
    (a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime()
  );
}

/**
 * Returns the canonical URL path for a post.
 * Always `/blog/posts/<id>/` — the single source of truth for this shape.
 */
export function getPostPath(postId: string): string {
  return `/blog/posts/${postId}/`;
}

/**
 * Formats a Date for display in post metadata (e.g. "April 13, 2026").
 */
export function formatPostDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
