# Contributing

Use Node 24 (`nvm use`) and `npm ci`. The [README](README.md) covers local model setup; you can work on the UI and run the browser tests without downloading model weights.

Before sending a pull request:

```sh
npm run lint
npm run build
npm test
```

Google Chrome must be installed for the browser tests. Playwright starts the app automatically and reuses a running development server outside CI. Tests mock inference, but exercise real browser rendering, uploads, recording and media capture. For image-processor changes, also run `npm run test:processor` after downloading the model.

Keep changes focused. Fix the responsible code rather than adding silent fallbacks. Cover behavior changes with relevant regression checks. Keep `package-lock.json` and `runtime/uv.lock` in sync with dependency changes. Use the shadcn CLI when adding UI components.

Experiments live in `src/lib/experiments.ts`. Add their navigation icon in `src/App.tsx`, provide a sample in `public/samples`, and check that idle and completed results fit without shifting the layout. Record sources for any third-party samples in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Never include model weights, credentials, local environments or personal uploads in a pull request. The application’s MIT license does not replace the licenses of model weights or third-party assets.

## Other checks

```sh
npm run test:server
npm run test:ui
# Requires downloaded model files; exercises the actual processor without loading weights:
npm run test:processor
```

The local runtime uses Python 3.12, PyTorch MPS, bfloat16 and eager attention. UI tests mock inference and capture streams; API tests cover schema validation. GitHub Actions runs lint, build and tests without downloading weights.

## Repository layout

```text
src/                    React UI, experiments, schemas and media helpers
src/components/ui/      Components installed with the shadcn CLI
server/                 Express API, provider routing and response validation
runtime/                Python MPS runtime, downloader and processor regression test
public/samples/         Demo images and SVG fixtures
tests/                  Playwright browser regression tests
benchmarks/             Paired PyTorch / MLX quantization comparison
docs/                   Usage guides, screenshot and benchmark results
.github/workflows/      GitHub checks
```

