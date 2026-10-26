# Kit sandbox

A small Vite project that renders every component of `plugins/pignolo/skills/ui/kit/` on its own page with all its states, and drives each page in a real Chrome (keyboard, hover, focus, mid-animation, reduced motion, forced colors, coarse pointer).
The kit is imported from the plugin through the `@kit` alias; nothing is copied here.

## Run

```bash
cd tests/kit-sandbox
npm ci
npm run dev                       # live preview at http://127.0.0.1:5173
node scripts/run-all.mjs          # every check, normal and reduced motion
node scripts/run-all.mjs dropdown # one component
node --test interact/date-input.test.mjs   # pure date logic, no browser
```

From the repo root, `npm run kit:check` is the same as `node tests/kit-sandbox/scripts/run-all.mjs`.

It needs Chrome. If it is not at `C:\Program Files\Google\Chrome\Application\chrome.exe`, set `PIGNOLO_UI_BROWSER` to its path.

## Layout

- `src/preview/pages/<slug>.tsx`: the page of one component (`registry.ts` lists them).
- `interact/<slug>.mjs`: the check of that page (`default export async (t) => {}`; helpers are documented at the top of `scripts/check.mjs`).
- `scripts/check.mjs`: builds, serves `dist/`, opens one route, fails on any console or page error and on horizontal overflow at 390 px.
- `shots/` and `dist/` are generated and ignored by git.

`npm test` at the repo root does not run these: they need a browser and a separate `npm ci`. They run before publishing a change to the kit.
