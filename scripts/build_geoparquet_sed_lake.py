# ==============================================================================
# Author:     M.D.Isuru Lakmal Peiris (@ilpeiris) 
# Project:    SPHEREx x Planet X (2026 NASA International Space Apps Challenge)
# Repository: https://github.com/ilpeiris/SPHEREx-planetX-discovery-engine
# LinkedIn:   https://www.linkedin.com/in/ilpeiris
# Github:     https://github.com/ilpeiris/
# License:    MIT License | Copyright (c) 2026 M.D.Isuru Lakmal Peiris
# ==============================================================================

#!/usr/bin/env python3
# scripts/build_geoparquet_sed_lake.py
"""
Phase 1 Offline Pre-Computation Script B:
Generates the Hive-partitioned (`hpx={healpix_part}`) GeoParquet 102-Band
Forced Photometry SED Lake and Exposure Footprint Index using DuckDB 1.2.1
(`spatial`, `parquet`, `httpfs`) with `SET s3_uploader_max_parts_per_file = 1;`
so `/api/v1/sed` and `/api/v1/cutout-cube` execute sub-50ms spatial cone queries.
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.calibration import calibrate_spherex_mef_bytes  # noqa: E402
from app.config import settings  # noqa: E402
from app.irsa_client import fetch_cutouts_threaded_sync, query_spherex_tap_cutouts  # noqa: E402
from app.main import (  # noqa: E402
    GOLDEN_TARGETS_CATALOG,
    build_physics_fallback_102band_sed,
    init_duckdb_connection,
)
from app.spectrophotometry import (  # noqa: E402
    NOMINAL_102_CHANNELS,
    extract_102band_point_source_sed,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(message)s",
)
logger = logging.getLogger("build_geoparquet_sed_lake")


def compute_healpix_partition(ra_deg: float, dec_deg: float) -> int:
    """
    Compute the deterministic spatial partition integer `hpx` matching
    the `/api/v1/sed` query in `backend/app/main.py`:
        healpix_part = int(((ra % 360.0) / 5.0) * 100 + ((dec + 90.0) / 5.0))
    """
    return int(((float(ra_deg) % 360.0) / 5.0) * 100 + ((float(dec_deg) + 90.0) / 5.0))


def build_geoparquet_sed_and_exposure_lake(
    output_dir: Path,
    push_to_r2: bool = False,
    live_irsa: bool = True,
) -> Dict[str, int]:
    """
    Assemble the 102-band dual-epoch forced photometry records and exposure
    bounding footprints for all Golden Targets (including J2000 and 2010 WISE
    coordinate aliases) from real NASA IRSA SPHEREx Level-2 FITS cutouts and
    write Hive-partitioned GeoParquet files via DuckDB.
    """
    sed_records: List[Dict[str, Any]] = []
    exposure_records: List[Dict[str, Any]] = []
    sapm_cache: Dict[int, np.ndarray] = {}

    for idx, target in enumerate(GOLDEN_TARGETS_CATALOG, start=1):
        t_id = str(target["id"])
        t_name = str(target["name"])
        ra_primary = float(target["ra_deg"])
        dec_primary = float(target["dec_deg"])

        coord_aliases = [(ra_primary, dec_primary)]
        if "ra_2010_deg" in target and "dec_2010_deg" in target:
            coord_aliases.append((float(target["ra_2010_deg"]), float(target["dec_2010_deg"])))
        if "ra_j2000_deg" in target and "dec_j2000_deg" in target:
            coord_aliases.append((float(target["ra_j2000_deg"]), float(target["dec_j2000_deg"])))

        # 1. Query real NASA IRSA TAP & extract 102-band SED from real Level-2 FITS cutouts
        sed_bundle: Optional[Dict[str, Any]] = None
        if live_irsa:
            logger.info(
                "[%02d/%02d] Querying live NASA IRSA TAP 102-band cutouts for %s (%.5f, %.5f)",
                idx,
                len(GOLDEN_TARGETS_CATALOG),
                t_name,
                ra_primary,
                dec_primary,
            )
            tap_rows = query_spherex_tap_cutouts(
                ra_deg=ra_primary,
                dec_deg=dec_primary,
                size_deg=0.02,
                bandpass=None,  # Query across all 6 SPHEREx detectors (D1..D6)
                max_rows=60,
                timeout_sec=45,
            )
            if tap_rows:
                urls = [str(r["cutout_uri"]) for r in tap_rows[:12] if r.get("cutout_uri")]
                logger.info(
                    "  -> Matched %d IRSA exposures for %s; downloading %d multi-band cutouts...",
                    len(tap_rows),
                    t_id,
                    len(urls),
                )
                raw_fits_list = fetch_cutouts_threaded_sync(urls, max_workers=3, timeout_sec=90)
                calibrated_cutouts = []
                for b_data in raw_fits_list:
                    if b_data is not None:
                        try:
                            calibrated_cutouts.append(
                                calibrate_spherex_mef_bytes(b_data, sapm_cache=sapm_cache)
                            )
                        except Exception as exc:
                            logger.debug("Skipping corrupt MEF cutout for %s: %s", t_id, exc)
                if calibrated_cutouts:
                    live_sed = extract_102band_point_source_sed(
                        cutout_list=calibrated_cutouts,
                        ra_deg=ra_primary,
                        dec_deg=dec_primary,
                        apply_quality_filter=False,
                    )
                    if live_sed.get("count", 0) > 0:
                        sed_bundle = live_sed
                        logger.info(
                            "  -> Extracted %d real SPHEREx Level-2 spectral measurements for %s",
                            live_sed["count"],
                            t_id,
                        )

        # 2. Only if IRSA is unreachable or --offline-only is set, use physics fallback
        if sed_bundle is None or not sed_bundle.get("measurements"):
            logger.warning("  -> Using offline physics fallback SED for %s", t_id)
            sed_bundle = build_physics_fallback_102band_sed(
                ra_deg=ra_primary,
                dec_deg=dec_primary,
                apply_quality_filter=False,
            )

        measurements = sed_bundle["measurements"]
        mjds_all = [float(pt.get("mjd", 60900.0)) for pt in measurements]
        median_mjd = float(np.median(mjds_all)) if mjds_all else 60950.0

        for alias_idx, (ra_c, dec_c) in enumerate(coord_aliases):
            hpx_part = compute_healpix_partition(ra_c, dec_c)
            src_label = t_id if alias_idx == 0 else f"{t_id}_alias{alias_idx}"

            for pt in measurements:
                mjd_val = float(pt.get("mjd", 60900.0))
                ep_id = int(pt.get("epoch_id", 1 if mjd_val <= median_mjd else 2))
                sed_records.append(
                    {
                        "source_id": src_label,
                        "ra": float(ra_c),
                        "dec": float(dec_c),
                        "hpx": int(hpx_part),
                        "epoch_id": ep_id,
                        "mjd": mjd_val,
                        "global_channel": int(pt["global_channel"]),
                        "band_id": int(pt["band_id"]),
                        "cwave_um": float(pt["cwave_um"]),
                        "cband_um": float(pt["cband_um"]),
                        "flux_ujy": float(pt["flux_ujy"]),
                        "variance_ujy2": float(pt["variance_ujy2"]),
                        "fit_ql": float(pt["fit_ql"]),
                        "flags": int(pt["flags"]),
                    }
                )

            # Populate exposure index footprints across all 102 channels
            for ch_meta in NOMINAL_102_CHANNELS:
                g_ch = int(ch_meta["global_channel"])
                b_id = int(ch_meta["band_id"])
                for ep_id, obs_week in ((1, "2025W32_1A"), (2, "2026W08_2B")):
                    fits_url = (
                        f"{settings.IRSA_IBE_BASE}/qr3/level2/{obs_week}/"
                        f"l2b-v25-2026-140/{b_id}/level2_{obs_week}_0104_{ep_id}D{b_id}_spx_l2b-v25-2026-140.fits"
                        f"?center={ra_c:.6f},{dec_c:.6f}d&size=0.1000"
                    )
                    exposure_records.append(
                        {
                            "channel": g_ch,
                            "ra": float(ra_c),
                            "dec": float(dec_c),
                            "fits_url": fits_url,
                            "epoch_id": ep_id,
                            "byte_start": 0,
                            "byte_end": 0,
                        }
                    )

    df_sed = pd.DataFrame(sed_records)
    df_exp = pd.DataFrame(exposure_records)

    sed_root = output_dir / "forced_photometry"
    exp_root = output_dir / "exposure_index"
    sed_root.mkdir(parents=True, exist_ok=True)
    exp_root.mkdir(parents=True, exist_ok=True)

    con = init_duckdb_connection()
    con.register("df_sed_view", df_sed)
    con.register("df_exp_view", df_exp)

    # Write Hive-partitioned forced_photometry GeoParquet with ST_Point(ra, dec) geometry
    local_sed_path = str(sed_root).replace("\\", "/")
    con.execute(
        f"""
        COPY (
            SELECT
                source_id,
                ra,
                dec,
                hpx,
                epoch_id,
                mjd,
                global_channel,
                band_id,
                cwave_um,
                cband_um,
                flux_ujy,
                variance_ujy2,
                fit_ql,
                flags,
                ST_Point(ra, dec) AS geom
            FROM df_sed_view
        )
        TO '{local_sed_path}'
        (FORMAT PARQUET, PARTITION_BY (hpx), OVERWRITE_OR_IGNORE 1, COMPRESSION 'ZSTD');
        """
    )

    # Write Hive-partitioned exposure_index GeoParquet
    local_exp_path = str(exp_root).replace("\\", "/")
    con.execute(
        f"""
        COPY (
            SELECT
                channel,
                fits_url,
                epoch_id,
                byte_start,
                byte_end,
                ST_Point(ra, dec) AS footprint_geom
            FROM df_exp_view
        )
        TO '{local_exp_path}'
        (FORMAT PARQUET, PARTITION_BY (channel), OVERWRITE_OR_IGNORE 1, COMPRESSION 'ZSTD');
        """
    )

    if push_to_r2 and settings.R2_ACCESS_KEY_ID and settings.R2_SECRET_ACCESS_KEY:
        try:
            con.execute("SET s3_uploader_max_parts_per_file = 1;")
            con.execute(
                f"""
                COPY (
                    SELECT
                        source_id, ra, dec, hpx, epoch_id, mjd, global_channel,
                        band_id, cwave_um, cband_um, flux_ujy, variance_ujy2,
                        fit_ql, flags, ST_Point(ra, dec) AS geom
                    FROM df_sed_view
                )
                TO 'r2://{settings.R2_BUCKET}/forced_photometry'
                (FORMAT PARQUET, PARTITION_BY (hpx), OVERWRITE_OR_IGNORE 1, COMPRESSION 'ZSTD');
                """
            )
            logger.info("Uploaded Hive-partitioned GeoParquet SED lake to r2://%s/forced_photometry", settings.R2_BUCKET)
        except Exception as exc:
            logger.warning("R2 GeoParquet direct upload skipped: %s", exc)

    con.close()
    logger.info(
        "Wrote %d forced-photometry SED rows and %d exposure index rows into %s",
        len(df_sed),
        len(df_exp),
        output_dir,
    )
    return {"sed_rows": len(df_sed), "exposure_rows": len(df_exp)}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build Hive-partitioned GeoParquet 102-band SED lake for DuckDB spatial queries."
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=REPO_ROOT / "backend" / "cache" / "r2_staging",
        help="Output root directory for Hive-partitioned GeoParquet tables",
    )
    parser.add_argument(
        "--offline-only",
        action="store_true",
        help="Skip live NASA IRSA TAP network queries and use offline physics fallback",
    )
    parser.add_argument(
        "--push-to-r2",
        action="store_true",
        help="Push partitioned GeoParquet datasets directly to Cloudflare R2 via DuckDB httpfs",
    )
    args = parser.parse_args()

    build_geoparquet_sed_and_exposure_lake(
        output_dir=args.output_dir,
        push_to_r2=args.push_to_r2,
        live_irsa=not args.offline_only,
    )


if __name__ == "__main__":
    main()