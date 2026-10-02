"""Summarize paired decisions, warm timings and known-answer checks."""
import csv
import json
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENGINES = ['torch-bf16', 'mlx-bf16', 'mlx-q8']


def label(answer):
    if answer['type'] == 'choice':
        return answer['choice']
    if answer['type'] == 'noul':
        return 'yes' if answer['noul'] >= .5 else 'no'
    return max(answer['probabilities'], key=answer['probabilities'].get)


def probabilities(answer):
    return answer['probabilities'] if 'probabilities' in answer else {'yes': answer['noul'], 'no': 1 - answer['noul']}


def main():
    datasets = {engine: json.loads((ROOT / f'.benchmarks/{engine}.json').read_text()) for engine in ENGINES}
    if not all(data.get('complete') for data in datasets.values()):
        raise ValueError('All three benchmark conditions must finish before reporting.')
    cases = {engine: {case['id']: case for case in data['cases']} for engine, data in datasets.items()}
    ids = list(cases[ENGINES[0]])
    for engine in ENGINES[1:]:
        if set(cases[engine]) != set(ids):
            raise ValueError('Benchmark fixtures differ between conditions.')
        for case in ids:
            baseline, candidate = cases[ENGINES[0]][case], cases[engine][case]
            if baseline['input_sha256'] != candidate['input_sha256'] or baseline['image_grid_thw'] != candidate['image_grid_thw']:
                raise ValueError(f'{engine}/{case}: token or image grids do not match.')
    if any(cases['mlx-bf16'][case]['pixel_sha256'] != cases['mlx-q8'][case]['pixel_sha256'] for case in ids):
        raise ValueError('MLX bf16 and Q8 preprocessed pixels differ.')
    output = ROOT / 'docs/benchmarks'
    output.mkdir(parents=True, exist_ok=True)
    rows = []
    for case in ids:
        row = {'fixture': case}
        for engine in ENGINES:
            item = cases[engine][case]
            row[engine] = round(statistics.median(run['ms'] for run in item['runs']), 1)
        rows.append(row)
    with (output / 'm3-max.csv').open('w') as handle:
        writer = csv.DictWriter(handle, fieldnames=['fixture', *ENGINES])
        writer.writeheader(); writer.writerows(rows)
    md = ['# Clef on M3 Max: bf16 and Q8', '', 'Measured on an Apple M3 Max with 36 GB unified memory. This is a fresh sequential rerun after the other GPU-heavy project was stopped. Thermal conditions and filesystem caches were not controlled; interpret these as measurements from this desktop, not a general speed guarantee.', '', '21 identical fixtures: eight color swatches, nine built-in vision experiments and four controlled text/JSON inputs. Each condition runs in a fresh process, one model at a time. One first-use request per fixture is excluded from warm statistics; five subsequent requests are timed with GPU synchronization. Timing includes image preprocessing and the decision head; it excludes network/UI/OCR, model loading and cache clearing. GPU caches are cleared between requests, matching the studio runtime. Filesystem caches and thermal conditions are not controlled.', '', 'All conditions use the same JPEG bytes, schemas, state, 4,096-token limit and 262,144-pixel budget. Token IDs and image grids match for every case; MLX bf16 and Q8 also have identical preprocessed-pixel hashes. The PyTorch and MLX image processors have different implementations. MLX receives its explicit `min_pixels` / `max_pixels` arguments; its processor ignores the PyTorch `size` dictionary, so that initial invalid run was discarded.', '', 'The Q8 backbone uses affine 8-bit groups of 64; the vision tower and Clef decision head remain bf16. This compares the current PyTorch runtime with a community MLX implementation. Comparing the two MLX conditions isolates quantization more closely than comparing PyTorch with MLX.', '', '| Runtime | Warm p50 | Warm p95 | Active GPU allocations | Known-answer checks |', '| --- | ---: | ---: | ---: | ---: |']
    for engine, data in datasets.items():
        timings = sorted(run['ms'] for case in data['cases'] for run in case['runs'])
        correct = total = 0
        for case in data['cases']:
            answers = case['runs'][0]['response']['answers']
            for question, expected in case['expected'].items():
                correct += label(answers[question]) == expected; total += 1
        p95 = timings[min(len(timings) - 1, int(.95 * len(timings)))]
        md.append(f"| {engine} | {statistics.median(timings) / 1000:.2f}s | {p95 / 1000:.2f}s | {data['memory']['gpu_active_bytes'] / 1024**3:.2f} GiB | {correct}/{total} |")
    md += ['', 'GPU allocation figures are framework-reported active allocations, not total unified-memory pressure. Driver/peak/RSS measurements are preserved in the raw results and should not be added together.', '', '| Comparison | Same top answer | Mean absolute probability difference | Largest difference |', '| --- | ---: | ---: | ---: |']
    for left, right in [('torch-bf16', 'mlx-bf16'), ('torch-bf16', 'mlx-q8'), ('mlx-bf16', 'mlx-q8')]:
        same = total = 0; differences = []
        for case in ids:
            a = cases[left][case]['runs'][0]['response']['answers']; b = cases[right][case]['runs'][0]['response']['answers']
            for question in a:
                same += label(a[question]) == label(b[question]); total += 1
                x, y = probabilities(a[question]), probabilities(b[question])
                differences.extend(abs(x[key] - y[key]) for key in x)
        md.append(f'| {left} → {right} | {same}/{total} | {statistics.mean(differences) * 100:.2f} pp | {max(differences) * 100:.2f} pp |')
    md += ['', 'Agreement on subjective experiments is consistency, not accuracy. Ground-truth checks cover swatches, a known chair image, explicit approval rules, payment status and stated urgency. This small suite does not establish broad model quality.', '', '## Per-fixture warm medians', '', '| Fixture | PyTorch bf16 | MLX bf16 | MLX Q8 |', '| --- | ---: | ---: | ---: |']
    md.extend(f"| {row['fixture']} | {row['torch-bf16'] / 1000:.2f}s | {row['mlx-bf16'] / 1000:.2f}s | {row['mlx-q8'] / 1000:.2f}s |" for row in rows)
    md += ['', '## Reproduce', '', 'Use the pinned model revisions in `runtime/download.py` and the locked environments. Keep all other GPU work stopped, stop the studio model runtime before running workers, and run each worker sequentially:', '', '```sh', 'npm run model:download', 'npm run model:download:q8', 'UV_CACHE_DIR=.uv-cache uv sync --locked --project benchmarks', 'npm run dev', '# In another terminal, while the studio is running:', 'node --import tsx benchmarks/fixtures.ts', '# Stop npm run model before these workers; never load them concurrently:', 'runtime/.venv/bin/python benchmarks/worker.py --engine torch-bf16', 'benchmarks/.venv/bin/python benchmarks/worker.py --engine mlx-bf16', 'benchmarks/.venv/bin/python benchmarks/worker.py --engine mlx-q8', 'python3 benchmarks/report.py', '# Restore the normal studio runtime:', 'npm run model', '```', '', 'Raw outputs remain in ignored `.benchmarks/`. Public measurements and all per-request answers are in [m3-max.json](m3-max.json); CSV medians are in [m3-max.csv](m3-max.csv). Fixtures use repository samples and controlled text only; personal profiles are excluded.', '', '## Versions and model revisions', '']
    for engine, data in datasets.items():
        md.append(f"- {engine}: {', '.join(f'{name} {version}' for name, version in data['versions'].items())}; model load {data['model_load_ms'] / 1000:.2f}s; first request {data['cases'][0]['first_ms'] / 1000:.2f}s.")
    md += ['', '- bf16: Cloudflare/clef-flash at `17f0b0ad64efb65d273590632833508766b2aae6`.', '- Q8: mlx-community/clef-flash-8bit at `dfa0993decb4f8507a0eae01afd1b2d33a4bb734`.', '']
    (output / 'm3-max.md').write_text('\n'.join(md))
    public = {'note': 'Fresh sequential rerun after other GPU-heavy work stopped; thermal conditions and filesystem caches not controlled.', 'conditions': datasets}
    for data in public['conditions'].values():
        data.pop('pid', None)
    (output / 'm3-max.json').write_text(json.dumps(public, indent=2))
    print(f'Wrote paired benchmark report to {output}')


if __name__ == '__main__':
    main()
