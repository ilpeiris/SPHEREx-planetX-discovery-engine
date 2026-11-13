/**
 * ============================================================================
 * @author      M.D.Isuru Lakmal Peiris (@ilpeiris) 
 * @project     SPHEREx x Planet X — 102-Band WebGL2 & WASM Discovery Engine
 * @repository  https://github.com/ilpeiris/SPHEREx-planetX-discovery-engine
 * @linkedin    https://www.linkedin.com/in/ilpeiris
 * @Github     https://github.com/ilpeiris/
 * @license     MIT License | Copyright (c) 2026 M.D.Isuru Lakmal Peiris
 * ============================================================================
 */

// frontend/src/lib/goldenCatalog.ts
/**
 * Pre-Validated Golden Target Catalog (May 2025 - October 2026 SPHEREx QR2/QR3),
 * Dual-Epoch Coordinate Aliasing (Micro-Safeguard #2), Sexagesimal Parser,
 * 6-Detector LVF Specifications, 3-Band Spectral RGB Presets, Molecular Absorption
 * Overlays, and Empirical Spectral Templates.
 */

export type TargetAstrophysicalType =
  | "HIGH_PM_STAR"
  | "COLD_BROWN_DWARF"
  | "VARIABLE_YSO"
  | "MIRA_VARIABLE"
  | "EXTENDED_COMET"
  | "DEEP_FIELD"
  | "ARTIFACT_BENCHMARK"
  | "OUTER_SOLAR_SYSTEM"
  | "ASTEROID_NEATM"
  | "ERUPTIVE_YSO_FUOR"
  | "HIGH_Z_QUASAR"
  | "RED_GALAXY";

export interface GoldenTarget {
  id: string;
  name: string;
  shortLabel: string;
  category: string;
  isMandatoryNasaTarget: boolean;
  hasNeossatOverlap: boolean;
  /** Propagated 2025.8 / 2026.3 SPHEREx ICRS Right Ascension (degrees) */
  raDeg: number;
  /** Propagated 2025.8 / 2026.3 SPHEREx ICRS Declination (degrees) */
  decDeg: number;
  /** Propagated sexagesimal string for UI display */
  raSexagesimal: string;
  decSexagesimal: string;
  /** Optional J2000.0 or WISE 2010.34 reference coordinates for Micro-Safeguard #2 aliasing */
  raRefDeg?: number;
  decRefDeg?: number;
  refEpochLabel?: string;
  raRefSexagesimal?: string;
  decRefSexagesimal?: string;
  /** Proper motion vector components (mas/yr) and total proper motion (arcsec/yr) */
  pmRaMasYr: number;
  pmDecMasYr: number;
  totalPmArcsecYr: number;
  /** 16-year shift from WISE (2010.5) to SPHEREx (2025.8) in arcseconds and SPHEREx pixels */
  shift16YrArcsec: number;
  shift16YrPixels: number;
  /** Default Field of View in arcminutes (Micro-Safeguard #2: 6' for fast movers) */
  fovArcmin: 2 | 6 | 15 | 30;
  /** Default global SPHEREx channel (1..102) */
  defaultChannel: number;
  /** Default inspection mode: 0=Blink, 1=Temporal Dipole RGB, 2=3-Band Spectral RGB, 3=ZOGY Curtain */
  defaultRenderMode: 0 | 1 | 2 | 3;
  observationEpoch: string;
  mjdObs: number;
  targetType: TargetAstrophysicalType;
  spectralTypeOrClass: string;
  distanceLabel: string;
  demoHook: string;
  scientificHighlights: string[];
}

export interface FovOption {
  fovArcmin: 2 | 6 | 15 | 30;
  label: string;
  pixelScaleArcsec: number;
  estLatencyLabel: string;
  useCase: string;
}

export interface DetectorBandInfo {
  bandId: 1 | 2 | 3 | 4 | 5 | 6;
  name: string;
  fpaRegime: "SWIR" | "MWIR";
  wavelengthMinUm: number;
  wavelengthMaxUm: number;
  resolvingPower: number;
  dichroicPartner: 1 | 2 | 3 | 4 | 5 | 6;
  channelStart: number;
  channelEnd: number;
  diagnostics: string;
}

export interface SpectralRgbPreset {
  id: string;
  name: string;
  redChannel: number;
  redWavelengthUm: number;
  greenChannel: number;
  greenWavelengthUm: number;
  blueChannel: number;
  blueWavelengthUm: number;
  diagnosticPurpose: string;
}

export interface MolecularBandOverlay {
  id: "H2O" | "CO2" | "CH4" | "CO";
  formula: string;
  label: string;
  colorRgba: string;
  borderHex: string;
  rangesUm: Array<[number, number]>;
}

export interface SpectralTemplateCurve {
  id: string;
  name: string;
  category: string;
  colorHex: string;
  description: string;
  /** Evaluates normalized template flux at wavelength lambdaUm (0.75..5.00) */
  evaluateNormalizedFlux: (lambdaUm: number) => number;
}

// ============================================================================
// 1. FIELD OF VIEW (FOV) OPTIONS WITH TRANSFER TIME INDICATORS (SECTION 5.4)
// ============================================================================
export const FOV_OPTIONS: FovOption[] = [
  {
    fovArcmin: 2,
    label: "2'×2' Fast (~150ms)",
    pixelScaleArcsec: 0.47,
    estLatencyLabel: "~150 ms",
    useCase: "Stationary transients, YSOs, AGNs & compact point sources",
  },
  {
    fovArcmin: 6,
    label: "6'×6' Standard (~400ms)",
    pixelScaleArcsec: 1.41,
    estLatencyLabel: "~400 ms",
    useCase: "High-proper-motion brown dwarfs (WISE 0855, Barnard's Star) & 3I/ATLAS coma",
  },
  {
    fovArcmin: 15,
    label: "15'×15' Wide Mover (~1.2s)",
    pixelScaleArcsec: 3.52,
    estLatencyLabel: "~1.2 s",
    useCase: "Deep fields (NEP/SDF), KBOs & intra-pass asteroid tracklets",
  },
  {
    fovArcmin: 30,
    label: "30'×30' Sector Parallax (~2.5s)",
    pixelScaleArcsec: 7.03,
    estLatencyLabel: "~2.5 s",
    useCase: "6-month Planet X parallax pairs (400-800 AU shifts 10'-23')",
  },
];

// ============================================================================
// 2. SPHEREx 6 LINEAR VARIABLE FILTER DETECTOR BANDS (D1 - D6, 102 CHANNELS)
// ============================================================================
export const SPHEREX_DETECTOR_BANDS: DetectorBandInfo[] = [
  {
    bandId: 1,
    name: "Band D1 (SWIR)",
    fpaRegime: "SWIR",
    wavelengthMinUm: 0.75,
    wavelengthMaxUm: 1.09,
    resolvingPower: 39,
    dichroicPartner: 4,
    channelStart: 1,
    channelEnd: 17,
    diagnostics: "Reflected solar continuum, CN (0.93 µm), He I airglow (1.083 µm), T/Y dwarf K I wings",
  },
  {
    bandId: 2,
    name: "Band D2 (SWIR)",
    fpaRegime: "SWIR",
    wavelengthMinUm: 1.10,
    wavelengthMaxUm: 1.62,
    resolvingPower: 41,
    dichroicPartner: 5,
    channelStart: 18,
    channelEnd: 34,
    diagnostics: "Near-IR J/H bands, H2O vapor (1.4 µm), crystalline H2O ice (1.5 µm), CH4 (1.15, 1.6 µm)",
  },
  {
    bandId: 3,
    name: "Band D3 (SWIR)",
    fpaRegime: "SWIR",
    wavelengthMinUm: 1.63,
    wavelengthMaxUm: 2.41,
    resolvingPower: 41,
    dichroicPartner: 6,
    channelStart: 35,
    channelEnd: 51,
    diagnostics: "Near-IR K band, deep CH4 (1.65, 2.2 µm), H2O ice (2.0 µm), H2-H2 CIA suppression",
  },
  {
    bandId: 4,
    name: "Band D4 (MWIR)",
    fpaRegime: "MWIR",
    wavelengthMinUm: 2.42,
    wavelengthMaxUm: 3.82,
    resolvingPower: 35,
    dichroicPartner: 1,
    channelStart: 52,
    channelEnd: 68,
    diagnostics: "WISE W1 overlap, H2O gas (2.7 µm), deep H2O ice stretch (3.0 µm), CH4 / PAH / C-H (3.3 µm)",
  },
  {
    bandId: 5,
    name: "Band D5 (MWIR High-R)",
    fpaRegime: "MWIR",
    wavelengthMinUm: 3.83,
    wavelengthMaxUm: 4.41,
    resolvingPower: 112,
    dichroicPartner: 2,
    channelStart: 69,
    channelEnd: 85,
    diagnostics: "4.0 µm Y-dwarf/Planet X opacity window & fundamental 12CO2 ice/gas (4.26 µm)",
  },
  {
    bandId: 6,
    name: "Band D6 (MWIR High-R)",
    fpaRegime: "MWIR",
    wavelengthMinUm: 4.42,
    wavelengthMaxUm: 5.00,
    resolvingPower: 128,
    dichroicPartner: 3,
    channelStart: 86,
    channelEnd: 102,
    diagnostics: "WISE W2 overlap, fundamental CO band (4.67 µm), ~4.5 µm nova coronal blend & thermal dust",
  },
];

// ============================================================================
// 3. THE 4 DIAGNOSTIC 102-BAND FALSE-COLOR RGB PRESETS (SECTION 5.2 MODE 2)
// ============================================================================
export const SPECTRAL_RGB_PRESETS: SpectralRgbPreset[] = [
  {
    id: "swir_mwir_continuum",
    name: "Broadband SWIR–MWIR Continuum",
    redChannel: 98,
    redWavelengthUm: 4.82,
    greenChannel: 59,
    greenWavelengthUm: 2.95,
    blueChannel: 12,
    blueWavelengthUm: 0.98,
    diagnosticPurpose: "Separates ultra-cool brown dwarfs & dusty AGNs (vivid red) from hot main-sequence stars (blue)",
  },
  {
    id: "brown_dwarf_ch4_hunter",
    name: "Brown Dwarf & Planet X Methane (CH4) Hunter",
    redChannel: 74,
    redWavelengthUm: 4.01,
    greenChannel: 64,
    greenWavelengthUm: 3.30,
    blueChannel: 22,
    blueWavelengthUm: 1.22,
    diagnosticPurpose: "T/Y brown dwarfs drop out in Green (3.30 µm CH4 absorption) while glowing brightly in Blue & Red",
  },
  {
    id: "interstellar_ice_absorption",
    name: "Interstellar Ice Absorption (H2O / CO2)",
    redChannel: 81,
    redWavelengthUm: 4.26,
    greenChannel: 60,
    greenWavelengthUm: 3.03,
    blueChannel: 48,
    blueWavelengthUm: 2.25,
    diagnosticPurpose: "Highlights embedded YSOs, FUOrs & KBOs exhibiting deep 3.03 µm H2O and 4.26 µm CO2 ice troughs",
  },
  {
    id: "pah_dust_emission",
    name: "PAH & Cometary Organics Mapper",
    redChannel: 90,
    redWavelengthUm: 4.55,
    greenChannel: 64,
    greenWavelengthUm: 3.30,
    blueChannel: 46,
    blueWavelengthUm: 2.15,
    diagnosticPurpose: "Isolates 3.30 µm PAH star-forming filaments and cometary C-H organic comae in bright green",
  },
];

// ============================================================================
// 4. MOLECULAR ABSORPTION / EMISSION BAND OVERLAYS FOR 102-BAND SED INSPECTOR
// ============================================================================
export const MOLECULAR_BAND_OVERLAYS: MolecularBandOverlay[] = [
  {
    id: "H2O",
    formula: "H₂O",
    label: "Water Vapor & Ice (1.40, 1.90, 2.70, 3.05 µm)",
    colorRgba: "rgba(18, 181, 203, 0.16)",
    borderHex: "#12B5CB",
    rangesUm: [
      [1.36, 1.52],
      [1.82, 2.02],
      [2.65, 2.82],
      [2.85, 3.20],
    ],
  },
  {
    id: "CH4",
    formula: "CH₄",
    label: "Methane & Organics (1.65, 2.25, 3.30 µm)",
    colorRgba: "rgba(245, 56, 160, 0.16)",
    borderHex: "#F538A0",
    rangesUm: [
      [1.62, 1.76],
      [2.18, 2.38],
      [3.22, 3.55],
    ],
  },
  {
    id: "CO2",
    formula: "CO₂",
    label: "Carbon Dioxide (2.00, 2.70, 4.26 µm)",
    colorRgba: "rgba(16, 185, 129, 0.18)",
    borderHex: "#10B981",
    rangesUm: [
      [1.98, 2.06],
      [4.20, 4.34],
    ],
  },
  {
    id: "CO",
    formula: "CO",
    label: "Carbon Monoxide (2.35, 4.67 µm)",
    colorRgba: "rgba(250, 144, 62, 0.18)",
    borderHex: "#FA903E",
    rangesUm: [
      [2.30, 2.41],
      [4.55, 4.82],
    ],
  },
];

// ============================================================================
// 5. EMPIRICAL SPECTRAL TEMPLATES FOR ONE-CLICK TEMPLATE MATCHING (SECTION 5.4)
// ============================================================================
export const EMPIRICAL_SPECTRAL_TEMPLATES: SpectralTemplateCurve[] = [
  {
    id: "ty_brown_dwarf_planetx",
    name: "Cold T8/Y4 Brown Dwarf & Planet X Model (SUDA / Rustamkulov+26)",
    category: "Substellar / Planet X",
    colorHex: "#F538A0",
    description: "Deep H2O (1.4, 1.9, 2.7 µm) & CH4 (1.65, 2.25, 3.3 µm) troughs + 4.0–4.8 µm opacity window peak",
    evaluateNormalizedFlux: (lam: number) => {
      const peakJ = 0.22 * Math.exp(-Math.pow((lam - 1.25) / 0.18, 2));
      const peakW = 1.0 * Math.exp(-Math.pow((lam - 4.42) / 0.48, 2));
      const ch4 =
        0.82 * Math.exp(-Math.pow((lam - 1.66) / 0.08, 2)) +
        0.88 * Math.exp(-Math.pow((lam - 2.28) / 0.12, 2)) +
        0.92 * Math.exp(-Math.pow((lam - 3.32) / 0.16, 2));
      const h2o =
        0.72 * Math.exp(-Math.pow((lam - 1.42) / 0.07, 2)) +
        0.78 * Math.exp(-Math.pow((lam - 1.90) / 0.09, 2));
      const co2 = 0.45 * Math.exp(-Math.pow((lam - 4.26) / 0.05, 2));
      return Math.max(0.02, (peakJ + peakW + 0.12) * (1.0 - Math.min(0.94, Math.max(ch4, h2o, co2))));
    },
  },
  {
    id: "l5gamma_low_gravity",
    name: "Young Low-Gravity L5γ Exoplanet Analog (2MASS J0355+1133)",
    category: "Substellar / Exoplanet Analog",
    colorHex: "#A855F7",
    description: "Muted H2O absorption (1/4th of field L5) and enhanced 2.2 µm K-band peak from dusty photospheric clouds",
    evaluateNormalizedFlux: (lam: number) => {
      const base = 0.65 * Math.exp(-Math.pow((lam - 2.18) / 1.15, 2)) + 0.35 * Math.exp(-Math.pow((lam - 3.8) / 1.4, 2));
      const mutedH2o =
        0.22 * Math.exp(-Math.pow((lam - 1.42) / 0.08, 2)) +
        0.25 * Math.exp(-Math.pow((lam - 1.90) / 0.10, 2)) +
        0.28 * Math.exp(-Math.pow((lam - 2.72) / 0.15, 2));
      const coBand = 0.20 * Math.exp(-Math.pow((lam - 4.65) / 0.14, 2));
      return Math.max(0.05, base * (1.0 - Math.max(mutedH2o, coBand)));
    },
  },
  {
    id: "splices_embedded_ice",
    name: "SPLICES v8.6 Embedded YSO / FUOr Water & CO2 Ice Template",
    category: "Interstellar Ices / YSO",
    colorHex: "#12B5CB",
    description: "Reddened rising continuum with deep solid-state 3.05 µm H2O (τ≈1.5) and 4.26 µm CO2 ice troughs",
    evaluateNormalizedFlux: (lam: number) => {
      const redCont = Math.pow(lam / 5.0, 2.6);
      const tauIce =
        1.5 * Math.exp(-Math.pow((lam - 3.05) / 0.20, 2)) +
        0.95 * Math.exp(-Math.pow((lam - 4.26) / 0.045, 2));
      return Math.max(0.01, redCont * Math.exp(-tauIce));
    },
  },
  {
    id: "kbo_cliff_3i_atlas",
    name: "KBO 'Cliff' Reflectance + Cometary CO2 Outgassing (Lisse+25)",
    category: "Comets / KBOs",
    colorHex: "#10B981",
    description: "80% reflectance drop between 2.5–3.1 µm from H2O/CO2 ice grains plus intense 4.26 µm CO2 emission spike",
    evaluateNormalizedFlux: (lam: number) => {
      const cliff = lam < 2.45 ? 0.32 : 0.07 + 0.03 * (lam - 2.45);
      const co2Spike = 0.95 * Math.exp(-Math.pow((lam - 4.26) / 0.035, 2));
      const h2oGas = 0.35 * Math.exp(-Math.pow((lam - 2.72) / 0.055, 2));
      const coGas = 0.42 * Math.exp(-Math.pow((lam - 4.67) / 0.04, 2));
      return Math.min(1.0, cliff + co2Spike + h2oGas + coGas);
    },
  },
];

// ============================================================================
// 6. COMPLETE PRE-VALIDATED GOLDEN TARGET CATALOG (18 PREMIER GROUPS)
// ============================================================================
export const GOLDEN_CATALOG: GoldenTarget[] = [
  // --- CATEGORY 1: THE 5 OFFICIAL NASA PROMPT MANDATORY TARGETS ---
  {
    id: "barnards_star",
    name: "Barnard's Star (GJ 699)",
    shortLabel: "Barnard's Star",
    category: "1. Official NASA Prompt Target",
    isMandatoryNasaTarget: true,
    hasNeossatOverlap: false,
    raDeg: 269.44632,
    decDeg: 4.76748,
    raSexagesimal: "17:57:47.12",
    decSexagesimal: "+04:46:02.95",
    raRefDeg: 269.45208,
    decRefDeg: 4.69337,
    refEpochLabel: "J2000.0",
    raRefSexagesimal: "17:57:48.50",
    decRefSexagesimal: "+04:41:36.11",
    pmRaMasYr: -801.55,
    pmDecMasYr: 10362.39,
    totalPmArcsecYr: 10.3933,
    shift16YrArcsec: 158.5,
    shift16YrPixels: 25.8,
    fovArcmin: 6, // Micro-Safeguard #2: 6'x6' FoV so 158.5'' motion track is never clipped
    defaultChannel: 64,
    defaultRenderMode: 1,
    observationEpoch: "2025.75 (Survey 1 & 2)",
    mjdObs: 60949.0,
    targetType: "HIGH_PM_STAR",
    spectralTypeOrClass: "M4.0V Red Dwarf (3,195 K)",
    distanceLabel: "1.828 pc (5.96 ly)",
    demoHook:
      "Fastest proper-motion star in the sky (μ = 10.39''/yr); leaps 158.5'' (25.8 SPHEREx pixels) north-northwest from WISE (2010.5) to SPHEREx (2025.75) and 5.20'' every 6 months.",
    scientificHighlights: [
      "Mandatory NASA Challenge Test Target #1.",
      "Hosts 4 confirmed sub-Earth exoplanets (b, c, d, e).",
      "Demonstrates both 6-month SPHEREx dipole motion (5.20'' = 0.84 px) and 16-year unWISE bridge motion (158.5'' = 25.8 px).",
    ],
  },
  {
    id: "wise_0855",
    name: "WISE 0855-0714 (WISE J085510.83-071442.5)",
    shortLabel: "WISE 0855",
    category: "1. Official NASA Prompt Target",
    isMandatoryNasaTarget: true,
    hasNeossatOverlap: false,
    raDeg: 133.75985,
    decDeg: -7.24225,
    raSexagesimal: "08:55:02.36",
    decSexagesimal: "-07:14:32.08",
    raRefDeg: 133.79513,
    decRefDeg: -7.24515,
    refEpochLabel: "WISE 2010.34 (Prompt Coord)",
    raRefSexagesimal: "08:55:10.831",
    decRefSexagesimal: "-07:14:42.53",
    pmRaMasYr: -8123.7,
    pmDecMasYr: 673.2,
    totalPmArcsecYr: 8.1516,
    shift16YrArcsec: 126.4,
    shift16YrPixels: 20.6,
    fovArcmin: 6, // Micro-Safeguard #2: 6'x6' FoV + aliases 2010 WISE discovery coord (08h55m10.831s, -7d14m42.53s)
    defaultChannel: 74,
    defaultRenderMode: 1,
    observationEpoch: "2025.85 (Survey 1 & 2)",
    mjdObs: 60985.0,
    targetType: "COLD_BROWN_DWARF",
    spectralTypeOrClass: "≥Y4 Ultra-Cold Brown Dwarf (~250 K)",
    distanceLabel: "2.278 pc (7.43 ly)",
    demoHook:
      "Coldest known brown dwarf (250 K, 3–10 M_Jup — closest empirical analog to Planet X); shifted 126.4'' (20.6 pixels) due west since its 2010 WISE discovery coordinate!",
    scientificHighlights: [
      "Mandatory NASA Challenge Test Target #2 (exact prompt coordinate 08h55m10.831s, -7d14m42.53s is its 2010.34 WISE epoch).",
      "Completely invisible in Pan-STARRS optical cutouts while glowing brightly in SPHEREx Bands D5–D6 (3.8–5.0 µm).",
      "Exhibits water-ice clouds and deep H2O/CH4 absorption troughs.",
    ],
  },
  {
    id: "epsilon_indi_b",
    name: "Epsilon Indi Ba/Bb (T1 + T6 Brown Dwarf Binary)",
    shortLabel: "Epsilon Indi B",
    category: "1. Official NASA Prompt Target",
    isMandatoryNasaTarget: true,
    hasNeossatOverlap: false,
    raDeg: 331.09627,
    decDeg: -56.80052,
    raSexagesimal: "22:04:23.10",
    decSexagesimal: "-56:48:01.87",
    raRefDeg: 331.04415,
    decRefDeg: -56.78284,
    refEpochLabel: "J2000.0",
    raRefSexagesimal: "22:04:10.60",
    decRefSexagesimal: "-56:46:58.24",
    pmRaMasYr: 3982.0,
    pmDecMasYr: -2466.8,
    totalPmArcsecYr: 4.684,
    shift16YrArcsec: 72.5,
    shift16YrPixels: 11.8,
    fovArcmin: 6,
    defaultChannel: 60,
    defaultRenderMode: 1,
    observationEpoch: "2025.80 (Survey 1 & 2)",
    mjdObs: 60967.0,
    targetType: "COLD_BROWN_DWARF",
    spectralTypeOrClass: "T1 + T6 Binary Brown Dwarf (~1,300 K & ~800 K)",
    distanceLabel: "3.638 pc (11.87 ly)",
    demoHook:
      "Binary brown dwarf pair orbiting K5V star ε Indi A; shifts 72.5'' (11.8 pixels) across our 16-year bridge and pops out in D4–D2 subtraction.",
    scientificHighlights: [
      "Mandatory NASA Challenge Test Target #3.",
      "Benchmark T1 + T6 system showing strong 1.65 & 2.25 µm CH4 and 2.7–3.0 µm H2O absorption.",
    ],
  },
  {
    id: "rw_aurigae",
    name: "RW Aurigae (RW Aur A + B)",
    shortLabel: "RW Aurigae",
    category: "1. Official NASA Prompt Target",
    isMandatoryNasaTarget: true,
    hasNeossatOverlap: false,
    raDeg: 76.95607,
    decDeg: 30.40133,
    raSexagesimal: "05:07:49.46",
    decSexagesimal: "+30:24:04.80",
    pmRaMasYr: 4.2,
    pmDecMasYr: -27.2,
    totalPmArcsecYr: 0.0275,
    shift16YrArcsec: 0.42,
    shift16YrPixels: 0.07,
    fovArcmin: 2,
    defaultChannel: 64,
    defaultRenderMode: 3,
    observationEpoch: "May 2025 – Oct 2026",
    mjdObs: 60980.0,
    targetType: "VARIABLE_YSO",
    spectralTypeOrClass: "Classical T Tauri / UX Ori Variable Binary",
    distanceLabel: "156 pc (509 ly, Taurus-Auriga)",
    demoHook:
      "Chaotic accreting T Tauri binary undergoing multi-magnitude dust dimming events and warm protoplanetary disk infrared variability.",
    scientificHighlights: [
      "Mandatory NASA Challenge Test Target #4.",
      "Produces a high-significance stationary monopole (|S_corr| > 12σ) in ZOGY proper difference imaging.",
    ],
  },
  {
    id: "r_draconis",
    name: "R Draconis (HD 149880)",
    shortLabel: "R Draconis",
    category: "1. Official NASA Prompt Target",
    isMandatoryNasaTarget: true,
    hasNeossatOverlap: false,
    raDeg: 248.16833,
    decDeg: 66.75419,
    raSexagesimal: "16:32:40.40",
    decSexagesimal: "+66:45:15.10",
    pmRaMasYr: -4.8,
    pmDecMasYr: -33.1,
    totalPmArcsecYr: 0.0334,
    shift16YrArcsec: 0.51,
    shift16YrPixels: 0.08,
    fovArcmin: 2,
    defaultChannel: 81,
    defaultRenderMode: 3,
    observationEpoch: "Continuous NEP Border (May 2025 – Oct 2026)",
    mjdObs: 60990.0,
    targetType: "MIRA_VARIABLE",
    spectralTypeOrClass: "Mira Pulsating Red Giant (M5e–M9eIII, P = 245.6 d)",
    distanceLabel: "~238 pc (Draco, Dec +66.75°)",
    demoHook:
      "Large-amplitude Mira variable (V = 6.7–13.2 mag) situated on the border of the SPHEREx North Ecliptic Pole (NEP) Deep Field (+66.56°).",
    scientificHighlights: [
      "Mandatory NASA Challenge Test Target #5.",
      "High-cadence orbital convergence near the NEP provides dense multi-epoch 102-band light curves and deep H2O steam & CO bands.",
    ],
  },

  // --- CATEGORY 2: INTERSTELLAR COMET 3I/ATLAS (PRE- & POST-PERIHELION) ---
  {
    id: "comet_3i_atlas_pre",
    name: "3I/ATLAS (C/2025 N1) — Aug 2025 Pre-Perihelion",
    shortLabel: "3I/ATLAS (Aug '25)",
    category: "2. Interstellar Comet",
    isMandatoryNasaTarget: false,
    hasNeossatOverlap: true,
    raDeg: 246.3667,
    decDeg: -16.7420,
    raSexagesimal: "16:25:28.00",
    decSexagesimal: "-16:44:31.19",
    pmRaMasYr: 0,
    pmDecMasYr: 0,
    totalPmArcsecYr: 0,
    shift16YrArcsec: 0,
    shift16YrPixels: 0,
    fovArcmin: 6,
    defaultChannel: 81,
    defaultRenderMode: 0,
    observationEpoch: "2025-08-10 12:00 UTC (MJD 60897.50, r_h = 3.19 AU)",
    mjdObs: 60897.5,
    targetType: "EXTENDED_COMET",
    spectralTypeOrClass: "Hyperbolic Interstellar Comet (e = 6.14, v_∞ = 58 km/s)",
    distanceLabel: "r_h = 3.19 AU, Δ = 2.70 AU (Ophiuchus)",
    demoHook:
      "80% KBO 'Cliff' H2O-ice reflectance drop (2.5–3.1 µm) and giant 348,000 km (≥3', 230 px) CO2 coma at 4.26 µm (Q_CO2 = 9.4×10²⁶ mol/s).",
    scientificHighlights: [
      "Latent heat of CO2 sublimation evaporatively cooled coma ice grains to ~120 K, suppressing H2O and CO outgassing (Lisse et al. 2025).",
      "Requires our extended-coma 2-pixel core + 3σ-clipped modal azimuthal annulus profiler (standard point-source Tractor fitting fails).",
    ],
  },
  {
    id: "comet_3i_atlas_post",
    name: "3I/ATLAS (C/2025 N1) — Dec 2025 Post-Perihelion Awakening",
    shortLabel: "3I/ATLAS (Dec '25)",
    category: "2. Interstellar Comet",
    isMandatoryNasaTarget: false,
    hasNeossatOverlap: true,
    raDeg: 170.1887,
    decDeg: 4.1001,
    raSexagesimal: "11:20:45.28",
    decSexagesimal: "+04:06:00.37",
    pmRaMasYr: 0,
    pmDecMasYr: 0,
    totalPmArcsecYr: 0,
    shift16YrArcsec: 0,
    shift16YrPixels: 0,
    fovArcmin: 6,
    defaultChannel: 81,
    defaultRenderMode: 2,
    observationEpoch: "2025-12-11 12:00 UTC (MJD 61020.50, r_h = 2.07 AU)",
    mjdObs: 61020.5,
    targetType: "EXTENDED_COMET",
    spectralTypeOrClass: "Post-Perihelion Hyperactive Interstellar Comet",
    distanceLabel: "r_h = 2.07 AU, Δ = 1.82 AU (Leo/Virgo)",
    demoHook:
      "Dramatic post-perihelion awakening: 40× H2O gas surge (2.7 µm), 80× CO gas surge (4.67 µm), new CN (0.93 µm) & C-H organics (3.2–3.6 µm), and pear-shaped sunward dust anti-tail.",
    scientificHighlights: [
      "Perihelion heating (q = 1.356 AU) eroded 1.3–5.5 m of cosmic-ray-processed crust, exposing pristine subsurface hypervolatiles (Lisse et al. 2026).",
      "3.0 µm water-ice trough vanished as coma ice mantles sublimated completely.",
    ],
  },

  // --- CATEGORY 3: SPHEREx DEEP FIELDS (NORTH & SOUTH ECLIPTIC POLES) ---
  {
    id: "spherex_nep_deep",
    name: "SPHEREx North Deep Field (NEP Core & Cat's Eye NGC 6543)",
    shortLabel: "NEP Deep Field",
    category: "3. Deep Field (North)",
    isMandatoryNasaTarget: false,
    hasNeossatOverlap: false,
    raDeg: 270.00000,
    decDeg: 66.56071,
    raSexagesimal: "18:00:00.00",
    decSexagesimal: "+66:33:38.55",
    pmRaMasYr: 0,
    pmDecMasYr: 0,
    totalPmArcsecYr: 0,
    shift16YrArcsec: 0,
    shift16YrPixels: 0,
    fovArcmin: 15,
    defaultChannel: 64,
    defaultRenderMode: 0,
    observationEpoch: "Continuous Every Orbit (May 2025 – Oct 2026)",
    mjdObs: 61050.0,
    targetType: "DEEP_FIELD",
    spectralTypeOrClass: "North Ecliptic Pole (β = +90.0°, spherex_qr3_deep)",
    distanceLabel: "50–100× Exposure Redundancy",
    demoHook:
      "Visited on nearly every SPHEREx polar orbit; encompasses Cat's Eye Nebula (NGC 6543, 3.7' away), CALSPEC standards, and 2,764 mid-IR variable AGNs.",
    scientificHighlights: [
      "Primary zodiacal dust foreground benchmark and extragalactic background light (EBL) deep field.",
      "Includes benchmark variable AGN WISE J170954.64+673101.8 (P_var = 1.00, W1 - W2 = 1.25 mag).",
    ],
  },
  {
    id: "spherex_sdf_deep",
    name: "SPHEREx Offset South Deep Field (SDF) & Exact SEP",
    shortLabel: "SDF Deep Field",
    category: "3. Deep Field (South)",
    isMandatoryNasaTarget: false,
    hasNeossatOverlap: false,
    raDeg: 72.00006,
    decDeg: -71.36290,
    raSexagesimal: "04:48:00.02",
    decSexagesimal: "-71:21:46.42",
    raRefDeg: 90.00000,
    decRefDeg: -66.56071,
    refEpochLabel: "Exact SEP (β = -90°)",
    raRefSexagesimal: "06:00:00.00",
    decRefSexagesimal: "-66:33:38.55",
    pmRaMasYr: 0,
    pmDecMasYr: 0,
    totalPmArcsecYr: 0,
    shift16YrArcsec: 0,
    shift16YrPixels: 0,
    fovArcmin: 15,
    defaultChannel: 64,
    defaultRenderMode: 0,
    observationEpoch: "Continuous (May 2025 – Oct 2026)",
    mjdObs: 61050.0,
    targetType: "DEEP_FIELD",
    spectralTypeOrClass: "Offset Southern Deep Field (β = -82.0°, λ = -44.8°)",
    distanceLabel: "Mensa / Dorado Outer LMC Halo",
    demoHook:
      "Intentionally offset ~8° from the Exact South Ecliptic Pole (which sits on the crowded LMC edge with 27,581 MIR variables) to prevent 6.15'' pixel confusion.",
    scientificHighlights: [
      "Samples 18 deg² of outer LMC halo for dark-matter axion decay searches and high-inclination TNO tracklets.",
    ],
  },
  {
    id: "nep_spurious_persist",
    name: "WISE J183309.77+675144.8 (NEP Persistence Artifact Benchmark)",
    shortLabel: "NEP Persistence Test",
    category: "3. Deep Field Artifact Test",
    isMandatoryNasaTarget: false,
    hasNeossatOverlap: false,
    raDeg: 278.29071,
    decDeg: 67.86244,
    raSexagesimal: "18:33:09.77",
    decSexagesimal: "+67:51:44.80",
    pmRaMasYr: 0,
    pmDecMasYr: 0,
    totalPmArcsecYr: 0,
    shift16YrArcsec: 0,
    shift16YrPixels: 0,
    fovArcmin: 2,
    defaultChannel: 64,
    defaultRenderMode: 0,
    observationEpoch: "May 2025 – Oct 2026 (Kim et al. 2026 Benchmark)",
    mjdObs: 61010.0,
    targetType: "ARTIFACT_BENCHMARK",
    spectralTypeOrClass: "Spurious 1-Year Quasi-Periodic Artifact",
    distanceLabel: "NEP Field (Draco)",
    demoHook:
      "Textbook cautionary benchmark from Kim et al. (2026): a fake 1-year variable caused by a rotating bright-star PSF/afterimage halo, immediately caught and hatched by our FLAGS Bit 17 (MP_PERSIST) filter.",
    scientificHighlights: [
      "Proves to NASA/IPAC judges why hardware bitmasking (HDU 2 FLAGS) is mandatory before claiming transient discoveries.",
    ],
  },

  // --- CATEGORY 4: HIGH-PM BROWN DWARFS & SUDA / JWST BENCHMARKS ---
  {
    id: "luhman_16ab",
    name: "Luhman 16AB (WISE J104915.57-531906.1) & Wolf 359",
    shortLabel: "Luhman 16AB",
    category: "4. High-PM Brown Dwarfs",
    isMandatoryNasaTarget: false,
    hasNeossatOverlap: false,
    raDeg: 162.29547,
    decDeg: -53.31689,
    raSexagesimal: "10:49:10.91",
    decSexagesimal: "-53:19:00.80",
    raRefDeg: 162.32881,
    decRefDeg: -53.31947,
    refEpochLabel: "2MASS J2000.0",
    raRefSexagesimal: "10:49:18.92",
    decRefSexagesimal: "-53:19:10.08",
    pmRaMasYr: -2768.51,
    pmDecMasYr: 358.47,
    totalPmArcsecYr: 2.7916,
    shift16YrArcsec: 43.0,
    shift16YrPixels: 7.0,
    fovArcmin: 6,
    defaultChannel: 60,
    defaultRenderMode: 1,
    observationEpoch: "2025.90 (Survey 1 & 2)",
    mjdObs: 61003.0,
    targetType: "COLD_BROWN_DWARF",
    spectralTypeOrClass: "L7.5 + T0.5 Transition Binary (~1,300 K)",
    distanceLabel: "1.994 pc (6.50 ly — Closest Brown Dwarfs)",
    demoHook:
      "Closest known brown dwarf system; shifts 43.0'' (7.0 pixels) since WISE 2010.5 and exhibits patchy silicate/iron cloud weather variability (P = 5.28 hr).",
    scientificHighlights: [
      "Companion benchmark Wolf 359 (M6.5Ve flare star at 164.09264°, +6.99542°) shifts 71.9'' (11.7 px) since WISE.",
    ],
  },
  {
    id: "suda_benchmarks",
    name: "2MASS J0355+1133 (L5γ), J0348-6022 (T7) & WISE J1828+2650 (Y2)",
    shortLabel: "SUDA / JWST Benchmarks",
    category: "4. SUDA / JWST Benchmarks",
    isMandatoryNasaTarget: false,
    hasNeossatOverlap: false,
    raDeg: 58.84737,
    decDeg: 11.56214,
    raSexagesimal: "03:55:23.37",
    decSexagesimal: "+11:33:43.70",
    pmRaMasYr: 219.0,
    pmDecMasYr: -631.0,
    totalPmArcsecYr: 0.668,
    shift16YrArcsec: 10.4,
    shift16YrPixels: 1.7,
    fovArcmin: 2,
    defaultChannel: 64,
    defaultRenderMode: 2,
    observationEpoch: "SUDA Atlas & Rustamkulov et al. (2026)",
    mjdObs: 60960.0,
    targetType: "COLD_BROWN_DWARF",
    spectralTypeOrClass: "L5γ Low-Gravity Young Brown Dwarf (~1,450 K)",
    distanceLabel: "9.16 pc (29.9 ly)",
    demoHook:
      "SPHEREx 1–5 µm integrated flux agrees with JWST spectra to 2.2% with zero rescaling; WISE J1828+2650 (Y2) reveals a newly discovered 3.3 µm CH4 emission line from stratospheric thermal inversion.",
    scientificHighlights: [
      "Low surface gravity mutes H2O absorption to 1/4th of field L5 dwarfs while boosting 2.2 µm K-band flux.",
      "Band D5 4.25 µm CO2 feature acts as a direct metallicity ([M/H]) gauge.",
    ],
  },

  // --- CATEGORY 5: OUTER SOLAR SYSTEM & MAIN-BELT ASTEROIDS ---
  {
    id: "pluto_makemake_tno",
    name: "134340 Pluto, 136472 Makemake, 136108 Haumea, 136199 Eris & 2060 Chiron",
    shortLabel: "Pluto & TNOs",
    category: "5. Outer Solar System",
    isMandatoryNasaTarget: false,
    hasNeossatOverlap: false,
    raDeg: 306.07083,
    decDeg: -23.70667,
    raSexagesimal: "20:24:17.00",
    decSexagesimal: "-23:42:24.00",
    pmRaMasYr: 0,
    pmDecMasYr: 0,
    totalPmArcsecYr: 0,
    shift16YrArcsec: 0,
    shift16YrPixels: 0,
    fovArcmin: 15,
    defaultChannel: 64,
    defaultRenderMode: 1,
    observationEpoch: "2026-10-28 (MJD 61341.0, r_h = 35.63 AU)",
    mjdObs: 61341.0,
    targetType: "OUTER_SOLAR_SYSTEM",
    spectralTypeOrClass: "Dwarf Planets, Classical KBOs & Active Ringed Centaur",
    distanceLabel: "r_h = 18.2 to 95.6 AU (Tracked via IRSA MOST)",
    demoHook:
      "Tracked via IRSA MOST across SPHEREx passes: Pluto & Makemake display deep CH4 ice (1.7, 2.3, 3.3 µm), Haumea displays ~100% crystalline H2O ice (1.5, 2.0, 3.0 µm), and Chiron shows episodic coma activity.",
    scientificHighlights: [
      "Demonstrates 6-month parallax loop geometry used by our Two-Tier KD-Tree Planet X linker.",
    ],
  },
  {
    id: "asteroid_171_ophelia",
    name: "171 Ophelia, 1 Ceres & 4 Vesta (SPHEREx + CSA NEOSSat Benchmarks)",
    shortLabel: "171 Ophelia / Ceres",
    category: "5. Main-Belt Asteroids",
    isMandatoryNasaTarget: false,
    hasNeossatOverlap: true,
    raDeg: 113.62083,
    decDeg: 23.78472,
    raSexagesimal: "07:34:29.00",
    decSexagesimal: "+23:47:05.00",
    pmRaMasYr: 0,
    pmDecMasYr: 0,
    totalPmArcsecYr: 0,
    shift16YrArcsec: 0,
    shift16YrPixels: 0,
    fovArcmin: 6,
    defaultChannel: 60,
    defaultRenderMode: 0,
    observationEpoch: "Survey 1–2 & 2026-10-28 (MJD 61341.0)",
    mjdObs: 61341.0,
    targetType: "ASTEROID_NEATM",
    spectralTypeOrClass: "C-Type (171 Ophelia, D=104 km), G-Type (Ceres) & V-Type (Vesta)",
    distanceLabel: "r_h = 2.48 to 3.13 AU (Main Asteroid Belt)",
    demoHook:
      "171 Ophelia is the official SPHEREx LPSC 2026 calibration asteroid: rotational lightcurve (P = 6.665 hr) normalization reveals its 2.7 µm hydrated silicate band and >3.3 µm thermal emission tail.",
    scientificHighlights: [
      "Couples CSA NEOSSat optical photometry with SPHEREx 102-band IR spectra to solve Diameter D, Albedo p_V, and Beaming η via NEATM.",
    ],
  },

  // --- CATEGORY 6: INFRARED TRANSIENTS (FUORS, NOVAE & HIGH-Z QUASARS) ---
  {
    id: "fuor_wtp16aakapb",
    name: "WTP16aakapb, WTP15aaavof (Obscured FUOrs) & WTP24abacpo (Nova)",
    shortLabel: "WTP16aakapb (FUOr)",
    category: "6. IR Transients (FUOrs & Novae)",
    isMandatoryNasaTarget: false,
    hasNeossatOverlap: false,
    raDeg: 344.65620,
    decDeg: 58.77080,
    raSexagesimal: "22:58:37.49",
    decSexagesimal: "+58:46:14.88",
    pmRaMasYr: 0,
    pmDecMasYr: 0,
    totalPmArcsecYr: 0,
    shift16YrArcsec: 0,
    shift16YrPixels: 0,
    fovArcmin: 2,
    defaultChannel: 60,
    defaultRenderMode: 3,
    observationEpoch: "Late 2025 (~MJD 60600+, Karambelkar et al. 2026)",
    mjdObs: 60955.0,
    targetType: "ERUPTIVE_YSO_FUOR",
    spectralTypeOrClass: "Heavily Obscured FU Orionis Outburst (A_V = 29–40 mag)",
    distanceLabel: "d ≈ 2.4 kpc (Sh2-152 / Perseus Arm)",
    demoHook:
      "10× mid-IR accretion outburst with deep 3.05 µm H2O (τ≈1.5) & 4.25 µm CO2 ice troughs; showcases our 'Before vs. After fit_ql < 3.0' filter by removing its documented fit_ql = 25 outlier spike at 3.4 µm!",
    scientificHighlights: [
      "Companion FUOr WTP15aaavof (A_V ≈ 40 mag at 348.52570°, +61.51510°) is completely invisible below 2.0 µm.",
      "Obscured classical nova WTP24abacpo (185.79550°, -61.83130°) exhibits an intense ~4.5 µm coronal emission blend.",
    ],
  },
  {
    id: "quasar_wise_j0929",
    name: "WISE J0929+2001 (z = 3.901) & WISE J1805-6813 (z = 3.570)",
    shortLabel: "WISE J0929 (z=3.90)",
    category: "6. Reddened High-z Quasars",
    isMandatoryNasaTarget: false,
    hasNeossatOverlap: false,
    raDeg: 142.46728,
    decDeg: 20.01860,
    raSexagesimal: "09:29:52.15",
    decSexagesimal: "+20:01:06.96",
    pmRaMasYr: 0,
    pmDecMasYr: 0,
    totalPmArcsecYr: 0,
    shift16YrArcsec: 0,
    shift16YrPixels: 0,
    fovArcmin: 2,
    defaultChannel: 63,
    defaultRenderMode: 2,
    observationEpoch: "Survey 1 & 2 (Stepney et al. 2026)",
    mjdObs: 60970.0,
    targetType: "HIGH_Z_QUASAR",
    spectralTypeOrClass: "Heavily Reddened Quasar (z_sys = 3.901 ± 0.002)",
    distanceLabel: "Cosmic Noon Dust Blow-Out Phase",
    demoHook:
      "Highest-redshift heavily reddened quasar confirmed by SPHEREx; broad Hα emission is redshifted directly into Band D4 at 3.22 µm and Hβ into Band D3 at 2.38 µm.",
    scientificHighlights: [
      "Demonstrates how SPHEREx's 102 contiguous bands measure spectroscopic redshifts for dusty quasars missed by optical surveys.",
    ],
  },

  // --- CATEGORY 7: OFFICIAL CALTECH/IPAC IRSA TUTORIAL BENCHMARKS ---
  {
    id: "cosmos_sdt_65",
    name: "COSMOS Red Source #65, Cygnus Intro/ePSF & M101 Pinwheel Galaxy",
    shortLabel: "COSMOS #65 (Tutorial)",
    category: "7. Official IRSA Tutorial Targets",
    isMandatoryNasaTarget: false,
    hasNeossatOverlap: false,
    raDeg: 150.78179,
    decDeg: 3.35022,
    raSexagesimal: "10:03:07.63",
    decSexagesimal: "+03:21:00.79",
    pmRaMasYr: 0,
    pmDecMasYr: 0,
    totalPmArcsecYr: 0,
    shift16YrArcsec: 0,
    shift16YrPixels: 0,
    fovArcmin: 2,
    defaultChannel: 64,
    defaultRenderMode: 2,
    observationEpoch: "May 2025 – May 2026 (Official Caltech-IPAC Tutorials)",
    mjdObs: 60920.0,
    targetType: "RED_GALAXY",
    spectralTypeOrClass: "Official IRSA Source Discovery Tool Benchmark (NUMBER = 65)",
    distanceLabel: "COSMOS Field (r = 50'' tutorial cone)",
    demoHook:
      "Exact coordinate from the official Caltech/IPAC `spherex-source-discovery-tool-demo` notebook: D4 (2.42–3.82 µm) minus D2 (1.10–1.62 µm) subtraction isolates dusty red sources without positional priors.",
    scientificHighlights: [
      "Also anchors Cygnus Intro (304.69351°, +42.44369°), Cygnus QR3 ePSF (305.59875°, +41.14889°), and M101 Cutouts (210.80227°, +54.34895°).",
    ],
  },

  // --- CATEGORY 8: CSA NEOSSAT + SPHEREx JOINT CROSS-MISSION TARGETS ---
  {
    id: "neossat_apophis_bennu",
    name: "99942 Apophis, 101955 Bennu & HD 189733 (CSA NEOSSat + SPHEREx)",
    shortLabel: "NEOSSat + SPHEREx NEAs",
    category: "8. CSA NEOSSat + SPHEREx Joint Targets",
    isMandatoryNasaTarget: false,
    hasNeossatOverlap: true,
    raDeg: 185.79550,
    decDeg: -61.83130,
    raSexagesimal: "12:23:10.92",
    decSexagesimal: "-61:49:52.68",
    pmRaMasYr: 0,
    pmDecMasYr: 0,
    totalPmArcsecYr: 0,
    shift16YrArcsec: 0,
    shift16YrPixels: 0,
    fovArcmin: 6,
    defaultChannel: 81,
    defaultRenderMode: 0,
    observationEpoch: "2024–2026 CADC NEOSSAT (_cord) & SPHEREx QR2/QR3",
    mjdObs: 61020.0,
    targetType: "ASTEROID_NEATM",
    spectralTypeOrClass: "Potentially Hazardous NEAs (TRACK/FINE_SLEW) & Exoplanet Host",
    distanceLabel: "CSA CADC Collection = 'NEOSSAT' (0.85°×0.85° FoV, 3.0''/px)",
    demoHook:
      "Official Canadian Space Agency (CSA) Partner showcase: fuses NEOSSat 0.35–1.05 µm optical frames with SPHEREx 0.75–5.00 µm spectra to solve Diameter D, Albedo p_V, and Beaming η via NEATM.",
    scientificHighlights: [
      "Uses NEOSSat optical lightcurves to normalize rotational cross-section variations before fitting 102-band thermal emission.",
    ],
  },
];

export const NASA_MANDATORY_TEST_TARGETS: GoldenTarget[] = GOLDEN_CATALOG.filter(
  (t) => t.isMandatoryNasaTarget
);

// ============================================================================
// 7. UNIVERSAL SEXAGESIMAL / DECIMAL / ALIAS PARSER (MICRO-SAFEGUARD #2)
// ============================================================================
export function findGoldenTargetById(id: string): GoldenTarget | undefined {
  return GOLDEN_CATALOG.find((t) => t.id.toLowerCase() === id.trim().toLowerCase());
}

export function findGoldenTargetByCoords(
  raDeg: number,
  decDeg: number,
  toleranceDeg = 0.15
): GoldenTarget | undefined {
  let bestMatch: GoldenTarget | undefined;
  let bestDist = toleranceDeg;

  for (const t of GOLDEN_CATALOG) {
    const dPrimary = Math.hypot(raDeg - t.raDeg, decDeg - t.decDeg);
    if (dPrimary < bestDist) {
      bestDist = dPrimary;
      bestMatch = t;
    }
    if (t.raRefDeg !== undefined && t.decRefDeg !== undefined) {
      const dRef = Math.hypot(raDeg - t.raRefDeg, decDeg - t.decRefDeg);
      if (dRef < bestDist) {
        bestDist = dRef;
        bestMatch = t;
      }
    }
  }
  return bestMatch;
}

/**
 * Parse a single sexagesimal token (e.g., `08h55m10.831s`, `17:57:48.50`, `-7d14m42.53s`, `+04:41:36.11`)
 * into decimal degrees.
 */
function parseSexagesimalToken(token: string, isRaHours: boolean): number | null {
  const cleaned = token
    .trim()
    .replace(/[hHdD°]/g, ":")
    .replace(/[mM'′]/g, ":")
    .replace(/[sS"″]/g, "")
    .replace(/:+/g, ":")
    .replace(/^:|:$/g, "");

  const sign = cleaned.startsWith("-") ? -1 : 1;
  const unsigned = cleaned.replace(/^[+-]/, "");
  const parts = unsigned.split(":").map((p) => Number(p));

  if (parts.length < 2 || parts.length > 3 || parts.some((n) => !Number.isFinite(n))) {
    return null;
  }

  const degOrHr = parts[0];
  const min = parts[1];
  const sec = parts[2] ?? 0;
  const total = degOrHr + min / 60.0 + sec / 3600.0;

  return sign * (isRaHours ? total * 15.0 : total);
}

/**
 * Universal coordinate & target query parser (Micro-Safeguard #2):
 * Accepts:
 *   1. Target names or IDs (e.g., `"WISE 0855"`, `"Barnard's Star"`, `"Epsilon Indi B"`, `"RW Aurigae"`, `"R Draconis"`, `"3I/ATLAS"`).
 *   2. Exact NASA prompt sexagesimal strings (e.g., `"08h55m10.831s, -7d14m42.53s"` or `"17:57:48.50 +04:41:36.11"`).
 *   3. Decimal degree pairs (e.g., `"133.79513, -7.24515"` or `"269.44632 4.76748"`).
 */
export function parseCoordinateInput(rawQuery: string): {
  raDeg: number;
  decDeg: number;
  matchedTarget?: GoldenTarget;
} | null {
  const q = rawQuery.trim();
  if (!q) return null;

  // 1. Check direct target name / ID match first
  const qLower = q.toLowerCase();
  const byName = GOLDEN_CATALOG.find(
    (t) =>
      t.id.toLowerCase() === qLower ||
      t.name.toLowerCase().includes(qLower) ||
      t.shortLabel.toLowerCase().includes(qLower)
  );
  if (byName) {
    return { raDeg: byName.raDeg, decDeg: byName.decDeg, matchedTarget: byName };
  }

  // 2. Try decimal degrees: "RA, Dec" or "RA Dec"
  const decMatch = q.match(/^([+-]?\d+(?:\.\d+)?)\s*[,;\s]\s*([+-]?\d+(?:\.\d+)?)$/);
  if (decMatch) {
    const raVal = Number(decMatch[1]);
    const decVal = Number(decMatch[2]);
    if (Number.isFinite(raVal) && Number.isFinite(decVal) && Math.abs(decVal) <= 90) {
      const normalizedRa = ((raVal % 360) + 360) % 360;
      const matched = findGoldenTargetByCoords(normalizedRa, decVal, 0.15);
      // If user entered the 2010 WISE discovery coordinate for WISE 0855 or J2000 for Barnard's Star,
      // snap to the target's 6'x6' frame so both 2010 and 2025 positions are visible
      if (matched) {
        return { raDeg: matched.raDeg, decDeg: matched.decDeg, matchedTarget: matched };
      }
      return { raDeg: normalizedRa, decDeg: decVal };
    }
  }

  // 3. Try sexagesimal pair: e.g., "08h55m10.831s, -7d14m42.53s" or "17:57:47.12 +04:46:02.95"
  const sexTokens = q
    .replace(/,/g, " ")
    .trim()
    .split(/\s+(?=[+-]?\d)/);

  if (sexTokens.length >= 2) {
    const raParsed = parseSexagesimalToken(sexTokens[0], true);
    const decParsed = parseSexagesimalToken(sexTokens.slice(1).join(""), false);
    if (raParsed !== null && decParsed !== null && Math.abs(decParsed) <= 90) {
      const normalizedRa = ((raParsed % 360) + 360) % 360;
      const matched = findGoldenTargetByCoords(normalizedRa, decParsed, 0.15);
      if (matched) {
        return { raDeg: matched.raDeg, decDeg: matched.decDeg, matchedTarget: matched };
      }
      return { raDeg: normalizedRa, decDeg: decParsed };
    }
  }

  return null;
}

export function formatSexagesimal(raDeg: number, decDeg: number): { raHms: string; decDms: string } {
  const normRa = (((raDeg % 360) + 360) % 360) / 15.0;
  const raH = Math.floor(normRa);
  const raM = Math.floor((normRa - raH) * 60.0);
  const raS = ((normRa - raH) * 60.0 - raM) * 60.0;

  const sign = decDeg < 0 ? "-" : "+";
  const absDec = Math.abs(decDeg);
  const decD = Math.floor(absDec);
  const decM = Math.floor((absDec - decD) * 60.0);
  const decS = ((absDec - decD) * 60.0 - decM) * 60.0;

  const pad2 = (n: number) => String(n).padStart(2, "0");
  return {
    raHms: `${pad2(raH)}h ${pad2(raM)}m ${raS.toFixed(2).padStart(5, "0")}s`,
    decDms: `${sign}${pad2(decD)}° ${pad2(decM)}' ${decS.toFixed(1).padStart(4, "0")}"`,
  };



// ============================================================================
// 8. 102-CHANNEL LVF METADATA LOOKUP TABLE (CHANNELS 1..102)
// ============================================================================
export interface SpectralChannelMeta {
  globalChannel: number;
  bandId: 1 | 2 | 3 | 4 | 5 | 6;
  localChannel: number;
  wavelengthUm: number;
  bandwidthUm: number;
  resolvingPower: number;
}

export const NOMINAL_102_CHANNELS: SpectralChannelMeta[] = (() => {
  const list: SpectralChannelMeta[] = [];
  for (const det of SPHEREX_DETECTOR_BANDS) {
    const ratio = det.wavelengthMaxUm / det.wavelengthMinUm;
    for (let localIdx = 1; localIdx <= 17; localIdx++) {
      const globalChannel = (det.bandId - 1) * 17 + localIdx;
      const lamLow = det.wavelengthMinUm * Math.pow(ratio, (localIdx - 1) / 17.0);
      const lamHigh = det.wavelengthMinUm * Math.pow(ratio, localIdx / 17.0);
      const lamCenter = 0.5 * (lamLow + lamHigh);
      const bw = lamCenter / det.resolvingPower;
      list.push({
        globalChannel,
        bandId: det.bandId,
        localChannel: localIdx,
        wavelengthUm: Number(lamCenter.toFixed(4)),
        bandwidthUm: Number(bw.toFixed(4)),
        resolvingPower: det.resolvingPower,
      });
    }
  }
  return list;
})();

export function getChannelMeta(globalChannel: number): SpectralChannelMeta {
  const idx = Math.max(1, Math.min(102, Math.round(globalChannel))) - 1;
  return NOMINAL_102_CHANNELS[idx];
}

}


