# kasthe.dev

personal site. static html, github pages.

## deploy

push to `main`. github actions handles the rest.

## custom domains

`kasthe.dev` (primary) and `kasthe.co` (alias) — configured via CNAME + cloudflare dns.

### dns setup

point both domains to github pages:

```
kasthe.dev  →  A     185.199.108.153
                     185.199.109.153
                     185.199.110.153
                     185.199.111.153

www         →  CNAME kastheco.github.io

kasthe.co   →  CNAME kasthe.dev  (or same A records + add as custom domain in repo settings)
```

then in repo settings → pages → custom domain → `kasthe.dev` → enforce https.

to add `kasthe.co` as a second domain, add it under the same pages settings after the primary is verified.
