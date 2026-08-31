# romantelescope.space

Fan page tracking NASA's Roman Space Telescope live on its ~90-day cruise from Earth to L2.
Built with [Astro](https://astro.build), deployed as a Cloudflare Worker (static assets).

## Develop

```sh
npm install
npm run dev        # local dev server
npm run build      # static build into dist/
npm run preview    # preview the built site
```

## Structure

- `src/content/body.en.html` — the page markup (English). Edit content here.
- `src/i18n/static.{hu,de,es,zh}.json` — translations for the static markup, applied at build time.
- `src/i18n/runtime.{lang}.json` — strings the client JS needs (live tickers, SVG labels, captions).
- `src/lib/translate.mjs` — build-time translation (selector → key map, formerly the client-side `applyLang`).
- `src/scripts/app.js` — the client engine: mission model, live tickers, SVG animations, anatomy interactive.
- `src/data/anat.json` + `public/img/anat/*.webp` — NASA observatory renders and hotspot geometry.
- `src/pages/` — `/` (en) and `/hu/ /de/ /es/ /zh/` static routes.

Each language ships as real static HTML (`/`, `/hu/`, `/de/`, `/es/`, `/zh/`) with hreflang tags.

## Deploy (Cloudflare Workers Builds)

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- `wrangler.jsonc` serves `dist/` as static assets — its `name` must match the Worker's name.

## Mission stages

Everything that can honestly follow the launch clock switches automatically
(hero day line, section chips, "expected any day" deploy labels, roadmap
accordion, days-on-station counter). Milestones that need NASA's word are
manual: flip the matching flag in `CONFIRMED` at the top of
`src/scripts/app.js` when the mission blog confirms it, then push —
every affected module (deploy board, camera section, arrival state)
updates from that one flag. Planned timings live next to it in `PLAN`.
