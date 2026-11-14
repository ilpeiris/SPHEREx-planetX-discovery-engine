// frontend/src/components/AnomalyLeaderboard.tsx
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
import { Cpu, Download, FileSpreadsheet, Target } from "lucide-react";
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
  isLightMode?: boolean;
  compactMode?: boolean;
}

const CLASSIFICATION_STYLES: Record<
  AnomalyClassificationTag,
  { badge: string; dotColor: string; textHex: string }
> = {
  PLANET_X_CANDIDATE: {
    badge: "PLANET X CANDIDATE",
    dotColor: "bg-spherex-magenta",
    textHex: "text-spherex-magenta",
  },
  SEDNOID_OR_TNO: {
    badge: "SEDNOID / TNO",
    dotColor: "bg-spherex-amber",
    textHex: "text-spherex-amber",
  },
  COLD_BROWN_DWARF: {
    badge: "COLD BROWN DWARF",
    dotColor: "bg-spherex-cyan",
    textHex: "text-spherex-cyan",
  },
  ERUPTIVE_YSO_FUOR_OR_NOVA: {
    badge: "ERUPTIVE YSO / FUOR",
    dotColor: "bg-emerald-500",
    textHex: "text-emerald-500",
  },
  UNCLASSIFIED_SPECTRAL_ANOMALY: {
    badge: "SPECTRAL ANOMALY",
    dotColor: "bg-slate-400",
    textHex: "text-slate-400",
  },
};

export const AnomalyLeaderboard: React.FC<AnomalyLeaderboardProps> = ({
  anomalies,
  selectedAnomalyId,
  onSelectAnomaly,
  onVerifyCandidate,
  isRanking = false,
  isLightMode = false,
  compactMode = false,
}) => {
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

  const outerPanel = isLightMode
    ? "bg-white border-slate-300 text-slate-800 shadow-sm"
    : "bg-[#0B0E14] border-[#1E2433] text-slate-100";

  return (
    <aside className={`w-full h-full border rounded-md p-2.5 space-y-2 select-none transition-colors flex flex-col justify-between ${outerPanel}`}>
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-inherit">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-spherex-cyan shrink-0" />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold tracking-wide uppercase">
                Sector Candidates & Kinematic Triage
              </h3>
              <span
                className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                  isLightMode
                    ? "bg-slate-100 border-slate-300 text-slate-700"
                    : "bg-[#141924] border-[#252D3F] text-slate-300"
                }`}
              >
                WASM INT8 • {latencyMs.toFixed(1)} ms
              </span>
            </div>
          </div>
        </div>

        {/* 1-Click Zooniverse / Backyard Worlds CSV Export Button */}
        <button
          type="button"
          onClick={handleExportZooniverseCsv}
          disabled={anomalies.length === 0}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono font-semibold border transition ${
            isLightMode
              ? "bg-emerald-50 hover:bg-emerald-100 border-emerald-600 text-emerald-800"
              : "bg-[#14221E] hover:bg-[#1A2E28] border-emerald-500/80 text-emerald-300"
          }`}
          title="Export Top-10 candidates in Backyard Worlds / Zooniverse (unWISE-verse CSV) format"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>Export CSV</span>
          <Download className="w-3 h-3" />
        </button>
      </div>

      {/* Candidate Cards */}
      {isRanking ? (
        <div className="py-8 text-center text-xs font-mono text-spherex-cyan animate-pulse">
          Evaluating sector cutouts in WebAssembly SIMD...
        </div>
      ) : (
        <div
          className={
            compactMode
              ? "grid grid-cols-1 gap-1.5 max-h-[310px] overflow-y-auto pr-1"
              : "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2"
          }
        >
          {anomalies.slice(0, 5).map((cand) => {
            const style = CLASSIFICATION_STYLES[cand.classification];
            const isSelected = selectedAnomalyId === cand.id;
            return (
              <div
                key={cand.id}
                onClick={() => onSelectAnomaly(cand)}
                className={`p-2 rounded border cursor-pointer transition flex flex-col justify-between ${
                  isSelected
                    ? isLightMode
                      ? "bg-sky-50 border-sky-600 shadow-sm"
                      : "bg-[#161F30] border-spherex-cyan shadow"
                    : isLightMode
                    ? "bg-slate-50 border-slate-200 hover:border-slate-400"
                    : "bg-[#10141D] border-[#1E2433] hover:border-slate-600"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-mono font-bold">
                      #{cand.rank} {cand.id}
                    </span>
                    <span className="text-xs font-mono font-bold text-spherex-cyan">
                      {cand.discoveryScore.toFixed(1)} pts
                    </span>
                  </div>

                  <div className="mt-1 flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${style.dotColor}`} />
                    <span className={`text-[9px] font-mono font-bold ${style.textHex}`}>
                      {style.badge}
                    </span>
                  </div>

                  <div className="mt-1 space-y-0.5 text-[10px] font-mono opacity-85">
                    <div>
                      ICRS: {cand.raDeg.toFixed(4)}°, {cand.decDeg >= 0 ? "+" : ""}
                      {cand.decDeg.toFixed(4)}°
                    </div>
                    <div className="flex items-center justify-between">
                      <span>
                        ZOGY: <strong>{cand.snr.toFixed(1)}σ</strong> | Δθ:{" "}
                        <strong className="text-spherex-amber">{cand.dipoleSepArcsec.toFixed(1)}"</strong>
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
                </div>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
};