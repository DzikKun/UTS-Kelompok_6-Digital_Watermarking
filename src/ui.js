import { generateSecretKey } from "./prng.js";
import { textToBits, embedLSB, extractLSB } from "./lsb.js";

let coverW = 0, coverH = 0;
let coverImageData = null;
let stegoOriginal = null;

const $ = (id) => document.getElementById(id);

function toPlainImage(imageData) {
  return { data: imageData.data, width: imageData.width, height: imageData.height };
}

function toImageData(plain) {
  return new ImageData(new Uint8ClampedArray(plain.data), plain.width, plain.height);
}

$("fileInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    coverW = img.width;
    coverH = img.height;
    const coverCanvas = $("coverCanvas");
    coverCanvas.width = coverW;
    coverCanvas.height = coverH;
    coverCanvas.getContext("2d").drawImage(img, 0, 0);
    coverImageData = coverCanvas.getContext("2d").getImageData(0, 0, coverW, coverH);

    const stegoCanvas = $("stegoCanvas");
    stegoCanvas.width = coverW;
    stegoCanvas.height = coverH;
    stegoCanvas.getContext("2d").drawImage(img, 0, 0);

    $("dlBtn").disabled = true;
  };
  img.src = URL.createObjectURL(file);
});

$("genKeyBtn").addEventListener("click", () => {
  $("keyEmbed").value = generateSecretKey(16);
});

$("embedBtn").addEventListener("click", () => {
  if (!coverImageData) { alert("Unggah citra dulu"); return; }
  const key = $("keyEmbed").value.trim();
  if (!key) { alert("Isi atau generate stego-key dulu"); return; }
  const text = $("wmText").value;

  const payloadBits = textToBits(text);
  const coverPlain = toPlainImage(coverImageData);

  const stegoPlain = embedLSB(coverPlain, payloadBits, key);

  const stegoImageData = toImageData(stegoPlain);
  const stegoCanvas = $("stegoCanvas");
  stegoCanvas.getContext("2d").putImageData(stegoImageData, 0, 0);
  stegoOriginal = stegoImageData;

  const psnrQuick = quickPsnr(coverImageData, stegoImageData);
  $("psnrOut").innerHTML =
    `<b>PSNR (cek cepat):</b> ${psnrQuick === Infinity ? "∞" : psnrQuick.toFixed(2) + " dB"} · ` +
    `<b>Payload:</b> ${payloadBits.length} bit`;

  $("dlBtn").disabled = false;
  $("keyExtract").value = key;
  attachTamperHandler(stegoCanvas);
});

function quickPsnr(a, b) {
  let mse = 0, n = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    for (let c = 0; c < 3; c++) { const d = a.data[i + c] - b.data[i + c]; mse += d * d; n++; }
  }
  mse /= n;
  return mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse);
}

function attachTamperHandler(canvas) {
  let drawing = false, sx = 0, sy = 0;
  const ctx = canvas.getContext("2d");
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return [
      Math.floor(((e.touches ? e.touches[0].clientX : e.clientX) - r.left) * (canvas.width / r.width)),
      Math.floor(((e.touches ? e.touches[0].clientY : e.clientY) - r.top) * (canvas.height / r.height)),
    ];
  };
  canvas.onmousedown = (e) => { drawing = true; [sx, sy] = pos(e); };
  canvas.onmousemove = (e) => {
    if (!drawing) return;
    const [x, y] = pos(e);
    ctx.putImageData(stegoOriginal, 0, 0);
    ctx.fillStyle = "rgba(255,140,0,0.9)";
    ctx.fillRect(Math.min(sx, x), Math.min(sy, y), Math.abs(x - sx) || 4, Math.abs(y - sy) || 4);
  };
  window.addEventListener("mouseup", () => {
    if (!drawing) return;
    drawing = false;
    stegoOriginal = ctx.getImageData(0, 0, canvas.width, canvas.height);
  });
}

$("resetBtn").addEventListener("click", () => {
  if (!stegoOriginal) return;
  $("stegoCanvas").getContext("2d").putImageData(stegoOriginal, 0, 0);
});

$("dlBtn").addEventListener("click", () => {
  const a = document.createElement("a");
  a.download = "stego.png";
  a.href = $("stegoCanvas").toDataURL("image/png");
  a.click();
});

$("verifyBtn").addEventListener("click", () => {
  if (!stegoOriginal) { alert("Sisipkan watermark dulu"); return; }
  const key = $("keyExtract").value.trim();
  const expectedBits = textToBits($("wmExpected").value);

  const stegoCanvas = $("stegoCanvas");
  const currentImageData = stegoCanvas.getContext("2d").getImageData(0, 0, coverW, coverH);
  const currentPlain = toPlainImage(currentImageData);

  const result = extractLSB(currentPlain, expectedBits, key);

  const mapCanvas = $("mapCanvas");
  mapCanvas.width = coverW;
  mapCanvas.height = coverH;
  mapCanvas.getContext("2d").putImageData(toImageData(result.tamperMap), 0, 0);

  const ok = result.ber < 0.5;
  $("verifyOut").innerHTML =
    `<b>BER:</b> ${result.ber.toFixed(3)}% · <b>NC:</b> ${result.nc.toFixed(4)} · ` +
    `<b>Tak cocok:</b> ${result.mismatchCount.toLocaleString()} / ${result.totalBits.toLocaleString()}<br>` +
    `<span style="color:${ok ? "#16a34a" : "#dc2626"};font-weight:600">` +
    `${ok ? "✅ Citra UTUH" : "⚠️ TERDETEKSI PERUBAHAN"}</span>`;
});
