from __future__ import annotations

from pathlib import Path


def _bg_rgb(img) -> tuple[int, int, int]:
    w, h = img.size
    samples = [
        img.getpixel((0, 0)),
        img.getpixel((w - 1, 0)),
        img.getpixel((0, h - 1)),
        img.getpixel((w - 1, h - 1)),
    ]
    samples = [(int(r), int(g), int(b)) for (r, g, b) in samples]
    return max(set(samples), key=samples.count)


def build_wordmark_png(src_png: Path, out_png: Path) -> None:
    from PIL import Image

    src = Image.open(src_png).convert("RGBA")
    bg = _bg_rgb(src.convert("RGB"))

    # Make background transparent.
    px = src.load()
    for y in range(src.size[1]):
        for x in range(src.size[0]):
            r, g, b, a = px[x, y]
            d = abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2])
            if d < 45:
                px[x, y] = (r, g, b, 0)

    # Tight crop to the visible logo (ignores padding).
    alpha = src.split()[-1]
    bb = alpha.getbbox()
    if not bb:
        raise SystemExit("Could not find non-background pixels in logo.")
    cropped = src.crop(bb)

    # Place on square canvas; scale to fill most of the width.
    target = 1024
    canvas = Image.new("RGBA", (target, target), (0, 0, 0, 0))
    max_dim = max(cropped.size)
    fill = int(round(target * 0.92))
    new_w = max(1, int(round(cropped.size[0] * (fill / max_dim))))
    new_h = max(1, int(round(cropped.size[1] * (fill / max_dim))))
    resized = cropped.resize((new_w, new_h), Image.Resampling.LANCZOS)
    ox = (target - new_w) // 2
    oy = (target - new_h) // 2
    canvas.alpha_composite(resized, (ox, oy))

    out_png.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out_png, format="PNG", optimize=True)


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    build_wordmark_png(root / "tokeilogo.png", root / "assets" / "tokei-wordmark.png")
    print("Wrote assets/tokei-wordmark.png")


if __name__ == "__main__":
    main()

