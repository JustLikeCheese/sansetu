# Venn Meme Maker

[简体中文](README.md) | English

Make "Stable / Fast / Cheap" style three-circle Venn memes in the browser, and turn them into spinning animations and videos.

**Try it: <https://justlikecheese.github.io/sansetu/>**

| Image | Spinning GIF |
| --- | --- |
| <img src="docs/preview.png" width="360" alt="Venn meme example"> | <img src="docs/preview.gif" width="360" alt="Spinning GIF example"> |

## Features

- **Matches the original meme by default**: circle positions, colors, label positions and sizes were measured from the original image.
- **Every color and label is editable**: fill, text, text color and size for each of the seven areas, plus bold, italic, underline and strikethrough; labels can span multiple lines.
- **Edit on the image**: click a label to edit it in place; right-click for colors, size, text style and circle size.
- **Drag to edit (off by default to prevent accidental changes)**: turn on the "Drag to edit" switch to move labels, drag a text box corner to resize it, drag a circle edge to resize the circle (hold Shift for all three), or drag the canvas edge to change the padding.
- **Undo / redo**: Ctrl+Z to undo, Ctrl+Y or Ctrl+Shift+Z to redo (⌘ on Mac), plus buttons above the preview.
- **Circles**: radius, spacing, individual circle sizes, outline width and color.
- **Presets**: text sets and color schemes; overlap colors can be custom, or mixed automatically from the three circles (average or multiply).
- **Image export**: PNG, JPG, WebP, SVG, BMP, ICO (and AVIF where supported) at 0.5x to 4x, or copy to the clipboard.
- **Animation / video export**: GIF, APNG, animated WebP and MP4 / WebM video; download, copy, or send through the system share sheet.
- **Spinning animation**: turns, direction, spin time, pause, motion curve, center label effect, upright text, size and looping. Frame rate can be anything from 1 to 120 fps (GIF up to 50, APNG / WebP up to 60, video up to 120).
- **Pausable previews**: click or double-click the live preview, a generated animation or a video to pause / resume.
- **Languages**: 简体中文, 繁體中文, English and 日本語, picked from your browser language.
- **Share links**: copy a link that carries every setting; your edits are also saved in the browser.

Pure front-end, no build step and no third-party scripts. Dropdowns, checkboxes, switches, sliders, number fields and the color picker are custom components (`ui.js`) instead of the browser's built-in widgets and pop-ups. The GIF / APNG / animated WebP writers are hand-written too. Images are generated locally and never uploaded.

> Clipboard limitation: browsers can't put a GIF or video on the clipboard as a file. Pasting into docs, email and rich-text editors keeps the animation, but most chat apps only accept still images from the clipboard, so use Download or Share to send animations there.

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
python -m http.server 8000
```

## Files

- `index.html` / `style.css`: page and styles
- `app.js`: rendering, interaction, undo, export
- `ui.js`: custom form components (checkbox / switch, slider, number field, select, color picker)
- `i18n.js`: UI strings and per-language text presets
- `gif.js`: GIF89a encoder (popularity palette + LZW)
- `encoders.js`: APNG, animated WebP, BMP and ICO writers

## License

[GPL-3.0](LICENSE)
