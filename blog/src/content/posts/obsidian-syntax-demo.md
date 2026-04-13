---
title: Obsidian Syntax Demo
description: A verification fixture for wiki-links, callouts, image embeds, and unresolved links.
pubDate: 2026-04-13
tags:
  - meta
  - obsidian
  - syntax
draft: false
---

This post exercises every custom Markdown feature supported by the renderer.
It is the canonical fixture for build-time verification.

Back to the intro: [[welcome-to-the-blog|back to the intro]]

## Wiki-links

Resolved internal link: [[welcome-to-the-blog]]

Unresolved link (intentionally missing target): [[future-note]]

## Callouts

> [!NOTE]
> This is an Obsidian-style note callout. The renderer maps it to a styled
> `<aside>` element so it stands out from regular blockquotes.

> [!WARNING]
> Watch out — this callout type signals something that deserves extra attention.

> [!TIP]
> Tip callouts work the same way. Useful for short actionable hints.

## Image embeds

![[demo-terminal.svg]]

The embed above resolves against `public/images/posts/obsidian-syntax-demo/`.

## Code

```ts
import { slugifyTag } from '@/lib/tags';

// All of these should produce the same slug: "rose-pine"
console.log(slugifyTag('rose pine'));   // "rose-pine"
console.log(slugifyTag('Rosé Pine'));   // "ros-pine" — accent stripped by lowercasing
console.log(slugifyTag('rose--pine'));  // "rose-pine"
```

## Tags on this post

This post carries `meta`, `obsidian`, and `syntax` — useful for verifying that
`getTagSummaries` de-duplicates slugs across posts sharing the `meta` tag with
[[welcome-to-the-blog]].
