"""Remove the caption strip from the face crops: blur it out with a dark smear so the
image reads as a pure horror flash."""
import os
import numpy as np
from PIL import Image, ImageFilter

OUT = 'assets/scare'
for fn in sorted(os.listdir(OUT)):
    if not fn.endswith('.jpg'):
        continue
    p = os.path.join(OUT, fn)
    im = Image.open(p).convert('RGB')
    w, h = im.size
    arr = np.asarray(im).astype(np.float32)

    # the caption lives in a horizontal strip around 18-26% of the crop height
    y0, y1 = int(h * 0.14), int(h * 0.30)
    # darken that strip heavily and add vertical streaks (like compressed horror video)
    strip = arr[y0:y1, :, :]
    streak = np.random.normal(1.0, 0.25, size=(1, w, 1)).clip(0.4, 1.2)
    arr[y0:y1, :, :] = (strip * 0.35 + 12) * streak

    im2 = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    # soft-blur the strip so no letters survive
    band = im2.crop((0, y0, w, y1)).filter(ImageFilter.GaussianBlur(9))
    im2.paste(band, (0, y0))
    im2.save(p, quality=82, optimize=True)
    print('cleaned', fn)