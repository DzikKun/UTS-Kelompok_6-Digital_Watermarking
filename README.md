# Digital Watermarking — Fragile (LSB) & Robust (DCT)

Website untuk menyisipkan dan memverifikasi watermark pada citra digital. Dibuat untuk memenuhi tugas proyek mata kuliah Keamanan Informasi, Topik C: Digital Watermarking.

## Deskripsi

Penyalahgunaan dan pemalsuan konten citra digital — mulai dari klaim kepemilikan foto tanpa izin hingga manipulasi foto barang bukti — membutuhkan mekanisme untuk membuktikan keaslian dan kepemilikan sebuah citra. Aplikasi ini menyediakan dua pendekatan watermarking yang saling melengkapi:

- **Fragile Watermark (LSB)** — menyisipkan identitas pemilik ke bit terakhir (Least Significant Bit) setiap pixel. Watermark ini sengaja dibuat rapuh: perubahan sekecil apa pun pada citra akan merusak watermark dan bisa dipetakan lokasinya, sehingga cocok untuk mendeteksi pemalsuan (misalnya foto barang bukti atau dokumen hasil pindai).

- **Robust Watermark (DCT)** — menyisipkan identitas pada koefisien frekuensi menengah hasil Discrete Cosine Transform blok 8x8 di kanal luminansi (Y). Watermark ini dirancang untuk bertahan terhadap kompresi JPEG, resize, cropping, noise, dan perubahan kecerahan, sehingga cocok untuk bukti kepemilikan konten (misalnya foto produk UMKM atau karya fotografer).

Kedua metode bisa dibandingkan langsung pada citra dan serangan yang sama melalui tab Bandingkan.

## Fitur

Fitur wajib:
- Penyisipan dan ekstraksi watermark identitas (teks/NPM) dengan metode LSB
- Posisi pixel diacak menggunakan PRNG yang di-seed dari stego-key
- Peta area yang terdeteksi berubah (tamper map) untuk jalur fragile
- Perhitungan PSNR, Normalized Correlation (NC), dan Bit Error Rate (BER)

Fitur pengayaan:
- Jalur Robust (DCT) dengan ekstraksi blind (tidak membutuhkan citra asli)
- Simulasi serangan: kompresi JPEG (kualitas 90/70/50), resize, cropping, derau Gaussian, kecerahan/kontras
- Tab perbandingan Fragile vs Robust pada citra dan serangan yang sama

## Struktur Proyek

```
watermark-app/
  src/
    prng.js       PRNG berkunci dan pembangkit stego-key (CSPRNG)
    lsb.js        Penyisipan dan ekstraksi watermark fragile (LSB)
    dct.js        Penyisipan dan ekstraksi watermark robust (DCT)
    metrics.js    Perhitungan PSNR, NC, BER, histogram
    attacks.js    Simulasi serangan citra
    ui.js         Wiring antarmuka (upload, canvas, tampilan hasil)
  test/
    prng.test.js
    lsb.test.js
    metrics.test.js
    attacks.test.js
    dct.test.js
  data-uji/       Citra uji dan hasil serangan
  laporan/        Laporan teknis
  index.html
  package.json
  README.md
```

## Teknologi

- JavaScript (ES Modules), HTML5, CSS3 — seluruhnya client-side, tanpa backend
- Algoritma LSB, DCT 2D, PRNG berkunci, dan seluruh rumus metrik ditulis sendiri
- Web Crypto API (`crypto.getRandomValues`) untuk pembangkitan stego-key
- Node.js built-in test runner (`node --test`) untuk unit testing
- Library pihak ketiga hanya `jpeg-js`, dipakai khusus untuk simulasi serangan JPEG saat pengujian di Node.js

## Cara Instalasi

Persyaratan: Node.js versi 19 ke atas.

Clone repositori:

git clone https://github.com/DzikKun/UTS-Kelompok_6-Digital_Watermarking.git
cd UTS-Kelompok_6-Digital_Watermarking

Install dependency:

npm install

## Cara Menjalankan

Menjalankan seluruh unit test:

npm test

Menjalankan aplikasi web. Karena `ui.js` memakai ES Module (`import`/`export`), `index.html` tidak bisa dibuka langsung dengan dobel klik dari `file://`, harus melalui server lokal:

npx serve .

Lalu buka alamat yang ditampilkan di terminal (biasanya `http://localhost:3000`) di browser.

Alternatif memakai VS Code: install ekstensi Live Server, klik kanan `index.html`, pilih "Open with Live Server".

## Contoh Penggunaan

Jalur Fragile (LSB):

1. Buka tab Fragile (LSB) di aplikasi
2. Upload citra cover
3. Isi identitas watermark, misalnya `NPM:213040001`
4. Klik "Generate Key" untuk membangkitkan stego-key secara acak
5. Klik "Sisipkan Watermark", nilai PSNR akan ditampilkan
6. Klik dan seret pada citra stego untuk mensimulasikan manipulasi
7. Klik "Verifikasi & Ekstraksi" untuk melihat peta area yang berubah beserta BER dan NC

Jalur Robust (DCT):

1. Buka tab Robust (DCT)
2. Upload citra cover, isi identitas dan stego-key seperti sebelumnya
3. Klik "Sisipkan Watermark"
4. Pilih salah satu simulasi serangan (JPEG, resize, cropping, noise, atau kecerahan) dan terapkan
5. Klik "Ekstraksi & Verifikasi (Blind)" untuk melihat NC dan BER setelah serangan, tanpa membutuhkan citra asli

Tab Bandingkan:

1. Upload satu citra, sisipkan watermark dengan kedua metode sekaligus
2. Terapkan satu serangan yang sama ke kedua hasil stego
3. Verifikasi keduanya untuk membandingkan NC dan BER Fragile vs Robust secara berdampingan

## Tim


| [Farrell Anggota 1] | [247006111202] | Algoritma & keamanan — `prng.js`, `lsb.js`, unit test terkait |
| [Dzikra Anggota 2] | [247006111201] | Pengujian & analisis — `metrics.js`, `attacks.js`, data uji |
| [Kibar Anggota 3] | [247006111191] | Integrasi & pengayaan — `dct.js`, `ui.js`, `index.html`, dokumentasi |

## Referensi Dosen Pengampu

Rahmatulloh, A., Surjono, H. D., Arifin, F., Darmawan, I., & Ambarsari, N. (2025). VERITAS: Vision-based excitation and robust intelligence for transformer-assisted deepfakes detection. International Journal of Intelligent Engineering and Systems, 18(8), 472-484. https://doi.org/10.22266/ijies2025.0930.29
