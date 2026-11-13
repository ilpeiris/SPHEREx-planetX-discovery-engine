#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DArray;
precision highp usampler2DArray;

in vec2 v_texCoord;
out vec4 fragColor;

// 6-Slice 32-Bit Float Science & ZOGY Cube (gl.R32F):
//   Slice 0 = Epoch 1 Flux (uJy, ZODI-subtracted)
//   Slice 1 = Epoch 2 Flux (uJy, ZODI-subtracted)
//   Slice 2 = Archival unWISE (16-yr Bridge) / D4-D2 / CSA NEOSSat Flux (uJy)
//   Slice 3 = ZOGY Proper Difference Image D (whitened)
//   Slice 4 = ZOGY Significance Map S_corr (in Gaussian sigma)
//   Slice 5 = ZODI Foreground Model (uJy) for 60-FPS toggle (Micro-Safeguard #1)
uniform sampler2DArray u_fluxCube;

// 6-Slice 16-Bit Unsigned Integer SPHEREx FLAGS Bitmask Cube (gl.R16UI):
//   Bit 0 (1u)  = NONFUNC (dead/hot/cold/missing)
//   Bit 1 (2u)  = DICHROIC (>50% beam-splitter edge attenuation)
//   Bit 2 (4u)  = PERSIST (persistent charge trap from prior bright star)
//   Bit 3 (8u)  = TRANSIENT (cosmic ray / snowball)
//   Bit 4 (16u) = SUR_ERROR (ramp error / nonlinearity / bloom)
//   Bit 5 (32u) = GHOST_STREAK (optical ghost / crosstalk / satellite trail)
//   Bit 6 (64u) = MP_SOURCE (known reference catalog star/galaxy - benign)
uniform usampler2DArray u_flagCube;

// 256x1 RGBA Colormap Lookup Table (Viridis, Inferno, Cubehelix, Magma, Grayscale)
uniform sampler2D u_colormapLut;

// Inspection Mode:
//   0 = 60-FPS Epoch Blink Comparator / Single Slice View
//   1 = Temporal Dipole Lupton RGB Mapper (R = E1, G = (E1+E2)/2, B = E2)
//   2 = 102-Band Spectral False-Color RGB Composite
//   3 = Difference Image Split-Curtain & ZOGY S_corr Sigma Heatmap
uniform int u_renderMode;

// Stretch Algorithm: 0 = Linear/ZScale, 1 = Asinh, 2 = Log
uniform int u_stretchMode;

// Active Slice Pointers inside u_fluxCube (0..5)
uniform int u_activeSlice;
uniform ivec3 u_rgbSlices;   // (sliceR, sliceG, sliceB) for Modes 1 & 2
uniform ivec3 u_zogySlices;  // (sliceRef=0, sliceDiff=3, sliceScorr=4) for Mode 3

// Stretch & Normalization Uniforms
uniform vec2 u_zLimitsSingle; // (z1, z2) for active slice in Mode 0 & Mode 3
uniform vec3 u_rgbMin;        // Background floor (m_R, m_G, m_B) for Modes 1 & 2
uniform vec3 u_rgbScale;      // Channel scale weights (beta_R, beta_G, beta_B)
uniform float u_stretchAlpha; // Linear stretch factor alpha (e.g., 0.05 - 0.80)
uniform float u_softeningQ;   // Asinh softening parameter Q (e.g., 1.0 - 25.0)
uniform float u_logExponentA; // Log stretch factor a (e.g., 1000.0)
uniform bool u_invertColormap;

// Micro-Safeguard #1: Live 60-FPS Zodiacal Dust Foreground Subtraction Toggle
uniform bool u_subtractZodi;

// Mode 3 Split-Curtain & ZOGY Significance Threshold Uniforms
uniform float u_curtainX;      // Normalized X position [0.0, 1.0] of swipe curtain
uniform float u_snrThreshold;  // ZOGY |S_corr| sigma threshold (3.0 to 15.0)
uniform bool u_showZogyOverlay;

// SPHEREx Hardware Bitmask Hatching Uniforms
uniform uint u_flagFilterMask; // Default 63u (Bits 0..5, excluding benign Bit 6 MP_SOURCE)
uniform bool u_showFlagMask;

// Read calibrated flux at (uv, sliceIdx), optionally adding Slice 5 (ZODI model)
// back when u_subtractZodi is false (Micro-Safeguard #1)
float sampleSliceFlux(vec2 uv, int sliceIdx) {
    float val = texture(u_fluxCube, vec3(uv, float(sliceIdx))).r;
    if (!u_subtractZodi && (sliceIdx == 0 || sliceIdx == 1)) {
        float zodiVal = texture(u_fluxCube, vec3(uv, 5.0)).r;
        val += zodiVal;
    }
    return val;
}

// Apply 1D dynamic range stretch (Linear, Asinh, or Log) to raw intensity
float applyScalarStretch(float rawIntensity, vec2 zLimits) {
    float span = max(zLimits.y - zLimits.x, 1e-6);
    float x = clamp((rawIntensity - zLimits.x) / span, 0.0, 1.0);

    if (u_stretchMode == 1) {
        // Parametric Inverse Hyperbolic Sine (AsinhStretch)
        float k = max(u_stretchAlpha * u_softeningQ, 1e-4);
        x = asinh(k * x) / asinh(k);
    } else if (u_stretchMode == 2) {
        // Logarithmic stretch for faint circumstellar halos & cometary comae
        float a = max(u_logExponentA, 1.0);
        x = log(a * x + 1.0) / log(a + 1.0);
    }

    return u_invertColormap ? (1.0 - x) : x;
}

// Lupton et al. (2004) Color-Preserving Asinh RGB Compositing
// Preserves intrinsic chromaticity inside saturated stellar cores & moving dipoles
vec3 applyLuptonRGB(vec3 rawRgb, vec3 minRgb, vec3 scaleRgb, float alpha, float Q) {
    vec3 I_c = max((rawRgb - minRgb) / max(scaleRgb, vec3(1e-6)), vec3(0.0));
    float I_mean = (I_c.r + I_c.g + I_c.b) / 3.0;

    float safeAlpha = max(alpha, 1e-4);
    float safeQ = max(Q, 1e-4);
    float f_I = asinh(safeQ * (I_mean / safeAlpha)) / (safeQ * max(I_mean, 1e-7));

    vec3 rgbOut = I_c * f_I;
    float maxChannel = max(rgbOut.r, max(rgbOut.g, rgbOut.b));
    if (maxChannel > 1.0) {
        rgbOut /= maxChannel;
    }

    rgbOut = clamp(rgbOut, 0.0, 1.0);
    return u_invertColormap ? (vec3(1.0) - rgbOut) : rgbOut;
}

void main() {
    // Flip Y coordinate so FITS bottom-left origin (1, 1) aligns with North-up sky
    vec2 uv = vec2(v_texCoord.x, 1.0 - v_texCoord.y);

    // 1. Hardware Bitmask Check for SPHEREx NONFUNC / DICHROIC / PERSIST / CR flags
    if (u_showFlagMask) {
        int flagSlice = (u_renderMode == 0) ? clamp(u_activeSlice, 0, 5) : 0;
        uint pixelFlags = texture(u_flagCube, vec3(uv, float(flagSlice))).r;
        uint activeBadBits = pixelFlags & u_flagFilterMask;

        if (activeBadBits != 0u) {
            // Diagonal GPU hatch pattern so underlying star/artifact remains semi-visible
            float stripe = mod(gl_FragCoord.x + gl_FragCoord.y, 8.0);
            if (stripe < 3.0) {
                // Bit 2 (4u) = MP_PERSIST -> Highlight in vivid amber-gold
                if ((activeBadBits & 4u) != 0u) {
                    fragColor = vec4(0.98, 0.56, 0.24, 1.0);
                    return;
                }
                // Bit 1 (2u) = MP_DICHROIC / Bit 0 (1u) = MP_NONFUNC -> Hatched magenta
                fragColor = vec4(0.68, 0.12, 0.48, 1.0);
                return;
            }
        }
    }

    // ------------------------------------------------------------------------
    // MODE 0: 60-FPS Epoch Blink Comparator / Single Slice View
    // ------------------------------------------------------------------------
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

    // ------------------------------------------------------------------------
    // MODE 1: Temporal Dipole RGB Mapper (Planet X & Brown Dwarf Hunter)
    // Maps Epoch 1 -> Red, Mean(E1, E2) -> Green, Epoch 2 -> Blue
    // Stationary stars render white/gray; moving objects pop as Red-Blue dipoles!
    // ------------------------------------------------------------------------
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

    // ------------------------------------------------------------------------
    // MODE 2: 102-Band Spectral False-Color Composite Mapper
    // ------------------------------------------------------------------------
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

    // ------------------------------------------------------------------------
    // MODE 3: Difference Image Split-Curtain & ZOGY S_corr Sigma Heatmap
    // ------------------------------------------------------------------------
    if (u_renderMode == 3) {
        // Draw 2px vertical cyan divider at interactive split-curtain boundary
        if (abs(v_texCoord.x - u_curtainX) < 0.0022) {
            fragColor = vec4(0.07, 0.71, 0.80, 1.0);
            return;
        }

        bool isRightOfCurtain = v_texCoord.x >= u_curtainX;
        int displaySlice = isRightOfCurtain ? clamp(u_zogySlices.y, 0, 5) : clamp(u_zogySlices.x, 0, 5);
        float baseVal = sampleSliceFlux(uv, displaySlice);
        float stretched = applyScalarStretch(baseVal, u_zLimitsSingle);
        vec4 baseColor = texture(u_colormapLut, vec2(stretched, 0.5));

        // Overlay ZOGY Astrometric-Variance-Corrected Significance Map S_corr (in sigma)
        if (u_showZogyOverlay && isRightOfCurtain) {
            float scorr = texture(u_fluxCube, vec3(uv, float(clamp(u_zogySlices.z, 0, 5)))).r;
            float absSigma = abs(scorr);
            if (absSigma >= u_snrThreshold) {
                float heatAlpha = clamp((absSigma - u_snrThreshold) / 8.0 + 0.35, 0.35, 0.95);
                // Positive lobe / Epoch 2 transient -> Glowing Magenta (#F538A0)
                // Negative lobe / Epoch 1 dipole footprint -> Glowing Cyan (#12B5CB)
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




// ============================================================================
// Author:     M.D.Isuru Lakmal Peiris (@ilpeiris) 
// project     SPHEREx x Planet X - 102-Band WebGL2 & WASM Discovery Engine
// Repository: https://github.com/ilpeiris/SPHEREx-planetX-discovery-engine
// LinkedIn:   https://www.linkedin.com/in/ilpeiris
// Github     https://github.com/ilpeiris/
// license     MIT License | Copyright (c) 2026 M.D.Isuru Lakmal Peiris
// ============================================================================