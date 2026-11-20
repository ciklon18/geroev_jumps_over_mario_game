"""Build horror jump-scare faces from the provided scare reference.

assets/jumpscare.jpg  -> the scary face (enlarged, sharpened)
assets/faces.png      -> a 3-frame strip with different face variants for the flashes
"""
from PIL import Image, ImageFilter, ImageEnhance, ImageDraw, ImageOps
import numpy as np
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'assets', 'scare-src.png')
OUT1 = os.path.join(HERE, 'assets', 'jumpscare.jpg')
OUT2 = os.path.join(HERE, 'assets', 'faces.png')

src = Image.open(SRC).convert('L').resize((480, 531), Image.LANCZOS)
src = ImageEnhance.Contrast(src).enhance(1.55)
src = src.filter(ImageFilter.UnsharpMask(radius=3, percent=160, threshold=2))

# --- face A: the reference, pushed darker and grittier ---------------------
a = src.copy()
arr = np.asarray(a).astype(np.float32)
# crush the blacks, keep the pale forehead: reads as a face in the dark
arr = np.clip((arr - 40) * 1.45, 0, 255)
a = Image.fromarray(arr.astype(np.uint8)).convert('RGB')
a = ImageEnhance.Color(a).enhance(0.15)
a.save(OUT1, quality=88, optimize=True)

# --- strip of 3 variants used by the flashes --------------------------------
W, H = 480, 531
strip = Image.new('RGB', (W * 3, H), (0, 0, 0))
strip.paste(a, (0, 0))

# B: cropped tighter (eyes/nose/mouth) + heavy red tint
b = a.crop((70, 40, 410, 430)).resize((W, H), Image.LANCZOS)
ba = np.asarray(b).astype(np.float32)
ba[..., 0] = np.clip(ba[..., 0] * 1.35 + 25, 0, 255)
ba[..., 1] = ba[..., 1] * 0.55
ba[..., 2] = ba[..., 2] * 0.5
strip.paste(Image.fromarray(ba.astype(np.uint8)), (W, 0))

# C: mirrored + inverted-ish negative flash
c = ImageOps.mirror(src).convert('RGB')
ca = 255 - np.asarray(c).astype(np.float32)
ca = np.clip((ca - 60) * 1.25, 0, 255)
strip.paste(Image.fromarray(ca.astype(np.uint8)), (W * 2, 0))

strip.save(OUT2, optimize=True)
print('saved', OUT1, a.size, '|', OUT2, strip.size)