"""Regenerate the simple application icon (requires Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw
root = Path(__file__).resolve().parents[1] / "public" / "icons"
root.mkdir(exist_ok=True)
for size, name in [(192, "icon-192.png"), (512, "icon-512.png"), (180, "apple-touch-icon.png")]:
    scale = size / 64
    image = Image.new("RGB", (size, size), "#c6f56c")
    draw = ImageDraw.Draw(image)
    def points(values): return [(round(x * scale), round(y * scale)) for x, y in values]
    width = max(2, round(4.5 * scale))
    draw.line(points([(32, 17), (32, 39)]), fill="#17250b", width=width)
    draw.line(points([(23, 31), (32, 40), (41, 31)]), fill="#17250b", width=width, joint="curve")
    draw.line(points([(18, 43), (18, 49), (46, 49), (46, 43)]), fill="#17250b", width=width, joint="curve")
    image.save(root / name)
