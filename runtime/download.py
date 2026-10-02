from pathlib import Path
import argparse
from huggingface_hub import snapshot_download

MODEL_ID = "Cloudflare/clef-flash"
REVISION = "17f0b0ad64efb65d273590632833508766b2aae6"
MODEL_PATH = Path(__file__).resolve().parents[1] / ".models" / "clef-flash"
Q8_MODEL_ID = "mlx-community/clef-flash-8bit"
Q8_REVISION = "dfa0993decb4f8507a0eae01afd1b2d33a4bb734"
Q8_MODEL_PATH = MODEL_PATH.parent / "clef-flash-8bit"

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Download a pinned Clef model release.")
    parser.add_argument("--variant", choices=("bf16", "mlx8"), default="bf16")
    variant = parser.parse_args().variant
    model_id, revision, path = (MODEL_ID, REVISION, MODEL_PATH) if variant == "bf16" else (Q8_MODEL_ID, Q8_REVISION, Q8_MODEL_PATH)
    print(f"Downloading {model_id} at {revision} to {path}", flush=True)
    snapshot_download(model_id, revision=revision, local_dir=path)
    print("Model downloaded.", flush=True)
