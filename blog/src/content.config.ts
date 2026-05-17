import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const posts = defineCollection({
  loader: glob({ base: './src/content/posts', pattern: '*.md' }),
  schema: z.object({
    title: z.string().min(1),
    titleBadge: z.string().optional(),
    description: z.string().min(1),
    pubDate: z.coerce.date(),
    updated: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    unlisted: z.boolean().default(false),
    cipher: z
      .object({
        iv: z.string(),
        salt: z.string(),
        iterations: z.number().int().positive(),
        ciphertext: z.string(),
      })
      .optional(),
  }),
});

export const collections = { posts };
