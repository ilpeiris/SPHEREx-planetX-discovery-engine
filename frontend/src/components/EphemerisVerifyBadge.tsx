// frontend/src/components/EphemerisVerifyBadge.tsx
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
import {
  CheckCircle2,
  Database,
  ExternalLink,
  Orbit,
  Radar,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

export interface VerificationReport {
  ra_deg: number;
  dec_deg: number;
  obs_mjd: number;
  obs_jd?: number;
  gaia_dr3: Array<{
    source_id: string;
    ra_j2016: number;
    dec_j2016: number;
    ra_obs: number;
    dec_obs: number;
    pmra_mas_yr: number;
    pmdec_mas_yr: number;
    parallax_mas: number;
    phot_g_mean_mag: number | null;
    galaxy_prob?: number;
    sep_arcsec: number;
    source_endpoint: string;
  }>;
  simbad: Array<{
    main_id: string;
    otype: string;
    ra: number;
    dec: number;
    sep_arcsec: number;
  }>;
  skybot: Array<{
    name: string;
    class: string;
    v_mag: number | null;
    center_dist_arcsec: number;
  }>;
  jpl_sb_ident: Array<{
    name: string;
    ra_str: string;
    dec_str: string;
  }>;
  mpc_cnd: Array<any>;
  splices_ice: Array<any>;
  neossat_cadc: Array<{
    observationID: string;
    target_name: string;
    mjd_obs: number;
  }>;
  is_uncatalogued_discovery: boolean;
}

export interface NeossatNeatmPayload {
  target: string;
  ra_deg: number;
  dec_deg: number;
  rotational_period_hr: number;
  f_rot_normalization: number;
  geometry: {
    r_hel_au: number;
    delta_au: number;
    phase_angle_deg: number;
  };
  neatm_solution: {
    diameter_km: number;
    diameter_err_km: number;
    albedo_pV: number;
    albedo_err: number;
    beaming_eta: number;
    beaming_err: number;
    reduced_chi2: number;
  };
  cadc_observations: Array<{
    observationID: string;
    target_name: string;
    instrument_name: string;
    productID: string;
    mjd_start: number;
    exptime_sec: number;
    bandpass: string;
    direct_cord_url: string;
    soda_cutout_url: string;
    preview_png_url: string;
  }>;
}

export interface EphemerisVerifyModalProps {
  isVerifyOpen: boolean;
  isNeossatOpen: boolean;
  isLoadingVerify: boolean;
  isLoadingNeossat: boolean;
  verifyReport: VerificationReport | null;
  neossatData: NeossatNeatmPayload | null;
  selectedNeossatTarget: string;
  onSelectNeossatTarget: (targetName: string) => void;
  onRefreshVerify: () => void;
  onCloseVerify: () => void;
  onCloseNeossat: () => void;
}

const NEOSSAT_BENCHMARK_TARGETS = [
  "171 Ophelia",
  "1 Ceres",
  "4 Vesta",
  "99942 Apophis",
  "101955 Bennu",
  "3I/ATLAS",
];

export const EphemerisVerifyBadge: React.FC<EphemerisVerifyModalProps> = ({
  isVerifyOpen,
  isNeossatOpen,
  isLoadingVerify,
  isLoadingNeossat,
  verifyReport,
  neossatData,
  selectedNeossatTarget,
  onSelectNeossatTarget,
  onRefreshVerify,
  onCloseVerify,
  onCloseNeossat,
}) => {
  return (
    <>
      {/* MODAL 1: 5-Stage Live Known-Object Ephemeris & Catalog Verification Cascade */}
      {isVerifyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-3xl bg-cosmos-900 border border-cosmos-700 rounded-xl shadow-2xl text-neutral-100 overflow-hidden flex flex-col max-h-[88vh]">
            <div className="px-5 py-3.5 bg-cosmos-950 border-b border-cosmos-700 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Radar className="w-5 h-5 text-spherex-cyan" />
                <div>
                  <h2 className="text-sm font-bold text-white">
                    5-Stage Live Known-Object Ephemeris & Catalog Verification Cascade
                  </h2>
                  <p className="text-[11px] font-mono text-neutral-400">
                    4-Tier STScI MAST + ESA Gaia DR3 Failover • CDS SIMBAD • IMCCE SkyBoT • JPL sb_ident • MPC CND
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onRefreshVerify}
                  disabled={isLoadingVerify}
                  className="flex items-center gap-1 bg-cosmos-800 hover:bg-cosmos-700 px-2.5 py-1 rounded text-xs font-mono text-spherex-cyan transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingVerify ? "animate-spin" : ""}`} />
                  <span>Re-Query Live APIs</span>
                </button>
                <button
                  type="button"
                  onClick={onCloseVerify}
                  className="p-1.5 rounded bg-cosmos-800 hover:bg-cosmos-700 text-neutral-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 font-mono text-xs">
              {isLoadingVerify && (
                <div className="py-12 text-center text-spherex-cyan animate-pulse">
                  Querying STScI MAST / ESA Gaia DR3, CDS SIMBAD, IMCCE SkyBoT, JPL sb_ident (2-Pass N-Body), and MPC CND...
                </div>
              )}

              {!isLoadingVerify && verifyReport && (
                <>
                  {/* Discovery Verdict Banner */}
                  <div
                    className={`p-3.5 rounded-lg border flex items-center justify-between ${
                      verifyReport.is_uncatalogued_discovery
                        ? "bg-fuchsia-950/60 border-spherex-magenta text-white"
                        : "bg-emerald-950/60 border-emerald-500/70 text-emerald-200"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      {verifyReport.is_uncatalogued_discovery ? (
                        <Sparkles className="w-5 h-5 text-spherex-magenta shrink-0" />
                      ) : (
                        <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                      )}
                      <div>
                        <div className="font-bold text-sm">
                          {verifyReport.is_uncatalogued_discovery
                            ? "UNCATALOGUED MOVING / TRANSIENT DISCOVERY CANDIDATE!"
                            : "KNOWN ASTROMETRIC / EPHEMERIS COUNTERPART VERIFIED"}
                        </div>
                        <div className="text-[11px] text-neutral-300">
                          Queried ICRS ({verifyReport.ra_deg.toFixed(5)}°,{" "}
                          {verifyReport.dec_deg >= 0 ? "+" : ""}
                          {verifyReport.dec_deg.toFixed(5)}°) at MJD {verifyReport.obs_mjd.toFixed(2)}
                        </div>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded bg-black/40 text-[10px] font-bold">
                      {verifyReport.is_uncatalogued_discovery ? "READY FOR MPC / ZOONIVERSE" : "CATALOGED"}
                    </span>
                  </div>

                  {/* 5-Stage Cascade Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Stage 1: Gaia DR3 */}
                    <div className="bg-cosmos-950 border border-cosmos-800 rounded-lg p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-spherex-cyan">
                          Stage 1: Gaia DR3 (STScI MAST / ESA)
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-cosmos-800 text-neutral-300">
                          {verifyReport.gaia_dr3.length} Match(es)
                        </span>
                      </div>
                      <p className="text-[10px] text-neutral-400">
                        Propagated from J2016.0 to Obs MJD via SkyCoord.apply_space_motion() & EPOCH_PROP_POS
                      </p>
                      {verifyReport.gaia_dr3.length === 0 ? (
                        <div className="text-emerald-400 text-[11px]">
                          ✓ Zero stationary stars or galaxies within 6.0&quot; at observation epoch.
                        </div>
                      ) : (
                        verifyReport.gaia_dr3.slice(0, 2).map((g, i) => (
                          <div key={i} className="bg-cosmos-900 p-2 rounded text-[10px] space-y-0.5">
                            <div className="text-white font-semibold">
                              ID: {g.source_id} (sep = {g.sep_arcsec}&quot;)
                            </div>
                            <div className="text-neutral-300">
                              PM: ({g.pmra_mas_yr}, {g.pmdec_mas_yr}) mas/yr | G = {g.phot_g_mean_mag ?? "N/A"}
                            </div>
                            <div className="text-spherex-cyan">Endpoint: {g.source_endpoint}</div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Stage 2: CDS SIMBAD */}
                    <div className="bg-cosmos-950 border border-cosmos-800 rounded-lg p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-spherex-cyan">
                          Stage 2: CDS SIMBAD TAP (L/T/Y & YSOs)
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-cosmos-800 text-neutral-300">
                          {verifyReport.simbad.length} Match(es)
                        </span>
                      </div>
                      <p className="text-[10px] text-neutral-400">
                        Captures optically faint infrared brown dwarfs (G &gt; 21 mag), PM* & eruptive variables
                      </p>
                      {verifyReport.simbad.length === 0 ? (
                        <div className="text-emerald-400 text-[11px]">
                          ✓ No cataloged SIMBAD brown dwarf, variable star, or AGN in cone.
                        </div>
                      ) : (
                        verifyReport.simbad.slice(0, 2).map((s, i) => (
                          <div key={i} className="bg-cosmos-900 p-2 rounded text-[10px]">
                            <strong className="text-white">{s.main_id}</strong> [{s.otype}] — sep:{" "}
                            <span className="text-spherex-amber">{s.sep_arcsec}&quot;</span>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Stage 3: IMCCE SkyBoT */}
                    <div className="bg-cosmos-950 border border-cosmos-800 rounded-lg p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-spherex-amber">
                          Stage 3: IMCCE SkyBoT ConeSearch
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-cosmos-800 text-neutral-300">
                          {verifyReport.skybot.length} Match(es)
                        </span>
                      </div>
                      {verifyReport.skybot.length === 0 ? (
                        <div className="text-emerald-400 text-[11px]">
                          ✓ Zero known main-belt asteroids or planets at observation JD.
                        </div>
                      ) : (
                        verifyReport.skybot.slice(0, 2).map((sb, i) => (
                          <div key={i} className="bg-cosmos-900 p-2 rounded text-[10px]">
                            <strong className="text-white">{sb.name}</strong> ({sb.class}) — V={sb.v_mag ?? "N/A"},{" "}
                            dist={sb.center_dist_arcsec}&quot;
                          </div>
                        ))
                      )}
                    </div>

                    {/* Stage 4 & 5: JPL sb_ident & MPC CND */}
                    <div className="bg-cosmos-950 border border-cosmos-800 rounded-lg p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-spherex-magenta">
                          Stage 4 & 5: JPL sb_ident + MPC CND
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-cosmos-800 text-neutral-300">
                          {verifyReport.jpl_sb_ident.length + verifyReport.mpc_cnd.length} Match(es)
                        </span>
                      </div>
                      <p className="text-[10px] text-neutral-400">
                        2-Pass N-Body integration (mag-required=false) + 80-col MPC1992 obs80 check
                      </p>
                      {verifyReport.jpl_sb_ident.length === 0 && verifyReport.mpc_cnd.length === 0 ? (
                        <div className="text-emerald-400 text-[11px]">
                          ✓ Zero known comets, NEOs, TNOs, or MPC near-duplicate observations.
                        </div>
                      ) : (
                        verifyReport.jpl_sb_ident.slice(0, 2).map((j, i) => (
                          <div key={i} className="bg-cosmos-900 p-2 rounded text-[10px]">
                            <strong className="text-white">{j.name}</strong> ({j.ra_str} {j.dec_str})
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CSA Partner NEOSSat CADC Optical Cutouts & Joint NEATM Asteroid Solver */}
      {isNeossatOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-3xl bg-cosmos-900 border border-spherex-amber/60 rounded-xl shadow-2xl text-neutral-100 overflow-hidden flex flex-col max-h-[88vh]">
            <div className="px-5 py-3.5 bg-cosmos-950 border-b border-cosmos-700 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Orbit className="w-5 h-5 text-spherex-amber" />
                <div>
                  <h2 className="text-sm font-bold text-white">
                    Canadian Space Agency (CSA) NEOSSat + NASA SPHEREx Joint NEATM Solver
                  </h2>
                  <p className="text-[11px] font-mono text-neutral-400">
                    CADC Argus CAOM-2 TAP (`collection = &apos;NEOSSAT&apos;`) • SODA Cutouts • Optical (0.35–1.05 µm) + 102-Band IR
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onCloseNeossat}
                className="p-1.5 rounded bg-cosmos-800 hover:bg-cosmos-700 text-neutral-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 font-mono text-xs">
              {/* Target Selector Pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-neutral-400 mr-1">Joint Benchmark Target:</span>
                {NEOSSAT_BENCHMARK_TARGETS.map((tName) => (
                  <button
                    key={tName}
                    type="button"
                    onClick={() => onSelectNeossatTarget(tName)}
                    className={`px-2.5 py-1 rounded text-[11px] border transition ${
                      selectedNeossatTarget === tName
                        ? "bg-spherex-amber text-cosmos-950 border-spherex-amber font-bold"
                        : "bg-cosmos-950 hover:bg-cosmos-800 text-neutral-300 border-cosmos-700"
                    }`}
                  >
                    {tName}
                  </button>
                ))}
              </div>

              {isLoadingNeossat && (
                <div className="py-10 text-center text-spherex-amber animate-pulse">
                  Querying CADC Argus CAOM-2 TAP & solving 2D Gauss-Legendre NEATM thermal integral...
                </div>
              )}

              {!isLoadingNeossat && neossatData && (
                <>
                  {/* Solved NEATM Thermophysical Parameters */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="bg-cosmos-950 border border-spherex-amber/50 rounded-lg p-3">
                      <span className="text-[10px] text-neutral-400 block">Solved Diameter (D):</span>
                      <span className="text-base font-bold text-spherex-amber">
                        {neossatData.neatm_solution.diameter_km.toFixed(2)} ±{" "}
                        {neossatData.neatm_solution.diameter_err_km.toFixed(2)} km
                      </span>
                    </div>

                    <div className="bg-cosmos-950 border border-spherex-cyan/50 rounded-lg p-3">
                      <span className="text-[10px] text-neutral-400 block">Geometric Albedo (p_V):</span>
                      <span className="text-base font-bold text-spherex-cyan">
                        {neossatData.neatm_solution.albedo_pV.toFixed(3)} ±{" "}
                        {neossatData.neatm_solution.albedo_err.toFixed(3)}
                      </span>
                    </div>

                    <div className="bg-cosmos-950 border border-spherex-magenta/50 rounded-lg p-3">
                      <span className="text-[10px] text-neutral-400 block">Beaming Parameter (η):</span>
                      <span className="text-base font-bold text-spherex-magenta">
                        {neossatData.neatm_solution.beaming_eta.toFixed(3)} ±{" "}
                        {neossatData.neatm_solution.beaming_err.toFixed(3)}
                      </span>
                    </div>

                    <div className="bg-cosmos-950 border border-emerald-500/50 rounded-lg p-3">
                      <span className="text-[10px] text-neutral-400 block">Rotational Phase f_rot(t):</span>
                      <span className="text-base font-bold text-emerald-400">
                        {neossatData.f_rot_normalization.toFixed(3)} (P={neossatData.rotational_period_hr}h)
                      </span>
                    </div>
                  </div>

                  {/* CADC NEOSSAT CORD Archive Records */}
                  <div className="bg-cosmos-950 border border-cosmos-800 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-spherex-amber" />
                        CADC Calibrated CORD Science Products (`*_cord.fits.gz` — Overscan & Dark Subtracted):
                      </span>
                      <span className="text-[10px] text-emerald-400">
                        χ²_ν = {neossatData.neatm_solution.reduced_chi2.toFixed(3)}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {neossatData.cadc_observations.map((obs, idx) => (
                        <div
                          key={idx}
                          className="bg-cosmos-900 border border-cosmos-800 rounded p-2 flex flex-wrap items-center justify-between gap-2 text-[11px]"
                        >
                          <div>
                            <strong className="text-spherex-amber">{obs.observationID}</strong> •{" "}
                            <span className="text-neutral-300">{obs.target_name}</span> (MJD{" "}
                            {Number(obs.mjd_start).toFixed(3)}, {obs.exptime_sec}s)
                          </div>
                          <div className="flex items-center gap-2">
                            <a
                              href={obs.soda_cutout_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-spherex-cyan hover:underline flex items-center gap-0.5"
                            >
                              <span>SODA Cutout</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                            <a
                              href={obs.preview_png_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-emerald-400 hover:underline flex items-center gap-0.5"
                            >
                              <span>CSA Preview PNG</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};