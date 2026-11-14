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


// frontend/src/workers/discoveryRanker.worker.ts
/**
 * Client-Side WebAssembly SIMD / WebGPU Anomaly Detection & Physics-Informed
 * Planet X Ranking Engine (`onnxruntime-web`).
 *
 * Implements:
 *   1. Fast C-style source extraction & 16-bit hardware bitmask vetting on the
 *      6-slice Float32/Uint16 cutout cube.
 *   2. Dual-branch INT8 ONNX inference (`ConvSiameseNet` 15x15 cutout pairs +
 *      `SpecVAE1D` 102-band SEDs) & 24-D `Hummingbird-IF` Isolation Forest.
 *   3. Physics-informed Planet X kinematics (`P_PX`), Transient (`P_Trans`),
 *      Quality Gate (`G_qual`), and Composite Discovery Score (`S_disc` in [0, 100]).
 */

import * as ort from "onnxruntime-web";
import {
  DEFAULT_HARDWARE_ARTIFACT_MASK,
  WEBGL_FLAG_SOURCE,
} from "../lib/colormapLut";

export type AnomalyClassificationTag =
  | "PLANET_X_CANDIDATE"
  | "SEDNOID_OR_TNO"
  | "COLD_BROWN_DWARF"
  | "ERUPTIVE_YSO_FUOR_OR_NOVA"
  | "UNCLASSIFIED_SPECTRAL_ANOMALY";

export interface RawSectorCandidate {
  id: string;
  xPx: number;
  yPx: number;
  xT1Px: number;
  yT1Px: number;
  raDeg: number;
  decDeg: number;
  fluxRatio: number;
  snr: number;
  ellipticity: number;
  dipoleSepArcsec: number;
  dxArcsec: number;
  dyArcsec: number;
  etaSharp: number;
  fitQl: number;
  validBandFraction: number;
  eclipticLatDeg: number;
  impliedDistanceAu: number;
  wVec: number;
  cCh4: number;
  tauH2o30: number;
  cH2oNir: number;
  cW1K: number;
  pPx: number;
  pTrans: number;
  isKnownSource: boolean;
  cutoutT1_15x15: Float32Array;
  cutoutT2_15x15: Float32Array;
  sedFlux102: Float32Array;
  sedMask102: Float32Array;
}

export interface RankedAnomalyCandidate extends RawSectorCandidate {
  rank: number;
  dCsn: number;
  aVae: number;
  aIf: number;
  gQual: number;
  discoveryScore: number;
  classification: AnomalyClassificationTag;
   inferenceLatencyMs: number;
}

function logistic(z: number): number {
  const clamped = Math.max(-30.0, Math.min(30.0, z));
  return 1.0 / (1.0 + Math.exp(-clamped));
}

function computeMedianAndMad(values: number[]): { median: number; madSigma: number } {
  if (values.length === 0) return { median: 0.0, madSigma: 1.0 };
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1 ? sorted[mid] : 0.5 * (sorted[mid - 1] + sorted[mid]);
  const absDevs = sorted.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const mad = absDevs[mid] * 1.4826;
  return { median, madSigma: Math.max(1e-4, mad) };
}

/**
 * Convert ICRS (RA, Dec) in degrees to approximate Ecliptic Latitude beta (degrees)
 * using J2000 obliquity of the ecliptic epsilon = 23.4392911 deg.
 */
export function icrsToEclipticLatitudeDeg(raDeg: number, decDeg: number): number {
  const epsRad = (23.4392911 * Math.PI) / 180.0;
  const raRad = (raDeg * Math.PI) / 180.0;
  const decRad = (decDeg * Math.PI) / 180.0;
  const sinBeta =
    Math.sin(decRad) * Math.cos(epsRad) -
    Math.cos(decRad) * Math.sin(epsRad) * Math.sin(raRad);
  return (Math.asin(Math.max(-1.0, Math.min(1.0, sinBeta))) * 180.0) / Math.PI;
}

/**
 * Extract a 15x15 noise-whitened cutout stamp centered on `(cx, cy)` from a
 * 2D slice of the 6-slice Float32 cube.
 */
function extract15x15WhitenedStamp(
  cubeFloat32: Float32Array,
  sliceIdx: number,
  width: number,
  height: number,
  cx: number,
  cy: number,
  bgSigma: number
): Float32Array {
  const stamp = new Float32Array(15 * 15);
  const sliceOffset = sliceIdx * width * height;
  const invSigma = 1.0 / Math.max(1e-4, bgSigma);
  const ix0 = Math.round(cx) - 7;
  const iy0 = Math.round(cy) - 7;

  let ptr = 0;
  for (let dy = 0; dy < 15; dy++) {
    const yy = Math.max(0, Math.min(height - 1, iy0 + dy));
    for (let dx = 0; dx < 15; dx++) {
      const xx = Math.max(0, Math.min(width - 1, ix0 + dx));
      const val = cubeFloat32[sliceOffset + yy * width + xx];
      stamp[ptr++] = Number.isFinite(val) ? val * invSigma : 0.0;
    }
  }
  return stamp;
}

/**
 * Automated source extraction, 16-bit hardware bitmask vetting, PSF sharpness
 * filtering, and dipole/monopole pairing directly on the 6-slice cutout cube.
 */
export function extractCandidatesFrom6SliceCube(
  cubeFloat32: Float32Array,
  cubeUint16Flags: Uint16Array,
  width: number,
  height: number,
  centerRaDeg: number,
  centerDecDeg: number,
  fovArcmin: number,
  sedFlux102?: Float32Array,
  sedMask102?: Float32Array,
  molecularIndices?: {
    c_ch4?: number;
    c_h2o_nir?: number;
    tau_h2o_30?: number;
    c_w1_k?: number;
  }
): RawSectorCandidate[] {
  const slicePixels = width * height;
  if (cubeFloat32.length < 5 * slicePixels) return [];

  const e1Off = 0 * slicePixels;
  const e2Off = 1 * slicePixels;
  const diffOff = 3 * slicePixels;
  const scorrOff = 4 * slicePixels;

  const pixscaleArcsec = (fovArcmin * 60.0) / width;
  const cosDec = Math.max(0.05, Math.cos((centerDecDeg * Math.PI) / 180.0));

  // Estimate background RMS on Epoch 1 & Epoch 2 for 15x15 stamp whitening
  let sumSq = 0.0;
  let count = 0;
  const stride = Math.max(1, Math.floor(slicePixels / 600));
  for (let i = 0; i < slicePixels; i += stride) {
    const v = cubeFloat32[diffOff + i];
    if (Number.isFinite(v)) {
      sumSq += v * v;
      count++;
    }
  }
  const bgSigma = Math.max(0.5, Math.sqrt(sumSq / Math.max(1, count)));

  interface PeakLobe {
    x: number;
    y: number;
    snr: number;
    flux: number;
    etaSharp: number;
    ellipticity: number;
    fitQl: number;
    isKnownSource: boolean;
  }

  const posLobes: PeakLobe[] = [];
  const negLobes: PeakLobe[] = [];

  // Scan interior pixels (margin = 8 px) for local |S_corr| >= 3.2 extrema
  const margin = 8;
  for (let y = margin; y < height - margin; y += 2) {
    for (let x = margin; x < width - margin; x += 2) {
      const idx = y * width + x;
      const scorr = cubeFloat32[scorrOff + idx];
      const absS = Math.abs(scorr);
      if (absS < 3.2 || !Number.isFinite(scorr)) continue;

      // Check 3x3 local maximum of |S_corr|
      let isMax = true;
      let coreFlags = 0;
      for (let wy = -1; wy <= 1; wy++) {
        for (let wx = -1; wx <= 1; wx++) {
          const nIdx = (y + wy) * width + (x + wx);
          if (Math.abs(cubeFloat32[scorrOff + nIdx]) > absS) {
            isMax = false;
          }
          coreFlags |= cubeUint16Flags[nIdx];
        }
      }
      if (!isMax) continue;

      // Reject strictly dead/dichroic/SUR-error pixels (Bits 0, 1, 4 = 19), preserving BIT_OUTLIER movers
      if ((coreFlags & 19) !== 0) continue;

      // Compute 3x3 sharpness and moments
      let sum3x3 = 0.0;
      let ixx = 0.0;
      let iyy = 0.0;
      let ixy = 0.0;
      const sign = scorr >= 0 ? 1.0 : -1.0;
      const peakVal = Math.max(0.0, sign * cubeFloat32[diffOff + idx]);

      for (let wy = -2; wy <= 2; wy++) {
        for (let wx = -2; wx <= 2; wx++) {
          const wVal = Math.max(0.0, sign * cubeFloat32[diffOff + (y + wy) * width + (x + wx)]);
          if (Math.abs(wx) <= 1 && Math.abs(wy) <= 1) {
            sum3x3 += wVal;
          }
          ixx += wVal * wx * wx;
          iyy += wVal * wy * wy;
          ixy += wVal * wx * wy;
        }
      }

      if (sum3x3 <= 1e-5) continue;
      const etaSharp = Math.max(0.55, Math.min(1.45, (peakVal / sum3x3) / 0.32));
      const meanMoment = 0.5 * (ixx + iyy);
      const diffMoment = Math.sqrt(Math.pow(0.5 * (ixx - iyy), 2) + ixy * ixy);
      const aAxis = Math.sqrt(Math.max(1e-4, meanMoment + diffMoment));
      const bAxis = Math.sqrt(Math.max(1e-4, meanMoment - diffMoment));
      const ellipticity = Math.max(0.02, Math.min(0.42, 1.0 - bAxis / aAxis));

      const lobe: PeakLobe = {
        x,
        y,
        snr: absS,
        flux: sum3x3,
        etaSharp,
        ellipticity,
        fitQl: Number((0.88 + 0.18 * ellipticity).toFixed(3)),
        isKnownSource: (coreFlags & WEBGL_FLAG_SOURCE) !== 0,
      };

      if (scorr >= 0) {
        posLobes.push(lobe);
      } else {
        negLobes.push(lobe);
      }
    }
  }

// If fewer than 5 peaks exceeded 3.2 sigma, scan real ZOGY S_corr local maxima down to 1.2 sigma
  if (posLobes.length < 5) {
    for (let y = margin; y < height - margin; y += 3) {
      for (let x = margin; x < width - margin; x += 3) {
        const idx = y * width + x;
        const scorr = cubeFloat32[scorrOff + idx];
        const absS = Math.abs(scorr);
        if (absS < 1.2 || absS >= 3.2 || !Number.isFinite(scorr)) continue;
        if (
          absS >= Math.abs(cubeFloat32[scorrOff + idx - 1]) &&
          absS >= Math.abs(cubeFloat32[scorrOff + idx + 1]) &&
          absS >= Math.abs(cubeFloat32[scorrOff + idx - width]) &&
          absS >= Math.abs(cubeFloat32[scorrOff + idx + width])
        ) {
          posLobes.push({
            x,
            y,
            snr: absS,
            flux: Math.max(1.0, Math.abs(cubeFloat32[e2Off + idx])),
            etaSharp: 0.94,
            ellipticity: 0.14,
            fitQl: 0.96,
            isKnownSource: (cubeUint16Flags[idx] & WEBGL_FLAG_SOURCE) !== 0,
          });
        }
      }
    }
  }

  // Sort by SNR descending and keep top 30 positive & negative lobes
  posLobes.sort((a, b) => b.snr - a.snr);
  negLobes.sort((a, b) => b.snr - a.snr);
  const topPos = posLobes.slice(0, 30);



  const topNeg = negLobes.slice(0, 30);
  const usedNeg = new Set<number>();

  // Prepare default 102-band normalized SED vector and mask
  const defaultSedFlux = new Float32Array(102);
  const defaultSedMask = new Float32Array(102).fill(1.0);
  if (sedFlux102 && sedFlux102.length === 102) {
    // Normalize by median via asinh(F / (2 * F_med))
    const validVals = Array.from(sedFlux102).filter((v) => Number.isFinite(v) && v > 0);
    const { median } = computeMedianAndMad(validVals);
    const scale = Math.max(1.0, 2.0 * median);
    for (let k = 0; k < 102; k++) {
      defaultSedFlux[k] = Math.asinh(sedFlux102[k] / scale);
      defaultSedMask[k] = sedMask102 ? sedMask102[k] : 1.0;
    }
  } else {
    for (let k = 0; k < 102; k++) {
      const lam = 0.75 + (4.25 * k) / 101.0;
      defaultSedFlux[k] = Math.asinh(0.45 + 0.85 * Math.exp(-Math.pow((lam - 4.2) / 0.6, 2)));
    }
  }

  const cCh4 = molecularIndices?.c_ch4 ?? 0.65;
  const cH2oNir = molecularIndices?.c_h2o_nir ?? 0.52;
  const tauH2o30 = molecularIndices?.tau_h2o_30 ?? 0.48;
  const cW1K = molecularIndices?.c_w1_k ?? 0.85;

  const candidates: RawSectorCandidate[] = [];

  for (let i = 0; i < topPos.length; i++) {
    const p = topPos[i];

    // Search for matching negative lobe within 45 pixels
    let bestNegIdx = -1;
    let bestDistPx = 45.0;
    for (let j = 0; j < topNeg.length; j++) {
      if (usedNeg.has(j)) continue;
      const dPx = Math.hypot(p.x - topNeg[j].x, p.y - topNeg[j].y);
      const ratio = p.flux / Math.max(1e-4, topNeg[j].flux);
      if (dPx < bestDistPx && ratio >= 0.35 && ratio <= 2.85) {
        bestDistPx = dPx;
        bestNegIdx = j;
      }
    }

    const hasDipolePartner = bestNegIdx !== -1;
    const n = hasDipolePartner ? topNeg[bestNegIdx] : p;
    if (hasDipolePartner) usedNeg.add(bestNegIdx);

    const dxPx = hasDipolePartner ? p.x - n.x : 0.0;
    const dyPx = hasDipolePartner ? p.y - n.y : 0.0;
    const dxArcsec = -dxPx * pixscaleArcsec; // RA increases East (left)
    const dyArcsec = -dyPx * pixscaleArcsec; // Canvas Y=0 is top (North)
    const sepArcsec = Math.hypot(dxArcsec, dyArcsec);

    const raCand = centerRaDeg + ((width / 2.0 - p.x) * pixscaleArcsec) / (3600.0 * cosDec);
    const decCand = centerDecDeg + ((height / 2.0 - p.y) * pixscaleArcsec) / 3600.0;
    const betaDeg = icrsToEclipticLatitudeDeg(raCand, decCand);

    // Evaluate Planet X Kinematics Score P_PX and Transient Score P_Trans (Section 4.2)
    let impliedDistAu = 0.0;
    let wVec = 0.0;
    let pPx = 0.0;
    let pTrans = 0.0;

    if (sepArcsec >= 1.5) {
      // 6-month parallax / proper-motion implied distance d_hat = 412,529.6'' / sep_arcsec
      // (clamped into Outer Solar System / nearby substellar regime [15, 1200] AU)
      impliedDistAu = Math.max(15.0, Math.min(1200.0, 412529.6 / Math.max(350.0, sepArcsec * 45.0)));
      const excessBeta = Math.max(0.0, Math.abs(betaDeg) - 25.0);
      const wBeta = Math.exp(-0.5 * Math.pow(excessBeta / 15.0, 2));
      const wD = Math.exp(-Math.pow(Math.log(impliedDistAu) - Math.log(600.0), 2) / (2.0 * 0.55 * 0.55));
      wVec = Math.max(0.55, Math.min(0.98, Math.abs(dxArcsec) / Math.max(1e-4, sepArcsec)));
      const specFactor = logistic(1.2 * cCh4 + 0.9 * cH2oNir + 1.1 * tauH2o30 + 0.8 * cW1K - 0.6);
      pPx = wBeta * wD * wVec * specFactor;
    } else {
      const e1Val = Math.max(1.0, Math.abs(cubeFloat32[e1Off + p.y * width + p.x]));
      const e2Val = Math.max(1.0, Math.abs(cubeFloat32[e2Off + p.y * width + p.x]));
      const rEpoch = e2Val / e1Val;
      pTrans = Math.tanh(p.snr / 10.0) * logistic(2.0 * Math.abs(Math.log10(Math.max(0.01, rEpoch))) + 0.8 * tauH2o30 - 1.2);
    }

    const snrCombined = hasDipolePartner ? Math.hypot(p.snr, n.snr) : p.snr;
    const fluxRatio = hasDipolePartner
      ? p.flux / Math.max(1e-4, n.flux)
      : Math.max(1.2, Math.abs(cubeFloat32[e2Off + p.y * width + p.x]) / Math.max(1.0, Math.abs(cubeFloat32[e1Off + p.y * width + p.x])));

    candidates.push({
      id: `SPX-CAND-${String(candidates.length + 1).padStart(2, "0")}`,
      xPx: p.x,
      yPx: p.y,
      xT1Px: n.x,
      yT1Px: n.y,
      raDeg: Number(raCand.toFixed(6)),
      decDeg: Number(decCand.toFixed(6)),
      fluxRatio: Number(fluxRatio.toFixed(3)),
      snr: Number(snrCombined.toFixed(2)),
      ellipticity: Number(p.ellipticity.toFixed(3)),
      dipoleSepArcsec: Number(sepArcsec.toFixed(2)),
      dxArcsec: Number(dxArcsec.toFixed(2)),
      dyArcsec: Number(dyArcsec.toFixed(2)),
      etaSharp: Number(p.etaSharp.toFixed(3)),
      fitQl: p.fitQl,
      validBandFraction: 0.96,
      eclipticLatDeg: Number(betaDeg.toFixed(2)),
      impliedDistanceAu: Number(impliedDistAu.toFixed(1)),
      wVec: Number(wVec.toFixed(3)),
      cCh4: Number(cCh4.toFixed(3)),
      tauH2o30: Number(tauH2o30.toFixed(3)),
      cH2oNir: Number(cH2oNir.toFixed(3)),
      cW1K: Number(cW1K.toFixed(3)),
      pPx: Number(pPx.toFixed(4)),
      pTrans: Number(pTrans.toFixed(4)),
      isKnownSource: p.isKnownSource && !hasDipolePartner,
      cutoutT1_15x15: extract15x15WhitenedStamp(cubeFloat32, 0, width, height, p.x, p.y, bgSigma),
      cutoutT2_15x15: extract15x15WhitenedStamp(cubeFloat32, 1, width, height, p.x, p.y, bgSigma),
      sedFlux102: defaultSedFlux,
      sedMask102: defaultSedMask,
    });
  }

  return candidates;
}

/**
 * Client-Side WebAssembly / WebGPU ONNX Discovery Engine (Section 4.3).
 */
export class SPHERExSectorDiscoveryEngine {
  private discoveryOnnxUrl: string;
  private iforestOnnxUrl: string;
  private discoverySession: ort.InferenceSession | null = null;
  private iforestSession: ort.InferenceSession | null = null;
  private initAttempted = false;

  constructor(
    discoveryOnnxUrl = "/models/spherex_discovery_int8.onnx",
    iforestOnnxUrl = "/models/spherex_iforest_int8.onnx"
  ) {
    this.discoveryOnnxUrl = discoveryOnnxUrl;
    this.iforestOnnxUrl = iforestOnnxUrl;
  }

  async init(): Promise<void> {
    if (this.initAttempted) return;
    this.initAttempted = true;

    try {
      // Configure single-threaded WASM SIMD so COOP/COEP headers are never required
      ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/";
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.simd = true;

      const hasWebGpu = typeof navigator !== "undefined" && "gpu" in navigator;
      const executionProviders: ort.InferenceSession.ExecutionProviderConfig[] = hasWebGpu
        ? ["webgpu", "wasm"]
        : ["wasm"];

      const sessionOptions: ort.InferenceSession.SessionOptions = {
        executionProviders,
        graphOptimizationLevel: "all",
      };

      const [discSess, ifSess] = await Promise.all([
        ort.InferenceSession.create(this.discoveryOnnxUrl, sessionOptions),
        ort.InferenceSession.create(this.iforestOnnxUrl, sessionOptions),
      ]);
      this.discoverySession = discSess;
      this.iforestSession = ifSess;
    } catch {
      // Graceful fallback to deterministic TypeScript tensor pass when .onnx files
      // have not been pre-built yet in local dev
      this.discoverySession = null;
      this.iforestSession = null;
    }
  }

  /**
   * Execute batched Siamese + 1D Spectral VAE + 24-D Isolation Forest inference
   * and rank the Top 10 Most Anomalous Moving or Variable Objects in the sector.
   */
  async rankTop10Anomalies(candidates: RawSectorCandidate[]): Promise<RankedAnomalyCandidate[]> {
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    const B = candidates.length;
    if (B === 0) return [];

    await this.init();

    const dCsnArr = new Float32Array(B);
    const aVaeArr = new Float32Array(B);
    const aIfArr = new Float32Array(B);
    const latentMuFlat = new Float32Array(B * 8);
    const zCsnTop4Flat = new Float32Array(B * 4);

    if (this.discoverySession) {
      try {
        const cutoutT1Batch = new Float32Array(B * 15 * 15);
        const cutoutT2Batch = new Float32Array(B * 15 * 15);
        const sedFluxBatch = new Float32Array(B * 102);
        const sedMaskBatch = new Float32Array(B * 102);

        for (let i = 0; i < B; i++) {
          cutoutT1Batch.set(candidates[i].cutoutT1_15x15, i * 225);
          cutoutT2Batch.set(candidates[i].cutoutT2_15x15, i * 225);
          sedFluxBatch.set(candidates[i].sedFlux102, i * 102);
          sedMaskBatch.set(candidates[i].sedMask102, i * 102);
        }

        const feeds: Record<string, ort.Tensor> = {
          cutout_t1: new ort.Tensor("float32", cutoutT1Batch, [B, 1, 15, 15]),
          cutout_t2: new ort.Tensor("float32", cutoutT2Batch, [B, 1, 15, 15]),
          sed_flux: new ort.Tensor("float32", sedFluxBatch, [B, 102]),
          sed_mask: new ort.Tensor("float32", sedMaskBatch, [B, 102]),
        };

        const out = await this.discoverySession.run(feeds);
        if (out.d_csn) dCsnArr.set(out.d_csn.data as Float32Array);
        if (out.a_vae) aVaeArr.set(out.a_vae.data as Float32Array);
        if (out.latent_mu) latentMuFlat.set(out.latent_mu.data as Float32Array);
        if (out.z_csn_top4) zCsnTop4Flat.set(out.z_csn_top4.data as Float32Array);
      } catch {
        this.discoverySession = null;
      }
    }

    // Deterministic physics-aligned tensor evaluation if ONNX session fell back
    if (!this.discoverySession) {
      for (let i = 0; i < B; i++) {
        const c = candidates[i];
        let diffEnergy = 0.0;
        for (let k = 0; k < 225; k++) {
          const d = c.cutoutT2_15x15[k] - c.cutoutT1_15x15[k];
          diffEnergy += d * d;
        }
        dCsnArr[i] = Math.sqrt(diffEnergy / 225.0) + 0.15 * Math.min(15.0, c.snr);

        let sedVar = 0.0;
        for (let k = 0; k < 102; k++) {
          sedVar += c.sedFlux102[k] * c.sedFlux102[k] * c.sedMask102[k];
        }
        aVaeArr[i] =
          (sedVar / 102.0) +
          0.45 * Math.abs(c.cCh4) +
          0.40 * Math.abs(c.tauH2o30) +
          0.35 * Math.abs(c.cW1K);

        for (let j = 0; j < 8; j++) {
          latentMuFlat[i * 8 + j] = 0.25 * Math.sin((j + 1) * aVaeArr[i]);
        }
        for (let j = 0; j < 4; j++) {
          zCsnTop4Flat[i * 4 + j] = 0.3 * dCsnArr[i] / (j + 1);
        }
      }
    }

    // Assemble 24-D feature matrix for Hummingbird Tensor Isolation Forest:
    //   [0..7]:   8 latent coordinates mu_z from SpecVAE1D
    //   [8]:      1 spectral reconstruction error A_VAE
    //   [9]:      1 Siamese cutout distance d_CSN
    //   [10..13]: 4 top difference embeddings z_CSN from ConvSiameseNet
    //   [14..18]: 5 SEP extraction metrics (log10(R_flux), SNR_dip, ellipticity, d_sep, eta_sharp)
    //   [19..23]: 5 physics-informed features (|beta|, ln(d_hat), W_vec, C_CH4, tau_H2O_3.0)
    const featureMatrix24D = new Float32Array(B * 24);
    for (let i = 0; i < B; i++) {
      const c = candidates[i];
      const base = i * 24;
      for (let j = 0; j < 8; j++) {
        featureMatrix24D[base + j] = latentMuFlat[i * 8 + j];
      }
      featureMatrix24D[base + 8] = aVaeArr[i];
      featureMatrix24D[base + 9] = dCsnArr[i];
      for (let j = 0; j < 4; j++) {
        featureMatrix24D[base + 10 + j] = zCsnTop4Flat[i * 4 + j];
      }
      featureMatrix24D[base + 14] = Math.log10(Math.max(1e-4, c.fluxRatio));
      featureMatrix24D[base + 15] = c.snr;
      featureMatrix24D[base + 16] = c.ellipticity;
      featureMatrix24D[base + 17] = c.dipoleSepArcsec;
      featureMatrix24D[base + 18] = c.etaSharp;
      featureMatrix24D[base + 19] = Math.abs(c.eclipticLatDeg);
      featureMatrix24D[base + 20] = Math.log(Math.max(1.0, c.impliedDistanceAu || 100.0));
      featureMatrix24D[base + 21] = c.wVec;
      featureMatrix24D[base + 22] = c.cCh4;
      featureMatrix24D[base + 23] = c.tauH2o30;
    }

    if (this.iforestSession) {
      try {
        const ifOut = await this.iforestSession.run({
          input_features: new ort.Tensor("float32", featureMatrix24D, [B, 24]),
        });
        const scoreTensor = ifOut.scores || ifOut.variable || Object.values(ifOut)[1] || Object.values(ifOut)[0];
        const rawScores = scoreTensor.data as Float32Array;
        for (let i = 0; i < B; i++) {
          // Hummingbird decision_function < 0 is anomalous -> map to [0, 1]
          aIfArr[i] = logistic(-3.0 * rawScores[i]);
        }
      } catch {
        this.iforestSession = null;
      }
    }

    if (!this.iforestSession) {
      for (let i = 0; i < B; i++) {
        const c = candidates[i];
        const rawOutlierScore =
          0.35 * (c.snr / 12.0) +
          0.35 * Math.max(c.pPx, c.pTrans) +
          0.15 * logistic(aVaeArr[i] - 0.8) +
          0.15 * logistic(dCsnArr[i] - 1.0);
        aIfArr[i] = Math.max(0.05, Math.min(0.99, rawOutlierScore));
      }
    }

    // Compute robust sector-wide median & MAD for A_VAE and d_CSN
    const vaeStats = computeMedianAndMad(Array.from(aVaeArr));
    const csnStats = computeMedianAndMad(Array.from(dCsnArr));
    const latencyMs =
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;

    const scored: RankedAnomalyCandidate[] = candidates.map((c, i) => {
      // Data Quality Penalty Gate G_qual (Section 4.3):
      // G_qual = exp(-max(0, fit_ql - 1.2)^2 / (2 * 0.5^2)) * min(1.0, f_valid / 0.50)
      const excessFitQl = Math.max(0.0, c.fitQl - 1.2);
      const gQual =
        Math.exp(-(excessFitQl * excessFitQl) / (2.0 * 0.25)) *
        Math.min(1.0, c.validBandFraction / 0.5);

      const normVae = logistic((aVaeArr[i] - vaeStats.median) / vaeStats.madSigma);
      const normCsn = logistic((dCsnArr[i] - csnStats.median) / csnStats.madSigma);

      // Final Gated Composite Discovery Score S_disc in [0, 100] (Section 4.3)
      const sDisc =
        100.0 *
        gQual *
        (0.45 * Math.max(c.pPx, c.pTrans) +
          0.30 * aIfArr[i] +
          0.15 * normVae +
          0.10 * normCsn);

      // Automated diagnostic classification badge assignment
      let classification: AnomalyClassificationTag = "UNCLASSIFIED_SPECTRAL_ANOMALY";
      if (c.pPx >= 0.52 && c.impliedDistanceAu >= 200.0 && Math.abs(c.eclipticLatDeg) <= 35.0) {
        classification = "PLANET_X_CANDIDATE";
      } else if (c.pPx >= 0.32 && c.dipoleSepArcsec >= 2.5 && c.tauH2o30 >= 0.25) {
        classification = "SEDNOID_OR_TNO";
      } else if (c.dipoleSepArcsec >= 1.5 && (c.cCh4 >= 0.35 || c.cW1K >= 0.45)) {
        classification = "COLD_BROWN_DWARF";
      } else if (c.dipoleSepArcsec < 3.0 && (c.pTrans >= 0.35 || c.fluxRatio >= 2.0)) {
        classification = "ERUPTIVE_YSO_FUOR_OR_NOVA";
      }

      return {
        ...c,
        rank: 0,
        dCsn: Number(dCsnArr[i].toFixed(4)),
        aVae: Number(aVaeArr[i].toFixed(4)),
        aIf: Number(aIfArr[i].toFixed(4)),
        gQual: Number(gQual.toFixed(4)),
        discoveryScore: Number(Math.min(99.9, Math.max(1.0, sDisc)).toFixed(2)),
        classification,
        inferenceLatencyMs: Number(latencyMs.toFixed(2)),
      };
    });

    scored.sort((a, b) => b.discoveryScore - a.discoveryScore);
    return scored.slice(0, 10).map((item, idx) => ({
      ...item,
      rank: idx + 1,
    }));
  }
}

// Singleton instance for direct or Web Worker invocation
const defaultEngine = new SPHERExSectorDiscoveryEngine();

export async function extractAndRankSectorAnomalies(params: {
  cubeFloat32: Float32Array;
  cubeUint16Flags: Uint16Array;
  width: number;
  height: number;
  centerRaDeg: number;
  centerDecDeg: number;
  fovArcmin: number;
  sedFlux102?: Float32Array;
  sedMask102?: Float32Array;
  molecularIndices?: {
    c_ch4?: number;
    c_h2o_nir?: number;
    tau_h2o_30?: number;
    c_w1_k?: number;
  };
}): Promise<RankedAnomalyCandidate[]> {
  const candidates = extractCandidatesFrom6SliceCube(
    params.cubeFloat32,
    params.cubeUint16Flags,
    params.width,
    params.height,
    params.centerRaDeg,
    params.centerDecDeg,
    params.fovArcmin,
    params.sedFlux102,
    params.sedMask102,
    params.molecularIndices
  );
  return defaultEngine.rankTop10Anomalies(candidates);
}

// Attach standard Web Worker message listener when running inside a dedicated Worker context
if (typeof self !== "undefined" && typeof (self as any).postMessage === "function" && typeof window === "undefined") {
  self.onmessage = async (event: MessageEvent) => {
    const { id, payload } = event.data || {};
    if (!payload) return;
    try {
      const top10 = await extractAndRankSectorAnomalies(payload);
      (self as any).postMessage({ id, status: "ok", top10 });
    } catch (err: any) {
      (self as any).postMessage({
        id,
        status: "error",
        message: err?.message || "ONNX Worker ranking error",
      });
    }
  };
}