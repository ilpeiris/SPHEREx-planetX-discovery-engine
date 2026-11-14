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
import React, { useMemo, useState } from "react";
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
  userTier?: "explorer" | "researcher";
  isLightMode?: boolean;
}

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
  userTier = "researcher",
  isLightMode = false,
}) => {
  const [activeMolecules, setActiveMolecules] = useState<
    Array<"H2O" | "CH4" | "CO2" | "CO">
  >(["H2O", "CH4", "CO2", "CO"]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("none");

  const toggleMolecule = (molId: "H2O" | "CH4" | "CO2" | "CO") => {
    setActiveMolecules((prev) =>
      prev.includes(molId) ? prev.filter((m) => m !== molId) : [...prev, molId]
    );
  };

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

  const chartOptions = useMemo(() => {
    const bgHex = isLightMode ? "#FFFFFF" : "#080A0F";
    const axisTextHex = isLightMode ? "#475569" : "#94A3B8";
    const splitLineHex = isLightMode ? "#E2E8F0" : "#161C28";

    const markAreas: any[] = [];
    MOLECULAR_BAND_OVERLAYS.forEach((mol) => {
      if (activeMolecules.includes(mol.id)) {
        mol.rangesUm.forEach(([x0, x1]) => {
          markAreas.push([
            {
              name: mol.formula,
              xAxis: x0,
              itemStyle: { color: mol.colorRgba },
              label: {
                show: true,
                position: "insideTop",
                color: mol.borderHex,
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
        itemStyle: { color: "#FA903E" },
        lineStyle: { width: 1.75, color: "#FA903E" },
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
        itemStyle: { color: "#0EA5E9" },
        lineStyle: { width: 1.75, color: "#0EA5E9" },
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
        itemStyle: { color: "#EF4444", borderColor: isLightMode ? "#0F172A" : "#FFFFFF", borderWidth: 1 },
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
        itemStyle: { color: selectedTemplate.colorHex },
        lineStyle: {
          width: 2.0,
          type: "dashed",
          color: selectedTemplate.colorHex,
        },
        data: templateCurveData,
      });
    }

    seriesList.push({
      name: "Multi-Epoch Light Curve",
      type: "line",
      xAxisIndex: 1,
      yAxisIndex: 1,
      symbolSize: 7,
      itemStyle: { color: "#EC4899" },
      lineStyle: { width: 1.5, color: "#EC4899" },
      data: lightCurvePoints.map((lc) => [
        lc.mjd,
        lc.fluxUjy,
        lc.fluxErrUjy,
        lc.label,
      ]),
    });

    return {
      backgroundColor: bgHex,
      animationDuration: 220,
      textStyle: { color: axisTextHex, fontFamily: "monospace" },
      tooltip: {
        trigger: "axis",
        backgroundColor: isLightMode ? "rgba(255, 255, 255, 0.96)" : "rgba(11, 14, 20, 0.95)",
        borderColor: isLightMode ? "#CBD5E1" : "#252D3F",
        textStyle: { color: isLightMode ? "#0F172A" : "#F1F5F9", fontSize: 11, fontFamily: "monospace" },
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
        textStyle: { color: axisTextHex, fontSize: 10 },
      },
      grid: [
        { left: 58, right: 20, top: 34, height: "50%" },
        { left: 58, right: 20, top: "68%", height: "22%" },
      ],
      xAxis: [
        {
          gridIndex: 0,
          type: "value",
          min: 0.72,
          max: 5.05,
          name: "Wavelength λ (µm) [D1–D4: R=35–41 | D5–D6: R=112–128]",
          nameLocation: "middle",
          nameGap: 21,
          nameTextStyle: { color: axisTextHex, fontSize: 10 },
          axisLabel: { color: axisTextHex, fontSize: 10 },
          splitLine: { lineStyle: { color: splitLineHex } },
        },
        {
          gridIndex: 1,
          type: "value",
          scale: true,
          name: "Observation Epoch (Modified Julian Date — MJD)",
          nameLocation: "middle",
          nameGap: 21,
          nameTextStyle: { color: axisTextHex, fontSize: 10 },
          axisLabel: { color: axisTextHex, fontSize: 10 },
          splitLine: { lineStyle: { color: splitLineHex } },
        },
      ],
      yAxis: [
        {
          gridIndex: 0,
          type: "value",
          name: "Flux (µJy)",
          nameTextStyle: { color: axisTextHex, fontSize: 10 },
          axisLabel: { color: axisTextHex, fontSize: 10 },
          splitLine: { lineStyle: { color: splitLineHex } },
        },
        {
          gridIndex: 1,
          type: "value",
          name: "Flux (µJy)",
          nameTextStyle: { color: axisTextHex, fontSize: 10 },
          axisLabel: { color: axisTextHex, fontSize: 10 },
          splitLine: { lineStyle: { color: splitLineHex } },
        },
      ],
      series: seriesList,
    };
  }, [
    isLightMode,
    activeMolecules,
    epoch1Points,
    epoch2Points,
    outlierPoints,
    selectedTemplate,
    maxFluxUjy,
    lightCurvePoints,
    applyQualityFilter,
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

  const outerPanel = isLightMode
    ? "bg-white border-slate-300 text-slate-800 shadow-sm"
    : "bg-[#0B0E14] border-[#1E2433] text-slate-100";

  const metricBox = isLightMode
    ? "bg-slate-50 border-slate-200"
    : "bg-[#10141D] border-[#1E2433]";

  return (
    <section className={`w-full border rounded-md p-2.5 space-y-2 select-none transition-colors ${outerPanel}`}>
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-inherit">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-spherex-cyan shrink-0" />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold tracking-wide uppercase">
                Spectrophotometry & Time-Series (0.75–5.00 µm)
              </h3>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                  isLightMode
                    ? "bg-slate-100 border-slate-300 text-slate-700"
                    : "bg-[#141924] border-[#252D3F] text-spherex-cyan"
                }`}
              >
                {sourceLabel} ({raDeg.toFixed(4)}°, {decDeg >= 0 ? "+" : ""}
                {decDeg.toFixed(4)}°)
              </span>
            </div>
          </div>
        </div>

        {/* Molecular Band Overlays, Template Matcher & QC Filter */}
        <div className="flex flex-wrap items-center gap-1.5">
          {MOLECULAR_BAND_OVERLAYS.map((mol) => {
            const isOn = activeMolecules.includes(mol.id);
            return (
              <button
                key={mol.id}
                type="button"
                onClick={() => toggleMolecule(mol.id)}
                title={mol.label}
                style={{
                  borderColor: isOn ? mol.borderHex : isLightMode ? "#CBD5E1" : "#252D3F",
                  backgroundColor: isOn ? mol.colorRgba : "transparent",
                }}
                className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold border transition"
              >
                {mol.formula}
              </button>
            );
          })}

          {userTier === "researcher" && (
            <>
              <div
                className={`flex items-center border rounded px-2 py-0.5 ${
                  isLightMode ? "bg-slate-50 border-slate-300" : "bg-[#141924] border-[#252D3F]"
                }`}
              >
                <Sparkles className="w-3 h-3 text-spherex-amber mr-1 shrink-0" />
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="bg-transparent text-[10px] font-mono focus:outline-none cursor-pointer max-w-[185px] truncate"
                  title="Overplot empirical L0-Y4 brown dwarf, SPLICES ice, or KBO/Comet reference templates"
                >
                  <option
                    value="none"
                    className={isLightMode ? "bg-white text-slate-700" : "bg-[#0B0E14] text-slate-300"}
                  >
                    Template: Off
                  </option>
                  {EMPIRICAL_SPECTRAL_TEMPLATES.map((tpl) => (
                    <option
                      key={tpl.id}
                      value={tpl.id}
                      className={isLightMode ? "bg-white text-slate-900" : "bg-[#0B0E14] text-white"}
                    >
                      [{tpl.category}] {tpl.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={onToggleQualityFilter}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border transition ${
                  applyQualityFilter
                    ? isLightMode
                      ? "bg-emerald-50 border-emerald-600 text-emerald-800 font-semibold"
                      : "bg-[#14221E] border-emerald-500/80 text-emerald-300 font-semibold"
                    : isLightMode
                    ? "bg-rose-50 border-rose-500 text-rose-800"
                    : "bg-[#26151A] border-rose-500/70 text-rose-200"
                }`}
                title="Filter out channels with Tractor fit_ql >= 3.0 or hardware FLAGS"
              >
                {applyQualityFilter ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                ) : (
                  <Filter className="w-3 h-3 text-rose-400" />
                )}
                <span>
                  {applyQualityFilter
                    ? "QC Filter: ON (fit_ql<3)"
                    : `Raw (${outlierPoints.length} Outlier)`}
                </span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Diagnostic Sub-Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-1.5 text-[10px] font-mono">
        <div className={`border rounded px-2 py-1 ${metricBox}`}>
          <span className="opacity-60 block">3.0µm H₂O Ice (τ₃.₀):</span>
          <span className="text-spherex-cyan font-bold">
            {molecularIndices ? molecularIndices.tau_h2o_30.toFixed(3) : "0.420"}
          </span>
        </div>

        <div className={`border rounded px-2 py-1 ${metricBox}`}>
          <span className="opacity-60 block">CH₄ Index (1.65/2.25µm):</span>
          <span className="text-spherex-magenta font-bold">
            {molecularIndices ? molecularIndices.c_ch4.toFixed(3) : "0.680"} mag
          </span>
        </div>

        <div className={`border rounded px-2 py-1 ${metricBox}`}>
          <span className="opacity-60 block">NIR H₂O (1.4/1.9µm):</span>
          <span className="text-emerald-500 font-bold">
            {molecularIndices ? molecularIndices.c_h2o_nir.toFixed(3) : "0.510"} mag
          </span>
        </div>

        <div className={`border rounded px-2 py-1 ${metricBox}`}>
          <span className="opacity-60 block">W1–Ks Excess (C_W1/K):</span>
          <span className="text-spherex-amber font-bold">
            {molecularIndices ? molecularIndices.c_w1_k.toFixed(3) : "+1.150"} mag
          </span>
        </div>

        {extendedComaProfile ? (
          <div className={`col-span-2 border rounded px-2 py-1 flex items-center justify-between ${metricBox}`}>
            <div>
              <span className="text-spherex-amber font-bold flex items-center gap-1">
                <Flame className="w-3 h-3" />
                3I/ATLAS Coma Profiler:
              </span>
              <span className="opacity-80 block">
                Core: {extendedComaProfile.f_core_2pix_mJy.toFixed(1)} mJy | 30px:{" "}
                {extendedComaProfile.f_total_30pix_mJy.toFixed(1)} mJy
              </span>
            </div>
            <div className="text-right">
              <span className="opacity-60 block">Q_gas:</span>
              <span className="text-emerald-500 font-bold">
                {extendedComaProfile.Q_gas_molecules_sec.toExponential(2)} s⁻¹
              </span>
            </div>
          </div>
        ) : (
          <div className={`col-span-2 border rounded px-2 py-1 flex items-center justify-between ${metricBox}`}>
            <div>
              <span className="opacity-60 block flex items-center gap-1">
                <Layers className="w-3 h-3 text-spherex-cyan" />
                Multi-Mission Synergy:
              </span>
              <span>SPHEREx + unWISE + CSA NEOSSat</span>
            </div>
            {onOpenNeossatModal && (
              <button
                type="button"
                onClick={onOpenNeossatModal}
                className={`px-2 py-1 rounded text-[10px] font-semibold border flex items-center gap-1 transition ${
                  isLightMode
                    ? "bg-amber-50 border-amber-500 text-amber-800 hover:bg-amber-100"
                    : "bg-[#241D14] border-spherex-amber/60 text-spherex-amber hover:bg-[#2F2519]"
                }`}
              >
                <Orbit className="w-3 h-3" />
                <span>NEATM Solver</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ECharts Canvas */}
      <div
        className={`relative w-full h-[265px] rounded border overflow-hidden ${
          isLightMode ? "bg-white border-slate-200" : "bg-[#080A0F] border-[#1A202E]"
        }`}
      >
        <ReactECharts
          option={chartOptions}
          style={{ height: "100%", width: "100%" }}
          onEvents={onEvents}
          notMerge={true}
          lazyUpdate={true}
        />
        {isLoading && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="text-xs font-mono text-spherex-cyan animate-pulse">
              Extracting 102-Band Forced Photometry SED...
            </span>
          </div>
        )}
      </div>
    </section>
  );
};