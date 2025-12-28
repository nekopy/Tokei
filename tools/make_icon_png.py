from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Box:
    left: int
    top: int
    right: int  # exclusive
    bottom: int  # exclusive

    @property
    def w(self) -> int:
        return self.right - self.left

    @property
    def h(self) -> int:
        return self.bottom - self.top

    @property
    def area(self) -> int:
        return self.w * self.h

    def pad(self, px: int, max_w: int, max_h: int) -> "Box":
        return Box(
            left=max(0, self.left - px),
            top=max(0, self.top - px),
            right=min(max_w, self.right + px),
            bottom=min(max_h, self.bottom + px),
        )

    def center(self) -> tuple[float, float]:
        return ((self.left + self.right) / 2.0, (self.top + self.bottom) / 2.0)


def _bg_rgb(img) -> tuple[int, int, int]:
    # Sample corners; pick the most common.
    w, h = img.size
    samples = [
        img.getpixel((0, 0)),
        img.getpixel((w - 1, 0)),
        img.getpixel((0, h - 1)),
        img.getpixel((w - 1, h - 1)),
    ]
    # RGB images; but be defensive.
    samples = [(int(r), int(g), int(b)) for (r, g, b) in samples]
    return max(set(samples), key=samples.count)


def _make_foreground_mask(img, threshold: int) -> list[list[bool]]:
    w, h = img.size
    bg = _bg_rgb(img)
    mask: list[list[bool]] = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            r, g, b = img.getpixel((x, y))
            d = abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2])
            if d >= threshold:
                mask[y][x] = True
    return mask


def _connected_components(mask: list[list[bool]]) -> list[Box]:
    h = len(mask)
    w = len(mask[0]) if h else 0
    seen = [[False] * w for _ in range(h)]
    boxes: list[Box] = []

    def neighbors(x: int, y: int):
        if x > 0:
            yield x - 1, y
        if x + 1 < w:
            yield x + 1, y
        if y > 0:
            yield x, y - 1
        if y + 1 < h:
            yield x, y + 1

    for y in range(h):
        for x in range(w):
            if not mask[y][x] or seen[y][x]:
                continue
            q = deque([(x, y)])
            seen[y][x] = True
            min_x = max_x = x
            min_y = max_y = y
            count = 0
            while q:
                cx, cy = q.popleft()
                count += 1
                if cx < min_x:
                    min_x = cx
                if cx > max_x:
                    max_x = cx
                if cy < min_y:
                    min_y = cy
                if cy > max_y:
                    max_y = cy
                for nx, ny in neighbors(cx, cy):
                    if mask[ny][nx] and not seen[ny][nx]:
                        seen[ny][nx] = True
                        q.append((nx, ny))

            # Filter tiny specks.
            if count < 200:
                continue
            boxes.append(Box(min_x, min_y, max_x + 1, max_y + 1))
    return boxes


def _pick_clock_box(boxes: list[Box], img_w: int, img_h: int) -> Box:
    cx, cy = img_w / 2.0, img_h / 2.0

    def score(b: Box) -> tuple[float, float, float]:
        bx, by = b.center()
        dist2 = (bx - cx) ** 2 + (by - cy) ** 2
        aspect = b.w / max(1.0, float(b.h))
        aspect_penalty = abs(aspect - 1.0)
        size = b.area
        # Prefer: near center, square-ish, and large.
        return (dist2, aspect_penalty, -size)

    return sorted(boxes, key=score)[0]


def build_icon_png(src_png: Path, out_png: Path) -> None:
    from PIL import Image

    src = Image.open(src_png).convert("RGB")
    w, h = src.size

    # Prefer using the clock hands' teal color as an anchor; it's unique in the logo.
    teal_pts: list[tuple[int, int]] = []
    for y in range(h):
        for x in range(w):
            r, g, b = src.getpixel((x, y))
            if r < 170 and g > 120 and b > 120 and (g - r) > 20 and (b - r) > 20 and abs(g - b) < 90:
                teal_pts.append((x, y))

    if teal_pts:
        ref_x = sum(x for x, _ in teal_pts) / len(teal_pts)
        ref_y = sum(y for _, y in teal_pts) / len(teal_pts)
    else:
        ref_x, ref_y = w / 2.0, h / 2.0

    bg = _bg_rgb(src)

    def is_teal(r: int, g: int, b: int) -> bool:
        return r < 170 and g > 120 and b > 120 and (g - r) > 20 and (b - r) > 20 and abs(g - b) < 90

    def is_bg(r: int, g: int, b: int) -> bool:
        d = abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2])
        return d < 45

    def is_ring_fg(r: int, g: int, b: int) -> bool:
        if is_bg(r, g, b):
            return False
        if is_teal(r, g, b):
            return False
        # Prefer darker pixels for ring detection.
        return (r + g + b) / 3.0 < 200

    # If we have teal, estimate the clock ring radius by scanning outward from the hand center.
    crop_box: Box | None = None
    if teal_pts:
        cx = int(round(ref_x))
        cy = int(round(ref_y))
        dirs = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)]
        radii: list[int] = []
        for dx, dy in dirs:
            seen_fg = False
            last_fg = None
            for step in range(2, 900):
                x = cx + dx * step
                y = cy + dy * step
                if x < 0 or x >= w or y < 0 or y >= h:
                    break
                r, g, b = src.getpixel((x, y))
                fg = is_ring_fg(r, g, b)
                if not seen_fg:
                    if fg:
                        seen_fg = True
                        last_fg = step
                else:
                    if fg:
                        last_fg = step
                    else:
                        # Exited the ring segment.
                        if last_fg is not None:
                            radii.append(last_fg)
                        break

        if len(radii) >= 4:
            radii.sort()
            r_med = radii[len(radii) // 2]
            radius = int(round(r_med * 1.35))
            side = radius * 2
            left = cx - side // 2
            top = cy - side // 2
            crop_box = Box(left, top, left + side, top + side).pad(0, w, h)

    # Fallback: pick a centered, square-ish component.
    if crop_box is None:
        mask = _make_foreground_mask(src, threshold=45)
        boxes = _connected_components(mask)
        if not boxes:
            raise SystemExit("Could not find any foreground components in the logo image.")
        clock = _pick_clock_box(boxes, w, h)
        pad = int(round(max(clock.w, clock.h) * 0.08))
        crop_box = clock.pad(pad, w, h)

    cropped = src.crop((crop_box.left, crop_box.top, crop_box.right, crop_box.bottom)).convert("RGBA")

    # Make the background transparent based on the original background color.
    px = cropped.load()
    for y in range(cropped.size[1]):
        for x in range(cropped.size[0]):
            r, g, b, a = px[x, y]
            d = abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2])
            if d < 45:
                px[x, y] = (r, g, b, 0)

    # Tighten crop around remaining non-transparent pixels (i.e., clock ring + hands).
    # This helps maximize crispness at small icon sizes.
    alpha = cropped.split()[-1]
    bb = alpha.getbbox()
    if bb:
        cropped = cropped.crop(bb)

    # Place on a square canvas and scale to fill most of it.
    target = 1024
    canvas = Image.new("RGBA", (target, target), (0, 0, 0, 0))
    max_dim = max(cropped.size)
    scale = int(round(target * 0.88))
    new_w = max(1, int(round(cropped.size[0] * (scale / max_dim))))
    new_h = max(1, int(round(cropped.size[1] * (scale / max_dim))))
    resized = cropped.resize((new_w, new_h), Image.Resampling.LANCZOS)
    ox = (target - new_w) // 2
    oy = (target - new_h) // 2
    canvas.alpha_composite(resized, (ox, oy))

    out_png.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out_png, format="PNG", optimize=True)


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    build_icon_png(root / "tokeilogo.png", root / "assets" / "tokei-icon.png")
    print("Wrote assets/tokei-icon.png")


if __name__ == "__main__":
    main()
