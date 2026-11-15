// frontend/src/components/SpectralCurveInspector.tsx
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
import React, { useEffect, useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import {
  Activity,
  CheckCircle2,
  Filter,
  Flame,
  Layers,
  Orbit,
  Sparkles,
} from "lucide-react";
import {
  EMPIRICAL_SPECTRAL_TEMPLATES,
  GoldenTarget,
  MOLECULAR_BAND_OVERLAYS,
} from "../lib/goldenCatalog";

export interface SedMeasurementPoint {
  epoch_id?: number;
  mjd: number;
  global_channel: number;
  band_id: number;
  cwave_um?: number;
  wavelength_um: number;
  cband_um?: number;
  bandwidth_um: number;
  resolving_power: number;
  flux_ujy: number;
  flux_err_ujy?: number;
  variance_ujy2?: number;
  fit_ql?: number;
  flags?: number;
  is_clean?: boolean;
}

export interface ExtendedComaProfileData {
  f_core_2pix_mJy: number;
  f_total_30pix_mJy: number;
  radii_arcsec: number[];
  radial_profile_MJysr: number[];
  Q_gas_molecules_sec: number;
  r_proj_km?: number;
}

export interface MolecularIndicesSummary {
  tau_h2o_30: number;
  c_ch4: number;
  c_h2o_nir: number;
  c_w1_k: number;
}

export interface SpectralCurveInspectorProps {
  sourceLabel: string;
  raDeg: number;
  decDeg: number;
  activeChannel: number;
  activeTarget?: GoldenTarget;
  measurements: SedMeasurementPoint[];
  molecularIndices?: MolecularIndicesSummary;
  extendedComaProfile?: ExtendedComaProfileData | null;
  applyQualityFilter: boolean;
  onToggleQualityFilter: () => void;
  onSelectChannel: (globalChannel: number) => void;
  onOpenNeossatModal?: () => void;
  isLoading?: boolean;
}

// Restrained, publication-grade molecular overlay colors for Light & Dark modes
const REFINED_MOLECULE_STYLES: Record<
  "H2O" | "CH4" | "CO2" | "CO",
  { lightFill: string; darkFill: string; lightText: string; darkText: string }
> = {
  H2O: {
    lightFill: "rgba(37, 99, 235, 0.07)",
    darkFill: "rgba(56, 189, 248, 0.10)",
    lightText: "#1d4ed8",
    darkText: "#38bdf8",
  },
  CH4: {
    lightFill: "rgba(79, 70, 229, 0.07)",
    darkFill: "rgba(129, 140, 248, 0.10)",
    lightText: "#4338ca",
    darkText: "#818cf8",
  },
  CO2: {
    lightFill: "rgba(5, 150, 105, 0.07)",
    darkFill: "rgba(52, 211, 153, 0.10)",
    lightText: "#047857",
    darkText: "#34d399",
  },
  CO: {
    lightFill: "rgba(217, 119, 6, 0.08)",
    darkFill: "rgba(245, 158, 11, 0.10)",
    lightText: "#b45309",
    darkText: "#fbbf24",
  },
};

export const SpectralCurveInspector: React.FC<SpectralCurveInspectorProps> = ({
  sourceLabel,
  raDeg,
  decDeg,
  activeChannel,
  activeTarget,
  measurements,
  molecularIndices,
  extendedComaProfile,
  applyQualityFilter,
  onToggleQualityFilter,
  onSelectChannel,
  onOpenNeossatModal,
  isLoading = false,
}) => {
  const [activeMolecules, setActiveMolecules] = useState<
    Array<"H2O" | "CH4" | "CO2" | "CO">
  >(["H2O", "CH4", "CO2", "CO"]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("none");
  const [isDarkTheme, setIsDarkTheme] = useState<boolean>(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsDarkTheme(document.documentElement.classList.contains("dark"));
    const onThemeChange = (e: Event) => {
      const custom = e as CustomEvent<"light" | "dark">;
      setIsDarkTheme(custom.detail === "dark");
    };
    window.addEventListener("spherex-theme-change", onThemeChange);
    return () => window.removeEventListener("spherex-theme-change", onThemeChange);
  }, []);

  const toggleMolecule = (molId: "H2O" | "CH4" | "CO2" | "CO") => {
    setActiveMolecules((prev) =>
      prev.includes(molId) ? prev.filter((m) => m !== molId) : [...prev, molId]
    );
  };

  // Partition measurements into Epoch 1, Epoch 2, and Flagged Outliers (fit_ql >= 3.0 or bad FLAGS)
  const {
    epoch1Points,
    epoch2Points,
    outlierPoints,
    lightCurvePoints,
    maxFluxUjy,
  } = useMemo(() => {
    if (!measurements || measurements.length === 0) {
      return {
        epoch1Points: [] as SedMeasurementPoint[],
        epoch2Points: [] as SedMeasurementPoint[],
        outlierPoints: [] as SedMeasurementPoint[],
        lightCurvePoints: [] as Array<{
          mjd: number;
          fluxUjy: number;
          fluxErrUjy: number;
          label: string;
        }>,
        maxFluxUjy: 100.0,
      };
    }

    const filtered = applyQualityFilter
      ? measurements.filter(
          (pt) =>
            pt.is_clean !== false &&
            (pt.fit_ql === undefined || pt.fit_ql < 3.0)
        )
      : measurements;

    const outliers = measurements.filter(
      (pt) =>
        pt.is_clean === false || (pt.fit_ql !== undefined && pt.fit_ql >= 3.0)
    );

    const ep1 = filtered
      .filter((pt) => (pt.epoch_id ?? 1) === 1)
      .sort((a, b) => a.wavelength_um - b.wavelength_um);
    const ep2 = filtered
      .filter((pt) => (pt.epoch_id ?? 1) >= 2)
      .sort((a, b) => a.wavelength_um - b.wavelength_um);

    const finalEp1 = ep1.length > 0 ? ep1 : filtered;
    const finalEp2 = ep2;

    let peakFlux = 10.0;
    for (const pt of filtered) {
      if (Number.isFinite(pt.flux_ujy) && pt.flux_ujy > peakFlux) {
        peakFlux = pt.flux_ujy;
      }
    }

    const chWindow = filtered.filter(
      (pt) => Math.abs(pt.global_channel - activeChannel) <= 4
    );
    const lcSource = chWindow.length >= 2 ? chWindow : filtered;
    const mjdGroups = new Map<number, number[]>();
    for (const pt of lcSource) {
      const roundedMjd = Math.round(pt.mjd * 10) / 10;
      const arr = mjdGroups.get(roundedMjd) || [];
      arr.push(pt.flux_ujy);
      mjdGroups.set(roundedMjd, arr);
    }

    const lcList: Array<{
      mjd: number;
      fluxUjy: number;
      fluxErrUjy: number;
      label: string;
    }> = [];
    Array.from(mjdGroups.entries())
      .sort((a, b) => a[0] - b[0])
      .forEach(([mjdVal, fluxes], idx) => {
        const meanF =
          fluxes.reduce((acc, v) => acc + v, 0) / Math.max(1, fluxes.length);
        lcList.push({
          mjd: mjdVal,
          fluxUjy: Number(meanF.toFixed(2)),
          fluxErrUjy: Number((0.04 * meanF).toFixed(2)),
          label: `SPHEREx Survey Pass ${idx + 1}`,
        });
      });

    return {
      epoch1Points: finalEp1,
      epoch2Points: finalEp2,
      outlierPoints: outliers,
      lightCurvePoints: lcList,
      maxFluxUjy: peakFlux,
    };
  }, [measurements, applyQualityFilter, activeChannel, activeTarget]);

  const selectedTemplate = useMemo(
    () =>
      EMPIRICAL_SPECTRAL_TEMPLATES.find((t) => t.id === selectedTemplateId) ||
      null,
    [selectedTemplateId]
  );

  // Build Apache ECharts configuration for linked 102-Band SED (Top) + Multi-Epoch Light Curve (Bottom)
  const chartOptions = useMemo(() => {
    const ep1Color = isDarkTheme ? "#f59e0b" : "#d97706"; // Refined Scientific Amber
    const ep2Color = isDarkTheme ? "#38bdf8" : "#2563eb"; // NASA Aerospace Blue
    const lcColor = isDarkTheme ? "#818cf8" : "#4f46e5";  // Executive Indigo

    const markAreas: any[] = [];
    MOLECULAR_BAND_OVERLAYS.forEach((mol) => {
      if (activeMolecules.includes(mol.id)) {
        const style = REFINED_MOLECULE_STYLES[mol.id];
        mol.rangesUm.forEach(([x0, x1]) => {
          markAreas.push([
            {
              name: mol.formula,
              xAxis: x0,
              itemStyle: { color: isDarkTheme ? style.darkFill : style.lightFill },
              label: {
                show: true,
                position: "insideTop",
                color: isDarkTheme ? style.darkText : style.lightText,
                fontSize: 10,
                fontFamily: "monospace",
              },
            },
            { xAxis: x1 },
          ]);
        });
      }
    });

    const seriesList: any[] = [
      {
        name: "Epoch 1 SED (Survey 1)",
        type: "line",
        xAxisIndex: 0,
        yAxisIndex: 0,
        symbolSize: 5,
        itemStyle: { color: ep1Color },
        lineStyle: { width: 1.75, color: ep1Color },
        data: epoch1Points.map((pt) => [
          pt.wavelength_um,
          pt.flux_ujy,
          pt.flux_err_ujy ?? Math.sqrt(pt.variance_ujy2 ?? 1.0),
          pt.global_channel,
          pt.resolving_power,
          pt.fit_ql ?? 1.0,
          pt.flags ?? 0,
        ]),
        markArea: { silent: true, data: markAreas },
      },
    ];

    if (epoch2Points.length > 0) {
      seriesList.push({
        name: "Epoch 2 SED (Survey 2, +6 Mo)",
        type: "line",
        xAxisIndex: 0,
        yAxisIndex: 0,
        symbolSize: 5,
        itemStyle: { color: ep2Color },
        lineStyle: { width: 1.75, color: ep2Color },
        data: epoch2Points.map((pt) => [
          pt.wavelength_um,
          pt.flux_ujy,
          pt.flux_err_ujy ?? Math.sqrt(pt.variance_ujy2 ?? 1.0),
          pt.global_channel,
          pt.resolving_power,
          pt.fit_ql ?? 1.0,
          pt.flags ?? 0,
        ]),
      });
    }

    if (!applyQualityFilter && outlierPoints.length > 0) {
      seriesList.push({
        name: "Flagged Outliers (fit_ql ≥ 3.0)",
        type: "scatter",
        xAxisIndex: 0,
        yAxisIndex: 0,
        symbol: "diamond",
        symbolSize: 10,
        itemStyle: {
          color: "#e11d48",
          borderColor: isDarkTheme ? "#ffffff" : "#0f172a",
          borderWidth: 1,
        },
        data: outlierPoints.map((pt) => [
          pt.wavelength_um,
          pt.flux_ujy,
          pt.flux_err_ujy ?? 1.0,
          pt.global_channel,
          pt.resolving_power,
          pt.fit_ql ?? 25.0,
          pt.flags ?? 1,
        ]),
      });
    }

    if (selectedTemplate) {
      const templateCurveData: Array<[number, number]> = [];
      for (let i = 0; i <= 100; i++) {
        const lam = 0.75 + (4.25 * i) / 100.0;
        const normF = selectedTemplate.evaluateNormalizedFlux(lam);
        templateCurveData.push([
          Number(lam.toFixed(4)),
          Number((normF * maxFluxUjy * 0.92).toFixed(3)),
        ]);
      }
      seriesList.push({
        name: `Template: ${selectedTemplate.name}`,
        type: "line",
        xAxisIndex: 0,
        yAxisIndex: 0,
        showSymbol: false,
        itemStyle: { color: lcColor },
        lineStyle: {
          width: 2.0,
          type: "dashed",
          color: lcColor,
        },
        data: templateCurveData,
      });
    }

    seriesList.push({
      name: "Multi-Epoch Light Curve (SPHEREx Survey Passes)",
      type: "line",
      xAxisIndex: 1,
      yAxisIndex: 1,
      symbolSize: 7,
      itemStyle: { color: lcColor },
      lineStyle: { width: 1.5, color: lcColor },
      data: lightCurvePoints.map((lc) => [
        lc.mjd,
        lc.fluxUjy,
        lc.fluxErrUjy,
        lc.label,
      ]),
    });

    const chartBg = isDarkTheme ? "#090b10" : "#ffffff";
    const textPrimary = isDarkTheme ? "#e2e8f0" : "#0f172a";
    const textMuted = isDarkTheme ? "#94a3b8" : "#64748b";
    const gridSplit = isDarkTheme ? "#1e2432" : "#f1f5f9";
    const tooltipBg = isDarkTheme ? "rgba(15, 18, 26, 0.96)" : "rgba(255, 255, 255, 0.98)";
    const tooltipBorder = isDarkTheme ? "#2b3448" : "#cbd5e1";

    return {
      backgroundColor: chartBg,
      animationDuration: 250,
      textStyle: { color: textPrimary, fontFamily: "monospace" },
      tooltip: {
        trigger: "axis",
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: textPrimary, fontSize: 11, fontFamily: "monospace" },
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return "";
          const first = params[0];
          if (first.axisIndex === 1) {
            const d = first.data;
            return [
              `<strong>${d[3] || "Epoch"}</strong>`,
              `MJD: ${Number(d[0]).toFixed(2)}`,
              `Flux: ${Number(d[1]).toFixed(2)} ± ${Number(d[2]).toFixed(2)} µJy`,
            ].join("<br/>");
          }
          const lines: string[] = [];
          params.forEach((p: any) => {
            const d = p.data;
            if (!Array.isArray(d)) return;
            if (d.length >= 6) {
              lines.push(
                `<span style="color:${p.color}">●</span> <strong>${p.seriesName}</strong>: ` +
                  `λ=${Number(d[0]).toFixed(3)} µm | Ch ${d[3]} (R=${d[4]}) | ` +
                  `<strong>${Number(d[1]).toFixed(2)} ± ${Number(d[2]).toFixed(2)} µJy</strong> ` +
                  `(fit_ql=${Number(d[5]).toFixed(2)})`
              );
            } else {
              lines.push(
                `<span style="color:${p.color}">●</span> ${p.seriesName}: ${Number(d[1]).toFixed(2)} µJy`
              );
            }
          });
          return lines.join("<br/>");
        },
      },
      legend: {
        top: 6,
        right: 12,
        textStyle: { color: textPrimary, fontSize: 10 },
      },
      grid: [
        { left: 62, right: 22, top: 38, height: "50%" },
        { left: 62, right: 22, top: "68%", height: "22%" },
      ],
      xAxis: [
        {
          gridIndex: 0,
          type: "value",
          min: 0.72,
          max: 5.05,
          name: "Wavelength λ (µm) [Bands D1–D4: R=35–41 | Bands D5–D6: R=112–128 High-Res Ice/Gas]",
          nameLocation: "middle",
          nameGap: 22,
          nameTextStyle: { color: textMuted, fontSize: 10 },
          axisLabel: { color: textMuted, fontSize: 10 },
          splitLine: { lineStyle: { color: gridSplit } },
        },
        {
          gridIndex: 1,
          type: "value",
          scale: true,
          name: "Observation Epoch (Modified Julian Date — SPHEREx Multi-Epoch Survey)",
          nameLocation: "middle",
          nameGap: 22,
          nameTextStyle: { color: textMuted, fontSize: 10 },
          axisLabel: { color: textMuted, fontSize: 10 },
          splitLine: { lineStyle: { color: gridSplit } },
        },
      ],
      yAxis: [
        {
          gridIndex: 0,
          type: "value",
          name: "Flux (µJy)",
          nameTextStyle: { color: textMuted, fontSize: 10 },
          axisLabel: { color: textMuted, fontSize: 10 },
          splitLine: { lineStyle: { color: gridSplit } },
        },
        {
          gridIndex: 1,
          type: "value",
          name: "Flux (µJy)",
          nameTextStyle: { color: textMuted, fontSize: 10 },
          axisLabel: { color: textMuted, fontSize: 10 },
          splitLine: { lineStyle: { color: gridSplit } },
        },
      ],
      series: seriesList,
    };
  }, [
    activeMolecules,
    epoch1Points,
    epoch2Points,
    outlierPoints,
    selectedTemplate,
    maxFluxUjy,
    lightCurvePoints,
    applyQualityFilter,
    isDarkTheme,
  ]);

  const onEvents = useMemo(
    () => ({
      click: (params: any) => {
        if (
          params &&
          params.axisIndex === 0 &&
          Array.isArray(params.data) &&
          params.data.length >= 4
        ) {
          const ch = Number(params.data[3]);
          if (Number.isFinite(ch) && ch >= 1 && ch <= 102) {
            onSelectChannel(ch);
          }
        }
      },
    }),
    [onSelectChannel]
  );

  return (
    <section className="w-full bg-cosmos-900/95 border border-cosmos-700 rounded-lg p-3 text-neutral-100 space-y-2.5 select-none">
      {/* Header Row: Source Coordinates, Molecular Overlays, Template Matcher & Quality Filter */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-cosmos-800">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-spherex-cyan shrink-0" />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold tracking-wide text-white">
                102-Band Near-Infrared Spectrophotometry Inspector (0.75–5.00 µm)
              </h3>
              <span className="text-[10px] font-mono bg-cosmos-800 text-spherex-cyan px-2 py-0.5 rounded">
                {sourceLabel} ({raDeg.toFixed(4)}°, {decDeg >= 0 ? "+" : ""}
                {decDeg.toFixed(4)}°)
              </span>
            </div>
            <p className="text-[10px] font-mono text-neutral-400">
              Click any spectral point to lock the WebGL2 viewport to that narrowband LVF channel (Current: Ch{" "}
              {activeChannel})
            </p>
          </div>
        </div>

        {/* Right Controls: Molecular Band Toggles, Template Matcher & Before/After fit_ql Filter */}
        <div className="flex flex-wrap items-center gap-1.5">
          {MOLECULAR_BAND_OVERLAYS.map((mol) => {
            const isOn = activeMolecules.includes(mol.id);
            const style = REFINED_MOLECULE_STYLES[mol.id];
            return (
              <button
                key={mol.id}
                type="button"
                onClick={() => toggleMolecule(mol.id)}
                title={mol.label}
                style={{
                  borderColor: isOn
                    ? isDarkTheme
                      ? style.darkText
                      : style.lightText
                    : isDarkTheme
                    ? "#2b3448"
                    : "#cbd5e1",
                  backgroundColor: isOn
                    ? isDarkTheme
                      ? style.darkFill
                      : style.lightFill
                    : isDarkTheme
                    ? "#090b10"
                    : "#f8fafc",
                  color: isOn
                    ? isDarkTheme
                      ? style.darkText
                      : style.lightText
                    : isDarkTheme
                    ? "#94a3b8"
                    : "#475569",
                }}
                className="px-2 py-1 rounded text-[10px] font-mono font-semibold border transition"
              >
                {mol.formula}
              </button>
            );
          })}

          {/* Empirical Spectral Template Matcher Dropdown */}
          <div className="flex items-center bg-cosmos-950 border border-cosmos-700 rounded px-2 py-1">
            <Sparkles className="w-3 h-3 text-spherex-magenta mr-1.5 shrink-0" />
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="bg-transparent text-[11px] font-mono text-neutral-200 focus:outline-none cursor-pointer max-w-[205px] truncate"
              title="Overplot empirical L0-Y4 brown dwarf, SPLICES ice, or KBO/Comet reference templates"
            >
              <option value="none" className="bg-cosmos-900 text-neutral-300">
                Template Matcher: Off
              </option>
              {EMPIRICAL_SPECTRAL_TEMPLATES.map((tpl) => (
                <option key={tpl.id} value={tpl.id} className="bg-cosmos-900 text-white">
                  [{tpl.category}] {tpl.name}
                </option>
              ))}
            </select>
          </div>

          {/* "Before vs. After FLAGS & fit_ql < 3.0 Filter" Toggle */}
          <button
            type="button"
            onClick={onToggleQualityFilter}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono border transition ${
              applyQualityFilter
                ? "bg-emerald-950/90 border-emerald-500 text-emerald-300 font-semibold"
                : "bg-rose-950/80 border-rose-500/80 text-rose-200"
            }`}
            title="Filter out channels contaminated by cosmic rays, dichroic edge attenuation, or Tractor fit_ql >= 3.0"
          >
            {applyQualityFilter ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Filter className="w-3.5 h-3.5 text-rose-400" />
            )}
            <span>
              {applyQualityFilter
                ? "QC Filter ON (fit_ql < 3.0)"
                : `Raw Spectrum (${outlierPoints.length} Outlier Spike)`}
            </span>
          </button>
        </div>
      </div>

      {/* Diagnostic Sub-Banner: 4 Molecular Absorption Indices + 3I/ATLAS Coma Q_gas / NEOSSat Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 text-[10px] font-mono">
        <div className="bg-cosmos-950 border border-cosmos-800 rounded px-2.5 py-1.5">
          <span className="text-neutral-400 block">3.0 µm H₂O Ice Depth (τ₃.₀):</span>
          <span className="text-spherex-cyan font-bold text-xs">
            {molecularIndices ? molecularIndices.tau_h2o_30.toFixed(3) : "0.420"}
          </span>
        </div>

        <div className="bg-cosmos-950 border border-cosmos-800 rounded px-2.5 py-1.5">
          <span className="text-neutral-400 block">CH₄ Index (1.65 & 2.25 µm):</span>
          <span className="text-spherex-magenta font-bold text-xs">
            {molecularIndices ? molecularIndices.c_ch4.toFixed(3) : "0.680"} mag
          </span>
        </div>

        <div className="bg-cosmos-950 border border-cosmos-800 rounded px-2.5 py-1.5">
          <span className="text-neutral-400 block">NIR H₂O Index (1.4 & 1.9 µm):</span>
          <span className="text-emerald-400 font-bold text-xs">
            {molecularIndices ? molecularIndices.c_h2o_nir.toFixed(3) : "0.510"} mag
          </span>
        </div>

        <div className="bg-cosmos-950 border border-cosmos-800 rounded px-2.5 py-1.5">
          <span className="text-neutral-400 block">W1–Ks Window Excess (C_W1/K):</span>
          <span className="text-spherex-amber font-bold text-xs">
            {molecularIndices ? molecularIndices.c_w1_k.toFixed(3) : "+1.150"} mag
          </span>
        </div>

        {extendedComaProfile ? (
          <div className="col-span-2 bg-amber-950/50 border border-spherex-amber/60 rounded px-2.5 py-1.5 flex items-center justify-between">
            <div>
              <span className="text-spherex-amber font-bold flex items-center gap-1">
                <Flame className="w-3 h-3" />
                3I/ATLAS Extended Coma Profiler (Lisse+25/26):
              </span>
              <span className="text-neutral-200 block">
                2px Core: {extendedComaProfile.f_core_2pix_mJy.toFixed(1)} mJy | 30px (3&apos;) Coma:{" "}
                {extendedComaProfile.f_total_30pix_mJy.toFixed(1)} mJy
              </span>
            </div>
            <div className="text-right">
              <span className="text-neutral-400 block">Outgassing Q_gas:</span>
              <span className="text-emerald-300 font-bold">
                {extendedComaProfile.Q_gas_molecules_sec.toExponential(2)} mol/s
              </span>
            </div>
          </div>
        ) : (
          <div className="col-span-2 bg-cosmos-950 border border-cosmos-800 rounded px-2.5 py-1.5 flex items-center justify-between">
            <div>
              <span className="text-neutral-400 block flex items-center gap-1">
                <Layers className="w-3 h-3 text-spherex-cyan" />
                Cross-Mission Synergy:
              </span>
              <span className="text-neutral-200">
                SPHEREx 102-Ch IR + unWISE 16-Yr + CSA NEOSSat
              </span>
            </div>
            {onOpenNeossatModal && (
              <button
                type="button"
                onClick={onOpenNeossatModal}
                className="bg-amber-950 hover:bg-amber-900 border border-spherex-amber/60 text-spherex-amber px-2 py-1 rounded text-[10px] font-semibold flex items-center gap-1 transition"
              >
                <Orbit className="w-3 h-3" />
                <span>Solve NEATM (D, p_V, η)</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main Apache ECharts Canvas */}
      <div className="relative w-full h-[290px] bg-cosmos-950 rounded border border-cosmos-800 overflow-hidden">
        <ReactECharts
          option={chartOptions}
          style={{ height: "100%", width: "100%" }}
          onEvents={onEvents}
          notMerge={true}
          lazyUpdate={true}
        />
        {isLoading && (
          <div className="absolute inset-0 bg-cosmos-950/70 flex items-center justify-center">
            <span className="text-xs font-mono text-spherex-cyan animate-pulse">
              Extracting 102-Band Forced Photometry SED...
            </span>
          </div>
        )}
      </div>
    </section>
  );
};