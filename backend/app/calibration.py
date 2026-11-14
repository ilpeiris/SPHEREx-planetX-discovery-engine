# ==============================================================================
# Author:     M.D.Isuru Lakmal Peiris (@ilpeiris) 
# Project:    SPHEREx x Planet X (2026 NASA International Space Apps Challenge)
# Repository: https://github.com/ilpeiris/SPHEREx-planetX-discovery-engine
# LinkedIn:   https://www.linkedin.com/in/ilpeiris
# Github:     https://github.com/ilpeiris/
# License:    MIT License | Copyright (c) 2026 M.D.Isuru Lakmal Peiris
# ==============================================================================



# backend/app/calibration.py
"""
SPHEREx Level 2 (l2b) 6-Extension MEF Calibration, WAVE-TAB Spectral WCS
Evaluation (key="W", sip=None), Zodiacal Foreground Subtraction, Solid Angle
Pixel Map (SAPM) Flux Conversion, 64-Bit FLAGS Bitmasking, and Version-Aware
QR2 PSF / QR3 ePSF Extraction.
"""

from __future__ import annotations

import io
import logging
import re
from pathlib import Path
from typing import Any, Dict, MutableMapping, Optional, Tuple

import astropy.units as u
import numpy as np
import requests
from astropy.io import fits
from astropy.table import Table
from astropy.time import Time
from astropy.wcs import WCS
from packaging.version import Version
from photutils.psf import ImagePSF

from app.config import (
    BENIGN_SCIENCE_BITS,
    BIT_FULLSAMPLE,
    BIT_OVERFLOW,
    BIT_SOURCE,
    BIT_SUR_ERROR,
    FATAL_CORE_MASK,
    MJY_SR_TO_UJY_ARCSEC2,
    SPHEREX_DETECTOR_SIZE_PX,
    SPHEREX_DETECTORS,
    SPHEREX_NATIVE_PIXEL_SCALE_ARCSEC,
    SSDC_R7_MWIR_WAVELENGTH_OFFSET_UM,
    condense_flags_to_uint16,
    settings,
)

logger = logging.getLogger(__name__)


# ============================================================================
# 1. PIPELINE VERSION PARSER & QR2 / QR3 BRANCHING
# ============================================================================
def parse_version(version_str: str | None) -> Tuple[Version, int]:
    """
    Parse the SPHEREx pipeline VERSION keyword from HDU 0 (PRIMARY) header
    (e.g., '6.5.4+psffix1', '7.0.1', or 'l2b-v20-2025-247') into a semantic
    base Version and an integer post-processing patch modifier (e.g., 1 for +psffix1).

    In SPHEREx archives:
      - Base version < 7.0 (QR1 / QR2): HDU 5 is a 3D ImageHDU ('PSF') of shape (121, 101, 101).
        Versions 6.4 through 6.5.5 without '+psffix1' had transposed XCTR_i / YCTR_i header cards.
      - Base version >= 7.0 (QR3 / DR1): HDU 5 is a BinTableHDU ('EPSF') with 5x oversampled
        33x33 empirical PSF stamps across 21x21 (441) or 11x41 (451, D3) zones.
    """
    if not version_str:
        return Version("7.0.0"), 0

    raw = str(version_str).strip()
    mod_num = 0

    if "+" in raw:
        base_str, mod_str = raw.split("+", 1)
        match = re.search(r"\d+", mod_str)
        mod_num = int(match.group(0)) if match else 1
    else:
        base_str = raw

    # Handle archival strings formatted like 'l2b-v20-2025-247' or '6.5.4'
    sem_match = re.search(r"\d+(?:\.\d+)+", base_str)
    if sem_match:
        parsed_ver = Version(sem_match.group(0))
    else:
        v_num_match = re.search(r"v(\d+)", base_str, re.IGNORECASE)
        if v_num_match:
            v_int = int(v_num_match.group(1))
            parsed_ver = Version("7.0.0") if v_int >= 25 else Version("6.5.6")
        else:
            parsed_ver = Version("7.0.0")

    return parsed_ver, mod_num


# ============================================================================
# 2. SOLID ANGLE PIXEL MAP (SAPM) LOADER & CUTOUT SLICER
# ============================================================================
def load_detector_sapm(
    detector: int,
    sapm_cache: Optional[MutableMapping[int, np.ndarray]] = None,
    data_release: str = "qr2",
    sapm_collection: Optional[str] = None,
) -> np.ndarray:
    """
    Load the 2040x2040 Solid Angle Pixel Map (SAPM, in arcsec^2) for a SPHEREx
    detector (1..6). Checks in-memory cache first, then local disk cache
    (settings.SAPM_CACHE_DIR), then AWS S3 / HTTPS mirror, falling back to an
    analytical distortion-free solid angle map (~37.8225 arcsec^2) if offline.
    """
    det = max(1, min(6, int(detector)))
    if sapm_cache is not None and det in sapm_cache:
        return sapm_cache[det]

    coll = sapm_collection or settings.SAPM_COLLECTION_TAG
    filename = f"solid_angle_pixel_map_D{det}_spx_{coll}.fits"
    local_path: Path = settings.SAPM_CACHE_DIR / filename

    sapm_array: Optional[np.ndarray] = None

    # 1. Try local disk cache
    if local_path.exists() and local_path.stat().st_size > 100_000:
        try:
            with fits.open(local_path, memmap=False) as hdul:
                sapm_array = np.asarray(
                    hdul[0].data if hdul[0].data is not None else hdul[1].data,
                    dtype=np.float32,
                )
        except Exception as exc:
            logger.warning("Corrupt local SAPM cache %s (%s); re-fetching.", local_path, exc)

    # 2. Try HTTPS AWS S3 mirror download (checks DR1 cal-sapm-v3-2026-191 first, then QR2)
    if sapm_array is None:
        candidate_urls = [
            f"https://nasa-irsa-spherex.s3.us-east-1.amazonaws.com/dr1/solid_angle_pixel_map/cal-sapm-v3-2026-191/{det}/solid_angle_pixel_map_D{det}_spx_cal-sapm-v3-2026-191.fits",
            f"https://nasa-irsa-spherex.s3.us-east-1.amazonaws.com/{data_release}/solid_angle_pixel_map/{coll}/{det}/{filename}",
        ]
        for https_url in candidate_urls:
            try:
                resp = requests.get(https_url, timeout=20)
                if resp.status_code == 200 and len(resp.content) > 100_000:
                    local_path.parent.mkdir(parents=True, exist_ok=True)
                    local_path.write_bytes(resp.content)
                    with fits.open(io.BytesIO(resp.content), memmap=False) as hdul:
                        sapm_array = np.asarray(
                            hdul[0].data if hdul[0].data is not None else hdul[1].data,
                            dtype=np.float32,
                        )
                    break
            except Exception as exc:
                logger.debug("HTTPS SAPM fetch note for D%d (%s): %s", det, https_url, exc)

    # 3. Analytical fallback (~6.15'' x 6.15'' = 37.8225 arcsec^2 with radial pin-cushion term)
    if sapm_array is None:
        yy, xx = np.mgrid[0:SPHEREX_DETECTOR_SIZE_PX, 0:SPHEREX_DETECTOR_SIZE_PX]
        r2 = ((xx - 1020.0) / 1020.0) ** 2 + ((yy - 1020.0) / 1020.0) ** 2
        base_omega = float(SPHEREX_NATIVE_PIXEL_SCALE_ARCSEC ** 2)
        sapm_array = (base_omega * (1.0 - 0.0045 * r2)).astype(np.float32)

    if sapm_cache is not None:
        sapm_cache[det] = sapm_array
    return sapm_array


def translate_cutout_to_detector_coords(
    x_cutout: float | np.ndarray,
    y_cutout: float | np.ndarray,
    image_header: fits.Header,
) -> Tuple[float | np.ndarray, float | np.ndarray]:
    """
    Translate 0-based cutout pixel coordinates (x_cutout, y_cutout) back to
    0-based parent 2040x2040 detector coordinates (x_orig, y_orig) using the
    alternate WCS reference pixel keywords CRPIX1A and CRPIX2A written by IRSA's
    IBE Cutout Service:
        x_orig = 1 + x_cutout - CRPIX1A
        y_orig = 1 + y_cutout - CRPIX2A
    """
    crpix1a = float(image_header.get("CRPIX1A", 1.0))
    crpix2a = float(image_header.get("CRPIX2A", 1.0))
    x_orig = 1.0 + x_cutout - crpix1a
    y_orig = 1.0 + y_cutout - crpix2a
    return x_orig, y_orig


def slice_sapm_to_cutout(
    full_sapm: np.ndarray,
    image_header: fits.Header,
    cutout_shape: Tuple[int, int],
    spatial_wcs: Optional[WCS] = None,
) -> np.ndarray:
    """
    Slice the 2040x2040 detector Solid Angle Pixel Map (SAPM) to match the
    exact spatial sub-window of an IBE cutout using CRPIX1A and CRPIX2A.
    """
    ny, nx = cutout_shape
    if ny == SPHEREX_DETECTOR_SIZE_PX and nx == SPHEREX_DETECTOR_SIZE_PX:
        return full_sapm

    if "CRPIX1A" in image_header and "CRPIX2A" in image_header:
        x0 = int(round(1.0 - float(image_header["CRPIX1A"])))
        y0 = int(round(1.0 - float(image_header["CRPIX2A"])))
        x0_clamped = max(0, min(SPHEREX_DETECTOR_SIZE_PX - nx, x0))
        y0_clamped = max(0, min(SPHEREX_DETECTOR_SIZE_PX - ny, y0))
        sliced = full_sapm[y0_clamped : y0_clamped + ny, x0_clamped : x0_clamped + nx]
        if sliced.shape == (ny, nx):
            return sliced

    # Fallback: compute pixel solid angle from WCS CD matrix if header lacks CRPIX1A
    if spatial_wcs is not None and spatial_wcs.has_celestial:
        try:
            pix_area_deg2 = float(spatial_wcs.proj_plane_pixel_area().to_value(u.deg**2))
            pix_area_arcsec2 = pix_area_deg2 * (3600.0**2)
            if 1.0 < pix_area_arcsec2 < 200.0:
                return np.full((ny, nx), pix_area_arcsec2, dtype=np.float32)
        except Exception:
            pass

    return np.full((ny, nx), float(SPHEREX_NATIVE_PIXEL_SCALE_ARCSEC**2), dtype=np.float32)


# ============================================================================
# 3. QR2 3D PSF CUBE & QR3 ePSF BINARY TABLE EXTRACTOR
# ============================================================================
def render_epsf_stamp_centered(
    epsf: ImagePSF,
    x0: float = 0.0,
    y0: float = 0.0,
    stamp_size: int = 11,
    unit_flux: bool = True,
) -> np.ndarray:
    """
    Evaluate a 5x-oversampled photutils.psf.ImagePSF on the native 6.15'' SPHEREx
    pixel grid at sub-pixel phase (x0, y0) over a stamp_size x stamp_size meshgrid.
    """
    half = (stamp_size - 1) / 2.0
    yy, xx = np.meshgrid(
        np.linspace(-half, half, stamp_size, dtype=np.float64),
        np.linspace(-half, half, stamp_size, dtype=np.float64),
        indexing="ij",
    )
    dx = float(x0) - round(float(x0))
    dy = float(y0) - round(float(y0))
    stamp = np.asarray(epsf(x=xx - dx, y=yy - dy), dtype=np.float32)
    stamp = np.nan_to_num(stamp, nan=0.0, posinf=0.0, neginf=0.0)
    total = float(np.sum(stamp))
    if unit_flux and total > 0.0:
        stamp /= total
    return stamp


def extract_local_psf_stamp(
    hdulist: fits.HDUList,
    x_cutout: float,
    y_cutout: float,
    stamp_size: int = 11,
) -> np.ndarray:
    """
    Extract a native-resolution (6.15''/pix) normalized PSF stamp of shape
    (stamp_size, stamp_size) for target cutout coordinates (x_cutout, y_cutout),
    automatically branching between QR3 EPSF binary tables (v >= 7.0) and
    legacy QR1/QR2 3D PSF cubes (v < 7.0, including the v6.4-6.5.5 header patch).
    """
    primary_hdr = hdulist[0].header
    image_hdr = hdulist["IMAGE"].header if "IMAGE" in hdulist else primary_hdr
    ver_obj, mod_num = parse_version(primary_hdr.get("VERSION", "7.0.0"))
    x_orig, y_orig = translate_cutout_to_detector_coords(x_cutout, y_cutout, image_hdr)

    # --- Branch A: QR3+ Empirical ePSF Binary Table (EXTNAME = 'EPSF') ---
    if "EPSF" in hdulist or (
        len(hdulist) > 5 and isinstance(hdulist[5], fits.BinTableHDU) and hdulist[5].name != "WCS-WAVE"
    ):
        epsf_hdu = hdulist["EPSF"] if "EPSF" in hdulist else hdulist[5]
        epsf_table = Table(epsf_hdu.data)
        if "CWAVE" in epsf_table.colnames and epsf_table["CWAVE"].unit is None:
            epsf_table["CWAVE"].unit = u.micrometer

        xcen = np.asarray(epsf_table["XCENTER"], dtype=np.float64)
        ycen = np.asarray(epsf_table["YCENTER"], dtype=np.float64)
        dist2 = (xcen - float(x_orig)) ** 2 + (ycen - float(y_orig)) ** 2
        best_idx = int(np.argmin(dist2))

        psf_col = "PSF" if "PSF" in epsf_table.colnames else epsf_table.colnames[-1]
        oversampled_stamp = np.asarray(epsf_table[psf_col][best_idx], dtype=np.float64)
        ovsmpx = int(epsf_hdu.header.get("OVSMPX", 5))
        ovsmpy = int(epsf_hdu.header.get("OVSMPY", 5))

        img_psf = ImagePSF(data=oversampled_stamp, oversampling=(ovsmpy, ovsmpx))
        return render_epsf_stamp_centered(img_psf, x0=float(x_cutout), y0=float(y_cutout), stamp_size=stamp_size)

    # --- Branch B: Legacy QR1/QR2 3D PSF Cube (EXTNAME = 'PSF', shape 121 x 101 x 101) ---
    if "PSF" in hdulist and hdulist["PSF"].data is not None:
        psf_hdu = hdulist["PSF"]
        psf_cube = np.asarray(psf_hdu.data, dtype=np.float32)
        if psf_cube.ndim == 3 and psf_cube.shape[0] >= 121:
            # 11x11 detector grid (121 zones across 2040x2040 pixels)
            n_cols = 11
            gx = max(0, min(n_cols - 1, int(float(x_orig) / (SPHEREX_DETECTOR_SIZE_PX / n_cols))))
            gy = max(0, min(n_cols - 1, int(float(y_orig) / (SPHEREX_DETECTOR_SIZE_PX / n_cols))))

            # Row-major plane ordering starting from bottom-left (0-indexed: gy * 11 + gx)
            # Fixes the v6.4-6.5.5 transposed header card issue automatically
            plane_idx = gy * n_cols + gx
            highres_plane = psf_cube[plane_idx]  # 101x101 oversampled by 10x
            img_psf = ImagePSF(data=highres_plane.astype(np.float64), oversampling=(10, 10))
            return render_epsf_stamp_centered(img_psf, x0=float(x_cutout), y0=float(y_cutout), stamp_size=stamp_size)

    # --- Fallback: Analytical Diffraction + Jitter Gaussian PSF ---
    det = int(image_hdr.get("DETECTOR", 4))
    fwhm_arcsec = float(image_hdr.get("PSF_FWHM", 2.2 + 0.65 * det))
    sigma_px = max(0.65, (fwhm_arcsec / SPHEREX_NATIVE_PIXEL_SCALE_ARCSEC) / 2.3548)
    half = (stamp_size - 1) / 2.0
    yy, xx = np.mgrid[-half : half + 1, -half : half + 1]
    gauss = np.exp(-0.5 * (xx**2 + yy**2) / (sigma_px**2)).astype(np.float32)
    gauss /= float(np.sum(gauss))
    return gauss


# ============================================================================
# 4. MASTER 6-EXTENSION MEF CALIBRATION FUNCTION (CONTRACT #3)
# ============================================================================
def calibrate_spherex_mef_bytes(
    fits_bytes: bytes | Path | str,
    sapm_cache: Optional[MutableMapping[int, np.ndarray]] = None,
    data_release: str = "qr2",
) -> Dict[str, Any]:
    """
    Calibrate a SPHEREx Level 2 (l2b) Spectral Image Multi-Extension FITS (MEF)
    full frame or IBE spatial cutout.

    Locked Contract #3 Return Dictionary Keys:
      - "detector": int (1..6)
      - "wavelength_um": 2D float32 array of central wavelengths in micrometers
      - "bandwidth_um": 2D float32 array of channel bandwidths in micrometers
      - "sb_ujy_per_arcsec2": 2D float32 ZODI-subtracted surface brightness (uJy/arcsec^2)
      - "flux_ujy": 2D float32 calibrated flux density per pixel (uJy, bad pixels masked to NaN)
      - "zodi_ujy": 2D float32 ZODI foreground model in uJy (for Micro-Safeguard #1 Slice 5)
      - "variance_ujy2": 2D float32 propagated flux variance (uJy^2)
      - "flags_int32": 2D int32 raw 32-bit SPHEREx FLAGS bitmask
      - "good_pixel_mask": 2D boolean mask (True for nominal/source pixels, False for fatal flags)
      - "spatial_wcs": Astropy celestial WCS instance
      - "mjd": float Modified Julian Date of observation
      - "finast": int fine astrometry quality flag (0 = RMS < 1 arcsec)
      - Plus supplementary keys: "flux_mjy", "flags_uint16", "psf_stamp", "obsid", "version_str"
    """
    if isinstance(fits_bytes, (bytes, bytearray)):
        stream: Any = io.BytesIO(fits_bytes)
    else:
        stream = str(fits_bytes)

    with fits.open(stream, memmap=False, cache=False) as hdulist:
        primary_hdr = hdulist[0].header
        version_str = str(primary_hdr.get("VERSION", "7.0.0"))
        finast = int(primary_hdr.get("FINAST", hdulist["IMAGE"].header.get("FINAST", 0))) if "IMAGE" in hdulist else 0

        img_hdu = hdulist["IMAGE"] if "IMAGE" in hdulist else hdulist[1]
        img_hdr = img_hdu.header
        detector = int(img_hdr.get("DETECTOR", primary_hdr.get("DETECTOR", 4)))
        obsid = str(img_hdr.get("OBSID", primary_hdr.get("OBSID", "UNKNOWN")))

        # Extract observation timestamp (MJD)
        mjd_val: float
        if "MJD-OBS" in img_hdr:
            mjd_val = float(img_hdr["MJD-OBS"])
        elif "MJD-AVG" in img_hdr:
            mjd_val = float(img_hdr["MJD-AVG"])
        elif "DATE-OBS" in img_hdr or "DATE" in img_hdr:
            date_str = str(img_hdr.get("DATE-OBS") or img_hdr.get("DATE"))
            try:
                mjd_val = float(Time(date_str, format="isot", scale="utc").mjd)
            except Exception:
                mjd_val = 60900.0
        else:
            mjd_val = 60900.0

        # 1. Read science extensions (IMAGE, ZODI, VARIANCE, FLAGS)
        image_mjysr = np.asarray(img_hdu.data, dtype=np.float32)
        ny, nx = image_mjysr.shape

        if "ZODI" in hdulist and hdulist["ZODI"].data is not None:
            zodi_mjysr = np.asarray(hdulist["ZODI"].data, dtype=np.float32)
        else:
            zodi_mjysr = np.zeros((ny, nx), dtype=np.float32)

        if "VARIANCE" in hdulist and hdulist["VARIANCE"].data is not None:
            variance_mjysr2 = np.asarray(hdulist["VARIANCE"].data, dtype=np.float32)
        else:
            # Robust MAD estimate if variance extension is absent
            med = float(np.nanmedian(image_mjysr - zodi_mjysr))
            mad = float(np.nanmedian(np.abs((image_mjysr - zodi_mjysr) - med))) * 1.4826
            variance_mjysr2 = np.full((ny, nx), max(1e-6, mad**2), dtype=np.float32)

        if "FLAGS" in hdulist and hdulist["FLAGS"].data is not None:
            flags_int32 = np.asarray(hdulist["FLAGS"].data, dtype=np.int32)
        else:
            flags_int32 = np.zeros((ny, nx), dtype=np.int32)

        # 2. Evaluate Primary Spatial WCS & Secondary WAVE-TAB Spectral WCS (key="W")
        spatial_wcs = WCS(img_hdr).celestial
        wavelength_um: np.ndarray
        bandwidth_um: np.ndarray

        try:
            spectral_wcs = WCS(header=img_hdr, fobj=hdulist, key="W")
            # MANDATORY FIX: Disable spatial SIP distortion polynomial on the spectral lookup!
            spectral_wcs.sip = None

            yy, xx = np.meshgrid(
                np.arange(ny, dtype=np.float64),
                np.arange(nx, dtype=np.float64),
                indexing="ij",
            )
            wl_grid, bw_grid = spectral_wcs.pixel_to_world_values(xx, yy)
            wavelength_um = np.asarray(wl_grid, dtype=np.float32)
            bandwidth_um = np.asarray(bw_grid, dtype=np.float32)

            # Apply SSDC R7 +6.4 nm (+0.0064 um) calibration shift for MWIR Bands 5 & 6 if pre-R7
            ver_obj, _ = parse_version(version_str)
            if detector in (5, 6) and ver_obj < Version("7.0.0"):
                wavelength_um = wavelength_um + SSDC_R7_MWIR_WAVELENGTH_OFFSET_UM
        except Exception as exc:
            logger.debug("WAVE-TAB key='W' lookup fallback triggered (%s); using LVF linear model.", exc)
            det_spec = SPHEREX_DETECTORS.get(detector, SPHEREX_DETECTORS[4])
            y_frac = np.linspace(0.0, 1.0, ny, dtype=np.float32)[:, None]
            wl_1d = det_spec.wavelength_min_um * (
                (det_spec.wavelength_max_um / det_spec.wavelength_min_um) ** y_frac
            )
            wavelength_um = np.broadcast_to(wl_1d, (ny, nx)).copy()
            bandwidth_um = (wavelength_um / float(det_spec.resolving_power)).astype(np.float32)

        # 3. Subtract modeled Zodiacal Dust background (not subtracted in HDU 1 by default)
        zodi_subtracted_mjysr = image_mjysr - zodi_mjysr

        # 4. Load & slice Solid Angle Pixel Map (SAPM) and convert MJy/sr -> uJy/arcsec^2 -> uJy
        full_sapm = load_detector_sapm(detector=detector, sapm_cache=sapm_cache, data_release=data_release)
        omega_pix_arcsec2 = slice_sapm_to_cutout(
            full_sapm=full_sapm,
            image_header=img_hdr,
            cutout_shape=(ny, nx),
            spatial_wcs=spatial_wcs,
        )

        sb_ujy_per_arcsec2 = (zodi_subtracted_mjysr * MJY_SR_TO_UJY_ARCSEC2).astype(np.float32)
        raw_flux_ujy = (sb_ujy_per_arcsec2 * omega_pix_arcsec2).astype(np.float32)
        zodi_ujy = (zodi_mjysr * MJY_SR_TO_UJY_ARCSEC2 * omega_pix_arcsec2).astype(np.float32)

        scale_factor_ujy = MJY_SR_TO_UJY_ARCSEC2 * omega_pix_arcsec2
        raw_variance_ujy2 = (variance_mjysr2 * (scale_factor_ujy**2)).astype(np.float32)

        # 5. Apply Exact 32/64-Bit FLAGS Bitmask Algebra
        # Retain nominal background (0), BIT_SOURCE (2^21), BIT_FULLSAMPLE (2^12),
        # BIT_OUTLIER (2^19, preserved for moving solar system bodies), BIT_HALO /
        # BIT_SATELLITE_HALO (2^28, 2^29, preserved for companions near bright stars like Eps Indi B),
        # and BIT_OVERFLOW (2^1) when NOT accompanied by BIT_SUR_ERROR (2^2).
        flags_64 = flags_int32.astype(np.int64)
        fatal_overflow = ((flags_64 & BIT_OVERFLOW) != 0) & ((flags_64 & BIT_SUR_ERROR) != 0)
        hard_dead_mask = FATAL_CORE_MASK & ~((1 << 28) | (1 << 29) | (1 << 7))
        good_pixel_mask = (~fatal_overflow) & ((flags_64 & hard_dead_mask) == 0)

        # Safeguard: if >95% of cutout pixels were flagged, only mask strictly dead/missing pixels
        if int(np.sum(good_pixel_mask)) < max(16, int(0.05 * good_pixel_mask.size)):
            strictly_dead = (1 << 2) | (1 << 6) | (1 << 9) | (1 << 10) | (1 << 11)
            good_pixel_mask = (flags_64 & strictly_dead) == 0
            
        nan_mask = np.where(good_pixel_mask, 1.0, np.nan).astype(np.float32)
        flux_ujy = (raw_flux_ujy * nan_mask).astype(np.float32)
        flux_mjy = (flux_ujy * 1e-3).astype(np.float32)
        variance_ujy2 = (raw_variance_ujy2 * nan_mask).astype(np.float32)
        sb_masked = (sb_ujy_per_arcsec2 * nan_mask).astype(np.float32)

        # 6. Extract local PSF stamp at cutout center & condensed 16-bit WebGL2 flags
        psf_stamp = extract_local_psf_stamp(
            hdulist=hdulist,
            x_cutout=nx / 2.0,
            y_cutout=ny / 2.0,
            stamp_size=11,
        )
        flags_uint16 = condense_flags_to_uint16(flags_int32)

        return {
            "detector": detector,
            "wavelength_um": wavelength_um,
            "bandwidth_um": bandwidth_um,
            "sb_ujy_per_arcsec2": sb_masked,
            "flux_ujy": flux_ujy,
            "zodi_ujy": zodi_ujy,
            "flux_mjy": flux_mjy,
            "variance_ujy2": variance_ujy2,
            "flags_int32": flags_int32,
            "flags_uint16": flags_uint16,
            "good_pixel_mask": good_pixel_mask,
            "spatial_wcs": spatial_wcs,
            "mjd": mjd_val,
            "finast": finast,
            "psf_stamp": psf_stamp,
            "obsid": obsid,
            "version_str": version_str,
        }