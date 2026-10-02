# Clef on M3 Max: bf16 and Q8

Measured on an Apple M3 Max with 36 GB unified memory. This is a fresh sequential rerun after the other GPU-heavy project was stopped. Thermal conditions and filesystem caches were not controlled; interpret these as measurements from this desktop, not a general speed guarantee.

21 identical fixtures: eight color swatches, nine built-in vision experiments and four controlled text/JSON inputs. Each condition runs in a fresh process, one model at a time. One first-use request per fixture is excluded from warm statistics; five subsequent requests are timed with GPU synchronization. Timing includes image preprocessing and the decision head; it excludes network/UI/OCR, model loading and cache clearing. GPU caches are cleared between requests, matching the studio runtime. Filesystem caches and thermal conditions are not controlled.

All conditions use the same JPEG bytes, schemas, state, 4,096-token limit and 262,144-pixel budget. Token IDs and image grids match for every case; MLX bf16 and Q8 also have identical preprocessed-pixel hashes. The PyTorch and MLX image processors have different implementations. MLX receives its explicit `min_pixels` / `max_pixels` arguments; its processor ignores the PyTorch `size` dictionary, so that initial invalid run was discarded.

The Q8 backbone uses affine 8-bit groups of 64; the vision tower and Clef decision head remain bf16. This compares the current PyTorch runtime with a community MLX implementation. Comparing the two MLX conditions isolates quantization more closely than comparing PyTorch with MLX.

| Runtime | Warm p50 | Warm p95 | Active GPU allocations | Known-answer checks |
| --- | ---: | ---: | ---: | ---: |
| torch-bf16 | 1.77s | 2.20s | 17.75 GiB | 21/21 |
| mlx-bf16 | 1.49s | 2.14s | 17.75 GiB | 21/21 |
| mlx-q8 | 2.02s | 3.59s | 9.94 GiB | 21/21 |

GPU allocation figures are framework-reported active allocations, not total unified-memory pressure. Driver/peak/RSS measurements are preserved in the raw results and should not be added together.

| Comparison | Same top answer | Mean absolute probability difference | Largest difference |
| --- | ---: | ---: | ---: |
| torch-bf16 → mlx-bf16 | 35/35 | 0.16 pp | 1.88 pp |
| torch-bf16 → mlx-q8 | 35/35 | 0.13 pp | 2.05 pp |
| mlx-bf16 → mlx-q8 | 35/35 | 0.14 pp | 2.03 pp |

Agreement on subjective experiments is consistency, not accuracy. Ground-truth checks cover swatches, a known chair image, explicit approval rules, payment status and stated urgency. This small suite does not establish broad model quality.

## Per-fixture warm medians

| Fixture | PyTorch bf16 | MLX bf16 | MLX Q8 |
| --- | ---: | ---: | ---: |
| color-red | 1.59s | 1.27s | 1.58s |
| color-orange | 1.60s | 1.30s | 1.66s |
| color-yellow | 1.60s | 1.35s | 1.72s |
| color-green | 1.63s | 1.41s | 1.80s |
| color-blue | 1.73s | 1.41s | 2.03s |
| color-purple | 1.76s | 1.48s | 2.04s |
| color-black | 1.79s | 1.59s | 2.30s |
| color-white | 1.77s | 1.63s | 2.43s |
| object | 2.12s | 1.97s | 3.55s |
| plant | 2.11s | 2.04s | 3.58s |
| thumbnail | 2.12s | 1.93s | 3.19s |
| market | 2.03s | 1.90s | 2.93s |
| neat | 2.69s | 2.28s | 3.52s |
| art | 1.87s | 1.54s | 2.17s |
| snack | 1.87s | 1.50s | 1.99s |
| desk | 1.78s | 1.36s | 1.88s |
| match | 2.07s | 1.66s | 2.16s |
| json-approve | 0.92s | 0.85s | 1.10s |
| json-reject | 0.98s | 0.88s | 1.03s |
| text-approve | 0.99s | 0.83s | 1.03s |
| text-reject | 0.99s | 0.87s | 1.02s |

## Reproduce

Use the pinned model revisions in `runtime/download.py` and the locked environments. Keep all other GPU work stopped, stop the studio model runtime before running workers, and run each worker sequentially:

```sh
npm run model:download
npm run model:download:q8
UV_CACHE_DIR=.uv-cache uv sync --locked --project benchmarks
npm run dev
# In another terminal, while the studio is running:
node --import tsx benchmarks/fixtures.ts
# Stop npm run model before these workers; never load them concurrently:
runtime/.venv/bin/python benchmarks/worker.py --engine torch-bf16
benchmarks/.venv/bin/python benchmarks/worker.py --engine mlx-bf16
benchmarks/.venv/bin/python benchmarks/worker.py --engine mlx-q8
python3 benchmarks/report.py
# Restore the normal studio runtime:
npm run model
```

Raw outputs remain in ignored `.benchmarks/`. Public measurements and all per-request answers are in [m3-max.json](m3-max.json); CSV medians are in [m3-max.csv](m3-max.csv). Fixtures use repository samples and controlled text only; personal profiles are excluded.

## Versions and model revisions

- torch-bf16: torch 2.11.0, transformers 5.10.2, pillow 12.3.0; model load 36.91s; first request 40.15s.
- mlx-bf16: mlx 0.32.3, mlx-lm 0.32.0, mlx-vlm 0.7.4, transformers 5.14.1, pillow 12.3.0; model load 6.80s; first request 2.42s.
- mlx-q8: mlx 0.32.3, mlx-lm 0.32.0, mlx-vlm 0.7.4, transformers 5.14.1, pillow 12.3.0; model load 3.82s; first request 1.62s.

- bf16: Cloudflare/clef-flash at `17f0b0ad64efb65d273590632833508766b2aae6`.
- Q8: mlx-community/clef-flash-8bit at `dfa0993decb4f8507a0eae01afd1b2d33a4bb734`.
