# Digital Watermarking — Fragile (LSB) & Robust (DCT)

Aplikasi web client-side untuk menyisipkan dan memverifikasi watermark pada citra digital. Metode LSB mendeteksi perubahan citra, sedangkan DCT dirancang agar watermark tetap dapat diverifikasi setelah serangan seperti kompresi JPEG, resize, cropping, noise, dan perubahan kecerahan. Tab **Bandingkan** menguji kedua metode pada citra dan skenario serangan yang sama.

## Fitur

- Penyisipan watermark teks dengan posisi pixel yang diacak menggunakan stego-key.
- Verifikasi fragile LSB beserta peta pixel yang berubah.
- Penyisipan dan ekstraksi blind robust DCT pada blok 8×8.
- Simulasi serangan citra dan perbandingan PSNR, Normalized Correlation (NC), serta Bit Error Rate (BER).
- Ekspor hasil perbandingan ke berkas XLSX.
- Seluruh pemrosesan citra dilakukan di browser; tidak ada backend.

## Persyaratan

- Node.js versi 19 atau lebih baru.
- Browser modern untuk menjalankan aplikasi.

## Instalasi dan Pengujian

```bash
npm install
npm test
```

Tes menggunakan Node.js built-in test runner. `jpeg-js` digunakan untuk pengujian simulasi serangan JPEG.

## Menjalankan Aplikasi

Untuk pengembangan, jalankan server lokal dari direktori proyek:

```bash
python -m http.server 8000
```

Buka `http://localhost:8000`. Alternatifnya, gunakan ekstensi Live Server di VS Code. `index.html` memuat ES Modules, sehingga tidak dapat dijalankan langsung melalui `file://`.

Untuk membuat versi siap dibuka langsung dari `dist/index.html`:

```bash
node build.js
```

Folder `dist/` adalah hasil generate. Jalankan ulang build setelah mengubah file di `src/` dan jangan mengedit bundle secara manual.

## Penggunaan

1. Pilih tab **Fragile (LSB)**, **Robust (DCT)**, atau **Bandingkan**.
2. Unggah citra cover dan masukkan identitas watermark serta stego-key. Untuk DCT, dimensi citra diselaraskan ke blok 8×8.
3. Klik tombol sisipkan untuk membuat citra stego.
4. Pada mode LSB, klik-seret di citra stego untuk mensimulasikan manipulasi. Pada mode DCT atau Bandingkan, pilih serangan yang ingin diterapkan.
5. Verifikasi watermark untuk melihat metrik dan peta perubahan. Mode Bandingkan juga menampilkan hasil kedua metode berdampingan.

## Struktur Proyek

```text
src/
	prng.js       Pembangkitan stego-key dan permutasi posisi
	lsb.js        Watermark fragile LSB
	dct.js        Watermark robust DCT
	metrics.js    PSNR, NC, dan BER
	attacks.js    Simulasi serangan citra
	ui.js         Interaksi UI dan canvas
test/           Unit test Node.js
data-uji/       Data citra pengujian
laporan/        Laporan proyek
index.html      Aplikasi web
build.js        Pembuat bundle untuk dist/
```

## Teknologi

- JavaScript ES Modules, HTML5, dan CSS3.
- Canvas API untuk pemrosesan citra di browser.
- Web Crypto API untuk pembangkitan stego-key.
- Node.js built-in test runner dan `jpeg-js` untuk pengujian.

## Tim

| Anggota | NPM | Tanggung jawab |
|---|---|---|
| Farrell | 247006111202 | Algoritma dan keamanan: `prng.js`, `lsb.js`, serta unit test terkait |
| Dzikra | 247006111201 | Pengujian dan analisis: `metrics.js`, `attacks.js`, serta data uji |
| Kibar | 247006111191 | Integrasi dan pengayaan: `dct.js`, `ui.js`, `index.html`, serta dokumentasi |

## Referensi Dosen Pengampu

Rahmatulloh, A., Surjono, H. D., Arifin, F., Darmawan, I., & Ambarsari, N. (2025). VERITAS: Vision-based excitation and robust intelligence for transformer-assisted deepfakes detection. *International Journal of Intelligent Engineering and Systems, 18*(8), 472–484. https://doi.org/10.22266/ijies2025.0930.29
