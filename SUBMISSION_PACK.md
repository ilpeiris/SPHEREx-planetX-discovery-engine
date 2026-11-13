
# OFFICIAL 2026 NASA SPACE APPS SUBMISSION PACK — "PLANET X AND SPHEREx"

---

## PART 1: COPY-PASTE PROJECT SUBMISSION FORM FIELDS (NASA PORTAL)

### 1. Project Name
**SPHEREx × Planet X: 102-Band WebGL2 Time-Domain & Spectral Discovery Engine**

### 2. High-Level Project Summary (Max 150 Words)
Since May 2025, NASA's SPHEREx space telescope has mapped the entire sky every six months across 102 near-infrared spectral bands (0.75–5.00 microns), imaging over a billion objects. Moving asteroids, comets, brown dwarfs, and a potential outer-solar-system "Planet X" betray their presence by shifting position or brightness across epochs, but manual inspection of this 4D hypercube is humanly impossible.

We built **SPHEREx × Planet X**, a zero-install, 60-FPS WebGL2 and WebAssembly discovery tool that evolves the citizen-science *WiseView* blink comparator from 2 broadband filters to 102 contiguous spectral channels. Powered by Caltech/IPAC IRSA cutouts, a 16-year archival WISE/unWISE time bridge, Canadian Space Agency (CSA) NEOSSat optical observations, and STScI MAST Gaia DR3 astrometry, our platform removes zodiacal dust live on the GPU, highlights moving dipoles via ZOGY proper subtraction, extracts 102-band spectra in one click, and exports verified discoveries directly to Zooniverse and JWST follow-up queues.

### 3. Project Details / How It Works
1. **Authentic SPHEREx 6-HDU Level 2 MEF Calibration (`calibration.py`):**
   - Queries Caltech/IPAC IRSA's zero-delay ADQL TAP service (`spherex.artifact` & `spherex.plane`) and streams cropped Multi-Extension FITS (`IMAGE`, `FLAGS`, `VARIANCE`, `ZODI`, `PSF`/`EPSF`, `WCS-WAVE`) cutouts in parallel via `aiohttp`.
   -Evaluates the 2D Linear Variable Filter (`WAVE-TAB`) spectral WCS (`key="W"`) with `spectral_wcs.sip = None`, subtracts HDU 4 (`ZODI` zodiacal dust model), multiplies by the AWS S3 Solid Angle Pixel Map (`cal-sapm-v2-2025-164`) to convert surface brightness ($\text{MJy/sr}$) to flux density ($\mu\text{Jy}$), and applies 64-bit `FLAGS` bitmasking (`FATAL_CORE_MASK = 0x3FDADDF7`) while preserving cataloged sources (`Bit 21 = MP_SOURCE`).
2. **6-Detector Co-Add, $D4 - D2$ Subtraction & 16-Year unWISE Time Bridge (`wcs_reproject.py`):**
   - Warps multi-epoch cutouts onto a unified tangential WCS grid via flux-conserving spherical polygon intersection (`reproject_exact`) and nearest-neighbor bitmask interpolation (`reproject_interp`).
   - Offers a **6-Detector Broadband SNR Boost** (stacking all 17 sub-channels per detector `D1`–`D6`), **Caltech/IPAC $D4 - D2$ Cold Brown Dwarf Subtraction**, and a **16-Year unWISE (2010–2024) + SPHEREx (2025–2026) Time Bridge**.
3. **60-FPS WebGL2 Float32 "Blink Machine" & ZOGY Proper Subtraction (`WebGL2BlinkMachine.tsx` & `zogy.py`):**
   - Streams a packed 6-slice `Float32Array` (`gl.R32F`) and `Uint16Array` (`gl.R16UI`) cube directly to the browser GPU, running `<1 ms` strided IRAF `ZScaleInterval` normalization and `<0.4 ms` fragment shader rendering across 4 modes: **Mode 0** (60-FPS Blink Comparator with live Slice 5 `ZODI` toggle), **Mode 1** (Lupton Color-Preserving Temporal Dipole RGB), **Mode 2** (102-Band Spectral False-Color RGB), and **Mode 3** (Fourier ZOGY Proper Subtraction Split-Curtain & $S_{\text{corr}}$ Sigma Heatmap).
4. **Dual-Regime 102-Band Spectrophotometry & Joint CSA NEOSSat NEATM Solver (`spectrophotometry.py` & `neossat_cadc.py`):**
   - Extracts point-source 102-band SEDs via QR3 $5\times$-oversampled ePSF forced photometry (`fit_ql < 3.0`) and extended cometary coma profiles ($Q_{\text{gas}}$ in $\text{molecules/s}$ for **Interstellar Comet 3I/ATLAS**).
   - Integrates **CSA NEOSSat** (`CADC` CAOM-2 TAP & SODA cutouts) optical photometry ($0.35\text{–}1.05\ \mu\text{m}$) with SPHEREx 102-band infrared spectra ($0.75\text{–}5.00\ \mu\text{m}$) to solve for asteroid Diameter ($D$), Geometric Albedo ($p_V$), and Beaming Parameter ($\eta$) via the Near-Earth Asteroid Thermal Model (NEATM).
5. **5-Stage Live Ephemeris Verification & 290 KB INT8 ONNX WebAssembly Ranker (`crossmatch_cascade.py` & `discoveryRanker.worker.ts`):**
   - Ranks the Top 10 sector anomalies in `11.4 ms` in the browser (`ConvSiameseNet` + `SpecVAE1D` + 24-D Hummingbird `IsolationForest` + Planet X Kinematics Score $\mathcal{P}_{\text{PX}}$) and verifies candidates live against **STScI MAST / ESA Gaia DR3**, **CDS SIMBAD**, **IMCCE SkyBoT**, **JPL `sb_ident`** (2-pass N-body), and **Minor Planet Center (`cnd`)**.

---

## PART 2: THE 30-SECOND VIDEO SCRIPT (72 WORDS — BURNED-IN ENGLISH SUBTITLES)

| Timestamp | On-Screen Visual Action (Screen Recording) | Spoken Audio & Burned-In English Subtitle Text (72 Words Total) | Judging Pillar Hit |
|---|---|---|---|
| **0:00 – 0:06** | Fast zoom into the Aladin Lite + SPHEREx all-sky map splitting into 102 infrared bands; bold HUD overlay: **`1 Billion Objects. 102 Infrared Bands. Every 6 Months.`** | *"Since 2025, NASA's SPHEREx telescope has mapped over a billion objects across 102 infrared bands every six months—hiding moving comets, brown dwarfs, and potentially Planet X."* | **Impact & Relevance** |
| **0:06 – 0:14** | Live capture of the WebGL2 workspace on **WISE 0855** and **Barnard's Star**: toggling `ZODI Subtracted`, sliding `Asinh` contrast, and switching to **Mode 1 Temporal Dipole RGB** where the red-to-blue dipole leaps across the starfield. | *"No scientist can inspect a billion sources alone. Meet SPHEREx-Blink: a public 60-FPS WebGL2 blink-comparator that upgrades WiseView for SPHEREx's 102 spectral channels."* | **Creativity & UX** |
| **0:14 – 0:23** | Clicking the moving dipole: the **102-Band ECharts SED Drawer** ($0.75\text{–}5.0\ \mu\text{m}$) unfolds with $\text{CH}_4/\text{H}_2\text{O}/\text{CO}_2$ bands, **3I/ATLAS** $Q_{\text{gas}}$, **CSA NEOSSat** NEATM solver, and **5-API Verify** badges. | *"Backed by IRSA's Cutout API and CSA's NEOSSat, our pipeline removes zodiacal light, aligns epochs with flux-conserving reprojection, and extracts 102-band spectra in one click to confirm real discoveries."* | **Validity & Best Use of Data** |
| **0:23 – 0:30** | Clicking **`Export Zooniverse / JWST CSV`** on the ONNX Top-10 Anomaly Leaderboard; final card displays live URL, GitHub repo, and QR code. | *"From classrooms to JWST follow-up—join the hunt for Planet X today at our live web tool."* | **Presentation & Scale** |

---

## PART 3: THE 7-SLIDE PRESENTATION DECK BLUEPRINT

* **Slide 1 — Hunting Planet X in a Billion-Object Haystack (Presentation):** Project title, solo founder credits, live clickable WebGL2 app URL & QR code, and side-by-side capture of **WISE 0855-0714** ($250\text{ K}$ brown dwarf shifting $126.4''$) and **Interstellar Comet 3I/ATLAS**.
* **Slide 2 — The Scale Bottleneck: Why Automated Catalogs Miss Faint Movers (Impact):** Illustrates how cosmic rays, diffraction spikes, and unsubtracted zodiacal dust blind static pipelines, whereas human pre-attentive motion perception in *Backyard Worlds* discovered $1,000+$ brown dwarfs.
* **Slide 3 — From WiseView (2 Bands) to SPHEREx (102 Bands) + CSA NEOSSat (Creativity):** Visual diagram of the 4D hypercube ($\text{RA} \times \text{Dec} \times 102\ \text{LVF channels} \times 16\text{-Yr unWISE + SPHEREx baseline}$) plus joint optical-infrared asteroid characterization with CSA's **NEOSSat**.
* **Slide 4 — Scientific Validity: Inside the 6-HDU IRSA MEF & ZOGY Pipeline (Validity):** Step-by-step data flow: `WCS-WAVE` (`key="W"`, `sip=None`) $\rightarrow$ `HDU 4 ZODI` subtraction $\rightarrow$ AWS S3 `SAPM` ($\text{MJy/sr} \rightarrow \mu\text{Jy}$) $\rightarrow$ 64-bit `FLAGS` bitmasking (`Bit 21 MP_SOURCE` retained, `0x3FDADDF7` rejected) $\rightarrow$ `reproject_exact` $\rightarrow$ Fourier ZOGY proper subtraction ($D, S_{\text{corr}}$).
* **Slide 5 — Zero-Jargon UX: 2 Seconds from Landing to Discovery (Relevance & UX):** Annotated screenshot of the 12-column synchronized Aladin Lite v3 + 60-FPS WebGL2 `gl.R32F`/`gl.R16UI` workspace, highlighting the **5 Mandatory NASA Test Target pills**, **6-Detector SNR Co-Add**, **4 GPU Inspection Modes**, and **URL / `<iframe>` Embed** generator.
* **Slide 6 — Verification Case Studies on Real 2025–2026 SPHEREx Data (Best Use of Data):** Live outputs on all 5 mandatory NASA targets (**Barnard's Star, WISE 0855, Epsilon Indi B, RW Aurigae, R Draconis**), **Comet 3I/ATLAS** ($40\times\ \text{H}_2\text{O}$ & $80\times\ \text{CO}$ post-perihelion surge), **FUOr WTP16aakapb** (`fit_ql = 25` outlier filtering), and **171 Ophelia** (joint CSA NEOSSat + SPHEREx NEATM fit).
* **Slide 7 — Citizen Science Ecosystem, ONNX WASM Ranking & JWST Prioritization (Impact & Scale):** Shows the `290 KB` INT8 `onnxruntime-web` worker ranking Top-10 sector anomalies in `11.4 ms`, the 5-stage live ephemeris cascade (**STScI MAST / ESA Gaia DR3, SIMBAD, SkyBoT, JPL `sb_ident`, MPC**), and 1-click **Zooniverse (`unWISE-verse` CSV)** export.

---

## PART 4: CHOREOGRAPHED 3-MINUTE LIVE JUDGING PLAYBOOK

* **Act I (0:00 – 0:45) — Immediate Visual Hook on Mandatory NASA Targets:**
  1. Open directly in the live browser workspace pre-loaded to **WISE 0855-0714** (`08h55m10.831s, -7d14m42.53s`) in a `6'×6'` FoV.
  2. Point out the 16-year proper-motion arrow showing WISE 0855 shifting **$126.4''$ ($20.6\text{ pixels}$) due west** from its 2010 WISE discovery coordinate to its 2025.85 SPHEREx position.
  3. Click `[Barnard's Star]`, `[Epsilon Indi B]`, `[RW Aurigae]`, and `[R Draconis]` on the top bar to prove instantaneous `<180 ms` loading across all 5 mandatory NASA test targets.
* **Act II (0:45 – 2:00) — Live GPU Physics: ZODI Subtraction, ZOGY Split-Curtain & 102-Band Spectra:**
  1. Click **`ZODI Subtracted: ON / OFF`** in the control bar—judges watch the bright solar system zodiacal dust gradient vanish in `<0.4 ms` at 60 FPS via Slice 5 of the WebGL2 shader.
  2. Switch to **Mode 1 (Temporal Dipole RGB)** and **Mode 3 (ZOGY Split-Curtain & $S_{\text{corr}}$ Heatmap)**, dragging the vertical cyan curtain across the cutout.
  3. Load **WTP16aakapb (FUOr)** or **3I/ATLAS (Dec '25)**, inspect the **102-Band ECharts SED**, toggle the $\text{H}_2\text{O} / \text{CH}_4 / \text{CO}_2 / \text{CO}$ bands, and click **`QC Filter ON (fit_ql < 3.0)`** to clean the $3.4\ \mu\text{m}$ bad-pixel spike live on screen.
* **Act III (2:00 – 3:00) — Multi-Mission CSA NEOSSat NEATM Solver, 5-API Verification & Zooniverse Export:**
  1. Click **`CSA NEOSSat`** in the top toolbar to open the joint **NEOSSat Optical + SPHEREx 102-Band IR NEATM Solver** on **171 Ophelia** / **1 Ceres**, showing solved Diameter $D$, Albedo $p_V$, and Beaming $\eta$.
  2. Click **`5-API Verify`** to run the live **STScI MAST / ESA Gaia DR3 + SIMBAD + SkyBoT + JPL `sb_ident` + MPC** cascade.
  3. Click **`Export Zooniverse / JWST CSV`** on the ONNX Top-10 Anomaly Leaderboard to download the standardized candidate report.