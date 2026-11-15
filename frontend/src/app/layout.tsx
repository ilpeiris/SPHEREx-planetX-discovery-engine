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

// frontend/src/app/layout.tsx
import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "SPHEREx × Planet X | Powered by M.D.Isuru Lakmal Peiris (@ilpeiris)",
  description:
    "Public-facing 60-FPS WebGL2 multi-epoch sky blink comparator, ZOGY proper image subtraction engine, and 102-band spectrophotometry inspector by M.D.Isuru Lakmal Peiris (@ilpeiris).",
  authors: [
    {
      name: "M.D.Isuru Lakmal Peiris (@ilpeiris)",
      url: "https://github.com/ilpeiris/SPHEREx-planetX-discovery-engine",
    },
  ],
  creator: "M.D.Isuru Lakmal Peiris (@ilpeiris)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* Aladin Lite v3 official stylesheet & WASM loader from CDS Strasbourg CDN */}
        <link
          rel="stylesheet"
          href="https://aladin.cds.unistra.fr/AladinLite/api/v3/latest/aladin.min.css"
        />
        <Script
          src="https://aladin.cds.unistra.fr/AladinLite/api/v3/latest/aladin.js"
          strategy="beforeInteractive"
        />
      </head>
      <body className="bg-cosmos-950 text-neutral-100 antialiased selection:bg-spherex-cyan selection:text-cosmos-950">
        {children}
      </body>
    </html>
  );
}