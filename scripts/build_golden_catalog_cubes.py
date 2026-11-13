# ==============================================================================
# Author:     M.D.Isuru Lakmal Peiris (@ilpeiris) 
# Project:    SPHEREx x Planet X (2026 NASA International Space Apps Challenge)
# Repository: https://github.com/ilpeiris/SPHEREx-planetX-discovery-engine
# LinkedIn:   https://www.linkedin.com/in/ilpeiris
# Github:     https://github.com/ilpeiris/
# License:    MIT License | Copyright (c) 2026 M.D.Isuru Lakmal Peiris
# ==============================================================================





#!/usr/bin/env python3
# scripts/build_golden_catalog_cubes.py
"""
Phase 1 Offline Pre-Computation Script A:
Harvests multi-epoch SPHEREx Level 2 MEF cutouts and archival unWISE coadds
for all 18 Golden Targets, runs ZODI removal, SAPM flux conversion, FLAGS
bitmasking, WCS reprojection, and ZOGY proper subtraction, and writes both
6-slice WebGL2 `.bin` buffers and Zstandard-compressed Zarr v2 cubes to local
cache and Cloudflare R2 (`s3://{R2_BUCKET}/cubes/`).
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path
from typing import Any, Dict, List

import numpy as np
import zarr
from numcodecs import Blosc

# Ensure `backend/` is on sys.path so `app.*` modules import cleanly
REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.config import BINARY_CUBE_NUM_SLICES, get_detector_for_channel, settings  # noqa: E402
from app.irsa_client import fetch_cutouts_threaded_sync, query_spherex_tap_cutouts  # noqa: E402
from app.main import (  # noqa: E402
    GOLDEN_TARGETS_CATALOG,
    _worker_process_cutouts_to_6slice_cube,
    build_physics_fallback_6slice_cube,
    pack_6slice_binary_cube,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(message)s",
)
logger = logging.getLogger("build_golden_catalog_cubes")


def save_zarr_cube(
    zarr_root_dir: Path,
    target_id: str,
    float_cube: np.ndarray,
    uint16_cube: np.ndarray,
    metadata: Dict[str, Any],
) -> Path:
    """
    Persist a 6-slice Float32 flux/ZOGY cube and Uint16 hardware flag cube
    as a Zstandard-compressed Zarr store for cloud range-request streaming.
    """
    store_path = zarr_root_dir / f"{target_id}.zarr"
    compressor = Blosc(cname="zstd", clevel=5, shuffle=Blosc.BITSHUFFLE)

    root = zarr.open_group(str(store_path), mode="w")
    root.create_dataset(
        "flux_cube",
        data=float_cube.astype(np.float32),
        chunks=(1, float_cube.shape[1], float_cube.shape[2]),
        compressor=compressor,
        overwrite=True,
    )
    root.create_dataset(
        "flag_cube",
        data=uint16_cube.astype(np.uint16),
        chunks=(1, uint16_cube.shape[1], uint16_cube.shape[2]),
        compressor=compressor,
        overwrite=True,
    )
    root.attrs.update(metadata)
    return store_path


def upload_binary_cube_to_r2(local_bin_path: Path, r2_object_key: str) -> bool:
    """
    Upload a pre-computed 6-slice `.bin` cube to Cloudflare R2 via `s3fs`
    when R2 credentials are configured in the environment.
    """
    if not (settings.R2_ACCESS_KEY_ID and settings.R2_SECRET_ACCESS_KEY):
        return False

    try:
        import s3fs

        endpoint_url = f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
        fs = s3fs.S3FileSystem(
            key=settings.R2_ACCESS_KEY_ID,
            secret=settings.R2_SECRET_ACCESS_KEY,
            client_kwargs={"endpoint_url": endpoint_url},
        )
        remote_uri = f"{settings.R2_BUCKET}/{r2_object_key}"
        fs.put(str(local_bin_path), remote_uri)
        logger.info("Uploaded -> r2://%s", remote_uri)
        return True
    except Exception as exc:
        logger.warning("Cloudflare R2 upload skipped for %s: %s", r2_object_key, exc)
        return False


def build_all_golden_target_cubes(
    output_dir: Path,
    size_px: int = 256,
    live_irsa: bool = True,
    upload_r2: bool = False,
) -> List[Path]:
    """
    Build 6-slice binary `.bin` and `.zarr` cutout cubes for every target in
    `GOLDEN_TARGETS_CATALOG` (including coordinate aliases for J2000 and WISE 2010
    discovery positions so fast-mover lookups never miss cache).
    """
    bin_dir = output_dir / "cubes"
    zarr_dir = output_dir / "zarr"
    bin_dir.mkdir(parents=True, exist_ok=True)
    zarr_dir.mkdir(parents=True, exist_ok=True)
    settings.CACHE_DIR.mkdir(parents=True, exist_ok=True)

    written_files: List[Path] = []

    for idx, target in enumerate(GOLDEN_TARGETS_CATALOG, start=1):
        t_id = str(target["id"])
        t_name = str(target["name"])
        ra_deg = float(target["ra_deg"])
        dec_deg = float(target["dec_deg"])
        fov_arcmin = float(target.get("fov_arcmin", 6.0))
        channel = int(target.get("default_channel", 64))

        logger.info(
            "[%02d/%02d] Building 6-slice cube for %s (RA=%.5f, Dec=%.5f, Ch=%d, FoV=%.1f')",
            idx,
            len(GOLDEN_TARGETS_CATALOG),
            t_name,
            ra_deg,
            dec_deg,
            channel,
            fov_arcmin,
        )

        fits_payloads: List[bytes] = []
        if live_irsa:
            det_spec = get_detector_for_channel(channel)
            size_deg = max(0.03, fov_arcmin / 60.0)
            tap_rows = query_spherex_tap_cutouts(
                ra_deg=ra_deg,
                dec_deg=dec_deg,
                size_deg=size_deg,
                bandpass=det_spec.name,
                timeout_sec=12,
            )
            if tap_rows:
                urls = [str(r["cutout_uri"]) for r in tap_rows[:10] if r.get("cutout_uri")]
                downloaded = fetch_cutouts_threaded_sync(urls, max_workers=10, timeout_sec=20)
                fits_payloads = [b for b in downloaded if b is not None]

        if fits_payloads:
            float_cube, uint16_cube = _worker_process_cutouts_to_6slice_cube(
                fits_bytes_list=fits_payloads,
                ra_deg=ra_deg,
                dec_deg=dec_deg,
                channel=channel,
                size_px=size_px,
                fov_arcmin=fov_arcmin,
                coadd_detector=False,
                mode="narrowband",
            )
            source_mode = "irsa_level2_mef"
        else:
            float_cube, uint16_cube = build_physics_fallback_6slice_cube(
                ra_deg=ra_deg,
                dec_deg=dec_deg,
                channel=channel,
                size_px=size_px,
                fov_arcmin=fov_arcmin,
            )
            source_mode = "physics_calibrated_golden"

        assert float_cube.shape == (BINARY_CUBE_NUM_SLICES, size_px, size_px)
        assert uint16_cube.shape == (BINARY_CUBE_NUM_SLICES, size_px, size_px)

        binary_bytes = pack_6slice_binary_cube(float_cube, uint16_cube)

        # Write primary coordinate key + any historical epoch coordinate aliases
        # (Micro-Safeguard #2: 2010 WISE discovery coordinate & J2000 coordinate aliases)
        coord_pairs = [(ra_deg, dec_deg)]
        if "ra_2010_deg" in target and "dec_2010_deg" in target:
            coord_pairs.append((float(target["ra_2010_deg"]), float(target["dec_2010_deg"])))
        if "ra_j2000_deg" in target and "dec_j2000_deg" in target:
            coord_pairs.append((float(target["ra_j2000_deg"]), float(target["dec_j2000_deg"])))

        for ra_alias, dec_alias in coord_pairs:
            tile_filename = (
                f"ch{channel:03d}_ra{ra_alias:.4f}_dec{dec_alias:.4f}"
                f"_s{size_px}_fov{int(round(fov_arcmin))}_coadd0_narrowband.bin"
            )
            out_bin_path = bin_dir / tile_filename
            out_bin_path.write_bytes(binary_bytes)

            # Mirror into FastAPI local runtime cache (/tmp/spherex_cache)
            runtime_cache_path = settings.CACHE_DIR / tile_filename
            runtime_cache_path.write_bytes(binary_bytes)
            written_files.append(out_bin_path)

            if upload_r2:
                upload_binary_cube_to_r2(out_bin_path, f"cubes/{tile_filename}")

        save_zarr_cube(
            zarr_root_dir=zarr_dir,
            target_id=t_id,
            float_cube=float_cube,
            uint16_cube=uint16_cube,
            metadata={
                "id": t_id,
                "name": t_name,
                "ra_deg": ra_deg,
                "dec_deg": dec_deg,
                "fov_arcmin": fov_arcmin,
                "channel": channel,
                "num_slices": BINARY_CUBE_NUM_SLICES,
                "source_mode": source_mode,
            },
        )

    logger.info("Successfully generated %d binary cutout cubes in %s", len(written_files), bin_dir)
    return written_files


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Pre-compute 6-slice WebGL2 binary & Zarr cutout cubes for the Golden Target Catalog."
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=REPO_ROOT / "backend" / "cache" / "r2_staging",
        help="Directory to write staged .bin and .zarr cubes",
    )
    parser.add_argument("--size-px", type=int, default=256, choices=[128, 256, 512])
    parser.add_argument(
        "--offline-only",
        action="store_true",
        help="Skip live IRSA TAP network queries and synthesize directly from Golden Catalog physics",
    )
    parser.add_argument(
        "--upload-r2",
        action="store_true",
        help="Upload generated .bin cubes directly to Cloudflare R2 bucket",
    )
    args = parser.parse_args()

    build_all_golden_target_cubes(
        output_dir=args.output_dir,
        size_px=args.size_px,
        live_irsa=not args.offline_only,
        upload_r2=args.upload_r2,
    )


if __name__ == "__main__":
    main()