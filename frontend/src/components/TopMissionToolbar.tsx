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
  Orbit,
  Radar,
  Search,
  Sparkles,
  Telescope,
} from "lucide-react";
import {
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
}

export const TopMissionToolbar: React.FC<TopMissionToolbarProps> = ({
  raDeg,
  decDeg,
  activeTarget,
  onSelectTarget,
  onSubmitCoordinates,
  onOpenGuidedTour,
  onOpenNeossatModal,
  onOpenVerifyModal,
  shareUrl,
  embedIframeSnippet,
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

  return (
    <header className="w-full bg-cosmos-900/95 border-b border-cosmos-700 px-3 py-2 text-neutral-100 select-none">
      {/* Row 1: Brand + Guided Tour (Left) | @ilpeiris | GitHub Repo + [Search Box] + Global Actions (Right) */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {/* Left: Mission Title & Guided Tour Button */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 bg-cosmos-950 border border-spherex-cyan/40 px-2.5 py-1.5 rounded-md">
            <Telescope className="w-4 h-4 text-spherex-cyan shrink-0" />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold tracking-wider text-white">
                  SPHEREx × PLANET X
                </span>
                <span className="text-[10px] font-mono bg-spherex-cyan/20 text-spherex-cyan px-1.5 py-0.2 rounded">
                  102-BAND ENGINE
                </span>
              </div>
              <p className="text-[10px] text-neutral-400 font-mono">
                NASA/IPAC IRSA QR2/QR3 • unWISE 16-Yr • CSA NEOSSat
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenGuidedTour}
            className="flex items-center gap-1.5 bg-spherex-magenta/20 hover:bg-spherex-magenta/30 border border-spherex-magenta/60 text-spherex-magenta px-2.5 py-1.5 rounded-md text-xs font-medium transition"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>18 Golden Targets Tour</span>
          </button>
        </div>

        {/* Right: @ilpeiris | GitHub Repo + [Search Box] + Global Verification & Share Tools */}
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <div className="flex items-center gap-1.5 bg-cosmos-950 border border-cosmos-700 px-2.5 py-1.5 rounded-md text-[11px] font-mono shrink-0">
            <a
              href="https://github.com/ilpeiris"
              target="_blank"
              rel="noreferrer"
              className="text-spherex-cyan hover:underline font-bold"
              title="M.D.Isuru Lakmal Peiris (@ilpeiris) on GitHub"
            >
              @ilpeiris
            </a>
            <span className="text-cosmos-700">|</span>
            <a
              href="https://github.com/ilpeiris/SPHEREx-planetX-discovery-engine"
              target="_blank"
              rel="noreferrer"
              className="text-spherex-amber hover:underline font-semibold flex items-center gap-1"
              title="View Source Code on GitHub: ilpeiris/SPHEREx-planetX-discovery-engine"
            >
              <span>GitHub Repo</span>
            </a>
          </div>

          {/* Coordinate & Target Search Box */}
          <form onSubmit={handleSearchSubmit} className="w-[290px] sm:w-[350px] relative">
            <div className="flex items-center bg-cosmos-950 border border-cosmos-700 focus-within:border-spherex-cyan rounded-md overflow-hidden">
              <Search className="w-3.5 h-3.5 text-neutral-400 ml-2.5 shrink-0" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  if (searchError) setSearchError(null);
                }}
                placeholder="RA, Dec (08h55m10.831s, -7d14m42.53s) or Target..."
                className="w-full bg-transparent px-2 py-1.5 text-xs font-mono text-neutral-100 placeholder-neutral-500 focus:outline-none"
              />
              <button
                type="submit"
                className="bg-spherex-cyan/20 hover:bg-spherex-cyan/30 text-spherex-cyan border-l border-cosmos-700 px-2.5 py-1.5 text-[11px] font-mono font-semibold transition"
              >
                Slew
              </button>
            </div>
            {searchError && (
              <div className="absolute left-0 top-full mt-1 bg-rose-950 border border-rose-600 text-rose-200 text-[10px] font-mono px-2 py-1 rounded shadow-lg z-40">
                {searchError}
              </div>
            )}
          </form>

          {/* CSA Partner NEOSSat + SPHEREx NEATM Solver Button */}
          <button
            type="button"
            onClick={onOpenNeossatModal}
            className="flex items-center gap-1 bg-amber-950/70 hover:bg-amber-900/70 border border-spherex-amber/70 text-spherex-amber px-2.5 py-1.5 rounded-md text-xs font-mono font-medium transition"
            title="Open Canadian Space Agency (CSA) NEOSSat CADC Optical Cutouts & Joint NEATM Asteroid Solver"
          >
            <Orbit className="w-3.5 h-3.5" />
            <span>CSA NEOSSat</span>
          </button>

          {/* 5-Stage Live Ephemeris Verification Modal Button */}
          <button
            type="button"
            onClick={onOpenVerifyModal}
            className="flex items-center gap-1 bg-cosmos-950 hover:bg-cosmos-800 border border-spherex-cyan/50 text-spherex-cyan px-2.5 py-1.5 rounded-md text-xs font-mono transition"
            title="Run 5-Stage Live Ephemeris & Catalog Cross-Match (Gaia DR3, SIMBAD, SkyBoT, JPL sb_ident, MPC)"
          >
            <Radar className="w-3.5 h-3.5" />
            <span>5-API Verify</span>
          </button>

          {/* Deep-Link URL & Iframe Embed Copy Buttons */}
          <button
            type="button"
            onClick={() => handleCopy("url")}
            className="flex items-center gap-1 bg-cosmos-950 hover:bg-cosmos-800 border border-cosmos-700 text-neutral-300 px-2 py-1.5 rounded-md text-[11px] font-mono transition"
            title="Copy deep-link coordinate URL (?ra=...&dec=...&fov=...)"
          >
            {copiedType === "url" ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span>{copiedType === "url" ? "Copied!" : "URL"}</span>
          </button>

          <button
            type="button"
            onClick={() => handleCopy("iframe")}
            className="flex items-center gap-1 bg-cosmos-950 hover:bg-cosmos-800 border border-cosmos-700 text-neutral-300 px-2 py-1.5 rounded-md text-[11px] font-mono transition"
            title="Copy <iframe /> embed snippet for external websites and citizen science portals"
          >
            {copiedType === "iframe" ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Code2 className="w-3.5 h-3.5" />
            )}
            <span>{copiedType === "iframe" ? "Copied!" : "Embed"}</span>
          </button>
        </div>
      </div>

      {/* Row 2: Official NASA Challenge Prompt 5 Mandatory Test Target Quick-Select Pills */}
      <div className="mt-2 pt-1.5 border-t border-cosmos-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-spherex-amber font-semibold flex items-center gap-1 mr-1">
            <Sparkles className="w-3 h-3" />
            Official NASA Test Targets:
          </span>

          {NASA_MANDATORY_TEST_TARGETS.map((target) => {
            const isSelected = activeTarget?.id === target.id;
            return (
              <button
                key={target.id}
                type="button"
                onClick={() => onSelectTarget(target)}
                className={`px-2.5 py-1 rounded text-[11px] font-mono transition flex items-center gap-1.5 border ${
                  isSelected
                    ? "bg-spherex-cyan text-cosmos-950 border-spherex-cyan font-bold shadow-sm"
                    : "bg-cosmos-950 hover:bg-cosmos-800 text-neutral-200 border-cosmos-700"
                }`}
              >
                <span>{target.shortLabel}</span>
                {target.shift16YrArcsec > 5 ? (
                  <span
                    className={`text-[9px] px-1 rounded ${
                      isSelected ? "bg-cosmos-950/20 text-cosmos-950" : "bg-cosmos-800 text-spherex-cyan"
                    }`}
                  >
                    {target.totalPmArcsecYr.toFixed(1)}&quot;/yr
                  </span>
                ) : (
                  <span
                    className={`text-[9px] px-1 rounded ${
                      isSelected ? "bg-cosmos-950/20 text-cosmos-950" : "bg-cosmos-800 text-spherex-magenta"
                    }`}
                  >
                    Variable
                  </span>
                )}
              </button>
            );
          })}

          <span className="text-cosmos-700 mx-1">|</span>
          <span className="text-[10px] font-mono text-neutral-400">Featured Discoveries:</span>

          {featuredExtraTargets.map((target) => {
            const isSelected = activeTarget?.id === target.id;
            return (
              <button
                key={target.id}
                type="button"
                onClick={() => onSelectTarget(target)}
                className={`px-2 py-1 rounded text-[11px] font-mono transition border ${
                  isSelected
                    ? "bg-spherex-magenta text-white border-spherex-magenta font-bold"
                    : "bg-cosmos-950 hover:bg-cosmos-800 text-neutral-300 border-cosmos-700"
                }`}
              >
                {target.shortLabel}
              </button>
            );
          })}
        </div>

        {/* Active Target Coordinate Readout Pill */}
        <div className="text-[11px] font-mono text-neutral-400 flex items-center gap-2">
          <span>
            Center: <strong className="text-neutral-200">{raDeg.toFixed(5)}°</strong>,{" "}
            <strong className="text-neutral-200">
              {decDeg >= 0 ? "+" : ""}
              {decDeg.toFixed(5)}°
            </strong>
          </span>
          {activeTarget && (
            <span className="bg-cosmos-800 text-spherex-cyan px-2 py-0.5 rounded text-[10px]">
              {activeTarget.spectralTypeOrClass}
            </span>
          )}
        </div>
      </div>
    </header>
  );
};