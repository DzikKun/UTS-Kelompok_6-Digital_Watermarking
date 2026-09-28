import { generateSecretKey } from "./prng.js";
import { textToBits, bitsToText, embedLSB, extractLSB } from "./lsb.js";
import { embedDCT, extractDCT } from "./dct.js";
import { attackBrightness, attackGaussianNoise, attackResize, attackCrop } from "./attacks.js";
import { psnr } from "./metrics.js";
function canvasToPlainImage(canvas) {
  const ctx = canvas.getContext("2d");
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { data: imgData.data, width: canvas.width, height: canvas.height };
}

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

function attackJPEGBrowser(image, quality) {
  return new Promise((resolve, reject) => {
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = image.width;
    tempCanvas.height = image.height;
    const ctx = tempCanvas.getContext("2d");
    const imgData = new ImageData(
      new Uint8ClampedArray(image.data),
      image.width,
      image.height
    );
    ctx.putImageData(imgData, 0, 0);

    const dataUrl = tempCanvas.toDataURL("image/jpeg", Math.min(Math.max(quality, 1), 100) / 100);

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
      ctx.drawImage(img, 0, 0);
      const result = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
      resolve({ data: result.data, width: tempCanvas.width, height: tempCanvas.height });
    };
    img.onerror = () => reject(new Error("Gagal decode ulang hasil kompresi JPEG."));
    img.src = dataUrl;
  });
}

const ATTACK_PARAM_DEFAULTS = {
  none: { label: "Parameter (tidak dipakai)", value: "" },
  jpeg: { label: "Kualitas JPEG (1-100)", value: "70" },
  noise: { label: "Sigma (kekuatan noise)", value: "10" },
  brightness: { label: "Delta kecerahan (-255..255)", value: "20" },
  resize: { label: "Skala (0-1, mis. 0.5 = setengah)", value: "0.5" },
  crop: { label: "Persentase crop tepi (0-99)", value: "10" },
};

async function applyAttackByType(type, image, paramValue) {
  switch (type) {
    case "none":
      return image;
    case "jpeg":
      return attackJPEGBrowser(image, paramValue);
    case "noise":
      return attackGaussianNoise(image, paramValue);
    case "brightness":
      return attackBrightness(image, paramValue);
    case "resize":
      return attackResize(image, paramValue);
    case "crop":
      return attackCrop(image, paramValue);
    default:
      throw new Error(`Jenis serangan tidak dikenal: ${type}`);
  }
}

function wireAttackParamDefaults(selectEl, paramEl, labelEl) {
  selectEl.addEventListener("change", () => {
    const def = ATTACK_PARAM_DEFAULTS[selectEl.value] || { label: "Parameter", value: "" };
    labelEl.textContent = def.label;
    paramEl.value = def.value;
  });
  const initial = ATTACK_PARAM_DEFAULTS[selectEl.value] || { label: "Parameter", value: "" };
  labelEl.textContent = initial.label;
}

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
  try {
    const payloadBits = textToBits(lsbPayloadEl.value);
    const stego = embedLSB(lsbCoverImage, payloadBits, key);
    drawPlainImageToCanvas(stego, lsbCanvasStego);
    lsbCoverImage.__lastStego = stego;
    lsbCoverImage.__lastPayloadBits = payloadBits;
    lsbCoverImage.__lastPsnr = psnr(lsbCoverImage, stego);
    lsbCoverImage.__lastPayloadText = lsbPayloadEl.value;
    lsbExtractBtn.disabled = false;
    setResult(lsbResultsEl, `Payload (${payloadBits.length} bit) berhasil disisipkan.`);
  } catch (err) {
    console.error(err);
    alert("Gagal embed (LSB): " + err.message);
  }
});

lsbExtractBtn.addEventListener("click", () => {
  const key = lsbKeyEl.value.trim();
  const current = canvasToPlainImage(lsbCanvasStego);
  const expectedBits = lsbCoverImage.__lastPayloadBits;
  if (!expectedBits) {
    alert("Belum ada proses embed pada sesi ini.");
    return;
  }
  try {
    const result = extractLSB(current, expectedBits, key);
    const { ber, nc, mismatchCount, totalBits } = result;
    lsbCoverImage.__lastExtractResult = result;
    const okClass = ber === 0 ? "ok" : "bad";
    setResult(
      lsbResultsEl,
      [
        `<span class="metric ${okClass}">BER: ${ber.toFixed(4)}%</span>`,
        fmtMetric("NC", nc.toFixed(4)),
        fmtMetric("Bit salah", `${mismatchCount}/${totalBits}`),
      ].join("&nbsp;&nbsp;·&nbsp;&nbsp;")
    );
  } catch (err) {
    console.error(err);
    alert("Gagal extract (LSB): " + err.message);
  }
});

const lsbAttackSelect = document.getElementById("lsb-attack");
const lsbAttackParamEl = document.getElementById("lsb-attack-param");
const lsbAttackParamLabelEl = document.getElementById("lsb-attack-param-label");
wireAttackParamDefaults(lsbAttackSelect, lsbAttackParamEl, lsbAttackParamLabelEl);

lsbAttackRunBtn.addEventListener("click", async () => {
  if (!lsbCoverImage || !lsbCoverImage.__lastStego) {
    alert("Lakukan embed terlebih dahulu sebelum menerapkan serangan.");
    return;
  }
  const type = lsbAttackSelect.value;
  const paramValue = parseFloat(lsbAttackParamEl.value);
  if (type !== "none" && !Number.isFinite(paramValue)) {
    alert("Isi nilai parameter serangan terlebih dahulu.");
    return;
  }
  try {
    lsbAttackRunBtn.disabled = true;

    const attacked = await applyAttackByType(type, lsbCoverImage.__lastStego, paramValue);
    drawPlainImageToCanvas(attacked, lsbCanvasStego);
    setResult(
      lsbResultsEl,
      `Serangan "${lsbAttackSelect.selectedOptions[0].text}" diterapkan. Klik "Ekstrak & Verifikasi" untuk lihat dampaknya.`
    );
  } catch (err) {
    console.error(err);
    alert("Gagal menerapkan serangan: " + err.message);
  } finally {
    lsbAttackRunBtn.disabled = false;
  }
});

const dctCoverInput = document.getElementById("dct-cover");
const dctCanvasCover = document.getElementById("dct-canvas-cover");
const dctCanvasStego = document.getElementById("dct-canvas-stego");
const dctPayloadEl = document.getElementById("dct-payload");
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

const dctDeltaEl = document.getElementById("dct-delta");

dctEmbedBtn.addEventListener("click", () => {
  if (!dctCoverImage) return;
  const key = dctKeyEl.value.trim();
  if (!key) {
    alert("Isi atau generate stego-key terlebih dahulu.");
    return;
  }
  const delta = parseFloat(dctDeltaEl.value);
  if (!Number.isFinite(delta) || delta <= 0) {
    alert("Delta harus berupa angka positif (disarankan 20-30).");
    return;
  }
  try {
    const payloadBits = textToBits(dctPayloadEl.value); // reuse util dari lsb.js
    const stego = embedDCT(dctCoverImage, 8, 8, payloadBits, key, delta);
    drawPlainImageToCanvas(stego, dctCanvasStego);
    dctCoverImage.__lastStego = stego;
    dctCoverImage.__lastPayloadBits = payloadBits;
    dctCoverImage.__lastPsnr = psnr(dctCoverImage, stego);
    dctCoverImage.__lastPayloadText = dctPayloadEl.value;
    dctExtractBtn.disabled = false;
    setResult(
      dctResultsEl,
      `Payload (${payloadBits.length} bit) berhasil disisipkan lewat DCT (delta=${delta}).`
    );
  } catch (err) {
    console.error(err);
    alert("Gagal embed (DCT): " + err.message);
  }
});

dctExtractBtn.addEventListener("click", () => {
  const key = dctKeyEl.value.trim();
  const current = canvasToPlainImage(dctCanvasStego);
  const expectedBits = dctCoverImage && dctCoverImage.__lastPayloadBits;
  if (!expectedBits) {
    alert("Belum ada proses embed pada sesi ini.");
    return;
  }
  try {
    const result = extractDCT(current, 8, 8, expectedBits, key);
    const { berFinal, nc, rawBer, recoveredText } = result;
    dctCoverImage.__lastExtractResult = result;
    const okClass = berFinal === 0 ? "ok" : "bad";
    setResult(
      dctResultsEl,
      [
        `<span class="metric ${okClass}">BER final: ${berFinal.toFixed(2)}%</span>`,
        fmtMetric("NC", nc.toFixed(4)),
        fmtMetric("Raw BER per-blok", rawBer.toFixed(2), "%"),
        fmtMetric("Pesan pulih", `"${recoveredText}"`),
      ].join("&nbsp;&nbsp;·&nbsp;&nbsp;")
    );
  } catch (err) {
    console.error(err);
    alert("Gagal extract (DCT): " + err.message);
  }
});

const dctAttackSelect = document.getElementById("dct-attack");
const dctAttackParamEl = document.getElementById("dct-attack-param");
const dctAttackParamLabelEl = document.getElementById("dct-attack-param-label");
wireAttackParamDefaults(dctAttackSelect, dctAttackParamEl, dctAttackParamLabelEl);

dctAttackRunBtn.addEventListener("click", async () => {
  if (!dctCoverImage || !dctCoverImage.__lastStego) {
    alert("Lakukan embed terlebih dahulu sebelum menerapkan serangan.");
    return;
  }
  const type = dctAttackSelect.value;
  const paramValue = parseFloat(dctAttackParamEl.value);
  if (type !== "none" && !Number.isFinite(paramValue)) {
    alert("Isi nilai parameter serangan terlebih dahulu.");
    return;
  }
  try {
    dctAttackRunBtn.disabled = true;
    const attacked = await applyAttackByType(type, dctCoverImage.__lastStego, paramValue);
    drawPlainImageToCanvas(attacked, dctCanvasStego);
    setResult(
      dctResultsEl,
      `Serangan "${dctAttackSelect.selectedOptions[0].text}" diterapkan. Klik "Ekstrak & Verifikasi" untuk lihat dampaknya.`
    );
  } catch (err) {
    console.error(err);
    alert("Gagal menerapkan serangan: " + err.message);
  } finally {
    dctAttackRunBtn.disabled = false;
  }
});

const compareRunBtn = document.getElementById("compare-run");
const compareExportBtn = document.getElementById("compare-export");
const compareTableBody = document.getElementById("compare-table-body");

let lastCompareRows = null; // dipakai juga oleh tombol export

function formatPsnr(value) {
  if (value === undefined || value === null) return "-";
  return value === Infinity ? "∞ (identik)" : value.toFixed(2) + " dB";
}

function renderCompareTable(rows) {
  compareTableBody.innerHTML = rows
    .map(
      ([label, lsbVal, dctVal]) =>
        `<tr><td>${label}</td><td>${lsbVal}</td><td>${dctVal}</td></tr>`
    )
    .join("");
}

compareRunBtn.addEventListener("click", () => {
  const lsbReady = lsbCoverImage && lsbCoverImage.__lastExtractResult;
  const dctReady = dctCoverImage && dctCoverImage.__lastExtractResult;
  if (!lsbReady || !dctReady) {
    alert(
      "Lengkapi dulu proses embed + ekstrak di KEDUA tab (Fragile LSB dan Robust DCT) " +
        "sebelum membandingkan. Boleh coba dengan/ tanpa serangan sesuai skenario uji."
    );
    return;
  }

  const lsbR = lsbCoverImage.__lastExtractResult;
  const dctR = dctCoverImage.__lastExtractResult;
  const lsbAttackName = lsbAttackSelect.selectedOptions[0].text;
  const dctAttackName = dctAttackSelect.selectedOptions[0].text;

  const rows = [
    ["Pesan/payload", lsbCoverImage.__lastPayloadText ?? "-", dctCoverImage.__lastPayloadText ?? "-"],
    ["Serangan diterapkan", lsbAttackName, dctAttackName],
    ["PSNR cover vs stego", formatPsnr(lsbCoverImage.__lastPsnr), formatPsnr(dctCoverImage.__lastPsnr)],
    ["NC", lsbR.nc.toFixed(4), dctR.nc.toFixed(4)],
    ["BER final (%)", lsbR.ber.toFixed(2), dctR.berFinal.toFixed(2)],
    ["Detail tambahan", `Bit salah: ${lsbR.mismatchCount}/${lsbR.totalBits}`, `Raw BER per-blok: ${dctR.rawBer.toFixed(2)}%`],
  ];

  renderCompareTable(rows);
  lastCompareRows = rows;
  compareExportBtn.disabled = false;
});

function xlsxTextEncode(str) {
  return new TextEncoder().encode(str);
}

const XLSX_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function xlsxCrc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = XLSX_CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function xlsxBuildZip(files) {
  function u16(v) { return new Uint8Array([v & 0xff, (v >>> 8) & 0xff]); }
  function u32(v) { return new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]); }
  function concatAll(arrs) {
    const len = arrs.reduce((s, a) => s + a.length, 0);
    const out = new Uint8Array(len);
    let p = 0;
    for (const a of arrs) { out.set(a, p); p += a.length; }
    return out;
  }

  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = xlsxTextEncode(file.name);
    const crc = xlsxCrc32(file.data);
    const size = file.data.length;

    const localHeader = concatAll([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(size), u32(size), u16(nameBytes.length), u16(0),
    ]);
    const localEntry = concatAll([localHeader, nameBytes, file.data]);
    localChunks.push(localEntry);

    const centralHeader = concatAll([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(size), u32(size), u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(offset),
    ]);
    centralChunks.push(concatAll([centralHeader, nameBytes]));

    offset += localEntry.length;
  }

  const centralDir = concatAll(centralChunks);
  const localData = concatAll(localChunks);

  const eocd = concatAll([
    u32(0x06054b50), u16(0), u16(0),
    u16(files.length), u16(files.length),
    u32(centralDir.length), u32(localData.length), u16(0),
  ]);

  return concatAll([localData, centralDir, eocd]);
}

function xlsxEscape(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function xlsxColLetter(n) {
  let s = "";
  n += 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function xlsxBuildSheetXml(rows) {
  let rowsXml = "";
  rows.forEach((row, rIdx) => {
    const rowNum = rIdx + 1;
    let cellsXml = "";
    row.forEach((val, cIdx) => {
      const ref = xlsxColLetter(cIdx) + rowNum;
      if (typeof val === "number" && Number.isFinite(val)) {
        cellsXml += `<c r="${ref}"><v>${val}</v></c>`;
      } else {
        const text = val === undefined || val === null ? "" : String(val);
        cellsXml += `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xlsxEscape(text)}</t></is></c>`;
      }
    });
    rowsXml += `<row r="${rowNum}">${cellsXml}</row>`;
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml}</sheetData></worksheet>`;
}

function buildXlsxBytes(sheetName, rows) {
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xlsxEscape(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
  const sheetXml = xlsxBuildSheetXml(rows);

  return xlsxBuildZip([
    { name: "[Content_Types].xml", data: xlsxTextEncode(contentTypes) },
    { name: "_rels/.rels", data: xlsxTextEncode(rootRels) },
    { name: "xl/workbook.xml", data: xlsxTextEncode(workbookXml) },
    { name: "xl/_rels/workbook.xml.rels", data: xlsxTextEncode(workbookRels) },
    { name: "xl/worksheets/sheet1.xml", data: xlsxTextEncode(sheetXml) },
  ]);
}

compareExportBtn.addEventListener("click", () => {
  if (!lastCompareRows) {
    alert("Susun tabel perbandingan dulu sebelum ekspor.");
    return;
  }
  try {
    const header = ["Metrik", "Fragile (LSB)", "Robust (DCT)"];
    const bytes = buildXlsxBytes("Perbandingan", [header, ...lastCompareRows]);
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "data-uji.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error(err);
    alert("Gagal membuat file xlsx: " + err.message);
  }
});