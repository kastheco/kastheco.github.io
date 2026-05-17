import { getCollection } from 'astro:content';
import type { CollectionEntry } from 'astro:content';

export type PostEntry = CollectionEntry<'posts'>;

/**
 * The single call-site for getCollection('posts').
 * Filters drafts in production by default; sorts newest-first by pubDate.
 * Unlisted posts are excluded by default — only the [slug] route opts back in
 * via includeUnlisted, so the URL still builds while the post stays out of
 * every listing, tag page, RSS feed, etc.
 */
export async function getPublishedPosts(
  options?: { includeDrafts?: boolean; includeUnlisted?: boolean }
): Promise<PostEntry[]> {
  const includeDrafts = options?.includeDrafts ?? !import.meta.env.PROD;
  const includeUnlisted = options?.includeUnlisted ?? false;

  const entries = await getCollection('posts');

  const filtered = entries.filter((p) => {
    if (!includeDrafts && p.data.draft) return false;
    if (!includeUnlisted && p.data.unlisted) return false;
    return true;
  });

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
