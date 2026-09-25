// build.js
// Jalankan: node build.js
//
// Menggabungkan src/*.js (ES Module) menjadi satu file dist/bundle.js
// tanpa import/export, supaya bisa dimuat lewat <script> biasa (bukan
// type="module"). Ini menghindari batasan CORS browser terhadap ES Module
// yang dibuka lewat file:// (double-click).
//
// PENTING: src/*.js TIDAK diubah oleh script ini. Source tetap ES Module
// murni untuk keperluan `node --test` dan kontrak antar-modul. dist/ adalah
// hasil build read-only, bukan tempat kalian edit kode.
//
// Tanpa dependency apa pun (tidak perlu esbuild/rollup) — cukup Node.js.

const fs = require("fs");
const path = require("path");

// Urutan HARUS sesuai urutan dependency: modul yang dipakai duluan di depan.
// prng.js -> lsb.js & dct.js -> metrics.js -> attacks.js -> ui.js (paling akhir,
// karena ui.js memanggil semua modul lain dan menyentuh DOM).
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

/** Hapus baris `import ... from '...';` dan keyword `export` dari satu file. */
function stripModuleSyntax(code, filename) {
  // import { a, b } from "./x.js";  |  import x from "./x.js";
  let out = code.replace(/^[ \t]*import\s+[^;]+;?[ \t]*$/gm, "");

  // export function foo(...) {...}  ->  function foo(...) {...}
  // export const foo = ...          ->  const foo = ...
  // export class Foo {...}          ->  class Foo {...}
  out = out.replace(/^([ \t]*)export\s+(function|const|let|var|class|async function)\b/gm, "$1$2");

  // export default function foo(...) {...} -> function foo(...) {...}
  out = out.replace(/^([ \t]*)export\s+default\s+/gm, "$1");

  // export { a, b, c };  (export list di akhir file)
  out = out.replace(/^[ \t]*export\s*\{[^}]*\}\s*;?[ \t]*$/gm, "");

  return `\n/* ===== ${filename} ===== */\n${out.trim()}\n`;
}

function build() {
  if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR);

  let bundle = `// Auto-generated oleh build.js — JANGAN diedit manual.\n// Sumber asli ada di src/*.js (ES Module).\n(function () {\n"use strict";\n`;

  const missing = [];
  for (const rel of MODULE_ORDER) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      missing.push(rel);
      continue;
    }
    const code = fs.readFileSync(abs, "utf8");
    bundle += stripModuleSyntax(code, rel);
  }

  bundle += "\n})();\n";

  fs.writeFileSync(path.join(DIST_DIR, "bundle.js"), bundle, "utf8");

  // Salin index.html, ganti <script type="module" src="./src/ui.js"> jadi <script src="./bundle.js">
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
