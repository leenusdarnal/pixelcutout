#!/usr/bin/env python3
"""Generate a deterministic, project-authored synthetic matting benchmark.

All pixels are drawn procedurally by this file. No network access or external
images are used. Outputs are local-only and must never be committed or deployed.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
from pathlib import Path
from typing import Callable

from PIL import Image, ImageDraw, ImageFilter

SIZE = 512
SUPERSAMPLE = 3
VERSION = "1.0.0"

CASES = [
    ("B01", "Portrait / straight hair", "Head-and-shoulders silhouette with loose hair strands"),
    ("B02", "Portrait / curls", "Curly hair, flyaways, and a soft shoulder outline"),
    ("B03", "Person / clothing gaps", "Full-body figure with straps and real negative spaces"),
    ("B04", "Animal / long fur", "Long-haired dog-like silhouette with irregular fur edges"),
    ("B05", "Animal / low contrast", "Dark cat-like silhouette against a similarly dark scene"),
    ("B06", "Animal / pale fur", "Light rabbit-like subject against a bright patterned scene"),
    ("B07", "Product / cast shadow", "Boxed product; cast shadow belongs to the background"),
    ("B08", "Object / low contrast", "Dark mug with a handle opening"),
    ("B09", "Transparent object", "Glass bottle represented with a soft-opacity ground truth"),
    ("B10", "Thin structure", "Scissors with narrow blades and handle openings"),
    ("B11", "Plant / fine edges", "Overlapping leaves, veins, and thin stems"),
    ("B12", "Wire / mesh", "Open wire basket with thin crossing structures"),
    ("B13", "Fine material", "Lace panel with open weave and small holes"),
    ("B14", "Natural detail", "Feather with delicate barbs and a fine central shaft"),
    ("B15", "Camouflage / low contrast", "Leaf-shaped subject with texture close to its background"),
    ("B16", "Occlusion / clutter", "Overlapping fruit shapes against a busy scene"),
]

BACKGROUNDS = [
    (65, 86, 112), (104, 83, 105), (116, 104, 82), (65, 93, 82),
    (30, 38, 49), (213, 218, 213), (232, 226, 210), (43, 49, 54),
    (45, 83, 94), (113, 101, 87), (74, 95, 75), (83, 96, 111),
    (150, 133, 145), (93, 108, 91), (73, 91, 61), (125, 92, 76),
]
FOREGROUNDS = [
    (173, 116, 91), (135, 89, 65), (57, 89, 142), (177, 137, 95),
    (37, 42, 48), (232, 229, 211), (176, 131, 79), (38, 42, 45),
    (128, 183, 193), (180, 174, 160), (58, 116, 69), (154, 164, 171),
    (189, 157, 181), (164, 129, 74), (82, 103, 55), (196, 83, 63),
]


def _s(value: float) -> int:
    return round(value * SUPERSAMPLE)


def _ellipse(draw: ImageDraw.ImageDraw, box: tuple[float, float, float, float], fill: int = 255) -> None:
    draw.ellipse(tuple(_s(v) for v in box), fill=fill)


def _polygon(draw: ImageDraw.ImageDraw, points: list[tuple[float, float]], fill: int = 255) -> None:
    draw.polygon([(_s(x), _s(y)) for x, y in points], fill=fill)


def _line(draw: ImageDraw.ImageDraw, points: list[tuple[float, float]], width: float = 5, fill: int = 255) -> None:
    draw.line([(_s(x), _s(y)) for x, y in points], fill=fill, width=max(1, _s(width)), joint="curve")


def _leaf(draw: ImageDraw.ImageDraw, cx: float, cy: float, rx: float, ry: float, angle: float, fill: int = 255) -> None:
    points = []
    for t, side in [(-1, 0), (-0.55, 0.72), (0, 1), (0.55, 0.72), (1, 0),
                    (0.55, -0.72), (0, -1), (-0.55, -0.72)]:
        u, v = t * rx, side * ry
        x = cx + u * math.cos(angle) - v * math.sin(angle)
        y = cy + u * math.sin(angle) + v * math.cos(angle)
        points.append((x, y))
    _polygon(draw, points, fill)


def _draw_mask(case_id: str) -> Image.Image:
    canvas = Image.new("L", (SIZE * SUPERSAMPLE, SIZE * SUPERSAMPLE), 0)
    d = ImageDraw.Draw(canvas)
    rng = random.Random(int(case_id[1:]))

    if case_id == "B01":
        _ellipse(d, (151, 54, 357, 330))
        _ellipse(d, (202, 95, 322, 250))
        _polygon(d, [(222, 220), (296, 220), (316, 306), (211, 306)])
        _polygon(d, [(146, 512), (170, 369), (218, 305), (306, 305), (363, 374), (391, 512)])
        for x in range(165, 345, 18):
            _line(d, [(x, 102), (x + rng.randint(-26, 18), 212), (x + rng.randint(-34, 20), 330)], 5)
    elif case_id == "B02":
        _ellipse(d, (166, 112, 344, 338))
        _ellipse(d, (142, 62, 369, 267))
        _polygon(d, [(130, 512), (165, 365), (217, 320), (304, 320), (365, 382), (398, 512)])
        for _ in range(54):
            angle = rng.random() * math.tau
            radius = rng.uniform(93, 128)
            x, y = 254 + math.cos(angle) * radius, 173 + math.sin(angle) * radius * 0.78
            _ellipse(d, (x - 18, y - 17, x + 18, y + 17))
        for _ in range(12):
            x = rng.randint(165, 345)
            _line(d, [(x, 90), (x + rng.randint(-45, 45), 42), (x + rng.randint(-60, 50), 20)], 3)
    elif case_id == "B03":
        _ellipse(d, (220, 37, 294, 111))
        _polygon(d, [(203, 113), (310, 113), (339, 263), (321, 337), (190, 337), (174, 251)])
        _polygon(d, [(201, 132), (170, 150), (128, 279), (145, 294), (181, 229), (223, 165)])
        _polygon(d, [(309, 132), (342, 151), (378, 274), (358, 289), (323, 227), (286, 166)])
        _polygon(d, [(194, 324), (249, 325), (237, 504), (192, 504), (175, 390)])
        _polygon(d, [(258, 325), (318, 324), (341, 390), (323, 504), (280, 504)])
        _line(d, [(207, 130), (244, 212), (291, 132)], 9)
        _ellipse(d, (237, 305, 265, 331), 0)
    elif case_id == "B04":
        _ellipse(d, (96, 190, 374, 373))
        _ellipse(d, (299, 122, 425, 259))
        _polygon(d, [(315, 146), (302, 70), (351, 125)])
        _polygon(d, [(374, 137), (411, 77), (410, 165)])
        _line(d, [(124, 272), (59, 231), (49, 184)], 19)
        for x in (145, 205, 294, 341):
            _line(d, [(x, 326), (x - 9, 424), (x + 5, 465)], 25)
        for _ in range(85):
            x = rng.randint(105, 375)
            y = rng.randint(195, 358)
            _ellipse(d, (x - 8, y - 7, x + 8, y + 7))
    elif case_id == "B05":
        _ellipse(d, (93, 210, 360, 374))
        _ellipse(d, (294, 135, 411, 257))
        _polygon(d, [(305, 166), (309, 91), (352, 148)])
        _polygon(d, [(368, 146), (405, 95), (397, 177)])
        _line(d, [(116, 285), (65, 260), (47, 213), (56, 176)], 14)
        for x in (146, 224, 319, 365):
            _line(d, [(x, 331), (x - 5, 418), (x + 4, 453)], 21)
        _ellipse(d, (171, 252, 195, 275), 0)
    elif case_id == "B06":
        _ellipse(d, (105, 210, 355, 384))
        _ellipse(d, (276, 133, 392, 263))
        _polygon(d, [(293, 155), (279, 25), (326, 137)])
        _polygon(d, [(349, 142), (385, 44), (377, 179)])
        _ellipse(d, (130, 351, 208, 415))
        _ellipse(d, (255, 347, 337, 417))
    elif case_id == "B07":
        _polygon(d, [(139, 145), (326, 145), (365, 181), (365, 412), (139, 412)])
        _polygon(d, [(139, 145), (195, 95), (378, 95), (326, 145)])
        _polygon(d, [(326, 145), (378, 95), (378, 355), (365, 412)])
        _polygon(d, [(196, 95), (205, 55), (305, 55), (315, 95)])
        _ellipse(d, (205, 47, 315, 70))
    elif case_id == "B08":
        _polygon(d, [(143, 172), (353, 172), (335, 391), (166, 391)])
        _ellipse(d, (143, 145, 353, 205))
        _ellipse(d, (299, 191, 423, 335))
        _ellipse(d, (326, 218, 395, 306), 0)
        _ellipse(d, (162, 365, 337, 410))
    elif case_id == "B09":
        _polygon(d, [(199, 122), (310, 122), (325, 369), (295, 411), (215, 411), (185, 369)])
        _polygon(d, [(222, 60), (286, 60), (294, 137), (214, 137)])
        _ellipse(d, (211, 45, 297, 77))
        _ellipse(d, (190, 131, 320, 177))
    elif case_id == "B10":
        _ellipse(d, (92, 275, 218, 407))
        _ellipse(d, (294, 275, 420, 407))
        _ellipse(d, (121, 304, 190, 378), 0)
        _ellipse(d, (323, 304, 392, 378), 0)
        _polygon(d, [(186, 308), (220, 286), (404, 80), (423, 92), (255, 337)])
        _polygon(d, [(326, 308), (292, 286), (108, 80), (89, 92), (257, 337)])
    elif case_id == "B11":
        _line(d, [(248, 496), (252, 342), (233, 221), (268, 75)], 11)
        _line(d, [(250, 365), (164, 250), (100, 190)], 7)
        _line(d, [(243, 304), (333, 220), (403, 175)], 7)
        _line(d, [(253, 414), (342, 354), (390, 294)], 7)
        for args in [(157, 192, 74, 31, -2.4), (204, 250, 79, 32, 0.3),
                     (336, 213, 80, 34, -0.65), (387, 170, 72, 29, 0.35),
                     (344, 352, 80, 32, -0.55), (176, 348, 73, 31, 2.7),
                     (282, 120, 66, 28, -1.1), (106, 293, 62, 26, 0.5)]:
            _leaf(d, *args)
    elif case_id == "B12":
        _polygon(d, [(91, 163), (421, 163), (378, 423), (130, 423)])
        _line(d, [(91, 163), (421, 163)], 13)
        _line(d, [(130, 423), (378, 423)], 12)
        for x in range(120, 410, 35):
            _line(d, [(x, 170), (x + 17, 418)], 5)
        for y in range(205, 405, 35):
            _line(d, [(100, y), (397 - (y - 205) * 0.1, y)], 5)
        for x in range(132, 392, 52):
            _line(d, [(x, 180), (x - 20, 400)], 4)
    elif case_id == "B13":
        _polygon(d, [(90, 90), (422, 90), (422, 428), (90, 428)])
        for x in range(112, 420, 39):
            _line(d, [(x, 90), (x + 10, 428)], 7)
        for y in range(110, 430, 38):
            _line(d, [(90, y), (422, y + 8)], 7)
        for x in range(130, 410, 56):
            for y in range(125, 420, 56):
                _ellipse(d, (x - 15, y - 15, x + 15, y + 15), 0)
                _ellipse(d, (x - 5, y - 5, x + 5, y + 5), 255)
        for y in range(145, 400, 85):
            _ellipse(d, (224, y - 23, 287, y + 40))
    elif case_id == "B14":
        _polygon(d, [(246, 49), (284, 54), (333, 229), (284, 400), (232, 495), (220, 408), (168, 230)])
        _line(d, [(246, 48), (251, 270), (231, 496)], 7)
        for y in range(105, 355, 13):
            offset = (y - 230) * 0.42
            _line(d, [(250, y), (250 - offset, y - 13), (220 - offset, y + 13)], 4)
            _line(d, [(253, y), (253 + offset, y - 13), (286 + offset, y + 13)], 4)
    elif case_id == "B15":
        _leaf(d, 260, 260, 210, 126, -0.3)
        _line(d, [(80, 330), (244, 257), (442, 173)], 8)
        for i in range(22):
            x = rng.randint(105, 405)
            y = rng.randint(180, 335)
            _ellipse(d, (x - 7, y - 4, x + 7, y + 4), 0)
    elif case_id == "B16":
        _ellipse(d, (91, 179, 285, 385))
        _ellipse(d, (218, 136, 405, 348))
        _polygon(d, [(167, 187), (183, 133), (218, 184)])
        _polygon(d, [(314, 148), (338, 91), (352, 155)])
        _ellipse(d, (159, 85, 239, 193))
        _polygon(d, [(93, 320), (199, 286), (256, 392), (211, 447), (98, 423)])
    return canvas.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def _texture(base: tuple[int, int, int], seed: int) -> Image.Image:
    image = Image.new("RGB", (SIZE, SIZE))
    pixels = image.load()
    phase = seed * 0.71
    for y in range(SIZE):
        vertical = (y / SIZE - 0.5) * 26
        for x in range(SIZE):
            wave = math.sin(x * 0.035 + phase) * 5 + math.sin((x + y) * 0.018 + phase) * 4
            grain = ((x * 37 + y * 19 + seed * 101) % 17) - 8
            shade = vertical + wave + grain * 0.42
            pixels[x, y] = tuple(max(0, min(255, int(channel + shade))) for channel in base)
    return image


def _background(index: int) -> Image.Image:
    bg = _texture(BACKGROUNDS[index], index + 11)
    d = ImageDraw.Draw(bg)
    if index % 4 == 0:
        for x in range(0, SIZE, 34):
            d.line((x, 0, x + 70, SIZE), fill=tuple(max(0, c - 13) for c in BACKGROUNDS[index]), width=2)
    elif index % 4 == 1:
        for x in range(12, SIZE, 42):
            for y in range(18, SIZE, 42):
                d.ellipse((x, y, x + 13, y + 13), outline=tuple(min(255, c + 20) for c in BACKGROUNDS[index]), width=2)
    elif index % 4 == 2:
        for y in range(24, SIZE, 36):
            d.line((0, y, SIZE, y - 22), fill=tuple(max(0, c - 12) for c in BACKGROUNDS[index]), width=2)
    else:
        for x in range(0, SIZE, 48):
            d.line((x, 0, x, SIZE), fill=tuple(min(255, c + 14) for c in BACKGROUNDS[index]), width=1)
        for y in range(0, SIZE, 48):
            d.line((0, y, SIZE, y), fill=tuple(min(255, c + 14) for c in BACKGROUNDS[index]), width=1)
    if index == 6:
        shadow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        ImageDraw.Draw(shadow).ellipse((135, 365, 393, 448), fill=(57, 51, 44, 105))
        bg = Image.alpha_composite(bg.convert("RGBA"), shadow.filter(ImageFilter.GaussianBlur(17))).convert("RGB")
    return bg


def _subject_detail(image: Image.Image, index: int) -> None:
    d = ImageDraw.Draw(image)
    color = tuple(max(0, c - 34) for c in FOREGROUNDS[index])
    light = tuple(min(255, c + 38) for c in FOREGROUNDS[index])
    if index in (0, 1):
        d.ellipse((245, 157, 253, 165), fill=color)
        d.line((260, 190, 283, 195), fill=color, width=3)
        for y in range(108, 310, 22):
            d.arc((160, y, 348, y + 75), 185, 330, fill=light, width=2)
    elif index in (3, 4, 5):
        d.ellipse((348, 183, 360, 195), fill=light)
        d.ellipse((379, 185, 391, 197), fill=light)
        d.ellipse((364, 203, 376, 214), fill=color)
        for y in range(230, 340, 17):
            d.arc((113, y, 360, y + 58), 190, 340, fill=light, width=2)
    elif index in (6, 7, 8):
        d.rounded_rectangle((205, 210, 302, 330), radius=8, outline=light, width=5)
        d.line((218, 252, 290, 252), fill=color, width=4)
        d.line((222, 268, 285, 268), fill=color, width=3)
        d.line((230, 140, 310, 140), fill=light, width=3)
    elif index in (10, 14):
        for x, y in [(160, 194), (204, 242), (335, 213), (380, 174), (344, 350), (176, 346)]:
            d.line((x - 20, y, x + 25, y - 8), fill=light, width=3)
    elif index in (11, 12, 13):
        for y in range(120, 380, 38):
            d.line((150, y, 365, y + 18), fill=light, width=2)
    else:
        d.ellipse((180, 230, 200, 250), fill=light)
        d.line((210, 275, 300, 275), fill=color, width=5)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def generate(output: Path) -> dict:
    image_dir, mask_dir = output / "images", output / "masks"
    image_dir.mkdir(parents=True, exist_ok=True)
    mask_dir.mkdir(parents=True, exist_ok=True)
    records = []

    for index, (case_id, category, challenge) in enumerate(CASES):
        alpha = _draw_mask(case_id)
        if case_id == "B09":
            # The glass case intentionally represents partial foreground opacity.
            alpha = alpha.point(lambda value: round(value * 0.48))
        foreground = _texture(FOREGROUNDS[index], index + 31)
        _subject_detail(foreground, index)
        source = Image.composite(foreground, _background(index), alpha)

        image_name = f"{case_id.lower()}.png"
        mask_name = f"{case_id.lower()}-alpha.png"
        image_path, mask_path = image_dir / image_name, mask_dir / mask_name
        source.save(image_path, format="PNG", optimize=False)
        alpha.save(mask_path, format="PNG", optimize=False)

        records.append({
            "id": case_id,
            "category": category,
            "challenge": challenge,
            "filename": image_name,
            "annotation_filename": mask_name,
            "annotation_type": "alpha",
            "width": SIZE,
            "height": SIZE,
            "annotation_width": SIZE,
            "annotation_height": SIZE,
            "sha256": _sha256(image_path),
            "annotation_sha256": _sha256(mask_path),
            "origin": "project-authored-procedural",
            "rights_status": "project-owned",
            "external_image_inputs": [],
            "notes": "Synthetic illustration; exact generated alpha matte. Not a photorealistic quality fixture."
        })

    manifest = {
        "schema_version": 1,
        "generator": "PixelCutout synthetic benchmark generator",
        "generator_version": VERSION,
        "image_size": [SIZE, SIZE],
        "rights_notice": "All pixels are procedurally drawn by this repository's generator; no third-party images or datasets are used.",
        "intended_use": "Pipeline validation and controlled synthetic edge/regression tests only; not a substitute for real-photo model evaluation.",
        "cases": records,
    }
    output.mkdir(parents=True, exist_ok=True)
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("benchmarks/results/synthetic-v1"))
    args = parser.parse_args()
    manifest = generate(args.output)
    print(f"Generated {len(manifest['cases'])} project-authored RGB/alpha pairs at {args.output}")
    print("Rights status: project-owned; synthetic-only results must not be presented as real-photo quality scores.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
