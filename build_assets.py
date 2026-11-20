"""Build assets/hero.png: the guy from the photo as a mushroom character."""
from PIL import Image, ImageFilter, ImageDraw, ImageEnhance
import numpy as np
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "assets", "hero-src.png")
OUT = os.path.join(HERE, "assets", "hero.png")

S = 2
src = Image.open(SRC).convert("RGB")
src = ImageEnhance.Contrast(src).enhance(1.06)

CANVAS_W, CANVAS_H = 440 * S, 470 * S
out = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))

# ---------------------------------------------------------------- 1. FACE --
FX0, FY0, FX1, FY1 = 196, 300, 448, 690     # face oval in source pixel coords
SCALE = 340 / (FX1 - FX0)                   # -> 340px wide on the canvas
FW = int((FX1 - FX0) * SCALE * S)
FH = int((FY1 - FY0) * SCALE * S)
crop = src.crop((FX0, FY0, FX1, FY1)).resize((FW, FH), Image.LANCZOS)
oval = Image.new("L", (FW, FH), 0)
ImageDraw.Draw(oval).ellipse((0, 0, FW - 1, FH * 2 - 1), fill=255)
oval = oval.filter(ImageFilter.GaussianBlur(6 * S))
crop.putalpha(oval)
out.alpha_composite(crop, ((CANVAS_W - FW) // 2, 190 * S))

# ----------------------------------------------------------------- 2. CAP --
CW, CH = 430 * S, 220 * S
tex = src.crop((30, 40, 460, 210)).resize((CW, CH), Image.LANCZOS)

yy, xx = np.mgrid[0:CH, 0:CW].astype(np.float32) + 0.5
u = (xx - CW / 2) / (CW / 2)
v = yy / (CH - 1)
q = u ** 2 + (v - 1.0) ** 2            # 0 at top-mid, 1 at the rim
a_dome = np.clip((1.0 - q) * 40, 0, 1)  # crisp-ish anti-aliased edge
a_dome = np.clip(np.asarray(Image.fromarray((a_dome * 255).astype(np.uint8))
                            .filter(ImageFilter.GaussianBlur(1.0 * S))).astype(np.float32) / 255, 0, 1)

tpx = np.asarray(tex).astype(np.float32)
cx, cy = CW * 0.40, CH * 0.32
dist = np.sqrt(((xx - cx) / (CW * 0.66)) ** 2 + ((yy - cy) / (CH * 0.95)) ** 2)
shade = np.clip(1.22 - dist * 0.62, 0.38, 1.22)
tpx = np.clip(tpx * shade[..., None], 0, 255)

X = np.arange(CW)[None, :]
Y = np.arange(CH)[:, None]

# white fly-agaric spots, also clipped to the dome
spots_mask = np.zeros((CH, CW), np.float32)
for (sx, sy, sr) in [(0.17, 0.36, 0.058), (0.42, 0.20, 0.046), (0.66, 0.38, 0.054),
                     (0.30, 0.62, 0.030), (0.54, 0.66, 0.034), (0.80, 0.60, 0.026)]:
    ex = (X - sx * CW) / (sr * CW)
    ey = (Y - sy * CH) / (sr * CW * 0.78)
    spots_mask = np.maximum(spots_mask, np.clip((1 - (ex ** 2 + ey ** 2)) * 22, 0, 1))
spots_mask = np.asarray(Image.fromarray((spots_mask * 255).astype(np.uint8))
                        .filter(ImageFilter.GaussianBlur(1.0 * S))).astype(np.float32) / 255
spots_mask *= a_dome * 0.85
cap_rgb = tpx * (1 - spots_mask[..., None]) + 252 * spots_mask[..., None]

# pale underside band along the rim
band = np.clip((v - 0.74) * 16, 0, 1) * a_dome
band = np.asarray(Image.fromarray((band * 255).astype(np.uint8))
                  .filter(ImageFilter.GaussianBlur(0.8 * S))).astype(np.float32) / 255
cap_rgb = cap_rgb * (1 - band[..., None]) + np.array([246, 237, 220], np.float32) * band[..., None]

# gills on the band
gills = np.zeros((CH, CW), np.float32)
period = 22.0 * S / 2
gills = (np.mod(X + period / 2, period) < 3.0 * S).astype(np.float32) * np.ones((CH, 1), np.float32)
gills *= np.clip((v - 0.80) * 20, 0, 1) * band
cap_rgb = cap_rgb * (1 - gills[..., None] * 0.22) + np.array([200, 182, 155], np.float32) * gills[..., None] * 0.22

# rim highlight (top edge of the pale band)
hi = np.clip((band - np.roll(band, 3, axis=0)) * 4, 0, 1) * 0.6
cap_rgb = np.clip(cap_rgb * (1 + hi[..., None] * 0.35), 0, 255)

cap = Image.fromarray(cap_rgb.astype(np.uint8)).convert("RGBA")
cap.putalpha(Image.fromarray((a_dome * 255).astype(np.uint8)))
out.alpha_composite(cap, ((CANVAS_W - CW) // 2, 0))

# ------------------------------------------------------------ 3. OVERALLS --
ov = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
od = ImageDraw.Draw(ov)
L, R, T, B = 120 * S, 320 * S, 378 * S, 470 * S
od.rounded_rectangle((L, T, R, B), radius=44 * S, fill=(70, 104, 160, 240))
od.line((L + 16 * S, 414 * S, R - 16 * S, 414 * S), fill=(235, 240, 250, 185), width=4 * S)
for bx in (186 * S, 230 * S):
    od.ellipse((bx, 398 * S, bx + 20 * S, 418 * S), fill=(250, 214, 80, 255))
out.alpha_composite(ov.filter(ImageFilter.GaussianBlur(0.8 * S)))

# -------------------------------------------------------------- 4. OUTLINE --
alpha = out.split()[3]
a_px = np.asarray(alpha).astype(np.float32)
glow = alpha.filter(ImageFilter.MaxFilter(9 * S + 1)).filter(ImageFilter.GaussianBlur(3 * S))
edge = np.clip(np.asarray(glow).astype(np.float32) - a_px, 0, 255) * 0.92
rgb = np.asarray(out.convert("RGB")).astype(np.float32)
rgb = rgb * (1 - edge[..., None] / 255.0) + 24 * (edge[..., None] / 255.0)
out = Image.fromarray(rgb.astype(np.uint8)).convert("RGBA")
out.putalpha(Image.fromarray(np.maximum(a_px, edge).astype(np.uint8)))

out = out.crop(out.split()[3].getbbox())
out = out.resize((out.width // S, out.height // S), Image.LANCZOS)
out.save(OUT)
print("saved", OUT, out.size)
