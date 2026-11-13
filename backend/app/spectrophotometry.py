# ==============================================================================
# Author:     M.D.Isuru Lakmal Peiris (@ilpeiris) 
# Project:    SPHEREx x Planet X (2026 NASA International Space Apps Challenge)
# Repository: https://github.com/ilpeiris/SPHEREx-planetX-discovery-engine
# LinkedIn:   https://www.linkedin.com/in/ilpeiris
# Github:     https://github.com/ilpeiris/
# License:    MIT License | Copyright (c) 2026 M.D.Isuru Lakmal Peiris
# ==============================================================================



# backend/app/spectrophotometry.py
"""
Dual-Regime 102-Band SPHEREx Spectrophotometry Engine:
  - Regime A: Unresolved Point-Source ePSF/Tractor Forced Photometry (r = 2.5 pix, fit_ql)
              with 4 Exact Molecular Indices (tau_H2O_3.0, C_CH4, C_H2O_NIR, C_W1/K)
              and Asteroid Rotational Lightcurve Normalization (SOLO / NEOSSat).
  - Regime B: Spatially Extended Cometary Coma Azimuthal Modal Profiler and
              Outgassing Production Rate Solver (Q_gas = 2 * v_gas * r * N_gas)
              following Lisse et al. (2025, 2026) for Interstellar Comet 3I/ATLAS.
"""

from __future__ import annotations

import logging
import math
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np
from astropy.stats import sigma_clip
from astropy.wcs import WCS
from photutils.aperture import CircularAnnulus, CircularAperture, aperture_photometry

from app.config import (
    BENIGN_SCIENCE_BITS,
    BIT_DICHROIC,
    BIT_FULLSAMPLE,
    BIT_OVERFLOW,
    BIT_SOURCE,
    BIT_SUR_ERROR,
    FATAL_CORE_MASK,
    SPHEREX_DETECTORS,
    SPHEREX_NATIVE_PIXEL_SCALE_ARCSEC,
)

logger = logging.getLogger(__name__)


# ============================================================================
# 1. NOMINAL 102-CHANNEL WAVELENGTH GRID & RESOLVING POWER GENERATOR
# ============================================================================
def build_nominal_102_channel_grid() -> List[Dict[str, float]]:
    """
    Construct the canonical 102 SPHEREx spectral channel centers (0.75 to 5.00 um),
    channel bandwidths, detector band IDs (1..6), and resolving powers (R = 35..128)
    following the geometric progression per 17-channel Linear Variable Filter band:
        lambda_{min,i} = lambda_min * (lambda_max / lambda_min)^((i - 1) / 17)
    """
    grid: List[Dict[str, float]] = []
    for band_id in range(1, 7):
        spec = SPHEREX_DETECTORS[band_id]
        ratio = spec.wavelength_max_um / spec.wavelength_min_um
        for local_idx in range(1, 18):
            global_ch = (band_id - 1) * 17 + local_idx
            lam_low = spec.wavelength_min_um * (ratio ** ((local_idx - 1) / 17.0))
            lam_high = spec.wavelength_min_um * (ratio ** (local_idx / 17.0))
            lam_center = 0.5 * (lam_low + lam_high)
            bw = lam_center / float(spec.resolving_power)
            grid.append(
                {
                    "global_channel": float(global_ch),
                    "band_id": float(band_id),
                    "wavelength_um": float(round(lam_center, 5)),
                    "bandwidth_um": float(round(bw, 5)),
                    "resolving_power": float(spec.resolving_power),
                }
            )
    return grid


NOMINAL_102_CHANNELS: List[Dict[str, float]] = build_nominal_102_channel_grid()


# ============================================================================
# 2. FOUR EXACT 102-BAND SPECTROPHOTOMETRIC MOLECULAR INDICES (SECTION 4.2)
# ============================================================================
def _weighted_band_mean_flux(
    wavelengths_um: np.ndarray,
    fluxes_ujy: np.ndarray,
    flux_errs_ujy: np.ndarray,
    flags_arr: np.ndarray,
    lam_min: float,
    lam_max: float,
) -> Tuple[float, float]:
    """
    Compute the inverse-variance-weighted mean flux density <F_v(lam_1, lam_2)>
    and its uncertainty across all unflagged SPHEREx channels in [lam_min, lam_max]:
        <F_v> = (sum w_k F_{v,k}) / (sum w_k),
        where w_k = I(FLAGS_k in {0, 2^12, 2^21}) / sigma_{F,k}^2
    """
    allowed_flags = (
        (flags_arr == 0)
        | (flags_arr == BIT_SOURCE)
        | (flags_arr == BIT_FULLSAMPLE)
        | (flags_arr == (BIT_SOURCE | BIT_FULLSAMPLE))
        | (flags_arr == BIT_OVERFLOW)
    )
    in_win = (
        (wavelengths_um >= float(lam_min))
        & (wavelengths_um <= float(lam_max))
        & np.isfinite(fluxes_ujy)
        & np.isfinite(flux_errs_ujy)
        & (flux_errs_ujy > 0)
        & allowed_flags
    )

    if not np.any(in_win):
        # Fallback without strict flag gate if all channels in window had minor flags
        in_win = (
            (wavelengths_um >= float(lam_min))
            & (wavelengths_um <= float(lam_max))
            & np.isfinite(fluxes_ujy)
            & np.isfinite(flux_errs_ujy)
            & (flux_errs_ujy > 0)
        )
        if not np.any(in_win):
            return 1.0, 0.5

    w = 1.0 / np.maximum(flux_errs_ujy[in_win] ** 2, 1e-10)
    sum_w = float(np.sum(w))
    mean_f = float(np.sum(w * fluxes_ujy[in_win]) / max(sum_w, 1e-12))
    sigma_f = float(1.0 / math.sqrt(max(sum_w, 1e-12)))
    return mean_f, sigma_f


def compute_102band_molecular_indices(sed_points: Sequence[Dict[str, Any]]) -> Dict[str, float]:
    """
    Evaluate the four exact spectrophotometric molecular absorption and color
    indices defined in Section 4.2 of the Master Engineering Blueprint:
      1. `tau_h2o_30`: Fundamental 3.0 um solid-state H2O ice stretch optical depth
      2. `c_ch4`: Near-IR CH4 overtone & combination bands (1.65 & 2.25 um)
      3. `c_h2o_nir`: Near-IR H2O vapor & crystalline ice depression (1.4 & 1.9 um)
      4. `c_w1_k`: Synthetic W1 (3.35-3.95 um) opacity window peak vs K-band H2 CIA trough
    """
    if not sed_points:
        return {
            "tau_h2o_30": 0.0,
            "c_ch4": 0.0,
            "c_h2o_nir": 0.0,
            "c_w1_k": 0.0,
        }

    lam = np.array([float(p.get("wavelength_um", p.get("cwave_um", 0.0))) for p in sed_points], dtype=np.float64)
    flx = np.array([float(p.get("flux_ujy", 0.0)) for p in sed_points], dtype=np.float64)
    err = np.array(
        [
            float(p.get("flux_err_ujy", math.sqrt(max(1e-6, float(p.get("variance_ujy2", 1.0))))))
            for p in sed_points
        ],
        dtype=np.float64,
    )
    flg = np.array([int(p.get("flags", 0)) for p in sed_points], dtype=np.int64)

    # 1. 3.0 um Water-Ice Optical Depth (tau_{H2O,3.0})
    f_30, sig_30 = _weighted_band_mean_flux(lam, flx, err, flg, 2.85, 3.15)
    f_cont1, _ = _weighted_band_mean_flux(lam, flx, err, flg, 2.40, 2.70)
    f_cont2, _ = _weighted_band_mean_flux(lam, flx, err, flg, 3.60, 4.10)
    f_cont_interp = max(1e-6, 0.583 * max(0.0, f_cont1) + 0.417 * max(0.0, f_cont2))
    tau_h2o_30 = -math.log(max(f_30, sig_30, 1e-6) / f_cont_interp)

    # 2. Near-IR Methane Index (C_CH4 at 1.63-1.76 um & 2.20-2.38 um vs H/K peaks)
    f_ch4_a, _ = _weighted_band_mean_flux(lam, flx, err, flg, 1.63, 1.76)
    f_ch4_b, _ = _weighted_band_mean_flux(lam, flx, err, flg, 2.20, 2.38)
    f_ref_h, _ = _weighted_band_mean_flux(lam, flx, err, flg, 1.50, 1.60)
    f_ref_k, _ = _weighted_band_mean_flux(lam, flx, err, flg, 2.02, 2.14)
    num_ch4 = max(1e-6, max(0.0, f_ch4_a) + max(0.0, f_ch4_b))
    den_ch4 = max(1e-6, max(0.0, f_ref_h) + max(0.0, f_ref_k))
    c_ch4 = -2.5 * math.log10(num_ch4 / den_ch4)

    # 3. Near-IR Water Vapor & Ice Index (C_{H2O,NIR} at 1.38-1.54 um & 1.82-2.00 um)
    f_h2o_a, _ = _weighted_band_mean_flux(lam, flx, err, flg, 1.38, 1.54)
    f_h2o_b, _ = _weighted_band_mean_flux(lam, flx, err, flg, 1.82, 2.00)
    f_j_peak, _ = _weighted_band_mean_flux(lam, flx, err, flg, 1.22, 1.32)
    f_h_peak, _ = _weighted_band_mean_flux(lam, flx, err, flg, 1.55, 1.63)
    num_h2o = max(1e-6, max(0.0, f_h2o_a) + max(0.0, f_h2o_b))
    den_h2o = max(1e-6, max(0.0, f_j_peak) + max(0.0, f_h_peak))
    c_h2o_nir = -2.5 * math.log10(num_h2o / den_h2o)

    # 4. Synthetic W1 - K_s Opacity Window Excess (C_{W1/K})
    f_w1_win, _ = _weighted_band_mean_flux(lam, flx, err, flg, 3.35, 3.95)
    f_k_trough, sig_k = _weighted_band_mean_flux(lam, flx, err, flg, 2.00, 2.35)
    c_w1_k = 2.5 * math.log10(max(1e-6, f_w1_win) / max(f_k_trough, sig_k, 1e-6))

    return {
        "tau_h2o_30": float(round(tau_h2o_30, 4)),
        "c_ch4": float(round(c_ch4, 4)),
        "c_h2o_nir": float(round(c_h2o_nir, 4)),
        "c_w1_k": float(round(c_w1_k, 4)),
    }


# ============================================================================
# 3. REGIME A: POINT-SOURCE ePSF / TRACTOR FORCED PHOTOMETRY (CONTRACT #3)
# ============================================================================
def apply_asteroid_rotational_and_distance_normalization(
    flux_ujy: float,
    mjd_obs: float,
    rot_period_hr: Optional[float] = None,
    rot_amp_mag: float = 0.0,
    mjd_zero: float = 60800.0,
    r_hel_au: Optional[float] = None,
    r_obs_au: Optional[float] = None,
) -> Tuple[float, float]:
    """
    Normalize a single-epoch SPHEREx channel flux measurement for a rotating
    non-spherical asteroid (such as 171 Ophelia, P = 6.665 hr) using ground-based
    SOLO or space-based CSA NEOSSat rotational lightcurve phase parameters:
        f_rot(t) = 10^(-0.4 * Delta_m_rot(t))
        F_corr(lambda_i) = F_obs(lambda_i, t_i) / f_rot(t_i)
    Also applies standard (r_h / AU)^2 * (Delta / AU)^2 distance normalization
    when heliocentric and observer distances are supplied.
    """
    f_rot = 1.0
    if rot_period_hr is not None and rot_period_hr > 0.1 and rot_amp_mag > 0.0:
        phase_rad = 2.0 * math.pi * ((float(mjd_obs) - float(mjd_zero)) * 24.0 / float(rot_period_hr))
        # Double-peaked asteroid ellipsoidal lightcurve harmonic
        delta_m = 0.5 * float(rot_amp_mag) * math.cos(2.0 * phase_rad)
        f_rot = 10.0 ** (-0.4 * delta_m)

    geom_scale = 1.0
    if r_hel_au is not None and r_obs_au is not None and r_hel_au > 0 and r_obs_au > 0:
        geom_scale = (float(r_hel_au) ** 2) * (float(r_obs_au) ** 2)

    norm_flux = (float(flux_ujy) / max(0.1, f_rot)) * geom_scale
    return float(norm_flux), float(f_rot)


def extract_102band_point_source_sed(
    cutout_list: Sequence[Dict[str, Any]],
    ra_deg: float,
    dec_deg: float,
    apply_quality_filter: bool = False,
    rot_period_hr: Optional[float] = None,
    rot_amp_mag: float = 0.0,
    r_hel_au: Optional[float] = None,
    r_obs_au: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Locked Contract #3 Function:
    Extract the 102-band (0.75 - 5.00 um) Spectral Energy Distribution (SED)
    and multi-epoch MJD light curve for a point source at `(ra_deg, dec_deg)`
    directly from un-reprojected Level 2 calibrated cutouts via generative
    ePSF / Tractor forced photometry within a `r = 2.5 pixel` (15.38'') core
    aperture.

    Evaluates:
      - Local background `flux_bkg` in a 15x15 bounding box masking `BIT_SOURCE` (Bit 21).
      - Optimal PSF-weighted amplitude `flux_ujy` and `flux_err_ujy`.
      - Tractor residual quality metric `fit_ql = <|p_k - m_k| / sigma_k>` inside `r <= 2.5 px`.
      - Aggregated bitmask `flags` inside the source core.
      - Quality filtering gate (`flags in {0, BIT_SOURCE, BIT_FULLSAMPLE, BIT_OVERFLOW}`
        and `fit_ql < 3.0`) for "Before vs. After Quality Filter" toggling.
    """
    raw_measurements: List[Dict[str, Any]] = []

    for frame in cutout_list:
        wcs: Optional[WCS] = frame.get("spatial_wcs")
        flux_arr = frame.get("flux_ujy")
        var_arr = frame.get("variance_ujy2")
        flags_arr = frame.get("flags_int32")
        wl_arr = frame.get("wavelength_um")
        bw_arr = frame.get("bandwidth_um")
        psf_stamp = frame.get("psf_stamp")

        if wcs is None or flux_arr is None:
            continue

        img = np.asarray(flux_arr, dtype=np.float64)
        ny, nx = img.shape

        try:
            xc_f, yc_f = wcs.world_to_pixel_values(float(ra_deg), float(dec_deg))
            xc = float(xc_f)
            yc = float(yc_f)
        except Exception:
            xc, yc = nx / 2.0, ny / 2.0

        ix = int(round(xc))
        iy = int(round(yc))
        if ix < 3 or ix >= nx - 3 or iy < 3 or iy >= ny - 3:
            continue

        # 1. Evaluate central wavelength and bandwidth at exact target pixel
        if wl_arr is not None:
            cwave_um = float( np.asarray(wl_arr)[iy, ix] )
        else:
            cwave_um = 3.40
        if bw_arr is not None:
            cband_um = float( np.asarray(bw_arr)[iy, ix] )
        else:
            cband_um = cwave_um / 41.0

        detector = int(frame.get("detector", 4))
        det_spec = SPHEREX_DETECTORS.get(detector, SPHEREX_DETECTORS[4])

        # Map wavelength to nearest global channel (1..102)
        ratio = max(1.001, det_spec.wavelength_max_um / det_spec.wavelength_min_um)
        rel_pos = math.log(max(det_spec.wavelength_min_um, min(det_spec.wavelength_max_um, cwave_um)) / det_spec.wavelength_min_um) / math.log(ratio)
        local_ch = max(1, min(17, int(round(rel_pos * 17.0 + 0.5))))
        global_channel = (detector - 1) * 17 + local_ch

        # 2. Local background estimation in 15x15 bounding region masking BIT_SOURCE (Bit 21)
        y0_bg, y1_bg = max(0, iy - 7), min(ny, iy + 8)
        x0_bg, x1_bg = max(0, ix - 7), min(nx, ix + 8)
        sub_bg_img = img[y0_bg:y1_bg, x0_bg:x1_bg]
        if flags_arr is not None:
            sub_bg_flags = np.asarray(flags_arr, dtype=np.int64)[y0_bg:y1_bg, x0_bg:x1_bg]
            bg_valid = np.isfinite(sub_bg_img) & ((sub_bg_flags & (FATAL_CORE_MASK | BIT_SOURCE)) == 0)
        else:
            bg_valid = np.isfinite(sub_bg_img)

        # Exclude central 5x5 source core from background box
        yy_b, xx_b = np.ogrid[y0_bg:y1_bg, x0_bg:x1_bg]
        bg_annulus = bg_valid & (((xx_b - xc) ** 2 + (yy_b - yc) ** 2) > (3.0**2))
        flux_bkg = float(np.nanmedian(sub_bg_img[bg_annulus])) if np.any(bg_annulus) else 0.0
        if not math.isfinite(flux_bkg):
            flux_bkg = 0.0

        # 3. Extract 7x7 stamp around target for r = 2.5 pixel forced PSF fitting
        r_ap = 2.5
        y0, y1 = max(0, iy - 3), min(ny, iy + 4)
        x0, x1 = max(0, ix - 3), min(nx, ix + 4)
        yy, xx = np.mgrid[y0:y1, x0:x1]
        dist_sq = (xx - xc) ** 2 + (yy - yc) ** 2
        ap_mask = dist_sq <= (r_ap**2)

        sub_img = img[y0:y1, x0:x1] - flux_bkg
        if var_arr is not None:
            sub_var = np.asarray(var_arr, dtype=np.float64)[y0:y1, x0:x1]
        else:
            sub_var = np.full_like(sub_img, 1.0)
        sub_var = np.where(np.isfinite(sub_var) & (sub_var > 1e-8), sub_var, 1.0)

        if flags_arr is not None:
            sub_flags = np.asarray(flags_arr, dtype=np.int64)[y0:y1, x0:x1]
            core_flags_int = int(np.bitwise_or.reduce(sub_flags[ap_mask].ravel()))
        else:
            sub_flags = np.zeros_like(sub_img, dtype=np.int64)
            core_flags_int = 0

        # Align normalized PSF model stamp P_k onto the 7x7 cutout window
        if psf_stamp is not None:
            p_full = np.asarray(psf_stamp, dtype=np.float64)
        else:
            p_full = np.exp(-0.5 * dist_sq / (1.05**2))

        if p_full.shape != sub_img.shape:
            py_c, px_c = p_full.shape[0] // 2, p_full.shape[1] // 2
            hy, hx = sub_img.shape[0] // 2, sub_img.shape[1] // 2
            p_k = p_full[
                max(0, py_c - hy) : max(0, py_c - hy) + sub_img.shape[0],
                max(0, px_c - hx) : max(0, px_c - hx) + sub_img.shape[1],
            ]
            if p_k.shape != sub_img.shape:
                p_k = np.exp(-0.5 * dist_sq / (1.05**2))
        else:
            p_k = p_full

        p_sum = float(np.sum(p_k))
        if p_sum > 0:
            p_k = p_k / p_sum

        # Mask fatal hardware pixels during Tractor amplitude fit
        usable = ap_mask & np.isfinite(sub_img) & ((sub_flags & FATAL_CORE_MASK) == 0)
        if not np.any(usable):
            usable = ap_mask & np.isfinite(sub_img)

        if np.any(usable):
            inv_v = 1.0 / sub_var[usable]
            pk_u = p_k[usable]
            pk_denom = float(np.sum((pk_u**2) * inv_v))
            if pk_denom > 1e-12:
                flux_fit = float(np.sum(sub_img[usable] * pk_u * inv_v) / pk_denom)
                flux_err = float(1.0 / math.sqrt(pk_denom))
            else:
                flux_fit = float(np.nansum(sub_img[usable]))
                flux_err = float(math.sqrt(np.nansum(sub_var[usable])))

            # Evaluate Tractor fit_ql = < |p_k - m_k| / sigma_k > inside r = 2.5 px
            model_vals = flux_fit * pk_u
            sigma_vals = np.sqrt(sub_var[usable])
            fit_ql = float(np.mean(np.abs(sub_img[usable] - model_vals) / np.maximum(sigma_vals, 1e-6)))
        else:
            flux_fit = 0.0
            flux_err = 1.0
            fit_ql = 9.9

        mjd_obs = float(frame.get("mjd", 60900.0))
        flux_norm, f_rot = apply_asteroid_rotational_and_distance_normalization(
            flux_ujy=flux_fit,
            mjd_obs=mjd_obs,
            rot_period_hr=rot_period_hr,
            rot_amp_mag=rot_amp_mag,
            r_hel_au=r_hel_au,
            r_obs_au=r_obs_au,
        )

        # Quality flag check (Section 5.3 / Report 4 Section 5):
        # Clean rows have flags in {0, BIT_SOURCE, BIT_FULLSAMPLE, BIT_OVERFLOW} and fit_ql < 3.0
        has_bad_flag = ((core_flags_int & (~BENIGN_SCIENCE_BITS)) != 0) or (
            ((core_flags_int & BIT_OVERFLOW) != 0) and ((core_flags_int & BIT_SUR_ERROR) != 0)
        )
        is_clean_quality = (not has_bad_flag) and (fit_ql < 3.0) and ((core_flags_int & BIT_DICHROIC) == 0)

        if apply_quality_filter and not is_clean_quality:
            continue

        raw_measurements.append(
            {
                "global_channel": int(global_channel),
                "band_id": int(detector),
                "cwave_um": float(round(cwave_um, 5)),
                "wavelength_um": float(round(cwave_um, 5)),
                "cband_um": float(round(cband_um, 5)),
                "bandwidth_um": float(round(cband_um, 5)),
                "resolving_power": float(det_spec.resolving_power),
                "flux_ujy": float(round(flux_norm, 4)),
                "flux_err_ujy": float(round(flux_err, 4)),
                "variance_ujy2": float(round(flux_err**2, 6)),
                "fit_ql": float(round(fit_ql, 3)),
                "flags": int(core_flags_int),
                "is_clean": bool(is_clean_quality),
                "mjd": float(round(mjd_obs, 5)),
                "f_rot": float(round(f_rot, 4)),
            }
        )

    raw_measurements.sort(key=lambda m: (float(m["mjd"]), int(m["global_channel"])))
    molecular_indices = compute_102band_molecular_indices(raw_measurements)

    return {
        "ra": float(ra_deg),
        "dec": float(dec_deg),
        "count": len(raw_measurements),
        "measurements": raw_measurements,
        "molecular_indices": molecular_indices,
    }


# ============================================================================
# 4. REGIME B: EXTENDED COMETARY COMA PROFILER & Q_GAS SOLVER (CONTRACT #3)
# ============================================================================
def extract_extended_coma_profile_and_qgas(
    cutout_mjysr: np.ndarray,
    bad_mask: Optional[np.ndarray],
    x_comet: float,
    y_comet: float,
    r_hel_au: float = 3.2,
    r_obs_au: float = 2.6,
    pix_scale_arcsec: float = SPHEREX_NATIVE_PIXEL_SCALE_ARCSEC,
    freq_hz: float = 7.037e13,       # 4.26 um CO2 fundamental band frequency
    delta_freq_hz: float = 6.28e11,  # Band 5 R = 112 channel width
    g_factor_1au: float = 2.6e-3,    # Solar fluorescence efficiency g at 1 AU (s^-1)
    v_gas_ms: float = 480.0,         # Outflow gas velocity (0.48 km/s at 3.2 AU, 0.60 km/s at 2.1 AU)
) -> Dict[str, Any]:
    """
    Locked Contract #3 Function:
    Execute the Lisse et al. (2025, 2026) SPHEREx extended-coma extraction
    pipeline for active comets (such as Interstellar Comet 3I/ATLAS), bypassing
    point-source Tractor fitting:

      1. Converts surface brightness (MJy/sr) to flux density per pixel (Jy/pix)
         using the pixel solid angle `Omega_pix = (pix_scale_arcsec / 206264.806247)^2 sr`.
      2. Places a 2.0-pixel radius (12.3'') circular nuclear + inner-coma aperture
         centered on `(x_comet, y_comet)` and subtracts the modal background
         measured in a distant sky annulus (`r_in = 35.0`, `r_out = 45.0` pixels)
         situated outside the >= 3-arcmin CO2 coma.
      3. Evaluates the azimuthally averaged radial surface brightness profile
         `I_v(rho)` in 1-pixel-thick circular annuli from `rho = 0.5` to `35.5` pixels
         using a 3-sigma clipped modal estimator (`3*median - 2*mean`) to reject
         unmasked background stars.
      4. Integrates `I_v(rho)` out to the 30-pixel (184.5'', ~348,000 km) coma
         boundary and computes the molecular outgassing production rate:
             Q_gas = 2 * v_gas * r * N_gas  (in molecules / s).
    """
    img_mjysr = np.nan_to_num(np.asarray(cutout_mjysr, dtype=np.float64), nan=0.0)
    ny, nx = img_mjysr.shape

    if bad_mask is not None:
        mask_bool = np.asarray(bad_mask, dtype=bool) | (~np.isfinite(cutout_mjysr))
    else:
        mask_bool = ~np.isfinite(cutout_mjysr)

    # Pixel solid angle in steradians: 1 MJy/sr = 1e6 Jy/sr
    omega_pix_sr = (float(pix_scale_arcsec) / 206264.806247) ** 2
    img_jy_per_pix = img_mjysr * 1e6 * omega_pix_sr

    # 1. Distant sky annulus background estimation (35 to 45 pixels, clamped if cutout is smaller)
    max_r = max(6.0, min(ny, nx) / 2.0 - 1.0)
    r_in_bg = min(35.0, max(4.0, max_r - 4.0))
    r_out_bg = min(45.0, max(r_in_bg + 2.0, max_r))

    yy, xx = np.mgrid[0:ny, 0:nx]
    radii_px = np.hypot(xx - float(x_comet), yy - float(y_comet))

    bg_sel = (radii_px >= r_in_bg) & (radii_px <= r_out_bg) & (~mask_bool)
    if np.any(bg_sel):
        clipped_bg = sigma_clip(img_jy_per_pix[bg_sel], sigma=3.0, maxiters=5, masked=False)
        med_bg = float(np.nanmedian(clipped_bg))
        mean_bg = float(np.nanmean(clipped_bg))
        modal_bg_jy_pix = 3.0 * med_bg - 2.0 * mean_bg
        if not math.isfinite(modal_bg_jy_pix):
            modal_bg_jy_pix = med_bg
    else:
        modal_bg_jy_pix = float(np.nanmedian(img_jy_per_pix[~mask_bool])) if np.any(~mask_bool) else 0.0

    img_sub_jy = img_jy_per_pix - modal_bg_jy_pix
    img_sub_mjysr = img_sub_jy / (1e6 * omega_pix_sr)

    # Core 2-pixel radius aperture photometry
    core_ap = CircularAperture((float(x_comet), float(y_comet)), r=2.0)
    phot_tbl = aperture_photometry(img_sub_jy, core_ap, mask=mask_bool)
    f_core_2pix_jy = max(0.0, float(phot_tbl["aperture_sum"][0]))

    # 2. Azimuthally averaged radial profile via 3-sigma clipped mode in 1-pixel annuli
    annulus_edges = np.arange(0.5, min(35.5, max_r), 1.0, dtype=np.float64)
    radii_arcsec: List[float] = []
    radial_profile_mjysr: List[float] = []
    annulus_flux_jy: List[float] = []

    for r_inner in annulus_edges:
        r_outer = r_inner + 1.0
        r_mid_px = 0.5 * (r_inner + r_outer)
        ring_sel = (radii_px >= r_inner) & (radii_px < r_outer) & (~mask_bool)

        if int(np.sum(ring_sel)) >= 5:
            ring_vals = img_sub_mjysr[ring_sel]
            clipped_ring = sigma_clip(ring_vals, sigma=3.0, maxiters=4, masked=False)
            med_r = float(np.nanmedian(clipped_ring))
            mean_r = float(np.nanmean(clipped_ring))
            mode_mjysr = max(0.0, 3.0 * med_r - 2.0 * mean_r)
        elif np.any(ring_sel):
            mode_mjysr = max(0.0, float(np.nanmedian(img_sub_mjysr[ring_sel])))
        else:
            mode_mjysr = 0.0

        radii_arcsec.append(float(round(r_mid_px * pix_scale_arcsec, 2)))
        radial_profile_mjysr.append(float(round(mode_mjysr, 5)))

        # Area of 1-pixel-thick annulus in pixels: pi * (r_outer^2 - r_inner^2)
        ring_area_px = math.pi * (r_outer**2 - r_inner**2)
        if r_mid_px <= 30.0:
            annulus_flux_jy.append(mode_mjysr * 1e6 * omega_pix_sr * ring_area_px)

    # 3. Integrate radial profile out to outer coma boundary (30 pixels = 184.5 arcsec)
    f_total_30pix_jy = max(f_core_2pix_jy, float(np.sum(annulus_flux_jy)))

    # 4. Compute molecular gas production rate Q_gas = 2 * v_gas * r * N_gas (Lisse et al. 2025 Eq. 2)
    au_m = 1.495978707e11
    h_planck = 6.62607015e-34
    r_coma_rad = (30.0 * float(pix_scale_arcsec)) / 206264.806247
    r_proj_m = r_coma_rad * float(r_obs_au) * au_m

    # Total band luminosity L_band (W) and total emitted photon rate N_dot_photons (s^-1)
    f_total_w_m2_hz = f_total_30pix_jy * 1e-26
    f_band_w_m2 = f_total_w_m2_hz * float(delta_freq_hz)
    l_band_watts = 4.0 * math.pi * ((float(r_obs_au) * au_m) ** 2) * f_band_w_m2

    # Fluorescence efficiency at heliocentric distance r_hel_au: g(r_h) = g_1au / r_h^2
    g_rh = float(g_factor_1au) / max(0.05, float(r_hel_au) ** 2)
    photon_energy_j = h_planck * float(freq_hz)

    # Total molecules inside projected radius r_proj_m: N_tot = L_band / (h * nu * g(r_h))
    # Average column density N_gas = N_tot / (pi * r_proj_m^2), so Q_gas = 2 * v_gas * r_proj_m * N_gas
    n_tot_molecules = l_band_watts / max(1e-35, photon_energy_j * g_rh)
    n_gas_col_m2 = n_tot_molecules / max(1.0, math.pi * (r_proj_m**2))
    q_gas_molecules_sec = 2.0 * float(v_gas_ms) * r_proj_m * n_gas_col_m2

    return {
        "f_core_2pix_mJy": float(round(f_core_2pix_jy * 1e3, 4)),
        "f_total_30pix_mJy": float(round(f_total_30pix_jy * 1e3, 4)),
        "radii_arcsec": radii_arcsec,
        "radial_profile_MJysr": radial_profile_mjysr,
        "Q_gas_molecules_sec": float(q_gas_molecules_sec),
        "r_proj_km": float(round(r_proj_m * 1e-3, 1)),
    }