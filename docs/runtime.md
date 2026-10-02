# Runtime and troubleshooting

| Service | Address |
| --- | --- |
| Development UI | `http://127.0.0.1:5173` |
| API | `http://127.0.0.1:3001` |
| Model health | `http://127.0.0.1:8001/health` |

All services bind to localhost. Model weights are stored in `.models/clef-flash`; the Python environment is in `runtime/.venv`, with uv's cache in `.uv-cache`. These directories are ignored by Git.

## Cloudflare engine

Local inference is the default. To enable the remote engine:

```sh
cp .env.example .env
```

Set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_AUTH_TOKEN`, restart the API and select **Cloudflare** in engine settings. That selection sends the current state, instructions and images to Cloudflare. Credentials stay in the server environment. There is no automatic remote or CPU fallback.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Local runtime offline | Start `npm run model`; inspect its terminal output and `/health`. |
| Weights missing | Finish `npm run model:download`, then restart the model runtime. |
| MPS unavailable | Local inference requires an Apple Silicon Mac with working PyTorch MPS support. |
| First run is much slower | GPU warm-up can make the first inference substantially slower. Image content, input shape and schema size also affect latency. Inspect response separates GPU inference time from overall request time. |
| Another decision is running | The GPU processes one request at a time. The UI shows the active experiment, including requests from other tabs. |
| Camera or screen capture fails | Check browser and macOS permissions; use Chrome on localhost for screen sharing. |
| Port already in use | Stop the process occupying 5173, 3001 or 8001 before starting the corresponding service. |

Local runtime requests are limited to 4,096 tokens. Keep state and question schemas reasonably small. The API times out inference requests after three minutes; an active GPU job may continue until the runtime finishes.

## Model

The official [Cloudflare/clef-flash](https://huggingface.co/Cloudflare/clef-flash) model is pinned to revision `17f0b0ad64efb65d273590632833508766b2aae6`. The runtime uses its published schema inference code, with MPS and image-budget configuration for this local sandbox. This is an independent project.

## Built UI

To serve the built UI locally, run `npm run build`, then `npm run server` and `npm run model` in separate terminals. Open `http://127.0.0.1:3001`.

[Back to the README](../README.md)
