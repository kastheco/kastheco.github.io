import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getPublishedPosts, getPostPath } from '../lib/posts';

export async function GET(context: APIContext) {
  const posts = await getPublishedPosts({ includeDrafts: false });

  return rss({
    title: 'kas.the.dev / blog',
    description:
      'Notes on systems programming, developer tooling, and the occasional detour into type theory.',
    site: context.site!,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.updated ?? post.data.pubDate,
      link: getPostPath(post.id),
    })),
    customData: '<language>en-us</language>',
  });
}
