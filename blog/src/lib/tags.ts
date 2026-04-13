import type { PostEntry } from './posts';

export type TagSummary = {
  label: string;
  slug: string;
  count: number;
};

/**
 * Normalizes a tag string to a URL-safe slug:
 * - lowercase
 * - collapse repeated whitespace/punctuation to single hyphens
 * - trim leading/trailing hyphens
 */
export function slugifyTag(tag: string): string {
  return tag
    .toLowerCase()
    .trim()
    .replace(/[\s\W]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Aggregates all tags from a set of posts into labeled summaries.
 * Rules:
 * - Each normalized slug counted at most once per post.
 * - When two labels map to the same slug, the first-encountered label wins.
 * - Results are sorted alphabetically by slug for determinism.
 */
export function getTagSummaries(posts: PostEntry[]): TagSummary[] {
  const slugToLabel = new Map<string, string>();
  const slugToCount = new Map<string, number>();

  for (const post of posts) {
    // Deduplicate slugs within a single post.
    const seenInPost = new Set<string>();

    for (const tag of post.data.tags) {
      const slug = slugifyTag(tag);
      if (!slug) continue;
      if (seenInPost.has(slug)) continue;
      seenInPost.add(slug);

      // First label encountered for this slug wins.
      if (!slugToLabel.has(slug)) {
        slugToLabel.set(slug, tag);
      }

      slugToCount.set(slug, (slugToCount.get(slug) ?? 0) + 1);
    }
  }

  const summaries: TagSummary[] = [];
  for (const [slug, count] of slugToCount) {
    summaries.push({ label: slugToLabel.get(slug)!, slug, count });
  }

  // Deterministic order: alphabetical by slug.
  summaries.sort((a, b) => a.slug.localeCompare(b.slug));

  return summaries;
}

/**
 * Filters posts that contain at least one tag whose slug matches `tagSlug`.
 */
export function getPostsForTag(
  posts: PostEntry[],
  tagSlug: string
): PostEntry[] {
  return posts.filter((post) =>
    post.data.tags.some((tag) => slugifyTag(tag) === tagSlug)
  );
}
