from pathlib import Path
from collections import deque
from PIL import Image, ImageFilter

SOURCE = Path("upload/image(77).png")
OUT = Path("assets/sprites")

# (action, row centre, frame centres)
ROWS = [
    ("idle", 143, [90, 280, 465, 655, 845, 1035]),
    ("walk-right", 351, [85, 275, 465, 650, 840, 1030, 1215, 1400]),
    ("walk-left", 558, [85, 275, 465, 650, 840, 1030, 1215, 1400]),
    ("wave", 745, [90, 280, 465, 650]),
    ("play", 973, [90, 280, 465, 650, 840]),
    ("tail", 1185, [90, 280, 465, 650, 840, 1030, 1215, 1400]),
    ("scratch", 1367, [90, 280, 465, 650, 840, 1030]),
    ("groom", 1595, [90, 280, 465, 650, 840, 1030]),
    ("groom-2", 1803, [90, 280, 465, 650, 840, 1030]),
]


def remove_checker(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    # The supplied preview has a pale blue checkerboard baked into the RGB data.
    # Cat pixels are warm/neutral; checker pixels are blue-grey. Build a soft edge.
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, _ = pixels[x, y]
            blue_bias = b - r
            bright = (r + g + b) / 3
            if bright > 205 and blue_bias > 5:
                a = 0
            elif bright > 195 and blue_bias > 1:
                a = max(0, min(255, int((5 - blue_bias) * 64)))
            else:
                a = 255
            pixels[x, y] = (r, g, b, a)
    alpha = rgba.getchannel("A").filter(ImageFilter.MedianFilter(3))
    rgba.putalpha(alpha)
    return rgba


def keep_main_subject(image: Image.Image) -> Image.Image:
    """Remove pieces of neighbouring frames that cross a cell boundary."""
    alpha = image.getchannel("A")
    opaque = set()
    for y in range(image.height):
        for x in range(image.width):
            if alpha.getpixel((x, y)) > 48:
                opaque.add((x, y))
    components = []
    while opaque:
        seed = opaque.pop()
        component = {seed}
        queue = deque([seed])
        while queue:
            x, y = queue.popleft()
            for point in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if point in opaque:
                    opaque.remove(point)
                    component.add(point)
                    queue.append(point)
        components.append(component)
    if not components:
        return image
    main = max(components, key=len)
    xs = [p[0] for p in main]
    ys = [p[1] for p in main]
    margin = 3
    box = (max(0, min(xs) - margin), max(0, min(ys) - margin),
           min(image.width, max(xs) + margin + 1), min(image.height, max(ys) + margin + 1))
    mask = Image.new("L", image.size, 0)
    # Preserve soft antialiasing inside the main subject's bounding rectangle.
    mask.paste(image.getchannel("A").crop(box), box)
    image.putalpha(mask)
    return image


def main():
    source = remove_checker(Image.open(SOURCE))
    OUT.mkdir(parents=True, exist_ok=True)
    atlas = Image.new("RGBA", (184 * 8, 176 * len(ROWS)), (0, 0, 0, 0))
    for row_index, (action, cy, centres) in enumerate(ROWS):
        action_dir = OUT / action
        action_dir.mkdir(exist_ok=True)
        for i, cx in enumerate(centres):
            crop = source.crop((cx - 92, cy - 88, cx + 92, cy + 88))
            crop = keep_main_subject(crop)
            crop.save(action_dir / f"{i:02}.png", optimize=True)
            atlas.alpha_composite(crop, (i * 184, row_index * 176))
    atlas.save(OUT.parent / "sprites.png", optimize=True)
    print(f"Extracted {sum(len(row[2]) for row in ROWS)} frames to {OUT}")


if __name__ == "__main__":
    main()
