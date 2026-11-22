# PixelCutout baseline

Captured: 2026-11-22  
Repository: [leenusdarnal/pixelcutout](https://github.com/leenusdarnal/pixelcutout)  
Baseline branch: `main`  
Baseline commit: `6444acaa611e3fa4d7f0a70e344a1da4f940c888` (tracker documentation commit)

## Toolchain and reproducible commands

The repository uses SvelteKit 2, Svelte 5, TypeScript, Vite, and npm. `package-lock.json` is committed.

Run from a clean checkout with Node.js/npm compatible with the lockfile:

```sh
npm ci
npm run dev
npm run test
npm run check
npm run build
```

The `build` script runs tests, Svelte/TypeScript checks, then the Vite production build. The `dev` script starts Vite on `0.0.0.0`.

## CI snapshot

- Workflow: **Verify PixelCutout**
- Run: [45000210362](https://github.com/leenusdarnal/pixelcutout/actions/runs/45000210362)
- Commit: `6444acaa611e3fa4d7f0a70e344a1da4f940c888`
- Result: **failed** during **Install dependencies**; build, type-check, and unit-test steps were skipped.
- Earlier successful run: [44181253648](https://github.com/leenusdarnal/pixelcutout/actions/runs/44181253648), on prior commit `1a68ed0a315852528dc7c4a9df74027259b3fa02`.

The failure is currently localized to dependency installation; its underlying error has not yet been confirmed. Do not treat this as an application build failure. Resolve the install failure and rerun CI before marking the baseline reproducible.

## Measurement limits

No clean local checkout or production build was run as part of this remote repository inspection. Initial bundle size, emitted asset sizes, and clean-checkout command results remain **unmeasured** and must be captured by a real build. Do not infer bundle size from repository size or lockfile size.
