// Minimal build script for Illustra Capture.
// Bundles the TypeScript entry points with esbuild and copies static
// assets (manifest, popup HTML/CSS, icons) into dist/, which is the
// folder you load into Chrome as an unpacked extension.

import { build, context } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";

const watch = process.argv.includes("--watch");
const outdir = "dist";

async function copyStaticAssets() {
  await mkdir(outdir, { recursive: true });
  await cp("manifest.json", `${outdir}/manifest.json`);
  await cp("src/popup/popup.html", `${outdir}/popup.html`);
  await cp("src/popup/popup.css", `${outdir}/popup.css`);
  if (existsSync("icons")) {
    await cp("icons", `${outdir}/icons`, { recursive: true });
  }
}

async function run() {
  await rm(outdir, { recursive: true, force: true });
  await copyStaticAssets();

  const buildOptions = {
    entryPoints: {
      background: "src/background/background.ts",
      popup: "src/popup/popup.ts",
    },
    bundle: true,
    outdir,
    format: "esm",
    target: "chrome110",
    sourcemap: true,
    logLevel: "info",
  };

  if (watch) {
    const ctx = await context(buildOptions);
    await ctx.watch();
    console.log("Watching for changes... (Ctrl+C to stop)");
  } else {
    await build(buildOptions);
    console.log(`Build complete. Load the "${outdir}" folder as an unpacked extension in Chrome.`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
