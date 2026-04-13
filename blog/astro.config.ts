import { defineConfig } from 'astro/config';
import { createRemarkPlugins, createRehypePlugins } from './src/lib/markdown';

export default defineConfig({
  site: 'https://kasthe.dev',
  base: '/blog',
  trailingSlash: 'always',
  markdown: {
    shikiConfig: { theme: 'rose-pine-moon' },
    remarkPlugins: createRemarkPlugins(),
    rehypePlugins: createRehypePlugins(),
  },
});
