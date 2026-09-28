import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODULE_ORDER = [
  "src/prng.js",
  "src/lsb.js",
  "src/dct.js",
  "src/metrics.js",
  "src/attacks.js",
  "src/ui.js",
];

const ROOT = __dirname;
const DIST_DIR = path.join(ROOT, "dist");

function stripModuleSyntax(code) {
  let out = code;
  out = out.replace(/^[ \t]*import\s+[^;]+;?[ \t]*$/gm, "");
  out = out.replace(/^([ \t]*)export\s+(function|const|let|var|class|async function)\b/gm, "$1$2");
  out = out.replace(/^([ \t]*)export\s+default\s+/gm, "$1");
  out = out.replace(/^[ \t]*export\s*\{[^}]*\}\s*;?[ \t]*$/gm, "");
  return `\n${out.trim()}\n`;
}

function build() {
  if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR);

  let bundle = `(function () {\n"use strict";\n`;

  const missing = [];
  for (const rel of MODULE_ORDER) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      missing.push(rel);
      continue;
    }
    const code = fs.readFileSync(abs, "utf8");
    bundle += stripModuleSyntax(code);
  }

  bundle += "\n})();\n";

  fs.writeFileSync(path.join(DIST_DIR, "bundle.js"), bundle, "utf8");

  const srcHtmlPath = path.join(ROOT, "index.html");
  if (fs.existsSync(srcHtmlPath)) {
    let html = fs.readFileSync(srcHtmlPath, "utf8");
    html = html.replace(
      /<script\s+type=["']module["']\s+src=["']\.\/src\/ui\.js["']\s*>\s*<\/script>/,
      '<script src="./bundle.js"></script>'
    );
    fs.writeFileSync(path.join(DIST_DIR, "index.html"), html, "utf8");
  } else {
    console.warn("! index.html tidak ditemukan di root, dist/index.html tidak dibuat.");
  }

  console.log("Build selesai -> dist/bundle.js" + (fs.existsSync(path.join(DIST_DIR, "index.html")) ? " & dist/index.html" : ""));
  if (missing.length) {
    console.warn("\n! Modul berikut belum ada, dilewati (bundle akan error di browser sampai file ini tersedia):");
    missing.forEach((m) => console.warn("  - " + m));
  }
  console.log("\nBuka dist/index.html langsung di browser (boleh double-click, tanpa server lokal).");
}

build();
