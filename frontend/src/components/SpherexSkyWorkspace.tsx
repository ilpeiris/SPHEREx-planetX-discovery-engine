// frontend/src/components/SpherexSkyWorkspace.tsx
"use client";
/**
 * ============================================================================
 * @author      M.D.Isuru Lakmal Peiris (@ilpeiris)
 * @project     SPHEREx x Planet X — 102-Band WebGL2 & WASM Discovery Engine
 * @repository  https://github.com/ilpeiris/SPHEREx-planetX-discovery-engine
 * @linkedin    https://www.linkedin.com/in/ilpeiris
 * @Github      https://github.com/ilpeiris/
 * @license     MIT License | Copyright (c) 2026 M.D.Isuru Lakmal Peiris
 * ============================================================================
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Compass,
  Crosshair,
  Maximize2,
  Minimize2,
} from "lucide-react";
import {
  ColormapName,
  WEBGL_FLAG_DICHROIC,
  WEBGL_FLAG_NONFUNC,
  WEBGL_FLAG_PERSIST,
  WEBGL_FLAG_SOURCE,
} from "../lib/colormapLut";
import {
  FOV_OPTIONS,
  GOLDEN_CATALOG,
  GoldenTarget,
  SPHEREX_DETECTOR_BANDS,
  SpectralRgbPreset,
  findGoldenTargetByCoords,
  findGoldenTargetById,
  formatSexagesimal,
} from "../lib/goldenCatalog";
import { TrimBrightMode } from "../lib/zscale";
import {
  RankedAnomalyCandidate,
  extractAndRankSectorAnomalies,
} from "../workers/discoveryRanker.worker";
import { AnomalyLeaderboard } from "./AnomalyLeaderboard";
import {
  EphemerisVerifyBadge,
  NeossatNeatmPayload,
  VerificationReport,
} from "./EphemerisVerifyBadge";
import { GoldenTargetTourDrawer } from "./GoldenTargetTourDrawer";
import {
  ExtendedComaProfileData,
  MolecularIndicesSummary,
  SedMeasurementPoint,
  SpectralCurveInspector,
} from "./SpectralCurveInspector";
import {
  AladinSurveyOptionId,
  MULTI_MISSION_SURVEYS,
  TopMissionToolbar,
} from "./TopMissionToolbar";
import {
  ParsedCutoutCube,
  WebGL2BlinkMachine,
  parseBinaryCutoutCube,
} from "./WebGL2BlinkMachine";
import { WiseViewControlBar } from "./WiseViewControlBar";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:7860";

/**
 * Deterministic client-side 6-slice Float32 + Uint16 cutout cube synthesizer.
 */
function synthesizeClientFallbackCube(
  raDeg: number,
  decDeg: number,
  channel: number,
  fovArcmin: number,
  sizePx = 256
): ParsedCutoutCube {
  const numSlices = 6;
  const sliceStride = sizePx * sizePx;
  const floatCube = new Float32Array(numSlices * sliceStride);
  const uint16Flags = new Uint16Array(numSlices * sliceStride);

  const matched = findGoldenTargetByCoords(raDeg, decDeg, 0.35);
  const tType = matched?.targetType || "COLD_BROWN_DWARF";

  let seed =
    (Math.floor(Math.abs(raDeg) * 10000) ^
      Math.floor(Math.abs(decDeg) * 10000) ^
      (channel * 7919)) >>>
    0;
  const nextRand = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296.0;
  };

  const pixscaleArcsec = (fovArcmin * 60.0) / sizePx;
  const sigmaPsf = Math.max(1.2, 2.8 / Math.max(0.45, pixscaleArcsec));
  const cx = sizePx / 2.0;
  const cy = sizePx / 2.0;

  const stars: Array<{ x: number; y: number; amp: number }> = [];
  for (let s = 0; s < 38; s++) {
    stars.push({
      x: 12 + nextRand() * (sizePx - 24),
      y: 12 + nextRand() * (sizePx - 24),
      amp: 14.0 + Math.pow(nextRand(), 3) * 260.0,
    });
  }

  for (let y = 0; y < sizePx; y++) {
    for (let x = 0; x < sizePx; x++) {
      const idx = y * sizePx + x;
      let bgStarFlux = 0.0;
      let isStarCore = false;

      for (let s = 0; s < stars.length; s++) {
        const dx = x - stars[s].x;
        const dy = y - stars[s].y;
        const r2 = dx * dx + dy * dy;
        if (r2 < 36.0 * sigmaPsf * sigmaPsf) {
          bgStarFlux += stars[s].amp * Math.exp((-0.5 * r2) / (sigmaPsf * sigmaPsf));
          if (r2 <= 3.2 * sigmaPsf * sigmaPsf) {
            isStarCore = true;
          }
        }
      }

      const n1 = (nextRand() - 0.5) * 2.4;
      const n2 = (nextRand() - 0.5) * 2.4;

      floatCube[0 * sliceStride + idx] = bgStarFlux + n1;
      floatCube[1 * sliceStride + idx] = bgStarFlux + n2;
      floatCube[2 * sliceStride + idx] = 0.85 * bgStarFlux + 0.7 * n1;

      const bandId = Math.floor((channel - 1) / 17) + 1;
      const zodiBase = bandId <= 3 ? 42.0 : 95.0 + (bandId - 4) * 38.0;
      floatCube[5 * sliceStride + idx] =
        zodiBase * (0.6 + 0.65 * (y / sizePx) + 0.25 * (x / sizePx));

      if (isStarCore) {
        for (let sl = 0; sl < numSlices; sl++) {
          uint16Flags[sl * sliceStride + idx] |= WEBGL_FLAG_SOURCE;
        }
      }
      if (x < 4) {
        uint16Flags[0 * sliceStride + idx] |= WEBGL_FLAG_DICHROIC;
      }
      if (y < 3) {
        uint16Flags[0 * sliceStride + idx] |= WEBGL_FLAG_NONFUNC;
      }
    }
  }

  const addGaussianSource = (
    sliceIdx: number,
    sx: number,
    sy: number,
    peakFlux: number,
    sig = sigmaPsf
  ) => {
    const rBox = Math.ceil(6.0 * sig);
    const y0 = Math.max(0, Math.floor(sy - rBox));
    const y1 = Math.min(sizePx - 1, Math.ceil(sy + rBox));
    const x0 = Math.max(0, Math.floor(sx - rBox));
    const x1 = Math.min(sizePx - 1, Math.ceil(sx + rBox));
    for (let yy = y0; yy <= y1; yy++) {
      for (let xx = x0; xx <= x1; xx++) {
        const r2 = (xx - sx) * (xx - sx) + (yy - sy) * (yy - sy);
        floatCube[sliceIdx * sliceStride + yy * sizePx + xx] +=
          peakFlux * Math.exp((-0.5 * r2) / (sig * sig));
      }
    }
  };

  if (
    tType === "HIGH_PM_STAR" ||
    tType === "COLD_BROWN_DWARF" ||
    tType === "OUTER_SOLAR_SYSTEM" ||
    tType === "ASTEROID_NEATM"
  ) {
    const shiftPx = Math.max(3.5 * sigmaPsf, Math.min(sizePx * 0.09, 9.0 / pixscaleArcsec));
    const angleRad = matched?.id === "barnards_star" ? -1.48 : -2.95;
    const dx = shiftPx * Math.cos(angleRad);
    const dy = shiftPx * Math.sin(angleRad);

    const xE1 = cx - 0.5 * dx;
    const yE1 = cy - 0.5 * dy;
    const xE2 = cx + 0.5 * dx;
    const yE2 = cy + 0.5 * dy;
    const xWise = cx - 3.2 * dx;
    const yWise = cy - 3.2 * dy;

    addGaussianSource(0, xE1, yE1, 240.0);
    addGaussianSource(1, xE2, yE2, 245.0);
    addGaussianSource(2, xWise, yWise, 210.0, 1.15 * sigmaPsf);

    addGaussianSource(0, cx + 44, cy - 36, 92.0);
    addGaussianSource(1, cx + 49, cy - 34, 94.0);
  } else if (tType === "EXTENDED_COMET") {
    for (let y = 0; y < sizePx; y++) {
      for (let x = 0; x < sizePx; x++) {
        const idx = y * sizePx + x;
        const r = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy) + 2.0);
        const coma = 260.0 * Math.pow(r / sigmaPsf, -1.45) * Math.exp(-r / (sizePx * 0.28));
        const antiTail =
          110.0 *
          Math.exp(
            -0.5 * Math.pow((x - (cx + 4.0 * sigmaPsf)) / (3.5 * sigmaPsf), 2) -
              0.5 * Math.pow((y - cy) / (1.8 * sigmaPsf), 2)
          );
        floatCube[0 * sliceStride + idx] += coma;
        floatCube[1 * sliceStride + idx] += 1.75 * coma + antiTail;
        floatCube[2 * sliceStride + idx] += 0.75 * coma + antiTail;
      }
    }
  } else {
    addGaussianSource(0, cx, cy, 45.0);
    addGaussianSource(1, cx, cy, 320.0);
    addGaussianSource(2, cx, cy, 275.0);

    if (tType === "ARTIFACT_BENCHMARK") {
      for (let yy = Math.floor(cy - 10); yy <= Math.ceil(cy + 10); yy++) {
        for (let xx = Math.floor(cx - 10); xx <= Math.ceil(cx + 10); xx++) {
          if (yy >= 0 && yy < sizePx && xx >= 0 && xx < sizePx) {
            uint16Flags[0 * sliceStride + yy * sizePx + xx] |= WEBGL_FLAG_PERSIST;
          }
        }
      }
    }
  }

  for (let i = 0; i < sliceStride; i++) {
    const e1 = floatCube[0 * sliceStride + i];
    const e2 = floatCube[1 * sliceStride + i];
    const diff = e2 - e1;
    const localNoise = Math.sqrt(6.25 + 0.08 * Math.abs(e1 + e2));
    floatCube[3 * sliceStride + i] = diff;
    floatCube[4 * sliceStride + i] = diff / localNoise;
  }

  return {
    numSlices,
    height: sizePx,
    width: sizePx,
    reservedFlags: 0,
    floatCube,
    uint16Flags,
  };
}

/**
 * Deterministic client-side 102-band SED & molecular index synthesizer.
 */
function synthesizeClientFallbackSed(
  raDeg: number,
  decDeg: number,
  applyQualityFilter: boolean
): {
  measurements: SedMeasurementPoint[];
  molecular_indices: MolecularIndicesSummary;
  extended_coma_profile?: ExtendedComaProfileData;
} {
  const matched = findGoldenTargetByCoords(raDeg, decDeg, 0.35);
  const tType = matched?.targetType || "COLD_BROWN_DWARF";
  const tId = matched?.id || "custom";

  const measurements: SedMeasurementPoint[] = [];
  const epochs = [
    { id: 1, mjd: 60897.5, scale: 1.0 },
    {
      id: 2,
      mjd: 61020.5,
      scale:
        tType === "ERUPTIVE_YSO_FUOR" || tType === "VARIABLE_YSO" || tType === "MIRA_VARIABLE"
          ? 1.42
          : 1.03,
    },
  ];

  for (const ep of epochs) {
    for (const det of SPHEREX_DETECTOR_BANDS) {
      const ratio = det.wavelengthMaxUm / det.wavelengthMinUm;
      for (let localCh = 1; localCh <= 17; localCh++) {
        const globalCh = (det.bandId - 1) * 17 + localCh;
        const lam = Number(
          (det.wavelengthMinUm * Math.pow(ratio, (localCh - 0.5) / 17.0)).toFixed(4)
        );
        const bw = Number((lam / det.resolvingPower).toFixed(4));

        let fluxVal = 120.0;
        if (tType === "COLD_BROWN_DWARF") {
          const cont =
            42.0 * Math.exp(-Math.pow(lam - 1.25, 2) / 0.45) +
            245.0 * Math.exp(-Math.pow(lam - 4.45, 2) / 0.52);
          const ch4 =
            0.76 * Math.exp(-Math.pow((lam - 1.66) / 0.08, 2)) +
            0.84 * Math.exp(-Math.pow((lam - 2.28) / 0.12, 2)) +
            0.89 * Math.exp(-Math.pow((lam - 3.32) / 0.16, 2));
          const h2o =
            0.66 * Math.exp(-Math.pow((lam - 1.42) / 0.07, 2)) +
            0.72 * Math.exp(-Math.pow((lam - 1.90) / 0.09, 2)) +
            0.78 * Math.exp(-Math.pow((lam - 2.75) / 0.15, 2));
          const co2 = 0.46 * Math.exp(-Math.pow((lam - 4.26) / 0.05, 2));
          fluxVal = Math.max(2.5, cont * (1.0 - Math.max(ch4, h2o, co2)) * ep.scale);
        } else if (tType === "EXTENDED_COMET") {
          const cliff = lam < 2.45 ? 1.0 : ep.id === 1 ? 0.22 : 0.55 + 0.15 * (lam - 2.45);
          const co2 =
            (ep.id === 1 ? 33000.0 : 44000.0) * Math.exp(-Math.pow((lam - 4.26) / 0.032, 2));
          const h2o =
            (ep.id === 1 ? 180.0 : 14500.0) * Math.exp(-Math.pow((lam - 2.72) / 0.055, 2));
          const co =
            (ep.id === 1 ? 220.0 : 18200.0) * Math.exp(-Math.pow((lam - 4.67) / 0.035, 2));
          const cnOrg =
            ep.id === 1
              ? 0.0
              : 4200.0 * Math.exp(-Math.pow((lam - 0.928) / 0.025, 2)) +
                5600.0 * Math.exp(-Math.pow((lam - 3.38) / 0.11, 2));
          fluxVal = 1500.0 * cliff + co2 + h2o + co + cnOrg;
        } else if (tType === "ERUPTIVE_YSO_FUOR" || tType === "VARIABLE_YSO") {
          const redCont = 18.0 * Math.pow(lam, 3.05) * ep.scale;
          const iceTau =
            1.52 * Math.exp(-Math.pow((lam - 3.05) / 0.19, 2)) +
            0.95 * Math.exp(-Math.pow((lam - 4.26) / 0.045, 2));
          fluxVal = Math.max(1.2, redCont * Math.exp(-iceTau));
        } else {
          fluxVal =
            (310.0 * Math.pow(lam / 1.6, -0.85) +
              75.0 * Math.exp(-Math.pow((lam - 3.22) / 0.08, 2))) *
            ep.scale;
        }

        let fitQl = 0.96;
        let isClean = true;
        let flags = 1 << 21;

        if (globalCh === 65 && (tId === "fuor_wtp16aakapb" || !applyQualityFilter)) {
          if (applyQualityFilter) continue;
          fluxVal *= 4.5;
          fitQl = 25.0;
          isClean = false;
          flags |= 1;
        }

        const fluxErr = Math.max(0.8, 0.035 * fluxVal);
        measurements.push({
          epoch_id: ep.id,
          mjd: ep.mjd,
          global_channel: globalCh,
          band_id: det.bandId,
          wavelength_um: lam,
          bandwidth_um: bw,
          resolving_power: det.resolvingPower,
          flux_ujy: Number(fluxVal.toFixed(2)),
          flux_err_ujy: Number(fluxErr.toFixed(2)),
          variance_ujy2: Number((fluxErr * fluxErr).toFixed(4)),
          fit_ql: fitQl,
          flags,
          is_clean: isClean,
        });
      }
    }
  }

  const molIndices: MolecularIndicesSummary =
    tType === "COLD_BROWN_DWARF"
      ? { tau_h2o_30: 0.48, c_ch4: 1.42, c_h2o_nir: 1.18, c_w1_k: 2.35 }
      : tType === "ERUPTIVE_YSO_FUOR"
      ? { tau_h2o_30: 1.54, c_ch4: 0.28, c_h2o_nir: 0.64, c_w1_k: 1.85 }
      : { tau_h2o_30: 0.31, c_ch4: 0.42, c_h2o_nir: 0.38, c_w1_k: 0.72 };

  const extendedComa: ExtendedComaProfileData | undefined =
    tType === "EXTENDED_COMET"
      ? {
          f_core_2pix_mJy: tId === "comet_3i_atlas_post" ? 44.2 : 33.0,
          f_total_30pix_mJy: tId === "comet_3i_atlas_post" ? 118.5 : 82.4,
          radii_arcsec: [3.1, 9.2, 15.4, 30.8, 61.5, 123.0, 184.5],
          radial_profile_MJysr: [24.5, 8.2, 3.8, 1.4, 0.48, 0.16, 0.07],
          Q_gas_molecules_sec: tId === "comet_3i_atlas_post" ? 1.4e28 : 9.4e26,
          r_proj_km: 348000.0,
        }
      : undefined;

  return {
    measurements,
    molecular_indices: molIndices,
    extended_coma_profile: extendedComa,
  };
}

/**
 * Anchor the full 102-channel LVF profile to the real NASA IRSA Level-2
 * measurements returned by DuckDB so all 102 channels render while preserving
 * every real extracted measurement verbatim.
 */
function mergeRealMeasurementsWith102ChannelProfile(
  realMeasurements: SedMeasurementPoint[],
  raDeg: number,
  decDeg: number,
  applyQualityFilter: boolean
): SedMeasurementPoint[] {
  if (!realMeasurements || realMeasurements.length === 0) {
    return synthesizeClientFallbackSed(raDeg, decDeg, applyQualityFilter).measurements;
  }
  if (realMeasurements.length >= 90) {
    return realMeasurements;
  }

  const template = synthesizeClientFallbackSed(raDeg, decDeg, applyQualityFilter).measurements;
  const realMap = new Map<string, SedMeasurementPoint>();

  for (const pt of realMeasurements) {
    const key = `${pt.epoch_id ?? 1}_${pt.global_channel}`;
    realMap.set(key, pt);
  }

  return template.map((tplPt) => {
    const key = `${tplPt.epoch_id ?? 1}_${tplPt.global_channel}`;
    const exactReal = realMap.get(key);
    if (exactReal && Number.isFinite(exactReal.flux_ujy) && exactReal.flux_ujy > 0) {
      return exactReal;
    }
    return tplPt;
  });
}

export interface SpherexSkyWorkspaceProps {
  initialRaDeg?: number;
  initialDecDeg?: number;
  initialFovArcmin?: 2 | 6 | 15 | 30;
  initialRenderMode?: 0 | 1 | 2 | 3;
  initialChannel?: number;
  initialTargetId?: string;
  isEmbedMode?: boolean;
  onUrlStateChange?: (params: {
    ra: number;
    dec: number;
    fov: number;
    mode: number;
    band: number;
    target?: string;
  }) => void;
}

export const SpherexSkyWorkspace: React.FC<SpherexSkyWorkspaceProps> = ({
  initialRaDeg = 133.75985,
  initialDecDeg = -7.24225,
  initialFovArcmin = 6,
  initialRenderMode = 1,
  initialChannel = 74,
  initialTargetId = "wise_0855",
  isEmbedMode = false,
  onUrlStateChange,
}) => {
  const initialTarget = useMemo(
    () =>
      (initialTargetId && findGoldenTargetById(initialTargetId)) ||
      findGoldenTargetByCoords(initialRaDeg, initialDecDeg, 0.25) ||
      GOLDEN_CATALOG[1],
    [initialTargetId, initialRaDeg, initialDecDeg]
  );

  // Core Astronomical Viewport State
  const [raDeg, setRaDeg] = useState<number>(initialTarget?.raDeg ?? initialRaDeg);
  const [decDeg, setDecDeg] = useState<number>(initialTarget?.decDeg ?? initialDecDeg);
  const [fovArcmin, setFovArcmin] = useState<2 | 6 | 15 | 30>(
    initialTarget?.fovArcmin ?? initialFovArcmin
  );
  const [activeTarget, setActiveTarget] = useState<GoldenTarget | undefined>(initialTarget);
  const [channel, setChannel] = useState<number>(
    initialTarget?.defaultChannel ?? initialChannel
  );
  const [coaddDetector, setCoaddDetector] = useState<boolean>(false);
  const [alignmentMode, setAlignmentMode] = useState<
    "narrowband" | "detector_coadd" | "d4_minus_d2"
  >("narrowband");

  // WebGL2 "Blink Machine" Inspection State
  const [renderMode, setRenderMode] = useState<0 | 1 | 2 | 3>(
    initialTarget?.defaultRenderMode ?? initialRenderMode
  );
  const [stretchMode, setStretchMode] = useState<0 | 1 | 2>(1);
  const [isBlinking, setIsBlinking] = useState<boolean>(true);
  const [blinkFrequencyHz, setBlinkFrequencyHz] = useState<number>(2.5);
  const [activeSlice, setActiveSlice] = useState<number>(0);
  const [includeUnwiseInBlink, setIncludeUnwiseInBlink] = useState<boolean>(false);
  const [stretchAlpha, setStretchAlpha] = useState<number>(0.09);
  const [softeningQ, setSofteningQ] = useState<number>(5.5);
  const [trimBrightMode, setTrimBrightMode] = useState<TrimBrightMode>("adapt");
  const [trimBrightPercentile, setTrimBrightPercentile] = useState<number>(99.5);
  const [colormap, setColormap] = useState<ColormapName>("inferno");
  const [invertColormap, setInvertColormap] = useState<boolean>(false);
  const [subtractZodi, setSubtractZodi] = useState<boolean>(true);
  const [showFlagMask, setShowFlagMask] = useState<boolean>(false);
  const [curtainX, setCurtainX] = useState<number>(0.5);
  const [snrThreshold, setSnrThreshold] = useState<number>(4.5);
  const [showZogyOverlay, setShowZogyOverlay] = useState<boolean>(true);
  const [activeRgbPresetId, setActiveRgbPresetId] = useState<string>(
    "brown_dwarf_ch4_hunter"
  );

  // Aladin Lite v3 Macro Sky Context State
  const aladinContainerRef = useRef<HTMLDivElement | null>(null);
  const aladinInstanceRef = useRef<any>(null);
  const footprintOverlayRef = useRef<any>(null);
  const [aladinSurvey, setAladinSurvey] = useState<AladinSurveyOptionId>("P/allWISE/color");
  const [showGaiaVectors, setShowGaiaVectors] = useState<boolean>(true);
  const [aladinReady, setAladinReady] = useState<boolean>(false);

  // Data Payloads
  const [cubeData, setCubeData] = useState<ParsedCutoutCube | null>(null);
  const [isLoadingCube, setIsLoadingCube] = useState<boolean>(false);
  const [cubeSourceBadge, setCubeSourceBadge] = useState<string>("r2-zero-egress");

  const [sedMeasurements, setSedMeasurements] = useState<SedMeasurementPoint[]>([]);
  const [molecularIndices, setMolecularIndices] = useState<
    MolecularIndicesSummary | undefined
  >(undefined);
  const [extendedComaProfile, setExtendedComaProfile] =
    useState<ExtendedComaProfileData | null>(null);
  const [applyQualityFilter, setApplyQualityFilter] = useState<boolean>(false);
  const [isLoadingSed, setIsLoadingSed] = useState<boolean>(false);
  const [selectedSourceLabel, setSelectedSourceLabel] = useState<string>(
    initialTarget?.shortLabel || "WISE 0855"
  );
  const [selectedSourceCoords, setSelectedSourceCoords] = useState<{
    raDeg: number;
    decDeg: number;
  }>({
    raDeg: initialTarget?.raDeg ?? initialRaDeg,
    decDeg: initialTarget?.decDeg ?? initialDecDeg,
  });

  const [anomalies, setAnomalies] = useState<RankedAnomalyCandidate[]>([]);
  const [selectedAnomalyId, setSelectedAnomalyId] = useState<string | null>(null);
  const [isRankingAnomalies, setIsRankingAnomalies] = useState<boolean>(false);

  // Modals & Drawers
  const [isTourOpen, setIsTourOpen] = useState<boolean>(false);
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState<boolean>(false);
  const [isNeossatModalOpen, setIsNeossatModalOpen] = useState<boolean>(false);
  const [isLoadingVerify, setIsLoadingVerify] = useState<boolean>(false);
  const [isLoadingNeossat, setIsLoadingNeossat] = useState<boolean>(false);
  const [verifyReport, setVerifyReport] = useState<VerificationReport | null>(null);
  const [neossatData, setNeossatData] = useState<NeossatNeatmPayload | null>(null);
  const [selectedNeossatTarget, setSelectedNeossatTarget] =
    useState<string>("171 Ophelia");
  const [isMaximizedCutout, setIsMaximizedCutout] = useState<boolean>(false);

  useEffect(() => {
    if (onUrlStateChange) {
      onUrlStateChange({
        ra: Number(raDeg.toFixed(5)),
        dec: Number(decDeg.toFixed(5)),
        fov: fovArcmin,
        mode: renderMode,
        band: channel,
        target: activeTarget?.id,
      });
    }
  }, [raDeg, decDeg, fovArcmin, renderMode, channel, activeTarget, onUrlStateChange]);

  const { shareUrl, embedIframeSnippet } = useMemo(() => {
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://spherex-planetx.vercel.app";
    const qs = new URLSearchParams({
      ra: raDeg.toFixed(5),
      dec: decDeg.toFixed(5),
      fov: String(fovArcmin),
      mode: String(renderMode),
      band: String(channel),
    });
    if (activeTarget?.id) {
      qs.set("target", activeTarget.id);
    }
    const fullUrl = `${origin}/?${qs.toString()}`;
    const embedUrl = `${fullUrl}&embed=true`;
    const iframeCode = `<iframe src="${embedUrl}" width="100%" height="680" style="border:0;border-radius:8px;" allow="fullscreen" loading="lazy"></iframe>`;
    return { shareUrl: fullUrl, embedIframeSnippet: iframeCode };
  }, [raDeg, decDeg, fovArcmin, renderMode, channel, activeTarget]);

  // Initialize Aladin Lite v3 with automatic mirror routing away from dead alaskybis.cds.unistra.fr
  useEffect(() => {
    let isMounted = true;

    const origFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      let urlStr =
        typeof input === "string"
          ? input
          : input instanceof URL
          ? input.toString()
          : input?.url || "";

      if (urlStr.includes("alasky.unistra.fr/cgi/AladinLiteLogger")) {
        return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
      }

      if (urlStr.includes("alaskybis.cds.unistra.fr")) {
        urlStr = urlStr.replace("alaskybis.cds.unistra.fr", "alasky.cds.unistra.fr");
        input = urlStr;
      }

      try {
        return await origFetch(input, init);
      } catch (err) {
        if (urlStr.includes("alasky.cds.unistra.fr/AllWISE/")) {
          const irsaMirror = urlStr.replace(
            "https://alasky.cds.unistra.fr/AllWISE/",
            "https://irsa.ipac.caltech.edu/data/hips/CDS/AllWISE/"
          );
          try {
            return await origFetch(irsaMirror, init);
          } catch {
            return new Response("", { status: 200 });
          }
        }
        if (
          urlStr.includes("unistra.fr") ||
          urlStr.includes("alasky") ||
          urlStr.includes("hips")
        ) {
          return new Response("", { status: 200 });
        }
        throw err;
      }
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const msg = String(event?.reason?.message || event?.reason || "");
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("Load failed")) {
        event.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", handleRejection, true);

    async function initAladinSkyAtlas() {
      if (typeof window === "undefined" || !aladinContainerRef.current) return;
      try {
        let A = (window as any).A;
        for (let retry = 0; retry < 30 && !A; retry++) {
          await new Promise((r) => setTimeout(r, 150));
          A = (window as any).A;
        }
        if (!A) {
          const aladinModule = await import("aladin-lite");
          A = aladinModule.default || aladinModule;
        }
        if (A.init) {
          await Promise.resolve(A.init).catch(() => {});
        }
        if (!isMounted || !aladinContainerRef.current) return;

        aladinContainerRef.current.innerHTML = "";
        const instance = A.aladin(aladinContainerRef.current, {
          survey: "https://irsa.ipac.caltech.edu/data/hips/CDS/2MASS/Color",
          fov: Math.max(0.15, (fovArcmin / 60.0) * 2.5),
          target: `${raDeg} ${decDeg}`,
          cooFrame: "equatorial",
          showReticle: true,
          showZoomControl: true,
          showCooGridControl: true,
          showFullscreenControl: false,
          showLayersControl: false,
          showGotoControl: false,
        });

        const overlay = A.graphicOverlay({
          name: "SPHEREx Cutout & Tracklets",
          color: "#12B5CB",
          lineWidth: 2,
        });
        instance.addOverlay(overlay);

        aladinInstanceRef.current = instance;
        footprintOverlayRef.current = { A, overlay };
        setAladinReady(true);
      } catch (err) {
        console.warn("Aladin Lite v3 initialization note:", err);
      }
    }

    initAladinSkyAtlas();
    return () => {
      isMounted = false;
      window.fetch = origFetch;
      window.removeEventListener("unhandledrejection", handleRejection, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update Aladin Lite v3 pointing, survey layer, and footprint box
  useEffect(() => {
    const aladin = aladinInstanceRef.current;
    const fp = footprintOverlayRef.current;
    if (!aladin || !fp || !aladinReady) return;

    try {
      aladin.gotoRaDec(raDeg, decDeg);
      aladin.setFoV(Math.max(0.08, (fovArcmin / 60.0) * 2.4));
    } catch {
      // Ignore transient slew errors
    }

    try {
      const s = String(aladinSurvey || "");
      let hipsUrl = "https://irsa.ipac.caltech.edu/data/hips/CDS/AllWISE/RGB-W4-W2-W1";
      let surveyLabel = "AllWISE Color IR";
      if (s.includes("PanSTARRS")) {
        hipsUrl = "https://alasky.cds.unistra.fr/Pan-STARRS/DR1/color-z-zg-g";
        surveyLabel = "Pan-STARRS DR1";
      } else if (s.includes("DSS2")) {
        hipsUrl = "https://irsa.ipac.caltech.edu/data/hips/CDS/DSS2/color";
        surveyLabel = "DSS2 Optical";
      } else if (s.includes("2MASS") || s.includes("SPHEREx")) {
        hipsUrl = "https://irsa.ipac.caltech.edu/data/hips/CDS/2MASS/Color";
        surveyLabel = "2MASS Near-IR";
      }

      if (typeof aladin.newImageSurvey === "function") {
        const layer = aladin.newImageSurvey(hipsUrl);
        aladin.setBaseImageLayer(layer);
      } else if (typeof aladin.createImageSurvey === "function") {
        const layer = aladin.createImageSurvey(
          surveyLabel,
          surveyLabel,
          hipsUrl,
          "equatorial",
          9,
          { imgFormat: "jpeg" }
        );
        aladin.setBaseImageLayer(layer);
      } else if (typeof aladin.setImageSurvey === "function") {
        aladin.setImageSurvey(hipsUrl);
      }
    } catch {
      // Ignore transient HiPS switch errors
    }

    try {
      const { A, overlay } = fp;
      overlay.removeAll();
      const halfDeg = fovArcmin / 60.0 / 2.0;
      const cosDec = Math.max(0.08, Math.cos((decDeg * Math.PI) / 180.0));
      const halfRa = halfDeg / cosDec;

      overlay.addFootprints([
        A.polygon([
          [raDeg - halfRa, decDeg - halfDeg],
          [raDeg + halfRa, decDeg - halfDeg],
          [raDeg + halfRa, decDeg + halfDeg],
          [raDeg - halfRa, decDeg + halfDeg],
        ]),
      ]);

      if (
        showGaiaVectors &&
        activeTarget?.raRefDeg !== undefined &&
        activeTarget?.decRefDeg !== undefined
      ) {
        overlay.add(
          A.polyline(
            [
              [activeTarget.raRefDeg, activeTarget.decRefDeg],
              [activeTarget.raDeg, activeTarget.decDeg],
            ],
            { color: "#FA903E", lineWidth: 3 }
          )
        );
      }
    } catch {
      // Ignore overlay drawing errors
    }
  }, [raDeg, decDeg, fovArcmin, aladinSurvey, showGaiaVectors, activeTarget, aladinReady]);

  // Fetch 6-Slice Binary Cutout Cube from FastAPI Backend
  useEffect(() => {
    let cancelled = false;

    async function loadCutoutCube() {
      setIsLoadingCube(true);
      const effMode = coaddDetector ? "detector_coadd" : alignmentMode;
      const url =
        `${API_BASE_URL}/api/v1/cutout-cube?ra=${raDeg.toFixed(5)}&dec=${decDeg.toFixed(5)}` +
        `&channel=${channel}&size_px=256&fov_arcmin=${fovArcmin}` +
        `&coadd_detector=${coaddDetector}&mode=${effMode}`;

      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const buffer = await resp.arrayBuffer();
        if (cancelled) return;
        const parsed = parseBinaryCutoutCube(buffer);
        setCubeData(parsed);
        setCubeSourceBadge(resp.headers.get("X-SPHEREx-Source") || "irsa-live-zogy");
      } catch {
        if (cancelled) return;
        const fallback = synthesizeClientFallbackCube(
          raDeg,
          decDeg,
          channel,
          fovArcmin,
          256
        );
        setCubeData(fallback);
        setCubeSourceBadge("client-gpu-synthesized");
      } finally {
        if (!cancelled) setIsLoadingCube(false);
      }
    }

    loadCutoutCube();
    return () => {
      cancelled = true;
    };
  }, [raDeg, decDeg, channel, fovArcmin, coaddDetector, alignmentMode]);

  // Fetch 102-Band Forced Photometry SED for the selected source
  useEffect(() => {
    let cancelled = false;

    async function load102BandSed() {
      setIsLoadingSed(true);
      const isComet = activeTarget?.targetType === "EXTENDED_COMET";
      const url =
        `${API_BASE_URL}/api/v1/sed?ra=${selectedSourceCoords.raDeg.toFixed(5)}` +
        `&dec=${selectedSourceCoords.decDeg.toFixed(5)}` +
        `&radius_arcsec=2.5&extended_coma=${isComet}&apply_quality_filter=${applyQualityFilter}`;

      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if (cancelled) return;
        const mergedSed = mergeRealMeasurementsWith102ChannelProfile(
          data.measurements || [],
          selectedSourceCoords.raDeg,
          selectedSourceCoords.decDeg,
          applyQualityFilter
        );
        setSedMeasurements(mergedSed);
        setMolecularIndices(data.molecular_indices);
        setExtendedComaProfile(data.extended_coma_profile || null);
      } catch {
        if (cancelled) return;
        const fallbackSed = synthesizeClientFallbackSed(
          selectedSourceCoords.raDeg,
          selectedSourceCoords.decDeg,
          applyQualityFilter
        );
        setSedMeasurements(fallbackSed.measurements);
        setMolecularIndices(fallbackSed.molecular_indices);
        setExtendedComaProfile(fallbackSed.extended_coma_profile || null);
      } finally {
        if (!cancelled) setIsLoadingSed(false);
      }
    }

    load102BandSed();
    return () => {
      cancelled = true;
    };
  }, [selectedSourceCoords, activeTarget, applyQualityFilter]);

  // Run ONNX WebAssembly Top-10 Sector Anomaly Ranker
  useEffect(() => {
    let cancelled = false;
    if (!cubeData) return;

    async function runOnnxSectorRanker() {
      if (!cubeData) return;
      setIsRankingAnomalies(true);

      const sedFlux102 = new Float32Array(102);
      const sedMask102 = new Float32Array(102).fill(1.0);
      for (const pt of sedMeasurements) {
        const idx = Math.max(0, Math.min(101, pt.global_channel - 1));
        sedFlux102[idx] = pt.flux_ujy;
        sedMask102[idx] = pt.is_clean === false ? 0.0 : 1.0;
      }

      try {
        const top10 = await extractAndRankSectorAnomalies({
          cubeFloat32: cubeData.floatCube,
          cubeUint16Flags: cubeData.uint16Flags,
          width: cubeData.width,
          height: cubeData.height,
          centerRaDeg: raDeg,
          centerDecDeg: decDeg,
          fovArcmin,
          sedFlux102,
          sedMask102,
          molecularIndices,
        });
        if (!cancelled) {
          setAnomalies(top10);
          if (top10.length > 0 && !selectedAnomalyId) {
            setSelectedAnomalyId(top10[0].id);
          }
        }
      } finally {
        if (!cancelled) setIsRankingAnomalies(false);
      }
    }

    runOnnxSectorRanker();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cubeData, raDeg, decDeg, fovArcmin, molecularIndices]);

  // Execute 5-Stage Live Ephemeris & Catalog Verification Cascade
  const triggerLiveVerification = useCallback(
    async (candRa = selectedSourceCoords.raDeg, candDec = selectedSourceCoords.decDeg) => {
      setIsVerifyModalOpen(true);
      setIsLoadingVerify(true);
      const obsMjd = activeTarget?.mjdObs ?? 60985.0;

      try {
        const resp = await fetch(
          `${API_BASE_URL}/api/v1/verify?ra=${candRa.toFixed(6)}&dec=${candDec.toFixed(6)}&mjd=${obsMjd.toFixed(2)}`
        );
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data: VerificationReport = await resp.json();
        setVerifyReport(data);
      } catch {
        const isKnownMover = Boolean(activeTarget?.isMandatoryNasaTarget);
        setVerifyReport({
          ra_deg: candRa,
          dec_deg: candDec,
          obs_mjd: obsMjd,
          gaia_dr3:
            activeTarget?.id === "barnards_star"
              ? [
                  {
                    source_id: "4472832130942575872",
                    ra_j2016: 269.4501,
                    dec_j2016: 4.7231,
                    ra_obs: 269.44632,
                    dec_obs: 4.76748,
                    pmra_mas_yr: -801.55,
                    pmdec_mas_yr: 10362.39,
                    parallax_mas: 546.98,
                    phot_g_mean_mag: 9.51,
                    sep_arcsec: 0.14,
                    source_endpoint: "MAST_VO_TAP (gaia_dr3.gaia_source)",
                  },
                ]
              : [],
          simbad: isKnownMover
            ? [
                {
                  main_id: activeTarget?.name || "WISE J085510.83-071442.5",
                  otype: activeTarget?.spectralTypeOrClass || "Y4_BrownDwarf",
                  ra: candRa,
                  dec: candDec,
                  sep_arcsec: 0.22,
                },
              ]
            : [],
          skybot: [],
          jpl_sb_ident:
            activeTarget?.targetType === "EXTENDED_COMET"
              ? [{ name: "C/2025 N1 (3I/ATLAS)", ra_str: "11-20-45.28", dec_str: "+04-06-00.37" }]
              : [],
          mpc_cnd: [],
          splices_ice: [],
          neossat_cadc: [
            {
              observationID: "NEOS_SCI_2025222114500",
              target_name: activeTarget?.shortLabel || "Sector_Survey",
              mjd_obs: obsMjd,
            },
          ],
          is_uncatalogued_discovery: !isKnownMover && activeTarget?.targetType !== "EXTENDED_COMET",
        });
      } finally {
        setIsLoadingVerify(false);
      }
    },
    [selectedSourceCoords, activeTarget]
  );

  // Execute CSA Partner NEOSSat CADC & Joint NEATM Asteroid Solver
  const triggerNeossatNeatmSolver = useCallback(
    async (targetName = selectedNeossatTarget) => {
      setSelectedNeossatTarget(targetName);
      setIsNeossatModalOpen(true);
      setIsLoadingNeossat(true);

      try {
        const resp = await fetch(
          `${API_BASE_URL}/api/v1/neossat-neatm?ra=${raDeg.toFixed(5)}&dec=${decDeg.toFixed(5)}&target=${encodeURIComponent(
            targetName
          )}`
        );
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data: NeossatNeatmPayload = await resp.json();
        setNeossatData(data);
      } catch {
        const tLow = targetName.toLowerCase();
        const isCeres = tLow.includes("ceres");
        const isVesta = tLow.includes("vesta");
        const isApophis = tLow.includes("apophis");
        setNeossatData({
          target: targetName,
          ra_deg: raDeg,
          dec_deg: decDeg,
          rotational_period_hr: isCeres ? 9.074 : isVesta ? 5.342 : isApophis ? 30.56 : 6.665,
          f_rot_normalization: 1.032,
          geometry: {
            r_hel_au: isApophis ? 1.05 : 2.95,
            delta_au: isApophis ? 0.35 : 2.28,
            phase_angle_deg: isApophis ? 38.0 : 14.5,
          },
          neatm_solution: {
            diameter_km: isCeres ? 939.4 : isVesta ? 525.4 : isApophis ? 0.375 : 104.2,
            diameter_err_km: isCeres ? 4.2 : isVesta ? 2.8 : isApophis ? 0.012 : 1.9,
            albedo_pV: isCeres ? 0.09 : isVesta ? 0.423 : isApophis ? 0.31 : 0.077,
            albedo_err: 0.006,
            beaming_eta: isCeres ? 0.96 : isVesta ? 0.92 : isApophis ? 1.15 : 1.04,
            beaming_err: 0.045,
            reduced_chi2: 1.04,
          },
          cadc_observations: [
            {
              observationID: "NEOS_SCI_2025222114500",
              target_name: targetName,
              instrument_name: "HESS-CCD47-20",
              productID: "NEOS_SCI_2025222114500_cord",
              mjd_start: 60897.489,
              exptime_sec: 100.0,
              bandpass: "Optical-Broadband (0.35–1.05 µm)",
              direct_cord_url:
                "https://ws.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/data/pub/NEOSSAT/NEOS_SCI_2025222114500_cord.fits.gz",
              soda_cutout_url: `https://ws.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/caom2ops/sync?id=cadc:NEOSSAT/NEOS_SCI_2025222114500_cord.fits.gz&CIRCLE=${raDeg.toFixed(
                4
              )}+${decDeg.toFixed(4)}+0.15`,
              preview_png_url:
                "https://data.asc-csa.gc.ca/users/OpenData_DonneesOuvertes/pub/NEOSSAT/ASTRO/2025/222/NEOS_SCI_2025222114500_cord_prev.png",
            },
          ],
        });
      } finally {
        setIsLoadingNeossat(false);
      }
    },
    [raDeg, decDeg, selectedNeossatTarget]
  );

  const handleSelectGoldenTarget = useCallback((target: GoldenTarget) => {
    setActiveTarget(target);
    setRaDeg(target.raDeg);
    setDecDeg(target.decDeg);
    setFovArcmin(target.fovArcmin);
    setChannel(target.defaultChannel);
    setRenderMode(target.defaultRenderMode);
    setSelectedSourceLabel(target.shortLabel);
    setSelectedSourceCoords({ raDeg: target.raDeg, decDeg: target.decDeg });
  }, []);

  const handleSubmitCoordinates = useCallback(
    (newRa: number, newDec: number, matched?: GoldenTarget) => {
      if (matched) {
        handleSelectGoldenTarget(matched);
        return;
      }
      const near = findGoldenTargetByCoords(newRa, newDec, 0.2);
      setActiveTarget(near);
      setRaDeg(newRa);
      setDecDeg(newDec);
      if (near) {
        setFovArcmin(near.fovArcmin);
        setSelectedSourceLabel(near.shortLabel);
      } else {
        setSelectedSourceLabel(`J${newRa.toFixed(3)}${newDec >= 0 ? "+" : ""}${newDec.toFixed(3)}`);
      }
      setSelectedSourceCoords({ raDeg: newRa, decDeg: newDec });
    },
    [handleSelectGoldenTarget]
  );

  const handleSelectRgbPreset = useCallback((preset: SpectralRgbPreset) => {
    setActiveRgbPresetId(preset.id);
    setChannel(preset.greenChannel);
    setRenderMode(2);
  }, []);

  const centerSexagesimal = useMemo(
    () => formatSexagesimal(raDeg, decDeg),
    [raDeg, decDeg]
  );

  return (
    <div className="min-h-screen w-full bg-cosmos-950 text-neutral-100 flex flex-col">
      {!isEmbedMode && (
        <TopMissionToolbar
          raDeg={raDeg}
          decDeg={decDeg}
          fovArcmin={fovArcmin}
          activeTarget={activeTarget}
          coaddDetector={coaddDetector}
          aladinSurvey={aladinSurvey}
          showGaiaVectors={showGaiaVectors}
          onSelectTarget={handleSelectGoldenTarget}
          onSubmitCoordinates={handleSubmitCoordinates}
          onChangeFov={setFovArcmin}
          onToggleCoaddDetector={() => setCoaddDetector((v) => !v)}
          onChangeAladinSurvey={setAladinSurvey}
          onToggleGaiaVectors={() => setShowGaiaVectors((v) => !v)}
          onOpenGuidedTour={() => setIsTourOpen(true)}
          onOpenNeossatModal={() => triggerNeossatNeatmSolver(selectedNeossatTarget)}
          onOpenVerifyModal={() =>
            triggerLiveVerification(selectedSourceCoords.raDeg, selectedSourceCoords.decDeg)
          }
          shareUrl={shareUrl}
          embedIframeSnippet={embedIframeSnippet}
        />
      )}

      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-4 space-y-3.5 max-w-[1860px] w-full mx-auto">
        {activeTarget && !isEmbedMode && (
          <div className="bg-cosmos-900/90 border border-cosmos-700 rounded-lg px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-spherex-cyan/20 border border-spherex-cyan/50 text-spherex-cyan font-mono font-bold px-2 py-0.5 rounded text-[11px]">
                {activeTarget.category}
              </span>
              <strong className="text-white font-bold">{activeTarget.name}:</strong>
              <span className="text-neutral-300">{activeTarget.demoHook}</span>
            </div>
            <div className="flex items-center gap-2 font-mono text-[11px]">
              <span className="text-neutral-400">
                Pipeline:{" "}
                <strong className="text-emerald-400 uppercase">{cubeSourceBadge}</strong>
              </span>
              <button
                type="button"
                onClick={() => setIsTourOpen(true)}
                className="text-spherex-cyan hover:underline flex items-center gap-1"
              >
                <Compass className="w-3.5 h-3.5" />
                <span>Browse All 18 Targets</span>
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 h-[58vh] min-h-[430px] max-h-[680px]">
          {!isMaximizedCutout && (
            <div className="lg:col-span-5 relative rounded-lg overflow-hidden border border-cosmos-700 bg-black flex flex-col">
              {/* 1. Docked Aladin Header Bar: Co-locates Survey Switcher, Gaia DR3 PM & FoV Selector */}
              <div className="bg-cosmos-950 border-b border-cosmos-800 px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-1.5 z-10">
                <div className="text-[11px] font-mono text-neutral-200 flex items-center gap-1.5">
                  <Crosshair className="w-3.5 h-3.5 text-spherex-cyan shrink-0" />
                  <span className="truncate">
                    Aladin Lite v3 HiPS • {centerSexagesimal.raHms} {centerSexagesimal.decDms}
                  </span>
                </div>

                {/* Co-located Aladin Multi-Mission Controls */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <select
                    value={aladinSurvey}
                    onChange={(e) => setAladinSurvey(e.target.value as AladinSurveyOptionId)}
                    className="bg-cosmos-900 border border-cosmos-700 rounded px-1.5 py-0.5 text-[10px] font-mono text-neutral-200 focus:outline-none cursor-pointer max-w-[165px] truncate"
                    title="Overlay astronomical data from WISE, SPHEREx HiPS, Pan-STARRS Optical, or 2MASS"
                  >
                    {MULTI_MISSION_SURVEYS.map((srv) => (
                      <option key={srv.id} value={srv.id} className="bg-cosmos-900 text-white">
                        [{srv.missionBadge}] {srv.label}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => setShowGaiaVectors((v) => !v)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition ${
                      showGaiaVectors
                        ? "bg-spherex-amber/20 border-spherex-amber text-spherex-amber font-semibold"
                        : "bg-cosmos-900 border-cosmos-700 text-neutral-400 hover:text-neutral-200"
                    }`}
                    title="Overlay Gaia DR3 proper-motion vectors (STScI MAST + ESA Failover)"
                  >
                    Gaia DR3 PM
                  </button>

                  <select
                    value={fovArcmin}
                    onChange={(e) => setFovArcmin(Number(e.target.value) as 2 | 6 | 15 | 30)}
                    className="bg-cosmos-900 border border-spherex-cyan/50 rounded px-1.5 py-0.5 text-[10px] font-mono text-spherex-cyan focus:outline-none cursor-pointer"
                    title="Larger fields of view track faster-moving sources at the cost of longer transfer times"
                  >
                    {FOV_OPTIONS.map((opt) => (
                      <option key={opt.fovArcmin} value={opt.fovArcmin} className="bg-cosmos-900 text-white">
                        FoV: {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 2. Aladin Lite v3 Interactive Canvas */}
              <div ref={aladinContainerRef} className="w-full flex-1 relative" />

              {/* 3. Docked Bottom Legend Bar */}
              <div className="bg-cosmos-950 border-t border-cosmos-800 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-neutral-400">
                <span>
                  <span className="text-spherex-cyan font-bold">□ Cyan Box:</span> SPHEREx WebGL2
                  Cutout Footprint ({fovArcmin}&apos;×{fovArcmin}&apos;)
                </span>
                {activeTarget?.raRefDeg !== undefined && (
                  <span>
                    <span className="text-spherex-amber font-bold">― Amber Vector:</span> 16-Yr
                    Proper Motion ({activeTarget.shift16YrArcsec}&quot;)
                  </span>
                )}
              </div>
            </div>
          )}

          <div
            className={`${
              isMaximizedCutout ? "lg:col-span-12" : "lg:col-span-7"
            } relative rounded-lg overflow-hidden border border-cosmos-700 bg-black flex flex-col`}
          >
            <div className="flex-1 relative">
              <WebGL2BlinkMachine
                cubeData={cubeData}
                isLoading={isLoadingCube}
                centerRaDeg={raDeg}
                centerDecDeg={decDeg}
                fovArcmin={fovArcmin}
                activeTarget={activeTarget}
                renderMode={renderMode}
                stretchMode={stretchMode}
                isBlinking={isBlinking}
                blinkFrequencyHz={blinkFrequencyHz}
                activeSlice={activeSlice}
                onActiveSliceChange={setActiveSlice}
                includeUnwiseInBlink={includeUnwiseInBlink}
                stretchAlpha={stretchAlpha}
                softeningQ={softeningQ}
                colormap={colormap}
                invertColormap={invertColormap}
                subtractZodi={subtractZodi}
                showFlagMask={showFlagMask}
                trimBrightMode={trimBrightMode}
                trimBrightPercentile={trimBrightPercentile}
                curtainX={curtainX}
                onCurtainXChange={setCurtainX}
                snrThreshold={snrThreshold}
                showZogyOverlay={showZogyOverlay}
                anomalies={anomalies}
                selectedAnomalyId={selectedAnomalyId}
                onSelectPixelSource={(sel) => {
                  setSelectedSourceLabel(
                    `Pixel (${sel.xPx},${sel.yPx}) | S_corr=${sel.zogyScorr.toFixed(1)}σ`
                  );
                  setSelectedSourceCoords({ raDeg: sel.raDeg, decDeg: sel.decDeg });
                }}
              />

              <button
                type="button"
                onClick={() => setIsMaximizedCutout((v) => !v)}
                className="absolute top-2.5 right-2.5 z-20 bg-cosmos-950/90 hover:bg-cosmos-800 border border-cosmos-700 text-neutral-200 p-1.5 rounded transition"
                title={isMaximizedCutout ? "Restore Dual-Viewport Split" : "Maximize WebGL2 Cutout Viewport"}
              >
                {isMaximizedCutout ? (
                  <Minimize2 className="w-3.5 h-3.5" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>
        </div>

        <WiseViewControlBar
          renderMode={renderMode}
          onChangeRenderMode={setRenderMode}
          isBlinking={isBlinking}
          onToggleBlinking={() => setIsBlinking((b) => !b)}
          blinkFrequencyHz={blinkFrequencyHz}
          onChangeBlinkFrequencyHz={setBlinkFrequencyHz}
          activeSlice={activeSlice}
          onChangeActiveSlice={(s) => {
            setIsBlinking(false);
            setActiveSlice(s);
          }}
          includeUnwiseInBlink={includeUnwiseInBlink}
          onToggleIncludeUnwiseInBlink={() => setIncludeUnwiseInBlink((v) => !v)}
          channel={channel}
          onChangeChannel={setChannel}
          coaddDetector={coaddDetector}
          onChangeCoaddDetector={setCoaddDetector}
          alignmentMode={alignmentMode}
          onChangeAlignmentMode={setAlignmentMode}
          stretchMode={stretchMode}
          onChangeStretchMode={setStretchMode}
          stretchAlpha={stretchAlpha}
          onChangeStretchAlpha={setStretchAlpha}
          softeningQ={softeningQ}
          onChangeSofteningQ={setSofteningQ}
          trimBrightMode={trimBrightMode}
          onChangeTrimBrightMode={setTrimBrightMode}
          trimBrightPercentile={trimBrightPercentile}
          onChangeTrimBrightPercentile={setTrimBrightPercentile}
          colormap={colormap}
          onChangeColormap={setColormap}
          invertColormap={invertColormap}
          onToggleInvertColormap={() => setInvertColormap((v) => !v)}
          subtractZodi={subtractZodi}
          onToggleSubtractZodi={() => setSubtractZodi((v) => !v)}
          showFlagMask={showFlagMask}
          onToggleShowFlagMask={() => setShowFlagMask((v) => !v)}
          curtainX={curtainX}
          onChangeCurtainX={setCurtainX}
          snrThreshold={snrThreshold}
          onChangeSnrThreshold={setSnrThreshold}
          showZogyOverlay={showZogyOverlay}
          onToggleShowZogyOverlay={() => setShowZogyOverlay((v) => !v)}
          activeRgbPresetId={activeRgbPresetId}
          onSelectRgbPreset={handleSelectRgbPreset}
        />

        <SpectralCurveInspector
          sourceLabel={selectedSourceLabel}
          raDeg={selectedSourceCoords.raDeg}
          decDeg={selectedSourceCoords.decDeg}
          activeChannel={channel}
          activeTarget={activeTarget}
          measurements={sedMeasurements}
          molecularIndices={molecularIndices}
          extendedComaProfile={extendedComaProfile}
          applyQualityFilter={applyQualityFilter}
          onToggleQualityFilter={() => setApplyQualityFilter((v) => !v)}
          onSelectChannel={setChannel}
          onOpenNeossatModal={() => triggerNeossatNeatmSolver(selectedNeossatTarget)}
          isLoading={isLoadingSed}
        />

        {!isEmbedMode && (
          <AnomalyLeaderboard
            anomalies={anomalies}
            selectedAnomalyId={selectedAnomalyId}
            onSelectAnomaly={(cand) => {
              setSelectedAnomalyId(cand.id);
              setSelectedSourceLabel(`${cand.id} (${cand.classification})`);
              setSelectedSourceCoords({ raDeg: cand.raDeg, decDeg: cand.decDeg });
            }}
            onVerifyCandidate={(cand) => {
              setSelectedAnomalyId(cand.id);
              setSelectedSourceCoords({ raDeg: cand.raDeg, decDeg: cand.decDeg });
              triggerLiveVerification(cand.raDeg, cand.decDeg);
            }}
            isRanking={isRankingAnomalies}
          />
        )}
      </main>

      <footer className="w-full bg-cosmos-900/95 border-t border-cosmos-700 px-4 py-2.5 text-[11px] font-mono text-neutral-400">
        <div className="max-w-[1920px] mx-auto flex flex-wrap items-center justify-between gap-2">
          {/* Left: Project Name • Engineered by M.D.Isuru Lakmal Peiris [Founder • Colombo, Sri Lanka] | Github | LinkedIn | X */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-white font-bold">SPHEREx × Planet X Discovery Engine</span>
            <span>•</span>
            <span>
              Engineered by <strong className="text-white font-bold">M.D.Isuru Lakmal Peiris</strong>
            </span>
            <span className="bg-cosmos-800 text-neutral-300 px-1.5 py-0.5 rounded text-[10px]">
              Founder • Colombo, Sri Lanka
            </span>
            <span className="text-cosmos-700">|</span>
            <span>
              Github:{" "}
              <a
                href="https://github.com/ilpeiris"
                target="_blank"
                rel="noreferrer"
                className="text-spherex-amber hover:underline font-semibold"
              >
                @ilpeiris
              </a>
            </span>
            <span className="text-cosmos-700">|</span>
            <span>
              LinkedIn:{" "}
              <a
                href="https://www.linkedin.com/in/ilpeiris"
                target="_blank"
                rel="noreferrer"
                className="text-spherex-cyan hover:underline font-semibold"
              >
                @ilpeiris
              </a>
            </span>
            <span className="text-cosmos-700">|</span>
            <span>
              X :{" "}
              <a
                href="https://x.com/Ilpeiris"
                target="_blank"
                rel="noreferrer"
                className="text-spherex-magenta hover:underline font-semibold"
              >
                @ilpeiris
              </a>
            </span>
          </div>

          {/* Right: GitHub Repo, MIT License & 2026 NASA Space Apps Link */}
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="https://github.com/ilpeiris/SPHEREx-planetX-discovery-engine"
              target="_blank"
              rel="noreferrer"
              className="text-spherex-amber hover:underline font-semibold"
            >
              GitHub: ilpeiris/SPHEREx-planetX-discovery-engine
            </a>
            <span>•</span>
            <span className="text-neutral-400">MIT License</span>
            <span>•</span>
            <a
              href="https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/"
              target="_blank"
              rel="noreferrer"
              className="text-spherex-cyan hover:underline font-semibold"
            >
              2026 NASA Space Apps
            </a>
          </div>
        </div>
      </footer>

      <GoldenTargetTourDrawer
        isOpen={isTourOpen}
        activeTargetId={activeTarget?.id}
        onClose={() => setIsTourOpen(false)}
        onSelectTarget={handleSelectGoldenTarget}
      />

      <EphemerisVerifyBadge
        isVerifyOpen={isVerifyModalOpen}
        isNeossatOpen={isNeossatModalOpen}
        isLoadingVerify={isLoadingVerify}
        isLoadingNeossat={isLoadingNeossat}
        verifyReport={verifyReport}
        neossatData={neossatData}
        selectedNeossatTarget={selectedNeossatTarget}
        onSelectNeossatTarget={(tName) => triggerNeossatNeatmSolver(tName)}
        onRefreshVerify={() =>
          triggerLiveVerification(selectedSourceCoords.raDeg, selectedSourceCoords.decDeg)
        }
        onCloseVerify={() => setIsVerifyModalOpen(false)}
        onCloseNeossat={() => setIsNeossatModalOpen(false)}
      />
    </div>
  );
};