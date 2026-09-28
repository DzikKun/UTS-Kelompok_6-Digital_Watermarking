import { generateSecretKey } from "./prng.js";
import { textToBits, embedLSB, extractLSB } from "./lsb.js";
import { embedDCT, extractDCT } from "./dct.js";
import { attackBrightness, attackGaussianNoise, attackResize, attackCrop } from "./attacks.js";
import { psnr } from "./metrics.js";

const modes = {
  frag: { state: { cover: null, original: null, current: null, bits: null } },
  rob: { state: { cover: null, original: null, current: null, bits: null } },
  cmp: { state: { cover: null, lsbOriginal: null, dctOriginal: null, lsbCurrent: null, dctCurrent: null, bits: null } },
};

function copyImage(image) {
  return { data: new Uint8ClampedArray(image.data), width: image.width, height: image.height };
}

function canvasToImage(canvas) {
  const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
  return { data: pixels.data, width: canvas.width, height: canvas.height };
}

function drawImage(image, canvas) {
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
}

function clearCanvas(canvas) {
  canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
}

function loadImage(file, alignToBlocks = false) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const width = alignToBlocks ? Math.floor(image.naturalWidth / 8) * 8 : image.naturalWidth;
      const height = alignToBlocks ? Math.floor(image.naturalHeight / 8) * 8 : image.naturalHeight;
      if (!width || !height) {
        URL.revokeObjectURL(url);
        reject(new Error("Citra harus berukuran minimal 8×8 piksel."));
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height);
      resolve({ data: pixels.data, width, height });
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Berkas gambar tidak dapat dibuka."));
    };
    image.src = url;
  });
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function renderMessage(id, message) {
  document.getElementById(id).innerHTML = message ? `<div class="hint">${escapeHTML(message)}</div>` : "";
}

function formatPsnr(value) {
  return value === Infinity ? "∞ (identik)" : `${value.toFixed(2)} dB`;
}

function formatVerdict(ok, success, failure) {
  return `<div class="verdict ${ok ? "ok" : "bad"}">${ok ? success : failure}</div>`;
}

function attackJPEGBrowser(image, quality) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
    const encoded = canvas.toDataURL("image/jpeg", Math.min(Math.max(quality, 1), 100) / 100);
    const decoded = new Image();
    decoded.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(decoded, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      resolve({ data: pixels.data, width: canvas.width, height: canvas.height });
    };
    decoded.onerror = () => reject(new Error("Gagal membaca hasil kompresi JPEG."));
    decoded.src = encoded;
  });
}

async function applyAttack(type, image, mode) {
  const controlName = type === "brightness" ? "brightness" : type;
  const value = Number(document.getElementById(`${mode}-${controlName}`).value);
  switch (type) {
    case "jpeg": return attackJPEGBrowser(image, value);
    case "resize": return attackResize(image, value / 100);
    case "crop": return attackCrop(image, value);
    case "noise": return attackGaussianNoise(image, value);
    case "brightness": return attackBrightness(image, value);
    default: throw new Error(`Jenis serangan tidak dikenal: ${type}`);
  }
}

function modeCanvas(mode, suffix) {
  return document.getElementById(`${mode}-${suffix}`);
}

function enableModeActions(mode, enabled) {
  document.querySelectorAll(`[data-attack-mode="${mode}"]`).forEach((button) => { button.disabled = !enabled; });
  const reset = document.getElementById(`${mode}-reset-attack`);
  if (reset) reset.disabled = !enabled;
  if (mode === "frag") document.getElementById("frag-reset").disabled = !enabled;
}

function downloadCanvas(canvas, filename) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

document.querySelectorAll("[data-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    const activeTab = button.dataset.tab;
    document.querySelectorAll("[data-tab]").forEach((tab) => {
      const selected = tab === button;
      tab.classList.toggle("active", selected);
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    document.querySelectorAll("[role='tabpanel']").forEach((panel) => { panel.hidden = panel.id !== `tab-${activeTab}`; });
  });
});

document.querySelectorAll("[data-range]").forEach((range) => {
  range.addEventListener("input", () => {
    const output = document.querySelector(`[data-value-for="${range.id}"]`);
    if (output) output.textContent = range.value;
  });
});

for (const mode of ["frag", "rob"]) {
  const state = modes[mode].state;
  const isDct = mode === "rob";
  const fileInput = document.getElementById(`${mode}-file`);
  const embedButton = document.getElementById(`${mode}-embed`);
  const verifyButton = document.getElementById(`${mode}-verify`);
  const downloadButton = document.getElementById(`${mode}-download`);

  document.getElementById(`${mode}-key-gen`).addEventListener("click", () => {
    document.getElementById(`${mode}-key-embed`).value = generateSecretKey(16);
  });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      state.cover = await loadImage(file, isDct);
      drawImage(state.cover, modeCanvas(mode, "coverCanvas"));
      clearCanvas(modeCanvas(mode, "stegoCanvas"));
      clearCanvas(modeCanvas(mode, "mapCanvas"));
      state.original = state.current = null;
      embedButton.disabled = false;
      verifyButton.disabled = downloadButton.disabled = true;
      enableModeActions(mode, false);
      renderMessage(`${mode}-embed-out`, `Citra dimuat: ${state.cover.width}×${state.cover.height} piksel.`);
    } catch (error) { alert(error.message); }
  });

  embedButton.addEventListener("click", () => {
    if (!state.cover) return;
    const payload = document.getElementById(`${mode}-payload`).value;
    const key = document.getElementById(`${mode}-key-embed`).value.trim();
    if (!payload) return alert("Isi identitas watermark terlebih dahulu.");
    if (!key) return alert("Isi atau generate stego-key terlebih dahulu.");
    try {
      state.bits = textToBits(payload);
      state.payload = payload;
      state.key = key;
      state.original = isDct
        ? embedDCT(state.cover, 8, 8, state.bits, key, Number(document.getElementById("rob-delta").value))
        : embedLSB(state.cover, state.bits, key);
      state.current = copyImage(state.original);
      drawImage(state.original, modeCanvas(mode, "stegoCanvas"));
      document.getElementById(`${mode}-key-extract`).value = key;
      document.getElementById(`${mode}-expected`).value = payload;
      verifyButton.disabled = downloadButton.disabled = false;
      enableModeActions(mode, true);
      document.getElementById(`${mode}-embed-out`).innerHTML = `<span class="metric">PSNR: ${escapeHTML(formatPsnr(psnr(state.cover, state.original)))}</span><span class="metric">Payload: ${state.bits.length} bit</span>`;
    } catch (error) { alert(`Gagal embed: ${error.message}`); }
  });

  downloadButton.addEventListener("click", () => downloadCanvas(modeCanvas(mode, "stegoCanvas"), `stego-${isDct ? "dct" : "lsb"}.png`));

  verifyButton.addEventListener("click", () => {
    if (!state.current) return;
    const key = document.getElementById(`${mode}-key-extract`).value.trim();
    const expected = textToBits(document.getElementById(`${mode}-expected`).value);
    if (!key || !expected.length) return alert("Stego-key dan identitas yang diharapkan harus diisi.");
    try {
      const result = isDct ? extractDCT(state.current, 8, 8, expected, key) : extractLSB(state.current, expected, key);
      const ber = isDct ? result.berFinal : result.ber;
      drawImage(isDct ? result.blockMap : result.tamperMap, modeCanvas(mode, "mapCanvas"));
      const detail = isDct
        ? `<span class="metric">BER mentah/blok: ${result.rawBer.toFixed(2)}%</span><div class="hint">Teks pulih: <code>${escapeHTML(result.recoveredText)}</code></div>`
        : `<span class="metric">Bit tidak cocok: ${result.mismatchCount.toLocaleString()}</span>`;
      const verdict = formatVerdict(ber < (isDct ? 5 : 0.5), isDct ? "✅ Watermark terverifikasi" : "✅ Citra UTUH", isDct ? "⚠️ Rusak / key salah / serangan terlalu berat" : "⚠️ TERDETEKSI PERUBAHAN");
      document.getElementById(`${mode}-verify-out`).innerHTML = `<span class="metric">NC: ${result.nc.toFixed(4)}</span><span class="metric">BER: ${ber.toFixed(3)}%</span>${detail}${verdict}`;
    } catch (error) { alert(`Gagal verifikasi: ${error.message}`); }
  });

  const resetStego = () => {
    if (!state.original) return;
    state.current = copyImage(state.original);
    drawImage(state.current, modeCanvas(mode, "stegoCanvas"));
  };
  if (isDct) document.getElementById("rob-reset-attack").addEventListener("click", resetStego);
  else document.getElementById("frag-reset").addEventListener("click", resetStego);
}

function attachTamperCanvas() {
  const canvas = modeCanvas("frag", "stegoCanvas"), state = modes.frag.state;
  let drawing = false, start = null;
  const point = (event) => {
    const bounds = canvas.getBoundingClientRect();
    return [Math.floor((event.clientX - bounds.left) * canvas.width / bounds.width), Math.floor((event.clientY - bounds.top) * canvas.height / bounds.height)];
  };
  const paint = (event) => {
    if (!state.current || !start) return;
    drawImage(state.current, canvas);
    const [x, y] = point(event), context = canvas.getContext("2d");
    context.fillStyle = "rgba(255,140,0,.9)";
    context.fillRect(Math.min(start[0], x), Math.min(start[1], y), Math.max(4, Math.abs(x - start[0])), Math.max(4, Math.abs(y - start[1])));
  };
  canvas.addEventListener("pointerdown", (event) => {
    if (!state.current) return;
    drawing = true; start = point(event); canvas.setPointerCapture(event.pointerId); paint(event);
  });
  canvas.addEventListener("pointermove", (event) => { if (drawing) paint(event); });
  canvas.addEventListener("pointerup", () => {
    if (!drawing) return;
    drawing = false; state.current = canvasToImage(canvas); start = null;
  });
  canvas.addEventListener("pointercancel", () => { drawing = false; start = null; });
}
attachTamperCanvas();

document.querySelectorAll('[data-attack-mode="rob"]').forEach((button) => {
  button.addEventListener("click", async () => {
    const mode = button.dataset.attackMode, state = modes[mode].state;
    if (!state.current) return;
    button.disabled = true;
    try {
      state.current = await applyAttack(button.dataset.attackType, state.current, mode);
      drawImage(state.current, modeCanvas(mode, "stegoCanvas"));
    } catch (error) { alert(`Gagal menerapkan serangan: ${error.message}`); }
    finally { button.disabled = false; }
  });
});

const compare = modes.cmp.state;
document.getElementById("cmp-key-gen").addEventListener("click", () => { document.getElementById("cmp-key-embed").value = generateSecretKey(16); });
document.getElementById("cmp-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    compare.cover = await loadImage(file, true);
    drawImage(compare.cover, modeCanvas("cmp", "coverCanvas"));
    clearCanvas(modeCanvas("cmp", "fragCanvas"));
    clearCanvas(modeCanvas("cmp", "robCanvas"));
    compare.lsbOriginal = compare.dctOriginal = compare.lsbCurrent = compare.dctCurrent = null;
    document.getElementById("cmp-embed").disabled = false;
    document.getElementById("cmp-verify").disabled = true;
    document.getElementById("cmp-download-lsb").disabled = true;
    document.getElementById("cmp-download-dct").disabled = true;
    document.getElementById("compare-export").disabled = true;
    enableModeActions("cmp", false);
    renderMessage("cmp-embed-out", `Cover bersama dimuat: ${compare.cover.width}×${compare.cover.height} piksel.`);
  } catch (error) { alert(error.message); }
});

document.getElementById("cmp-embed").addEventListener("click", () => {
  const payload = document.getElementById("cmp-payload").value, key = document.getElementById("cmp-key-embed").value.trim();
  if (!compare.cover) return;
  if (!payload) return alert("Isi identitas watermark terlebih dahulu.");
  if (!key) return alert("Isi atau generate stego-key terlebih dahulu.");
  try {
    compare.bits = textToBits(payload); compare.payload = payload; compare.key = key;
    compare.lsbOriginal = embedLSB(compare.cover, compare.bits, key);
    compare.dctOriginal = embedDCT(compare.cover, 8, 8, compare.bits, key, Number(document.getElementById("cmp-delta").value));
    compare.lsbCurrent = copyImage(compare.lsbOriginal); compare.dctCurrent = copyImage(compare.dctOriginal);
    drawImage(compare.lsbCurrent, modeCanvas("cmp", "fragCanvas")); drawImage(compare.dctCurrent, modeCanvas("cmp", "robCanvas"));
    document.getElementById("cmp-key-extract").value = key; document.getElementById("cmp-expected").value = payload;
    document.getElementById("cmp-verify").disabled = false;
    document.getElementById("cmp-download-lsb").disabled = false; document.getElementById("cmp-download-dct").disabled = false;
    document.getElementById("compare-export").disabled = true; enableModeActions("cmp", true);
    document.getElementById("cmp-embed-out").innerHTML = `<span class="metric">PSNR LSB: ${escapeHTML(formatPsnr(psnr(compare.cover, compare.lsbOriginal)))}</span><span class="metric">PSNR DCT: ${escapeHTML(formatPsnr(psnr(compare.cover, compare.dctOriginal)))}</span><span class="metric">Payload: ${compare.bits.length} bit</span>`;
  } catch (error) { alert(`Gagal menyisipkan kedua watermark: ${error.message}`); }
});

document.getElementById("cmp-download-lsb").addEventListener("click", () => downloadCanvas(modeCanvas("cmp", "fragCanvas"), "stego-lsb.png"));
document.getElementById("cmp-download-dct").addEventListener("click", () => downloadCanvas(modeCanvas("cmp", "robCanvas"), "stego-dct.png"));
document.querySelectorAll('[data-attack-mode="cmp"]').forEach((button) => {
  button.addEventListener("click", async () => {
    if (!compare.lsbCurrent || !compare.dctCurrent) return;
    button.disabled = true;
    try {
      const type = button.dataset.attackType;
      [compare.lsbCurrent, compare.dctCurrent] = await Promise.all([applyAttack(type, compare.lsbCurrent, "cmp"), applyAttack(type, compare.dctCurrent, "cmp")]);
      drawImage(compare.lsbCurrent, modeCanvas("cmp", "fragCanvas")); drawImage(compare.dctCurrent, modeCanvas("cmp", "robCanvas"));
    } catch (error) { alert(`Gagal menerapkan serangan: ${error.message}`); }
    finally { button.disabled = false; }
  });
});

document.getElementById("cmp-reset-attack").addEventListener("click", () => {
  if (!compare.lsbOriginal || !compare.dctOriginal) return;
  compare.lsbCurrent = copyImage(compare.lsbOriginal); compare.dctCurrent = copyImage(compare.dctOriginal);
  drawImage(compare.lsbCurrent, modeCanvas("cmp", "fragCanvas")); drawImage(compare.dctCurrent, modeCanvas("cmp", "robCanvas"));
});

let lastCompareRows = null;
document.getElementById("cmp-verify").addEventListener("click", () => {
  if (!compare.lsbCurrent || !compare.dctCurrent) return;
  const key = document.getElementById("cmp-key-extract").value.trim(), expected = textToBits(document.getElementById("cmp-expected").value);
  if (!key || !expected.length) return alert("Stego-key dan identitas yang diharapkan harus diisi.");
  try {
    const lsb = extractLSB(compare.lsbCurrent, expected, key), dct = extractDCT(compare.dctCurrent, 8, 8, expected, key);
    const lsbOk = lsb.ber < 0.5, dctOk = dct.berFinal < 5;
    lastCompareRows = [
      ["Fragile (LSB)", lsb.nc.toFixed(4), `${lsb.ber.toFixed(3)}%`, lsbOk ? "Utuh" : "Terdeteksi perubahan"],
      ["Robust (DCT)", dct.nc.toFixed(4), `${dct.berFinal.toFixed(3)}%`, dctOk ? "Terverifikasi" : "Rusak / key salah"],
      ["BER mentah/blok DCT", "—", `${dct.rawBer.toFixed(3)}%`, "Sebelum majority-vote"],
    ];
    document.getElementById("cmp-table-out").innerHTML = `<table><thead><tr><th>Metode</th><th>NC</th><th>BER</th><th>Status</th></tr></thead><tbody>${lastCompareRows.map((row, index) => `<tr><td>${row[0]}</td><td>${row[1]}</td><td>${row[2]}</td><td>${index === 2 ? escapeHTML(row[3]) : `<span class="verdict ${index === 0 ? (lsbOk ? "ok" : "bad") : (dctOk ? "ok" : "bad")}">${escapeHTML(row[3])}</span>`}</td></tr>`).join("")}</tbody></table>`;
    document.getElementById("compare-export").disabled = false;
  } catch (error) { alert(`Gagal memverifikasi perbandingan: ${error.message}`); }
});

function xlsxTextEncode(value) { return new TextEncoder().encode(value); }
const xlsxCrcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let crc = n; for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1; table[n] = crc >>> 0; }
  return table;
})();
function xlsxCrc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) crc = xlsxCrcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
function zipStored(files) {
  const u16 = (value) => new Uint8Array([value & 255, value >>> 8 & 255]);
  const u32 = (value) => new Uint8Array([value & 255, value >>> 8 & 255, value >>> 16 & 255, value >>> 24 & 255]);
  const concat = (parts) => { const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let offset = 0; for (const part of parts) { out.set(part, offset); offset += part.length; } return out; };
  const local = [], central = []; let offset = 0;
  for (const file of files) {
    const name = xlsxTextEncode(file.name), crc = xlsxCrc32(file.data), size = file.data.length;
    const header = concat([u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(size), u32(size), u16(name.length), u16(0)]);
    const entry = concat([header, name, file.data]); local.push(entry);
    central.push(concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(size), u32(size), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]));
    offset += entry.length;
  }
  const directory = concat(central), localData = concat(local);
  return concat([localData, directory, concat([u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(directory.length), u32(localData.length), u16(0)])]);
}
function xmlEscape(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]); }
function columnName(index) { let name = ""; for (index++; index; index = Math.floor((index - 1) / 26)) name = String.fromCharCode(65 + (index - 1) % 26) + name; return name; }
function buildXlsx(rows) {
  const sheetRows = rows.map((row, r) => `<row r="${r + 1}">${row.map((value, c) => `<c r="${columnName(c)}${r + 1}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`).join("")}</row>`).join("");
  const entries = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Perbandingan" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
    ["xl/worksheets/sheet1.xml", `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`],
  ].map(([name, xml]) => ({ name, data: xlsxTextEncode(xml) }));
  return zipStored(entries);
}
document.getElementById("compare-export").addEventListener("click", () => {
  if (!lastCompareRows) return;
  const blob = new Blob([buildXlsx([["Metode", "NC", "BER", "Status"], ...lastCompareRows])], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = "data-uji.xlsx"; link.click(); URL.revokeObjectURL(url);
});