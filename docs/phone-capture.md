# Phone capture

Android profile reading uses accessibility. For a live preview, mirror an Android phone with scrcpy or an iPhone with QuickTime, then share that window.

Open **Connect your phone** (or the **Phone setup** button) for the platform guide. Its **Share phone window** button opens the browser’s capture picker directly.

**Android:** use [scrcpy](https://github.com/Genymobile/scrcpy) to mirror the phone over USB. It works on macOS without root access or a permanent app installation on the phone. Install the Mac tools once:

```sh
brew install scrcpy
brew install --cask android-platform-tools
```

On the phone, find **Build number** in Settings → About phone (sometimes under Software information), tap it seven times, then enable **USB debugging** in Developer options. Connect a data-capable USB cable, unlock the phone and accept its debugging authorization prompt. Launch the mirror:

```sh
scrcpy --select-usb --no-audio --max-size=1280 --window-title="Android phone"
```

In the studio's sharing picker, select the **Android phone** window. The 1,280-pixel limit preserves aspect ratio and avoids streaming unnecessarily large frames. You can interact with the phone through the scrcpy window while the studio samples it.

If no device appears, run `adb devices`: `device` means authorized; `unauthorized` means accept the prompt on the phone. An empty list usually means USB debugging is disabled or the cable does not carry data. With multiple USB devices, use `scrcpy --serial=YOUR_DEVICE_SERIAL` instead of `--select-usb`. See the official [macOS setup](https://github.com/Genymobile/scrcpy/blob/master/doc/macos.md), [connection guide](https://github.com/Genymobile/scrcpy/blob/master/doc/connection.md) and [Android developer-options instructions](https://developer.android.com/studio/debug/dev-options).

On Samsung devices, if USB debugging says **blocked by Auto Blocker**, open Settings → Security and privacy → Auto Blocker and turn it off for the session. Then enable USB debugging, reconnect and authorize the Mac. You can restore Auto Blocker afterward. This behavior is documented by [Samsung](https://docs.samsungknox.com/admin/fundamentals/whitepaper/samsung-knox-mobile-security/system-security/samsung-auto-blocker/).

**iPhone:** connect and unlock the phone, accept **Trust This Computer**, then open QuickTime Player → File → New Movie Recording. Select the iPhone from the camera menu beside Record, leave the preview open and share that QuickTime window. You do not need to start a recording.

## Read an Android profile

Dating profiles uses **Android accessibility** by default. It finds a single authorized phone automatically and retries when you reconnect. Click the source label to choose a device or explicitly switch to **Image OCR**. Full-profile mode uses the phone's native accessibility tree for text and ADB screenshots for photos. Screen sharing through scrcpy remains useful for the live preview.

- **Immediate** reads the currently visible profile and captures one photo.
- **Full profile** opens the expanded profile first, captures each photo there alongside its visible text, then scrolls through the remaining sections. It fills State with written name/age, distance, photo count, bio, interests, labelled attributes and prompt answers. Missing details remain empty; app navigation and report/block controls are excluded.
- **Read text** collects without inference. **Read + decide** collects and scores every photo. After reading, **Score all photos** evaluates the captured queue without collecting again.

The native bridge uses [uiautomator2](https://github.com/openatx/uiautomator2), installed with the runtime dependencies. On its first read it starts the bundled accessibility helper on the phone over authorized ADB. Subsequent reads reuse the connection; the Mac helper exits with the API. Keep the phone unlocked with the current profile open. This path does not invoke OCR.

State updates while collecting, with visible progress and captured thumbnails. **Cancel phone capture** interrupts the active phone command. The photo gallery sits beside the preview, with each score on its photo. Click a photo to review its result; **Return to live preview** restores the connected stream without another sharing prompt. Both the main sidebar and profile rail can collapse.

The combined attraction score is the median of all completed photo scores, normalized to 0-100. It appears only after every photo has completed; per-photo answers and combined score also appear in State. Derived scores are excluded from later model inputs so previous decisions do not influence the next photo.

**Reset profile** clears collected State, photos and scores while keeping your rules. **Read next profile** reads the profile currently open on the phone. When the written name or age changes, a **New profile** indicator appears without replacing State. This detection does not advance or match a profile on the phone.

## Read text from an image

For uploaded screenshots or an iPhone/screen-share frame, explicitly choose **Image OCR**. This uses Apple Vision locally, independently of Clef. Build its helper once (requires the Xcode Command Line Tools):

```sh
npm run ocr:build
```

**Read profile text** prefills State from written text. Name and age anchor the profile region; app headers and navigation are excluded. **Inspect text** shows the retained and excluded text. Unlabelled details remain unclassified rather than being guessed from the portrait. Live preview resumes automatically after reading.

**OCR · refresh each decision** synchronizes recognized text with the evaluated frame. Editing State or its format disables automatic replacement. Failed or empty recognition reports an error instead of reusing old text. Run `npm run test:ocr` to verify the actual native helper with a known text image. Captured profiles remain in browser memory; the API does not save them to the repository.

[Back to the README](../README.md)
