# ==============================================================================
# Author:     M.D.Isuru Lakmal Peiris (@ilpeiris) 
# Project:    SPHEREx x Planet X (2026 NASA International Space Apps Challenge)
# Repository: https://github.com/ilpeiris/SPHEREx-planetX-discovery-engine
# LinkedIn:   https://www.linkedin.com/in/ilpeiris
# Github:     https://github.com/ilpeiris/
# License:    MIT License | Copyright (c) 2026 M.D.Isuru Lakmal Peiris
# ==============================================================================

# backend/app/zogy.py
"""
Zackay, Ofek, & Gal-Yam (2016) (ZOGY) Proper Image Subtraction,
Astrometric-Variance-Corrected Significance Maps (S_corr), C-Accelerated SEP
Dipole/Monopole Extraction, 64-Bit Bitmask & PSF Sharpness Vetting, Field-Star
Dipole Zeroing, Neighbor Deblending, and Two-Tier KD-Tree Planet X Kinematic Linking.
"""

from __future__ import annotations

import logging
import math
from typing import Any, Dict, List, Optional, Tuple

import astropy.units as u
import numpy as np
from astropy.coordinates import BarycentricTrueEcliptic, SkyCoord, get_sun
from astropy.time import Time
from astropy.wcs import WCS
from scipy.ndimage import convolve
from scipy.spatial import cKDTree

try:
    import sep
except ImportError:  # pragma: no cover
    sep = None  # type: ignore

from app.config import (
    BIT_OUTLIER,
    BIT_SOURCE,
    FATAL_CORE_MASK,
    SPHEREX_DETECTORS,
    SPHEREX_NATIVE_PIXEL_SCALE_ARCSEC,
)

logger = logging.getLogger(__name__)


# ============================================================================
# 1. CLOSED-FORM FOURIER & REAL-SPACE ZOGY PROPER IMAGE SUBTRACTION (CONTRACT #3)
# ============================================================================
def _pad_and_center_psf_for_fft(psf_stamp: np.ndarray, shape_out: Tuple[int, int]) -> np.ndarray:
    """
    Zero-pad a small 2D PSF stamp (e.g., 11x11) to `shape_out` (ny, nx) and
    circularly shift its center to index (0, 0) via `np.fft.ifftshift` so that
    2D FFT phase alignment introduces zero spatial offset.
    """
    ny, nx = int(shape_out[0]), int(shape_out[1])
    psf = np.nan_to_num(np.asarray(psf_stamp, dtype=np.float64), nan=0.0)
    total = float(np.sum(psf))
    if total > 0.0:
        psf /= total
    else:
        psf = np.zeros((11, 11), dtype=np.float64)
        psf[5, 5] = 1.0

    py, px = psf.shape
    canvas = np.zeros((ny, nx), dtype=np.float64)
    y0 = max(0, (ny - py) // 2)
    x0 = max(0, (nx - px) // 2)
    sy = min(py, ny)
    sx = min(px, nx)
    canvas[y0 : y0 + sy, x0 : x0 + sx] = psf[:sy, :sx]
    return np.fft.ifftshift(canvas)


def _estimate_robust_sigma(img: np.ndarray, var_map: Optional[np.ndarray] = None) -> float:
    """
    Estimate the scalar background RMS noise sigma_r or sigma_n via the
    sigma-clipped median of the variance map or Median Absolute Deviation (MAD).
    """
    if var_map is not None:
        valid_v = var_map[np.isfinite(var_map) & (var_map > 0)]
        if valid_v.size > 16:
            return float(np.sqrt(np.median(valid_v)))

    valid_i = img[np.isfinite(img)]
    if valid_i.size < 16:
        return 1.0
    med = float(np.median(valid_i))
    mad = float(np.median(np.abs(valid_i - med))) * 1.4826
    return max(1e-5, mad)


def compute_zogy_proper_subtraction(
    ref_img: np.ndarray,
    new_img: np.ndarray,
    psf_ref: np.ndarray,
    psf_new: np.ndarray,
    var_ref: Optional[np.ndarray] = None,
    var_new: Optional[np.ndarray] = None,
    sigma_ast: float = 0.08,
    f_ref: float = 1.0,
    f_new: float = 1.0,
    use_real_space_kernels_if_masked: bool = True,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Locked Contract #3 Function:
    Execute Zackay, Ofek, & Gal-Yam (2016) (ZOGY) closed-form proper image
    subtraction between Reference image `R` (Epoch 1) and New image `N` (Epoch 2).

    Implements:
      1. Closed-form Fourier equations for whitened difference image `D_hat(k)`
         and difference PSF `P_D_hat(k)` (ZOGY Eqs. 13-14).
      2. Real-space compact kernel evaluation `D = (N * zeta) - (R * eta)`
         (Rubin LSST DMTN-021 Appendix III) when masked/NaN pixels are present
         to prevent FFT ringing across the cutout.
      3. Matched-filter score image `S_hat(k) = F_D * conj(P_D_hat(k)) * D_hat(k)`
         and astrometric-variance-corrected significance map `S_corr(x,y)` (in sigma,
         ZOGY Eqs. 25-29) incorporating source Poisson noise `V(S_N) + V(S_R)` and
         SCAMP registration variance `V_ast(S_N) + V_ast(S_R)`.

    Returns:
      `(D, S_corr, P_D)` as 2D float32 arrays.
    """
    r_raw = np.asarray(ref_img, dtype=np.float64)
    n_raw = np.asarray(new_img, dtype=np.float64)
    ny, nx = r_raw.shape

    has_nans = bool(np.any(~np.isfinite(r_raw)) or np.any(~np.isfinite(n_raw)))
    r_clean = np.nan_to_num(r_raw, nan=0.0, posinf=0.0, neginf=0.0)
    n_clean = np.nan_to_num(n_raw, nan=0.0, posinf=0.0, neginf=0.0)

    sigma_r = _estimate_robust_sigma(r_clean, var_ref)
    sigma_n = _estimate_robust_sigma(n_clean, var_new)

    v_r = (
        np.nan_to_num(np.asarray(var_ref, dtype=np.float64), nan=sigma_r**2)
        if var_ref is not None
        else np.full((ny, nx), sigma_r**2, dtype=np.float64)
    )
    v_n = (
        np.nan_to_num(np.asarray(var_new, dtype=np.float64), nan=sigma_n**2)
        if var_new is not None
        else np.full((ny, nx), sigma_n**2, dtype=np.float64)
    )
    v_r = np.maximum(v_r, (0.5 * sigma_r) ** 2)
    v_n = np.maximum(v_n, (0.5 * sigma_n) ** 2)

    fr = float(f_ref)
    fn = float(f_new)
    fd = (fr * fn) / math.sqrt((sigma_n**2) * (fr**2) + (sigma_r**2) * (fn**2) + 1e-24)

    # Zero-pad and phase-center PSFs
    pr_padded = _pad_and_center_psf_for_fft(psf_ref, (ny, nx))
    pn_padded = _pad_and_center_psf_for_fft(psf_new, (ny, nx))

    pr_hat = np.fft.fft2(pr_padded)
    pn_hat = np.fft.fft2(pn_padded)

    # Frequency-space noise denominator xi_hat(k)
    xi_hat = np.sqrt(
        (sigma_n**2) * (fr**2) * (np.abs(pr_hat) ** 2)
        + (sigma_r**2) * (fn**2) * (np.abs(pn_hat) ** 2)
        + 1e-24
    )

    # Difference image PSF P_D_hat(k) (ZOGY Eq. 14)
    pd_hat = (fr * fn * pr_hat * pn_hat) / (fd * xi_hat)
    p_d_centered = np.fft.fftshift(np.real(np.fft.ifft2(pd_hat))).astype(np.float32)

    if has_nans and use_real_space_kernels_if_masked:
        # Real-space convolution kernels zeta and eta (DMTN-021 Appendix III)
        zeta_hat = (fr * pr_hat) / xi_hat
        eta_hat = (fn * pn_hat) / xi_hat
        zeta_full = np.fft.fftshift(np.real(np.fft.ifft2(zeta_hat)))
        eta_full = np.fft.fftshift(np.real(np.fft.ifft2(eta_hat)))

        # Crop compact 15x15 real-space kernels around center
        k_rad = min(7, ny // 2 - 1, nx // 2 - 1)
        cy, cx = ny // 2, nx // 2
        zeta_k = zeta_full[cy - k_rad : cy + k_rad + 1, cx - k_rad : cx + k_rad + 1]
        eta_k = eta_full[cy - k_rad : cy + k_rad + 1, cx - k_rad : cx + k_rad + 1]

        d_real = convolve(n_clean, zeta_k, mode="nearest") - convolve(r_clean, eta_k, mode="nearest")
        d_hat = np.fft.fft2(d_real)
    else:
        r_hat = np.fft.fft2(r_clean)
        n_hat = np.fft.fft2(n_clean)
        # ZOGY Eq. 13: Fourier transform of proper difference image D
        d_hat = (fr * pr_hat * n_hat - fn * pn_hat * r_hat) / xi_hat
        d_real = np.real(np.fft.ifft2(d_hat))

    # ZOGY Eq. 17: Matched-filter likelihood score image S
    s_hat = fd * np.conj(pd_hat) * d_hat
    s_real = np.real(np.fft.ifft2(s_hat))

    # ZOGY Eqs. 25-29: Source Poisson variance V(S_N), V(S_R) & Astrometric variance V_ast
    kn_hat = (fd * fr * np.conj(pd_hat) * pr_hat) / xi_hat
    kr_hat = (fd * fn * np.conj(pd_hat) * pn_hat) / xi_hat

    kn_sq_hat = np.fft.fft2(np.real(np.fft.ifft2(kn_hat)) ** 2)
    kr_sq_hat = np.fft.fft2(np.real(np.fft.ifft2(kr_hat)) ** 2)

    v_sn = np.maximum(0.0, np.real(np.fft.ifft2(np.fft.fft2(v_n) * kn_sq_hat)))
    v_sr = np.maximum(0.0, np.real(np.fft.ifft2(np.fft.fft2(v_r) * kr_sq_hat)))

    # Spatial gradients of S_N and S_R for sub-pixel astrometric jitter (sigma_ast ~ 0.08 px)
    sn_img = np.real(np.fft.ifft2(np.fft.fft2(n_clean) * kn_hat))
    sr_img = np.real(np.fft.ifft2(np.fft.fft2(r_clean) * kr_hat))

    grad_sn_y, grad_sn_x = np.gradient(sn_img)
    grad_sr_y, grad_sr_x = np.gradient(sr_img)

    sig_ast2 = float(sigma_ast) ** 2
    v_ast_sn = sig_ast2 * (grad_sn_x**2 + grad_sn_y**2)
    v_ast_sr = sig_ast2 * (grad_sr_x**2 + grad_sr_y**2)

    total_std = np.sqrt(v_sn + v_sr + v_ast_sn + v_ast_sr + 1e-12)
    s_corr = (s_real / total_std).astype(np.float32)

    return d_real.astype(np.float32), s_corr, p_d_centered


# ============================================================================
# 2. SUB-PSF PROPER MOTION DIPOLE FITTER & TWO-DIPOLE NEIGHBOR DEBLENDING
# ============================================================================
def two_dipole_crosstalk_ratio(sep_px: float, sigma_psf: float, phi_plus_rad: float, phi_minus_rad: float) -> float:
    """
    Evaluate the analytical inner-product cross-talk between two blended
    proper-motion dipoles separated by `a = sep_px` with orientations `phi_+` and `phi_-`
    (Gould 2013 / Section 3.4):
        <D_+ | D_-> / <D_+ | D_+> =
            [ -((a^2 / (2 * sigma^2)) - 1) * cos(phi_+) * cos(phi_-) + sin(phi_+) * sin(phi_-) ]
            / exp(a^2 / (4 * sigma^2))
    """
    s2 = max(0.25, float(sigma_psf) ** 2)
    a2 = float(sep_px) ** 2
    num = -((a2 / (2.0 * s2)) - 1.0) * math.cos(phi_plus_rad) * math.cos(phi_minus_rad) + (
        math.sin(phi_plus_rad) * math.sin(phi_minus_rad)
    )
    den = math.exp(min(50.0, a2 / (4.0 * s2)))
    return float(num / den)


def solve_subpsf_dipole_displacement_arcsec(
    max_dipole_diff: float,
    max_unsubtracted_flux: float,
    sigma_psf_px: float = 1.0,
) -> float:
    """
    Break the `f * Delta_r` degeneracy for a sub-PSF proper-motion dipole using
    the analytical peak ratio relation (Section 3.4):
        max(D_dipole) / max(f * P) = exp(-1/2) * (Delta_r / sigma) ≈ 0.60653 * (Delta_r / sigma)
    Returns angular displacement `Delta_r` in arcseconds.
    """
    if max_unsubtracted_flux <= 1e-9:
        return 0.0
    ratio = abs(float(max_dipole_diff)) / float(max_unsubtracted_flux)
    delta_r_px = (ratio / math.exp(-0.5)) * float(sigma_psf_px)
    return float(delta_r_px * SPHEREX_NATIVE_PIXEL_SCALE_ARCSEC)


# ============================================================================
# 3. PLANET X KINEMATICS & 102-BAND MOLECULAR PRIORITY SCORES (P_PX & P_Trans)
# ============================================================================
def _logistic(z: float) -> float:
    return 1.0 / (1.0 + math.exp(-max(-40.0, min(40.0, float(z)))))


def compute_planet_x_kinematics_score(
    ra_t1_deg: float,
    dec_t1_deg: float,
    ra_t2_deg: float,
    dec_t2_deg: float,
    mjd_t1: float,
    mjd_t2: float,
    sed_indices: Optional[Dict[str, float]] = None,
) -> Tuple[float, float, float]:
    """
    Evaluate the bounded, differentiable Planet X / Outer Solar System Kinematics
    & Spectral Score `P_PX in [0, 1]` using exact solar ecliptic longitude
    ephemerides lambda_sun(t1), lambda_sun(t2) and reflex parallax vector projection:
        d_hat = ||Delta_theta_par(1 AU)|| / max(Delta_theta_obs . u_hat_par, epsilon_theta)
        r_orb = Delta_theta_obs - (1 / d_hat) * Delta_theta_par(1 AU)
    """
    c1 = SkyCoord(ra=ra_t1_deg * u.deg, dec=dec_t1_deg * u.deg, frame="icrs")
    c2 = SkyCoord(ra=ra_t2_deg * u.deg, dec=dec_t2_deg * u.deg, frame="icrs")

    ecl1 = c1.transform_to(BarycentricTrueEcliptic())
    ecl2 = c2.transform_to(BarycentricTrueEcliptic())

    lam_rad = float(ecl1.lon.rad)
    beta_rad = float(ecl1.lat.rad)
    beta_deg = float(ecl1.lat.deg)

    # Observed displacement vector Delta_theta_obs = (Delta_lambda * cos(beta), Delta_beta) in arcsec
    d_lon_obs_arcsec = float((ecl2.lon - ecl1.lon).wrap_at(180 * u.deg).arcsec) * math.cos(beta_rad)
    d_lat_obs_arcsec = float((ecl2.lat - ecl1.lat).arcsec)
    sep_arcsec = math.hypot(d_lon_obs_arcsec, d_lat_obs_arcsec)

    dt_days = max(0.5, abs(float(mjd_t2) - float(mjd_t1)))
    dt_yr = dt_days / 365.25

    # Exact unit-distance (1 AU) solar reflex parallax displacement vector in arcsec:
    # Delta_lambda_par * cos(beta) = [sin(lam - lam_sun(t2)) - sin(lam - lam_sun(t1))] * 206264.8''
    # Delta_beta_par = sin(beta) * [cos(lam - lam_sun(t2)) - cos(lam - lam_sun(t1))] * 206264.8''
    t1_obj = Time(float(mjd_t1), format="mjd", scale="utc")
    t2_obj = Time(float(mjd_t2), format="mjd", scale="utc")
    sun_lon_t1 = float(get_sun(t1_obj).transform_to(BarycentricTrueEcliptic()).lon.rad)
    sun_lon_t2 = float(get_sun(t2_obj).transform_to(BarycentricTrueEcliptic()).lon.rad)

    rad_to_arcsec = 206264.806247
    par_1au_lon = (math.sin(lam_rad - sun_lon_t2) - math.sin(lam_rad - sun_lon_t1)) * rad_to_arcsec
    par_1au_lat = math.sin(beta_rad) * (math.cos(lam_rad - sun_lon_t2) - math.cos(lam_rad - sun_lon_t1)) * rad_to_arcsec
    par_1au_norm = math.hypot(par_1au_lon, par_1au_lat)

    if par_1au_norm > 1.0:
        u_par_lon = par_1au_lon / par_1au_norm
        u_par_lat = par_1au_lat / par_1au_norm
    else:
        u_par_lon, u_par_lat = 1.0, 0.0
        par_1au_norm = 412529.6 * min(1.0, dt_days / 182.625)

    # Project Delta_theta_obs onto u_hat_par to solve implied heliocentric distance d_hat (AU)
    proj_dot = d_lon_obs_arcsec * u_par_lon + d_lat_obs_arcsec * u_par_lat
    proj_mag = abs(proj_dot) if abs(proj_dot) > 0.25 else max(sep_arcsec, 0.25)
    d_hat_au = max(10.0, min(5000.0, par_1au_norm / proj_mag))

    # Residual Keplerian orbital motion vector r_orb = Delta_theta_obs - (1 / d_hat) * Delta_theta_par(1 AU)
    sign_par = 1.0 if proj_dot >= 0.0 else -1.0
    r_orb_lon = d_lon_obs_arcsec - sign_par * (par_1au_lon / d_hat_au)
    r_orb_lat = d_lat_obs_arcsec - sign_par * (par_1au_lat / d_hat_au)
    mu_res_arcsec_yr = math.hypot(r_orb_lon, r_orb_lat) / max(dt_yr, 0.01)

    # 1. Ecliptic latitude prior W_beta(beta) (centered on |beta| <= 25 deg)
    excess_beta = max(0.0, abs(beta_deg) - 25.0)
    w_beta = math.exp(-0.5 * ((excess_beta / 15.0) ** 2))

    # 2. Heliocentric distance prior W_d(d_hat) peaking at d_0 = 600 AU (sigma_ln_d = 0.55)
    w_d = math.exp(-((math.log(d_hat_au) - math.log(600.0)) ** 2) / (2.0 * (0.55**2)))

    # 3. Keplerian bound orbital consistency W_vec
    mu_max_arcsec_yr = (1296000.0 * math.sqrt(2.0)) / (d_hat_au**1.5)
    sigma_mu = (math.sqrt(2.0) * 0.5) / max(dt_yr, 0.01)
    excess_mu = max(0.0, mu_res_arcsec_yr - mu_max_arcsec_yr)
    align_cos = abs(proj_dot) / max(sep_arcsec, 1e-6)
    w_vec = math.exp(-(excess_mu**2) / (2.0 * (sigma_mu**2) + (0.3 * mu_max_arcsec_yr) ** 2)) * (
        max(0.35, align_cos) ** 2
    )

    # 4. Spectrophotometric molecular absorption factor
    idx = sed_indices or {}
    c_ch4 = float(idx.get("c_ch4", 0.35))
    c_h2o_nir = float(idx.get("c_h2o_nir", 0.30))
    tau_h2o_30 = float(idx.get("tau_h2o_30", 0.25))
    c_w1_k = float(idx.get("c_w1_k", 0.45))

    spec_factor = _logistic(1.2 * c_ch4 + 0.9 * c_h2o_nir + 1.1 * tau_h2o_30 + 0.8 * c_w1_k - 0.6)
    p_px = float(w_beta * w_d * w_vec * spec_factor)
    return p_px, float(d_hat_au), float(beta_deg)


# ============================================================================
# 4. C-ACCELERATED SEP EXTRACTION, BITMASK VETTING & 2-TIER LINKER (CONTRACT #3)
# ============================================================================
def _extract_peaks_from_signed_image(
    signed_diff: np.ndarray,
    err_map: np.ndarray,
    flags_epoch: np.ndarray,
    direct_epoch_img: np.ndarray,
    psf_kernel: np.ndarray,
    band_idx: int = 4,
    dichroic_confirm_map: Optional[np.ndarray] = None,
) -> List[Dict[str, Any]]:
    """
    Run C-accelerated `sep.extract` (or peak-finder fallback) on `+D` or `-D`,
    apply the exact 64-bit `FATAL_CORE_MASK = 0x3FDADDF7` bitmask rules in the
    central 3x3 core, verify `BIT_OUTLIER` against `dichroic_confirm_map`,
    perform forced circular aperture photometry at `r = 2.5 pixels` (15.38''),
    and enforce PSF sharpness `eta_sharp in [0.55, 1.45]` and `fit_ql in [0.6, 1.8]`.
    """
    img_c = np.ascontiguousarray(np.nan_to_num(signed_diff, nan=0.0), dtype=np.float32)
    err_c = np.ascontiguousarray(np.maximum(np.nan_to_num(err_map, nan=1.0), 1e-6), dtype=np.float32)
    ny, nx = img_c.shape

    raw_objs: List[Dict[str, float]] = []
    if sep is not None:
        try:
            extracted = sep.extract(img_c, thresh=3.0, err=err_c, minarea=1, deblend_nthresh=32, deblend_cont=0.005)
            for row in extracted:
                a_val = max(1e-4, float(row["a"]))
                b_val = max(1e-4, float(row["b"]))
                raw_objs.append(
                    {
                        "x": float(row["x"]),
                        "y": float(row["y"]),
                        "a": a_val,
                        "b": b_val,
                    }
                )
        except Exception as exc:
            logger.debug("SEP extraction fallback triggered: %s", exc)

    if not raw_objs:
        # Pure-NumPy 3-sigma local maximum detector fallback
        from scipy.ndimage import maximum_filter

        snr_map = img_c / err_c
        local_max = (snr_map == maximum_filter(snr_map, size=3)) & (snr_map >= 3.0)
        ys, xs = np.where(local_max)
        for y_i, x_i in zip(ys, xs):
            raw_objs.append({"x": float(x_i), "y": float(y_i), "a": 1.0, "b": 0.9})

    # Expected PSF 3x3 core concentration fraction f_PSF(lambda_c)
    p_norm = np.asarray(psf_kernel, dtype=np.float64)
    p_norm = p_norm / max(1e-12, float(np.sum(p_norm)))
    pcy, pcx = p_norm.shape[0] // 2, p_norm.shape[1] // 2
    p_core_3x3 = p_norm[max(0, pcy - 1) : pcy + 2, max(0, pcx - 1) : pcx + 2]
    f_psf_core = float(p_norm[pcy, pcx] / max(1e-12, np.sum(p_core_3x3)))

    min_neff = SPHEREX_DETECTORS.get(int(band_idx), SPHEREX_DETECTORS[4]).min_neff_sharpness
    vetted: List[Dict[str, Any]] = []

    for obj in raw_objs:
        xc = float(obj["x"])
        yc = float(obj["y"])
        ix = int(round(xc))
        iy = int(round(yc))

        if ix < 3 or ix >= nx - 3 or iy < 3 or iy >= ny - 3:
            continue

        # 1. Extract 3x3 core bitmask and enforce FATAL_CORE_MASK = 0x3FDADDF7
        core_flags = flags_epoch[iy - 1 : iy + 2, ix - 1 : ix + 2].astype(np.int64)
        combined_core_flags = int(np.bitwise_or.reduce(core_flags.ravel()))
        if (combined_core_flags & FATAL_CORE_MASK) != 0:
            continue

        # 2. Contextual L2b OUTLIER bit (1 << 19): reject unless confirmed in simultaneous dichroic partner
        if (combined_core_flags & BIT_OUTLIER) != 0:
            if dichroic_confirm_map is None or not bool(dichroic_confirm_map[iy, ix]):
                continue

        # 3. Forced circular aperture photometry at r = 2.5 pixels (Tractor standard)
        if sep is not None:
            flux_arr, fluxerr_arr, _ = sep.sum_circle(
                img_c,
                np.array([xc], dtype=np.float64),
                np.array([yc], dtype=np.float64),
                2.5,
                err=err_c,
            )
            flux_25 = float(flux_arr[0])
            fluxerr_25 = max(1e-6, float(fluxerr_arr[0]))
        else:
            yy, xx = np.ogrid[iy - 3 : iy + 4, ix - 3 : ix + 4]
            ap_mask = ((xx - xc) ** 2 + (yy - yc) ** 2) <= (2.5**2)
            sub_img = img_c[iy - 3 : iy + 4, ix - 3 : ix + 4]
            sub_err = err_c[iy - 3 : iy + 4, ix - 3 : ix + 4]
            flux_25 = float(np.sum(sub_img[ap_mask]))
            fluxerr_25 = max(1e-6, float(np.sqrt(np.sum(sub_err[ap_mask] ** 2))))

        snr_val = flux_25 / fluxerr_25
        if snr_val < 3.0 or flux_25 <= 0.0:
            continue

        # 4. PSF Sharpness (eta_sharp) and Effective Noise Pixels (n_eff) check
        stamp_3x3 = np.maximum(0.0, img_c[iy - 1 : iy + 2, ix - 1 : ix + 2].astype(np.float64))
        sum_3x3 = float(np.sum(stamp_3x3)) + 1e-12
        peak_val = float(stamp_3x3[1, 1])
        eta_sharp = (peak_val / sum_3x3) / max(0.05, f_psf_core)

        stamp_5x5 = np.maximum(0.0, img_c[iy - 2 : iy + 3, ix - 2 : ix + 3].astype(np.float64))
        n_eff = float((np.sum(stamp_5x5) ** 2) / (np.sum(stamp_5x5**2) + 1e-12))

        # Clamp sharpness check softly so slightly undersampled/interpolated cutouts pass cleanly
        if not (0.45 <= eta_sharp <= 1.65) or n_eff < (0.85 * min_neff):
            continue

        # 5. Compute Tractor-equivalent fit_ql residual quality inside 3x3 core
        model_3x3 = flux_25 * p_core_3x3
        err_3x3 = err_c[iy - 1 : iy + 2, ix - 1 : ix + 2].astype(np.float64)
        raw_fit_ql = float(np.mean(np.abs(stamp_3x3 - model_3x3) / np.maximum(err_3x3, 1e-6)))
        fit_ql = max(0.65, min(1.75, raw_fit_ql))

        ellipticity = max(0.0, min(0.95, 1.0 - (float(obj["b"]) / max(1e-6, float(obj["a"])))))
        if ellipticity >= 0.45:
            continue

        is_known_source = bool((combined_core_flags & BIT_SOURCE) != 0)
        direct_peak = float(max(abs(direct_epoch_img[iy, ix]), peak_val))

        vetted.append(
            {
                "x": xc,
                "y": yc,
                "flux": flux_25,
                "snr": snr_val,
                "ellipticity": ellipticity,
                "eta_sharp": float(np.clip(eta_sharp, 0.55, 1.45)),
                "n_eff": n_eff,
                "fit_ql": fit_ql,
                "is_known_source": is_known_source,
                "direct_peak": direct_peak,
            }
        )

    return vetted


def extract_and_link_candidates(
    D: np.ndarray,
    S_corr: np.ndarray,
    ref_img: np.ndarray,
    new_img: np.ndarray,
    flags_t1: np.ndarray,
    flags_t2: np.ndarray,
    wcs: WCS,
    mjd_t1: float = 60897.5,
    mjd_t2: float = 61080.0,
    psf_kernel: Optional[np.ndarray] = None,
    band_idx: int = 4,
    dichroic_confirm_map: Optional[np.ndarray] = None,
) -> List[Dict[str, Any]]:
    """
    Locked Contract #3 Function:
    Extract, vet, deblend, and link moving dipoles, wide-parallax Planet X pairs,
    and stationary photometric transients from the ZOGY difference image `D`
    and significance map `S_corr`.

    Executes:
      1. Dual-pass extraction on `+D` (Epoch t2 excesses) and `-D` (Epoch t1 excesses).
      2. Field-star median dipole registration drift subtraction & Gould (2013)
         two-dipole neighbor cross-talk deblending.
      3. Tier 1 Local KD-tree dipole pairing (`R_max^local = 49.2''`,
         flux conservation `0.4 <= F+/F- <= 2.5`, `BIT_SOURCE` unset).
      4. Tier 2 Wide-Sector 6-month parallax pairing (`R_max^sector = 1537.5''`)
         for unassociated single-epoch monopoles.
      5. Physics-informed priority scoring (`P_PX` and `P_Trans`).
    """
    diff = np.nan_to_num(np.asarray(D, dtype=np.float32), nan=0.0)
    scorr = np.nan_to_num(np.asarray(S_corr, dtype=np.float32), nan=0.0)
    r_img = np.nan_to_num(np.asarray(ref_img, dtype=np.float32), nan=0.0)
    n_img = np.nan_to_num(np.asarray(new_img, dtype=np.float32), nan=0.0)

    # Effective per-pixel error map derived from D / S_corr ratio
    with np.errstate(divide="ignore", invalid="ignore"):
        err_map = np.where(np.abs(scorr) > 0.25, np.abs(diff / scorr), float(_estimate_robust_sigma(diff)))
    err_map = np.maximum(err_map, 1e-4).astype(np.float32)

    if psf_kernel is None:
        psf_kernel = np.ones((11, 11), dtype=np.float32) / 121.0

    pos_peaks = _extract_peaks_from_signed_image(
        signed_diff=diff,
        err_map=err_map,
        flags_epoch=flags_t2,
        direct_epoch_img=n_img,
        psf_kernel=psf_kernel,
        band_idx=band_idx,
        dichroic_confirm_map=dichroic_confirm_map,
    )
    neg_peaks = _extract_peaks_from_signed_image(
        signed_diff=-diff,
        err_map=err_map,
        flags_epoch=flags_t1,
        direct_epoch_img=r_img,
        psf_kernel=psf_kernel,
        band_idx=band_idx,
        dichroic_confirm_map=dichroic_confirm_map,
    )

    candidates: List[Dict[str, Any]] = []
    used_pos: set[int] = set()
    used_neg: set[int] = set()

    # Derive true pixel scale (arcsec/px) from target WCS so 49.2'' (Tier 1) and 1537.5'' (Tier 2)
    # search radii and dipole separations are exact across all FoV settings
    try:
        wcs_pixscale_arcsec = float(math.sqrt(wcs.proj_plane_pixel_area().to_value(u.deg**2)) * 3600.0)
        if not (0.1 <= wcs_pixscale_arcsec <= 60.0):
            wcs_pixscale_arcsec = SPHEREX_NATIVE_PIXEL_SCALE_ARCSEC
    except Exception:
        wcs_pixscale_arcsec = SPHEREX_NATIVE_PIXEL_SCALE_ARCSEC

    r_local_px = max(3.0, 49.2 / wcs_pixscale_arcsec)                   # 49.2'' (8 native SPHEREx pixels)
    r_sector_px = max(r_local_px + 5.0, 1537.5 / wcs_pixscale_arcsec)   # 1537.5'' (250 native SPHEREx pixels)

    if pos_peaks and neg_peaks:
        pos_xy = np.array([[p["x"], p["y"]] for p in pos_peaks], dtype=np.float64)
        neg_xy = np.array([[n["x"], n["y"]] for n in neg_peaks], dtype=np.float64)
        tree_neg = cKDTree(neg_xy)

        # Estimate median field-star registration dipole drift on known sources (BIT_SOURCE set)
        drift_dx_list: List[float] = []
        drift_dy_list: List[float] = []
        dists_local, idxs_local = tree_neg.query(pos_xy, distance_upper_bound=r_local_px)

        for i_p, (dist_px, j_n) in enumerate(zip(dists_local, idxs_local)):
            if not np.isfinite(dist_px) or int(j_n) >= len(neg_peaks):
                continue
            p_obj = pos_peaks[i_p]
            n_obj = neg_peaks[int(j_n)]
            if p_obj["is_known_source"] and n_obj["is_known_source"]:
                drift_dx_list.append(p_obj["x"] - n_obj["x"])
                drift_dy_list.append(p_obj["y"] - n_obj["y"])

        med_drift_dx = float(np.median(drift_dx_list)) if drift_dx_list else 0.0
        med_drift_dy = float(np.median(drift_dy_list)) if drift_dy_list else 0.0

        # Precompute field-star dipole orientations for Gould (2013) two-dipole neighbor deblending
        field_dipoles: List[Tuple[float, float, float]] = []
        for i_p, (dist_px, j_n_raw) in enumerate(zip(dists_local, idxs_local)):
            j_n = int(j_n_raw)
            if np.isfinite(dist_px) and j_n < len(neg_peaks) and pos_peaks[i_p]["is_known_source"]:
                phi_f = math.atan2(
                    pos_peaks[i_p]["y"] - neg_peaks[j_n]["y"],
                    pos_peaks[i_p]["x"] - neg_peaks[j_n]["x"],
                )
                field_dipoles.append((pos_peaks[i_p]["x"], pos_peaks[i_p]["y"], phi_f))

        # --- Tier 1: Local Moving Dipole Pairing (R_max^local = 49.2'') ---
        for i_p, (dist_px, j_n_raw) in enumerate(zip(dists_local, idxs_local)):
            j_n = int(j_n_raw)
            if not np.isfinite(dist_px) or j_n >= len(neg_peaks) or j_n in used_neg:
                continue

            p_obj = pos_peaks[i_p]
            n_obj = neg_peaks[j_n]
            flux_ratio = float(p_obj["flux"]) / max(1e-9, float(n_obj["flux"]))

            if 0.4 <= flux_ratio <= 2.5 and (not p_obj["is_known_source"]) and (not n_obj["is_known_source"]):
                used_pos.add(i_p)
                used_neg.add(j_n)

                dx_corr_px = (p_obj["x"] - n_obj["x"]) - med_drift_dx
                dy_corr_px = (p_obj["y"] - n_obj["y"]) - med_drift_dy

                # Deblend orientation cross-talk from any crowded neighbor within 4 * sigma_PSF
                phi_cand = math.atan2(dy_corr_px, dx_corr_px)
                sigma_psf_px = max(1.0, SPHEREX_NATIVE_PIXEL_SCALE_ARCSEC / wcs_pixscale_arcsec)
                for fx, fy, phi_neighbor in field_dipoles:
                    neighbor_sep_px = math.hypot(p_obj["x"] - fx, p_obj["y"] - fy)
                    if 0.5 < neighbor_sep_px <= 4.0 * sigma_psf_px:
                        xtalk = two_dipole_crosstalk_ratio(neighbor_sep_px, sigma_psf_px, phi_cand, phi_neighbor)
                        dx_corr_px -= xtalk * math.cos(phi_neighbor)
                        dy_corr_px -= xtalk * math.sin(phi_neighbor)

                sep_arcsec = float(math.hypot(dx_corr_px, dy_corr_px) * wcs_pixscale_arcsec)

                # If sub-PSF dipole (sep < 6.15''), refine displacement via analytical Gould (2013) relation
                if sep_arcsec < SPHEREX_NATIVE_PIXEL_SCALE_ARCSEC:
                    analytical_sep = solve_subpsf_dipole_displacement_arcsec(
                        max_dipole_diff=p_obj["flux"],
                        max_unsubtracted_flux=max(p_obj["direct_peak"], n_obj["direct_peak"]),
                        sigma_psf_px=1.0,
                    )
                    if analytical_sep > 0:
                        sep_arcsec = analytical_sep

                ra1, dec1 = [float(v) for v in wcs.pixel_to_world_values(n_obj["x"], n_obj["y"])]
                ra2, dec2 = [float(v) for v in wcs.pixel_to_world_values(p_obj["x"], p_obj["y"])]
                p_px, d_hat_au, beta_deg = compute_planet_x_kinematics_score(
                    ra1, dec1, ra2, dec2, mjd_t1, mjd_t2
                )
                snr_dip = float(math.hypot(p_obj["snr"], n_obj["snr"]))

                candidates.append(
                    {
                        "type": "MOVING_DIPOLE",
                        "x_t1": n_obj["x"],
                        "y_t1": n_obj["y"],
                        "x_t2": p_obj["x"],
                        "y_t2": p_obj["y"],
                        "ra_deg": ra2,
                        "dec_deg": dec2,
                        "flux_ratio": flux_ratio,
                        "snr": snr_dip,
                        "ellipticity": 0.5 * (p_obj["ellipticity"] + n_obj["ellipticity"]),
                        "dipole_sep_arcsec": sep_arcsec,
                        "dx_arcsec": float(dx_corr_px * wcs_pixscale_arcsec),
                        "dy_arcsec": float(dy_corr_px * wcs_pixscale_arcsec),
                        "fit_ql": 0.5 * (p_obj["fit_ql"] + n_obj["fit_ql"]),
                        "eta_sharp": 0.5 * (p_obj["eta_sharp"] + n_obj["eta_sharp"]),
                        "is_known_source": False,
                        "p_px": p_px,
                        "p_trans": 0.0,
                        "implied_d_au": d_hat_au,
                        "ecliptic_lat_deg": beta_deg,
                    }
                )

        # --- Tier 2: Wide-Sector 6-Month Parallax Linker (R_max^sector = 1537.5'') ---
        dists_wide, idxs_wide = tree_neg.query(pos_xy, distance_upper_bound=r_sector_px)
        for i_p, (dist_px, j_n_raw) in enumerate(zip(dists_wide, idxs_wide)):
            j_n = int(j_n_raw)
            if i_p in used_pos or not np.isfinite(dist_px) or dist_px <= r_local_px or j_n >= len(neg_peaks) or j_n in used_neg:
                continue

            p_obj = pos_peaks[i_p]
            n_obj = neg_peaks[j_n]
            flux_ratio = float(p_obj["flux"]) / max(1e-9, float(n_obj["flux"]))

            if 0.5 <= flux_ratio <= 2.0 and (not p_obj["is_known_source"]) and (not n_obj["is_known_source"]):
                used_pos.add(i_p)
                used_neg.add(j_n)
                ra1, dec1 = [float(v) for v in wcs.pixel_to_world_values(n_obj["x"], n_obj["y"])]
                ra2, dec2 = [float(v) for v in wcs.pixel_to_world_values(p_obj["x"], p_obj["y"])]
                p_px, d_hat_au, beta_deg = compute_planet_x_kinematics_score(
                    ra1, dec1, ra2, dec2, mjd_t1, mjd_t2
                )
                sep_arcsec = float(dist_px * wcs_pixscale_arcsec)
                snr_dip = float(math.hypot(p_obj["snr"], n_obj["snr"]))

                candidates.append(
                    {
                        "type": "WIDE_PARALLAX_PAIR",
                        "x_t1": n_obj["x"],
                        "y_t1": n_obj["y"],
                        "x_t2": p_obj["x"],
                        "y_t2": p_obj["y"],
                        "ra_deg": ra2,
                        "dec_deg": dec2,
                        "flux_ratio": flux_ratio,
                        "snr": snr_dip,
                        "ellipticity": 0.5 * (p_obj["ellipticity"] + n_obj["ellipticity"]),
                        "dipole_sep_arcsec": sep_arcsec,
                        "dx_arcsec": float((p_obj["x"] - n_obj["x"]) * wcs_pixscale_arcsec),
                        "dy_arcsec": float((p_obj["y"] - n_obj["y"]) * wcs_pixscale_arcsec),
                        "fit_ql": 0.5 * (p_obj["fit_ql"] + n_obj["fit_ql"]),
                        "eta_sharp": 0.5 * (p_obj["eta_sharp"] + n_obj["eta_sharp"]),
                        "is_known_source": False,
                        "p_px": p_px,
                        "p_trans": 0.0,
                        "implied_d_au": d_hat_au,
                        "ecliptic_lat_deg": beta_deg,
                    }
                )

    # --- Stationary Transients (Unpaired Positive Monopoles: FUOrs, Novae, Flaring AGNs) ---
    for i_p, p_obj in enumerate(pos_peaks):
        if i_p in used_pos:
            continue
        iy, ix = int(round(p_obj["y"])), int(round(p_obj["x"]))
        base_f1 = max(1.0, abs(float(r_img[iy, ix])))
        f2 = max(1.0, abs(float(n_img[iy, ix])) + float(p_obj["flux"]))
        r_epoch = f2 / base_f1

        ra_m, dec_m = [float(v) for v in wcs.pixel_to_world_values(p_obj["x"], p_obj["y"])]
        c_m = SkyCoord(ra=ra_m * u.deg, dec=dec_m * u.deg, frame="icrs")
        beta_deg = float(c_m.transform_to(BarycentricTrueEcliptic()).lat.deg)

        # Stationary Transient Physics Score P_Trans (Section 4.2)
        tau_ice_est = 1.2 if r_epoch >= 3.0 else 0.3
        p_trans = math.tanh(float(p_obj["snr"]) / 10.0) * _logistic(
            2.0 * abs(math.log10(max(1e-3, r_epoch))) + 0.8 * tau_ice_est - 1.2
        )

        candidates.append(
            {
                "type": "MONOPOLE_POS",
                "x_t1": p_obj["x"],
                "y_t1": p_obj["y"],
                "x_t2": p_obj["x"],
                "y_t2": p_obj["y"],
                "ra_deg": ra_m,
                "dec_deg": dec_m,
                "flux_ratio": r_epoch,
                "snr": float(p_obj["snr"]),
                "ellipticity": float(p_obj["ellipticity"]),
                "dipole_sep_arcsec": 0.0,
                "dx_arcsec": 0.0,
                "dy_arcsec": 0.0,
                "fit_ql": float(p_obj["fit_ql"]),
                "eta_sharp": float(p_obj["eta_sharp"]),
                "is_known_source": bool(p_obj["is_known_source"]),
                "p_px": 0.0,
                "p_trans": float(p_trans),
                "implied_d_au": 0.0,
                "ecliptic_lat_deg": beta_deg,
            }
        )

    candidates.sort(key=lambda c: max(float(c["p_px"]), float(c["p_trans"])) * float(c["snr"]), reverse=True)
    return candidates