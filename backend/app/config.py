# ==============================================================================
# Author:     M.D.Isuru Lakmal Peiris (@ilpeiris) 
# Project:    SPHEREx x Planet X (2026 NASA International Space Apps Challenge)
# Repository: https://github.com/ilpeiris/SPHEREx-planetX-discovery-engine
# LinkedIn:   https://www.linkedin.com/in/ilpeiris
# Github:     https://github.com/ilpeiris/
# License:    MIT License | Copyright (c) 2026 M.D.Isuru Lakmal Peiris
# ==============================================================================



# backend/app/config.py
"""
Master Configuration, Upstream Archive Endpoints, Detector Constants, and
64-bit / 16-bit SPHEREx Bitmask Algebra for the 2026 NASA Space Apps
'Planet X and SPHEREx' Discovery Engine.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Tuple

from pydantic_settings import BaseSettings, SettingsConfigDict


# ============================================================================
# 1. 64-BIT SPHEREx LEVEL-2 & LEVEL-3 FLAGS BITMASK DEFINITIONS
# ============================================================================
# Reference: SPHEREx Explanatory Supplement & Caltech/IPAC IRSA Tutorials
BIT_TRANSIENT: int = 1 << 0          # 1: Onboard Sample-Up-the-Ramp (SUR) CR/transient jump
BIT_OVERFLOW: int = 1 << 1           # 2: SUR overflow (benign unless BIT_SUR_ERROR is also set)
BIT_SUR_ERROR: int = 1 << 2          # 4: Unrecoverable onboard SUR ramp slope-fit failure
BIT_PHANTOM: int = 1 << 4            # 16: Electronic phantom pixel artifact
BIT_REFERENCE: int = 1 << 5          # 32: Non-illuminated perimeter reference pixel
BIT_NONFUNC: int = 1 << 6            # 64: Permanently dead / non-functional detector pixel
BIT_DICHROIC: int = 1 << 7           # 128: >50% optical attenuation at dichroic beam-splitter edge (D3, D4)
BIT_MISSING_DATA: int = 1 << 9       # 512: Missing onboard pixel telemetry
BIT_HOT: int = 1 << 10               # 1024: Elevated dark current / hot pixel
BIT_COLD: int = 1 << 11              # 2048: Unresponsive / cold pixel
BIT_FULLSAMPLE: int = 1 << 12        # 4096: Full ramp sample history downlinked (BENIGN diagnostic flag)
BIT_PHANMISS: int = 1 << 14          # 16384: Uncorrectable phantom reference pixel
BIT_NONLINEAR: int = 1 << 15         # 32768: Severe nonlinearity beyond polynomial correction
BIT_PERSIST: int = 1 << 17           # 131072: Persistent latent charge trap from prior bright star
BIT_OUTLIER: int = 1 << 19           # 524288: L2b median-filter sigma-clipped temporal outlier
BIT_CROSSTALK: int = 1 << 20         # 1048576: H2RG electrical channel coupling (Type 1/2 SWIR, Type 3 MWIR)
BIT_SOURCE: int = 1 << 21            # 2097152: Known reference catalog star/galaxy (BENIGN - NEVER mask out!)
BIT_GHOST: int = 1 << 22             # 4194304: Optical ghost
BIT_GHOST_FPA: int = 1 << 23         # 8388608: Focal plane assembly ghost
BIT_GHOST_EXT: int = 1 << 24         # 16777216: Extended ghost
BIT_STREAK: int = 1 << 25            # 33554432: LEO satellite or meteor trail
BIT_BLOOM: int = 1 << 26             # 67108864: Forward-biased H2RG LED diode glow & saturation blooming
BIT_SNOWBALL: int = 1 << 27          # 134217728: Energetic cosmic-ray snowball halo
BIT_HALO: int = 1 << 28              # 268435456: Extended bright-star diffraction / stray-light halo
BIT_SATELLITE_HALO: int = 1 << 29    # 536870912: Extended satellite trail halo
BIT_CONTAINS_BAD_PIX: int = 1 << 32  # 4294967296: L3 Tractor catalog CONTAINS_BAD_PIXEL
BIT_FIT_ERROR: int = 1 << 33         # 8589934592: L3 Tractor model FIT_ERROR

# Composite fatal hardware & cosmic-ray mask covering Bits:
# 0, 1, 2, 6, 7, 9, 10, 11, 14, 15, 17, 20, 22, 23, 24, 25, 26, 27, 28, 29
FATAL_CORE_MASK: int = 0x3FDADDF7  # Decimal: 1,071,308,279

# Benign bits that represent valid illuminated sky/source pixels:
# 0 (unflagged background), BIT_SOURCE (2097152), BIT_FULLSAMPLE (4096),
# and BIT_OVERFLOW (2) when NOT accompanied by BIT_SUR_ERROR (4).
BENIGN_SCIENCE_BITS: int = BIT_SOURCE | BIT_FULLSAMPLE | BIT_OVERFLOW

# Mask used when estimating 2D background meshes (masks both bad pixels AND known stars)
BACKGROUND_EXCLUSION_MASK: int = FATAL_CORE_MASK | BIT_SOURCE | BIT_OUTLIER | BIT_PHANTOM | BIT_REFERENCE

# Condensed 16-bit unsigned integer (Uint16) bitmask flags packed into the binary cube
# for zero-copy upload into the browser WebGL2 `usampler2DArray u_flagCube` (gl.R16UI)
WEBGL_FLAG_NONFUNC: int = 1 << 0     # Bit 0 (1): Dead / hot / cold / reference / missing pixel
WEBGL_FLAG_DICHROIC: int = 1 << 1    # Bit 1 (2): Dichroic beam-splitter edge attenuation (>50%)
WEBGL_FLAG_PERSIST: int = 1 << 2     # Bit 2 (4): Persistence charge trap from prior exposure
WEBGL_FLAG_TRANSIENT: int = 1 << 3   # Bit 3 (8): Cosmic ray / SUR transient / snowball
WEBGL_FLAG_SUR_ERROR: int = 1 << 4   # Bit 4 (16): Unrecoverable SUR ramp error / nonlinearity / bloom
WEBGL_FLAG_GHOST_STREAK: int = 1 << 5 # Bit 5 (32): Optical ghost, crosstalk, or satellite streak
WEBGL_FLAG_SOURCE: int = 1 << 6      # Bit 6 (64): Known reference catalog source (MP_SOURCE)


# ============================================================================
# 2. SPHEREx FOCAL PLANE & DETECTOR CONSTANTS (BANDS D1 - D6, 102 CHANNELS)
# ============================================================================
@dataclass(frozen=True)
class DetectorSpec:
    band_id: int
    name: str
    fpa_regime: str                  # "SWIR" (80 K) or "MWIR" (55 K)
    wavelength_min_um: float
    wavelength_max_um: float
    resolving_power: int             # Archive nominal R = lambda / Delta_lambda
    dichroic_partner: int            # Simultaneous FOV detector across the 2.42 um beam splitter
    global_channel_start: int        # 1-based global channel start (1..102)
    global_channel_end: int          # 1-based global channel end (1..102)
    qr3_epsf_grid: Tuple[int, int]   # Spatial ePSF zone grid in QR3 (v >= 7.0)
    min_neff_sharpness: float        # Minimum effective noise pixels n_eff for artifact vetting
    max_type2_crosstalk: float       # Max channel-to-channel Type 2 coupling coefficient


SPHEREX_DETECTORS: Dict[int, DetectorSpec] = {
    1: DetectorSpec(1, "SPHEREx-D1", "SWIR", 0.75, 1.09, 39, 4, 1, 17, (21, 21), 1.15, 0.006194),
    2: DetectorSpec(2, "SPHEREx-D2", "SWIR", 1.10, 1.62, 41, 5, 18, 34, (21, 21), 1.15, 0.002651),
    3: DetectorSpec(3, "SPHEREx-D3", "SWIR", 1.63, 2.41, 41, 6, 35, 51, (11, 41), 1.15, 0.002027),
    4: DetectorSpec(4, "SPHEREx-D4", "MWIR", 2.42, 3.82, 35, 1, 52, 68, (21, 21), 1.40, 0.000424),
    5: DetectorSpec(5, "SPHEREx-D5", "MWIR", 3.83, 4.41, 112, 2, 69, 85, (21, 21), 1.40, 0.000500),
    6: DetectorSpec(6, "SPHEREx-D6", "MWIR", 4.42, 5.00, 128, 3, 86, 102, (21, 21), 1.40, 0.000550),
}

SPHEREX_NATIVE_PIXEL_SCALE_ARCSEC: float = 6.15
SPHEREX_DETECTOR_SIZE_PX: int = 2040
SSDC_R7_MWIR_WAVELENGTH_OFFSET_UM: float = 0.0064  # +6.4 nm SSDC R7 calibration shift in Bands 5-6

# Unit conversion constant: (10^12 uJy/MJy) / (4.2545170296e10 arcsec^2/sr)
MJY_SR_TO_UJY_ARCSEC2: float = 1e12 / 4.2545170296e10  # ~23.504430539

# WISE / unWISE Vega nanomaggy to physical flux density conversion constants
F0_W1_JY: float = 309.540
F0_W2_JY: float = 171.787
NMGY_TO_UJY_W1: float = 0.309540
NMGY_TO_UJY_W2: float = 0.171787
UNWISE_NATIVE_PIXEL_SCALE_ARCSEC: float = 2.75

# Binary Cutout Cube Wire Format Constants (Micro-Safeguard #1: 6 slices)
BINARY_CUBE_HEADER_BYTES: int = 16
BINARY_CUBE_NUM_SLICES: int = 6
SLICE_EPOCH1_FLUX: int = 0
SLICE_EPOCH2_FLUX: int = 1
SLICE_BRIDGE_OR_D4D2_FLUX: int = 2
SLICE_ZOGY_DIFF: int = 3
SLICE_ZOGY_SCORR: int = 4
SLICE_ZODI_MODEL: int = 5


# ============================================================================
# 3. APPLICATION SETTINGS & UPSTREAM ARCHIVE ENDPOINTS
# ============================================================================
class Settings(BaseSettings):
    """
    Centralized environment configuration adhering strictly to Section 8.2 Contract #3.
    """
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Cloudflare R2 Zero-Egress Data Lake ---
    R2_ACCOUNT_ID: str = os.getenv("R2_ACCOUNT_ID", "0123456789abcdef0123456789abcdef")
    R2_ACCESS_KEY_ID: str = os.getenv("R2_ACCESS_KEY_ID", "")
    R2_SECRET_ACCESS_KEY: str = os.getenv("R2_SECRET_ACCESS_KEY", "")
    R2_BUCKET: str = os.getenv("R2_BUCKET", "spherex-sky-lake")
    R2_PUBLIC_CDN_URL: str = os.getenv("R2_PUBLIC_CDN_URL", "https://pub-spherex.r2.dev")

    # --- Caltech / IPAC NASA IRSA SPHEREx Endpoints ---
    IRSA_TAP_URL: str = "https://irsa.ipac.caltech.edu/TAP"
    IRSA_SIA_URL: str = "https://irsa.ipac.caltech.edu/SIA"
    IRSA_IBE_BASE: str = "https://irsa.ipac.caltech.edu/ibe/data/spherex"
    IRSA_MOST_URL: str = "https://irsa.ipac.caltech.edu/cgi-bin/MOST/nph-most"
    IRSA_3I_ATLAS_VOT_URL: str = (
        "https://irsa.ipac.caltech.edu/data/SPHEREx/docs/comet3iatlas/obscore_3I_Atlas.vot"
    )

    # --- AWS Open Data SPHEREx Mirror (s3://nasa-irsa-spherex) ---
    S3_BUCKET_NAME: str = "nasa-irsa-spherex"
    S3_SAPM_BASE: str = (
        "s3://nasa-irsa-spherex/qr2/solid_angle_pixel_map/cal-sapm-v2-2025-164"
    )
    HTTPS_SAPM_BASE: str = (
        "https://nasa-irsa-spherex.s3.us-east-1.amazonaws.com/qr2/"
        "solid_angle_pixel_map/cal-sapm-v2-2025-164"
    )
    SAPM_COLLECTION_TAG: str = "cal-sapm-v2-2025-164"

    # --- Canadian Space Agency (CSA) & CADC NEOSSat Partner Endpoints ---
    CADC_TAP_SYNC_URL: str = "https://ws.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/argus/sync"
    CADC_SODA_SYNC_URL: str = "https://ws.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/caom2ops/sync"
    CADC_DATALINK_URL: str = "https://ws.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/caom2ops/datalink"
    CADC_DIRECT_DATA_BASE: str = "https://ws.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/data/pub/NEOSSAT"
    CSA_ASTRO_HTTPS_BASE: str = (
        "https://data.asc-csa.gc.ca/users/OpenData_DonneesOuvertes/pub/NEOSSAT/ASTRO"
    )
    CSA_CKAN_PACKAGE_URL: str = (
        "https://donnees-data.asc-csa.gc.ca/api/action/package_show"
        "?id=62d8033b-87b6-4322-8d5f-e26bebf934c1"
    )

    # --- STScI MAST & ESA Gaia DR3 4-Tier Failover Endpoints ---
    MAST_VO_TAP_SYNC: str = "https://mast.stsci.edu/vo-tap/api/v0.1/mast_catalogs/sync"
    MAST_VO_CONESEARCH: str = "https://mast.stsci.edu/vo-conesearch/api/v0.1/gaiadr3"
    ESA_GAIA_TAP_SYNC: str = "https://gea.esac.esa.int/tap-server/tap/sync"
    MAST_AWS_HATS_URI: str = "s3://stpubdata/gaia/gaia_dr3/public/hats"

    # --- 5-Stage Known-Object Cross-Matching Cascade Endpoints ---
    SIMBAD_TAP_SYNC_URL: str = "https://simbad.cds.unistra.fr/simbad/sim-tap/sync"
    SKYBOT_CONESEARCH_URL: str = (
        "https://ssp.imcce.fr/webservices/skybot/skybotconesearch_query.php"
    )
    JPL_SB_IDENT_URL: str = "https://ssd-api.jpl.nasa.gov/sb_ident.api"
    MPC_CND_API_URL: str = "https://data.minorplanetcenter.net/api/cnd"
    MPC_GET_ORB_API_URL: str = "https://data.minorplanetcenter.net/api/get-orb"
    MPC_ORBIT_TYPE_API_URL: str = "https://data.minorplanetcenter.net/api/orbit-type"

    # --- unWISE / WiseView Archival Cutout Endpoint ---
    UNWISE_CUTOUT_BASE_URL: str = "https://www.legacysurvey.org/viewer/fits-cutout"

# --- Local Cache & Compute Pool Settings ---
    CACHE_DIR: Path = Path(
        os.getenv(
            "SPHEREX_CACHE_DIR",
            str(Path(__file__).resolve().parent.parent / "cache" / "r2_staging" / "cubes"),
        )
    )
    SAPM_CACHE_DIR: Path = Path(
        os.getenv(
            "SPHEREX_SAPM_CACHE_DIR",
            str(Path(__file__).resolve().parent.parent / "cache" / "sapm"),
        )
    )
    DUCKDB_MEMORY_LIMIT: str = "3GB"
    DUCKDB_THREADS: int = 2
    AIOHTTP_MAX_CONNECTIONS: int = 64
    HTTP_TIMEOUT_SECONDS: int = 120
    PROCESS_POOL_WORKERS: int = 2

    # --- Bitmask Constant ---
    FATAL_CORE_MASK: int = FATAL_CORE_MASK


settings = Settings()
settings.CACHE_DIR.mkdir(parents=True, exist_ok=True)
settings.SAPM_CACHE_DIR.mkdir(parents=True, exist_ok=True)


def get_detector_for_channel(global_channel: int) -> DetectorSpec:
    """
    Map a 1-based global SPHEREx channel index (1..102) to its DetectorSpec (D1..D6).
    Each detector spans 17 spectral sub-channels: c_local = c_global - 17 * (b - 1).
    """
    clamped = max(1, min(102, int(global_channel)))
    band_id = ((clamped - 1) // 17) + 1
    return SPHEREX_DETECTORS[band_id]


def condense_flags_to_uint16(flags_int32: "np.ndarray") -> "np.ndarray":
    """
    Condense a 32-bit SPHEREx FLAGS array into the 16-bit unsigned integer (Uint16)
    bitmask texture format expected by `usampler2DArray u_flagCube` (gl.R16UI).
    """
    import numpy as np

    f = np.asarray(flags_int32, dtype=np.int64)
    out = np.zeros(f.shape, dtype=np.uint16)

    nonfunc_bits = BIT_NONFUNC | BIT_HOT | BIT_COLD | BIT_REFERENCE | BIT_MISSING_DATA | BIT_PHANMISS | BIT_PHANTOM
    transient_bits = BIT_TRANSIENT | BIT_SNOWBALL | BIT_OUTLIER
    sur_err_bits = BIT_SUR_ERROR | BIT_NONLINEAR | BIT_BLOOM
    ghost_streak_bits = (
        BIT_GHOST | BIT_GHOST_FPA | BIT_GHOST_EXT | BIT_STREAK | BIT_CROSSTALK | BIT_HALO | BIT_SATELLITE_HALO
    )

    out |= np.where((f & nonfunc_bits) != 0, WEBGL_FLAG_NONFUNC, 0).astype(np.uint16)
    out |= np.where((f & BIT_DICHROIC) != 0, WEBGL_FLAG_DICHROIC, 0).astype(np.uint16)
    out |= np.where((f & BIT_PERSIST) != 0, WEBGL_FLAG_PERSIST, 0).astype(np.uint16)
    out |= np.where((f & transient_bits) != 0, WEBGL_FLAG_TRANSIENT, 0).astype(np.uint16)
    out |= np.where((f & sur_err_bits) != 0, WEBGL_FLAG_SUR_ERROR, 0).astype(np.uint16)
    out |= np.where((f & ghost_streak_bits) != 0, WEBGL_FLAG_GHOST_STREAK, 0).astype(np.uint16)
    out |= np.where((f & BIT_SOURCE) != 0, WEBGL_FLAG_SOURCE, 0).astype(np.uint16)

    return out