#!/usr/bin/env python3
"""Generate a deterministic, rights-safe Kapadokya-style relief benchmark case.

The asset is intentionally a synthetic engineering fixture, not a final retail
artwork. It provides aligned colour, alpha, semantic IDs, vector text, UV masks,
and a manually authored 16-bit relief map on one pixel canvas.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import binary_dilation, binary_erosion, gaussian_filter

CANVAS = 2048
SEED_VERSION = "1.0.0"

LAYER_COLORS = {
    0: (0, 0, 0),
    1: (85, 150, 215),
    2: (110, 130, 145),
    3: (196, 150, 92),
    4: (118, 88, 55),
    5: (220, 96, 55),
    6: (47, 92, 68),
    7: (78, 54, 38),
    8: (236, 204, 145),
    9: (209, 172, 112),
}


def mask_from_draw(draw_fn) -> Image.Image:
    image = Image.new("L", (CANVAS, CANVAS), 0)
    draw = ImageDraw.Draw(image)
    draw_fn(draw)
    return image


def array_mask(image: Image.Image) -> np.ndarray:
    return np.asarray(image, dtype=np.float32) / 255.0


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size=size)
    return ImageFont.load_default()


def draw_vertical_gradient(
    base: Image.Image,
    mask: Image.Image,
    top: tuple[int, int, int],
    bottom: tuple[int, int, int],
) -> None:
    y = np.linspace(0.0, 1.0, CANVAS, dtype=np.float32)[:, None, None]
    top_a = np.asarray(top, dtype=np.float32)[None, None, :]
    bottom_a = np.asarray(bottom, dtype=np.float32)[None, None, :]
    rgb = np.repeat(top_a * (1.0 - y) + bottom_a * y, CANVAS, axis=1).astype(np.uint8)
    layer = Image.fromarray(rgb).convert("RGBA")
    layer.putalpha(mask)
    base.alpha_composite(layer)


def add_layer(
    base: Image.Image,
    semantic: np.ndarray,
    relief: np.ndarray,
    layer_mask: Image.Image,
    layer_id: int,
    colour: tuple[int, int, int] | None,
    relief_level: float,
    bevel_sigma: float,
) -> None:
    mask = array_mask(layer_mask)
    if colour is not None:
        rgba = Image.new("RGBA", (CANVAS, CANVAS), (*colour, 255))
        rgba.putalpha(layer_mask)
        base.alpha_composite(rgba)

    semantic[mask > 0.5] = layer_id
    softened = gaussian_filter(mask, sigma=bevel_sigma, mode="nearest") if bevel_sigma > 0 else mask
    softened = np.clip(softened, 0.0, 1.0)
    relief[:] = np.maximum(relief, relief_level * softened)


def rounded_rect_mask(box: tuple[int, int, int, int], radius: int) -> Image.Image:
    return mask_from_draw(lambda draw: draw.rounded_rectangle(box, radius=radius, fill=255))


def polygon_mask(points: list[tuple[int, int]]) -> Image.Image:
    return mask_from_draw(lambda draw: draw.polygon(points, fill=255))


def balloon_mask(cx: int, cy: int, rx: int, ry: int) -> Image.Image:
    def draw(drawer: ImageDraw.ImageDraw) -> None:
        drawer.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=255)
        drawer.polygon(
            [
                (cx - 15, cy + ry - 6),
                (cx + 15, cy + ry - 6),
                (cx + 8, cy + ry + 38),
                (cx - 8, cy + ry + 38),
            ],
            fill=255,
        )

    return mask_from_draw(draw)


def chimney_mask(cx: int, base_y: int, width: int, height: int, cap: int = 80) -> Image.Image:
    half = width // 2
    top_y = base_y - height

    def draw(drawer: ImageDraw.ImageDraw) -> None:
        drawer.polygon(
            [
                (cx - half, base_y),
                (cx - int(half * 0.66), top_y + cap),
                (cx, top_y),
                (cx + int(half * 0.66), top_y + cap),
                (cx + half, base_y),
            ],
            fill=255,
        )

    return mask_from_draw(draw)


def save_u16(array: np.ndarray, path: Path) -> None:
    Image.fromarray(np.round(np.clip(array, 0.0, 1.0) * 65535.0).astype(np.uint16)).save(path)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def generate(out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)

    outer_points = [
        (210, 1510), (180, 1180), (230, 830), (315, 650), (390, 520),
        (495, 555), (575, 360), (690, 470), (795, 245), (900, 405),
        (1010, 230), (1120, 405), (1250, 310), (1350, 500), (1500, 390),
        (1585, 620), (1740, 590), (1820, 850), (1875, 1130), (1840, 1510),
        (1740, 1725), (1460, 1840), (1025, 1880), (570, 1840), (310, 1730),
    ]
    outer = polygon_mask(outer_points)
    outer_arr = np.asarray(outer, dtype=np.uint8) > 0
    outer_arr = binary_dilation(outer_arr, iterations=18)
    outer_arr = binary_erosion(outer_arr, iterations=18)
    outer = Image.fromarray((outer_arr * 255).astype(np.uint8))

    artwork = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    semantic = np.zeros((CANVAS, CANVAS), dtype=np.uint8)
    relief = np.zeros((CANVAS, CANVAS), dtype=np.float32)

    draw_vertical_gradient(artwork, outer, (106, 180, 228), (225, 206, 157))
    semantic[outer_arr] = 1
    vertical = np.linspace(0.11, 0.07, CANVAS, dtype=np.float32)[:, None]
    relief = np.maximum(relief, vertical * outer_arr)

    distant = polygon_mask([
        (210, 1100), (520, 860), (760, 1000), (1010, 790), (1280, 980),
        (1530, 835), (1840, 1090), (1840, 1600), (210, 1600),
    ])
    distant = Image.composite(distant, Image.new("L", distant.size, 0), outer)
    add_layer(artwork, semantic, relief, distant, 2, (139, 126, 104), 0.24, 18)

    vegetation = mask_from_draw(
        lambda draw: draw.polygon(
            [
                (220, 1350), (470, 1210), (770, 1330), (1050, 1180),
                (1350, 1315), (1810, 1170), (1840, 1660), (230, 1690),
            ],
            fill=255,
        )
    )
    vegetation = Image.composite(vegetation, Image.new("L", vegetation.size, 0), outer)
    add_layer(artwork, semantic, relief, vegetation, 6, (61, 111, 72), 0.37, 14)

    mid_specs = [
        (420, 1370, 230, 610),
        (720, 1325, 250, 760),
        (1160, 1340, 225, 650),
        (1490, 1340, 245, 720),
        (1690, 1410, 175, 500),
    ]
    for cx, base_y, width, height in mid_specs:
        layer_mask = chimney_mask(cx, base_y, width, height)
        layer_mask = Image.composite(layer_mask, Image.new("L", layer_mask.size, 0), outer)
        add_layer(artwork, semantic, relief, layer_mask, 3, (190, 144, 91), 0.48, 12)
        detail = ImageDraw.Draw(artwork)
        for offset in (-35, 20):
            detail.rounded_rectangle(
                (
                    cx + offset - 13,
                    base_y - int(height * 0.45),
                    cx + offset + 13,
                    base_y - int(height * 0.45) + 50,
                ),
                radius=8,
                fill=(68, 56, 48, 255),
            )

    front_specs = [
        (565, 1540, 330, 960),
        (980, 1530, 380, 1120),
        (1390, 1540, 330, 930),
    ]
    for cx, base_y, width, height in front_specs:
        layer_mask = chimney_mask(cx, base_y, width, height, cap=105)
        layer_mask = Image.composite(layer_mask, Image.new("L", layer_mask.size, 0), outer)
        add_layer(artwork, semantic, relief, layer_mask, 4, (177, 126, 75), 0.67, 11)
        detail = ImageDraw.Draw(artwork)
        for row in range(3):
            yy = base_y - int(height * (0.28 + 0.16 * row))
            for xx in (cx - 42, cx + 42):
                detail.rounded_rectangle(
                    (xx - 17, yy - 8, xx + 17, yy + 48),
                    radius=9,
                    fill=(55, 48, 43, 255),
                )

    balloons = [
        (520, 455, 95, 135, (215, 89, 54)),
        (865, 360, 110, 155, (229, 152, 50)),
        (1220, 470, 82, 120, (54, 109, 154)),
        (1510, 380, 120, 170, (205, 75, 57)),
        (1670, 620, 60, 88, (229, 158, 63)),
    ]
    for cx, cy, rx, ry, colour in balloons:
        layer_mask = balloon_mask(cx, cy, rx, ry)
        layer_mask = Image.composite(layer_mask, Image.new("L", layer_mask.size, 0), outer)
        add_layer(artwork, semantic, relief, layer_mask, 5, colour, 0.79, 8)
        stripes = ImageDraw.Draw(artwork)
        for dx in (-int(rx * 0.45), 0, int(rx * 0.45)):
            stripes.line(
                (cx + dx, cy - ry + 14, cx + int(dx * 0.35), cy + ry - 8),
                fill=(245, 205, 91, 255),
                width=max(10, rx // 8),
            )

    banner = rounded_rect_mask((260, 1465, 1790, 1785), 95)
    banner = Image.composite(banner, Image.new("L", banner.size, 0), outer)
    add_layer(artwork, semantic, relief, banner, 7, (63, 55, 45), 0.84, 14)

    text_mask = Image.new("L", (CANVAS, CANVAS), 0)
    text_draw = ImageDraw.Draw(text_mask)
    label_font = font(245)
    label = "KAPADOKYA"
    bbox = text_draw.textbbox((0, 0), label, font=label_font, stroke_width=4)
    text_x = (CANVAS - (bbox[2] - bbox[0])) // 2
    text_y = 1485
    text_draw.text(
        (text_x, text_y),
        label,
        font=label_font,
        fill=255,
        stroke_width=4,
        stroke_fill=255,
    )
    text_mask = Image.composite(text_mask, Image.new("L", text_mask.size, 0), banner)
    add_layer(artwork, semantic, relief, text_mask, 8, (232, 199, 135), 1.0, 4)

    border_arr = outer_arr & ~binary_erosion(outer_arr, iterations=28)
    border = Image.fromarray((border_arr * 255).astype(np.uint8))
    add_layer(artwork, semantic, relief, border, 9, (211, 173, 111), 0.91, 5)

    artwork.putalpha(outer)
    uv_print = artwork.copy()
    white_mask = outer.copy()
    varnish_arr = ((np.asarray(text_mask) > 0) | (semantic == 5) | border_arr).astype(np.uint8) * 255
    varnish_mask = Image.fromarray(varnish_arr)

    relief = np.clip(relief, 0.0, 1.0) * outer_arr
    semantic[~outer_arr] = 0

    semantic_rgb = np.zeros((CANVAS, CANVAS, 3), dtype=np.uint8)
    for layer_id, colour in LAYER_COLORS.items():
        semantic_rgb[semantic == layer_id] = colour

    artifacts = {
        "front-master.png": artwork,
        "uv-print.png": uv_print,
        "alpha-mask.png": outer,
        "foreground-mask.png": Image.fromarray(((semantic >= 4) & outer_arr).astype(np.uint8) * 255),
        "semantic-layers.png": Image.fromarray(semantic_rgb),
        "white-mask.png": white_mask,
        "varnish-mask.png": varnish_mask,
    }
    for name, image in artifacts.items():
        image.save(out_dir / name)
    save_u16(relief, out_dir / "manual-relief-map-16.png")

    contour_points = " ".join(f"{x},{y}" for x, y in outer_points)
    (out_dir / "contour.svg").write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{CANVAS}" height="{CANVAS}" '
        f'viewBox="0 0 {CANVAS} {CANVAS}">'
        f'<polygon points="{contour_points}" fill="none" stroke="black" stroke-width="4"/>'
        '</svg>\n',
        encoding="utf-8",
    )
    (out_dir / "text-logo.svg").write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{CANVAS}" height="{CANVAS}" '
        f'viewBox="0 0 {CANVAS} {CANVAS}">'
        '<text x="1024" y="1695" text-anchor="middle" '
        'font-family="DejaVu Sans, sans-serif" font-size="245" font-weight="700" '
        'fill="black">KAPADOKYA</text></svg>\n',
        encoding="utf-8",
    )

    metadata = {
        "fixture": "kapadokya-synthetic-golden",
        "fixture_version": SEED_VERSION,
        "canvas_px": [CANVAS, CANVAS],
        "colour_space": "sRGB",
        "rights": "Renderhane synthetic internal benchmark fixture",
        "not_final_retail_artwork": True,
        "layer_ids": {str(key): list(value) for key, value in LAYER_COLORS.items()},
        "artifacts": {},
    }
    for path in sorted(out_dir.iterdir()):
        if path.name == "metadata.json":
            continue
        metadata["artifacts"][path.name] = {
            "sha256": sha256(path),
            "bytes": path.stat().st_size,
        }
    (out_dir / "metadata.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", type=Path, required=True)
    args = parser.parse_args()
    generate(args.out_dir)


if __name__ == "__main__":
    main()
