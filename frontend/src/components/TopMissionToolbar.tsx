// frontend/src/components/TopMissionToolbar.tsx
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
import React, { useState } from "react";
import {
  Check,
  Code2,
  Compass,
  Copy,
  Layers,
  Microscope,
  Moon,
  Orbit,
  Radar,
  Search,
  Sparkles,
  Sun,
  Telescope,
  User,
} from "lucide-react";
import {
  FOV_OPTIONS,
  GOLDEN_CATALOG,
  GoldenTarget,
  NASA_MANDATORY_TEST_TARGETS,
  parseCoordinateInput,
} from "../lib/goldenCatalog";

export type AladinSurveyOptionId =
  | "P/allWISE/color"
  | "P/PanSTARRS/DR1/color-z-zg-g"
  | "P/DSS2/color"
  | "P/2MASS/color"
  | "CDS/P/SPHEREx/QR2/D1";

export const MULTI_MISSION_SURVEYS: Array<{
  id: AladinSurveyOptionId;
  label: string;
  missionBadge: string;
}> = [
  {
    id: "P/allWISE/color",
    label: "AllWISE / NEOWISE Mid-IR (3.4 & 4.6 µm)",
    missionBadge: "WISE IR",
  },
  {
    id: "P/PanSTARRS/DR1/color-z-zg-g",
    label: "Pan-STARRS DR1 Optical (Disambiguation)",
    missionBadge: "Optical Check",
  },
  {
    id: "P/DSS2/color",
    label: "DSS2 Optical Reference Survey",
    missionBadge: "DSS2 Optical",
  },
  {
    id: "P/2MASS/color",
    label: "2MASS Near-IR (J, H, Ks)",
    missionBadge: "2MASS NIR",
  },
  {
    id: "CDS/P/SPHEREx/QR2/D1",
    label: "SPHEREx QR2 Band 1 HiPS (0.75–1.09 µm)",
    missionBadge: "SPHEREx HiPS",
  },
];

export interface TopMissionToolbarProps {
  raDeg: number;
  decDeg: number;
  fovArcmin: 2 | 6 | 15 | 30;
  activeTarget?: GoldenTarget;
  coaddDetector: boolean;
  aladinSurvey: AladinSurveyOptionId;
  showGaiaVectors: boolean;
  onSelectTarget: (target: GoldenTarget) => void;
  onSubmitCoordinates: (raDeg: number, decDeg: number, matchedTarget?: GoldenTarget) => void;
  onChangeFov: (fovArcmin: 2 | 6 | 15 | 30) => void;
  onToggleCoaddDetector: () => void;
  onChangeAladinSurvey: (survey: AladinSurveyOptionId) => void;
  onToggleGaiaVectors: () => void;
  onOpenGuidedTour: () => void;
  onOpenNeossatModal: () => void;
  onOpenVerifyModal: () => void;
  shareUrl: string;
  embedIframeSnippet: string;
  userTier?: "explorer" | "researcher";
  onChangeUserTier?: (tier: "explorer" | "researcher") => void;
  isLightMode?: boolean;
  onToggleLightMode?: () => void;
}

export const TopMissionToolbar: React.FC<TopMissionToolbarProps> = ({
  raDeg,
  decDeg,
  fovArcmin,
  activeTarget,
  coaddDetector,
  aladinSurvey,
  showGaiaVectors,
  onSelectTarget,
  onSubmitCoordinates,
  onChangeFov,
  onToggleCoaddDetector,
  onChangeAladinSurvey,
  onToggleGaiaVectors,
  onOpenGuidedTour,
  onOpenNeossatModal,
  onOpenVerifyModal,
  shareUrl,
  embedIframeSnippet,
  userTier = "researcher",
  onChangeUserTier,
  isLightMode = true,
  onToggleLightMode,
}) => {
  const [searchInput, setSearchInput] = useState<string>("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [copiedType, setCopiedType] = useState<"url" | "iframe" | null>(null);

  const featuredExtraTargets = GOLDEN_CATALOG.filter((t) =>
    ["comet_3i_atlas_post", "spherex_nep_deep", "fuor_wtp16aakapb"].includes(t.id)
  );

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseCoordinateInput(searchInput);
    if (!parsed) {
      setSearchError(
        "Enter RA/Dec (e.g. '08h55m10.831s, -7d14m42.53s' or '133.76, -7.24') or target name"
      );
      return;
    }
    setSearchError(null);
    if (parsed.matchedTarget) {
      onSelectTarget(parsed.matchedTarget);
    } else {
      onSubmitCoordinates(parsed.raDeg, parsed.decDeg);
    }
  };

  const handleCopy = async (type: "url" | "iframe") => {
    const text = type === "url" ? shareUrl : embedIframeSnippet;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 2000);
    } catch {
      // Fallback if clipboard permission denied
    }
  };

  const surfaceHeader = isLightMode
    ? "bg-white border-b border-slate-200 text-slate-800 shadow-sm"
    : "bg-[#0B0E14] border-b border-[#1E2433] text-slate-100";

  const surfaceControl = isLightMode
    ? "bg-slate-100 border-slate-300 text-slate-700 hover:border-slate-400"
    : "bg-[#121722] border-[#252D3F] text-slate-200 hover:border-slate-600";

  return (
    <header className={`w-full px-3 py-2 select-none transition-colors ${surfaceHeader}`}>
      {/* Row 1: Single Non-Jumping Line — Identity, @ilpeiris | GitHub, Explorer/Researcher, Search, Tools & Theme */}
      <div className="flex items-center justify-between gap-1.5 flex-nowrap overflow-x-auto">
        {/* Left Group: Brand, Catalog, @ilpeiris | GitHub, and Explorer/Researcher Switch */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div
            className={`flex items-center gap-2 px-2 py-1 rounded border ${
              isLightMode
                ? "bg-slate-50 border-slate-300"
                : "bg-[#121722] border-[#252D3F]"
            }`}
          >
            <Telescope className="w-4 h-4 text-spherex-cyan shrink-0" />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold tracking-tight whitespace-nowrap">
                  SPHEREx × Planet X
                </span>
                <span
                  className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border whitespace-nowrap ${
                    isLightMode
                      ? "bg-sky-50 border-sky-200 text-sky-700"
                      : "bg-[#182030] border-spherex-cyan/30 text-spherex-cyan"
                  }`}
                >
                  102-CH
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenGuidedTour}
            className={`flex items-center gap-1 px-2 py-1 rounded border text-xs font-medium whitespace-nowrap transition ${surfaceControl}`}
            title="Open the 18 pre-validated SPHEREx benchmark target catalog"
          >
            <Compass className="w-3.5 h-3.5 text-spherex-cyan shrink-0" />
            <span>Catalog (18)</span>
          </button>

          {/* Clickable @ilpeiris (GitHub Profile) | GitHub (Repo) Pill */}
          <div
            className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[11px] whitespace-nowrap ${
              isLightMode
                ? "bg-slate-50 border-slate-300 text-slate-700"
                : "bg-[#121722] border-[#252D3F] text-slate-300"
            }`}
          >
            <a
              href="https://github.com/ilpeiris"
              target="_blank"
              rel="noreferrer"
              className="text-spherex-cyan hover:underline font-bold"
              title="M.D.Isuru Lakmal Peiris (@ilpeiris) GitHub Profile"
            >
              @ilpeiris
            </a>
            <span className="opacity-40">|</span>
            <a
              href="https://github.com/ilpeiris/SPHEREx-planetX-discovery-engine"
              target="_blank"
              rel="noreferrer"
              className="text-spherex-amber hover:underline font-semibold"
              title="View Project Source Code on GitHub"
            >
              GitHub
            </a>
          </div>

          {/* Locked-Width Citizen Explorer vs Pro Researcher Switch (Never Jumps Lines) */}
          {onChangeUserTier && (
            <div
              className={`flex items-center p-0.5 rounded border text-[11px] whitespace-nowrap ${
                isLightMode
                  ? "bg-slate-100 border-slate-300"
                  : "bg-[#121722] border-[#252D3F]"
              }`}
              title="Switch between Citizen Explorer view and Pro Researcher telemetry"
            >
              <button
                type="button"
                onClick={() => onChangeUserTier("explorer")}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-sm transition ${
                  userTier === "explorer"
                    ? isLightMode
                      ? "bg-white text-slate-900 font-bold shadow-sm"
                      : "bg-[#222B3D] text-white font-semibold"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                <User className="w-3 h-3 text-spherex-cyan shrink-0" />
                <span>Explorer</span>
              </button>
              <button
                type="button"
                onClick={() => onChangeUserTier("researcher")}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-sm transition ${
                  userTier === "researcher"
                    ? isLightMode
                      ? "bg-white text-slate-900 font-bold shadow-sm"
                      : "bg-[#222B3D] text-white font-semibold"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                <Microscope className="w-3 h-3 text-spherex-amber shrink-0" />
                <span>Researcher</span>
              </button>
            </div>
          )}
        </div>

        {/* Center: Universal RA/Dec Sexagesimal, Decimal & Target Search */}
        <form onSubmit={handleSearchSubmit} className="flex-1 min-w-[180px] max-w-xs relative">
          <div
            className={`flex items-center rounded border overflow-hidden transition ${
              isLightMode
                ? "bg-slate-50 border-slate-300 focus-within:border-sky-600"
                : "bg-[#121722] border-[#252D3F] focus-within:border-spherex-cyan"
            }`}
          >
            <Search className="w-3.5 h-3.5 text-slate-400 ml-2 shrink-0" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                if (searchError) setSearchError(null);
              }}
              placeholder="RA, Dec or Target..."
              className={`w-full bg-transparent px-2 py-1 text-xs focus:outline-none ${
                isLightMode
                  ? "text-slate-900 placeholder-slate-400"
                  : "text-slate-100 placeholder-slate-500"
              }`}
            />
            <button
              type="submit"
              className={`border-l px-2 py-1 text-[11px] font-semibold transition ${
                isLightMode
                  ? "bg-slate-200 hover:bg-slate-300 text-slate-800 border-slate-300"
                  : "bg-[#1A2233] hover:bg-[#232D42] text-spherex-cyan border-[#252D3F]"
              }`}
            >
              Slew
            </button>
          </div>
          {searchError && (
            <div className="absolute left-0 top-full mt-1 bg-rose-950 border border-rose-600 text-rose-200 text-[10px] px-2 py-1 rounded shadow-lg z-40 whitespace-nowrap">
              {searchError}
            </div>
          )}
        </form>

        {/* Right Group: FoV, Co-Add, Survey, Gaia PM, NEOSSat, Verify, URL/Embed & Theme Icon */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Field of View (FoV) Selector */}
          <div className={`flex items-center rounded border px-1.5 py-1 whitespace-nowrap ${surfaceControl}`}>
            <span className="text-[10px] opacity-60 mr-1">FoV:</span>
            <select
              value={fovArcmin}
              onChange={(e) => onChangeFov(Number(e.target.value) as 2 | 6 | 15 | 30)}
              className="bg-transparent text-xs font-semibold focus:outline-none cursor-pointer"
              title="Select angular Field of View (2' to 30')"
            >
              {FOV_OPTIONS.map((opt) => (
                <option
                  key={opt.fovArcmin}
                  value={opt.fovArcmin}
                  className={isLightMode ? "bg-white text-slate-900" : "bg-[#0B0E14] text-white"}
                >
                  {opt.fovArcmin}'×{opt.fovArcmin}'
                </option>
              ))}
            </select>
          </div>

          {/* 6-Detector Broadband SNR Co-Add Toggle (Fixed Width so Row 1 Never Shifts) */}
          <button
            type="button"
            onClick={onToggleCoaddDetector}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs border whitespace-nowrap transition ${
              coaddDetector
                ? isLightMode
                  ? "bg-emerald-50 border-emerald-600 text-emerald-800 font-bold"
                  : "bg-[#162622] border-emerald-500/80 text-emerald-300 font-semibold"
                : surfaceControl
            }`}
            title="Co-add all 17 spectral channels per SPHEREx detector array (D1-D6) for a 4.1x SNR boost"
          >
            <Layers className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>6-Det Co-Add</span>
          </button>

          {/* Multi-Mission Survey Switcher */}
          <div className={`flex items-center rounded border px-1.5 py-1 ${surfaceControl}`}>
            <select
              value={aladinSurvey}
              onChange={(e) => onChangeAladinSurvey(e.target.value as AladinSurveyOptionId)}
              className="bg-transparent text-xs focus:outline-none cursor-pointer max-w-[135px] truncate"
              title="Overlay reference survey in Aladin Lite v3"
            >
              {MULTI_MISSION_SURVEYS.map((srv) => (
                <option
                  key={srv.id}
                  value={srv.id}
                  className={isLightMode ? "bg-white text-slate-900" : "bg-[#0B0E14] text-white"}
                >
                  [{srv.missionBadge}] {srv.label}
                </option>
              ))}
            </select>
          </div>

          {/* Gaia DR3 Proper Motion Vector Toggle */}
          <button
            type="button"
            onClick={onToggleGaiaVectors}
            className={`px-2 py-1 rounded text-[11px] border whitespace-nowrap transition ${
              showGaiaVectors
                ? isLightMode
                  ? "bg-sky-50 border-sky-600 text-sky-800 font-semibold"
                  : "bg-[#152232] border-spherex-cyan/80 text-spherex-cyan font-semibold"
                : surfaceControl
            }`}
            title="Overlay Gaia DR3 proper-motion vectors"
          >
            Gaia PM
          </button>

          {/* CSA NEOSSat Modal Trigger */}
          <button
            type="button"
            onClick={onOpenNeossatModal}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs border whitespace-nowrap transition ${surfaceControl}`}
            title="Open Canadian Space Agency (CSA) NEOSSat CADC Cutouts & Joint NEATM Solver"
          >
            <Orbit className="w-3.5 h-3.5 text-spherex-amber shrink-0" />
            <span>NEOSSat</span>
          </button>

          {/* 5-API Ephemeris Verification Modal Trigger */}
          <button
            type="button"
            onClick={onOpenVerifyModal}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs border whitespace-nowrap transition ${surfaceControl}`}
            title="Run 5-Stage Live Ephemeris & Catalog Cross-Match"
          >
            <Radar className="w-3.5 h-3.5 text-spherex-cyan shrink-0" />
            <span>Verify</span>
          </button>

          {/* Deep-Link URL & Iframe Embed Copy Buttons */}
          <button
            type="button"
            onClick={() => handleCopy("url")}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] border whitespace-nowrap transition ${surfaceControl}`}
            title="Copy deep-link coordinate URL"
          >
            {copiedType === "url" ? (
              <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            ) : (
              <Copy className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>{copiedType === "url" ? "Copied" : "URL"}</span>
          </button>

          <button
            type="button"
            onClick={() => handleCopy("iframe")}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] border whitespace-nowrap transition ${surfaceControl}`}
            title="Copy <iframe /> embed code"
          >
            {copiedType === "iframe" ? (
              <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            ) : (
              <Code2 className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>{copiedType === "iframe" ? "Copied" : "Embed"}</span>
          </button>

          {/* Dark / White Theme Changer Icon Button */}
          {onToggleLightMode && (
            <button
              type="button"
              onClick={onToggleLightMode}
              className={`p-1.5 rounded border transition ${surfaceControl}`}
              title={
                isLightMode
                  ? "Switch to Observatory Dark Theme"
                  : "Switch to Daylight White Theme"
              }
            >
              {isLightMode ? (
                <Moon className="w-3.5 h-3.5 text-slate-700" />
              ) : (
                <Sun className="w-3.5 h-3.5 text-spherex-amber" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Benchmark Target Bar (5 Mandatory NASA Targets + Featured Survey Targets) */}
      <div
        className={`mt-1.5 pt-1.5 border-t flex flex-wrap items-center justify-between gap-2 ${
          isLightMode ? "border-slate-200" : "border-[#1A202E]"
        }`}
      >
        <div className="flex flex-wrap items-center gap-1">
          <span
            className={`text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1 mr-1 ${
              isLightMode ? "text-slate-500" : "text-slate-400"
            }`}
          >
            <Sparkles className="w-3 h-3 text-spherex-amber" />
            Benchmark Targets:
          </span>

          {NASA_MANDATORY_TEST_TARGETS.map((target) => {
            const isSelected = activeTarget?.id === target.id;
            return (
              <button
                key={target.id}
                type="button"
                onClick={() => onSelectTarget(target)}
                className={`px-2 py-0.5 rounded text-[11px] transition flex items-center gap-1.5 border ${
                  isSelected
                    ? isLightMode
                      ? "bg-slate-900 text-white border-slate-900 font-bold"
                      : "bg-[#1C2638] text-white border-spherex-cyan font-semibold"
                    : surfaceControl
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    target.shift16YrArcsec > 5 ? "bg-spherex-cyan" : "bg-spherex-amber"
                  }`}
                />
                <span>{target.shortLabel}</span>
                <span className="text-[9px] opacity-70">
                  {target.shift16YrArcsec > 5
                    ? `${target.totalPmArcsecYr.toFixed(1)}"/yr`
                    : "Var"}
                </span>
              </button>
            );
          })}

          <span className="opacity-30 mx-1">|</span>

          {featuredExtraTargets.map((target) => {
            const isSelected = activeTarget?.id === target.id;
            return (
              <button
                key={target.id}
                type="button"
                onClick={() => onSelectTarget(target)}
                className={`px-2 py-0.5 rounded text-[11px] transition border ${
                  isSelected
                    ? isLightMode
                      ? "bg-slate-900 text-white border-slate-900 font-bold"
                      : "bg-[#1C2638] text-white border-spherex-cyan font-semibold"
                    : surfaceControl
                }`}
              >
                {target.shortLabel}
              </button>
            );
          })}
        </div>

        {/* Active Pointing Telemetry Readout */}
        <div
          className={`text-[11px] flex items-center gap-2 ${
            isLightMode ? "text-slate-600" : "text-slate-400"
          }`}
        >
          <span>
            ICRS:{" "}
            <strong className={isLightMode ? "text-slate-900" : "text-slate-200"}>
              {raDeg.toFixed(5)}°
            </strong>
            ,{" "}
            <strong className={isLightMode ? "text-slate-900" : "text-slate-200"}>
              {decDeg >= 0 ? "+" : ""}
              {decDeg.toFixed(5)}°
            </strong>
          </span>
          {activeTarget && (
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] border ${
                isLightMode
                  ? "bg-slate-100 border-slate-300 text-slate-700"
                  : "bg-[#121722] border-[#252D3F] text-slate-300"
              }`}
            >
              {activeTarget.spectralTypeOrClass}
            </span>
          )}
        </div>
      </div>
    </header>
  );
};