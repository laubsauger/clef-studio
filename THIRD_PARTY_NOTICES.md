# Third-party notices

## Clef-flash

The local runtime downloads the official [Cloudflare/clef-flash](https://huggingface.co/Cloudflare/clef-flash) release at revision `17f0b0ad64efb65d273590632833508766b2aae6`. Its model card declares Apache 2.0; the download includes the upstream license. Model weights and upstream inference code are downloaded into the ignored `.models/clef-flash` directory and are not included in this repository.

## Clef-flash MLX Q8

The optional benchmark downloads [mlx-community/clef-flash-8bit](https://huggingface.co/mlx-community/clef-flash-8bit), pinned to the revision recorded in the benchmark report. Its downloaded license is Apache 2.0. Weights and its MLX implementation remain in the ignored `.models/clef-flash-8bit` directory.

## Android accessibility helper

The native capture bridge uses [uiautomator2](https://github.com/openatx/uiautomator2), licensed under MIT. Its Python package supplies the Android helper used through authorized ADB. Its version and dependencies are pinned in `runtime/uv.lock`.

## Sample photographs

The JPEG samples in `public/samples` (`profile-female.jpg`, `thumbnail.jpg`, `market.jpg`, `plant.jpg`, `pizza.jpg`, `desk.jpg`) were sourced from [Unsplash](https://unsplash.com/) and remain subject to the [Unsplash License](https://unsplash.com/license). The original photo IDs and individual photographer credits were not recorded during prototyping.

The Sofia sample profile is fictional. Its biography and preferences do not describe the person in the photograph. The SVG samples and studio favicon were created for this project.

## Dependencies

JavaScript and Python packages retain their own licenses. Dependency versions are recorded in `package-lock.json`, `runtime/uv.lock` and `benchmarks/uv.lock`; installed packages include their upstream notices. Inter and DM Mono are distributed through Fontsource with their font licenses, and the interface uses Lucide icons and shadcn components.
