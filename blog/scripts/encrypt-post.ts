/**
 * Encrypt a post for password-gated publication.
 *
 * Usage:
 *   npm run encrypt-post -- src/content/posts/.plaintext/<slug>.md
 *
 * Reads a plaintext markdown post, prompts for a passphrase, renders the body
 * to HTML using the same Astro markdown pipeline (shiki + remark/rehype plugins
 * from src/lib/markdown.ts), AES-GCM encrypts the bundle, and writes the
 * committable ciphertext file to src/content/posts/<slug>.md.
 *
 * The plaintext source stays in src/content/posts/.plaintext/ (gitignored)
 * so you can re-edit and re-encrypt later.
 */

import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, basename, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { webcrypto } from 'node:crypto';
import yaml from 'yaml';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import { createRemarkPlugins, createRehypePlugins } from '../src/lib/markdown.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BLOG_ROOT = resolve(__dirname, '..');
const POSTS_DIR = join(BLOG_ROOT, 'src/content/posts');
const PLAINTEXT_DIR = join(POSTS_DIR, '.plaintext');
const PBKDF2_ITERATIONS = 250_000;

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

type Frontmatter = Record<string, unknown>;

function parseFrontmatter(source: string): { data: Frontmatter; body: string } {
  if (!source.startsWith('---\n')) {
    throw new Error('Source file is missing a YAML frontmatter block.');
  }
  const end = source.indexOf('\n---\n', 4);
  if (end === -1) {
    throw new Error('Unterminated YAML frontmatter block.');
  }
  const yamlText = source.slice(4, end);
  const body = source.slice(end + 5);
  return { data: yaml.parse(yamlText) ?? {}, body };
}

function stringifyFrontmatter(data: Frontmatter, body: string): string {
  // Use yaml package with stable key order via the input object.
  const dumped = yaml.stringify(data, { lineWidth: 0 });
  return `---\n${dumped}---\n${body}`;
}

// ---------------------------------------------------------------------------
// Password prompt (no echo)
// ---------------------------------------------------------------------------

// On non-TTY input, sequential readline.question() calls race EOF and the
// second prompt can hang waiting for a line that's already been delivered.
// Slurp stdin up front and dispense lines from a queue instead.
let nonTtyLines: string[] | null = null;
let nonTtyCursor = 0;

async function loadNonTtyLines(): Promise<void> {
  if (nonTtyLines !== null) return;
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) chunks.push(chunk as Buffer);
  nonTtyLines = Buffer.concat(chunks).toString('utf8').split(/\r?\n/);
}

let ttyRl: ReturnType<typeof createInterface> | null = null;

function promptPassword(prompt: string): Promise<string> {
  if (stdin.isTTY !== true) {
    return (async () => {
      await loadNonTtyLines();
      const line = nonTtyLines![nonTtyCursor++] ?? '';
      stdout.write(prompt + '\n');
      return line;
    })();
  }

  return new Promise((resolveFn) => {
    if (!ttyRl) {
      ttyRl = createInterface({ input: stdin, output: stdout, terminal: true });
      // Suppress keystroke echo by gating all writes to the prompt label.
      const proto = ttyRl as unknown as {
        _writeToOutput: (str: string) => void;
        _activePrompt?: string;
      };
      const orig = proto._writeToOutput.bind(ttyRl);
      proto._writeToOutput = (str: string) => {
        if (proto._activePrompt && str === proto._activePrompt) orig(str);
      };
    }
    (ttyRl as unknown as { _activePrompt?: string })._activePrompt = prompt;
    ttyRl.question(prompt, (answer) => {
      stdout.write('\n');
      resolveFn(answer);
    });
  });
}

function closePrompts() {
  if (ttyRl) {
    ttyRl.close();
    ttyRl = null;
  }
}

// ---------------------------------------------------------------------------
// Crypto
// ---------------------------------------------------------------------------

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return Buffer.from(bin, 'binary').toString('base64');
}

async function encryptJson(
  payload: unknown,
  password: string,
): Promise<{
  iv: string;
  salt: string;
  iterations: number;
  ciphertext: string;
}> {
  const enc = new TextEncoder();
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));

  const baseKey = await webcrypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const key = await webcrypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const ct = new Uint8Array(
    await webcrypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(JSON.stringify(payload)),
    ),
  );

  return {
    iv: bytesToBase64(iv),
    salt: bytesToBase64(salt),
    iterations: PBKDF2_ITERATIONS,
    ciphertext: bytesToBase64(ct),
  };
}

// ---------------------------------------------------------------------------
// Markdown rendering — reuse Astro pipeline
// ---------------------------------------------------------------------------

async function renderMarkdown(body: string, filePath: string): Promise<string> {
  const processor = await createMarkdownProcessor({
    shikiConfig: { theme: 'rose-pine-moon' },
    remarkPlugins: createRemarkPlugins(),
    rehypePlugins: createRehypePlugins(),
  });
  const { code } = await processor.render(body, {
    // mimic Astro's file context so plugins that read file.history[0] (image
    // embeds) can resolve their post-id from the source filename.
    fileURL: new URL(`file://${filePath}`),
  });
  return code;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('usage: npm run encrypt-post -- <path-to-plaintext.md>');
    process.exit(2);
  }
  const inputPath = resolve(arg);
  if (!existsSync(inputPath)) {
    console.error(`✗ file not found: ${inputPath}`);
    process.exit(1);
  }

  const slug = basename(inputPath, '.md');
  const outputPath = join(POSTS_DIR, `${slug}.md`);

  const source = await readFile(inputPath, 'utf8');
  const { data, body } = parseFrontmatter(source);

  const title = String(data.title ?? slug);
  const description = String(data.description ?? '');
  const pubDate = data.pubDate ? String(data.pubDate) : new Date().toISOString().slice(0, 10);
  const tags: string[] = Array.isArray(data.tags) ? (data.tags as string[]) : [];

  console.log(`▪ slug          : ${slug}`);
  console.log(`▪ title         : ${title}`);
  console.log(`▪ output (git)  : ${relative(BLOG_ROOT, outputPath)}`);
  console.log('');

  const password = await promptPassword('passphrase: ');
  if (!password || password.length < 12) {
    console.error('✗ passphrase too short — use a long passphrase (e.g. 4+ random words)');
    process.exit(1);
  }
  const confirm = await promptPassword('confirm   : ');
  closePrompts();
  if (password !== confirm) {
    console.error('✗ passphrases do not match');
    process.exit(1);
  }

  console.log('▪ rendering markdown...');
  const html = await renderMarkdown(body, inputPath);

  console.log('▪ encrypting...');
  const cipher = await encryptJson(
    { title, description, pubDate, tags, html },
    password,
  );

  // Build the committable file — frontmatter only contains placeholders.
  const publicData: Frontmatter = {
    title: 'locked',
    description: 'this post is locked',
    pubDate: new Date().toISOString().slice(0, 10),
    unlisted: true,
    cipher,
  };
  const publicBody = '<!-- encrypted post — content lives in the cipher blob above -->\n';
  await writeFile(outputPath, stringifyFrontmatter(publicData, publicBody), 'utf8');
  console.log(`✓ wrote ${relative(BLOG_ROOT, outputPath)}`);

  // If the plaintext lives anywhere outside .plaintext/, move it there so
  // it's preserved locally but never committed.
  if (!inputPath.startsWith(PLAINTEXT_DIR + '/')) {
    await mkdir(PLAINTEXT_DIR, { recursive: true });
    const moved = join(PLAINTEXT_DIR, `${slug}.md`);
    await rename(inputPath, moved);
    console.log(`✓ moved plaintext → ${relative(BLOG_ROOT, moved)} (gitignored)`);
  }

  console.log('');
  console.log('done. commit the encrypted file when ready.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
