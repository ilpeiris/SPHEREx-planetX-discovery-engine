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
Zero-Delay Caltech/IPAC IRSA SIAv2 & ADQL TAP Discovery Client and
High-Concurrency aiohttp / ThreadPoolExecutor IBE Cutout Streamer.
"""

from __future__ import annotations

import asyncio
import io
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, List, Optional, Sequence, Tuple

import aiohttp
import pandas as pd
import requests
from astropy.io.votable import parse_single_table

from app.config import settings

logger = logging.getLogger(__name__)


def _normalize_spherex_bandpass(bandpass: Optional[str]) -> Optional[str]:
    """
    Normalize bandpass string to the exact indexed IRSA CAOM convention
    ('SPHEREx-D1' .. 'SPHEREx-D6') so PostgreSQL uses its B-tree index without UPPER().
    """
    if not bandpass:
        return None
    s = str(bandpass).strip().upper().replace("_", "-")
    for k in range(1, 7):
        if s.endswith(f"D{k}"):
            return f"SPHEREx-D{k}"
    return str(bandpass).strip()


# ============================================================================
# 1. CONSOLIDATED ZERO-DELAY ADQL TAP QUERY BUILDER & SIAv2 FAST DISCOVERY
# ============================================================================
def build_spherex_tap_adql(
    ra_deg: float,
    dec_deg: float,
    size_deg: float = 0.1,
    bandpass: Optional[str] = None,
    mjd_min: Optional[float] = None,
    mjd_max: Optional[float] = None,
    max_rows: int = 120,
) -> str:
    """
    Construct a single consolidated ADQL query against IRSA's CAOM tables
    (`spherex.artifact` joined with `spherex.plane`) matching the exact
    Caltech-IPAC `spherex_cutouts` tutorial schema and preserving index usage.
    """
    ra = float(ra_deg)
    dec = float(dec_deg)
    cutout_deg = max(0.01, min(1.0, float(size_deg)))

    where_clauses = [
        f"1 = CONTAINS(POINT('ICRS', {ra:.7f}, {dec:.7f}), p.poly)",
    ]

    exact_bp = _normalize_spherex_bandpass(bandpass)
    if exact_bp:
        where_clauses.append(f"p.energy_bandpassname = '{exact_bp}'")
    else:
        where_clauses.append(
            "p.energy_bandpassname IN ('SPHEREx-D1', 'SPHEREx-D2', 'SPHEREx-D3', 'SPHEREx-D4', 'SPHEREx-D5', 'SPHEREx-D6')"
        )

    if mjd_min is not None:
        where_clauses.append(f"p.time_bounds_lower >= {float(mjd_min):.5f}")
    if mjd_max is not None:
        where_clauses.append(f"p.time_bounds_lower <= {float(mjd_max):.5f}")

    where_sql = " AND ".join(where_clauses)

    adql = f"""
    SELECT TOP {int(max_rows)}
        'https://irsa.ipac.caltech.edu/' || a.uri || '?center={ra:.7f},{dec:.7f}d&size={cutout_deg:.4f}' AS cutout_uri,
        'https://irsa.ipac.caltech.edu/' || a.uri AS full_mef_uri,
        p.energy_bandpassname AS bandpass,
        p.time_bounds_lower AS mjd_obs
    FROM spherex.artifact a
    JOIN spherex.plane p ON a.planeid = p.planeid
    WHERE {where_sql}
    ORDER BY p.time_bounds_lower ASC
    """.strip()

    return adql


def _query_irsa_siav2_fast(
    ra_deg: float,
    dec_deg: float,
    size_deg: float = 0.1,
    bandpass: Optional[str] = None,
    collection: str = "spherex_qr2",
    timeout_sec: int = 10,
) -> List[Dict[str, Any]]:
    """
    Fast pre-indexed IVOA SIAv2 query (`https://irsa.ipac.caltech.edu/SIA`).
    """
    ra = float(ra_deg)
    dec = float(dec_deg)
    cutout_deg = max(0.01, min(1.0, float(size_deg)))
    exact_bp = _normalize_spherex_bandpass(bandpass)

    params = {
        "COLLECTION": collection,
        "POS": f"circle {ra:.6f} {dec:.6f} 0.01",
        "RESPONSEFORMAT": "VOTABLE",
    }
    try:
        resp = requests.get(settings.IRSA_SIA_URL, params=params, timeout=timeout_sec)
        if resp.status_code != 200 or b"<TABLEDATA" not in resp.content.upper():
            return []

        vot_table = parse_single_table(io.BytesIO(resp.content)).to_table()
        results: List[Dict[str, Any]] = []
        for row in vot_table:
            access_url = str(row["access_url"]) if "access_url" in vot_table.colnames else ""
            if not access_url.startswith("http"):
                continue
            bp = str(row["energy_bandpassname"]) if "energy_bandpassname" in vot_table.colnames else "SPHEREx-D4"
            if exact_bp and _normalize_spherex_bandpass(bp) != exact_bp:
                continue
            mjd_val = float(row["time_bounds_lower"]) if "time_bounds_lower" in vot_table.colnames else 60900.0

            cutout_uri = (
                access_url
                if "?center=" in access_url
                else f"{access_url}?center={ra:.7f},{dec:.7f}d&size={cutout_deg:.4f}"
            )
            results.append(
                {
                    "cutout_uri": cutout_uri,
                    "full_mef_uri": access_url,
                    "bandpass": bp,
                    "mjd_obs": mjd_val,
                }
            )
        results.sort(key=lambda r: float(r.get("mjd_obs", 0.0)))
        return results
    except Exception:
        return []


def query_spherex_tap_cutouts(
    ra_deg: float,
    dec_deg: float,
    size_deg: float = 0.1,
    bandpass: Optional[str] = None,
    collection: str = "spherex_qr2",
    mjd_min: Optional[float] = None,
    mjd_max: Optional[float] = None,
    max_rows: int = 120,
    timeout_sec: int = 12,
) -> List[Dict[str, Any]]:
    """
    Locked Contract #3 Function:
    1. Queries IRSA's pre-indexed SIAv2 service (`spherex_qr2` / `spherex_qr3`) first
       for ~1s spatial cone lookup.
    2. Queries IRSA's indexed ADQL TAP service (`/TAP/sync`) if SIAv2 returns 0 rows.
    """
    # Step 1: Fast pre-indexed SIAv2 cone search
    for coll in (collection, "spherex_qr3", "spherex_qr2_deep", "spherex_qr3_deep"):
        rows = _query_irsa_siav2_fast(
            ra_deg=ra_deg,
            dec_deg=dec_deg,
            size_deg=size_deg,
            bandpass=bandpass,
            collection=coll,
            timeout_sec=8,
        )
        if rows:
            return rows[:max_rows]

    # Step 2: Indexed ADQL TAP query (no UPPER() function on energy_bandpassname)
    adql = build_spherex_tap_adql(
        ra_deg=ra_deg,
        dec_deg=dec_deg,
        size_deg=size_deg,
        bandpass=bandpass,
        mjd_min=mjd_min,
        mjd_max=mjd_max,
        max_rows=max_rows,
    )
    tap_sync_url = f"{settings.IRSA_TAP_URL.rstrip('/')}/sync"
    try:
        resp = requests.post(
            tap_sync_url,
            data={
                "REQUEST": "doQuery",
                "LANG": "ADQL",
                "FORMAT": "csv",
                "QUERY": adql,
            },
            timeout=timeout_sec,
        )
        if resp.status_code == 200 and "cutout_uri" in resp.text[:512]:
            df = pd.read_csv(io.StringIO(resp.text))
            if not df.empty:
                return df.to_dict(orient="records")
    except Exception as exc:
        logger.debug("IRSA TAP lookup note for (%.4f, %.4f): %s", ra_deg, dec_deg, exc)

    return []


# ============================================================================
# 2. HIGH-SPEED ASYNC & THREADED IBE CUTOUT STREAMERS
# ============================================================================
async def _fetch_single_fits_cutout(
    session: aiohttp.ClientSession,
    url: str,
    byte_range: Optional[Tuple[int, int]] = None,
    max_retries: int = 3,
    timeout_sec: int = 40,
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
                    await asyncio.sleep(0.6 * (attempt + 1))
                else:
                    return None
        except Exception:
            if attempt < max_retries - 1:
                await asyncio.sleep(0.5 * (attempt + 1))
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
        connector = aiohttp.TCPConnector(limit=settings.AIOHTTP_MAX_CONNECTIONS, ssl=False)
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
    max_workers: int = 10,
    timeout_sec: int = 40,
) -> List[Optional[bytes]]:
    if not cutout_urls:
        return []

    def _download_one(url: str) -> Optional[bytes]:
        for _ in range(3):
            try:
                r = requests.get(url, timeout=timeout_sec)
                if r.status_code == 200 and len(r.content) >= 2880 and r.content[:6] == b"SIMPLE":
                    return r.content
            except Exception:
                pass
        return None

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        return list(pool.map(_download_one, cutout_urls))


def query_3i_atlas_cutouts(
    campaign: str = "all",
    size_deg: float = 0.105,
) -> List[Dict[str, Any]]:
    try:
        resp = requests.get(settings.IRSA_3I_ATLAS_VOT_URL, timeout=15)
        if resp.status_code == 200 and b"<TABLEDATA" in resp.content.upper():
            vot = parse_single_table(io.BytesIO(resp.content)).to_table()
            records: List[Dict[str, Any]] = []
            for row in vot:
                ra_c = float(row["comet_ra"]) if "comet_ra" in vot.colnames else float(row["s_ra"])
                dec_c = float(row["comet_dec"]) if "comet_dec" in vot.colnames else float(row["s_dec"])
                mjd_c = float(row["t_min"]) if "t_min" in vot.colnames else 60897.5
                access_url = str(row["access_url"])

                if campaign == "aug2025" and mjd_c > 60950.0:
                    continue
                if campaign == "dec2025" and mjd_c < 60950.0:
                    continue

                cutout_uri = f"{access_url}?center={ra_c:.7f},{dec_c:.7f}d&size={size_deg:.4f}"
                records.append(
                    {
                        "cutout_uri": cutout_uri,
                        "full_mef_uri": access_url,
                        "comet_ra": ra_c,
                        "comet_dec": dec_c,
                        "mjd_obs": mjd_c,
                        "bandpass": str(row["em_ucd"]) if "em_ucd" in vot.colnames else "SPHEREx-D5",
                    }
                )
            return records
    except Exception:
        pass

    aug_records = query_spherex_tap_cutouts(246.3667, -16.7420, size_deg=size_deg)
    dec_records = query_spherex_tap_cutouts(170.1887, +4.1001, size_deg=size_deg)
    if campaign == "aug2025":
        return aug_records
    if campaign == "dec2025":
        return dec_records
    return aug_records + dec_records