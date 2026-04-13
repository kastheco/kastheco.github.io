#!/usr/bin/env bash
set -euo pipefail

# ── dependency guards ─────────────────────────────────────────────────────────
command -v xmllint >/dev/null 2>&1 || {
  echo "ERROR: xmllint not found — install libxml2-utils (apt) or libxml2 (brew)"
  exit 1
}
command -v rg >/dev/null 2>&1 || {
  echo "ERROR: rg (ripgrep) not found — install ripgrep"
  exit 1
}

# ── paths ─────────────────────────────────────────────────────────────────────
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"

tmp_site="$(mktemp -d)"
trap 'rm -rf "$tmp_site"' EXIT

echo "▪ repo root : $repo_root"
echo "▪ tmp site  : $tmp_site"

# ── install & build ───────────────────────────────────────────────────────────
echo ""
echo "── installing dependencies ──────────────────────────────────────────────"
npm ci --prefix "$repo_root/blog"

echo ""
echo "── building astro ───────────────────────────────────────────────────────"
npm run build --prefix "$repo_root/blog"

# ── stage combined site artifact ──────────────────────────────────────────────
echo ""
echo "── staging combined site ────────────────────────────────────────────────"

for asset in index.html 404.html robots.txt CNAME favicon.png favicon.svg .nojekyll; do
  src="$repo_root/$asset"
  if [[ -f "$src" ]]; then
    cp "$src" "$tmp_site/$asset"
    echo "  copied $asset"
  else
    echo "  skipped $asset (not found)"
  fi
done

mkdir -p "$tmp_site/blog"
cp -r "$repo_root/blog/dist/." "$tmp_site/blog/"
echo "  overlaid blog/dist/ → $tmp_site/blog/"

# ── validations ───────────────────────────────────────────────────────────────
echo ""
echo "── running validations ──────────────────────────────────────────────────"

# 1. RSS is well-formed XML
echo -n "  [1/5] rss.xml is valid XML ... "
xmllint --noout "$repo_root/blog/dist/rss.xml"
echo "ok"

# 2. Blog index exists in staged artifact
echo -n "  [2/5] staged blog/index.html exists ... "
test -f "$tmp_site/blog/index.html"
echo "ok"

# 3. .nojekyll exists in staged artifact
echo -n "  [3/5] staged .nojekyll exists ... "
test -f "$tmp_site/.nojekyll"
echo "ok"

# 4. No raw Obsidian wiki-link syntax in built HTML
echo -n "  [4/5] no raw [[wiki-link]] syntax in built HTML ... "
if rg --glob '*.html' '\[\[.+\]\]' "$tmp_site/blog/" --quiet 2>/dev/null; then
  echo "FAIL"
  echo "ERROR: raw Obsidian [[wiki-link]] syntax found in built HTML."
  echo "       Check the remark-wiki-link plugin configuration."
  rg --glob '*.html' '\[\[.+\]\]' "$tmp_site/blog/" || true
  exit 1
fi
echo "ok"

# 5. Blog-owned paths carry the /blog prefix
# Allowed bare paths: /, /favicon.png, /favicon.svg, /robots.txt, /404.html
# Rejected: href="/posts/...", href="/tags/...", href="/rss.xml" (missing /blog)
echo -n "  [5/5] blog paths carry /blog prefix ... "
bad_paths=$(rg --glob '*.html' \
  'href="/(posts|tags|rss\.xml)(/|")' \
  "$tmp_site/blog/" \
  --only-matching 2>/dev/null || true)
if [[ -n "$bad_paths" ]]; then
  echo "FAIL"
  echo "ERROR: blog-owned paths found without /blog prefix:"
  echo "$bad_paths"
  exit 1
fi
echo "ok"

echo ""
echo "── all checks passed ✓ ──────────────────────────────────────────────────"
