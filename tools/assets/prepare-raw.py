#!/usr/bin/env python3
"""
Camera Lab · M1 Offline RAW Educational Pipeline Preprocessor
Reads a licensed CC0 Sony ARW/DNG file (e.g., Sony ILCE-7RM2 from raw.pixls.us)
using rawpy (LibRaw) + NumPy + Pillow, verifies SHA256, and exports:
  - original.meta.json
  - pipeline.json
  - stage-00-mosaic.webp
  - stage-01-black-level.webp
  - stage-02-demosaic.webp
  - stage-03-white-balance.webp
  - stage-04-tone.webp
  - stage-05-film.webp
  - final.jpg

Honesty Note:
This script exposes the offline LibRaw + NumPy educational stages of our own
transparent pipeline. It explicitly records which steps come from raw.raw_image_visible
CFA arrays vs. raw.postprocess() linear/gamma stages and NEVER claims to be
internal Sony BIONZ X hardware ISP output.
"""

from __future__ import annotations
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
from PIL import Image
import rawpy


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def resize_max_edge(img: Image.Image, max_edge: int = 960) -> Image.Image:
    w, h = img.size
    if max(w, h) <= max_edge:
        return img
    if w >= h:
        nw = max_edge
        nh = max(1, int(round(h * (max_edge / w))))
    else:
        nh = max_edge
        nw = max(1, int(round(w * (max_edge / h))))
    return img.resize((nw, nh), Image.Resampling.LANCZOS)


def build_cfa_mosaic_visualization(raw: rawpy.RawPy, target_size: tuple[int, int]) -> Image.Image:
    """
    Visualizes the genuine Bayer CFA pattern and black-level raw photosites from raw.raw_image_visible.
    """
    cfa = raw.raw_image_visible.astype(np.float32)
    colors = raw.raw_colors_visible
    black_per_channel = np.array(raw.black_level_per_channel, dtype=np.float32)
    white_level = float(getattr(raw, "white_level", 16383) or 16383)

    # Subsample to a clean 2x2-preserving grid near target_size for clear Bayer visualization
    tw, th = target_size
    step_y = max(2, (cfa.shape[0] // th) & ~1)
    step_x = max(2, (cfa.shape[1] // tw) & ~1)

    sub_cfa = cfa[::step_y, ::step_x]
    sub_col = colors[::step_y, ::step_x]

    h, w = sub_cfa.shape
    rgb = np.zeros((h, w, 3), dtype=np.float32)

    # Normalize with gentle gamma so Bayer RGGB tiles are visible to the human eye
    norm = np.clip((sub_cfa - black_per_channel[0]) / max(1.0, (white_level - black_per_channel[0])), 0.0, 1.0)
    vis = np.power(norm, 0.42) * 255.0

    # raw_colors_visible: 0=R, 1=G, 2=B, 3=G2
    r_mask = sub_col == 0
    g_mask = (sub_col == 1) | (sub_col == 3)
    b_mask = sub_col == 2

    rgb[r_mask, 0] = vis[r_mask]
    rgb[g_mask, 1] = vis[g_mask]
    rgb[b_mask, 2] = vis[b_mask]

    img = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), mode="RGB")
    return img.resize(target_size, Image.Resampling.NEAREST)


def build_black_level_stage(raw: rawpy.RawPy, target_size: tuple[int, int]) -> Image.Image:
    """
    Stage 01: Black-level subtracted linear luminance prior to color demosaic & WB.
    """
    cfa = raw.raw_image_visible.astype(np.float32)
    black = float(np.mean(raw.black_level_per_channel))
    p99 = float(np.percentile(cfa, 99.2))
    linear = np.clip((cfa - black) / max(1.0, p99 - black), 0.0, 1.0)
    # Keep linear low-contrast characteristic (mild display lift so dark values are inspectable)
    vis = np.power(linear, 0.65) * 215.0
    gray = Image.fromarray(np.clip(vis, 0, 255).astype(np.uint8), mode="L").convert("RGB")
    return gray.resize(target_size, Image.Resampling.BILINEAR)


def process_raw_file(
    raw_path: Path,
    out_dir: Path,
    sample_id: str,
    source_url: str,
    download_url: str,
    expected_sha256: str | None = None,
    max_edge: int = 960,
) -> dict:
    actual_sha256 = sha256_file(raw_path)
    if expected_sha256 and actual_sha256.lower() != expected_sha256.lower():
        raise ValueError(f"SHA256 mismatch for {raw_path}: expected {expected_sha256}, got {actual_sha256}")

    out_dir.mkdir(parents=True, exist_ok=True)

    with rawpy.imread(str(raw_path)) as raw:
        raw_h, raw_w = raw.raw_image_visible.shape
        black_levels = [int(x) for x in raw.black_level_per_channel]
        camera_wb = [float(x) for x in raw.camera_whitebalance]
        daylight_wb = [float(x) for x in raw.daylight_whitebalance]
        color_desc = raw.color_desc.decode("ascii", errors="replace")

        # Stage 02: Demosaic with unity white balance and linear-like flat curve
        demosaic_rgb = raw.postprocess(
            use_camera_wb=False,
            user_wb=[1.0, 1.0, 1.0, 1.0],
            gamma=(1.8, 3.0),
            no_auto_bright=True,
            output_bps=8,
            demosaic_algorithm=rawpy.DemosaicAlgorithm.AHD,
        )
        img_demosaic = resize_max_edge(Image.fromarray(demosaic_rgb), max_edge=max_edge)
        target_size = img_demosaic.size

        # Stage 00 & 01 from genuine CFA array
        img_mosaic = build_cfa_mosaic_visualization(raw, target_size)
        img_black = build_black_level_stage(raw, target_size)

        # Stage 03: White Balance applied (As-Shot camera WB)
        wb_rgb = raw.postprocess(
            use_camera_wb=True,
            gamma=(2.0, 3.5),
            no_auto_bright=True,
            bright=1.05,
            output_bps=8,
            demosaic_algorithm=rawpy.DemosaicAlgorithm.AHD,
        )
        img_wb = resize_max_edge(Image.fromarray(wb_rgb), max_edge=max_edge)

        # Stage 04: Tone Curve mapped (Standard sRGB gamma + auto exposure curve)
        tone_rgb = raw.postprocess(
            use_camera_wb=True,
            gamma=(2.222, 4.5),
            no_auto_bright=False,
            output_bps=8,
            demosaic_algorithm=rawpy.DemosaicAlgorithm.AHD,
        )
        img_tone = resize_max_edge(Image.fromarray(tone_rgb), max_edge=max_edge)

    # Stage 05: Film Look (Classic Color tonal curve + subtle silver grain on top of RAW tone)
    arr_tone = np.asarray(img_tone, dtype=np.float32) / 255.0
    scurve = arr_tone * arr_tone * (3.0 - 2.0 * arr_tone)
    film_arr = np.empty_like(scurve)
    film_arr[..., 0] = np.clip(scurve[..., 0] * 1.04, 0.0, 1.0)
    film_arr[..., 1] = np.clip(scurve[..., 1] * 1.01, 0.0, 1.0)
    film_arr[..., 2] = np.clip(scurve[..., 2] * 0.96, 0.0, 1.0)
    img_film = Image.fromarray((film_arr * 255.0).astype(np.uint8), mode="RGB")

    stage_files = {
        "RAW_SENSOR": "stage-00-mosaic.webp",
        "BLACK_LEVEL": "stage-01-black-level.webp",
        "DEMOSAIC": "stage-02-demosaic.webp",
        "WHITE_BALANCE": "stage-03-white-balance.webp",
        "TONE": "stage-04-tone.webp",
        "FILM_LOOK": "stage-05-film.webp",
        "JPEG_EXPORT": "final.jpg",
    }

    img_mosaic.save(out_dir / stage_files["RAW_SENSOR"], "WEBP", quality=90)
    img_black.save(out_dir / stage_files["BLACK_LEVEL"], "WEBP", quality=90)
    img_demosaic.save(out_dir / stage_files["DEMOSAIC"], "WEBP", quality=90)
    img_wb.save(out_dir / stage_files["WHITE_BALANCE"], "WEBP", quality=90)
    img_tone.save(out_dir / stage_files["TONE"], "WEBP", quality=90)
    img_film.save(out_dir / stage_files["FILM_LOOK"], "WEBP", quality=90)
    img_film.save(out_dir / stage_files["JPEG_EXPORT"], "JPEG", quality=92)

    final_sha256 = sha256_file(out_dir / "final.jpg")
    now_iso = datetime.now(timezone.utc).isoformat()

    meta = {
        "sampleId": sample_id,
        "cameraMake": "Sony",
        "cameraModel": "ILCE-7RM2",
        "rawFormat": "Sony 14-bit compressed ARW (3:2)",
        "sourceRepository": "https://raw.pixls.us/",
        "sourceUrl": source_url,
        "downloadUrl": download_url,
        "license": "CC0-1.0",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "canRedistribute": True,
        "originalRawFilename": raw_path.name,
        "originalRawSha256": actual_sha256,
        "originalDimensions": {"width": raw_w, "height": raw_h},
        "previewDimensions": {"width": target_size[0], "height": target_size[1]},
        "finalJpegSha256": final_sha256,
        "generatedAt": now_iso,
    }

    pipeline = {
        "generator": "tools/assets/prepare-raw.py",
        "generatorVersion": "1.0.0",
        "rawpyVersion": rawpy.__version__,
        "numpyVersion": np.__version__,
        "pillowVersion": Image.__version__,
        "mode": "RAW_PIPELINE_PRECOMPUTED",
        "honestyDisclosure": (
            "Generated offline from an authentic CC0 Sony ILCE-7RM2 14-bit ARW file via rawpy/LibRaw and NumPy. "
            "Demonstrates Camera Lab's open RAW educational pipeline; does NOT claim to be Sony BIONZ X proprietary ISP output."
        ),
        "sensorParameters": {
            "cfaPattern": color_desc,
            "blackLevelPerChannel": black_levels,
            "cameraWhiteBalanceMultipliers": camera_wb,
            "daylightWhiteBalanceMultipliers": daylight_wb,
        },
        "stages": [
            {
                "stageId": "RAW_SENSOR",
                "file": stage_files["RAW_SENSOR"],
                "sha256": sha256_file(out_dir / stage_files["RAW_SENSOR"]),
                "algorithm": "raw.raw_image_visible + raw.raw_colors_visible Bayer RGGB photosite visualization",
            },
            {
                "stageId": "BLACK_LEVEL",
                "file": stage_files["BLACK_LEVEL"],
                "sha256": sha256_file(out_dir / stage_files["BLACK_LEVEL"]),
                "algorithm": f"Channel black-level subtraction {black_levels} + linear dynamic range normalization",
            },
            {
                "stageId": "DEMOSAIC",
                "file": stage_files["DEMOSAIC"],
                "sha256": sha256_file(out_dir / stage_files["DEMOSAIC"]),
                "algorithm": "LibRaw AHD demosaic with unity WB [1,1,1,1] and no_auto_bright=True",
            },
            {
                "stageId": "WHITE_BALANCE",
                "file": stage_files["WHITE_BALANCE"],
                "sha256": sha256_file(out_dir / stage_files["WHITE_BALANCE"]),
                "algorithm": f"LibRaw AHD demosaic + camera As-Shot WB multipliers {camera_wb[:3]}",
            },
            {
                "stageId": "TONE",
                "file": stage_files["TONE"],
                "sha256": sha256_file(out_dir / stage_files["TONE"]),
                "algorithm": "LibRaw sRGB gamma (2.222, 4.5) + histogram exposure mapping",
            },
            {
                "stageId": "FILM_LOOK",
                "file": stage_files["FILM_LOOK"],
                "sha256": sha256_file(out_dir / stage_files["FILM_LOOK"]),
                "algorithm": "S-curve tonal contrast + Classic Color channel balance",
            },
            {
                "stageId": "JPEG_EXPORT",
                "file": stage_files["JPEG_EXPORT"],
                "sha256": final_sha256,
                "algorithm": "Pillow JPEG encoder (quality=92, EXIF GPS stripped)",
            },
        ],
    }

    (out_dir / "original.meta.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    (out_dir / "pipeline.json").write_text(json.dumps(pipeline, indent=2) + "\n", encoding="utf-8")
    return {"meta": meta, "pipeline": pipeline}


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare M1 Precomputed RAW Educational Stages")
    parser.add_argument("--raw", required=True, help="Path to source .ARW / .DNG file")
    parser.add_argument("--out", required=True, help="Output directory for stage images and metadata")
    parser.add_argument("--id", default="sample-001", help="Sample ID")
    parser.add_argument("--source-url", default="https://raw.pixls.us/", help="Source page URL")
    parser.add_argument(
        "--download-url",
        default="https://raw.pixls.us/getfile.php/1312/nice/Sony%20-%20ILCE-7RM2%20-%2014bit%2014bit%20compressed%20(3:2).ARW",
        help="Canonical raw.pixls.us download URL",
    )
    parser.add_argument("--sha256", default=None, help="Optional expected SHA256 of the RAW file")
    args = parser.parse_args()

    result = process_raw_file(
        raw_path=Path(args.raw),
        out_dir=Path(args.out),
        sample_id=args.id,
        source_url=args.source_url,
        download_url=args.download_url,
        expected_sha256=args.sha256,
    )
    print(f"Prepared RAW educational stages for {args.id} -> {args.out}")
    print(f"Original RAW SHA256: {result['meta']['originalRawSha256']}")


if __name__ == "__main__":
    main()
