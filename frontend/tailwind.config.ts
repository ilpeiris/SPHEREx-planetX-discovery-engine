/**
 * ============================================================================
 * @author      M.D.Isuru Lakmal Peiris (@ilpeiris)
 * @project     SPHEREx x Planet X - 102-Band WebGL2 & WASM Discovery Engine
 * @repository  https://github.com/ilpeiris/SPHEREx-planetX-discovery-engine
 * @linkedin    https://www.linkedin.com/in/ilpeiris
 * @Github      https://github.com/ilpeiris/
 * @license     MIT License | Copyright (c) 2026 M.D.Isuru Lakmal Peiris
 * ============================================================================
 */

// frontend/tailwind.config.ts
import type { Config } from "tailwindcss";

const smoothProFontStack = [
  "var(--font-jakarta)",
  "var(--font-inter)",
  "Google Sans",
  "-apple-system",
  "BlinkMacSystemFont",
  "SF Pro Display",
  "SF Pro Text",
  "Segoe UI",
  "Roboto",
  "sans-serif",
];

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        cosmos: {
          950: "#05060a",
          900: "#0a0c14",
          850: "#101420",
          800: "#171c2d",
          700: "#242c44",
        },
        spherex: {
          cyan: "#12B5CB",
          magenta: "#F538A0",
          amber: "#FA903E",
          emerald: "#10B981",
        },
      },
      fontFamily: {
        sans: smoothProFontStack,
        mono: smoothProFontStack,
      },
    },
  },
  plugins: [],
};

export default config;