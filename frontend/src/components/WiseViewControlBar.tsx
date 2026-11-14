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
  userTier?: "explorer" | "researcher";
  isLightMode?: boolean;
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
  userTier = "researcher",
  isLightMode = false,
}) => {
  const chMeta = getChannelWavelengthAndDetector(channel);

  const MODE_TABS: Array<{ id: 0 | 1 | 2 | 3; label: string; code: string }> = [
    { id: 0, label: "Blink Comparator", code: "M0" },
    { id: 1, label: "Temporal Dipole RGB", code: "M1" },
    { id: 2, label: "102-Band Spectral RGB", code: "M2" },
    { id: 3, label: "ZOGY Difference Curtain", code: "M3" },
  ];

  const SLICE_BUTTONS: Array<{ idx: number; short: string; title: string }> = [
    { idx: 0, short: "E1 (2025.4)", title: "Slice 0: SPHEREx Epoch 1 Calibrated Flux (µJy)" },
    { idx: 1, short: "E2 (2025.9)", title: "Slice 1: SPHEREx Epoch 2 Calibrated Flux (µJy)" },
    { idx: 2, short: "16-Yr WISE / D4–D2", title: "Slice 2: Archival 2010–2024 unWISE Bridge or D4–D2 Color" },
    { idx: 3, short: "ZOGY Diff (D)", title: "Slice 3: ZOGY Proper Difference Image D" },
    { idx: 4, short: "ZOGY S_corr (σ)", title: "Slice 4: Astrometric-Variance-Corrected Significance Map" },
    { idx: 5, short: "ZODI Model", title: "Slice 5: Modeled Solar System Zodiacal Dust Foreground" },
  ];

  const outerPanel = isLightMode
    ? "bg-white border-slate-300 text-slate-800 shadow-sm"
    : "bg-[#0B0E14] border-[#1E2433] text-slate-100";

  const subCard = isLightMode
    ? "bg-slate-50 border-slate-200"
    : "bg-[#10141D] border-[#1E2433]";

  const btnInactive = isLightMode
    ? "bg-white border-slate-300 text-slate-700 hover:bg-slate-100"
    : "bg-[#141924] border-[#252D3F] text-slate-300 hover:border-slate-500";

  return (
    <div className={`w-full border rounded-md p-2.5 space-y-2 select-none transition-colors ${outerPanel}`}>
      {/* Row 1: Inspection Modes (M0..M3) + Calibration Filters + 102-Band LVF Scrubber */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-inherit">
        {/* Left: Mode Selector Tabs */}
        <div className="flex flex-wrap items-center gap-1">
          {MODE_TABS.map((tab) => {
            const active = renderMode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onChangeRenderMode(tab.id)}
                className={`px-2.5 py-1 rounded text-xs font-mono transition flex items-center gap-1.5 border ${
                  active
                    ? isLightMode
                      ? "bg-slate-900 text-white border-slate-900 font-bold"
                      : "bg-[#1C2638] text-white border-spherex-cyan font-semibold"
                    : btnInactive
                }`}
              >
                <span className="text-[10px] text-spherex-cyan font-bold">{tab.code}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right: Calibration Toggles (ZODI, FLAGS Bitmask, D4-D2) */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleSubtractZodi}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono border transition ${
              subtractZodi
                ? isLightMode
                  ? "bg-emerald-50 border-emerald-600 text-emerald-800 font-semibold"
                  : "bg-[#14221E] border-emerald-500/70 text-emerald-300 font-semibold"
                : isLightMode
                ? "bg-amber-50 border-amber-600 text-amber-800 font-semibold"
                : "bg-[#261E14] border-amber-500/80 text-amber-300 font-semibold"
            }`}
            title="Toggle HDU 4 (ZODI) zodiacal dust foreground subtraction on the GPU at 60 FPS"
          >
            <Flame className="w-3.5 h-3.5 text-spherex-amber" />
            <span>
              {userTier === "explorer"
                ? subtractZodi
                  ? "Solar Dust Removed"
                  : "Raw Dust Glow"
                : subtractZodi
                ? "ZODI Sub: ON"
                : "ZODI Sub: OFF (Raw)"}
            </span>
          </button>

          {userTier === "researcher" && (
            <>
              <button
                type="button"
                onClick={onToggleShowFlagMask}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono border transition ${
                  showFlagMask
                    ? isLightMode
                      ? "bg-fuchsia-50 border-fuchsia-600 text-fuchsia-800 font-semibold"
                      : "bg-[#261526] border-spherex-magenta text-spherex-magenta font-semibold"
                    : btnInactive
                }`}
                title="Hatch pixels flagged in HDU 2 (FLAGS: DICHROIC, NONFUNC, PERSIST, CR)"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-spherex-magenta" />
                <span>FLAGS Mask: {showFlagMask ? "ON" : "OFF"}</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  onChangeAlignmentMode(
                    alignmentMode === "d4_minus_d2" ? "narrowband" : "d4_minus_d2"
                  )
                }
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono border transition ${
                  alignmentMode === "d4_minus_d2"
                    ? isLightMode
                      ? "bg-amber-100 border-amber-600 text-amber-900 font-bold"
                      : "bg-[#282015] border-spherex-amber text-spherex-amber font-semibold"
                    : btnInactive
                }`}
                title="Caltech/IPAC Source Discovery Tool D4 (2.42–3.82 µm) minus D2 (1.10–1.62 µm) subtraction"
              >
                <Zap className="w-3.5 h-3.5 text-spherex-amber" />
                <span>D4–D2 Filter</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Row 2: 3-Column Instrument Deck (Col 1: Mode Controls | Col 2: 102-Band LVF Scrubber | Col 3: Stretch & LUT) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5">
        {/* Column 1 (4 Cols): Mode-Specific Inspection Controls */}
        <div className={`lg:col-span-4 border rounded p-2 flex flex-col justify-between space-y-1.5 ${subCard}`}>
          {renderMode === 0 && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={onToggleBlinking}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono font-bold transition ${
                      isBlinking
                        ? "bg-spherex-amber text-slate-950"
                        : "bg-spherex-cyan text-slate-950"
                    }`}
                  >
                    {isBlinking ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    <span>{isBlinking ? "Pause" : "Blink"}</span>
                  </button>

                  <label className="flex items-center gap-1 text-[10px] font-mono opacity-80 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeUnwiseInBlink}
                      onChange={onToggleIncludeUnwiseInBlink}
                      className="rounded accent-spherex-cyan"
                    />
                    <span>+16Yr WISE</span>
                  </label>
                </div>

                <div className="flex items-center gap-1.5 text-[11px] font-mono">
                  <span className="opacity-60">Speed:</span>
                  <input
                    type="range"
                    min={0.5}
                    max={15.0}
                    step={0.5}
                    value={blinkFrequencyHz}
                    onChange={(e) => onChangeBlinkFrequencyHz(Number(e.target.value))}
                    className="w-20 accent-spherex-cyan cursor-pointer"
                  />
                  <span className="text-spherex-cyan font-bold w-11 text-right">
                    {blinkFrequencyHz.toFixed(1)}Hz
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1">
                {SLICE_BUTTONS.map((s) => (
                  <button
                    key={s.idx}
                    type="button"
                    title={s.title}
                    onClick={() => onChangeActiveSlice(s.idx)}
                    className={`px-1 py-0.5 rounded text-[9px] font-mono truncate border transition ${
                      activeSlice === s.idx
                        ? isLightMode
                          ? "bg-slate-900 text-white border-slate-900 font-bold"
                          : "bg-[#1C2638] text-spherex-cyan border-spherex-cyan font-bold"
                        : btnInactive
                    }`}
                  >
                    {s.short}
                  </button>
                ))}
              </div>
            </>
          )}

          {renderMode === 1 && (
            <div className="space-y-1 text-[11px] font-mono">
              <div className="font-bold text-spherex-cyan">
                Lupton Temporal Dipole RGB (R=E1, G=Mean, B=E2)
              </div>
              <p className="text-[10px] opacity-80 leading-snug">
                Stationary stars cancel to neutral white/gray; moving brown dwarfs & Planet X
                candidates separate into <strong className="text-rose-400">Red (Epoch 1)</strong>{" "}
                → <strong className="text-sky-400">Blue (Epoch 2)</strong> dipole pairs.
              </p>
            </div>
          )}

          {renderMode === 2 && (
            <div className="grid grid-cols-2 gap-1">
              {SPECTRAL_RGB_PRESETS.map((preset) => {
                const isSel = activeRgbPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onSelectRgbPreset(preset)}
                    title={preset.diagnosticPurpose}
                    className={`p-1 rounded text-left border transition ${
                      isSel
                        ? isLightMode
                          ? "bg-slate-900 text-white border-slate-900"
                          : "bg-[#1C2638] border-spherex-cyan text-white"
                        : btnInactive
                    }`}
                  >
                    <div className="text-[10px] font-mono font-semibold truncate">
                      {preset.name}
                    </div>
                    <div className="text-[9px] font-mono opacity-60">
                      {preset.redWavelengthUm}/{preset.greenWavelengthUm}/{preset.blueWavelengthUm}µm
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {renderMode === 3 && (
            <div className="space-y-1.5 text-[10px] font-mono">
              <div className="flex items-center justify-between">
                <span className="font-bold text-spherex-cyan flex items-center gap-1">
                  <SplitSquareHorizontal className="w-3 h-3" />
                  ZOGY Subtraction Curtain
                </span>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showZogyOverlay}
                    onChange={onToggleShowZogyOverlay}
                    className="rounded accent-spherex-magenta"
                  />
                  <span className="text-spherex-magenta font-semibold">|S_corr| ≥ σ</span>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="flex justify-between opacity-75">
                    <span>Curtain:</span>
                    <span>{Math.round(curtainX * 100)}%</span>
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
                  <div className="flex justify-between opacity-75">
                    <span>Threshold:</span>
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

        {/* Column 2 (4 Cols): 102-Band Linear Variable Filter (LVF) Scrubber */}
        <div className={`lg:col-span-4 border rounded p-2 flex flex-col justify-between space-y-1.5 ${subCard}`}>
          <div className="flex items-center justify-between gap-1 text-[11px] font-mono">
            <span className="font-semibold flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-spherex-cyan" />
              LVF Ch {chMeta.ch}/102
            </span>
            <span className="text-spherex-cyan font-bold">
              λc = {chMeta.cwaveUm.toFixed(3)} µm (R={chMeta.det.resolvingPower})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[9px] font-mono opacity-60">0.75µm</span>
            <input
              type="range"
              min={1}
              max={102}
              step={1}
              value={channel}
              onChange={(e) => onChangeChannel(Number(e.target.value))}
              className="flex-1 accent-spherex-cyan h-1.5 rounded-lg cursor-pointer"
            />
            <span className="text-[9px] font-mono opacity-60">5.00µm</span>
          </div>

          <div className="grid grid-cols-6 gap-1">
            {SPHEREX_DETECTOR_BANDS.map((det) => {
              const isBandActive = chMeta.bandId === det.bandId;
              const midCh = Math.floor((det.channelStart + det.channelEnd) / 2);
              return (
                <button
                  key={det.bandId}
                  type="button"
                  onClick={() => onChangeChannel(midCh)}
                  title={`${det.name}: ${det.diagnostics}`}
                  className={`py-0.5 rounded text-[9px] font-mono transition border text-center ${
                    isBandActive
                      ? isLightMode
                        ? "bg-slate-900 text-white border-slate-900 font-bold"
                        : "bg-[#1C2638] border-spherex-cyan text-spherex-cyan font-bold"
                      : btnInactive
                  }`}
                >
                  D{det.bandId}
                </button>
              );
            })}
          </div>
        </div>

        {/* Column 3 (4 Cols): Dynamic Range Stretch, Trim Bright & Colormap LUT */}
        <div className={`lg:col-span-4 border rounded p-2 flex flex-col justify-between space-y-1.5 ${subCard}`}>
          <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] font-mono">
            <div className="flex items-center gap-1">
              <Sliders className="w-3 h-3 text-spherex-amber" />
              {(
                [
                  { id: 1, label: "Asinh" },
                  { id: 0, label: "ZScale" },
                  { id: 2, label: "Log" },
                ] as const
              ).map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => onChangeStretchMode(st.id)}
                  className={`px-1.5 py-0.5 rounded text-[10px] border transition ${
                    stretchMode === st.id
                      ? isLightMode
                        ? "bg-slate-900 text-white border-slate-900 font-bold"
                        : "bg-[#1C2638] text-spherex-amber border-spherex-amber font-bold"
                      : btnInactive
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <select
                value={colormap}
                onChange={(e) => onChangeColormap(e.target.value as ColormapName)}
                className={`border rounded px-1.5 py-0.5 text-[10px] font-mono focus:outline-none ${btnInactive}`}
              >
                {COLORMAP_OPTIONS.map((c) => (
                  <option
                    key={c.id}
                    value={c.id}
                    className={isLightMode ? "bg-white text-slate-900" : "bg-[#0B0E14] text-white"}
                  >
                    {c.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={onToggleInvertColormap}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition flex items-center gap-1 ${
                  invertColormap
                    ? "bg-slate-900 text-white border-slate-900 font-bold"
                    : btnInactive
                }`}
                title="Invert colormap (negative plate view)"
              >
                <Eye className="w-3 h-3" />
                <span>Inv</span>
              </button>
            </div>
          </div>

          <div
            className={`grid ${
              userTier === "researcher" ? "grid-cols-3" : "grid-cols-2"
            } gap-2 text-[10px] font-mono`}
          >
            <div>
              <div className="flex justify-between opacity-75">
                <span>Linear (α):</span>
                <span className="text-spherex-amber font-semibold">{stretchAlpha.toFixed(2)}</span>
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
              <div className="flex justify-between opacity-75">
                <span>Softening (Q):</span>
                <span className="text-spherex-amber font-semibold">{softeningQ.toFixed(1)}</span>
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

            {userTier === "researcher" && (
              <div>
                <div className="flex justify-between opacity-75">
                  <span>Ceiling:</span>
                  <span className="text-spherex-cyan">{trimBrightPercentile.toFixed(1)}%</span>
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
};