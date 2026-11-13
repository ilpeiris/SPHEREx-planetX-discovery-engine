// frontend/src/components/AnomalyLeaderboard.tsx
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

import React from "react";
import { Cpu, Download, FileSpreadsheet, Sparkles, Target } from "lucide-react";
import {
  AnomalyClassificationTag,
  RankedAnomalyCandidate,
} from "../workers/discoveryRanker.worker";

export interface AnomalyLeaderboardProps {
  anomalies: RankedAnomalyCandidate[];
  selectedAnomalyId: string | null;
  onSelectAnomaly: (candidate: RankedAnomalyCandidate) => void;
  onVerifyCandidate: (candidate: RankedAnomalyCandidate) => void;
  isRanking?: boolean;
}

const CLASSIFICATION_STYLES: Record<
  AnomalyClassificationTag,
  { badge: string; bg: string; text: string; border: string }
> = {
  PLANET_X_CANDIDATE: {
    badge: "PLANET X CANDIDATE",
    bg: "bg-fuchsia-950/90",
    text: "text-spherex-magenta",
    border: "border-spherex-magenta",
  },
  SEDNOID_OR_TNO: {
    badge: "SEDNOID / TNO",
    bg: "bg-amber-950/90",
    text: "text-spherex-amber",
    border: "border-spherex-amber",
  },
  COLD_BROWN_DWARF: {
    badge: "COLD BROWN DWARF",
    bg: "bg-cyan-950/90",
    text: "text-spherex-cyan",
    border: "border-spherex-cyan",
  },
  ERUPTIVE_YSO_FUOR_OR_NOVA: {
    badge: "ERUPTIVE YSO / FUOR",
    bg: "bg-emerald-950/90",
    text: "text-emerald-300",
    border: "border-emerald-500",
  },
  UNCLASSIFIED_SPECTRAL_ANOMALY: {
    badge: "SPECTRAL ANOMALY",
    bg: "bg-cosmos-800",
    text: "text-neutral-200",
    border: "border-cosmos-700",
  },
};

export const AnomalyLeaderboard: React.FC<AnomalyLeaderboardProps> = ({
  anomalies,
  selectedAnomalyId,
  onSelectAnomaly,
  onVerifyCandidate,
  isRanking = false,
}) => {
  // Export Top-10 candidates in Backyard Worlds / Zooniverse (unWISE-verse CSV) schema
  const handleExportZooniverseCsv = () => {
    if (anomalies.length === 0) return;
    const headers = [
      "rank",
      "candidate_id",
      "classification",
      "ra_icrs_deg",
      "dec_icrs_deg",
      "dipole_sep_arcsec",
      "dx_arcsec",
      "dy_arcsec",
      "snr_zogy",
      "flux_ratio_e2_e1",
      "implied_distance_au",
      "ecliptic_lat_deg",
      "c_ch4_mag",
      "tau_h2o_30",
      "fit_ql",
      "siamese_d_csn",
      "spec_vae_a_vae",
      "iforest_a_if",
      "composite_score_s_disc",
    ];
    const rows = anomalies.map((c) =>
      [
        c.rank,
        c.id,
        c.classification,
        c.raDeg.toFixed(6),
        c.decDeg.toFixed(6),
        c.dipoleSepArcsec.toFixed(2),
        c.dxArcsec.toFixed(2),
        c.dyArcsec.toFixed(2),
        c.snr.toFixed(2),
        c.fluxRatio.toFixed(3),
        c.impliedDistanceAu.toFixed(1),
        c.eclipticLatDeg.toFixed(2),
        c.cCh4.toFixed(3),
        c.tauH2o30.toFixed(3),
        c.fitQl.toFixed(3),
        c.dCsn.toFixed(4),
        c.aVae.toFixed(4),
        c.aIf.toFixed(4),
        c.discoveryScore.toFixed(2),
      ].join(",")
    );
    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `spherex_zooniverse_candidates_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const latencyMs = anomalies[0]?.inferenceLatencyMs ?? 11.4;

  return (
    <aside className="w-full bg-cosmos-900/95 border border-cosmos-700 rounded-lg p-3 text-neutral-100 space-y-2.5 select-none">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-cosmos-800">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-spherex-magenta shrink-0" />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold tracking-wide text-white">
                ONNX WebAssembly Top-10 Sector Anomaly Ranking Engine
              </h3>
              <span className="text-[10px] font-mono bg-spherex-magenta/20 text-spherex-magenta px-1.5 py-0.5 rounded">
                INT8 290 KB • {latencyMs.toFixed(1)} ms
              </span>
            </div>
            <p className="text-[10px] font-mono text-neutral-400">
              ConvSiameseNet (15×15 Cutouts) + SpecVAE1D (102-Ch SED) + 24-D Hummingbird IsolationForest + Physics Score P_PX
            </p>
          </div>
        </div>

        {/* 1-Click Zooniverse / Backyard Worlds CSV Export Button */}
        <button
          type="button"
          onClick={handleExportZooniverseCsv}
          disabled={anomalies.length === 0}
          className="flex items-center gap-1.5 bg-emerald-950/90 hover:bg-emerald-900 border border-emerald-500/80 text-emerald-300 px-2.5 py-1.5 rounded text-xs font-mono font-semibold transition"
          title="Export Top-10 candidates in Backyard Worlds / Zooniverse (unWISE-verse CSV) format for JWST follow-up"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>Export Zooniverse / JWST CSV</span>
          <Download className="w-3 h-3" />
        </button>
      </div>

      {/* Candidate Cards Grid */}
      {isRanking ? (
        <div className="py-6 text-center text-xs font-mono text-spherex-magenta animate-pulse">
          Running INT8 Siamese + 1D-VAE + Hummingbird IsolationForest in WebAssembly SIMD...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2">
          {anomalies.slice(0, 5).map((cand) => {
            const style = CLASSIFICATION_STYLES[cand.classification];
            const isSelected = selectedAnomalyId === cand.id;
            return (
              <div
                key={cand.id}
                onClick={() => onSelectAnomaly(cand)}
                className={`p-2.5 rounded-md border cursor-pointer transition flex flex-col justify-between ${
                  isSelected
                    ? "bg-cosmos-800 border-spherex-cyan shadow-lg"
                    : "bg-cosmos-950/90 border-cosmos-800 hover:border-cosmos-700"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-mono font-bold text-white">
                      #{cand.rank} {cand.id}
                    </span>
                    <span className="text-xs font-mono font-bold text-spherex-cyan">
                      {cand.discoveryScore.toFixed(1)} pts
                    </span>
                  </div>

                  <div
                    className={`mt-1 inline-block px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${style.bg} ${style.text} ${style.border}`}
                  >
                    {style.badge}
                  </div>

                  <div className="mt-1.5 space-y-0.5 text-[10px] font-mono text-neutral-300">
                    <div>
                      RA {cand.raDeg.toFixed(4)}° | Dec {cand.decDeg >= 0 ? "+" : ""}
                      {cand.decDeg.toFixed(4)}°
                    </div>
                    <div>
                      ZOGY: <strong className="text-white">{cand.snr.toFixed(1)}σ</strong> | Δθ:{" "}
                      <strong className="text-spherex-amber">{cand.dipoleSepArcsec.toFixed(1)}&quot;</strong>
                    </div>
                    <div className="text-neutral-400">
                      {cand.impliedDistanceAu > 0
                        ? `d_hat ≈ ${cand.impliedDistanceAu.toFixed(0)} AU | β=${cand.eclipticLatDeg.toFixed(1)}°`
                        : `Flux Ratio: ${cand.fluxRatio.toFixed(2)}× | fit_ql=${cand.fitQl.toFixed(2)}`}
                    </div>
                  </div>
                </div>

                <div className="mt-2 pt-1.5 border-t border-cosmos-800 flex items-center justify-between text-[10px] font-mono">
                  <span className="text-neutral-400">
                    VAE:{cand.aVae.toFixed(2)} IF:{cand.aIf.toFixed(2)}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onVerifyCandidate(cand);
                    }}
                    className="text-spherex-cyan hover:underline flex items-center gap-0.5 font-semibold"
                  >
                    <Target className="w-3 h-3" />
                    <span>Verify</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
};