"""Cloudflare's schema head on Apple MPS. No CPU or generated-text fallback."""
import base64
import io
import logging
import sys
import threading
import time
import uuid
from datetime import datetime, timezone
from urllib.parse import unquote
from concurrent.futures import ThreadPoolExecutor

import torch
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from PIL import Image
from download import MODEL_PATH

app = FastAPI()
log = logging.getLogger("uvicorn.error")
executor = ThreadPoolExecutor(max_workers=1)
lock = threading.Lock()
runtime = {"status": "starting", "device": "mps", "model": "clef-flash", "error": None, "activeDecision": None}
model = processor = inference = None
VISION_SIZE = {"shortest_edge": 65536, "longest_edge": 262144}


def load():
    global model, processor, inference
    try:
        if not torch.backends.mps.is_available():
            raise RuntimeError("Apple MPS is unavailable. This runtime requires an Apple Silicon Mac.")
        if not (MODEL_PATH / "model.safetensors.index.json").exists():
            raise RuntimeError("Model weights are missing. Run npm run model:download first.")
        runtime["status"] = "loading"
        sys.path.insert(0, str(MODEL_PATH))
        from joint_schema_model import load_release_model, systemone
        # Eager attention is explicit: the published CUDA kernels do not run on MPS.
        model, processor = load_release_model(MODEL_PATH, device="mps", dtype=torch.bfloat16, attn_implementation="eager")
        inference = systemone
        runtime["status"] = "ready"
        log.info("Clef-flash ready on MPS")
    except Exception as exc:
        runtime.update(status="error", error=str(exc))
        log.exception("Model initialization failed")


@app.on_event("startup")
def startup():
    executor.submit(load)


@app.get("/health")
def health():
    return runtime


@app.post("/v1/systemone")
def decide(body: dict, request: Request):
    if runtime["status"] != "ready":
        raise HTTPException(503, runtime["error"] or f"Model is {runtime['status']}")
    if body.get("model") != "clef-flash":
        raise HTTPException(400, "Local runtime supports clef-flash only.")
    if not lock.acquire(blocking=False):
        job = runtime["activeDecision"]
        return JSONResponse(status_code=429, content={"detail": f"{job['experiment']} is running on the local GPU. Wait for it to finish.", "activeDecision": job})
    runtime["activeDecision"] = {"id": str(uuid.uuid4()), "experiment": unquote(request.headers.get("X-Experiment", "Local decision")), "provider": "local", "startedAt": datetime.now(timezone.utc).isoformat()}
    try:
        decoded = []
        for data_url in body.get("images", []):
            header, payload = data_url.split(",", 1)
            if header not in ("data:image/jpeg;base64", "data:image/png;base64", "data:image/webp;base64"):
                raise ValueError("Use embedded JPEG, PNG, or WebP images.")
            image = Image.open(io.BytesIO(base64.b64decode(payload, validate=True)))
            if image.width * image.height > 16_000_000:
                raise ValueError("Image exceeds 16 megapixels.")
            decoded.append(image.convert("RGB"))
        inference_request = {**body, "images": decoded, "media_kwargs": {"size": VISION_SIZE}}
        started = time.perf_counter()
        result = inference(model, processor, inference_request, max_length=4096)
        if not all(torch.isfinite(torch.tensor(list(answer.get("probabilities", {"true": answer.get("noul", 0)}).values()))).all() for answer in result["answers"].values()):
            raise RuntimeError("Model produced non-finite probabilities.")
        result["inference_ms"] = round((time.perf_counter() - started) * 1000)
        result["vision"] = {"input_sizes": [{"width": image.width, "height": image.height} for image in decoded], "max_pixels": VISION_SIZE["longest_edge"]}
        return result
    except (ValueError, TypeError) as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        log.exception("Inference failed")
        raise HTTPException(500, str(exc)) from exc
    finally:
        torch.mps.empty_cache()
        runtime["activeDecision"] = None
        lock.release()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)
