# SPHEREx × Planet X — 102-Band Infrared Time-Domain Discovery Engine

**2026 NASA International Space Apps Challenge — Challenge: "Planet X and SPHEREx"**
**Difficulty:** Advanced | **Subjects:** Astrophysics, Planets & Moons, Software

**Author:** M.D.Isuru Lakmal Peiris ([@ilpeiris](https://github.com/ilpeiris)) — Colombo, Sri Lanka
**GitHub:** [github.com/ilpeiris](https://github.com/ilpeiris) | **LinkedIn:** [linkedin.com/in/ilpeiris](https://www.linkedin.com/in/ilpeiris)
**Repository:** [github.com/ilpeiris/SPHEREx-planetX-discovery-engine](https://github.com/ilpeiris/SPHEREx-planetX-discovery-engine)

---

## 1. Mission Overview

Since May 2025, NASA's **SPHEREx** (Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer) space telescope has mapped the entire sky every six months across **102 contiguous near-to-mid-infrared wavelength channels ($0.75\text{–}5.00\ \mu\text{m}$)**, capturing over one billion astronomical objects. Moving solar system bodies (asteroids, comets, trans-Neptunian objects, and hypothesized **Planet X**), high-proper-motion brown dwarfs, and photometric transients reveal themselves by shifting position or brightness across epochs—but no scientist or single catalog pipeline can inspect a billion 102-band objects alone.

**SPHEREx × Planet X** is a public-facing, 60-FPS WebGL2 and WebAssembly discovery platform that evolves the citizen-science *WiseView* blink comparator from 2 broadband channels into a **4D spectrophotometric hypercube engine ($\text{RA} \times \text{Dec} \times 102\ \text{bands} \times N\ \text{epochs}$)** paired with **Canadian Space Agency (CSA) NEOSSat** optical asteroid tracking and **STScI MAST / ESA Gaia DR3** astrometry.

---

## 2. Complete Compliance with Official NASA Challenge Specifications

| NASA Challenge Requirement / Consideration | Implementation in This Repository |
|---|---|
| **5 Mandatory NASA Test Targets** | Pre-loaded in `TopMissionToolbar.tsx` and `goldenCatalog.ts` with both catalog (`J2000` / `WISE 2010.34`) and propagated (`SPHEREx 2025.8`) coordinates: **Barnard's Star**, **WISE 0855-0714** (`08h55m10.831s, -7d14m42.53s`), **Epsilon Indi Ba/Bb**, **RW Aurigae**, and **R Draconis**. |
| **Easy Updates with Latest SPHEREx Releases** | Zero-delay ADQL TAP discovery (`irsa_client.py` querying `spherex.artifact` & `spherex.plane`) + automatic `VERSION` branching (`calibration.py`) between QR1/QR2 3D `PSF` cubes ($v < 7.0$) and QR3 empirical `EPSF` binary tables ($v \ge 7.0$). |
| **6-Detector Array Co-Addition (SNR Boost)** | One-click `6-Det SNR Co-Add` toggle (`wcs_reproject.py`) stacks all 17 Linear Variable Filter (LVF) sub-channels per detector array (`D1`–`D6`) using inverse-variance weights $W_{xy} = \text{VARIANCE}_{xy}^{-1}(1 - M_{\text{bad},xy})$ for a $\sim 4.1\times$ signal-to-noise boost. |
| **On-the-Fly 102-Band Spectra ("Extra Kudos")** | Dual-regime extraction (`spectrophotometry.py` & `SpectralCurveInspector.tsx`): Regime A executes QR3 ePSF forced photometry ($r = 2.5\ \text{px}$, `fit_ql < 3.0`) for point sources; Regime B executes the Lisse et al. (2025/2026) 2-pixel core + $3\sigma$-clipped modal azimuthal annulus profiler ($Q_{\text{gas}}$ in $\text{molecules/s}$) for extended cometary comae (**3I/ATLAS**). |
| **Epoch Addition & Image Subtraction** | 4 GPU shader inspection modes (`spherex_blink_zogy.frag.glsl`): **Mode 0** (60-FPS Blink Comparator), **Mode 1** (Lupton Color-Preserving Temporal Dipole RGB), **Mode 2** (102-Band Spectral False-Color RGB), and **Mode 3** (Zackay-Ofek-Gal-Yam [ZOGY] Proper Subtraction Split-Curtain & $S_{\text{corr}}$ Sigma Heatmap), plus $D4 - D2$ cold object color subtraction. |
| **User-Selectable Field of View (FoV)** | Interactive FoV selector (`2'×2' Fast`, `6'×6' Standard`, `15'×15' Wide Mover`, `30'×30' Sector Parallax`) with live transfer-time indicators and automatic `6'×6'` framing for fast movers (`Barnard's Star` $158.5''$ shift, `WISE 0855` $126.4''$ shift). |
| **Multi-Mission Overlays (WISE, Gaia, NEOSSat, Optical)** | 16-year archival `unWISE` (2010–2024) + SPHEREx (2025–2026) radiometric time bridge (`bridge_unwise_to_spherex`), synchronized **Aladin Lite v3** (`AllWISE`, `CDS/P/SPHEREx/QR2/D1` HiPS, `Pan-STARRS DR1` optical disambiguation), 4-tier **STScI MAST + ESA Gaia DR3** proper-motion vectors, and **CSA NEOSSat** (`CADC` CAOM-2 TAP + SODA cutouts + Joint NEATM asteroid solver). |
| **URL Coordinate Querying & Website Embedding** | Bidirectional URL state router (`page.tsx`: `?ra=&dec=&fov=&mode=&band=&target=&embed=true`) with one-click deep-link URL and `<iframe />` snippet copying. |
| **Metadata & Contamination Flags (`FLAGS` & `ZODI`)** | Hardware `gl.R16UI` bitmask texture (`u_flagCube`) hatches `DICHROIC`, `NONFUNC`, `PERSIST` (catching the NEP spurious variable `WISE J183309.77+675144.8`), `TRANSIENT`, and `SUR_ERROR` while preserving `MP_SOURCE` (Bit 21 = `2097152`), paired with a live 60-FPS Slice 5 `ZODI` foreground subtraction toggle. |

---

## 3. System Architecture & 6-Slice Binary Wire Protocol

### 3.1 Four-Tier Zero-Cost ($0.00/Month) Topology

1. **Tier 1 — Frontend & Browser GPU (`frontend/` on Vercel):** Next.js 14 App Router, **Aladin Lite v3** (Rust WebAssembly HiPS engine), custom `#version 300 es` WebGL2 `TEXTURE_2D_ARRAY` (`gl.R32F` + `gl.R16UI`) shader renderer, Apache ECharts 102-band SED inspector, and `onnxruntime-web` WASM SIMD / WebGPU anomaly ranker.
2. **Tier 2 — Zero-Egress Data Lake (Cloudflare R2):** Stores pre-computed 6-slice `.bin` and Zstandard `.zarr` cutout cubes plus Hive-partitioned (`hpx`) GeoParquet 102-band forced-photometry catalogs ($0 egress via HTTP 307 redirects).
3. **Tier 3 — Scientific Compute API (`backend/` on Hugging Face Spaces Docker, 16 GB RAM, 2 vCPUs):** FastAPI, DuckDB `1.2.1` (`httpfs`, `spatial`, `parquet` with `SET s3_uploader_max_parts_per_file = 1;`), 64-connection `aiohttp` byte-range streamer, and a 2-worker `ProcessPoolExecutor` running `reproject_exact` and Fourier ZOGY proper subtraction.
4. **Tier 4 — Upstream Space Agency Archives:** Caltech/IPAC NASA IRSA (`/TAP`, `/ibe/data/spherex/`, `s3://nasa-irsa-spherex/`), CSA CADC Argus CAOM-2 TAP (`/argus/sync`) & SODA cutouts (`/caom2ops/sync`), STScI MAST Gaia DR3 Postgres VO-TAP (`/vo-tap/api/v0.1/mast_catalogs/sync`) & AWS S3 HATS, and CDS Strasbourg CORS-enabled HiPS mirrors.

### 3.2 Locked 6-Slice Binary Cutout Cube Wire Format (`/api/v1/cutout-cube`)

* **Bytes `0..15` (16-Byte Little-Endian `Uint32Array(4)` Header):** `[numSlices = 6, height, width, reservedFlags]`
* **Bytes `16 .. 16 + 4 * 6 * height * width` (`Float32Array` uploaded to `gl.R32F` `u_fluxCube`):**
  * `Slice 0`: SPHEREx Epoch 1 Calibrated Flux ($\mu\text{Jy}$, `ZODI`-subtracted)
  * `Slice 1`: SPHEREx Epoch 2 Calibrated Flux ($\mu\text{Jy}$, `ZODI`-subtracted)
  * `Slice 2`: Archival `unWISE` (16-Yr Bridge) / $D4 - D2$ Color / CSA `NEOSSat` Flux ($\mu\text{Jy}$)
  * `Slice 3`: ZOGY Proper Difference Image $D$ (whitened)
  * `Slice 4`: ZOGY Astrometric-Variance-Corrected Significance Map $S_{\text{corr}}$ (in Gaussian $\sigma$)
  * `Slice 5`: Modeled Zodiacal Dust Foreground `ZODI` ($\mu\text{Jy}$) — enables `<0.4 ms` 60-FPS GPU toggling (`flux + (u_subtractZodi ? 0.0 : zodi)`).
* **Remaining `2 * 6 * height * width` Bytes (`Uint16Array` uploaded to `gl.R16UI` `u_flagCube`):** Condensed SPHEREx hardware bitmask (`Bit 0 = NONFUNC`, `Bit 1 = DICHROIC`, `Bit 2 = PERSIST`, `Bit 3 = TRANSIENT/CR`, `Bit 4 = SUR_ERROR`, `Bit 5 = GHOST/STREAK`, `Bit 6 = MP_SOURCE`).

---

## 4. Quickstart & Deployment Guide

### Option A: Run Full Stack via Docker Compose (Recommended)

```bash
git clone https://github.com/ilpeiris/SPHEREx-planetX-discovery-engine.git
cd SPHEREx-planetX-discovery-engine
docker compose up --build
```

* **Frontend WebGL2 Workspace:** <http://localhost:3000>
* **Backend FastAPI & Swagger Docs:** <http://localhost:7860/docs>

### Option B: Run Backend & Frontend Locally

```bash
# 1. Start Backend (Python 3.11+)
cd backend
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 7860 --reload

# 2. Pre-compute Golden Catalog .bin/.zarr cubes, GeoParquet SED lake & INT8 ONNX models from live NASA IRSA
python ../scripts/build_golden_catalog_cubes.py
python ../scripts/build_geoparquet_sed_lake.py
python ../scripts/train_export_onnx_models.py

# 3. Start Frontend (Node 20+)
cd ../frontend
npm install
npm run dev
```

---

## 5. Mandatory Data, Space Agency & Open-Source Attribution

* **NASA / Caltech IPAC Infrared Science Archive (IRSA):** SPHEREx Quick Release 2 & Quick Release 3 Level 2 Spectral Images (DOI: `10.26131/IRSA629`), SPHEREx Cutout Service, SPHEREx Source Discovery Tool (`spherex_source_discovery_tool`), SPHEREx Target List of Ice Sources (SPLICES v8.6), SPHEREx Comet 3I/ATLAS Campaign Archive, and Moving Object Search Tool (MOST).
* **WISE / NEOWISE & Backyard Worlds: Planet 9:** unWISE time-resolved epochal coadds (unTimely Catalog, Meisner et al.) and citizen-science UX inspiration from WiseView (Dan Caselden & Paul Westin, `ascl:1806.004`).
* **Canadian Space Agency (CSA) & Canadian Astronomy Data Centre (CADC):** CSA NEOSSat Open Dataset (Record ID: `62d8033b-87b6-4322-8d5f-e26bebf934c1`), `asc-csa/NEOSSAT_Tutorial`, and CADC Argus CAOM-2 TAP & SODA services (`collection = 'NEOSSAT'`).
* **STScI Mikulski Archive for Space Telescopes (MAST) & ESA:** Gaia Data Release 3 (Gaia DR3) Postgres VO-TAP, VO-ConeSearch, AWS Open Data HATS Parquet (`s3://stpubdata/gaia/gaia_dr3/public/hats`), and ESA Gaia TAP+.
* **Ephemeris & Catalog Validation Services:** JPL Solar System Dynamics Small-Body Identification API (`sb_ident`), IMCCE SkyBoT, IAU Minor Planet Center (MPC CND API), and CDS Strasbourg (SIMBAD & Aladin Lite v3).
* **Scientific Open-Source Libraries:** Astropy, reproject, photutils, sep, astroquery, pyvo, DuckDB, Zarr, FastAPI, Next.js, Apache ECharts, PyTorch, and ONNX Runtime Web.

---

## 6. Author

**Isuru Lakmal Peiris** — Solo Founder, Colombo, Sri Lanka

* GitHub: [@ilpeiris](https://github.com/ilpeiris)
* LinkedIn: [@ilpeiris](https://www.linkedin.com/in/ilpeiris)
* Repository: [ilpeiris/SPHEREx-planetX-discovery-engine](https://github.com/ilpeiris/SPHEREx-planetX-discovery-engine)
