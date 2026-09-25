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

import { keyedPermutation } from "./prng.js";
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
export function embedDCT(cover, blockWidth, blockHeight, payloadBits, key, delta) {
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
export function extractDCT(current, blockWidth, blockHeight, expectedBits, key) {
  // TODO (Hari 4): implementasi pembacaan relasi koefisien per blok,
  // lalu panggil normalizedCorrelation()/bitErrorRate() dari metrics.js.
  throw new Error("extractDCT belum diimplementasikan — dijadwalkan Hari 4.");
}
