// frontend/src/components/WiseViewControlBar.tsx
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
import React from "react";
import {
  Eye,
  Flame,
  Layers,
  Pause,
  Play,
  ShieldAlert,
  Sliders,
  SplitSquareHorizontal,
  Zap,
} from "lucide-react";
import { COLORMAP_OPTIONS, ColormapName } from "../lib/colormapLut";
import {
  SPECTRAL_RGB_PRESETS,
  SPHEREX_DETECTOR_BANDS,
  SpectralRgbPreset,
} from "../lib/goldenCatalog";
import { TrimBrightMode } from "../lib/zscale";

export interface WiseViewControlBarProps {
  renderMode: 0 | 1 | 2 | 3;
  onChangeRenderMode: (mode: 0 | 1 | 2 | 3) => void;
  isBlinking: boolean;
  onToggleBlinking: () => void;
  blinkFrequencyHz: number;
  onChangeBlinkFrequencyHz: (hz: number) => void;
  activeSlice: number;
  onChangeActiveSlice: (sliceIdx: number) => void;
  includeUnwiseInBlink: boolean;
  onToggleIncludeUnwiseInBlink: () => void;
  channel: number;
  onChangeChannel: (ch: number) => void;
  coaddDetector?: boolean;
  onChangeCoaddDetector?: (coadd: boolean) => void;
  alignmentMode: "narrowband" | "detector_coadd" | "d4_minus_d2";
  onChangeAlignmentMode: (mode: "narrowband" | "detector_coadd" | "d4_minus_d2") => void;
  stretchMode: 0 | 1 | 2;
  onChangeStretchMode: (mode: 0 | 1 | 2) => void;
  stretchAlpha: number;
  onChangeStretchAlpha: (alpha: number) => void;
  softeningQ: number;
  onChangeSofteningQ: (q: number) => void;
  trimBrightMode: TrimBrightMode;
  onChangeTrimBrightMode: (mode: TrimBrightMode) => void;
  trimBrightPercentile: number;
  onChangeTrimBrightPercentile: (pct: number) => void;
  colormap: ColormapName;
  onChangeColormap: (cmap: ColormapName) => void;
  invertColormap: boolean;
  onToggleInvertColormap: () => void;
  subtractZodi: boolean;
  onToggleSubtractZodi: () => void;
  showFlagMask: boolean;
  onToggleShowFlagMask: () => void;
  curtainX: number;
  onChangeCurtainX: (x: number) => void;
  snrThreshold: number;
  onChangeSnrThreshold: (snr: number) => void;
  showZogyOverlay: boolean;
  onToggleShowZogyOverlay: () => void;
  activeRgbPresetId: string;
  onSelectRgbPreset: (preset: SpectralRgbPreset) => void;
}

function getChannelWavelengthAndDetector(globalChannel: number) {
  const ch = Math.max(1, Math.min(102, Math.round(globalChannel)));
  const bandId = (Math.floor((ch - 1) / 17) + 1) as 1 | 2 | 3 | 4 | 5 | 6;
  const localCh = ((ch - 1) % 17) + 1;
  const det = SPHEREX_DETECTOR_BANDS[bandId - 1];
  const ratio = det.wavelengthMaxUm / det.wavelengthMinUm;
  const cwaveUm = det.wavelengthMinUm * Math.pow(ratio, (localCh - 0.5) / 17.0);
  const bwUm = cwaveUm / det.resolvingPower;
  return { ch, bandId, localCh, det, cwaveUm, bwUm };
}

export const WiseViewControlBar: React.FC<WiseViewControlBarProps> = ({
  renderMode,
  onChangeRenderMode,
  isBlinking,
  onToggleBlinking,
  blinkFrequencyHz,
  onChangeBlinkFrequencyHz,
  activeSlice,
  onChangeActiveSlice,
  includeUnwiseInBlink,
  onToggleIncludeUnwiseInBlink,
  channel,
  onChangeChannel,
  coaddDetector = false,
  onChangeCoaddDetector,
  alignmentMode,
  onChangeAlignmentMode,
  stretchMode,
  onChangeStretchMode,
  stretchAlpha,
  onChangeStretchAlpha,
  softeningQ,
  onChangeSofteningQ,
  trimBrightMode,
  onChangeTrimBrightMode,
  trimBrightPercentile,
  onChangeTrimBrightPercentile,
  colormap,
  onChangeColormap,
  invertColormap,
  onToggleInvertColormap,
  subtractZodi,
  onToggleSubtractZodi,
  showFlagMask,
  onToggleShowFlagMask,
  curtainX,
  onChangeCurtainX,
  snrThreshold,
  onChangeSnrThreshold,
  showZogyOverlay,
  onToggleShowZogyOverlay,
  activeRgbPresetId,
  onSelectRgbPreset,
}) => {
  const chMeta = getChannelWavelengthAndDetector(channel);

  const MODE_TABS: Array<{ id: 0 | 1 | 2 | 3; label: string; badge: string }> = [
    { id: 0, label: "60-FPS Blink Comparator", badge: "Mode 0" },
    { id: 1, label: "Temporal Dipole RGB", badge: "Mode 1" },
    { id: 2, label: "102-Band False-Color RGB", badge: "Mode 2" },
    { id: 3, label: "ZOGY Split-Curtain & S_corr", badge: "Mode 3" },
  ];

  const SLICE_BUTTONS: Array<{ idx: number; short: string; title: string }> = [
    { idx: 0, short: "E1 (2025.4)", title: "Slice 0: SPHEREx Epoch 1 Calibrated Flux (µJy)" },
    { idx: 1, short: "E2 (2025.9)", title: "Slice 1: SPHEREx Epoch 2 Calibrated Flux (µJy)" },
    { idx: 2, short: "16-Yr unWISE / D4–D2", title: "Slice 2: Archival 2010–2024 unWISE Bridge or D4–D2 Color" },
    { idx: 3, short: "ZOGY Diff (D)", title: "Slice 3: ZOGY Proper Difference Image D" },
    { idx: 4, short: "ZOGY S_corr (σ)", title: "Slice 4: Astrometric-Variance-Corrected Significance Map" },
    { idx: 5, short: "ZODI Model", title: "Slice 5: Modeled Solar System Zodiacal Dust Foreground" },
  ];

  return (
    <div className="w-full bg-cosmos-900/95 border border-cosmos-700 rounded-lg p-3 space-y-3 text-neutral-100 select-none">
      {/* Top Bar: The 4 Interactive Inspection Mode Tabs + Co-Located SPHEREx Cutout Toggles */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-cosmos-800">
        <div className="flex flex-wrap items-center gap-1.5">
          {MODE_TABS.map((tab) => {
            const active = renderMode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onChangeRenderMode(tab.id)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-mono transition flex items-center gap-1.5 border ${
                  active
                    ? "bg-spherex-cyan text-cosmos-950 border-spherex-cyan font-bold shadow"
                    : "bg-cosmos-950 hover:bg-cosmos-800 text-neutral-300 border-cosmos-700"
                }`}
              >
                <span
                  className={`text-[10px] px-1 rounded ${
                    active ? "bg-black/20 text-white" : "bg-cosmos-800 text-spherex-cyan"
                  }`}
                >
                  {tab.badge}
                </span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right: Co-located SPHEREx Stacking Mode (6-Det Co-Add vs D4-D2) + Live ZODI & FLAGS Toggles */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              const nextCoadd = !coaddDetector;
              if (onChangeCoaddDetector) onChangeCoaddDetector(nextCoadd);
              onChangeAlignmentMode(nextCoadd ? "detector_coadd" : "narrowband");
            }}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-mono border transition ${
              coaddDetector
                ? "bg-emerald-950/90 border-emerald-500 text-emerald-300 font-bold"
                : "bg-cosmos-950 border-cosmos-700 text-neutral-300 hover:border-neutral-500"
            }`}
            title="Co-add all 17 spectral channels per SPHEREx detector array (D1-D6) for a 4.1x SNR boost"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{coaddDetector ? "6-Det Co-Add: ON (4.1× SNR)" : "6-Det SNR Co-Add"}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const nextMode = alignmentMode === "d4_minus_d2" ? "narrowband" : "d4_minus_d2";
              if (nextMode === "d4_minus_d2" && onChangeCoaddDetector) {
                onChangeCoaddDetector(false);
              }
              onChangeAlignmentMode(nextMode);
            }}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-mono border transition ${
              alignmentMode === "d4_minus_d2" && !coaddDetector
                ? "bg-spherex-amber text-cosmos-950 border-spherex-amber font-bold"
                : "bg-cosmos-950 border-cosmos-700 text-neutral-300 hover:border-neutral-500"
            }`}
            title="Caltech/IPAC Source Discovery Tool D4 (2.42–3.82 µm) minus D2 (1.10–1.62 µm) color subtraction"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>D4–D2 Cold Object Filter</span>
          </button>

          <button
            type="button"
            onClick={onToggleSubtractZodi}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-mono border transition ${
              subtractZodi
                ? "bg-emerald-950/90 border-emerald-500 text-emerald-300 font-semibold"
                : "bg-amber-950/90 border-amber-500 text-amber-300 font-semibold"
            }`}
            title="Toggle HDU 4 (ZODI) zodiacal dust foreground subtraction on the GPU in <0.4ms at 60 FPS"
          >
            <Flame className="w-3.5 h-3.5" />
            <span>{subtractZodi ? "ZODI Subtracted: ON" : "ZODI Subtracted: OFF (Raw)"}</span>
          </button>

          <button
            type="button"
            onClick={onToggleShowFlagMask}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-mono border transition ${
              showFlagMask
                ? "bg-fuchsia-950/90 border-spherex-magenta text-spherex-magenta font-semibold"
                : "bg-cosmos-950 border-cosmos-700 text-neutral-400 hover:text-neutral-200"
            }`}
            title="Hatch pixels flagged in HDU 2 (FLAGS: DICHROIC, NONFUNC, PERSIST, CR, SUR_ERROR)"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>FLAGS Bitmask: {showFlagMask ? "ON" : "OFF"}</span>
          </button>
        </div>
      </div>

      {/* Middle Row: 102-Band LVF Wavelength Scrubber & Detector Band Bar */}
      <div className="bg-cosmos-950/90 border border-cosmos-800 rounded-md p-2.5 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
          <div className="flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-spherex-cyan" />
            <span className="font-semibold text-white">
              SPHEREx 102-Band Linear Variable Filter (LVF) Scrubber:
            </span>
            <span className="bg-spherex-cyan/20 border border-spherex-cyan/50 text-spherex-cyan px-2 py-0.5 rounded">
              Ch {chMeta.ch} / 102 • λc = {chMeta.cwaveUm.toFixed(3)} µm (Δλ = {chMeta.bwUm.toFixed(3)} µm)
            </span>
            <span className="bg-cosmos-800 text-neutral-300 px-2 py-0.5 rounded">
              {chMeta.det.name} (R = {chMeta.det.resolvingPower}) • Dichroic Pair: D{chMeta.det.dichroicPartner}
            </span>
          </div>
          <span className="text-[11px] text-neutral-400 truncate max-w-md">
            {chMeta.det.diagnostics}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-neutral-400">0.75 µm</span>
          <input
            type="range"
            min={1}
            max={102}
            step={1}
            value={channel}
            onChange={(e) => onChangeChannel(Number(e.target.value))}
            className="flex-1 accent-spherex-cyan h-1.5 bg-cosmos-800 rounded-lg cursor-pointer"
          />
          <span className="text-[10px] font-mono text-neutral-400">5.00 µm</span>
        </div>

        {/* 6 Detector Quick-Jump Buttons */}
        <div className="grid grid-cols-6 gap-1.5 pt-0.5">
          {SPHEREX_DETECTOR_BANDS.map((det) => {
            const isBandActive = chMeta.bandId === det.bandId;
            const midCh = Math.floor((det.channelStart + det.channelEnd) / 2);
            return (
              <button
                key={det.bandId}
                type="button"
                onClick={() => onChangeChannel(midCh)}
                className={`px-2 py-1 rounded text-[10px] font-mono transition border text-center truncate ${
                  isBandActive
                    ? "bg-spherex-cyan/20 border-spherex-cyan text-spherex-cyan font-bold"
                    : "bg-cosmos-900 hover:bg-cosmos-800 border-cosmos-800 text-neutral-400"
                }`}
              >
                D{det.bandId}: {det.wavelengthMinUm.toFixed(2)}–{det.wavelengthMaxUm.toFixed(2)}µm (R={det.resolvingPower})
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom Grid: Mode-Specific Controls + WiseView Asinh / ZScale / Colormap Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Left 6 Columns: Mode-Specific Controls (Blink Cadence / RGB Presets / ZOGY Curtain) */}
        <div className="lg:col-span-6 bg-cosmos-950/90 border border-cosmos-800 rounded-md p-2.5 flex flex-col justify-between space-y-2">
          {renderMode === 0 && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onToggleBlinking}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono font-bold transition ${
                      isBlinking
                        ? "bg-spherex-amber text-cosmos-950"
                        : "bg-spherex-cyan text-cosmos-950"
                    }`}
                  >
                    {isBlinking ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{isBlinking ? "Pause Blink" : "Auto-Blink"}</span>
                  </button>

                  <label className="flex items-center gap-1.5 text-[11px] font-mono text-neutral-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeUnwiseInBlink}
                      onChange={onToggleIncludeUnwiseInBlink}
                      className="rounded border-cosmos-700 accent-spherex-cyan"
                    />
                    <span>Include 16-Yr unWISE in Loop</span>
                  </label>
                </div>

                <div className="flex items-center gap-2 text-xs font-mono">
                  <span className="text-neutral-400">Cadence:</span>
                  <input
                    type="range"
                    min={0.5}
                    max={15.0}
                    step={0.5}
                    value={blinkFrequencyHz}
                    onChange={(e) => onChangeBlinkFrequencyHz(Number(e.target.value))}
                    className="w-24 accent-spherex-cyan cursor-pointer"
                  />
                  <span className="text-spherex-cyan font-bold w-12 text-right">
                    {blinkFrequencyHz.toFixed(1)} Hz
                  </span>
                </div>
              </div>

              {/* Manual 6-Slice Selector Buttons */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1">
                {SLICE_BUTTONS.map((s) => (
                  <button
                    key={s.idx}
                    type="button"
                    title={s.title}
                    onClick={() => onChangeActiveSlice(s.idx)}
                    className={`px-1.5 py-1 rounded text-[10px] font-mono truncate border transition ${
                      activeSlice === s.idx
                        ? "bg-spherex-cyan text-cosmos-950 border-spherex-cyan font-bold"
                        : "bg-cosmos-900 hover:bg-cosmos-800 text-neutral-300 border-cosmos-800"
                    }`}
                  >
                    {s.short}
                  </button>
                ))}
              </div>
            </>
          )}

          {renderMode === 1 && (
            <div className="space-y-1.5">
              <div className="text-xs font-mono font-bold text-spherex-cyan">
                Mode 1: Lupton Color-Preserving Temporal Dipole Mapper
              </div>
              <p className="text-[11px] text-neutral-300 leading-relaxed">
                Maps <span className="text-rose-400 font-mono font-semibold">Epoch 1 → Red</span>,{" "}
                <span className="text-emerald-400 font-mono font-semibold">Mean(E1,E2) → Green</span>, and{" "}
                <span className="text-sky-400 font-mono font-semibold">Epoch 2 → Blue</span>. Stationary
                background stars cancel into neutral white/gray (<code className="text-neutral-400">I_R=I_G=I_B</code>
                ), while moving Planet X and brown dwarf candidates glow as{" "}
                <strong className="text-white">Red → Blue dipoles</strong> without waiting for a blink cycle.
              </p>
            </div>
          )}

          {renderMode === 2 && (
            <div className="space-y-1.5">
              <div className="text-xs font-mono font-bold text-spherex-cyan">
                Mode 2: Diagnostic 102-Band Spectral False-Color Presets
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {SPECTRAL_RGB_PRESETS.map((preset) => {
                  const isSel = activeRgbPresetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => onSelectRgbPreset(preset)}
                      title={preset.diagnosticPurpose}
                      className={`p-1.5 rounded text-left border transition ${
                        isSel
                          ? "bg-spherex-cyan/20 border-spherex-cyan text-white"
                          : "bg-cosmos-900 hover:bg-cosmos-800 border-cosmos-800 text-neutral-300"
                      }`}
                    >
                      <div className="text-[11px] font-mono font-semibold truncate">{preset.name}</div>
                      <div className="text-[9px] font-mono text-neutral-400">
                        R:{preset.redWavelengthUm}µm G:{preset.greenWavelengthUm}µm B:{preset.blueWavelengthUm}µm
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {renderMode === 3 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                <span className="text-spherex-cyan font-bold flex items-center gap-1">
                  <SplitSquareHorizontal className="w-3.5 h-3.5" />
                  ZOGY Proper Subtraction & S_corr Heatmap:
                </span>
                <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showZogyOverlay}
                    onChange={onToggleShowZogyOverlay}
                    className="rounded accent-spherex-magenta"
                  />
                  <span className="text-spherex-magenta font-semibold">Show |S_corr| ≥ σ Heatmap</span>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3 text-[11px] font-mono">
                <div>
                  <div className="flex justify-between text-neutral-400 mb-0.5">
                    <span>Split Curtain X:</span>
                    <span className="text-spherex-cyan">{Math.round(curtainX * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.05}
                    max={0.95}
                    step={0.01}
                    value={curtainX}
                    onChange={(e) => onChangeCurtainX(Number(e.target.value))}
                    className="w-full accent-spherex-cyan cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-neutral-400 mb-0.5">
                    <span>ZOGY |S_corr| Threshold:</span>
                    <span className="text-spherex-magenta font-bold">{snrThreshold.toFixed(1)}σ</span>
                  </div>
                  <input
                    type="range"
                    min={3.0}
                    max={15.0}
                    step={0.5}
                    value={snrThreshold}
                    onChange={(e) => onChangeSnrThreshold(Number(e.target.value))}
                    className="w-full accent-spherex-magenta cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right 6 Columns: WiseView Parametric Asinh Stretch, Trim Bright & Colormap LUT Controls */}
        <div className="lg:col-span-6 bg-cosmos-950/90 border border-cosmos-800 rounded-md p-2.5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-spherex-amber" />
              <span className="font-semibold text-white">Stretch:</span>
              {(
                [
                  { id: 1, label: "Asinh (WiseView)" },
                  { id: 0, label: "Linear ZScale" },
                  { id: 2, label: "Logarithmic" },
                ] as const
              ).map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => onChangeStretchMode(st.id)}
                  className={`px-2 py-0.5 rounded text-[10px] border transition ${
                    stretchMode === st.id
                      ? "bg-spherex-amber text-cosmos-950 border-spherex-amber font-bold"
                      : "bg-cosmos-900 text-neutral-300 border-cosmos-700"
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            {/* Colormap Selector & Invert Button */}
            <div className="flex items-center gap-1.5">
              <select
                value={colormap}
                onChange={(e) => onChangeColormap(e.target.value as ColormapName)}
                className="bg-cosmos-900 border border-cosmos-700 rounded px-2 py-0.5 text-[11px] font-mono text-neutral-200 focus:outline-none"
              >
                {COLORMAP_OPTIONS.map((c) => (
                  <option key={c.id} value={c.id} className="bg-cosmos-900 text-white">
                    {c.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={onToggleInvertColormap}
                className={`px-2 py-0.5 rounded text-[10px] font-mono border transition flex items-center gap-1 ${
                  invertColormap
                    ? "bg-spherex-cyan text-cosmos-950 border-spherex-cyan font-bold"
                    : "bg-cosmos-900 text-neutral-300 border-cosmos-700"
                }`}
                title="Invert colormap (white-sky negative plate mode)"
              >
                <Eye className="w-3 h-3" />
                <span>Invert</span>
              </button>
            </div>
          </div>

          {/* Sliders: Asinh Linear (alpha), Softening (Q), and WiseView Trim Bright */}
          <div className="grid grid-cols-3 gap-2.5 text-[10px] font-mono pt-0.5">
            <div>
              <div className="flex justify-between text-neutral-400">
                <span>Linear (α):</span>
                <span className="text-spherex-amber">{stretchAlpha.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0.02}
                max={0.8}
                step={0.02}
                value={stretchAlpha}
                onChange={(e) => onChangeStretchAlpha(Number(e.target.value))}
                className="w-full accent-spherex-amber cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-neutral-400">
                <span>Softening (Q):</span>
                <span className="text-spherex-amber">{softeningQ.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min={1.0}
                max={25.0}
                step={0.5}
                value={softeningQ}
                onChange={(e) => onChangeSofteningQ(Number(e.target.value))}
                className="w-full accent-spherex-amber cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-neutral-400">
                <span>Trim Bright:</span>
                <select
                  value={trimBrightMode}
                  onChange={(e) => onChangeTrimBrightMode(e.target.value as TrimBrightMode)}
                  className="bg-transparent text-spherex-cyan focus:outline-none cursor-pointer"
                >
                  <option value="adapt" className="bg-cosmos-900">
                    Adapt
                  </option>
                  <option value="percent" className="bg-cosmos-900">
                    {trimBrightPercentile.toFixed(1)}%
                  </option>
                  <option value="fixed" className="bg-cosmos-900">
                    Fixed
                  </option>
                </select>
              </div>
              <input
                type="range"
                min={92.0}
                max={99.9}
                step={0.1}
                value={trimBrightPercentile}
                onChange={(e) => {
                  onChangeTrimBrightMode("percent");
                  onChangeTrimBrightPercentile(Number(e.target.value));
                }}
                className="w-full accent-spherex-cyan cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};