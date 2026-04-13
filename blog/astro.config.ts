import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://kasthe.dev',
  base: '/blog',
  trailingSlash: 'always',
  markdown: {
    shikiConfig: { theme: 'rose-pine-moon' },
    remarkPlugins: [],
    rehypePlugins: [],
  },
});
