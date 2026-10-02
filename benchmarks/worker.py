"""One model per process; synchronized end-to-end decision latency, no generation."""
import argparse
import base64
import hashlib
import importlib.metadata
import io
import json
import math
import os
import platform
import resource
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
BF16 = ROOT / '.models/clef-flash'
Q8 = ROOT / '.models/clef-flash-8bit'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--engine', choices=['torch-bf16', 'mlx-bf16', 'mlx-q8'], required=True)
    parser.add_argument('--suite', type=Path, default=ROOT / '.benchmarks/suite.json')
    parser.add_argument('--repeats', type=int, default=5)
    parser.add_argument('--limit', type=int)
    args = parser.parse_args()
    if args.repeats < 1:
        raise ValueError('At least one timed repetition is required.')
    suite = json.loads(args.suite.read_text())
    started = time.perf_counter()
    if args.engine == 'torch-bf16':
        import torch
        if not torch.backends.mps.is_available():
            raise RuntimeError('MPS is required.')
        sys.path.insert(0, str(BF16))
        from joint_schema_model import load_release_model, systemone, encode_record
        model, processor = load_release_model(BF16, device='mps', dtype=torch.bfloat16, attn_implementation='eager')
        torch.mps.synchronize()
        sync = torch.mps.synchronize
        clear = torch.mps.empty_cache
        def infer(request):
            return systemone(model, processor, request, max_length=suite['max_tokens'])
        def encode(request):
            encoded = encode_record(processor.tokenizer, request, max_length=100000, processor=processor)
            grid = encoded.media['image_grid_thw'].tolist() if encoded.media else None
            pixels = encoded.media['pixel_values'].float().numpy() if encoded.media else None
            return encoded, grid, pixels
        def memory():
            return {'gpu_active_bytes': torch.mps.current_allocated_memory(), 'gpu_driver_bytes': torch.mps.driver_allocated_memory()}
        packages = ['torch', 'transformers', 'pillow']
        media_kwargs = {'size': {'shortest_edge': 65536, 'longest_edge': suite['max_pixels']}}
    else:
        import mlx.core as mx
        sys.path.insert(0, str(Q8))
        from clef_mlx import load, encode_record
        model = load(Q8 if args.engine == 'mlx-q8' else BF16, backend='vlm')
        mx.eval(model.backbone.parameters(), model.head.parameters())
        mx.synchronize()
        sync = mx.synchronize
        clear = mx.clear_cache
        def infer(request):
            return model.systemone(request, max_length=suite['max_tokens'], truncate=False)
        def encode(request):
            encoded = encode_record(model.tokenizer, request, max_length=suite['max_tokens'], truncate=False, processor=model.processor)
            grid = encoded.media['image_grid_thw'].tolist() if encoded.media else None
            pixels = np.asarray(encoded.media['pixel_values'], dtype=np.float32) if encoded.media else None
            return encoded, grid, pixels
        def memory():
            return {'gpu_active_bytes': mx.get_active_memory(), 'gpu_peak_bytes': mx.get_peak_memory()}
        packages = ['mlx', 'mlx-lm', 'mlx-vlm', 'transformers', 'pillow']
        media_kwargs = {'min_pixels': 65536, 'max_pixels': suite['max_pixels']}
    load_ms = (time.perf_counter() - started) * 1000
    output = {'engine': args.engine, 'timestamp': datetime.now(timezone.utc).isoformat(), 'platform': platform.platform(), 'machine': platform.machine(), 'versions': {name: importlib.metadata.version(name) for name in packages}, 'pid': os.getpid(), 'model_load_ms': load_ms, 'max_tokens': suite['max_tokens'], 'max_pixels': suite['max_pixels'], 'repeats': args.repeats, 'cases': []}
    path = ROOT / f'.benchmarks/{args.engine}.json'
    def save():
        output['memory'] = {**memory(), 'process_peak_rss_bytes': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss}
        path.write_text(json.dumps(output, indent=2))
    print(f'{args.engine}: loaded in {load_ms / 1000:.2f}s', flush=True)
    for index, fixture in enumerate(suite['fixtures'][:args.limit]):
        images = [Image.open(io.BytesIO(base64.b64decode(fixture['image'].split(',')[1]))).convert('RGB')] if fixture.get('image') else []
        request = {'model': 'clef-flash', 'state': fixture['state'], 'questions': fixture['questions'], 'images': images, 'media_kwargs': media_kwargs}
        # First use of this input is measured separately; it is not in warm medians.
        responses = []
        for repetition in range(args.repeats + 1):
            sync()
            start = time.perf_counter()
            response = infer(request)
            sync()
            elapsed_ms = (time.perf_counter() - start) * 1000
            for answer in response['answers'].values():
                values = list(answer['probabilities'].values()) if 'probabilities' in answer else [answer['noul']]
                if not all(math.isfinite(value) and 0 <= value <= 1 for value in values):
                    raise RuntimeError('Non-finite or invalid model probabilities.')
            responses.append({'ms': elapsed_ms, 'response': response})
            clear()
        encoded, grid, pixels = encode(request)
        if len(encoded.input_ids) > suite['max_tokens']:
            raise ValueError('Input exceeds context budget; truncation is not permitted in paired benchmarks.')
        fingerprint = hashlib.sha256(json.dumps(list(encoded.input_ids), separators=(',', ':')).encode()).hexdigest()
        case = {'id': fixture['id'], 'expected': fixture.get('expected', {}), 'input_tokens': len(encoded.input_ids), 'input_sha256': fingerprint, 'image_grid_thw': grid, 'pixel_sha256': hashlib.sha256(pixels.tobytes()).hexdigest() if pixels is not None else None, 'image_sizes': [list(image.size) for image in images], 'first_ms': responses[0]['ms'], 'first_response': responses[0]['response'], 'runs': responses[1:]}
        output['cases'].append(case)
        save()
        print(f"{args.engine} {index + 1}/{len(suite['fixtures'][:args.limit])}: {fixture['id']} {sum(run['ms'] for run in responses[1:]) / args.repeats:.0f}ms ({len(encoded.input_ids)} tokens)", flush=True)
    output['complete'] = True
    save()


if __name__ == '__main__':
    main()
