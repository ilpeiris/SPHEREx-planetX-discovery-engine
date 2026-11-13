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


// frontend/src/lib/colormapLut.ts
/**
 * Procedural 256x1 RGBA WebGL2 Colormap Lookup Table (LUT) Texture Generator
 * and Condensed 16-Bit SPHEREx Hardware Flag Constants (`gl.R16UI`).
 */

export type ColormapName = "viridis" | "inferno" | "cubehelix" | "grayscale" | "magma";

export interface ColormapOption {
  id: ColormapName;
  label: string;
  description: string;
}

export const COLORMAP_OPTIONS: ColormapOption[] = [
  {
    id: "inferno",
    label: "Inferno (WiseView IR)",
    description: "Perceptually uniform black-purple-orange-yellow infrared heatmap",
  },
  {
    id: "viridis",
    label: "Viridis (Caltech/IPAC)",
    description: "Standard SPHEREx tutorial deep-blue to emerald-yellow scientific colormap",
  },
  {
    id: "cubehelix",
    label: "Cubehelix (Green 2011)",
    description: "Monotonically increasing luminance helix designed for faint astronomical halos",
  },
  {
    id: "magma",
    label: "Magma (Warm Thermal)",
    description: "High-contrast obsidian-magenta-ivory thermal emission colormap",
  },
  {
    id: "grayscale",
    label: "Photographic Grayscale",
    description: "Classic linear observatory plate grayscale (invertible to white-sky negative)",
  },
];

// Condensed 16-bit unsigned integer (Uint16) bitmask constants matching
// `backend/app/config.py` (`condense_flags_to_uint16`) and `u_flagCube` (`gl.R16UI`)
export const WEBGL_FLAG_NONFUNC = 1 << 0;      // Bit 0 (1): Dead / hot / cold / reference / missing pixel
export const WEBGL_FLAG_DICHROIC = 1 << 1;     // Bit 1 (2): Dichroic beam-splitter edge attenuation (>50%)
export const WEBGL_FLAG_PERSIST = 1 << 2;      // Bit 2 (4): Persistence latent charge trap (MP_PERSIST)
export const WEBGL_FLAG_TRANSIENT = 1 << 3;    // Bit 3 (8): Cosmic ray / SUR transient / snowball
export const WEBGL_FLAG_SUR_ERROR = 1 << 4;    // Bit 4 (16): Unrecoverable SUR ramp error / nonlinearity / bloom
export const WEBGL_FLAG_GHOST_STREAK = 1 << 5; // Bit 5 (32): Optical ghost, crosstalk, or satellite streak
export const WEBGL_FLAG_SOURCE = 1 << 6;       // Bit 6 (64): Known reference catalog source (MP_SOURCE, Bit 21)

// Default hardware artifact mask hatched in WebGL2 (excludes benign WEBGL_FLAG_SOURCE Bit 6)
export const DEFAULT_HARDWARE_ARTIFACT_MASK: number =
  WEBGL_FLAG_NONFUNC |
  WEBGL_FLAG_DICHROIC |
  WEBGL_FLAG_PERSIST |
  WEBGL_FLAG_TRANSIENT |
  WEBGL_FLAG_SUR_ERROR |
  WEBGL_FLAG_GHOST_STREAK;

type RgbStop = [number, [number, number, number]];

const VIRIDIS_STOPS: RgbStop[] = [
  [0.0, [68, 1, 84]],
  [0.25, [59, 82, 139]],
  [0.5, [33, 145, 140]],
  [0.75, [94, 201, 98]],
  [1.0, [253, 231, 37]],
];

const INFERNO_STOPS: RgbStop[] = [
  [0.0, [0, 0, 4]],
  [0.25, [87, 16, 110]],
  [0.5, [188, 55, 84]],
  [0.75, [249, 142, 9]],
  [1.0, [252, 255, 164]],
];

const MAGMA_STOPS: RgbStop[] = [
  [0.0, [0, 0, 4]],
  [0.25, [81, 18, 124]],
  [0.5, [183, 55, 121]],
  [0.75, [251, 136, 97]],
  [1.0, [252, 253, 191]],
];

function interpolateStops(t: number, stops: RgbStop[]): [number, number, number] {
  const x = Math.max(0.0, Math.min(1.0, t));
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (x >= t0 && x <= t1) {
      const f = (x - t0) / Math.max(1e-6, t1 - t0);
      return [
        Math.round(c0[0] + f * (c1[0] - c0[0])),
        Math.round(c0[1] + f * (c1[1] - c0[1])),
        Math.round(c0[2] + f * (c1[2] - c0[2])),
      ];
    }
  }
  return stops[stops.length - 1][1];
}

/**
 * Dave Green's (2011) analytical Cubehelix colormap evaluation.
 */
function evaluateCubehelix(
  t: number,
  start = 0.5,
  rotations = -1.5,
  hue = 1.2,
  gamma = 1.0
): [number, number, number] {
  const fract = Math.pow(Math.max(0.0, Math.min(1.0, t)), gamma);
  const angle = 2.0 * Math.PI * (start / 3.0 + 1.0 + rotations * t);
  const amp = (hue * fract * (1.0 - fract)) / 2.0;

  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  const r = fract + amp * (-0.14861 * cosA + 1.78277 * sinA);
  const g = fract + amp * (-0.29227 * cosA - 0.90649 * sinA);
  const b = fract + amp * (1.97294 * cosA);

  return [
    Math.round(Math.max(0.0, Math.min(1.0, r)) * 255),
    Math.round(Math.max(0.0, Math.min(1.0, g)) * 255),
    Math.round(Math.max(0.0, Math.min(1.0, b)) * 255),
  ];
}

const LUT_CACHE: Partial<Record<ColormapName, Uint8Array>> = {};

/**
 * Generate a 256x1 RGBA (`Uint8Array` of length 1024) colormap Lookup Table (LUT)
 * suitable for immediate upload to WebGL2 `gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, lutBytes)`.
 */
export function generateColormapLutRgba(name: ColormapName): Uint8Array {
  const cached = LUT_CACHE[name];
  if (cached) return cached;

  const lut = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const t = i / 255.0;
    let rgb: [number, number, number];

    switch (name) {
      case "viridis":
        rgb = interpolateStops(t, VIRIDIS_STOPS);
        break;
      case "inferno":
        rgb = interpolateStops(t, INFERNO_STOPS);
        break;
      case "magma":
        rgb = interpolateStops(t, MAGMA_STOPS);
        break;
      case "cubehelix":
        rgb = evaluateCubehelix(t);
        break;
      case "grayscale":
      default: {
        const v = Math.round(t * 255);
        rgb = [v, v, v];
        break;
      }
    }

    const offset = i * 4;
    lut[offset] = rgb[0];
    lut[offset + 1] = rgb[1];
    lut[offset + 2] = rgb[2];
    lut[offset + 3] = 255;
  }

  LUT_CACHE[name] = lut;
  return lut;
}