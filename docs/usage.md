# Using Clef Studio

**State** is the text or parsed JSON to evaluate. **Decision rules** contain your preferences or rubric and are appended to every question's instructions. Images are optional and can be combined with state. The **Questions / options** schema defines the outputs:

| Question type | Output |
| --- | --- |
| `choice` | One named option, confidence and probabilities across options |
| `noul` | A yes probability between 0 and 1 |
| `score` | A score over an ordered rubric, with probabilities for its levels |

Edit the question schema to change the outputs. The editor highlights JSON, checks it for errors and previews it as you type. **Inspect response** exposes the actual structured response, token usage, latency, GPU inference time and image-processing metadata. Clef does not generate a prose explanation. The probabilities describe how the model scored your rubric. They do not measure real-world accuracy.

## Experiments

| Experiment | Try it with |
| --- | --- |
| Dating profiles | Profile images plus explicit preferences and profile details |
| Thumbnail check | Cover images and video frames |
| Marketplace finds | Listing photos, prices and requirements |
| Interface critic | Screenshots with clipping, overlap or readability issues |
| Plant check | Visible leaf condition and a tentative next action |
| Hot / not | A subjective attraction rubric for adults or adult fictional characters |
| Snack court | Food photos and deliberately opinionated party rules |
| Art / trash | Artwork and your own aesthetic taste |
| Desk verdict | Desk organization, judged from visible objects |
| Presentation | Visible styling and presentation, without inferring gender identity |
| Age estimator | Face photos or a webcam; apparent age ranges with per-range probabilities |
| Soda can / pop tab | Beverage cans; tab present, missing, not visible, or no can, plus can-presence probability |
| Color check | Known color swatches with an expected answer |
| Object check | Object categories; the chair sample has an expected answer |
| Build your own | Arbitrary text, JSON or images with editable questions and rules |

## Images and live input

Upload or drop JPEG, PNG or WebP images (up to 20 MB each). The browser caps the longest edge at 1,280 pixels; the local processor uses a 262,144-pixel budget, typically no more than 256 vision tokens per image.

Choose **Camera** for a webcam or **Screen / phone** to share a window or screen. To use a phone, mirror it to your Mac and share the mirroring window. Video uploads are evaluated one frame at a time; upload a video on its own. The browser determines which video codecs you can upload.

During processing, the preview displays the exact submitted frame, holds it for one second after completion, then resumes. Uploaded video pauses during processing and retains its prior playing or paused state. The live loop schedules its next capture after the current inference finishes.

## Image queues

Select or drop multiple images to create a queue of up to 100 normalized images per experiment. Browse thumbnails or previous/next, evaluate one image, or use **Run queue** for sequential processing. **Pause** finishes the current image and leaves the rest pending. Completed images retain their results when revisited.

Changing state, rules or the schema clears cached queue results and pauses processing; earlier runs remain in history with their filenames. A failed image stops the batch for an explicit retry. Switching experiments retains their individual queues.

## History and recording

Refreshing the page clears history, queues and settings. Export any runs you want to keep. Export run history as JSON, download result cards, or record a session from the toolbar. Focus view and the portrait layout are useful for screen recordings.

| Shortcut | Action |
| --- | --- |
| Enter | Run a decision when not editing text |
| F | Toggle focus view |
| Escape | Leave focus view and pause the live loop |

[Back to the README](../README.md)
