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

// frontend/src/lib/zscale.ts
/**
 * High-Speed (<1ms) Client-Side IRAF / Astropy ZScaleInterval Estimator
 * and WiseView-Inspired Dynamic Range & Trim Bright Normalization Utilities.
 */

export type TrimBrightMode = "adapt" | "percent" | "fixed";

export interface SliceStretchLimits {
  z1: number;
  z2: number;
  median: number;
  sigma: number;
  p995: number;
}

/**
 * Client-side implementation of the IRAF / Astropy `ZScaleInterval` algorithm.
 * Samples `nSamples` pixels via uniform striding, sorts intensities, and performs
 * iterative kappa-sigma linear regression to compute `(z1, z2)` in < 1 ms
 * without computing full image histograms.
 */
export function computeClientZScale(
  floatData: Float32Array,
  nSamples = 1000,
  contrast = 0.25,
  krej = 2.5,
  maxIterations = 5
): [number, number] {
  const totalPixels = floatData.length;
  if (totalPixels === 0) return [0.0, 1.0];

  const stride = Math.max(1, Math.floor(totalPixels / nSamples));
  const samples: number[] = [];

  for (let i = 0; i < totalPixels; i += stride) {
    const val = floatData[i];
    if (Number.isFinite(val) && val !== 0) {
      samples.push(val);
    }
  }

  const npix = samples.length;
  if (npix < 5) return [0.0, 1.0];

  samples.sort((a, b) => a - b);

  const zmin = samples[0];
  const zmax = samples[npix - 1];
  const centerIdx = Math.floor((npix - 1) / 2);
  const median =
    npix % 2 === 1
      ? samples[centerIdx]
      : 0.5 * (samples[centerIdx] + samples[centerIdx + 1]);

  // Normalized x indices spanning [-1.0, 1.0]
  const xNorm = new Float32Array(npix);
  const mask = new Uint8Array(npix).fill(1);
  for (let i = 0; i < npix; i++) {
    xNorm[i] = (2.0 * i) / (npix - 1) - 1.0;
  }

  let slope = 0.0;
  let intercept = median;
  let ngoodpix = npix;
  const minNpixels = Math.max(5, Math.floor(npix * 0.5));

  for (let iter = 0; iter < maxIterations; iter++) {
    let sumX = 0;
    let sumY = 0;
    let sumXX = 0;
    let sumXY = 0;
    let count = 0;

    for (let i = 0; i < npix; i++) {
      if (mask[i]) {
        const x = xNorm[i];
        const y = samples[i];
        sumX += x;
        sumY += y;
        sumXX += x * x;
        sumXY += x * y;
        count++;
      }
    }

    if (count < minNpixels) break;
    const denom = count * sumXX - sumX * sumX;
    if (Math.abs(denom) < 1e-12) break;

    slope = (count * sumXY - sumX * sumY) / denom;
    intercept = (sumY - slope * sumX) / count;

    // Compute residuals and standard deviation for kappa-sigma outlier rejection
    let sumSqRes = 0;
    for (let i = 0; i < npix; i++) {
      if (mask[i]) {
        const res = samples[i] - (intercept + slope * xNorm[i]);
        sumSqRes += res * res;
      }
    }
    const sigma = Math.sqrt(sumSqRes / count);
    const threshold = krej * sigma;

    let newGood = 0;
    for (let i = 0; i < npix; i++) {
      const res = Math.abs(samples[i] - (intercept + slope * xNorm[i]));
      if (res > threshold) {
        mask[i] = 0;
      } else {
        newGood++;
      }
    }

    if (newGood === ngoodpix) break;
    ngoodpix = newGood;
  }

  if (ngoodpix < minNpixels) {
    return zmin < zmax ? [zmin, zmax] : [zmin, zmin + 1.0];
  }

  const safeContrast = Math.max(0.02, contrast);
  const scaledSlope = slope / safeContrast;
  const z1 = Math.max(zmin, median - scaledSlope);
  const z2 = Math.min(zmax, median + scaledSlope);

  return z1 < z2 ? [z1, z2] : [zmin, Math.max(zmax, zmin + 1.0)];
}

/**
 * Compute detailed stretch statistics (`z1`, `z2`, `median`, `sigma`, `p995`)
 * for a single 2D slice inside a packed `Float32Array` cube, optionally adding
 * Slice 5 (`ZODI` foreground model) when `subtractZodi === false` (Micro-Safeguard #1).
 */
export function computeSliceStretchStats(
  cubeFloat32: Float32Array,
  sliceIndex: number,
  width: number,
  height: number,
  numSlices = 6,
  subtractZodi = true,
  contrast = 0.25
): SliceStretchLimits {
  const slicePixels = width * height;
  const clampedSlice = Math.max(0, Math.min(numSlices - 1, sliceIndex));
  const offset = clampedSlice * slicePixels;
  const zodiOffset = 5 * slicePixels;

  // Only add ZODI back on flux slices (Slices 0 and 1) when subtractZodi is false
  const addZodi = !subtractZodi && numSlices >= 6 && (clampedSlice === 0 || clampedSlice === 1);

  let sliceView: Float32Array;
  if (addZodi) {
    sliceView = new Float32Array(slicePixels);
    for (let i = 0; i < slicePixels; i++) {
      sliceView[i] = cubeFloat32[offset + i] + cubeFloat32[zodiOffset + i];
    }
  } else {
    sliceView = cubeFloat32.subarray(offset, offset + slicePixels);
  }

  const [z1, z2] = computeClientZScale(sliceView, 1000, contrast);

  // Extract strided percentile & MAD statistics for WiseView Trim Bright modes
  const stride = Math.max(1, Math.floor(slicePixels / 800));
  const vals: number[] = [];
  for (let i = 0; i < slicePixels; i += stride) {
    const v = sliceView[i];
    if (Number.isFinite(v)) vals.push(v);
  }

  if (vals.length < 4) {
    return { z1, z2, median: 0, sigma: 1, p995: z2 };
  }

  vals.sort((a, b) => a - b);
  const med = vals[Math.floor(vals.length * 0.5)];
  const p995 = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.995))];

  const absDevs = vals.map((v) => Math.abs(v - med)).sort((a, b) => a - b);
  const mad = absDevs[Math.floor(absDevs.length * 0.5)] * 1.4826;
  const sigma = Math.max(1e-4, mad);

  return { z1, z2, median: med, sigma, p995 };
}

/**
 * Pre-compute per-slice `[z1, z2]` lookup table across all 6 slices of a
 * binary cutout cube so 60-FPS epoch blinking updates `u_zLimitsSingle`
 * in < 0.02 ms with zero frame-time jitter.
 */
export function computeCubeSliceZLimits(
  cubeFloat32: Float32Array,
  width: number,
  height: number,
  numSlices = 6,
  subtractZodi = true,
  trimBrightMode: TrimBrightMode = "adapt",
  trimBrightPercentile = 99.5,
  fixedMaxFlux = 500.0
): SliceStretchLimits[] {
  const results: SliceStretchLimits[] = [];

  for (let s = 0; s < numSlices; s++) {
    const baseStats = computeSliceStretchStats(
      cubeFloat32,
      s,
      width,
      height,
      numSlices,
      subtractZodi,
      0.22
    );

// Clip background sky noise below (median + 2.1 * sigma) to pure black (#000000)
    // so only real >2.1-sigma astronomical sources illuminate the viewport
    let effectiveZ1 =
      s === 3 || s === 4
        ? baseStats.median + 1.25 * baseStats.sigma
        : baseStats.median + 2.1 * baseStats.sigma;
    let effectiveZ2 = baseStats.z2;

    if (trimBrightMode === "adapt") {
      effectiveZ2 = Math.max(
        effectiveZ1 + 6.0 * baseStats.sigma,
        0.75 * baseStats.p995 + 0.25 * baseStats.z2
      );
    } else if (trimBrightMode === "percent") {
      const pctFactor = Math.max(0.15, Math.min(2.5, (trimBrightPercentile - 85.0) / 14.5));
      effectiveZ2 = Math.max(
        effectiveZ1 + 3.0 * baseStats.sigma,
        baseStats.median + pctFactor * (baseStats.p995 - baseStats.median)
      );
    } else if (trimBrightMode === "fixed") {
      effectiveZ2 = Math.max(effectiveZ1 + 1.0, fixedMaxFlux);
    }

    results.push({
      ...baseStats,
      z1: effectiveZ1,
      z2: Math.max(effectiveZ1 + 1e-4, effectiveZ2),
    });
  }

  return results;
}