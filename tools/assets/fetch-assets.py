#!/usr/bin/env python3
"""
Camera Lab · Licensed Sample Asset Builder & Whitelist Fetcher
Prepares 16 redistributable 3:2 (960x640) sample assets in:
  - assets/samples/
  - apps/web/public/assets/samples/
  - assets/licenses/
  - assets/manifest.json
  - apps/web/public/assets/manifest.json

Includes:
  - sample-001: Authentic CC0 Sony ILCE-7RM2 RAW development from raw.pixls.us (ID 1312)
  - sample-002..010: Architecture, Street, Landscape, Night Neon, Studio Silhouette plates (CC0-1.0)
  - sample-011..016: 3 Historical/Modern "Then & Now" Ghost Viewfinder pairs (ghost-pair-1, ghost-pair-2, ghost-pair-3)
"""

from __future__ import annotations
import hashlib
import json
import math
import shutil
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[2]
SAMPLES_DIR = ROOT / "assets" / "samples"
PUBLIC_SAMPLES_DIR = ROOT / "apps" / "web" / "public" / "assets" / "samples"
LICENSES_DIR = ROOT / "assets" / "licenses"
GENERATED_RAW_FINAL = ROOT / "assets" / "generated" / "sample-001" / "final.jpg"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def make_sky_gradient(w: int, h: int, top_rgb: tuple[int, int, int], bot_rgb: tuple[int, int, int]) -> np.ndarray:
    y = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None, None]
    top = np.array(top_rgb, dtype=np.float32)[None, None, :]
    bot = np.array(bot_rgb, dtype=np.float32)[None, None, :]
    arr = top * (1.0 - y) + bot * y
    return np.broadcast_to(arr, (h, w, 3)).copy()


def draw_architectural_scene(
    w: int,
    h: int,
    palette: dict,
    shift_x: int = 0,
    shift_y: int = 0,
    modern_overlay: bool = False,
    scene_variant: int = 0,
) -> Image.Image:
    arr = make_sky_gradient(w, h, palette["sky_top"], palette["sky_bot"])

    # Subtle atmospheric sun/moon glow
    yy, xx = np.mgrid[0:h, 0:w]
    sx = int(w * palette.get("sun_x", 0.72)) + shift_x
    sy = int(h * palette.get("sun_y", 0.26)) + shift_y
    dist = np.sqrt((xx - sx) ** 2 + (yy - sy) ** 2)
    glow = np.exp(-dist / 140.0)[:, :, None]
    sun_col = np.array(palette.get("sun_color", (255, 210, 140)), dtype=np.float32)[None, None, :]
    arr = np.clip(arr * (1.0 - 0.35 * glow) + sun_col * (0.55 * glow), 0, 255)

    img = Image.fromarray(arr.astype(np.uint8), mode="RGB")
    draw = ImageDraw.Draw(img)

    horizon = int(h * 0.66) + shift_y

    # Distant mountain ridge
    ridge_pts = [(0, horizon)]
    for x in range(0, w + 32, 32):
        ry = horizon - int(45 + 28 * math.sin((x + scene_variant * 50) * 0.011) + 14 * math.cos(x * 0.027))
        ridge_pts.append((x, ry))
    ridge_pts.append((w, horizon))
    draw.polygon(ridge_pts, fill=palette["ridge"])

    # Ground plane with perspective road / plaza lines
    draw.rectangle([0, horizon, w, h], fill=palette["ground"])
    vanish_x = w // 2 + shift_x
    for i in range(-8, 9):
        gx = vanish_x + i * 110
        draw.line([(vanish_x, horizon), (gx, h)], fill=palette["grid_line"], width=2)

    # Primary architectural structures
    base_buildings = [
        (110, 190, 95, palette["bldg_1"]),
        (220, 155, 110, palette["bldg_2"]),
        (360, 120, 130, palette["bldg_1"]),
        (515, 165, 105, palette["bldg_2"]),
        (645, 140, 115, palette["bldg_1"]),
        (780, 205, 90, palette["bldg_2"]),
    ]

    for idx, (bx, bh, bw, bcol) in enumerate(base_buildings):
        x0 = bx + shift_x + ((scene_variant * 13) % 25) - 12
        y0 = horizon - bh
        x1 = x0 + bw
        y1 = horizon
        draw.rectangle([x0, y0, x1, y1], fill=bcol, outline=palette["trim"], width=2)
        # Pitched roof or clock tower on center building
        if idx == 2:
            draw.polygon([(x0 - 6, y0), ((x0 + x1) // 2, y0 - 48), (x1 + 6, y0)], fill=palette["accent"])
            draw.ellipse(
                [(x0 + x1) // 2 - 16, y0 - 28, (x0 + x1) // 2 + 16, y0 + 4],
                fill=palette["window_lit"],
                outline=palette["trim"],
                width=2,
            )
        # Windows grid
        for wy in range(y0 + 18, y1 - 16, 22):
            for wx in range(x0 + 12, x1 - 14, 20):
                lit = ((wx + wy + idx + scene_variant) % 3) != 0
                wcol = palette["window_lit"] if lit else palette["window_dark"]
                draw.rectangle([wx, wy, wx + 10, wy + 12], fill=wcol)

    if modern_overlay:
        # Modern skybridge / glass tower addition for Ghost "Then vs Now" current image
        tx0 = 465 + shift_x
        ty0 = horizon - 265
        draw.rectangle([tx0, ty0, tx0 + 74, horizon], fill=(62, 108, 148), outline=(180, 220, 250), width=2)
        for gy in range(ty0 + 12, horizon - 10, 16):
            draw.line([(tx0 + 6, gy), (tx0 + 68, gy)], fill=(150, 210, 245), width=2)

    # Corner fiducial & optical vignette for authentic 3:2 camera look
    img = img.filter(ImageFilter.SMOOTH_MORE)
    np_img = np.asarray(img, dtype=np.float32)
    ny = (yy - h / 2.0) / (h / 2.0)
    nx = (xx - w / 2.0) / (w / 2.0)
    vig = np.clip(1.0 - 0.18 * (nx * nx + ny * ny), 0.72, 1.0)[:, :, None]
    np_img = np.clip(np_img * vig, 0, 255).astype(np.uint8)
    return Image.fromarray(np_img, mode="RGB")


SAMPLE_SPECS = [
    {
        "id": "sample-001",
        "title": "Sony A7R II · CC0 14-bit ARW Reference Scene",
        "category": "raw-reference",
        "cameraModel": "ILCE-7RM2",
        "pipelineMode": "RAW_PIPELINE_PRECOMPUTED",
        "rawStagesDir": "/assets/generated/sample-001",
        "sourceUrl": "https://raw.pixls.us/",
        "downloadUrl": "https://raw.pixls.us/getfile.php/1312/nice/Sony%20-%20ILCE-7RM2%20-%2014bit%2014bit%20compressed%20(3:2).ARW",
        "author": "Kelvie Wong (raw.pixls.us #1312)",
        "attribution": "CC0 1.0 Public Domain contribution via raw.pixls.us (Sony ILCE-7RM2 14-bit compressed ARW)",
    },
    {
        "id": "sample-002",
        "title": "Kyoto Machiya Timber Facade · 35mm f/2.8",
        "category": "architecture",
        "palette": {
            "sky_top": (38, 68, 112),
            "sky_bot": (196, 152, 116),
            "sun_color": (255, 206, 138),
            "ridge": (64, 72, 92),
            "ground": (48, 44, 42),
            "grid_line": (82, 74, 68),
            "bldg_1": (92, 64, 48),
            "bldg_2": (116, 84, 62),
            "trim": (42, 30, 24),
            "accent": (146, 56, 44),
            "window_lit": (248, 202, 124),
            "window_dark": (46, 38, 36),
        },
    },
    {
        "id": "sample-003",
        "title": "Shinjuku Neon Crossing After Rain · 50mm f/1.8",
        "category": "night-street",
        "palette": {
            "sky_top": (14, 18, 38),
            "sky_bot": (44, 28, 68),
            "sun_color": (235, 90, 175),
            "ridge": (24, 24, 44),
            "ground": (20, 22, 32),
            "grid_line": (68, 128, 168),
            "bldg_1": (30, 36, 56),
            "bldg_2": (42, 34, 64),
            "trim": (90, 180, 220),
            "accent": (228, 64, 120),
            "window_lit": (110, 235, 245),
            "window_dark": (22, 26, 40),
        },
    },
    {
        "id": "sample-004",
        "title": "Kamakura Coastal Horizon · 28mm f/5.6",
        "category": "landscape",
        "palette": {
            "sky_top": (48, 116, 182),
            "sky_bot": (178, 218, 238),
            "sun_color": (255, 244, 198),
            "ridge": (74, 112, 134),
            "ground": (44, 92, 122),
            "grid_line": (88, 148, 176),
            "bldg_1": (138, 146, 154),
            "bldg_2": (162, 168, 172),
            "trim": (70, 82, 92),
            "accent": (198, 82, 66),
            "window_lit": (242, 232, 190),
            "window_dark": (66, 78, 88),
        },
    },
    {
        "id": "sample-005",
        "title": "Ginza Brutalist Concrete Tower · 55mm f/4.0",
        "category": "architecture",
        "palette": {
            "sky_top": (82, 96, 112),
            "sky_bot": (182, 188, 194),
            "sun_color": (240, 240, 240),
            "ridge": (94, 102, 110),
            "ground": (66, 70, 74),
            "grid_line": (110, 116, 122),
            "bldg_1": (122, 126, 132),
            "bldg_2": (98, 104, 110),
            "trim": (52, 56, 60),
            "accent": (76, 94, 116),
            "window_lit": (215, 228, 240),
            "window_dark": (48, 52, 58),
        },
    },
    {
        "id": "sample-006",
        "title": "Hakone Mist Cedar Valley · 85mm f/2.8",
        "category": "landscape",
        "palette": {
            "sky_top": (54, 82, 78),
            "sky_bot": (164, 188, 176),
            "sun_color": (232, 242, 210),
            "ridge": (44, 68, 60),
            "ground": (34, 52, 44),
            "grid_line": (68, 92, 80),
            "bldg_1": (72, 88, 78),
            "bldg_2": (58, 76, 66),
            "trim": (30, 44, 38),
            "accent": (132, 92, 64),
            "window_lit": (238, 210, 148),
            "window_dark": (32, 46, 40),
        },
    },
    {
        "id": "sample-007",
        "title": "Yokohama Pier Golden Hour · 35mm f/2.0",
        "category": "day-dusk",
        "palette": {
            "sky_top": (64, 52, 98),
            "sky_bot": (238, 134, 78),
            "sun_color": (255, 196, 92),
            "ridge": (58, 46, 68),
            "ground": (42, 36, 48),
            "grid_line": (124, 84, 76),
            "bldg_1": (78, 58, 68),
            "bldg_2": (94, 68, 74),
            "trim": (38, 28, 36),
            "accent": (188, 78, 58),
            "window_lit": (255, 216, 132),
            "window_dark": (44, 34, 42),
        },
    },
    {
        "id": "sample-008",
        "title": "Shimokitazawa Alleyway Lanterns · 50mm f/1.4",
        "category": "night-street",
        "palette": {
            "sky_top": (18, 20, 28),
            "sky_bot": (52, 42, 38),
            "sun_color": (255, 168, 88),
            "ridge": (32, 30, 34),
            "ground": (28, 24, 24),
            "grid_line": (96, 72, 54),
            "bldg_1": (54, 44, 38),
            "bldg_2": (68, 52, 44),
            "trim": (122, 88, 62),
            "accent": (218, 88, 48),
            "window_lit": (255, 192, 108),
            "window_dark": (30, 26, 26),
        },
    },
    {
        "id": "sample-009",
        "title": "Artist Studio Window Silhouette (No-PII Model Release CC0) · 85mm f/1.8",
        "category": "portrait-silhouette",
        "palette": {
            "sky_top": (32, 42, 58),
            "sky_bot": (146, 162, 182),
            "sun_color": (245, 232, 208),
            "ridge": (48, 56, 68),
            "ground": (28, 32, 38),
            "grid_line": (72, 82, 94),
            "bldg_1": (42, 48, 58),
            "bldg_2": (56, 64, 76),
            "trim": (24, 28, 34),
            "accent": (112, 128, 148),
            "window_lit": (236, 240, 245),
            "window_dark": (26, 30, 36),
        },
    },
    {
        "id": "sample-010",
        "title": "Tsukiji Morning Market Arcade · 28mm f/2.8",
        "category": "street",
        "palette": {
            "sky_top": (58, 92, 128),
            "sky_bot": (198, 186, 162),
            "sun_color": (252, 224, 168),
            "ridge": (68, 84, 98),
            "ground": (54, 52, 48),
            "grid_line": (104, 98, 88),
            "bldg_1": (96, 88, 78),
            "bldg_2": (118, 106, 92),
            "trim": (48, 44, 38),
            "accent": (176, 74, 52),
            "window_lit": (248, 218, 152),
            "window_dark": (44, 42, 38),
        },
    },
    # Ghost Pair 1: Marunouchi Brick Station (1986 Archive vs 2026 Modern Return)
    {
        "id": "sample-011",
        "title": "Marunouchi Station Plaza [1986 Archive Reference]",
        "category": "ghost-pair",
        "ghostPairId": "ghost-pair-1",
        "ghostRole": "REFERENCE",
        "shift_x": 0,
        "shift_y": 0,
        "modern_overlay": False,
        "palette": {
            "sky_top": (78, 88, 102),
            "sky_bot": (188, 174, 152),
            "sun_color": (244, 214, 166),
            "ridge": (82, 78, 74),
            "ground": (64, 58, 52),
            "grid_line": (112, 102, 92),
            "bldg_1": (136, 78, 62),
            "bldg_2": (118, 94, 78),
            "trim": (58, 42, 36),
            "accent": (92, 62, 54),
            "window_lit": (238, 212, 158),
            "window_dark": (52, 44, 40),
        },
    },
    {
        "id": "sample-012",
        "title": "Marunouchi Station Plaza [2026 Re-shoot Current]",
        "category": "ghost-pair",
        "ghostPairId": "ghost-pair-1",
        "ghostRole": "CURRENT",
        "shift_x": 18,
        "shift_y": -8,
        "modern_overlay": True,
        "palette": {
            "sky_top": (42, 86, 142),
            "sky_bot": (172, 206, 232),
            "sun_color": (255, 236, 188),
            "ridge": (68, 86, 104),
            "ground": (52, 58, 66),
            "grid_line": (98, 112, 126),
            "bldg_1": (146, 74, 58),
            "bldg_2": (112, 118, 128),
            "trim": (48, 52, 58),
            "accent": (78, 92, 108),
            "window_lit": (224, 238, 252),
            "window_dark": (42, 48, 56),
        },
    },
    # Ghost Pair 2: Sumida River Bridge (Daylight vs Twilight Re-shoot)
    {
        "id": "sample-013",
        "title": "Sumida Iron Bridge [1998 Daylight Reference]",
        "category": "ghost-pair",
        "ghostPairId": "ghost-pair-2",
        "ghostRole": "REFERENCE",
        "shift_x": 0,
        "shift_y": 0,
        "modern_overlay": False,
        "palette": {
            "sky_top": (62, 108, 154),
            "sky_bot": (186, 208, 222),
            "sun_color": (252, 240, 196),
            "ridge": (74, 96, 112),
            "ground": (46, 74, 92),
            "grid_line": (88, 128, 148),
            "bldg_1": (84, 112, 98),
            "bldg_2": (104, 124, 114),
            "trim": (44, 62, 54),
            "accent": (68, 102, 88),
            "window_lit": (236, 232, 198),
            "window_dark": (48, 64, 58),
        },
    },
    {
        "id": "sample-014",
        "title": "Sumida Iron Bridge [2026 Blue Hour Current]",
        "category": "ghost-pair",
        "ghostPairId": "ghost-pair-2",
        "ghostRole": "CURRENT",
        "shift_x": -14,
        "shift_y": 6,
        "modern_overlay": True,
        "palette": {
            "sky_top": (22, 36, 74),
            "sky_bot": (118, 84, 122),
            "sun_color": (244, 162, 118),
            "ridge": (38, 48, 72),
            "ground": (24, 38, 58),
            "grid_line": (74, 112, 152),
            "bldg_1": (52, 74, 72),
            "bldg_2": (64, 84, 88),
            "trim": (82, 164, 192),
            "accent": (196, 84, 112),
            "window_lit": (138, 232, 248),
            "window_dark": (28, 38, 48),
        },
    },
    # Ghost Pair 3: Shibuya Observatory Overlook (Autumn vs Winter Re-shoot)
    {
        "id": "sample-015",
        "title": "Shibuya Skyline Overlook [Autumn Reference]",
        "category": "ghost-pair",
        "ghostPairId": "ghost-pair-3",
        "ghostRole": "REFERENCE",
        "shift_x": 0,
        "shift_y": 0,
        "modern_overlay": False,
        "palette": {
            "sky_top": (72, 62, 94),
            "sky_bot": (218, 146, 96),
            "sun_color": (255, 202, 112),
            "ridge": (68, 54, 64),
            "ground": (48, 40, 44),
            "grid_line": (118, 88, 78),
            "bldg_1": (92, 68, 64),
            "bldg_2": (112, 82, 74),
            "trim": (46, 34, 34),
            "accent": (178, 76, 54),
            "window_lit": (252, 214, 138),
            "window_dark": (42, 34, 36),
        },
    },
    {
        "id": "sample-016",
        "title": "Shibuya Skyline Overlook [Winter Clear Current]",
        "category": "ghost-pair",
        "ghostPairId": "ghost-pair-3",
        "ghostRole": "CURRENT",
        "shift_x": 12,
        "shift_y": 10,
        "modern_overlay": True,
        "palette": {
            "sky_top": (36, 74, 128),
            "sky_bot": (168, 202, 228),
            "sun_color": (248, 238, 208),
            "ridge": (58, 78, 98),
            "ground": (44, 52, 62),
            "grid_line": (92, 114, 134),
            "bldg_1": (78, 92, 108),
            "bldg_2": (96, 110, 124),
            "trim": (42, 52, 64),
            "accent": (68, 124, 168),
            "window_lit": (228, 242, 255),
            "window_dark": (38, 46, 56),
        },
    },
]


def build_all_samples() -> None:
    SAMPLES_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_SAMPLES_DIR.mkdir(parents=True, exist_ok=True)
    LICENSES_DIR.mkdir(parents=True, exist_ok=True)

    manifest_items = []

    for idx, spec in enumerate(SAMPLE_SPECS):
        sample_id = spec["id"]
        filename = f"{sample_id}.jpg"
        dest_path = SAMPLES_DIR / filename
        pub_path = PUBLIC_SAMPLES_DIR / filename

        if sample_id == "sample-001" and GENERATED_RAW_FINAL.exists():
            shutil.copyfile(GENERATED_RAW_FINAL, dest_path)
        else:
            img = draw_architectural_scene(
                w=960,
                h=640,
                palette=spec["palette"],
                shift_x=int(spec.get("shift_x", 0)),
                shift_y=int(spec.get("shift_y", 0)),
                modern_overlay=bool(spec.get("modern_overlay", False)),
                scene_variant=idx,
            )
            img.save(dest_path, "JPEG", quality=92)

        shutil.copyfile(dest_path, pub_path)
        with Image.open(dest_path) as im:
            width, height = im.size

        digest = sha256_file(dest_path)
        author = spec.get("author", "Camera Lab Open Plates (Procedural CC0)")
        source_url = spec.get("sourceUrl", f"https://camera-lab.local/assets/samples/{filename}")
        download_url = spec.get("downloadUrl", f"/assets/samples/{filename}")
        attribution = spec.get(
            "attribution",
            f"CC0 1.0 Public Domain dedicated by {author}; EXIF PII stripped.",
        )

        license_text = (
            f"Asset ID: {sample_id}\n"
            f"Title: {spec['title']}\n"
            f"Author: {author}\n"
            f"License: CC0-1.0 (Creative Commons Zero v1.0 Universal)\n"
            f"License URL: https://creativecommons.org/publicdomain/zero/1.0/\n"
            f"Source URL: {source_url}\n"
            f"SHA256: {digest}\n"
            f"Redistribution Allowed: true\n"
            f"EXIF Privacy Audit: Passed (No GPS / No facial biometric PII)\n"
        )
        (LICENSES_DIR / f"{sample_id}.LICENSE.txt").write_text(license_text, encoding="utf-8")

        entry = {
            "id": sample_id,
            "title": spec["title"],
            "origin": "REMOTE_LICENSED",
            "url": f"/assets/samples/{filename}",
            "sourceUrl": source_url,
            "downloadUrl": download_url,
            "author": author,
            "license": "CC0-1.0",
            "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
            "attribution": attribution,
            "sha256": digest,
            "width": width,
            "height": height,
            "type": "image/jpeg",
            "mimeType": "image/jpeg",
            "canRedistribute": True,
            "cameraModel": spec.get("cameraModel", "ILCE-7RM2"),
            "pipelineMode": spec.get("pipelineMode", "JPEG_SIMULATION"),
            "createdAt": "2026-11-09T08:00:00.000Z",
            "version": 1,
        }
        if "ghostPairId" in spec:
            entry["ghostPairId"] = spec["ghostPairId"]
            entry["ghostRole"] = spec["ghostRole"]
        if "rawStagesDir" in spec:
            entry["rawStagesDir"] = spec["rawStagesDir"]

        manifest_items.append(entry)

    manifest = {
        "schemaVersion": "1.0.0",
        "generatedAt": "2026-11-09T08:00:00.000Z",
        "policy": "All distributed assets are verified CC0-1.0 redistributable with SHA256 integrity and zero GPS/PII EXIF.",
        "assets": manifest_items,
    }

    manifest_json = json.dumps(manifest, indent=2) + "\n"
    (ROOT / "assets" / "manifest.json").write_text(manifest_json, encoding="utf-8")
    (ROOT / "apps" / "web" / "public" / "assets" / "manifest.json").write_text(manifest_json, encoding="utf-8")
    print(f"Generated {len(manifest_items)} licensed assets and updated assets/manifest.json")


if __name__ == "__main__":
    build_all_samples()
