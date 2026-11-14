# ==============================================================================
# Author:     M.D.Isuru Lakmal Peiris (@ilpeiris)
# Project:    SPHEREx x Planet X (2026 NASA International Space Apps Challenge)
# Repository: https://github.com/ilpeiris/SPHEREx-planetX-discovery-engine
# LinkedIn:   https://www.linkedin.com/in/ilpeiris
# Github:     https://github.com/ilpeiris/
# License:    MIT License | Copyright (c) 2026 M.D.Isuru Lakmal Peiris
# ==============================================================================

# backend/app/irsa_client.py
"""
Fast Spatial-Index Caltech/IPAC IRSA ADQL TAP Discovery Client and
Controlled-Concurrency IBE Cutout Streamer.
"""

from __future__ import annotations

import asyncio
import io
import logging
import re
import time
import warnings
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, List, Optional, Sequence, Tuple

import aiohttp
import numpy as np
import pandas as pd
import requests
from astropy.io.votable import parse_single_table
from astropy.utils.exceptions import AstropyWarning

from app.config import SPHEREX_DETECTORS, settings

# Silence repetitive Astropy SIP header info banners during bulk FITS reprojection
warnings.simplefilter("ignore", AstropyWarning)
logging.getLogger("astropy").setLevel(logging.ERROR)
logging.getLogger("reproject").setLevel(logging.WARNING)

logger = logging.getLogger(__name__)


def _normalize_spherex_bandpass(bandpass: Optional[str]) -> Optional[str]:
    if not bandpass:
        return None
    s = str(bandpass).strip().upper().replace("_", "-")
    for k in range(1, 7):
        if s.endswith(f"D{k}"):
            return f"SPHEREx-D{k}"
    return str(bandpass).strip()


def _get_dichroic_partner_bandpass(exact_bp: Optional[str]) -> Optional[str]:
    if not exact_bp:
        return None
    m = re.search(r"D([1-6])$", exact_bp)
    if not m:
        return None
    det_id = int(m.group(1))
    partner_id = SPHEREX_DETECTORS[det_id].dichroic_partner
    return f"SPHEREx-D{partner_id}"


def _infer_mjd_from_uri_or_row(row_mjd: Any, uri: str) -> float:
    try:
        val = float(row_mjd)
        if np.isfinite(val) and val > 58000.0:
            return val
    except Exception:
        pass

    match = re.search(r"(202\d)W(\d{2})", str(uri))
    if match:
        year = int(match.group(1))
        week = int(match.group(2))
        base_mjd = 60676.0 if year == 2025 else 61041.0
        return base_mjd + week * 7.0

    return 60900.0


def _stratify_multi_epoch_and_band_rows(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Interleave earliest (Epoch 1) and latest (Epoch 2) observations across
    detectors so slicing `rows[:4]` or `rows[:12]` always spans multiple epochs.
    """
    if len(rows) <= 2:
        return rows

    rows_sorted = sorted(rows, key=lambda r: float(r.get("mjd_obs", 60900.0)))
    by_bp: Dict[str, List[Dict[str, Any]]] = {}
    for r in rows_sorted:
        bp = _normalize_spherex_bandpass(r.get("bandpass")) or "SPHEREx-D4"
        by_bp.setdefault(bp, []).append(r)

    per_bp_interleaved: Dict[str, List[Dict[str, Any]]] = {}
    for bp, bp_list in by_bp.items():
        interleaved: List[Dict[str, Any]] = []
        left = 0
        right = len(bp_list) - 1
        while left <= right:
            interleaved.append(bp_list[left])
            if left != right:
                interleaved.append(bp_list[right])
            left += 1
            right -= 1
        per_bp_interleaved[bp] = interleaved

    stratified: List[Dict[str, Any]] = []
    bp_keys = sorted(per_bp_interleaved.keys())
    max_len = max(len(v) for v in per_bp_interleaved.values())
    for i in range(max_len):
        for bp in bp_keys:
            if i < len(per_bp_interleaved[bp]):
                stratified.append(per_bp_interleaved[bp][i])

    return stratified


def build_spherex_tap_adql(
    ra_deg: float,
    dec_deg: float,
    size_deg: float = 0.1,
    max_rows: int = 120,
) -> str:
    """
    Pure spatial-index ADQL query (`WHERE 1 = CONTAINS(POINT('ICRS', ra, dec), p.poly)`).
    Omits SQL `energy_bandpassname` and `ORDER BY` clauses so IRSA PostgreSQL
    uses its spatial R-tree index on `p.poly` exclusively (~2s execution).
    All bandpass filtering and MJD sorting happen in Python in <1ms.
    """
    ra = float(ra_deg)
    dec = float(dec_deg)
    cutout_deg = max(0.01, min(0.5, float(size_deg)))

    return f"""
    SELECT TOP {int(max_rows)}
        'https://irsa.ipac.caltech.edu/' || a.uri || '?center={ra:.7f},{dec:.7f}d&size={cutout_deg:.4f}' AS cutout_uri,
        'https://irsa.ipac.caltech.edu/' || a.uri AS full_mef_uri,
        p.energy_bandpassname AS bandpass,
        p.time_bounds_lower AS mjd_obs
    FROM spherex.artifact a
    JOIN spherex.plane p ON a.planeid = p.planeid
    WHERE 1 = CONTAINS(POINT('ICRS', {ra:.7f}, {dec:.7f}), p.poly)
    """.strip()


def query_spherex_tap_cutouts(
    ra_deg: float,
    dec_deg: float,
    size_deg: float = 0.1,
    bandpass: Optional[str] = None,
    collection: str = "spherex_dr1",
    mjd_min: Optional[float] = None,
    mjd_max: Optional[float] = None,
    max_rows: int = 120,
    timeout_sec: int = 300,
) -> List[Dict[str, Any]]:
    """
    Query IRSA's `/TAP/sync` endpoint using the fast spatial-only predicate,
    then filter by `bandpass` (or simultaneous dichroic partner) and sort by
    `mjd_obs` in Python.
    """
    adql = build_spherex_tap_adql(
        ra_deg=ra_deg,
        dec_deg=dec_deg,
        size_deg=size_deg,
        max_rows=max(120, int(max_rows)),
    )
    tap_sync_url = f"{settings.IRSA_TAP_URL.rstrip('/')}/sync"
    exact_bp = _normalize_spherex_bandpass(bandpass)
    partner_bp = _get_dichroic_partner_bandpass(exact_bp)

    for attempt in range(1, 7):
        try:
            resp = requests.post(
                tap_sync_url,
                data={
                    "REQUEST": "doQuery",
                    "LANG": "ADQL",
                    "FORMAT": "csv",
                    "QUERY": adql,
                },
                timeout=max(300, int(timeout_sec)),
            )
            if resp.status_code == 200 and "cutout_uri" in resp.text[:512]:
                df = pd.read_csv(io.StringIO(resp.text))
                if df.empty:
                    return []

                all_rows: List[Dict[str, Any]] = []
                exact_rows: List[Dict[str, Any]] = []
                partner_rows: List[Dict[str, Any]] = []

                for r in df.to_dict(orient="records"):
                    full_u = str(r.get("full_mef_uri", ""))
                    if not full_u.endswith(".fits"):
                        continue

                    m_det = re.search(r"D([1-6])_spx", full_u)
                    if m_det:
                        norm_bp = f"SPHEREx-D{m_det.group(1)}"
                    else:
                        norm_bp = _normalize_spherex_bandpass(str(r.get("bandpass", ""))) or "SPHEREx-D4"

                    mjd_val = _infer_mjd_from_uri_or_row(r.get("mjd_obs"), full_u)
                    if mjd_min is not None and mjd_val < float(mjd_min):
                        continue
                    if mjd_max is not None and mjd_val > float(mjd_max):
                        continue

                    r["bandpass"] = norm_bp
                    r["mjd_obs"] = mjd_val
                    all_rows.append(r)

                    if exact_bp and norm_bp == exact_bp:
                        exact_rows.append(r)
                    elif partner_bp and norm_bp == partner_bp:
                        partner_rows.append(r)

                if exact_bp:
                    if len(exact_rows) >= 2:
                        selected = exact_rows
                    elif len(exact_rows) + len(partner_rows) >= 2:
                        selected = exact_rows + partner_rows
                    else:
                        selected = all_rows
                else:
                    selected = all_rows

                return _stratify_multi_epoch_and_band_rows(selected)[:max_rows]
        except Exception as exc:
            logger.warning(
                "IRSA TAP attempt %d/3 note for (%.4f, %.4f): %s",
                attempt,
                ra_deg,
                dec_deg,
                exc,
            )
            time.sleep(3.0 * attempt)

    return []


async def _fetch_single_fits_cutout(
    session: aiohttp.ClientSession,
    url: str,
    byte_range: Optional[Tuple[int, int]] = None,
    max_retries: int = 3,
    timeout_sec: int = 60,
) -> Optional[bytes]:
    headers: Dict[str, str] = {"User-Agent": "SPHEREx-PlanetX-DiscoveryEngine/2026.1"}
    if byte_range is not None and byte_range[1] > byte_range[0]:
        headers["Range"] = f"bytes={int(byte_range[0])}-{int(byte_range[1])}"

    client_timeout = aiohttp.ClientTimeout(total=timeout_sec)
    for attempt in range(max_retries):
        try:
            async with session.get(url, headers=headers, timeout=client_timeout) as resp:
                if resp.status in (200, 206):
                    payload = await resp.read()
                    if len(payload) >= 2880 and payload[:6] == b"SIMPLE":
                        return payload
                elif resp.status in (429, 502, 503, 504):
                    await asyncio.sleep(0.8 * (attempt + 1))
                else:
                    return None
        except Exception:
            if attempt < max_retries - 1:
                await asyncio.sleep(0.8 * (attempt + 1))
    return None


async def fetch_cutouts_parallel_async(
    session: Optional[aiohttp.ClientSession],
    cutout_urls: Sequence[str],
    byte_ranges: Optional[Sequence[Optional[Tuple[int, int]]]] = None,
) -> List[Optional[bytes]]:
    if not cutout_urls:
        return []

    ranges: List[Optional[Tuple[int, int]]] = (
        list(byte_ranges) if byte_ranges is not None else [None] * len(cutout_urls)
    )

    owns_session = session is None
    if owns_session:
        connector = aiohttp.TCPConnector(limit=8, ssl=False)
        session = aiohttp.ClientSession(connector=connector)

    assert session is not None
    try:
        tasks = [
            _fetch_single_fits_cutout(
                session=session,
                url=url,
                byte_range=ranges[idx] if idx < len(ranges) else None,
                timeout_sec=settings.HTTP_TIMEOUT_SECONDS,
            )
            for idx, url in enumerate(cutout_urls)
        ]
        results = await asyncio.gather(*tasks, return_exceptions=False)
        return list(results)
    finally:
        if owns_session:
            await session.close()


def fetch_cutouts_threaded_sync(
    cutout_urls: Sequence[str],
    max_workers: int = 2,
    timeout_sec: int = 300,
) -> List[Optional[bytes]]:
    if not cutout_urls:
        return []

    total = len(cutout_urls)
    workers = max(1, min(2, int(max_workers)))

    def _download_one(idx_and_url: Tuple[int, str]) -> Optional[bytes]:
        idx, url = idx_and_url
        short_name = url.split("/")[-1].split("?")[0]
        for attempt in range(1, 10):
            try:
                r = requests.get(
                    url,
                    headers={"User-Agent": "SPHEREx-PlanetX-DiscoveryEngine/2026.1"},
                    timeout=max(300, int(timeout_sec)),
                )
                if r.status_code == 200 and len(r.content) >= 2880 and r.content[:6] == b"SIMPLE":
                    logger.info(
                        "    [Cutout %d/%d] Downloaded %.2f MB (%s)",
                        idx + 1,
                        total,
                        len(r.content) / (1024.0 * 1024.0),
                        short_name,
                    )
                    return r.content
                logger.warning(
                    "    [Cutout %d/%d] HTTP %d on attempt %d/6 for %s — waiting %ds...",
                    idx + 1,
                    total,
                    r.status_code,
                    attempt,
                    short_name,
                    2 * attempt,
                )
            except Exception as exc:
                logger.warning(
                    "    [Cutout %d/%d] Attempt %d/6 failed for %s: %s",
                    idx + 1,
                    total,
                    attempt,
                    short_name,
                    exc,
                )
            time.sleep(2.0 * attempt)
        return None

    with ThreadPoolExecutor(max_workers=workers) as pool:
        return list(pool.map(_download_one, enumerate(cutout_urls)))


def query_3i_atlas_cutouts(
    campaign: str = "all",
    size_deg: float = 0.105,
) -> List[Dict[str, Any]]:
    aug_records = query_spherex_tap_cutouts(246.3667, -16.7420, size_deg=size_deg)
    dec_records = query_spherex_tap_cutouts(170.1887, +4.1001, size_deg=size_deg)
    if campaign == "aug2025":
        return aug_records
    if campaign == "dec2025":
        return dec_records
    return aug_records + dec_records