from __future__ import annotations

import struct
from pathlib import Path


def _dib_from_rgba(img) -> bytes:
    w, h = img.size
    rgba = img.tobytes("raw", "RGBA")

    # ICO BMP payload uses BGRA, bottom-up rows.
    row_stride = w * 4
    pixels = bytearray(w * h * 4)
    for y in range(h):
        src = y * row_stride
        dst = (h - 1 - y) * row_stride
        row = rgba[src : src + row_stride]
        for x in range(w):
            r = row[x * 4 + 0]
            g = row[x * 4 + 1]
            b = row[x * 4 + 2]
            a = row[x * 4 + 3]
            pixels[dst + x * 4 + 0] = b
            pixels[dst + x * 4 + 1] = g
            pixels[dst + x * 4 + 2] = r
            pixels[dst + x * 4 + 3] = a

    # 1-bit AND mask, padded to 32 bits per row.
    mask_row_bytes = ((w + 31) // 32) * 4
    mask = bytearray(mask_row_bytes * h)
    for y in range(h):
        for x in range(w):
            # Mask bit 1 => transparent. Use alpha==0 as transparent.
            a = rgba[(y * w + x) * 4 + 3]
            if a == 0:
                byte_i = (h - 1 - y) * mask_row_bytes + (x // 8)
                bit = 7 - (x % 8)
                mask[byte_i] |= 1 << bit

    # BITMAPINFOHEADER (40 bytes). Height is doubled for XOR+AND masks.
    header = struct.pack(
        "<IIIHHIIIIII",
        40,  # biSize
        w,  # biWidth
        h * 2,  # biHeight (XOR + AND)
        1,  # biPlanes
        32,  # biBitCount
        0,  # biCompression (BI_RGB)
        len(pixels) + len(mask),  # biSizeImage
        0,  # biXPelsPerMeter
        0,  # biYPelsPerMeter
        0,  # biClrUsed
        0,  # biClrImportant
    )

    return header + pixels + mask


def _debug_png(png_path: Path, out_dir: Path, sizes: list[int], prefix: str) -> None:
    from PIL import Image

    out_dir.mkdir(parents=True, exist_ok=True)
    base = Image.open(png_path).convert("RGBA")
    for s in sizes:
        img = base.resize((s, s), Image.Resampling.LANCZOS)
        img.save(out_dir / f"{prefix}-{s}.png", format="PNG", optimize=True)


def build_ico(png_path: Path, ico_path: Path, sizes: list[int]) -> None:
    try:
        from PIL import Image
    except Exception as e:  # pragma: no cover
        raise SystemExit(
            "Pillow is required to generate the .ico. Install it into your system Python:\n"
            "  python -m pip install pillow"
        ) from e

    base = Image.open(png_path).convert("RGBA")

    images: list[tuple[int, int, bytes]] = []
    for s in sizes:
        img = base.resize((s, s), Image.Resampling.LANCZOS)
        images.append((s, s, _dib_from_rgba(img)))

    # ICONDIR header.
    out = bytearray(struct.pack("<HHH", 0, 1, len(images)))

    # Reserve space for ICONDIRENTRY table (16 bytes each).
    dir_offset = len(out)
    out.extend(b"\x00" * (16 * len(images)))

    # Append image data and backfill directory entries.
    offsets_sizes: list[tuple[int, int, int, int]] = []
    for (w, h, payload) in images:
        offset = len(out)
        out.extend(payload)
        offsets_sizes.append((w, h, offset, len(payload)))

    for i, (w, h, offset, size) in enumerate(offsets_sizes):
        entry = struct.pack(
            "<BBBBHHII",
            0 if w >= 256 else w,  # bWidth
            0 if h >= 256 else h,  # bHeight
            0,  # bColorCount
            0,  # bReserved
            1,  # wPlanes
            32,  # wBitCount
            size,  # dwBytesInRes
            offset,  # dwImageOffset
        )
        out[dir_offset + i * 16 : dir_offset + (i + 1) * 16] = entry

    ico_path.parent.mkdir(parents=True, exist_ok=True)
    ico_path.write_bytes(out)


def build_ico_mixed(
    small_png: Path,
    large_png: Path,
    ico_path: Path,
    small_sizes: list[int],
    large_sizes: list[int],
) -> None:
    try:
        from PIL import Image
    except Exception as e:  # pragma: no cover
        raise SystemExit(
            "Pillow is required to generate the .ico. Install it into your system Python:\n"
            "  python -m pip install pillow"
        ) from e

    small_base = Image.open(small_png).convert("RGBA")
    large_base = Image.open(large_png).convert("RGBA")

    images: list[tuple[int, int, bytes]] = []
    for s in small_sizes:
        img = small_base.resize((s, s), Image.Resampling.LANCZOS)
        images.append((s, s, _dib_from_rgba(img)))
    for s in large_sizes:
        img = large_base.resize((s, s), Image.Resampling.LANCZOS)
        images.append((s, s, _dib_from_rgba(img)))

    out = bytearray(struct.pack("<HHH", 0, 1, len(images)))
    dir_offset = len(out)
    out.extend(b"\x00" * (16 * len(images)))

    offsets_sizes: list[tuple[int, int, int, int]] = []
    for (w, h, payload) in images:
        offset = len(out)
        out.extend(payload)
        offsets_sizes.append((w, h, offset, len(payload)))

    for i, (w, h, offset, size) in enumerate(offsets_sizes):
        entry = struct.pack(
            "<BBBBHHII",
            0 if w >= 256 else w,
            0 if h >= 256 else h,
            0,
            0,
            1,
            32,
            size,
            offset,
        )
        out[dir_offset + i * 16 : dir_offset + (i + 1) * 16] = entry

    ico_path.parent.mkdir(parents=True, exist_ok=True)
    ico_path.write_bytes(out)


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    clock_png = root / "assets" / "tokei-icon.png"
    wordmark_png = root / "assets" / "tokei-wordmark.png"

    app_ico = root / "assets" / "tokei.ico"
    shortcut_ico = root / "assets" / "tokei-shortcut.ico"

    # Debug outputs to visually validate which source image each size uses.
    # Safe to keep: under output/ which is gitignored.
    _debug_png(clock_png, root / "output" / "icon-sizes", [16, 24, 32, 48, 64], "clock")
    _debug_png(wordmark_png, root / "output" / "icon-sizes", [128, 256], "wordmark")

    build_ico_mixed(
        small_png=clock_png,
        large_png=wordmark_png,
        ico_path=app_ico,
        small_sizes=[16, 24, 32, 48, 64],
        large_sizes=[128, 256],
    )
    build_ico(clock_png, shortcut_ico, sizes=[16, 24, 32, 48, 64, 128, 256])

    print(f"Wrote {app_ico}")
    print(f"Wrote {shortcut_ico}")


if __name__ == "__main__":
    main()
