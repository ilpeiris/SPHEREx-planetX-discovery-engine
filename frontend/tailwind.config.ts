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

// frontend/tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        cosmos: {
          950: "rgb(var(--cosmos-950) / <alpha-value>)",
          900: "rgb(var(--cosmos-900) / <alpha-value>)",
          850: "rgb(var(--cosmos-850) / <alpha-value>)",
          800: "rgb(var(--cosmos-800) / <alpha-value>)",
          700: "rgb(var(--cosmos-700) / <alpha-value>)",
        },
        spherex: {
          cyan: "rgb(var(--spherex-cyan) / <alpha-value>)",
          magenta: "rgb(var(--spherex-magenta) / <alpha-value>)",
          amber: "rgb(var(--spherex-amber) / <alpha-value>)",
          emerald: "rgb(var(--spherex-emerald) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;