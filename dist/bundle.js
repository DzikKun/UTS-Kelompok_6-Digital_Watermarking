// Auto-generated oleh build.js — JANGAN diedit manual.
// Sumber asli ada di src/*.js (ES Module).
(function () {
"use strict";

/* ===== src/dct.js ===== */
// src/dct.js
// Modul Robust Watermarking berbasis DCT 2D blok 8×8, blind extraction.
// Environment-agnostic — TIDAK boleh mengimpor document/canvas/window.
//
// STATUS: kerangka saja. Implementasi penuh dijadwalkan Hari 4 (Anggota 3).
// Rencana teknis (sesuai INSTRUKSI_TIM_DAN_TEKNOLOGI.md):
//   1. Konversi RGB -> YCbCr, watermark disisip hanya di kanal Y.
//   2. Bagi kanal Y jadi blok 8x8, DCT 2D per blok.
//   3. Untuk tiap bit payload: bandingkan dua koefisien frekuensi-menengah
//      (misal posisi (3,4) & (4,3)) pada satu blok, atur relasi besar/kecilnya
//      sesuai nilai bit (dengan margin sebesar `delta`).
//   4. Urutan blok yang dipakai ditentukan oleh keyedPermutation(key, totalBlok)
//      dari prng.js — supaya deterministik terhadap stego-key.
//   5. Inverse DCT, gabungkan lagi ke YCbCr -> RGB.
//   6. Ekstraksi: baca ulang relasi koefisien pada blok yang sama (urutan dari
//      keyedPermutation dengan key yang sama) -> tidak perlu citra asli (blind).
//   7. NC & BER final dihitung lewat normalizedCorrelation()/bitErrorRate()
//      dari metrics.js — TIDAK dihitung ulang manual di sini.


// import { normalizedCorrelation, bitErrorRate } from "./metrics.js"; // dipakai saat extractDCT selesai

/**
 * Sisipkan payloadBits ke citra cover memakai DCT 2D blok 8x8 pada kanal Y.
 * @param {{data: Uint8ClampedArray, width: number, height: number}} cover
 * @param {number} blockWidth  - lebar blok, standar 8
 * @param {number} blockHeight - tinggi blok, standar 8
 * @param {number[]} payloadBits - array bit (0/1) yang akan disisipkan
 * @param {string} key - stego-key, dipakai untuk keyedPermutation
 * @param {number} delta - margin/kekuatan sisipan antar koefisien
 * @returns {{data: Uint8ClampedArray, width: number, height: number}} citra stego
 */
function embedDCT(cover, blockWidth, blockHeight, payloadBits, key, delta) {
  if (cover.width % blockWidth !== 0 || cover.height % blockHeight !== 0) {
    throw new Error("Lebar dan tinggi citra harus kelipatan ukuran blok (mis. 8).");
  }
  // TODO (Hari 4): implementasi RGB<->YCbCr, DCT 2D, penyisipan koefisien.
  throw new Error("embedDCT belum diimplementasikan — dijadwalkan Hari 4.");
}

/**
 * Ekstrak payload dari citra (blind — tidak butuh citra cover asli).
 * @param {{data: Uint8ClampedArray, width: number, height: number}} current
 * @param {number} blockWidth
 * @param {number} blockHeight
 * @param {number[]} expectedBits - dipakai untuk hitung NC/BER terhadap hasil ekstraksi
 * @param {string} key
 * @returns {{nc: number, berFinal: number, rawBer: number, recovered: number[],
 *            recoveredText: string, blockMap: any}}
 */
function extractDCT(current, blockWidth, blockHeight, expectedBits, key) {
  // TODO (Hari 4): implementasi pembacaan relasi koefisien per blok,
  // lalu panggil normalizedCorrelation()/bitErrorRate() dari metrics.js.
  throw new Error("extractDCT belum diimplementasikan — dijadwalkan Hari 4.");
}

/* ===== src/ui.js ===== */
// src/ui.js
// Satu-satunya modul yang boleh menyentuh DOM/canvas.
// Tanggung jawab: upload -> canvas -> ImageData -> panggil modul logika -> tampilkan hasil.
//
// STATUS (Anggota 3):
//   [x] Tab switching
//   [x] Upload citra -> gambar ke canvas -> ambil ImageData
//   [x] Generate stego-key via CSPRNG (prng.js)
//   [x] Wiring embed/extract Fragile (LSB) — lsb.js & prng.js milik Anggota 1 sudah selesai
//   [ ] Wiring embed/extract Robust (DCT) -> menunggu dct.js (Hari 4, Anggota 3)
//   [ ] Wiring simulasi serangan -> menunggu attacks.js (Anggota 2)
//   [ ] Tab "Bandingkan" & export data-uji.xlsx -> Hari 6




// dct.js, metrics.js, attacks.js diimpor secara dinamis / dibungkus try-catch
// di bawah supaya file ini tetap bisa dijalankan sebelum modul-modul itu selesai.

/* ------------------------------------------------------------------ */
/* Util kecil                                                          */
/* ------------------------------------------------------------------ */

/** Ambil ImageData dari sebuah <canvas> lalu ubah ke bentuk polos {data,width,height}
 *  sesuai konvensi tim (BUKAN ImageData langsung), supaya konsisten dengan modul logika. */
function canvasToPlainImage(canvas) {
  const ctx = canvas.getContext("2d");
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { data: imgData.data, width: canvas.width, height: canvas.height };
}

/** Gambar objek {data,width,height} ke sebuah <canvas>. */
function drawPlainImageToCanvas(plainImage, canvas) {
  canvas.width = plainImage.width;
  canvas.height = plainImage.height;
  const ctx = canvas.getContext("2d");
  const imgData = new ImageData(
    new Uint8ClampedArray(plainImage.data),
    plainImage.width,
    plainImage.height
  );
  ctx.putImageData(imgData, 0, 0);
}

/** Muat file gambar yang dipilih user ke sebuah <canvas>, resolve dengan {data,width,height}. */
function loadFileToCanvas(file, canvas) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      resolve(canvasToPlainImage(canvas));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function setResult(el, html) {
  el.innerHTML = html;
}

function fmtMetric(label, value, unit = "") {
  return `<span class="metric">${label}: ${value}${unit}</span>`;
}

/* ------------------------------------------------------------------ */
/* Tab switching                                                       */
/* ------------------------------------------------------------------ */

const tabButtons = document.querySelectorAll("nav.tabs button[data-tab]");
const panels = document.querySelectorAll("main[data-panel]");

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabButtons.forEach((b) => b.setAttribute("aria-selected", "false"));
    btn.setAttribute("aria-selected", "true");
    panels.forEach((p) => {
      p.setAttribute("data-active", String(p.dataset.panel === btn.dataset.tab));
    });
  });
});

/* ------------------------------------------------------------------ */
/* Tab: Fragile (LSB)                                                   */
/* ------------------------------------------------------------------ */

const lsbCoverInput = document.getElementById("lsb-cover");
const lsbCanvasCover = document.getElementById("lsb-canvas-cover");
const lsbCanvasStego = document.getElementById("lsb-canvas-stego");
const lsbPayloadEl = document.getElementById("lsb-payload");
const lsbKeyEl = document.getElementById("lsb-key");
const lsbGenKeyBtn = document.getElementById("lsb-gen-key");
const lsbEmbedBtn = document.getElementById("lsb-embed");
const lsbExtractBtn = document.getElementById("lsb-extract");
const lsbAttackRunBtn = document.getElementById("lsb-attack-run");
const lsbResultsEl = document.getElementById("lsb-results");

let lsbCoverImage = null; // {data,width,height}

lsbCoverInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  lsbCoverImage = await loadFileToCanvas(file, lsbCanvasCover);
  lsbEmbedBtn.disabled = false;
  lsbAttackRunBtn.disabled = false;
  setResult(lsbResultsEl, `Citra dimuat: ${lsbCoverImage.width}×${lsbCoverImage.height}px.`);
});

lsbGenKeyBtn.addEventListener("click", () => {
  lsbKeyEl.value = generateSecretKey(16);
});

lsbEmbedBtn.addEventListener("click", () => {
  if (!lsbCoverImage) return;
  const key = lsbKeyEl.value.trim();
  if (!key) {
    alert("Isi atau generate stego-key terlebih dahulu.");
    return;
  }
  const payloadBits = textToBits(lsbPayloadEl.value);
  const stego = embedLSB(lsbCoverImage, payloadBits, key);
  drawPlainImageToCanvas(stego, lsbCanvasStego);
  lsbCoverImage.__lastStego = stego;
  lsbCoverImage.__lastPayloadBits = payloadBits;
  lsbExtractBtn.disabled = false;
  setResult(lsbResultsEl, `Payload (${payloadBits.length} bit) berhasil disisipkan.`);
});

lsbExtractBtn.addEventListener("click", () => {
  const key = lsbKeyEl.value.trim();
  const current = canvasToPlainImage(lsbCanvasStego);
  const expectedBits = lsbCoverImage.__lastPayloadBits;
  if (!expectedBits) {
    alert("Belum ada proses embed pada sesi ini.");
    return;
  }
  const { ber, nc, mismatchCount, totalBits } = extractLSB(current, expectedBits, key);
  const okClass = ber === 0 ? "ok" : "bad";
  setResult(
    lsbResultsEl,
    [
      fmtMetric("BER", ber.toFixed(4), "%"),
      `<span class="metric ${okClass}">NC: ${nc.toFixed(4)}</span>`,
      fmtMetric("Bit salah", `${mismatchCount}/${totalBits}`),
    ].join("&nbsp;&nbsp;·&nbsp;&nbsp;")
  );
});

lsbAttackRunBtn.addEventListener("click", () => {
  // TODO (menunggu attacks.js — Anggota 2):
  // const attackFn = { jpeg: attackJPEG, noise: attackGaussianNoise, ... }[type];
  // const attacked = await attackFn(currentStego, param);
  // drawPlainImageToCanvas(attacked, lsbCanvasStego);
  alert("Simulasi serangan menunggu modul attacks.js (Anggota 2) selesai.");
});

/* ------------------------------------------------------------------ */
/* Tab: Robust (DCT) — kerangka saja, logic menyusul Hari 4             */
/* ------------------------------------------------------------------ */

const dctCoverInput = document.getElementById("dct-cover");
const dctCanvasCover = document.getElementById("dct-canvas-cover");
const dctCanvasStego = document.getElementById("dct-canvas-stego");
const dctEmbedBtn = document.getElementById("dct-embed");
const dctExtractBtn = document.getElementById("dct-extract");
const dctAttackRunBtn = document.getElementById("dct-attack-run");
const dctGenKeyBtn = document.getElementById("dct-gen-key");
const dctKeyEl = document.getElementById("dct-key");
const dctResultsEl = document.getElementById("dct-results");

let dctCoverImage = null;

dctCoverInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  dctCoverImage = await loadFileToCanvas(file, dctCanvasCover);
  dctEmbedBtn.disabled = false;
  dctAttackRunBtn.disabled = false;
  setResult(
    dctResultsEl,
    `Citra dimuat: ${dctCoverImage.width}×${dctCoverImage.height}px. ` +
      (dctCoverImage.width % 8 || dctCoverImage.height % 8
        ? `<span class="metric bad">Peringatan: lebar/tinggi harus kelipatan 8 untuk DCT.</span>`
        : "")
  );
});

dctGenKeyBtn.addEventListener("click", () => {
  dctKeyEl.value = generateSecretKey(16);
});

dctEmbedBtn.addEventListener("click", async () => {
  // TODO (Hari 4 — Anggota 3): import embedDCT dari './dct.js' setelah selesai, contoh:
  //   import { embedDCT } from './dct.js';
  //   const stego = embedDCT(dctCoverImage, 8, 8, payloadBits, key, delta);
  //   drawPlainImageToCanvas(stego, dctCanvasStego);
  alert("Modul dct.js belum diimplementasikan (dijadwalkan Hari 4).");
});

dctExtractBtn.addEventListener("click", () => {
  // TODO (Hari 4 — Anggota 3): panggil extractDCT (blind, tidak butuh citra asli).
  alert("Modul dct.js belum diimplementasikan (dijadwalkan Hari 4).");
});

dctAttackRunBtn.addEventListener("click", () => {
  alert("Simulasi serangan menunggu modul attacks.js (Anggota 2) selesai.");
});

/* ------------------------------------------------------------------ */
/* Tab: Bandingkan — kerangka saja, disusun Hari 6                      */
/* ------------------------------------------------------------------ */

const compareRunBtn = document.getElementById("compare-run");
const compareExportBtn = document.getElementById("compare-export");

compareRunBtn.addEventListener("click", () => {
  // TODO (Hari 6): kumpulkan hasil terakhir dari tab LSB & DCT (PSNR/NC/BER),
  // lalu render ke #compare-table-body.
  alert("Tabel perbandingan disusun setelah dct.js & metrics.js selesai (Hari 6).");
});

compareExportBtn.addEventListener("click", () => {
  // TODO (Hari 6, bersama Anggota 2): pakai SheetJS (xlsx) untuk unduh data-uji.xlsx.
  alert("Ekspor .xlsx menyusul di Hari 6.");
});

})();
