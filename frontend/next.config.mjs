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

// frontend/next.config.mjs
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  webpack: (config) => {
    // Allow importing raw .glsl WebGL2 shader files as strings
    config.module.rules.push({
      test: /\.(glsl|vs|fs|vert|frag)$/,
      type: "asset/source",
    });

    // Prevent Webpack from bundling onnxruntime-web's Node.js ort.node.min.mjs file
    config.module.rules.push({
      test: /\.m?js$/,
      include: /node_modules[\\/]onnxruntime-web/,
      parser: {
        javascript: {
          url: false,
        },
      },
    });

    // Point onnxruntime-web to its pure browser bundle (no node:module createRequire)
    config.resolve.alias = {
      ...config.resolve.alias,
      "onnxruntime-web": path.resolve(
        __dirname,
        "node_modules/onnxruntime-web/dist/ort.min.js"
      ),
    };

    // Enable async WebAssembly for Aladin Lite v3 and onnxruntime-web
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };

    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
      module: false,
    };

    return config;
  },
};

export default nextConfig;