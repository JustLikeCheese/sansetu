# Venn Meme Maker

[简体中文](README.md) | English

Make "Stable / Fast / Cheap" style three-circle Venn memes in the browser, and turn them into a spinning GIF with one click.

**Try it: <https://justlikecheese.github.io/sansetu/>**

| Image | Spinning GIF |
| --- | --- |
| <img src="docs/preview.png" width="360" alt="Venn meme example"> | <img src="docs/preview.gif" width="360" alt="Spinning GIF example"> |

## Features

- **Matches the original meme by default**: circle positions, colors, label positions and sizes were measured from the original image.
- **Every color and label is editable**: fill, text, text color, font size and bold for each of the seven areas; labels can span multiple lines.
- **Circles**: radius, spacing, individual circle sizes, outline width and color.
- **Text**: several CJK fonts, global text scale and text outline. Drag labels on the image to move them, double-click a label to edit it.
- **Presets**: text sets (Good pay / Easy job / Near home, Grades / Sleep / Social life, ...) and color schemes (Macaron, Neon, Morandi, Mono, Random). Overlap colors can be mixed automatically from the three circles.
- **Export**: PNG, JPG, WebP and SVG at 0.5x to 4x, or copy the image straight to the clipboard.
- **Spinning GIF**: live preview plus controls for turns, direction, spin time, pause, motion curve (slow stop, hard brake, bounce, ...), a pop or reveal effect for the center label, upright text, frame rate (10 to 25 fps), size and looping.
- **Languages**: 简体中文, 繁體中文, English and 日本語, picked from your browser language. Each language has its own default text and presets.
- **Share links**: copy a link that carries every setting; your edits are also saved in the browser.

Pure front-end, no build step and no third-party scripts. The GIF encoder is hand-written (`gif.js`). Images are generated locally and never uploaded.

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
python -m http.server 8000
```

## Files

- `index.html` / `style.css`: page and styles
- `app.js`: rendering, interaction, export
- `i18n.js`: UI strings and per-language text presets
- `gif.js`: GIF89a encoder (popularity palette + LZW)

## License

[GPL-3.0](LICENSE)
