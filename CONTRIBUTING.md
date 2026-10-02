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
