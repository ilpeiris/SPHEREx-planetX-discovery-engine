// frontend/src/components/WebGL2BlinkMachine.tsx
"use client";
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
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ColormapName,
  DEFAULT_HARDWARE_ARTIFACT_MASK,
  WEBGL_FLAG_DICHROIC,
  WEBGL_FLAG_GHOST_STREAK,
  WEBGL_FLAG_NONFUNC,
  WEBGL_FLAG_PERSIST,
  WEBGL_FLAG_SOURCE,
  WEBGL_FLAG_SUR_ERROR,
  WEBGL_FLAG_TRANSIENT,
  generateColormapLutRgba,
} from "../lib/colormapLut";
import { GoldenTarget, formatSexagesimal } from "../lib/goldenCatalog";
import {
  SliceStretchLimits,
  TrimBrightMode,
  computeCubeSliceZLimits,
} from "../lib/zscale";
import { RankedAnomalyCandidate } from "../workers/discoveryRanker.worker";

export interface ParsedCutoutCube {
  numSlices: number;
  height: number;
  width: number;
  reservedFlags: number;
  floatCube: Float32Array;
  uint16Flags: Uint16Array;
}

/**
 * Unpack the locked 16-byte header + 6-slice Float32Array + 6-slice Uint16Array
 * binary payload returned by `GET /api/v1/cutout-cube` (Section 8.2 Contract #1).
 */
export function parseBinaryCutoutCube(buffer: ArrayBuffer): ParsedCutoutCube {
  if (buffer.byteLength < 16) {
    throw new Error("Invalid binary cutout cube buffer (< 16 bytes)");
  }
  const headerView = new DataView(buffer, 0, 16);
  const numSlices = headerView.getUint32(0, true);
  const height = headerView.getUint32(4, true);
  const width = headerView.getUint32(8, true);
  const reservedFlags = headerView.getUint32(12, true);

  const totalElements = numSlices * height * width;
  const floatByteLength = totalElements * 4;
  const uint16ByteLength = totalElements * 2;

  const floatCube = new Float32Array(buffer, 16, totalElements);
  const uint16Offset = 16 + floatByteLength;
  const uint16Flags =
    buffer.byteLength >= uint16Offset + uint16ByteLength
      ? new Uint16Array(buffer, uint16Offset, totalElements)
      : new Uint16Array(totalElements);

  return {
    numSlices,
    height,
    width,
    reservedFlags,
    floatCube,
    uint16Flags,
  };
}

// Vertex Shader (#version 300 es)
const VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texCoord;
out vec2 v_texCoord;
void main() {
    v_texCoord = a_texCoord;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// Fragment Shader (#version 300 es — identical to frontend/src/shaders/spherex_blink_zogy.frag.glsl)
const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DArray;
precision highp usampler2DArray;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2DArray u_fluxCube;
uniform usampler2DArray u_flagCube;
uniform sampler2D u_colormapLut;

uniform int u_renderMode;
uniform int u_stretchMode;
uniform int u_activeSlice;
uniform ivec3 u_rgbSlices;
uniform ivec3 u_zogySlices;

uniform vec2 u_zLimitsSingle;
uniform vec3 u_rgbMin;
uniform vec3 u_rgbScale;
uniform float u_stretchAlpha;
uniform float u_softeningQ;
uniform float u_logExponentA;
uniform bool u_invertColormap;
uniform bool u_subtractZodi;

uniform float u_curtainX;
uniform float u_snrThreshold;
uniform bool u_showZogyOverlay;

uniform uint u_flagFilterMask;
uniform bool u_showFlagMask;

float sampleSliceFlux(vec2 uv, int sliceIdx) {
    float val = texture(u_fluxCube, vec3(uv, float(sliceIdx))).r;
    if (!u_subtractZodi && (sliceIdx == 0 || sliceIdx == 1)) {
        float zodiVal = texture(u_fluxCube, vec3(uv, 5.0)).r;
        val += zodiVal;
    }
    return val;
}

float applyScalarStretch(float rawIntensity, vec2 zLimits) {
    float span = max(zLimits.y - zLimits.x, 1e-6);
    float x = clamp((rawIntensity - zLimits.x) / span, 0.0, 1.0);

    if (u_stretchMode == 1) {
        float k = max(u_stretchAlpha * u_softeningQ, 1e-4);
        x = asinh(k * x) / asinh(k);
    } else if (u_stretchMode == 2) {
        float a = max(u_logExponentA, 1.0);
        x = log(a * x + 1.0) / log(a + 1.0);
    }

    return u_invertColormap ? (1.0 - x) : x;
}

vec3 applyLuptonRGB(vec3 rawRgb, vec3 minRgb, vec3 scaleRgb, float alpha, float Q) {
    vec3 I_c = clamp((rawRgb - minRgb) / max(scaleRgb, vec3(1e-6)), 0.0, 1.0);
    // Smooth noise gate so <1.5% residual background fluctuations stay deep space black
    I_c = smoothstep(0.015, 1.0, I_c);
    float I_mean = max((I_c.r + I_c.g + I_c.b) / 3.0, 0.0);

    float k = max(Q / max(alpha, 0.02), 1.0);
    float stretchedMean = asinh(k * I_mean) / asinh(k);
    float f_I = stretchedMean / max(I_mean, 1e-6);

    vec3 rgbOut = I_c * f_I;
    float maxChannel = max(rgbOut.r, max(rgbOut.g, rgbOut.b));
    if (maxChannel > 1.0) {
        rgbOut /= maxChannel;
    }

    rgbOut = clamp(rgbOut, 0.0, 1.0);
    return u_invertColormap ? (vec3(1.0) - rgbOut) : rgbOut;
}

void main() {
    vec2 uv = vec2(v_texCoord.x, 1.0 - v_texCoord.y);

    if (u_showFlagMask) {
        int flagSlice = (u_renderMode == 0) ? clamp(u_activeSlice, 0, 5) : 0;
        uint pixelFlags = texture(u_flagCube, vec3(uv, float(flagSlice))).r;
        uint activeBadBits = pixelFlags & u_flagFilterMask;

        if (activeBadBits != 0u) {
            float stripe = mod(gl_FragCoord.x + gl_FragCoord.y, 8.0);
            if (stripe < 3.0) {
                if ((activeBadBits & 4u) != 0u) {
                    fragColor = vec4(0.98, 0.56, 0.24, 1.0);
                    return;
                }
                fragColor = vec4(0.68, 0.12, 0.48, 1.0);
                return;
            }
        }
    }

    if (u_renderMode == 0) {
        int sliceIdx = clamp(u_activeSlice, 0, 5);
        float fluxVal = sampleSliceFlux(uv, sliceIdx);
        if (isnan(fluxVal)) {
            fragColor = vec4(0.0, 0.0, 0.0, 1.0);
            return;
        }
        float normVal = applyScalarStretch(fluxVal, u_zLimitsSingle);
        fragColor = texture(u_colormapLut, vec2(normVal, 0.5));
        return;
    }

    if (u_renderMode == 1) {
        float e1 = sampleSliceFlux(uv, 0);
        float e2 = sampleSliceFlux(uv, 1);
        float eMean = 0.5 * (e1 + e2);
        vec3 dipoleRgb = applyLuptonRGB(
            vec3(e1, eMean, e2),
            u_rgbMin,
            u_rgbScale,
            u_stretchAlpha,
            u_softeningQ
        );
        fragColor = vec4(dipoleRgb, 1.0);
        return;
    }

    if (u_renderMode == 2) {
        float chR = sampleSliceFlux(uv, clamp(u_rgbSlices.r, 0, 5));
        float chG = sampleSliceFlux(uv, clamp(u_rgbSlices.g, 0, 5));
        float chB = sampleSliceFlux(uv, clamp(u_rgbSlices.b, 0, 5));
        vec3 specRgb = applyLuptonRGB(
            vec3(chR, chG, chB),
            u_rgbMin,
            u_rgbScale,
            u_stretchAlpha,
            u_softeningQ
        );
        fragColor = vec4(specRgb, 1.0);
        return;
    }

    if (u_renderMode == 3) {
        if (abs(v_texCoord.x - u_curtainX) < 0.0022) {
            fragColor = vec4(0.07, 0.71, 0.80, 1.0);
            return;
        }

        bool isRightOfCurtain = v_texCoord.x >= u_curtainX;
        int displaySlice = isRightOfCurtain ? clamp(u_zogySlices.y, 0, 5) : clamp(u_zogySlices.x, 0, 5);
        float baseVal = sampleSliceFlux(uv, displaySlice);
        float stretched = applyScalarStretch(baseVal, u_zLimitsSingle);
        vec4 baseColor = texture(u_colormapLut, vec2(stretched, 0.5));

        if (u_showZogyOverlay && isRightOfCurtain) {
            float scorr = texture(u_fluxCube, vec3(uv, float(clamp(u_zogySlices.z, 0, 5)))).r;
            float absSigma = abs(scorr);
            if (absSigma >= u_snrThreshold) {
                float heatAlpha = clamp((absSigma - u_snrThreshold) / 8.0 + 0.35, 0.35, 0.95);
                vec3 sigColor = (scorr >= 0.0)
                    ? vec3(0.96, 0.22, 0.63)
                    : vec3(0.07, 0.71, 0.80);
                fragColor = vec4(mix(baseColor.rgb, sigColor, heatAlpha), 1.0);
                return;
            }
        }

        fragColor = baseColor;
        return;
    }

    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
}
`;

const SLICE_LABELS: Record<number, string> = {
  0: "Slice 0: SPHEREx Epoch 1 (Survey 1)",
  1: "Slice 1: SPHEREx Epoch 2 (Survey 2, +6 Mo)",
  2: "Slice 2: 16-Yr unWISE Bridge / D4–D2 Color",
  3: "Slice 3: ZOGY Proper Difference Image (D)",
  4: "Slice 4: ZOGY Significance Map (S_corr σ)",
  5: "Slice 5: Modeled Zodiacal Dust Foreground (ZODI)",
};

function decodeWebglFlagBadges(flagBits: number): string[] {
  const badges: string[] = [];
  if (flagBits === 0) return ["NOMINAL (0)"];
  if (flagBits & WEBGL_FLAG_SOURCE) badges.push("MP_SOURCE (Bit 21)");
  if (flagBits & WEBGL_FLAG_PERSIST) badges.push("MP_PERSIST (Bit 17)");
  if (flagBits & WEBGL_FLAG_DICHROIC) badges.push("MP_DICHROIC (Bit 7)");
  if (flagBits & WEBGL_FLAG_NONFUNC) badges.push("MP_NONFUNC (Bit 6)");
  if (flagBits & WEBGL_FLAG_TRANSIENT) badges.push("MP_TRANSIENT / CR");
  if (flagBits & WEBGL_FLAG_SUR_ERROR) badges.push("MP_SUR_ERROR");
  if (flagBits & WEBGL_FLAG_GHOST_STREAK) badges.push("GHOST / STREAK");
  return badges;
}

export interface WebGL2BlinkMachineProps {
  cubeData: ParsedCutoutCube | null;
  isLoading?: boolean;
  centerRaDeg: number;
  centerDecDeg: number;
  fovArcmin: number;
  activeTarget?: GoldenTarget;
  renderMode: 0 | 1 | 2 | 3;
  stretchMode: 0 | 1 | 2;
  isBlinking: boolean;
  blinkFrequencyHz: number;
  activeSlice: number;
  onActiveSliceChange?: (sliceIdx: number) => void;
  includeUnwiseInBlink?: boolean;
  stretchAlpha: number;
  softeningQ: number;
  logExponentA?: number;
  colormap: ColormapName;
  invertColormap: boolean;
  subtractZodi: boolean;
  showFlagMask: boolean;
  flagFilterMask?: number;
  trimBrightMode: TrimBrightMode;
  trimBrightPercentile?: number;
  curtainX: number;
  onCurtainXChange?: (newX: number) => void;
  snrThreshold: number;
  showZogyOverlay: boolean;
  anomalies?: RankedAnomalyCandidate[];
  selectedAnomalyId?: string | null;
  onSelectPixelSource?: (selection: {
    raDeg: number;
    decDeg: number;
    xPx: number;
    yPx: number;
    fluxUjy: number;
    zogyScorr: number;
  }) => void;
  onCursorHover?: (hover: {
    raDeg: number;
    decDeg: number;
    xPx: number;
    yPx: number;
    fluxE1Ujy: number;
    fluxE2Ujy: number;
    zodiUjy: number;
    zogyScorr: number;
    flagsUint16: number;
  } | null) => void;
}

export const WebGL2BlinkMachine: React.FC<WebGL2BlinkMachineProps> = ({
  cubeData,
  isLoading = false,
  centerRaDeg,
  centerDecDeg,
  fovArcmin,
  activeTarget,
  renderMode,
  stretchMode,
  isBlinking,
  blinkFrequencyHz,
  activeSlice,
  onActiveSliceChange,
  includeUnwiseInBlink = false,
  stretchAlpha,
  softeningQ,
  logExponentA = 1000.0,
  colormap,
  invertColormap,
  subtractZodi,
  showFlagMask,
  flagFilterMask = DEFAULT_HARDWARE_ARTIFACT_MASK,
  trimBrightMode,
  trimBrightPercentile = 99.5,
  curtainX,
  onCurtainXChange,
  snrThreshold,
  showZogyOverlay,
  anomalies = [],
  selectedAnomalyId = null,
  onSelectPixelSource,
  onCursorHover,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const vaoRef = useRef<WebGLVertexArrayObject | null>(null);
  const fluxTexRef = useRef<WebGLTexture | null>(null);
  const flagTexRef = useRef<WebGLTexture | null>(null);
  const lutTexRef = useRef<WebGLTexture | null>(null);
  const uniformLocsRef = useRef<Record<string, WebGLUniformLocation | null>>({});

  const blinkSliceRef = useRef<number>(activeSlice);
  const lastBlinkSwitchRef = useRef<number>(0);
  const fpsCounterRef = useRef<{ frames: number; lastStamp: number }>({ frames: 0, lastStamp: 0 });

  const [displaySlice, setDisplaySlice] = useState<number>(activeSlice);
  const [fps, setFps] = useState<number>(60);
  const [isDraggingCurtain, setIsDraggingCurtain] = useState<boolean>(false);
  const [cursorTelemetry, setCursorTelemetry] = useState<{
    raDeg: number;
    decDeg: number;
    xPx: number;
    yPx: number;
    fluxE1Ujy: number;
    fluxE2Ujy: number;
    zodiUjy: number;
    zogyScorr: number;
    flagsUint16: number;
  } | null>(null);
  const [clickedMarker, setClickedMarker] = useState<{ xPx: number; yPx: number } | null>(null);

  // Sync external slice changes
  useEffect(() => {
    blinkSliceRef.current = activeSlice;
    setDisplaySlice(activeSlice);
  }, [activeSlice]);

  // Pre-compute per-slice ZScale limits whenever cubeData, subtractZodi, or TrimBright changes
  const sliceZLimitsTable: SliceStretchLimits[] = useMemo(() => {
    if (!cubeData) return [];
    return computeCubeSliceZLimits(
      cubeData.floatCube,
      cubeData.width,
      cubeData.height,
      cubeData.numSlices,
      subtractZodi,
      trimBrightMode,
      trimBrightPercentile
    );
  }, [cubeData, subtractZodi, trimBrightMode, trimBrightPercentile]);

  // Initialize WebGL2 context, compile #version 300 es shaders, and bind quad VAO
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    if (!gl) return;
    glRef.current = gl;

    // Enable float linear filtering extension if supported by GPU
    const hasFloatLinear = Boolean(gl.getExtension("EXT_texture_float_linear"));

    const compileShader = (type: number, source: string): WebGLShader | null => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, source);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error("WebGL2 shader compile error:", gl.getShaderInfoLog(sh));
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    };

    const vs = compileShader(gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
    const fs = compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("WebGL2 program link error:", gl.getProgramInfoLog(prog));
      return;
    }
    programRef.current = prog;
    gl.useProgram(prog);

    // Fullscreen triangle-strip quad: [x, y, u, v]
    const quadVerts = new Float32Array([
      -1.0, -1.0, 0.0, 0.0,
       1.0, -1.0, 1.0, 0.0,
      -1.0,  1.0, 0.0, 1.0,
       1.0,  1.0, 1.0, 1.0,
    ]);
    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    vaoRef.current = vao;

    // Cache all uniform locations
    const uniformNames = [
      "u_fluxCube",
      "u_flagCube",
      "u_colormapLut",
      "u_renderMode",
      "u_stretchMode",
      "u_activeSlice",
      "u_rgbSlices",
      "u_zogySlices",
      "u_zLimitsSingle",
      "u_rgbMin",
      "u_rgbScale",
      "u_stretchAlpha",
      "u_softeningQ",
      "u_logExponentA",
      "u_invertColormap",
      "u_subtractZodi",
      "u_curtainX",
      "u_snrThreshold",
      "u_showZogyOverlay",
      "u_flagFilterMask",
      "u_showFlagMask",
    ];
    const locs: Record<string, WebGLUniformLocation | null> = {};
    for (const name of uniformNames) {
      locs[name] = gl.getUniformLocation(prog, name);
    }
    uniformLocsRef.current = locs;

    // Bind sampler texture units: 0 = u_fluxCube, 1 = u_flagCube, 2 = u_colormapLut
    gl.uniform1i(locs.u_fluxCube, 0);
    gl.uniform1i(locs.u_flagCube, 1);
    gl.uniform1i(locs.u_colormapLut, 2);

    // Create textures
    const fluxTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, fluxTex);
    gl.texParameteri(
      gl.TEXTURE_2D_ARRAY,
      gl.TEXTURE_MIN_FILTER,
      hasFloatLinear ? gl.LINEAR : gl.NEAREST
    );
    gl.texParameteri(
      gl.TEXTURE_2D_ARRAY,
      gl.TEXTURE_MAG_FILTER,
      hasFloatLinear ? gl.LINEAR : gl.NEAREST
    );
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    fluxTexRef.current = fluxTex;

    // Integer texture array (gl.R16UI) MUST use gl.NEAREST per WebGL2 specification
    const flagTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, flagTex);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    flagTexRef.current = flagTex;

    const lutTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, lutTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    lutTexRef.current = lutTex;

    return () => {
      gl.deleteTexture(fluxTex);
      gl.deleteTexture(flagTex);
      gl.deleteTexture(lutTex);
      gl.deleteBuffer(vbo);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  // Upload 6-slice Float32 (`gl.R32F`) and Uint16 (`gl.R16UI`) textures when cubeData arrives
  useEffect(() => {
    const gl = glRef.current;
    if (!gl || !cubeData || !fluxTexRef.current || !flagTexRef.current) return;

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, fluxTexRef.current);
    gl.texImage3D(
      gl.TEXTURE_2D_ARRAY,
      0,
      gl.R32F,
      cubeData.width,
      cubeData.height,
      cubeData.numSlices,
      0,
      gl.RED,
      gl.FLOAT,
      cubeData.floatCube
    );

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, flagTexRef.current);
    gl.texImage3D(
      gl.TEXTURE_2D_ARRAY,
      0,
      gl.R16UI,
      cubeData.width,
      cubeData.height,
      cubeData.numSlices,
      0,
      gl.RED_INTEGER,
      gl.UNSIGNED_SHORT,
      cubeData.uint16Flags
    );
  }, [cubeData]);

  // Upload 256x1 RGBA Colormap LUT when colormap changes
  useEffect(() => {
    const gl = glRef.current;
    if (!gl || !lutTexRef.current) return;
    const lutBytes = generateColormapLutRgba(colormap);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, lutTexRef.current);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      256,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      lutBytes
    );
  }, [colormap]);

  // Main 60-FPS requestAnimationFrame render & blink loop
  useEffect(() => {
    let rafId = 0;

    const renderFrame = (nowMs: number) => {
      // Update FPS telemetry every 500ms
      fpsCounterRef.current.frames += 1;
      if (nowMs - fpsCounterRef.current.lastStamp >= 500) {
        const currentFps = Math.min(
          60,
          Math.round((fpsCounterRef.current.frames * 1000) / (nowMs - fpsCounterRef.current.lastStamp))
        );
        setFps(currentFps);
        fpsCounterRef.current.frames = 0;
        fpsCounterRef.current.lastStamp = nowMs;
      }

      // Advance active blink slice in Mode 0 when isBlinking is enabled
      if (renderMode === 0 && isBlinking && blinkFrequencyHz > 0) {
        const periodMs = 1000.0 / Math.max(0.5, Math.min(30.0, blinkFrequencyHz));
        if (nowMs - lastBlinkSwitchRef.current >= periodMs) {
          const maxCycle = includeUnwiseInBlink ? 3 : 2;
          const nextSlice = (blinkSliceRef.current + 1) % maxCycle;
          blinkSliceRef.current = nextSlice;
          lastBlinkSwitchRef.current = nowMs;
          setDisplaySlice(nextSlice);
          if (onActiveSliceChange) {
            onActiveSliceChange(nextSlice);
          }
        }
      }

      const gl = glRef.current;
      const prog = programRef.current;
      const vao = vaoRef.current;
      const locs = uniformLocsRef.current;

      if (gl && prog && vao && cubeData && sliceZLimitsTable.length > 0) {
        const canvas = gl.canvas as HTMLCanvasElement;
        if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
          canvas.width = Math.max(256, canvas.clientWidth);
          canvas.height = Math.max(256, canvas.clientHeight);
        }
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(prog);
        gl.bindVertexArray(vao);

        const currentSlice = Math.max(0, Math.min(cubeData.numSlices - 1, blinkSliceRef.current));
        const activeZ = sliceZLimitsTable[currentSlice] || sliceZLimitsTable[0];
        const e1Z = sliceZLimitsTable[0];
        const e2Z = sliceZLimitsTable[Math.min(1, sliceZLimitsTable.length - 1)];
        const s2Z = sliceZLimitsTable[Math.min(2, sliceZLimitsTable.length - 1)];

        gl.uniform1i(locs.u_renderMode, renderMode);
        gl.uniform1i(locs.u_stretchMode, stretchMode);
        gl.uniform1i(locs.u_activeSlice, currentSlice);
        gl.uniform3i(locs.u_rgbSlices, 1, 2, 0);
        gl.uniform3i(locs.u_zogySlices, 0, 3, 4);

        gl.uniform2f(locs.u_zLimitsSingle, activeZ.z1, activeZ.z2);

        if (renderMode === 1) {
          // Mode 1 Temporal Dipole RGB: normalize E1 and E2 against their background medians & spans
          const min1 = e1Z.z1;
          const min2 = e2Z.z1;
          const minMean = 0.5 * (min1 + min2);
          const scale1 = Math.max(1.0, e1Z.z2 - e1Z.z1);
          const scale2 = Math.max(1.0, e2Z.z2 - e2Z.z1);
          const scaleMean = 0.5 * (scale1 + scale2);
          gl.uniform3f(locs.u_rgbMin, min1, minMean, min2);
          gl.uniform3f(locs.u_rgbScale, scale1, scaleMean, scale2);
        } else {
          // Mode 2 Spectral 3-Band False-Color RGB
          gl.uniform3f(locs.u_rgbMin, e2Z.z1, s2Z.z1, e1Z.z1);
          gl.uniform3f(
            locs.u_rgbScale,
            Math.max(1.0, e2Z.z2 - e2Z.z1),
            Math.max(1.0, s2Z.z2 - s2Z.z1),
            Math.max(1.0, e1Z.z2 - e1Z.z1)
          );
        }

        gl.uniform1f(locs.u_stretchAlpha, stretchAlpha);
        gl.uniform1f(locs.u_softeningQ, softeningQ);
        gl.uniform1f(locs.u_logExponentA, logExponentA);
        gl.uniform1i(locs.u_invertColormap, invertColormap ? 1 : 0);
        gl.uniform1i(locs.u_subtractZodi, subtractZodi ? 1 : 0);

        gl.uniform1f(locs.u_curtainX, curtainX);
        gl.uniform1f(locs.u_snrThreshold, snrThreshold);
        gl.uniform1i(locs.u_showZogyOverlay, showZogyOverlay ? 1 : 0);

        gl.uniform1ui(locs.u_flagFilterMask, flagFilterMask >>> 0);
        gl.uniform1i(locs.u_showFlagMask, showFlagMask ? 1 : 0);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }

      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(rafId);
  }, [
    cubeData,
    sliceZLimitsTable,
    renderMode,
    stretchMode,
    isBlinking,
    blinkFrequencyHz,
    includeUnwiseInBlink,
    stretchAlpha,
    softeningQ,
    logExponentA,
    invertColormap,
    subtractZodi,
    curtainX,
    snrThreshold,
    showZogyOverlay,
    flagFilterMask,
    showFlagMask,
    onActiveSliceChange,
  ]);

  // WCS Pixel <-> Sky Coordinate Raycaster (Gnomonic TAN projection)
  const pixelToSkyRaDec = useCallback(
    (xPx: number, yPx: number): { raDeg: number; decDeg: number } => {
      const w = cubeData?.width || 256;
      const h = cubeData?.height || 256;
      const pixscaleDeg = fovArcmin / 60.0 / w;
      const cosDec = Math.max(0.05, Math.cos((centerDecDeg * Math.PI) / 180.0));
      const raDeg = centerRaDeg + ((w / 2.0 - xPx) * pixscaleDeg) / cosDec;
      const decDeg = centerDecDeg + (h / 2.0 - yPx) * pixscaleDeg;
      return {
        raDeg: ((raDeg % 360.0) + 360.0) % 360.0,
        decDeg: Math.max(-90.0, Math.min(90.0, decDeg)),
      };
    },
    [cubeData, centerRaDeg, centerDecDeg, fovArcmin]
  );

  const skyRaDecToNormalizedCanvas = useCallback(
    (raDeg: number, decDeg: number): { u: number; v: number } | null => {
      const fovDeg = fovArcmin / 60.0;
      const cosDec = Math.max(0.05, Math.cos((centerDecDeg * Math.PI) / 180.0));
      let dRa = raDeg - centerRaDeg;
      if (dRa > 180) dRa -= 360;
      if (dRa < -180) dRa += 360;
      const u = 0.5 - (dRa * cosDec) / fovDeg;
      const v = 0.5 - (decDeg - centerDecDeg) / fovDeg;
      if (u < -0.05 || u > 1.05 || v < -0.05 || v > 1.05) return null;
      return { u, v };
    },
    [centerRaDeg, centerDecDeg, fovArcmin]
  );

  // Mouse move handler for WCS raycasting, pixel telemetry, and Mode 3 split-curtain dragging
  const handlePointerMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const normX = Math.max(0.0, Math.min(1.0, (e.clientX - rect.left) / rect.width));
    const normY = Math.max(0.0, Math.min(1.0, (e.clientY - rect.top) / rect.height));

    if (isDraggingCurtain && renderMode === 3 && onCurtainXChange) {
      onCurtainXChange(Number(normX.toFixed(3)));
    }

    if (!cubeData) return;
    const xPx = Math.min(cubeData.width - 1, Math.max(0, Math.floor(normX * cubeData.width)));
    const yPx = Math.min(cubeData.height - 1, Math.max(0, Math.floor(normY * cubeData.height)));
    const { raDeg, decDeg } = pixelToSkyRaDec(xPx, yPx);

    const sliceStride = cubeData.width * cubeData.height;
    const pixIdx = yPx * cubeData.width + xPx;
    const fluxE1 = cubeData.floatCube[0 * sliceStride + pixIdx] || 0;
    const fluxE2 = cubeData.floatCube[1 * sliceStride + pixIdx] || 0;
    const zogyScorr = cubeData.floatCube[4 * sliceStride + pixIdx] || 0;
    const zodiUjy = cubeData.numSlices >= 6 ? cubeData.floatCube[5 * sliceStride + pixIdx] || 0 : 0;
    const flagsU16 = cubeData.uint16Flags[pixIdx] || 0;

    const info = {
      raDeg,
      decDeg,
      xPx,
      yPx,
      fluxE1Ujy: fluxE1,
      fluxE2Ujy: fluxE2,
      zodiUjy,
      zogyScorr,
      flagsUint16: flagsU16,
    };
    setCursorTelemetry(info);
    if (onCursorHover) onCursorHover(info);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDraggingCurtain || !cubeData) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const normX = Math.max(0.0, Math.min(1.0, (e.clientX - rect.left) / rect.width));
    const normY = Math.max(0.0, Math.min(1.0, (e.clientY - rect.top) / rect.height));
    const xPx = Math.min(cubeData.width - 1, Math.max(0, Math.floor(normX * cubeData.width)));
    const yPx = Math.min(cubeData.height - 1, Math.max(0, Math.floor(normY * cubeData.height)));

    setClickedMarker({ xPx, yPx });
    const { raDeg, decDeg } = pixelToSkyRaDec(xPx, yPx);
    const sliceStride = cubeData.width * cubeData.height;
    const pixIdx = yPx * cubeData.width + xPx;
    const fluxUjy = cubeData.floatCube[1 * sliceStride + pixIdx] || 0;
    const zogyScorr = cubeData.floatCube[4 * sliceStride + pixIdx] || 0;

    if (onSelectPixelSource) {
      onSelectPixelSource({ raDeg, decDeg, xPx, yPx, fluxUjy, zogyScorr });
    }
  };

  // Compute proper-motion track vector overlay if activeTarget has a 2010 WISE or J2000 reference position
  const properMotionVectorSvg = useMemo(() => {
    if (
      !activeTarget ||
      activeTarget.raRefDeg === undefined ||
      activeTarget.decRefDeg === undefined
    ) {
      return null;
    }
    const pRef = skyRaDecToNormalizedCanvas(activeTarget.raRefDeg, activeTarget.decRefDeg);
    const pNow = skyRaDecToNormalizedCanvas(activeTarget.raDeg, activeTarget.decDeg);
    if (!pRef || !pNow) return null;
    return {
      x1Pct: pRef.u * 100,
      y1Pct: pRef.v * 100,
      x2Pct: pNow.u * 100,
      y2Pct: pNow.v * 100,
      refLabel: activeTarget.refEpochLabel || "2010 WISE",
      shiftArcsec: activeTarget.shift16YrArcsec,
    };
  }, [activeTarget, skyRaDecToNormalizedCanvas]);

  const cursorSexagesimal = useMemo(() => {
    if (!cursorTelemetry) return null;
    return formatSexagesimal(cursorTelemetry.raDeg, cursorTelemetry.decDeg);
  }, [cursorTelemetry]);

  return (
    <div
      className="relative w-full h-full bg-black select-none overflow-hidden cursor-crosshair"
      onMouseMove={handlePointerMove}
      onMouseUp={() => setIsDraggingCurtain(false)}
      onMouseLeave={() => {
        setIsDraggingCurtain(false);
        setCursorTelemetry(null);
      }}
      onClick={handleCanvasClick}
    >
      {/* WebGL2 Float32 R32F & R16UI Cutout Canvas */}
      <canvas ref={canvasRef} className="w-full h-full block" />

      {/* SVG Overlay: 16-Year Proper Motion Track Vector & Ranked Anomaly Reticles */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          <marker
            id="pm-arrowhead"
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="4"
            orient="auto"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill="#12B5CB" />
          </marker>
        </defs>

        {properMotionVectorSvg && (
          <g>
            <line
              x1={`${properMotionVectorSvg.x1Pct}%`}
              y1={`${properMotionVectorSvg.y1Pct}%`}
              x2={`${properMotionVectorSvg.x2Pct}%`}
              y2={`${properMotionVectorSvg.y2Pct}%`}
              stroke="#12B5CB"
              strokeWidth="2"
              strokeDasharray="4 3"
              markerEnd="url(#pm-arrowhead)"
            />
            <circle
              cx={`${properMotionVectorSvg.x1Pct}%`}
              cy={`${properMotionVectorSvg.y1Pct}%`}
              r="5"
              fill="none"
              stroke="#FA903E"
              strokeWidth="1.75"
            />
            <circle
              cx={`${properMotionVectorSvg.x2Pct}%`}
              cy={`${properMotionVectorSvg.y2Pct}%`}
              r="6"
              fill="none"
              stroke="#12B5CB"
              strokeWidth="2"
            />
          </g>
        )}

        {/* Top-10 ONNX Anomaly Reticles */}
        {cubeData &&
          anomalies.slice(0, 5).map((cand) => {
            const cxPct = ((cand.xPx + 0.5) / cubeData.width) * 100;
            const cyPct = ((cand.yPx + 0.5) / cubeData.height) * 100;
            const isSelected = selectedAnomalyId === cand.id;
            const strokeColor =
              cand.classification === "PLANET_X_CANDIDATE"
                ? "#F538A0"
                : cand.classification === "COLD_BROWN_DWARF"
                ? "#12B5CB"
                : "#FA903E";
            return (
              <g key={cand.id}>
                <circle
                  cx={`${cxPct}%`}
                  cy={`${cyPct}%`}
                  r={isSelected ? "12" : "8"}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={isSelected ? "2.2" : "1.4"}
                  strokeDasharray={isSelected ? "none" : "3 2"}
                />
                <text
                  x={`${cxPct + 1.4}%`}
                  y={`${cyPct - 1.2}%`}
                  fill={strokeColor}
                  fontSize="10"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  #{cand.rank} ({cand.snr.toFixed(1)}σ)
                </text>
              </g>
            );
          })}

        {/* Clicked Source Crosshair */}
        {cubeData && clickedMarker && (
          <g>
            <circle
              cx={`${((clickedMarker.xPx + 0.5) / cubeData.width) * 100}%`}
              cy={`${((clickedMarker.yPx + 0.5) / cubeData.height) * 100}%`}
              r="10"
              fill="none"
              stroke="#10B981"
              strokeWidth="2"
            />
          </g>
        )}
      </svg>

      {/* Mode 3 Interactive Split-Curtain Drag Handle */}
      {renderMode === 3 && (
        <div
          style={{ left: `${curtainX * 100}%` }}
          className="absolute top-0 bottom-0 -ml-3 w-6 cursor-ew-resize flex items-center justify-center z-20"
          onMouseDown={(e) => {
            e.stopPropagation();
            setIsDraggingCurtain(true);
          }}
        >
          <div className="bg-spherex-cyan text-black text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shadow-lg border border-white/40">
            ⇔ ZOGY
          </div>
        </div>
      )}

      {/* Top-Left HUD Badge: Active Mode, Epoch Slice, ZODI Status & 60-FPS Telemetry */}
      <div className="absolute top-2.5 left-2.5 flex flex-wrap items-center gap-1.5 pointer-events-none z-10">
        <span className="bg-cosmos-950/90 border border-cosmos-700 px-2.5 py-1 rounded text-[11px] font-mono text-spherex-cyan font-semibold">
          {renderMode === 0
            ? SLICE_LABELS[displaySlice] || `Slice ${displaySlice}`
            : renderMode === 1
            ? "Mode 1: Temporal Dipole RGB (R=E1, G=Mean, B=E2)"
            : renderMode === 2
            ? "Mode 2: 102-Band Spectral False-Color RGB"
            : "Mode 3: ZOGY Proper Subtraction + S_corr Heatmap"}
        </span>
        <span
          className={`px-2 py-1 rounded text-[10px] font-mono font-semibold border ${
            subtractZodi
              ? "bg-emerald-950/85 border-emerald-600/60 text-emerald-300"
              : "bg-amber-950/85 border-amber-500/70 text-amber-300"
          }`}
        >
          {subtractZodi ? "ZODI SUBTRACTED (Clean)" : "RAW + ZODI FOREGROUND"}
        </span>
        <span className="bg-cosmos-950/85 border border-cosmos-700 px-2 py-1 rounded text-[10px] font-mono text-neutral-300">
          {fps} FPS | R32F + R16UI GPU
        </span>
      </div>

      {/* Proper-Motion Vector Legend Pill (when viewing WISE 0855, Barnard's Star, etc.) */}
      {properMotionVectorSvg && (
        <div className="absolute top-11 left-2.5 bg-cosmos-950/90 border border-spherex-cyan/40 px-2.5 py-1 rounded text-[10px] font-mono text-neutral-200 pointer-events-none z-10">
          <span className="text-spherex-amber font-semibold">○ {properMotionVectorSvg.refLabel}</span>
          {" → "}
          <span className="text-spherex-cyan font-semibold">◎ SPHEREx 2025.8</span>
          {properMotionVectorSvg.shiftArcsec > 0 && (
            <span className="ml-1.5 text-emerald-400">
              (Δθ = {properMotionVectorSvg.shiftArcsec.toFixed(1)}&quot;)
            </span>
          )}
        </div>
      )}

      {/* Bottom HUD Bar: Real-Time WCS Raycast Coordinates, Flux (uJy), ZOGY S_corr & FLAGS */}
      {cursorTelemetry && cursorSexagesimal && (
        <div className="absolute bottom-2 left-2 right-2 bg-cosmos-950/90 border border-cosmos-700/90 px-3 py-1.5 rounded flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-neutral-200 pointer-events-none z-10">
          <div className="flex items-center gap-3">
            <span>
              <strong className="text-spherex-cyan">RA:</strong> {cursorTelemetry.raDeg.toFixed(5)}° (
              {cursorSexagesimal.raHms})
            </span>
            <span>
              <strong className="text-spherex-cyan">Dec:</strong> {cursorTelemetry.decDeg.toFixed(5)}° (
              {cursorSexagesimal.decDms})
            </span>
            <span className="text-neutral-400">
              [X:{cursorTelemetry.xPx}, Y:{cursorTelemetry.yPx}]
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span>
              <strong className="text-spherex-amber">E1:</strong> {cursorTelemetry.fluxE1Ujy.toFixed(1)} µJy
            </span>
            <span>
              <strong className="text-spherex-cyan">E2:</strong> {cursorTelemetry.fluxE2Ujy.toFixed(1)} µJy
            </span>
            <span>
              <strong className="text-spherex-magenta">ZOGY S_corr:</strong>{" "}
              {cursorTelemetry.zogyScorr >= 0 ? "+" : ""}
              {cursorTelemetry.zogyScorr.toFixed(2)}σ
            </span>
            <span className="px-1.5 py-0.5 rounded bg-cosmos-800 text-[10px] text-emerald-300">
              {decodeWebglFlagBadges(cursorTelemetry.flagsUint16)[0]}
            </span>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-cosmos-950/75 backdrop-blur-sm flex flex-col items-center justify-center z-30">
          <div className="w-8 h-8 border-2 border-spherex-cyan border-t-transparent rounded-full animate-spin mb-2" />
          <p className="text-xs font-mono text-spherex-cyan">
            Streaming 6-Slice Float32 + Uint16 Cutout Cube to WebGL2 GPU...
          </p>
        </div>
      )}
    </div>
  );
};