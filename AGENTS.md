# tabsync agent notes

## extension build / reload

vite + crxjs build (`src/manifest.ts` reads version from root `package.json`).
bump `version` patch in `package.json` in the same edit as any extension change
(`pnpm bump` also works but runs the full release pack; plain edit is enough
for the dev loop). reload with `pwsh tools/reload-extension.ps1` — it rebuilds
the chrome dist (`pnpm exec vite build`), opens `public/reload.html`, bg blanks
its tab + calls `runtime.reload()`, so manifest bumps are picked up too.
Extensions Reloader (`start msedge http://reload.extensions`) is JS-only and
never re-reads the manifest; the manual button on `edge://extensions` is
fallback. full release artifacts (zips + crx + firefox xpi) via `pnpm build`.
