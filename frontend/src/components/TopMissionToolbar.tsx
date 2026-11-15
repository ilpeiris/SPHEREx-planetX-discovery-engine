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
import React, { useEffect, useState } from "react";
import {
  Activity,
  BookOpen,
  Check,
  Code2,
  Compass,
  Copy,
  Cpu,
  Eye,
  Flame,
  Layers,
  Moon,
  Orbit,
  Play,
  Radar,
  Search,
  ShieldAlert,
  Sparkles,
  Sun,
  Telescope,
  X,
} from "lucide-react";
import {
  GOLDEN_CATALOG,
  GoldenTarget,
  NASA_MANDATORY_TEST_TARGETS,
  findGoldenTargetById,
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
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "dark" : "light");
  }, []);

  const handleToggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    if (typeof window !== "undefined") {
      if (nextTheme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
      try {
        localStorage.setItem("spherex_theme_mode", nextTheme);
      } catch {
        // Ignore storage errors
      }
      window.dispatchEvent(
        new CustomEvent("spherex-theme-change", { detail: nextTheme })
      );
    }
  };

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

  const handleQuickStartTarget = (targetId: string) => {
    const t = findGoldenTargetById(targetId);
    if (t) {
      onSelectTarget(t);
      setIsGuideOpen(false);
    }
  };

  return (
    <>
      <header className="w-full bg-cosmos-900/95 border-b border-cosmos-700 px-3 py-2 text-neutral-100 select-none">
        {/* Row 1: Brand + Guide + Guided Tour (Left) | @ilpeiris | GitHub Repo + [Search Box] + Global Actions + Theme Toggle (Right) */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Left: Mission Title, Interactive Guide Button & 18 Golden Targets Tour */}
          <div className="flex flex-wrap items-center gap-2">
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

            {/* NEW: Interactive Plain-English + Technical Guide Button */}
            <button
              type="button"
              onClick={() => setIsGuideOpen(true)}
              className="flex items-center gap-1.5 bg-spherex-cyan text-cosmos-950 hover:opacity-90 px-3 py-1.5 rounded-md text-xs font-mono font-bold transition shadow-sm"
              title="Open the Plain-English Citizen Science Walkthrough & Technical Architecture Guide"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Guide</span>
            </button>

            <button
              type="button"
              onClick={onOpenGuidedTour}
              className="flex items-center gap-1.5 bg-spherex-magenta/20 hover:bg-spherex-magenta/30 border border-spherex-magenta/60 text-spherex-magenta px-2.5 py-1.5 rounded-md text-xs font-medium transition"
            >
              <Compass className="w-3.5 h-3.5" />
              <span>18 Golden Targets Tour</span>
            </button>
          </div>

          {/* Right: @ilpeiris | GitHub Repo + [Search Box] + Global Verification, Share & Theme Switcher */}
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

            {/* Dark (Default) / White Theme Toggle Button */}
            <button
              type="button"
              onClick={handleToggleTheme}
              className="flex items-center gap-1.5 bg-cosmos-950 hover:bg-cosmos-850 border border-cosmos-700 text-neutral-200 px-2.5 py-1.5 rounded-md text-[11px] font-mono font-semibold transition"
              title={
                theme === "light"
                  ? "Switch to Deep Space Dark Theme (Default)"
                  : "Switch to Clean White Laboratory Theme"
              }
            >
              {theme === "light" ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-spherex-amber" />
                  <span>White</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-spherex-cyan" />
                  <span>Dark</span>
                </>
              )}
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
                        isSelected ? "bg-black/20 text-white" : "bg-cosmos-800 text-spherex-cyan"
                      }`}
                    >
                      {target.totalPmArcsecYr.toFixed(1)}&quot;/yr
                    </span>
                  ) : (
                    <span
                      className={`text-[9px] px-1 rounded ${
                        isSelected ? "bg-black/20 text-white" : "bg-cosmos-800 text-spherex-magenta"
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

      {/* ====================================================================
          INTERACTIVE USER & JUDGE GUIDE MODAL (PLAIN ENGLISH + TECHNICAL)
          ==================================================================== */}
      {isGuideOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setIsGuideOpen(false)}
        >
          <div
            className="w-full max-w-4xl bg-cosmos-900 border border-cosmos-700 rounded-xl shadow-2xl text-neutral-100 overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-4 bg-cosmos-950 border-b border-cosmos-700 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <BookOpen className="w-5 h-5 text-spherex-cyan shrink-0" />
                <div>
                  <h2 className="text-sm font-bold text-white">
                    How This Tool Works - Plain-English Walkthrough &amp; Scientific Architecture
                  </h2>
                  <p className="text-[11px] font-mono text-neutral-400">
                    2026 NASA Space Apps Challenge: &quot;Planet X and SPHEREx&quot; • Built for Citizen Scientists &amp; Astrophysicists
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsGuideOpen(false)}
                className="p-1.5 rounded-md bg-cosmos-800 hover:bg-cosmos-700 text-neutral-300 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-5 text-xs leading-relaxed">
              {/* Section 1: The Big Picture in 30 Seconds */}
              <div className="bg-cosmos-950 border border-cosmos-800 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-spherex-cyan flex items-center gap-1.5">
                    <Telescope className="w-4 h-4" />
                    1. The Big Picture: What Are We Hunting For?
                  </h3>
                  <span className="text-[10px] font-mono bg-cosmos-800 text-neutral-300 px-2 py-0.5 rounded">
                    30-Second Overview
                  </span>
                </div>
                <p className="text-neutral-200">
                  <strong>In Plain English:</strong> Since 2025, NASA&apos;s <strong>SPHEREx</strong> space telescope has photographed the entire sky every 6 months in <strong>102 infrared colors</strong>, capturing over <strong>1 billion objects</strong>. Distant unknown planets (&quot;Planet X&quot;), freezing-cold brown dwarfs (&quot;failed stars&quot;), asteroids, and comets reveal themselves by <strong>moving from one photo to the next</strong> or <strong>changing brightness</strong> just like how Pluto was discovered by blinking two sky photos taken on different nights. Because no human or computer can check a billion objects alone, this web tool lets anyone blink images across time, spot moving objects in seconds, and inspect their 102-color chemical fingerprint.
                </p>
                <p className="text-[11px] font-mono text-neutral-400 pt-1 border-t border-cosmos-800">
                  <strong className="text-spherex-amber">Technical Under-the-Hood:</strong> Orchestrates a 4D spectrophotometric hypercube (RA × Dec × 102 Linear Variable Filter channels [0.75–5.00 µm, R=35–128] × N epochs) from Caltech/IPAC IRSA Level-2 Multi-Extension FITS (MEF) cutouts (DOI: 10.26131/IRSA629), bridged with 16 years of archival WISE/NEOWISE coadds (2010–2024) and Canadian Space Agency (CSA) NEOSSat optical observations.
                </p>
              </div>

              {/* Section 2: Try 4 One-Click Guided Demos */}
              <div className="space-y-2">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-spherex-amber flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5" />
                  2. Click Any Scenario Below to Try It Live Right Now:
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleQuickStartTarget("wise_0855")}
                    className="text-left p-3 rounded-lg bg-cosmos-950 hover:bg-cosmos-850 border border-cosmos-700 transition group"
                  >
                    <div className="flex items-center justify-between font-mono text-xs font-bold text-spherex-cyan group-hover:underline">
                      <span>A. Hunt a Freezing Brown Dwarf (WISE 0855)</span>
                      <span>Load →</span>
                    </div>
                    <p className="text-[11px] text-neutral-300 mt-1">
                      <strong>What you&apos;ll see:</strong> A -23°C (250 K) Planet X analog that leaped <strong>126.4 arcseconds (20.6 pixels)</strong> west since its 2010 WISE discovery. Invisible in optical telescopes, glowing in SPHEREx infrared!
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleQuickStartTarget("barnards_star")}
                    className="text-left p-3 rounded-lg bg-cosmos-950 hover:bg-cosmos-850 border border-cosmos-700 transition group"
                  >
                    <div className="flex items-center justify-between font-mono text-xs font-bold text-spherex-cyan group-hover:underline">
                      <span>B. Track the Fastest Star (Barnard&apos;s Star)</span>
                      <span>Load →</span>
                    </div>
                    <p className="text-[11px] text-neutral-300 mt-1">
                      <strong>What you&apos;ll see:</strong> The fastest moving star in our sky (10.39&quot;/yr). In <strong>Mode 1 (Dipole RGB)</strong>, stationary stars turn white while Barnard&apos;s Star glows as a Red-to-Blue pair!
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleQuickStartTarget("comet_3i_atlas_post")}
                    className="text-left p-3 rounded-lg bg-cosmos-950 hover:bg-cosmos-850 border border-cosmos-700 transition group"
                  >
                    <div className="flex items-center justify-between font-mono text-xs font-bold text-spherex-amber group-hover:underline">
                      <span>C. Awaken Interstellar Comet 3I/ATLAS</span>
                      <span>Load →</span>
                    </div>
                    <p className="text-[11px] text-neutral-300 mt-1">
                      <strong>What you&apos;ll see:</strong> An alien comet from another star system! Look at the 102-band chart below to see its giant <strong>4.26 µm CO₂</strong>, <strong>2.7 µm Water</strong>, and <strong>4.67 µm CO</strong> gas spikes.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleQuickStartTarget("fuor_wtp16aakapb")}
                    className="text-left p-3 rounded-lg bg-cosmos-950 hover:bg-cosmos-850 border border-cosmos-700 transition group"
                  >
                    <div className="flex items-center justify-between font-mono text-xs font-bold text-spherex-magenta group-hover:underline">
                      <span>D. Clean a Star Outburst (WTP16aakapb FUOr)</span>
                      <span>Load →</span>
                    </div>
                    <p className="text-[11px] text-neutral-300 mt-1">
                      <strong>What you&apos;ll see:</strong> A young star that brightened 10× behind thick dust. Click the <strong>Raw Spectrum / QC Filter</strong> button on the chart to remove a bad pixel spike at 3.4 µm!
                    </p>
                  </button>
                </div>
              </div>

              {/* Section 3: Panel-by-Panel Screen Guide */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                  3. Screen-by-Screen Guide (Plain English + Technical Specs)
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Card 1: Left Viewport */}
                  <div className="bg-cosmos-950 border border-cosmos-800 rounded-lg p-3.5 space-y-1.5">
                    <div className="font-mono font-bold text-spherex-cyan flex items-center gap-1.5">
                      <Eye className="w-4 h-4" />
                      <span>Left Panel: Wide-Angle Sky Map (Aladin Lite v3)</span>
                    </div>
                    <p className="text-[11px] text-neutral-200">
                      <strong>Plain English:</strong> Shows the neighborhood of sky around your target. The <strong>Cyan Box</strong> marks the exact patch zoomed-in on the right. Use the top dropdown to switch between <strong>Infrared (WISE)</strong> and <strong>Optical (Pan-STARRS)</strong>cold brown dwarfs and Planet X candidates are invisible in optical light!
                    </p>
                    <p className="text-[10px] font-mono text-neutral-400">
                      <strong>Technical:</strong> Rust/WASM HEALPix HiPS survey viewer with Gaia DR3 proper-motion vectors (`Gaia DR3 PM`) and configurable Field of View (`2&apos;×2&apos;` fast ~150ms up to `30&apos;×30&apos;` wide parallax).
                    </p>
                  </div>

                  {/* Card 2: Right Viewport */}
                  <div className="bg-cosmos-950 border border-cosmos-800 rounded-lg p-3.5 space-y-1.5">
                    <div className="font-mono font-bold text-spherex-cyan flex items-center gap-1.5">
                      <Layers className="w-4 h-4" />
                      <span>Right Panel: 60-FPS WebGL2 &quot;Blink Machine&quot;</span>
                    </div>
                    <p className="text-[11px] text-neutral-200">
                      <strong>Plain English:</strong> Your high-speed time-machine microscope. Hover anywhere to read the exact sky coordinates and brightness (in microjanskys, µJy), or <strong>click any star/dot</strong> to load its 102-band spectrum in the chart below.
                    </p>
                    <p className="text-[10px] font-mono text-neutral-400">
                      <strong>Technical:</strong> Custom `#version 300 es` GLSL shader unpacking a 6-slice `gl.R32F` float array + `gl.R16UI` hardware bitmask array with `&lt;1 ms` strided IRAF `ZScaleInterval` normalization.
                    </p>
                  </div>

                  {/* Card 3: The 4 Modes & Calibration Buttons */}
                  <div className="bg-cosmos-950 border border-cosmos-800 rounded-lg p-3.5 space-y-1.5">
                    <div className="font-mono font-bold text-spherex-amber flex items-center gap-1.5">
                      <Flame className="w-4 h-4" />
                      <span>Middle Bar: 4 Inspection Modes &amp; Calibration Filters</span>
                    </div>
                    <ul className="text-[11px] text-neutral-200 space-y-1 list-disc list-inside">
                      <li>
                        <strong>Mode 0 (Blink):</strong> Flashes Epoch 1 vs. Epoch 2 like a video so moving dots jump out.
                      </li>
                      <li>
                        <strong>Mode 1 (Dipole RGB):</strong> Colors Epoch 1 Red &amp; Epoch 2 Blue-moving objects glow as Red-Blue pairs!
                      </li>
                      <li>
                        <strong>Mode 2 (Spectral RGB):</strong> Maps 3 infrared bands to R, G, B to spot methane (`CH₄`) or water ice (`H₂O`).
                      </li>
                      <li>
                        <strong>Mode 3 (ZOGY Curtain):</strong> Drag the `⇔ ZOGY` slider across the image to subtract unchanging stars and highlight ≥4.5σ changes.
                      </li>
                      <li>
                        <strong>ZODI &amp; FLAGS Toggles:</strong> Subtract solar system dust (`HDU 4 ZODI` in &lt;0.4ms on GPU) and hatch bad detector pixels (`HDU 2 FLAGS`).
                      </li>
                    </ul>
                  </div>

                  {/* Card 4: 102-Band SED, AI Leaderboard & 5-API Verify */}
                  <div className="bg-cosmos-950 border border-cosmos-800 rounded-lg p-3.5 space-y-1.5">
                    <div className="font-mono font-bold text-spherex-magenta flex items-center gap-1.5">
                      <Activity className="w-4 h-4" />
                      <span>Bottom Panels: 102-Band Spectrum, AI Ranker &amp; 5-API Verify</span>
                    </div>
                    <ul className="text-[11px] text-neutral-200 space-y-1 list-disc list-inside">
                      <li>
                        <strong>102-Band Spectrum Chart:</strong> Shows the target&apos;s brightness across all 102 infrared bands (0.75–5.00 µm) with shaded zones for <strong>H₂O, CH₄, CO₂, and CO</strong>. Click any point on the curve to tune the camera to that wavelength!
                      </li>
                      <li>
                        <strong>ONNX AI Leaderboard:</strong> Runs a 290 KB WebAssembly neural network (`ConvSiameseNet` + `SpecVAE1D` + `IsolationForest`) in 11.4 ms to rank the Top 10 most unusual moving or variable objects in the sector.
                      </li>
                      <li>
                        <strong>5-API Verify &amp; CSA NEOSSat:</strong> Cross-checks candidates live against Gaia DR3, SIMBAD, SkyBoT, JPL Horizons (`sb_ident`), and the Minor Planet Center, or solves asteroid diameter &amp; albedo with CSA&apos;s NEOSSat telescope.
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 bg-cosmos-950 border-t border-cosmos-700 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
              <span className="text-neutral-400">
                Tip: You can also paste any sky coordinate (like <code className="text-spherex-cyan">08h55m10.831s, -7d14m42.53s</code>) into the top search bar!
              </span>
              <button
                type="button"
                onClick={() => setIsGuideOpen(false)}
                className="bg-spherex-cyan text-cosmos-950 font-bold px-4 py-1.5 rounded-md hover:opacity-90 transition"
              >
                Got It - Start Exploring
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};