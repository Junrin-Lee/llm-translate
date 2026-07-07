# LLM Translate — brand / logo

Source of truth for the extension icon.

## Concept

An **AI-powered translation** mark: a speech bubble (language / dialogue) holding
`文 / A` (two writing systems → translation), with a four-point **spark** (the
common visual shorthand for LLM / generative AI). Together they read as
"large-model translation" even at a glance.

## Design tokens

| Token            | Value      | Use                                  |
| ---------------- | ---------- | ------------------------------------ |
| Indigo (brand)   | `#4f46e5`  | Squircle background, `文` and `A`     |
| Cyan (accent)    | `#06b6d4`  | Slash `/` and the spark              |
| White            | `#ffffff`  | Speech bubble                        |
| Corner radius    | ~23% of side | Squircle (continuous-ish)          |

Glyphs: `文` = Hiragino Sans GB W6, `A` = Helvetica Neue Bold. Both are
**outlined to vector paths** in `logo.svg`, so the master has no runtime font
dependency and rasterizes identically anywhere.

## Files

- `logo.svg` — self-contained (outlined) master, `viewBox 0 0 100 100`.
- `preview-512.png` — 512px raster preview.
- `generate.py` — regenerates `logo.svg` by outlining the glyphs (needs macOS
  system fonts + `fonttools`).

## Regenerate shipped PNGs

```sh
python3 assets/logo/generate.py                 # -> /tmp/llmlogo/icon.svg (master)
# rasterize to the sizes WXT ships, e.g. via headless Chrome + sips:
#   16 / 32 / 48 / 128 px  ->  public/icon/{16,32,48,128}.png
```

The shipped PNGs live in [`public/icon/`](../../public/icon/) (WXT's public
directory is the repo root `public/`, not `src/public`); WXT auto-detects them
into `manifest.icons`, and `wxt.config.ts` mirrors them onto
`action.default_icon`.
