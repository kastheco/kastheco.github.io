---
title: Welcome to the Blog
description: A quick tour of what this space is about and how to navigate it.
pubDate: 2026-04-13
tags:
  - meta
  - writing
draft: false
---

Welcome. This blog runs on [Astro](https://astro.build) and is written in
Obsidian-flavored Markdown. Posts live in a flat `content/posts/` directory;
the filename is the canonical ID.

## What you will find here

Notes on systems programming, developer tooling, and the occasional detour into
type theory. Short, focused, no filler.

## Obsidian syntax

Internal links work as wiki-links. For example, the next post walks through
every supported syntax feature: [[obsidian-syntax-demo]].

Code blocks carry language hints and render with the rosé pine moon palette:

```ts
import { getPublishedPosts } from '@/lib/posts';

const posts = await getPublishedPosts();
console.log(posts.map((p) => p.data.title));
```

## Tags

Each post carries a small set of lowercase tags. Browse by tag from the index.
`meta` posts like this one cover site logistics; `writing` posts reflect on
the craft itself.

That is all for now. Start with [[obsidian-syntax-demo]] to see what the
renderer can do.
