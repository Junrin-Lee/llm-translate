#!/usr/bin/env python3
"""Build a self-contained (outlined) master SVG for the LLM Translate icon."""
import os
from fontTools.ttLib import TTFont, TTCollection
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen

OUT = "/tmp/llmlogo"

def pick_face(path, want_substrings, avoid=("Italic", "Oblique", "Condensed")):
    col = TTCollection(path)
    best = None
    for i, f in enumerate(col.fonts):
        name = f["name"].getDebugName(4) or ""
        if any(a.lower() in name.lower() for a in avoid):
            continue
        for rank, sub in enumerate(want_substrings):
            if sub.lower() in name.lower():
                cand = (rank, i, name)
                if best is None or cand[0] < best[0]:
                    best = cand
    if best is None:  # fallback: first face
        best = (99, 0, col.fonts[0]["name"].getDebugName(4))
    idx = best[1]
    return TTFont(path, fontNumber=idx), best[2]

def glyph_svg(font, char):
    upm = font["head"].unitsPerEm
    gname = font.getBestCmap()[ord(char)]
    gs = font.getGlyphSet()
    pen = SVGPathPen(gs)
    gs[gname].draw(pen)
    d = pen.getCommands()
    bp = BoundsPen(gs)
    gs[gname].draw(bp)
    (xMin, yMin, xMax, yMax) = bp.bounds
    return d, upm, xMin, yMin, xMax, yMax

def place(d, upm, xMin, yMin, xMax, yMax, target_h, cx_target, baseline_y, fill):
    s = target_h / (yMax - yMin)
    cx = (xMin + xMax) / 2.0
    tx = cx_target - cx * s
    ty = baseline_y
    # after transform, ink vertical center sits at baseline_y - ((yMin+yMax)/2)*s
    ink_cy = baseline_y - ((yMin + yMax) / 2.0) * s
    g = (f'<g transform="translate({tx:.3f},{ty:.3f}) scale({s:.5f},{-s:.5f})" '
         f'fill="{fill}"><path d="{d}"/></g>')
    return g, ink_cy

# --- fonts ---
wen_font, wen_name = pick_face("/System/Library/Fonts/Hiragino Sans GB.ttc",
                               ["W6", "W3"])
a_font, a_name = pick_face("/System/Library/Fonts/HelveticaNeue.ttc",
                           ["Bold"])
print("文 face:", wen_name)
print("A  face:", a_name)

wd, wupm, *wbb = glyph_svg(wen_font, "文")
ad, aupm, *abb = glyph_svg(a_font, "A")

# --- layout (100x100 design space) ---
INDIGO = "#4f46e5"
CYAN = "#06b6d4"
WHITE = "#ffffff"
baseline = 55.0

wen_g, wcy = place(wd, wupm, *wbb, target_h=27.0, cx_target=35.0,
                   baseline_y=baseline, fill=INDIGO)
a_g, acy = place(ad, aupm, *abb, target_h=25.0, cx_target=66.0,
                 baseline_y=baseline, fill=INDIGO)
print("ink centers y: 文=%.1f A=%.1f (bubble body center=45)" % (wcy, acy))

# slash: spans glyph height, centered ~x=50.5, cyan
slash = ('<path d="M47.5 58 L53.5 31" stroke="%s" stroke-width="4" '
         'stroke-linecap="round"/>' % CYAN)

# sparkle 4-point star (cyan) top-right
def sparkle(cx, cy, R, fill):
    k = R * 0.16
    return (f'<path d="M{cx} {cy-R} Q{cx+k} {cy-k} {cx+R} {cy} '
            f'Q{cx+k} {cy+k} {cx} {cy+R} Q{cx-k} {cy+k} {cx-R} {cy} '
            f'Q{cx-k} {cy-k} {cx} {cy-R} Z" fill="{fill}"/>')

spark = sparkle(83, 15, 7.5, CYAN)

# bubble + tail (white)
bubble = ('<rect x="18" y="26" width="64" height="38" rx="15" fill="%s"/>'
          '<polygon points="44,63 50,74 56,63" fill="%s"/>' % (WHITE, WHITE))

squircle = f'<rect x="2" y="2" width="96" height="96" rx="23" fill="{INDIGO}"/>'

content = squircle + bubble + wen_g + slash + a_g + spark

svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
       + content + '</svg>')

os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, "icon.svg"), "w") as fh:
    fh.write(svg)

html = ('<!doctype html><meta charset="utf-8">'
        '<style>html,body{margin:0;padding:0}svg{display:block;width:100%;height:100%}</style>'
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" '
        'preserveAspectRatio="xMidYMid meet">' + content + '</svg>')
with open(os.path.join(OUT, "icon.html"), "w") as fh:
    fh.write(html)

print("wrote icon.svg (%d bytes) and icon.html" % len(svg))
