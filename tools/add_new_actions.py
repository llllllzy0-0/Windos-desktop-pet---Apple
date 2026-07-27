from pathlib import Path
from PIL import Image

BASE = Path("assets/sprites.png")
NEW = Path("tmp/imagegen/new-actions.png")
OUTPUT = Path("assets/sprites-v2.png")

CELL_W, CELL_H = 184, 176


def main():
    base = Image.open(BASE).convert("RGBA")
    source = Image.open(NEW).convert("RGBA")
    atlas = Image.new("RGBA", (CELL_W * 8, CELL_H * 12), (0, 0, 0, 0))
    atlas.alpha_composite(base, (0, 0))

    source_cell_w = source.width / 6
    source_cell_h = source.height / 3
    for row in range(3):
        for col in range(6):
            left = round(col * source_cell_w)
            top = round(row * source_cell_h)
            right = round((col + 1) * source_cell_w)
            bottom = round((row + 1) * source_cell_h)
            frame = source.crop((left, top, right, bottom))
            subject_box = frame.getbbox()
            if not subject_box:
                continue
            subject = frame.crop(subject_box)
            subject.thumbnail((CELL_W - 8, CELL_H - 8), Image.Resampling.LANCZOS)
            x = col * CELL_W + (CELL_W - subject.width) // 2
            y = (row + 9) * CELL_H + CELL_H - subject.height - 4
            atlas.alpha_composite(subject, (x, y))

    atlas.save(OUTPUT, optimize=True)
    print(f"Saved {OUTPUT}")


if __name__ == "__main__":
    main()
