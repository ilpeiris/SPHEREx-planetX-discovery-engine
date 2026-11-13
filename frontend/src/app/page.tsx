// frontend/src/app/page.tsx
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

import React, { Suspense, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SpherexSkyWorkspace } from "../components/SpherexSkyWorkspace";

function WorkspaceUrlRouter() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const raParam = searchParams.get("ra");
  const decParam = searchParams.get("dec");
  const fovParam = searchParams.get("fov");
  const modeParam = searchParams.get("mode");
  const bandParam = searchParams.get("band");
  const targetParam = searchParams.get("target") || undefined;
  const embedParam = searchParams.get("embed") === "true";

  const initialRaDeg = raParam && Number.isFinite(Number(raParam)) ? Number(raParam) : 133.75985;
  const initialDecDeg = decParam && Number.isFinite(Number(decParam)) ? Number(decParam) : -7.24225;

  const parsedFov = Number(fovParam);
  const initialFovArcmin: 2 | 6 | 15 | 30 =
    parsedFov === 2 || parsedFov === 6 || parsedFov === 15 || parsedFov === 30
      ? parsedFov
      : 6;

  const parsedMode = Number(modeParam);
  const initialRenderMode: 0 | 1 | 2 | 3 =
    parsedMode === 0 || parsedMode === 1 || parsedMode === 2 || parsedMode === 3
      ? parsedMode
      : 1;

  const parsedBand = Number(bandParam);
  const initialChannel =
    Number.isFinite(parsedBand) && parsedBand >= 1 && parsedBand <= 102
      ? Math.round(parsedBand)
      : 74;

  const handleUrlStateChange = useCallback(
    (state: {
      ra: number;
      dec: number;
      fov: number;
      mode: number;
      band: number;
      target?: string;
    }) => {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      params.set("ra", state.ra.toFixed(5));
      params.set("dec", state.dec.toFixed(5));
      params.set("fov", String(state.fov));
      params.set("mode", String(state.mode));
      params.set("band", String(state.band));
      if (state.target) {
        params.set("target", state.target);
      }
      const newUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState({ ...window.history.state }, "", newUrl);
    },
    [router]
  );

  return (
    <SpherexSkyWorkspace
      initialRaDeg={initialRaDeg}
      initialDecDeg={initialDecDeg}
      initialFovArcmin={initialFovArcmin}
      initialRenderMode={initialRenderMode}
      initialChannel={initialChannel}
      initialTargetId={targetParam}
      isEmbedMode={embedParam}
      onUrlStateChange={handleUrlStateChange}
    />
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full bg-cosmos-950 text-spherex-cyan flex items-center justify-center font-mono text-xs">
          Initializing SPHEREx 102-Band WebGL2 &amp; WASM Discovery Workspace...
        </div>
      }
    >
      <WorkspaceUrlRouter />
    </Suspense>
  );
}