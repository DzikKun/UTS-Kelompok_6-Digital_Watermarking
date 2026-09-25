# Digital Watermarking — Fragile (LSB) & Robust (DCT)

Aplikasi web client-side untuk menyisipkan dan memverifikasi watermark digital pada
citra, dengan dua jalur:

- **Fragile — LSB (Least Significant Bit)**: sensitif terhadap manipulasi, cocok
  untuk deteksi tamper (integritas citra).
- **Robust — DCT (Discrete Cosine Transform)**: tahan terhadap kompresi JPEG,
  noise, resize, dan cropping ringan; ekstraksi bersifat *blind* (tidak perlu
  citra asli).

Tab **Bandingkan** menampilkan perbandingan PSNR, NC, dan BER dari kedua metode
pada citra dan skenario serangan yang sama.

> Tugas Mata Kuliah Keamanan Informasi — Topik C: Digital Watermarking.

## Karakteristik

- 100% berjalan di browser (Canvas API). **Tidak ada backend/server**, tidak ada
  data yang dikirim ke mana pun.
- Tanpa framework JS eksternal (HTML + CSS + JavaScript murni, ES Modules).
- Algoritma inti (LSB, DCT, PRNG posisi) ditulis sendiri — bukan pustaka pihak
  ketiga.
- Kunci/stego-key dibangkitkan dengan CSPRNG (`crypto.getRandomValues`), bukan
  `Math.random()`.

## Cara Instalasi & Menjalankan

Tidak perlu instalasi apa pun.

1. Unduh/`clone` folder proyek ini.
2. Buka file `index.html` langsung di browser modern (Chrome/Edge/Firefox
   terbaru).
3. Selesai — semua pemrosesan terjadi lokal di browser Anda.

> Untuk menjalankan unit test (Node.js, tanpa dependency tambahan):
> ```bash
> node --test test/
> ```

## Cara Penggunaan

1. Pilih tab **Fragile (LSB)** atau **Robust (DCT)**.
2. Unggah citra cover.
3. Tulis pesan yang ingin disisipkan, lalu generate atau isi stego-key.
4. Klik **Sisipkan (Embed)** — citra stego akan tampil di kanvas sebelah kanan.
5. (Opsional) Terapkan simulasi serangan pada citra stego.
6. Klik **Ekstrak & Verifikasi** untuk melihat metrik BER/NC dan hasil pemulihan
   pesan.
7. Buka tab **Bandingkan** untuk melihat perbandingan kedua metode berdampingan.

## Struktur Proyek

```
watermark-app/
├── src/
│   ├── prng.js         — CSPRNG key + PRNG posisi (keyedPermutation)
│   ├── lsb.js           — Fragile watermarking (LSB)
│   ├── dct.js            — Robust watermarking (DCT 2D, blind)
│   ├── metrics.js         — PSNR, NC, BER, histogram
│   ├── attacks.js          — Simulasi serangan (JPEG, noise, resize, crop, dst.)
│   └── ui.js                — Wiring UI/canvas, satu-satunya modul yang sentuh DOM
├── test/                      — Unit test (node --test)
├── data-uji/                    — Citra uji & hasil serangan
├── data-uji.xlsx                  — Rekap hasil pengujian
├── index.html                       — Entry point
└── laporan/                           — Laporan akhir
```

## Teknologi

| Kategori | Pilihan |
|---|---|
| Bahasa | JavaScript (ES2022+, ES Modules) |
| Markup/Styling | HTML5, CSS3 murni |
| Kriptografi acak | Web Crypto API (`crypto.getRandomValues`) |
| PRNG posisi | `xmur3` + `mulberry32` + `keyedPermutation` (ditulis sendiri) |
| Testing | Node.js built-in test runner (`node --test`) |
| Ekspor data uji | SheetJS (xlsx), opsional di UI |

## Status Pengerjaan

- [x] Skeleton `index.html` & kerangka UI (upload, canvas, tab)
- [x] Modul `prng.js`, `lsb.js` (Anggota 1)
- [x] Wiring end-to-end Fragile (LSB): embed → extract → BER/NC
- [ ] Modul `dct.js` (Robust) — Hari 4
- [ ] `metrics.js`, `attacks.js` (Anggota 2)
- [ ] Tab **Bandingkan** & ekspor `data-uji.xlsx` — Hari 6
- [ ] Video demo — Hari 5 (draft) & Hari 7 (final)

## Kontribusi & Jobdesk

| Anggota | NPM | Jobdesk |
|---|---|---|
| Anggota 1 | *(isi)* | `prng.js`, `lsb.js`, unit test keduanya, Dasar Teori & Rancangan Sistem |
| Anggota 2 | *(isi)* | `metrics.js`, `attacks.js`, pengujian PSNR/NC/BER, `data-uji.xlsx` |
| Anggota 3 | *(isi)* | Integrasi UI (`ui.js`, `index.html`), modul `dct.js`, tab Bandingkan, README, video demo, Pendahuluan & Kesimpulan |

## Catatan Integritas Akademik

Bagian kode yang dibantu AI dicantumkan di lampiran laporan (bagian mana dan
jenis bantuannya). Setiap anggota dapat menjelaskan kode di modul masing-masing
saat sesi tanya-jawab.
