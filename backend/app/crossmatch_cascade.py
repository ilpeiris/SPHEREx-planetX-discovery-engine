# ==============================================================================
# Author:     M.D.Isuru Lakmal Peiris (@ilpeiris) 
# Project:    SPHEREx x Planet X (2026 NASA International Space Apps Challenge)
# Repository: https://github.com/ilpeiris/SPHEREx-planetX-discovery-engine
# LinkedIn:   https://www.linkedin.com/in/ilpeiris
# Github:     https://github.com/ilpeiris/
# License:    MIT License | Copyright (c) 2026 M.D.Isuru Lakmal Peiris
# ==============================================================================

# backend/app/crossmatch_cascade.py
"""
5-Stage Live Known-Object Cross-Matching Cascade & 4-Tier STScI MAST + ESA
Gaia DR3 High-Availability Failover Engine (Micro-Safeguard #3 Enforced):
  - Stage 1: Gaia DR3 (Tier 1a STScI MAST Postgres VO-TAP -> Tier 1b STScI MAST
             VO-ConeSearch -> Tier 1c ESA Gaia TAP+ EPOCH_PROP_POS -> Tier 1d
             STScI AWS S3 HATS Parquet via LSDB) with Python SkyCoord.apply_space_motion()
  - Stage 2: CDS SIMBAD TAP (Optically faint L/T/Y Brown Dwarfs, PM*, YSOs, AGNs)
  - Stage 3: IMCCE SkyBoT ConeSearch (Known Asteroids, Planets, Comets)
  - Stage 4: JPL Small-Body Identification API (`sb_ident.api`, 2-Pass N-Body)
  - Stage 5: Minor Planet Center (`cnd` API), IRSA `SPLICES v8.6` Ice Catalog,
             and CSA CADC `NEOSSAT` Resident Space Object / Debris Disambiguation.
"""

from __future__ import annotations

import io
import logging
from typing import Any, Dict, List, Optional, Sequence, Tuple

import astropy.units as u
import numpy as np
import pandas as pd
import requests
from astropy.coordinates import Distance, SkyCoord
from astropy.io.votable import parse_single_table
from astropy.time import Time

from app.config import settings

logger = logging.getLogger(__name__)


# ============================================================================
# 1. JPL SB_IDENT SEXAGESIMAL FORMATTER (NEGATIVE '-' REPLACED WITH 'M')
# ============================================================================
def format_jpl_sexagesimal(coord: SkyCoord) -> Tuple[str, str]:
    """
    Format an Astropy SkyCoord into JPL `sb_ident.api` sexagesimal syntax:
    `hh-mm-ss.ss` and `dd-mm-ss.ss`, replacing any negative sign `-` with `M`
    (e.g., `M07-14-42.53`).
    """
    ra_hms = coord.ra.hms
    ra_str = f"{int(ra_hms.h):02d}-{int(ra_hms.m):02d}-{float(ra_hms.s):05.2f}"

    dec_dms = coord.dec.signed_dms
    sign_char = "M" if dec_dms.sign < 0 else ""
    dec_str = (
        f"{sign_char}{abs(int(dec_dms.d)):02d}-"
        f"{abs(int(dec_dms.m)):02d}-{abs(float(dec_dms.s)):05.2f}"
    )
    return ra_str, dec_str


# ============================================================================
# 2. PYTHON-SIDE PROPER MOTION PROPAGATION (MICRO-SAFEGUARD #3)
# ============================================================================
def _propagate_j2016_df_to_obs_mjd(
    df: pd.DataFrame,
    target_ra_deg: float,
    target_dec_deg: float,
    obs_mjd: float,
    match_tol_arcsec: float = 6.0,
    endpoint_label: str = "MAST_VO_TAP",
) -> List[Dict[str, Any]]:
    """
    Micro-Safeguard #3 Implementation:
    Propagate a DataFrame of J2016.0 Gaia DR3 sources retrieved from STScI MAST
    (Tiers 1a, 1b, 1d) to `obs_mjd` in Python using `SkyCoord.apply_space_motion()`
    and filter to matches within `match_tol_arcsec` of `(target_ra_deg, target_dec_deg)`.
    """
    if df.empty:
        return []

    col_map = {c.lower(): c for c in df.columns}
    ra_col = col_map.get("ra")
    dec_col = col_map.get("dec")
    if not ra_col or not dec_col:
        return []

    ra_j2016 = pd.to_numeric(df[ra_col], errors="coerce").to_numpy(dtype=np.float64)
    dec_j2016 = pd.to_numeric(df[dec_col], errors="coerce").to_numpy(dtype=np.float64)

    pmra_col = col_map.get("pmra")
    pmdec_col = col_map.get("pmdec")
    plx_col = col_map.get("parallax")
    gmag_col = col_map.get("phot_g_mean_mag")
    id_col = col_map.get("source_id") or col_map.get("designation")
    gal_col = col_map.get("classprob_dsc_combmod_galaxy")

    pmra = (
        np.nan_to_num(pd.to_numeric(df[pmra_col], errors="coerce").to_numpy(dtype=np.float64), nan=0.0)
        if pmra_col
        else np.zeros_like(ra_j2016)
    )
    pmdec = (
        np.nan_to_num(pd.to_numeric(df[pmdec_col], errors="coerce").to_numpy(dtype=np.float64), nan=0.0)
        if pmdec_col
        else np.zeros_like(dec_j2016)
    )
    plx = (
        np.nan_to_num(pd.to_numeric(df[plx_col], errors="coerce").to_numpy(dtype=np.float64), nan=0.0)
        if plx_col
        else np.zeros_like(ra_j2016)
    )

    t_j2016 = Time(2016.0, format="jyear", scale="tcb")
    t_obs = Time(float(obs_mjd), format="mjd", scale="utc")

    try:
        # Clamp parallax to positive values for Distance construction when needed
        safe_plx_mas = np.where(plx > 0.05, plx, 1.0)
        coords_2016 = SkyCoord(
            ra=ra_j2016 * u.deg,
            dec=dec_j2016 * u.deg,
            pm_ra_cosdec=pmra * (u.mas / u.yr),
            pm_dec=pmdec * (u.mas / u.yr),
            distance=Distance(parallax=safe_plx_mas * u.mas),
            obstime=t_j2016,
            frame="icrs",
        )
        coords_obs = coords_2016.apply_space_motion(new_obstime=t_obs)
        ra_obs = coords_obs.ra.deg
        dec_obs = coords_obs.dec.deg
    except Exception:
        # Linear spherical astrometric propagation fallback:
        # delta(t) = delta_0 + mu_delta * dt; alpha(t) = alpha_0 + (mu_alpha* * dt) / cos(delta)
        dt_yr = float(t_obs.jyear) - 2016.0
        dec_obs = dec_j2016 + (pmdec * 1e-3 / 3600.0) * dt_yr
        cos_dec = np.maximum(0.05, np.cos(np.radians(dec_j2016)))
        ra_obs = ra_j2016 + ((pmra * 1e-3 / 3600.0) * dt_yr) / cos_dec

    target_coord = SkyCoord(ra=float(target_ra_deg) * u.deg, dec=float(target_dec_deg) * u.deg, frame="icrs")
    prop_coords = SkyCoord(ra=ra_obs * u.deg, dec=dec_obs * u.deg, frame="icrs")
    sep_arcsec = target_coord.separation(prop_coords).arcsec

    matches: List[Dict[str, Any]] = []
    for idx in np.where(sep_arcsec <= float(match_tol_arcsec))[0]:
        i = int(idx)
        matches.append(
            {
                "source_id": str(df[id_col].iloc[i]) if id_col else f"GAIA_{i}",
                "ra_j2016": float(round(ra_j2016[i], 7)),
                "dec_j2016": float(round(dec_j2016[i], 7)),
                "ra_obs": float(round(float(ra_obs[i]), 7)),
                "dec_obs": float(round(float(dec_obs[i]), 7)),
                "pmra_mas_yr": float(round(float(pmra[i]), 3)),
                "pmdec_mas_yr": float(round(float(pmdec[i]), 3)),
                "parallax_mas": float(round(float(plx[i]), 3)),
                "phot_g_mean_mag": (
                    float(round(float(df[gmag_col].iloc[i]), 3))
                    if gmag_col and pd.notna(df[gmag_col].iloc[i])
                    else None
                ),
                "galaxy_prob": (
                    float(round(float(df[gal_col].iloc[i]), 3))
                    if gal_col and pd.notna(df[gal_col].iloc[i])
                    else 0.0
                ),
                "sep_arcsec": float(round(float(sep_arcsec[i]), 3)),
                "source_endpoint": endpoint_label,
            }
        )

    matches.sort(key=lambda m: float(m["sep_arcsec"]))
    return matches


# ============================================================================
# 3. STAGE 1: 4-TIER STScI MAST + ESA GAIA DR3 FAILOVER CASCADE (CONTRACT #3)
# ============================================================================
def query_gaia_dr3_with_mast_failover(
    ra_deg: float,
    dec_deg: float,
    obs_mjd: float = 60900.0,
    radius_deg: float = 0.05,
    mag_limit: float = 21.0,
    match_tol_arcsec: float = 6.0,
    timeout_sec: int = 15,
) -> List[Dict[str, Any]]:
    """
    Locked Contract #3 Function:
    Query Gaia DR3 across the 4-tier US/European high-availability failover chain:
      - Tier 1a: STScI MAST Postgres VO-TAP (`mast.stsci.edu/vo-tap/api/v0.1/mast_catalogs/sync`)
      - Tier 1b: STScI MAST VO Simple Cone Search (`mast.stsci.edu/vo-conesearch/api/v0.1/gaiadr3`)
      - Tier 1c: ESA Gaia DR3 TAP+ (`gea.esac.esa.int/tap-server/tap/sync` with `EPOCH_PROP_POS` & `OFFSET 0`)
      - Tier 1d: STScI MAST AWS S3 HATS Parquet (`s3://stpubdata/gaia/gaia_dr3/public/hats` via LSDB)

    Enforces Micro-Safeguard #3: Tiers 1a, 1b, and 1d query a 180'' (`0.05 deg`)
    cone at J2016.0 and propagate positions to `obs_mjd` in Python via
    `SkyCoord.apply_space_motion()`.
    """
    ra = float(ra_deg)
    dec = float(dec_deg)
    cone_deg = max(0.05, float(radius_deg))
    obs_epoch_yr = float(Time(float(obs_mjd), format="mjd", scale="utc").jyear)

    # --- Tier 1a: STScI MAST Postgres VO-TAP Service ---
    for table_candidate in ("gaia_dr3.gaia_source", "gaiadr3.gaia_source"):
        adql_mast = f"""
        SELECT TOP 500
            source_id, ra, dec, pmra, pmdec, parallax, phot_g_mean_mag
        FROM {table_candidate}
        WHERE 1 = CONTAINS(
            POINT('ICRS', ra, dec),
            CIRCLE('ICRS', {ra:.6f}, {dec:.6f}, {cone_deg:.4f})
        )
        AND phot_g_mean_mag <= {float(mag_limit):.2f}
        ORDER BY phot_g_mean_mag ASC
        """.strip()
        try:
            resp = requests.post(
                settings.MAST_VO_TAP_SYNC,
                data={"REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": "csv", "QUERY": adql_mast},
                timeout=timeout_sec,
            )
            if resp.status_code == 200 and "source_id" in resp.text[:256]:
                df_mast = pd.read_csv(io.StringIO(resp.text))
                return _propagate_j2016_df_to_obs_mjd(
                    df_mast,
                    target_ra_deg=ra,
                    target_dec_deg=dec,
                    obs_mjd=obs_mjd,
                    match_tol_arcsec=match_tol_arcsec,
                    endpoint_label=f"MAST_VO_TAP ({table_candidate})",
                )
        except Exception as exc:
            logger.debug("Tier 1a MAST VO-TAP failover note (%s): %s", table_candidate, exc)

    # --- Tier 1b: STScI MAST VO Simple Cone Search ---
    try:
        resp_cs = requests.get(
            settings.MAST_VO_CONESEARCH,
            params={"RA": f"{ra:.6f}", "DEC": f"{dec:.6f}", "SR": f"{cone_deg:.4f}", "FORMAT": "votable"},
            timeout=timeout_sec,
        )
        if resp_cs.status_code == 200 and b"<TABLEDATA" in resp_cs.content:
            vot_tbl = parse_single_table(io.BytesIO(resp_cs.content)).to_table()
            df_cs = vot_tbl.to_pandas()
            return _propagate_j2016_df_to_obs_mjd(
                df_cs,
                target_ra_deg=ra,
                target_dec_deg=dec,
                obs_mjd=obs_mjd,
                match_tol_arcsec=match_tol_arcsec,
                endpoint_label="MAST_VO_CONESEARCH",
            )
    except Exception as exc:
        logger.debug("Tier 1b MAST VO-ConeSearch failover note: %s", exc)

    # --- Tier 1c: ESA Gaia DR3 TAP+ with Built-in EPOCH_PROP_POS & OFFSET 0 ---
    adql_esa = f"""
    SELECT
        sub.source_id, sub.ra AS ra_j2016, sub.dec AS dec_j2016,
        COORD1(sub.prop_pos) AS ra_obs, COORD2(sub.prop_pos) AS dec_obs,
        sub.pmra, sub.pmdec, sub.parallax, sub.phot_g_mean_mag,
        sub.classprob_dsc_combmod_galaxy,
        DISTANCE(
            POINT('ICRS', COORD1(sub.prop_pos), COORD2(sub.prop_pos)),
            POINT('ICRS', {ra:.7f}, {dec:.7f})
        ) * 3600.0 AS sep_arcsec
    FROM (
        SELECT
            gaia.source_id, gaia.ra, gaia.dec, gaia.pmra, gaia.pmdec,
            gaia.parallax, gaia.phot_g_mean_mag, gaia.classprob_dsc_combmod_galaxy,
            EPOCH_PROP_POS(
                gaia.ra, gaia.dec, COALESCE(gaia.parallax, 0.0),
                COALESCE(gaia.pmra, 0.0), COALESCE(gaia.pmdec, 0.0),
                COALESCE(gaia.radial_velocity, 0.0), gaia.ref_epoch, {obs_epoch_yr:.3f}
            ) AS prop_pos
        FROM gaiadr3.gaia_source AS gaia
        WHERE 1 = CONTAINS(
            POINT('ICRS', gaia.ra, gaia.dec),
            CIRCLE('ICRS', {ra:.7f}, {dec:.7f}, {cone_deg:.4f})
        )
        OFFSET 0
    ) AS sub
    WHERE DISTANCE(
        POINT('ICRS', COORD1(sub.prop_pos), COORD2(sub.prop_pos)),
        POINT('ICRS', {ra:.7f}, {dec:.7f})
    ) < {float(match_tol_arcsec) / 3600.0:.6f}
    ORDER BY sep_arcsec ASC
    """.strip()

    try:
        resp_esa = requests.post(
            settings.ESA_GAIA_TAP_SYNC,
            data={"REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": "json", "QUERY": adql_esa},
            timeout=timeout_sec,
        )
        if resp_esa.status_code == 200:
            payload = resp_esa.json()
            rows = payload.get("data", [])
            matches_esa: List[Dict[str, Any]] = []
            for r in rows:
                matches_esa.append(
                    {
                        "source_id": str(r[0]),
                        "ra_j2016": float(r[1]),
                        "dec_j2016": float(r[2]),
                        "ra_obs": float(r[3]),
                        "dec_obs": float(r[4]),
                        "pmra_mas_yr": float(r[5] or 0.0),
                        "pmdec_mas_yr": float(r[6] or 0.0),
                        "parallax_mas": float(r[7] or 0.0),
                        "phot_g_mean_mag": float(r[8]) if r[8] is not None else None,
                        "galaxy_prob": float(r[9] or 0.0),
                        "sep_arcsec": float(r[10]),
                        "source_endpoint": "ESA_GAIA_TAP",
                    }
                )
            return matches_esa
    except Exception as exc:
        logger.debug("Tier 1c ESA Gaia TAP+ failover note: %s", exc)

    # --- Tier 1d: STScI MAST AWS Open Data HATS Parquet via LSDB ---
    try:
        import lsdb  # type: ignore

        gaia_hats = lsdb.read_hats(
            settings.MAST_AWS_HATS_URI,
            columns=["source_id", "ra", "dec", "pmra", "pmdec", "parallax", "phot_g_mean_mag"],
        )
        cone_cat = gaia_hats.cone_search(ra=ra, dec=dec, radius_arcsec=cone_deg * 3600.0)
        df_hats = cone_cat.compute()
        return _propagate_j2016_df_to_obs_mjd(
            df_hats,
            target_ra_deg=ra,
            target_dec_deg=dec,
            obs_mjd=obs_mjd,
            match_tol_arcsec=match_tol_arcsec,
            endpoint_label="MAST_AWS_S3_HATS",
        )
    except Exception:
        return []


# ============================================================================
# 4. STAGES 2-5 + SPLICES v8.6 & CSA NEOSSAT CADC VERIFICATION CASCADE
# ============================================================================
def _query_simbad_tap(ra_deg: float, dec_deg: float, radius_deg: float = 0.025, timeout_sec: int = 12) -> List[Dict[str, Any]]:
    """Stage 2: CDS SIMBAD TAP query for optically faint L/T/Y brown dwarfs, PM*, YSOs, and AGNs."""
    adql = f"""
    SELECT TOP 25
        basic.main_id, basic.otype, basic.ra, basic.dec,
        DISTANCE(
            POINT('ICRS', basic.ra, basic.dec),
            POINT('ICRS', {float(ra_deg):.6f}, {float(dec_deg):.6f})
        ) * 3600.0 AS sep_arcsec
    FROM basic
    WHERE 1 = CONTAINS(
        POINT('ICRS', basic.ra, basic.dec),
        CIRCLE('ICRS', {float(ra_deg):.6f}, {float(dec_deg):.6f}, {float(radius_deg):.4f})
    )
    ORDER BY sep_arcsec ASC
    """.strip()
    try:
        resp = requests.post(
            settings.SIMBAD_TAP_SYNC_URL,
            data={"request": "doQuery", "lang": "ADQL", "format": "json", "query": adql},
            timeout=timeout_sec,
        )
        if resp.status_code == 200:
            rows = resp.json().get("data", [])
            return [
                {
                    "main_id": str(r[0]).strip(),
                    "otype": str(r[1]).strip(),
                    "ra": float(r[2]),
                    "dec": float(r[3]),
                    "sep_arcsec": float(round(float(r[4]), 2)),
                }
                for r in rows
            ]
    except Exception as exc:
        logger.debug("Stage 2 SIMBAD query note: %s", exc)
    return []


def _query_imcce_skybot(ra_deg: float, dec_deg: float, jd_obs: float, timeout_sec: int = 12) -> List[Dict[str, Any]]:
    """Stage 3: IMCCE SkyBoT cone search for known main-belt asteroids, planets, and comets."""
    params = {
        "-ep": f"{float(jd_obs):.6f}",
        "-ra": f"{float(ra_deg):.6f}",
        "-dec": f"{float(dec_deg):.6f}",
        "-rd": "0.05",
        "-loc": "500",
        "-filter": "120.0",
        "-objFilter": "111",
        "-refsys": "EQJ2000",
        "-output": "all",
        "-mime": "votable",
    }
    try:
        resp = requests.get(settings.SKYBOT_CONESEARCH_URL, params=params, timeout=timeout_sec)
        if resp.status_code == 200 and b"<TABLEDATA>" in resp.content:
            tbl = parse_single_table(io.BytesIO(resp.content)).to_table()
            out: List[Dict[str, Any]] = []
            for row in tbl:
                out.append(
                    {
                        "name": str(row["name"]) if "name" in tbl.colnames else str(row[0]),
                        "class": str(row["class"]) if "class" in tbl.colnames else "SSO",
                        "v_mag": float(row["Mv"]) if "Mv" in tbl.colnames else None,
                        "center_dist_arcsec": float(row["centerdist"]) if "centerdist" in tbl.colnames else 0.0,
                    }
                )
            return out
    except Exception as exc:
        logger.debug("Stage 3 SkyBoT query note: %s", exc)
    return []


def _query_jpl_sb_ident(
    ra_deg: float,
    dec_deg: float,
    jd_obs: float,
    spacecraft_xobs_km_kms: Optional[Sequence[float]] = None,
    timeout_sec: int = 20,
) -> List[Dict[str, Any]]:
    """
    Stage 4: JPL Small-Body Identification API (`sb_ident.api`) with two-pass=true
    N-body numerical integration and mag-required=false to retain TNOs/comets.
    """
    coord = SkyCoord(ra=float(ra_deg) * u.deg, dec=float(dec_deg) * u.deg, frame="icrs")
    ra_sex, dec_sex = format_jpl_sexagesimal(coord)

    params: Dict[str, str] = {
        "obs-time": f"{float(jd_obs):.6f}",
        "fov-ra-center": ra_sex,
        "fov-dec-center": dec_sex,
        "fov-ra-hwidth": "0.05",
        "fov-dec-hwidth": "0.05",
        "two-pass": "true",
        "suppress-first-pass": "true",
        "mag-required": "false",
        "req-elem": "false",
    }
    if spacecraft_xobs_km_kms is not None and len(spacecraft_xobs_km_kms) == 6:
        params["xobs"] = ",".join(f"{float(v):.6f}" for v in spacecraft_xobs_km_kms)
    else:
        params["lat"] = "0.0"
        params["lon"] = "0.0"
        params["alt"] = "650.0"

    try:
        resp = requests.get(settings.JPL_SB_IDENT_URL, params=params, timeout=timeout_sec)
        if resp.status_code == 200:
            data = resp.json()
            rows = data.get("data_second_pass", data.get("data_first_pass", []))
            return [
                {
                    "name": str(r[0]),
                    "ra_str": str(r[1]),
                    "dec_str": str(r[2]),
                }
                for r in rows
            ]
    except Exception as exc:
        logger.debug("Stage 4 JPL sb_ident query note: %s", exc)
    return []


def _format_mpc_obs80_and_query_cnd(
    ra_deg: float,
    dec_deg: float,
    t_obs: Time,
    match_tol_arcsec: float = 6.0,
    timeout_sec: int = 10,
) -> List[Dict[str, Any]]:
    """
    Stage 5: Format a standard 80-column MPC1992 optical/IR astrometric record
    (obs80) from `(ra_deg, dec_deg, t_obs)` and query the Minor Planet Center
    Check Near-Duplicates (CND) REST API (`https://data.minorplanetcenter.net/api/cnd`).
    """
    coord = SkyCoord(ra=float(ra_deg) * u.deg, dec=float(dec_deg) * u.deg, frame="icrs")
    dt = t_obs.to_datetime()
    day_frac = dt.day + (dt.hour + dt.minute / 60.0 + (dt.second + dt.microsecond * 1e-6) / 3600.0) / 24.0
    date_str = f"C{dt.year:04d} {dt.month:02d} {day_frac:08.5f}"

    ra_hms = coord.ra.hms
    ra_mpc = f"{int(ra_hms.h):02d} {int(ra_hms.m):02d} {float(ra_hms.s):05.2f}"
    dec_dms = coord.dec.signed_dms
    sign_c = "-" if dec_dms.sign < 0 else "+"
    dec_mpc = f"{sign_c}{abs(int(dec_dms.d)):02d} {abs(int(dec_dms.m)):02d} {abs(float(dec_dms.s)):04.1f}"

    # Construct exact 80-character MPC1992 observation string (Observatory Code 500 Geocentric)
    obs80 = f"     SPX0001*{date_str}{ra_mpc} {dec_mpc}          19.5 R      500"
    obs80 = obs80[:80].ljust(80)

    payload = {
        "obs": [obs80],
        "time_separation_s": 60.0,
        "angle_separation_arcsec": min(10.0, max(1.0, float(match_tol_arcsec))),
        "omit_separation": False,
    }
    try:
        resp = requests.get(
            settings.MPC_CND_API_URL,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=timeout_sec,
        )
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list):
                return data
            if isinstance(data, dict):
                return data.get("matches", data.get("results", []))
    except Exception as exc:
        logger.debug("Stage 5 MPC CND query note: %s", exc)
    return []


def _query_splices_ice_catalog(ra_deg: float, dec_deg: float, timeout_sec: int = 10) -> List[Dict[str, Any]]:
    """
    Cross-match coordinates against IRSA's SPHEREx Target List of Ice Sources
    (SPLICES v8.6, released May 7, 2026) for visual extinction (A_V) and CO clouds (NoC).
    """
    adql = f"""
    SELECT TOP 5
        ra, dec, w1mpro, w2mpro
    FROM splices_v86
    WHERE 1 = CONTAINS(
        POINT('ICRS', ra, dec),
        CIRCLE('ICRS', {float(ra_deg):.6f}, {float(dec_deg):.6f}, 0.005)
    )
    """.strip()
    try:
        resp = requests.post(
            f"{settings.IRSA_TAP_URL.rstrip('/')}/sync",
            data={"REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": "csv", "QUERY": adql},
            timeout=timeout_sec,
        )
        if resp.status_code == 200 and "ra" in resp.text[:128]:
            df = pd.read_csv(io.StringIO(resp.text))
            return df.to_dict(orient="records")
    except Exception:
        pass
    return []


def _query_cadc_neossat_check(ra_deg: float, dec_deg: float, timeout_sec: int = 10) -> List[Dict[str, Any]]:
    """
    Check CSA CADC `collection = 'NEOSSAT'` for overlapping space surveillance
    or asteroid tracking observations.
    """
    adql = f"""
    SELECT TOP 5
        o.observationID, o.target_name, p.time_bounds_lower AS mjd_obs
    FROM caom2.Observation AS o
    JOIN caom2.Plane AS p ON o.obsID = p.obsID
    WHERE o.collection = 'NEOSSAT'
      AND p.calibrationLevel >= 2
      AND 1 = CONTAINS(
          POINT('ICRS', {float(ra_deg):.6f}, {float(dec_deg):.6f}),
          p.position_bounds
      )
    ORDER BY p.time_bounds_lower DESC
    """.strip()
    try:
        resp = requests.post(
            settings.CADC_TAP_SYNC_URL,
            data={"REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": "csv", "QUERY": adql},
            timeout=timeout_sec,
        )
        if resp.status_code == 200 and "observationID" in resp.text[:128]:
            df = pd.read_csv(io.StringIO(resp.text))
            return df.to_dict(orient="records")
    except Exception:
        pass
    return []


def crossmatch_candidate_all_apis(
    ra_deg: float,
    dec_deg: float,
    obs_mjd: float,
    spacecraft_xobs_km_kms: Optional[Sequence[float]] = None,
    match_tol_arcsec: float = 6.0,
) -> Dict[str, Any]:
    """
    Locked Contract #3 Function:
    Execute the complete 5-stage live verification cascade for a SPHEREx
    detection at `(ra_deg, dec_deg, obs_mjd)`.

    Returns a dictionary with locked keys:
      `("gaia_dr3", "simbad", "skybot", "jpl_sb_ident", "mpc_cnd",
        "splices_ice", "neossat_cadc", "is_uncatalogued_discovery")`
    """
    t_obs = Time(float(obs_mjd), format="mjd", scale="utc")
    jd_obs = float(t_obs.jd)

    gaia_matches = query_gaia_dr3_with_mast_failover(
        ra_deg=ra_deg,
        dec_deg=dec_deg,
        obs_mjd=obs_mjd,
        radius_deg=0.05,
        match_tol_arcsec=match_tol_arcsec,
    )
    simbad_matches = _query_simbad_tap(ra_deg=ra_deg, dec_deg=dec_deg, radius_deg=0.025)
    skybot_matches = _query_imcce_skybot(ra_deg=ra_deg, dec_deg=dec_deg, jd_obs=jd_obs)
    jpl_matches = _query_jpl_sb_ident(
        ra_deg=ra_deg,
        dec_deg=dec_deg,
        jd_obs=jd_obs,
        spacecraft_xobs_km_kms=spacecraft_xobs_km_kms,
    )
    mpc_cnd_matches = _format_mpc_obs80_and_query_cnd(
        ra_deg=ra_deg,
        dec_deg=dec_deg,
        t_obs=t_obs,
        match_tol_arcsec=match_tol_arcsec,
    )
    splices_matches = _query_splices_ice_catalog(ra_deg=ra_deg, dec_deg=dec_deg)
    neossat_matches = _query_cadc_neossat_check(ra_deg=ra_deg, dec_deg=dec_deg)

    # 5-Criterion Uncatalogued Discovery Verification Protocol:
    # 1. Zero Gaia DR3 stellar/galaxy matches within match_tol_arcsec at propagated epoch
    # 2. Zero SIMBAD matches within match_tol_arcsec
    # 3. Zero SkyBoT and JPL sb_ident moving solar system body matches
    # 4. Zero Minor Planet Center (MPC CND) near-duplicate observations
    close_simbad = [m for m in simbad_matches if float(m.get("sep_arcsec", 999.0)) <= float(match_tol_arcsec)]
    close_skybot = [m for m in skybot_matches if float(m.get("center_dist_arcsec", 999.0)) <= float(match_tol_arcsec) * 2.0]

    is_uncatalogued = (
        len(gaia_matches) == 0
        and len(close_simbad) == 0
        and len(close_skybot) == 0
        and len(jpl_matches) == 0
        and len(mpc_cnd_matches) == 0
    )

    return {
        "ra_deg": float(ra_deg),
        "dec_deg": float(dec_deg),
        "obs_mjd": float(obs_mjd),
        "obs_jd": jd_obs,
        "gaia_dr3": gaia_matches,
        "simbad": simbad_matches,
        "skybot": skybot_matches,
        "jpl_sb_ident": jpl_matches,
        "mpc_cnd": mpc_cnd_matches,
        "splices_ice": splices_matches,
        "neossat_cadc": neossat_matches,
        "is_uncatalogued_discovery": bool(is_uncatalogued),
    }