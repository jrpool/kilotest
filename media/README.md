# Media

This folder holds the ChatGPT demonstration video, `demo-chatgpt.mp4`, which the web page `/demo-chatgpt.html` offers as an alternative to its step-through slideshow. The video is served at `/media/demo-chatgpt.mp4`.

## Source

The video is built from `demo-chatgpt-src/`:

- `demo_list.txt` lists the slides in order. Each slide is a frame file followed by the number of seconds it stays on screen.
- `demo-chatgpt-src/labeled/` holds the 800×700 PNG frames that the list references.

The final line of `demo_list.txt` repeats the last frame without a duration. ffmpeg's concat format requires this line, and the build script handles it.

## Changing durations

1. Edit the `duration` lines in `demo-chatgpt-src/demo_list.txt`. Durations are whole or fractional seconds.
2. To change the slides themselves, add or replace frame files in `demo-chatgpt-src/labeled/` and update the `file` lines to match.
3. Rebuild the video from the repository root:

```bash
npm run build:media
```

The script writes `media/demo-chatgpt.mp4`. Its length is the sum of the durations, and it is encoded at 30 frames per second.

To write the video somewhere else for comparison, pass a path:

```bash
npm run build:media -- /path/to/output.mp4
```

## Requirements

- [ffmpeg](https://ffmpeg.org/) on the PATH. On macOS, install it with `brew install ffmpeg`.

## Verification

The committed `demo-chatgpt.mp4` is byte-identical to the output of `npm run build:media` with the sources in this folder. After a rebuild, check that the video length matches the sum of the durations:

```bash
ffprobe -v error -show_entries format=duration -of default=nw=1 media/demo-chatgpt.mp4
```

## Related files

- `scripts/buildDemoVideo.ts` contains the build script.
- `web/demo-chatgpt/` contains the slideshow version of the same demonstration, which is independent of this video.
