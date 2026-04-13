/**
 * Centralised Obsidian-flavoured markdown compatibility layer.
 *
 * All project-specific remark/rehype rules live here so that wikilink
 * handling, callout styling and image-embed resolution are debuggable
 * from a single file instead of being scattered across page files.
 *
 * This module runs at **build time** only and may use Node APIs.
 */

import { existsSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { visit } from 'unist-util-visit';
import remarkWikiLink from 'remark-wiki-link';
import type { RemarkPlugins, RehypePlugins } from '@astrojs/markdown-remark';

// ---------------------------------------------------------------------------
// File-system helpers (build-time only)
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Absolute path to `blog/src/content/posts/`. */
const POSTS_DIR = join(__dirname, '../content/posts');

/** Absolute path to `blog/public/images/posts/`. */
const PUBLIC_IMAGES_DIR = join(__dirname, '../../public/images/posts');

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Normalises a raw wiki-link target into a stable post ID:
 *   - strips surrounding whitespace
 *   - removes a trailing `.md` extension
 *   - lowercases the result
 *
 * Examples
 *   "My Post.md"  → "my post"
 *   " hello "     → "hello"
 *   "world"       → "world"
 */
export function normalizeWikiTarget(raw: string): string {
  let id = raw.trim();
  if (id.endsWith('.md')) {
    id = id.slice(0, -3);
  }
  return id.toLowerCase();
}

/**
 * Reads `src/content/posts/*.md` from disk and returns the set of
 * normalised post IDs.  Returns an empty set if the directory does
 * not yet exist (safe during early project bootstrap).
 */
export function buildKnownPostIdSet(): Set<string> {
  if (!existsSync(POSTS_DIR)) return new Set();
  return new Set(
    (readdirSync(POSTS_DIR) as string[])
      .filter((f: string) => f.endsWith('.md'))
      .map((f: string) => normalizeWikiTarget(basename(f, '.md'))),
  );
}

// ---------------------------------------------------------------------------
// Internal remark plugins
// ---------------------------------------------------------------------------

/**
 * Converts `![[image.png]]` Obsidian image embeds into standard `<img>`
 * elements.
 *
 * At tokenisation time remark-wiki-link's micromark extension turns
 * `[[filename]]` into a `wikiLink` AST node.  The preceding `!` is left
 * as a plain text node.  This plugin stitches those two nodes back
 * together into a proper `image` node.
 *
 * Resolution rules (v1):
 *   - Images are looked up at `public/images/posts/<post-id>/<filename>`.
 *   - `<post-id>` is derived from the markdown file currently being
 *     processed (`file.history[0]`).
 *   - A missing asset throws a descriptive build-time error.
 */
function remarkObsidianImageEmbed() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tree: any, file: any) => {
    // Derive the current post ID from the file path that Astro passes in.
    const filePath: string = (file.history?.[0] as string | undefined) ?? '';
    const postId = normalizeWikiTarget(basename(filePath, '.md'));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    visit(tree, 'paragraph', (node: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newChildren: any[] = [];
      let i = 0;

      while (i < node.children.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const child: any = node.children[i];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const next: any | undefined = node.children[i + 1];

        const isImageEmbed =
          child.type === 'text' &&
          (child.value as string).endsWith('!') &&
          next?.type === 'wikiLink' &&
          /\.(png|jpe?g|gif|svg|webp|avif)$/i.test(next.value as string);

        if (isImageEmbed) {
          // Keep any text that preceded the `!` on the same line.
          const textBefore = (child.value as string).slice(0, -1);
          if (textBefore) newChildren.push({ ...child, value: textBefore });

          const filename = basename(next.value as string);
          const diskPath = join(PUBLIC_IMAGES_DIR, postId, filename);

          if (!existsSync(diskPath)) {
            throw new Error(
              `[markdown] Missing image embed in post "${postId}": ` +
                `"${filename}" not found at ` +
                `public/images/posts/${postId}/${filename}`,
            );
          }

          newChildren.push({
            type: 'image',
            url: `/blog/images/posts/${postId}/${filename}`,
            alt: filename,
            title: null,
          });

          i += 2; // skip `!` text node AND the wikiLink node
          continue;
        }

        newChildren.push(child);
        i++;
      }

      node.children = newChildren;
    });
  };
}

/**
 * Converts unresolved wikilinks (i.e. links whose target does not match
 * any known post ID) into `<span class="wikilink-unresolved">` elements
 * so that no broken `<a>` tags reach the rendered HTML.
 */
function remarkUnresolvedWikilinks() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tree: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    visit(tree, 'wikiLink', (node: any) => {
      if (node.data?.exists === false) {
        node.data.hName = 'span';
        node.data.hProperties = { className: 'wikilink-unresolved' };
        // hChildren remains intact — display text is preserved.
      }
    });
  };
}

/**
 * Converts Obsidian callout blockquotes into styled `<div>` elements.
 *
 * Input syntax:
 *   > [!note] Optional title
 *   > Body content
 *
 * Output HTML contract:
 *   <div class="callout callout-note" data-callout="note">
 *     <div class="callout-title">Optional title</div>
 *     <div class="callout-content">Body content</div>
 *   </div>
 *
 * Supported types: note, info, warning, danger.
 * Aliases: tip → note, important → info, caution → warning, error → danger.
 * Any unknown type falls back to "note".
 *
 * Note: `remark-obsidian-callout` was evaluated but its HTML output does
 * not include a base `callout` class (only `callout-{type}`), which would
 * break the two-class selector contract required by the CSS design.  This
 * local visitor keeps the class shape predictable.
 */
function remarkObsidianCallouts() {
  const TYPE_ALIAS: Record<string, string> = {
    tip: 'note',
    important: 'info',
    caution: 'warning',
    error: 'danger',
  };
  const VALID_TYPES = new Set(['note', 'info', 'warning', 'danger']);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tree: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    visit(tree, 'blockquote', (node: any) => {
      if (!node.children?.length) return;

      const firstChild = node.children[0];
      if (firstChild?.type !== 'paragraph') return;
      if (!firstChild.children?.length) return;

      const firstText = firstChild.children[0];
      if (firstText?.type !== 'text') return;

      // Match `[!type]` at the start of the first line, optionally followed
      // by a title.  The `s` flag is NOT needed — `[!type]` must be on the
      // first line.
      const match = (firstText.value as string).match(
        /^\[!(\w+)\][ \t]*(.*)/,
      );
      if (!match) return;

      const rawType = match[1]!.toLowerCase();
      const titleText = match[2]?.trim() ?? '';
      const calloutType =
        TYPE_ALIAS[rawType] ?? (VALID_TYPES.has(rawType) ? rawType : 'note');

      // --- outer wrapper: blockquote → div.callout.callout-{type} ----------
      node.data = node.data ?? {};
      node.data.hName = 'div';
      node.data.hProperties = {
        className: `callout callout-${calloutType}`,
        'data-callout': calloutType,
      };

      // --- title div -------------------------------------------------------
      // Replace the `[!type] Title` text node with just the title.
      firstText.value = titleText;
      firstChild.data = firstChild.data ?? {};
      firstChild.data.hName = 'div';
      firstChild.data.hProperties = { className: 'callout-title' };

      // --- content div (remaining blockquote children) ---------------------
      if (node.children.length > 1) {
        const contentChildren = node.children.slice(1);
        node.children = [
          firstChild,
          {
            // Use a generic `blockquote` node type with hName override so
            // remark renders its children normally.
            type: 'blockquote',
            children: contentChildren,
            data: {
              hName: 'div',
              hProperties: { className: 'callout-content' },
            },
          },
        ];
      } else {
        node.children = [firstChild];
      }
    });
  };
}

// ---------------------------------------------------------------------------
// Public plugin factories
// ---------------------------------------------------------------------------

/**
 * Returns the ordered list of remark plugins to wire into `astro.config.ts`.
 *
 * Plugin order matters:
 *   1. Image-embed handler — runs first so it can detect the raw
 *      `text("!")` + `wikiLink` pattern before any other transform.
 *   2. remark-wiki-link — resolves `[[target]]` and `[[target|label]]`.
 *   3. Unresolved-wikilink converter — turns broken links into spans.
 *   4. Callout handler — transforms blockquote callouts into divs.
 */
export function createRemarkPlugins(): RemarkPlugins {
  const knownIds = buildKnownPostIdSet();
  const permalinks = Array.from(knownIds);

  return [
    // 1. Image embeds must run before wiki-link (detects the !+wikiLink pair)
    remarkObsidianImageEmbed as RemarkPlugins[number],
    // 2. Wiki-link resolution
    [
      remarkWikiLink,
      {
        aliasDivider: '|',
        permalinks,
        pageResolver: (name: string) => [normalizeWikiTarget(name)],
        hrefTemplate: (permalink: string) => `/blog/posts/${permalink}/`,
        wikiLinkClassName: 'wikilink',
        newClassName: 'wikilink-new',
      },
    ],
    // 3. Convert unresolved wikilinks to spans
    remarkUnresolvedWikilinks as RemarkPlugins[number],
    // 4. Obsidian callouts
    remarkObsidianCallouts as RemarkPlugins[number],
  ];
}

/**
 * Returns the ordered list of rehype plugins to wire into `astro.config.ts`.
 *
 * Currently empty — all transformations happen at the remark (MDAST) level.
 * Reserved for future use (e.g. adding `rel="noopener"` to external links).
 */
export function createRehypePlugins(): RehypePlugins {
  return [];
}
