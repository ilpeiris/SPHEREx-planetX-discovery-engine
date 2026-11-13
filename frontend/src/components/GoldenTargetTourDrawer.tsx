// frontend/src/components/GoldenTargetTourDrawer.tsx
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
import React, { useMemo, useState } from "react";
import { Compass, ExternalLink, Orbit, Sparkles, X } from "lucide-react";
import { GOLDEN_CATALOG, GoldenTarget } from "../lib/goldenCatalog";

export interface GoldenTargetTourDrawerProps {
  isOpen: boolean;
  activeTargetId?: string;
  onClose: () => void;
  onSelectTarget: (target: GoldenTarget) => void;
}

export const GoldenTargetTourDrawer: React.FC<GoldenTargetTourDrawerProps> = ({
  isOpen,
  activeTargetId,
  onClose,
  onSelectTarget,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [filterText, setFilterText] = useState<string>("");

  const categories = useMemo(() => {
    const unique = Array.from(new Set(GOLDEN_CATALOG.map((t) => t.category)));
    return ["ALL", ...unique];
  }, []);

  const filteredTargets = useMemo(() => {
    return GOLDEN_CATALOG.filter((t) => {
      const matchesCat = selectedCategory === "ALL" || t.category === selectedCategory;
      const q = filterText.trim().toLowerCase();
      const matchesText =
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.demoHook.toLowerCase().includes(q) ||
        t.spectralTypeOrClass.toLowerCase().includes(q);
      return matchesCat && matchesText;
    });
  }, [selectedCategory, filterText]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-cosmos-900 border-l border-cosmos-700 h-full flex flex-col text-neutral-100 shadow-2xl">
        {/* Drawer Header */}
        <div className="px-5 py-4 border-b border-cosmos-700 flex items-center justify-between bg-cosmos-950">
          <div className="flex items-center gap-2.5">
            <Compass className="w-5 h-5 text-spherex-magenta" />
            <div>
              <h2 className="text-sm font-bold tracking-wide text-white">
                Pre-Validated SPHEREx Golden Target Catalog (May 2025 – Oct 2026)
              </h2>
              <p className="text-[11px] font-mono text-neutral-400">
                18 Verified Multi-Epoch Benchmark Targets • Cached for &lt;180ms Live Judging Load
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md bg-cosmos-800 hover:bg-cosmos-700 text-neutral-300 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Category Pills & Search Filter */}
        <div className="p-4 border-b border-cosmos-800 space-y-2.5 bg-cosmos-900">
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter targets by name, molecule (CH4, H2O, CO2), or class..."
            className="w-full bg-cosmos-950 border border-cosmos-700 focus:border-spherex-cyan rounded px-3 py-1.5 text-xs font-mono text-white placeholder-neutral-500 focus:outline-none"
          />
          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-2 py-1 rounded text-[10px] font-mono transition border ${
                  selectedCategory === cat
                    ? "bg-spherex-cyan text-cosmos-950 border-spherex-cyan font-bold"
                    : "bg-cosmos-950 text-neutral-300 border-cosmos-700 hover:border-neutral-500"
                }`}
              >
                {cat === "ALL" ? "All 18 Groups" : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Target Cards List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredTargets.map((target) => {
            const isCurrent = activeTargetId === target.id;
            return (
              <div
                key={target.id}
                className={`p-3.5 rounded-lg border transition ${
                  isCurrent
                    ? "bg-cosmos-850 border-spherex-cyan shadow-lg"
                    : "bg-cosmos-950/90 border-cosmos-800 hover:border-cosmos-700"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cosmos-800 text-spherex-cyan">
                        {target.category}
                      </span>
                      {target.isMandatoryNasaTarget && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950 border border-spherex-amber/60 text-spherex-amber flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5" />
                          Mandatory NASA Target
                        </span>
                      )}
                      {target.hasNeossatOverlap && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-600/60 text-emerald-300 flex items-center gap-1">
                          <Orbit className="w-2.5 h-2.5" />
                          CSA NEOSSat Overlap
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-white mt-1.5">{target.name}</h3>
                    <p className="text-[11px] font-mono text-neutral-400">
                      {target.spectralTypeOrClass} • {target.distanceLabel}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onSelectTarget(target);
                      onClose();
                    }}
                    className="shrink-0 flex items-center gap-1 bg-spherex-cyan hover:bg-spherex-cyan/90 text-cosmos-950 font-mono font-bold text-xs px-3 py-1.5 rounded transition"
                  >
                    <span>Load Target</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Coordinates & Proper Motion Metadata Box */}
                <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-3 gap-2 bg-cosmos-900/90 border border-cosmos-800 rounded p-2 text-[10px] font-mono">
                  <div>
                    <span className="text-neutral-500 block">SPHEREx 2025.8 ICRS:</span>
                    <span className="text-spherex-cyan">
                      {target.raDeg.toFixed(5)}°, {target.decDeg >= 0 ? "+" : ""}
                      {target.decDeg.toFixed(5)}°
                    </span>
                    <span className="text-neutral-400 block">
                      ({target.raSexagesimal} {target.decSexagesimal})
                    </span>
                  </div>

                  {target.raRefDeg !== undefined && target.decRefDeg !== undefined ? (
                    <div>
                      <span className="text-neutral-500 block">{target.refEpochLabel}:</span>
                      <span className="text-spherex-amber">
                        {target.raRefDeg.toFixed(5)}°, {target.decRefDeg >= 0 ? "+" : ""}
                        {target.decRefDeg.toFixed(5)}°
                      </span>
                      <span className="text-neutral-400 block">
                        ({target.raRefSexagesimal} {target.decRefSexagesimal})
                      </span>
                    </div>
                  ) : (
                    <div>
                      <span className="text-neutral-500 block">Obs Epoch / MJD:</span>
                      <span className="text-neutral-200">{target.observationEpoch}</span>
                    </div>
                  )}

                  <div>
                    <span className="text-neutral-500 block">Motion / Default FoV:</span>
                    <span className="text-emerald-400">
                      {target.shift16YrArcsec > 0
                        ? `Δθ = ${target.shift16YrArcsec}" (${target.shift16YrPixels} px)`
                        : "Stationary / Tracklet"}
                    </span>
                    <span className="text-neutral-400 block">
                      FoV: {target.fovArcmin}&apos;×{target.fovArcmin}&apos; | Ch {target.defaultChannel}
                    </span>
                  </div>
                </div>

                {/* Scientific Demo Hook */}
                <p className="mt-2 text-xs text-neutral-200 leading-relaxed">{target.demoHook}</p>
                <ul className="mt-1.5 space-y-0.5 text-[11px] text-neutral-400 list-disc list-inside">
                  {target.scientificHighlights.map((hl, i) => (
                    <li key={i}>{hl}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};