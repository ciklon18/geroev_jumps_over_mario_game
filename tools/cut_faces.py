"""Hard-coded crops of the scary faces in the meme clip (576x1024, face band y~430..1024,
caption strip around y~505..560). Each entry is the box that contains only the face."""
import os
import subprocess
from PIL import Image, ImageEnhance, ImageFilter

SRC = '_audio/media.bin'
OUT = 'assets/scare'
os.makedirs(OUT, exist_ok=True)

# name: (timestamp, (left, top, right, bottom)) — chosen on the full 576x1024 frame
SHOTS = {
    'glasses': (15.0, (60, 560, 520, 1024)),   # guy with the black mask, chin cut -> clean face
    'stare':   (14.0, (40, 430, 540, 1024)),  # pale long face staring
    'bob':     (12.0, (40, 430, 540, 1024)),
    'mouth':   (26.0, (20, 430, 556, 1024)),
    'skull':   (39.0, (20, 430, 556, 1024)),
    'scream':  (42.0, (20, 430, 556, 1024)),
    'void':    (50.0, (20, 430, 556, 1024)),
}

for name, (t, box) in SHOTS.items():
    raw = f'_audio/_f_{name}.png'
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-ss', str(t), '-i', SRC, '-frames:v', '1', raw], check=True)
    im = Image.open(raw).convert('RGB')
    im = im.crop(box)
    # square it from the top of the crop (the face dominates the upper part)
    w, h = im.size
    side = min(w, h)
    im = im.crop(((w - side) // 2, 0, (w - side) // 2 + side, side))
    im = im.resize((420, 420), Image.LANCZOS)
    im = ImageEnhance.Contrast(im).enhance(1.4)
    im = ImageEnhance.Brightness(im).enhance(0.95)
    im = im.filter(ImageFilter.UnsharpMask(radius=2, percent=140, threshold=2))
    im.save(f'{OUT}/{name}.jpg', quality=82, optimize=True)
    os.remove(raw)
    print(name, t, os.path.getsize(f'{OUT}/{name}.jpg'), 'b')