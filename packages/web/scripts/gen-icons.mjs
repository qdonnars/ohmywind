// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

// Generates PWA icons (192x192 and 512x512 PNG) using only Node built-ins
import zlib from "zlib";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "../public");

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++)
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.concat([typeBytes, data]);
  const crcVal = Buffer.alloc(4);
  crcVal.writeUInt32BE(crc32(crcBuf));
  return Buffer.concat([len, typeBytes, data, crcVal]);
}

function encodePNG(rgba, size) {
  // Build raw scanlines (filter byte 0 = None per row)
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0; // filter None
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      row[1 + x * 4] = rgba[i];
      row[1 + x * 4 + 1] = rgba[i + 1];
      row[1 + x * 4 + 2] = rgba[i + 2];
      row[1 + x * 4 + 3] = rgba[i + 3];
    }
    rows.push(row);
  }
  const raw = Buffer.concat(rows);
  const compressed = zlib.deflateSync(raw, { level: 9 });

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function drawIcon(size) {
  const rgba = new Uint8Array(size * size * 4);
  const S = size;

  function setPixel(x, y, r, g, b, a = 255) {
    if (x < 0 || x >= S || y < 0 || y >= S) return;
    const i = (y * S + x) * 4;
    // alpha blend over existing
    const ai = a / 255;
    rgba[i]     = Math.round(r * ai + rgba[i]     * (1 - ai));
    rgba[i + 1] = Math.round(g * ai + rgba[i + 1] * (1 - ai));
    rgba[i + 2] = Math.round(b * ai + rgba[i + 2] * (1 - ai));
    rgba[i + 3] = Math.min(255, rgba[i + 3] + a);
  }

  function fillCircleAA(cx, cy, radius, r, g, b) {
    for (let y = Math.floor(cy - radius - 1); y <= Math.ceil(cy + radius + 1); y++) {
      for (let x = Math.floor(cx - radius - 1); x <= Math.ceil(cx + radius + 1); x++) {
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        const alpha = Math.max(0, Math.min(1, radius + 0.5 - dist));
        if (alpha > 0) setPixel(x, y, r, g, b, Math.round(alpha * 255));
      }
    }
  }

  function drawThickCurve(pts, thick, r, g, b) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const steps = Math.ceil(Math.sqrt((x1-x0)**2 + (y1-y0)**2) * 2);
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        fillCircleAA(x0 + (x1-x0)*t, y0 + (y1-y0)*t, thick/2, r, g, b);
      }
    }
  }

  function fillPolygon(pts, r, g, b) {
    const minY = Math.floor(Math.min(...pts.map(p => p[1])));
    const maxY = Math.ceil(Math.max(...pts.map(p => p[1])));
    for (let y = minY; y <= maxY; y++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i+1) % pts.length];
        if ((ay <= y && by > y) || (by <= y && ay > y))
          xs.push(ax + (y - ay) / (by - ay) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k < xs.length - 1; k += 2)
        for (let x = Math.floor(xs[k]); x <= Math.ceil(xs[k+1]); x++)
          setPixel(x, y, r, g, b);
    }
  }

  const sc = S / 512;

  // Background: dark navy
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      rgba[i] = 12; rgba[i+1] = 25; rgba[i+2] = 55; rgba[i+3] = 255;
    }

  // Rounded corners
  const cr = 90 * sc;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = Math.max(0, Math.max(cr - x, x - (S-1-cr)));
      const dy = Math.max(0, Math.max(cr - y, y - (S-1-cr)));
      if (dx*dx + dy*dy > cr*cr) { const i=(y*S+x)*4; rgba[i+3]=0; }
    }
  }

  // ── WING (wingfoil) ──────────────────────────────────────────────
  // Viewed from front: wide crescent shape
  // Leading edge = thick inflatable tube arcing upward
  // Wing body tapers toward each tip

  const cx = S * 0.5;
  const wingCY = S * 0.38; // vertical center of wing

  // Wing body polygon: crescent between leading arc and trailing line
  // Leading arc: wide ellipse top half  (rx=200, ry=80)
  const rx = 200 * sc, ry = 90 * sc;
  const N = 60;
  const leadingEdge = [];
  for (let i = 0; i <= N; i++) {
    const angle = Math.PI + (Math.PI * i / N); // π to 2π (bottom half of ellipse = top of icon)
    leadingEdge.push([cx + rx * Math.cos(angle), wingCY + ry * Math.sin(angle)]);
  }
  // Trailing edge: slight downward curve
  const trailingEdge = [];
  for (let i = N; i >= 0; i--) {
    const t = i / N; // 1→0
    const ex = cx + rx * Math.cos(Math.PI + Math.PI * (N-i) / N);
    const ey = wingCY + 28 * sc + Math.sin(Math.PI * t) * 18 * sc;
    trailingEdge.push([ex, ey]);
  }
  const wingBody = [...leadingEdge, ...trailingEdge];
  // Fill wing body in white
  fillPolygon(wingBody, 240, 245, 255);

  // Leading edge tube (thick arc) — slightly darker
  drawThickCurve(leadingEdge, 18 * sc, 180, 200, 255);

  // Center strut (handle bar connecting wing center downward)
  const strutTop = [cx, wingCY + 5 * sc];
  const strutBot = [cx, wingCY + 90 * sc];
  drawThickCurve([strutTop, strutBot], 8 * sc, 200, 215, 255);

  // Wing tip accents (small circles at tips)
  fillCircleAA(cx - rx, wingCY, 12 * sc, 200, 215, 255);
  fillCircleAA(cx + rx, wingCY, 12 * sc, 200, 215, 255);

  // ── WIND LINES ───────────────────────────────────────────────────
  // Three horizontal lines below the wing, with arrow tips, suggesting wind
  const windY = [wingCY + 125*sc, wingCY + 158*sc, wingCY + 191*sc];
  const windLengths = [0.62, 0.50, 0.38]; // fraction of S
  const wc = [100, 160, 255]; // wind line color

  for (let i = 0; i < 3; i++) {
    const wy = windY[i];
    const wlen = windLengths[i] * S;
    const wx0 = cx - wlen / 2;
    const wx1 = cx + wlen / 2;
    // Line
    drawThickCurve([[wx0, wy], [wx1, wy]], 5 * sc, ...wc);
    // Arrow head
    const ah = 10 * sc;
    drawThickCurve([[wx1 - ah, wy - ah*0.7], [wx1, wy], [wx1 - ah, wy + ah*0.7]], 5 * sc, ...wc);
  }

  return Buffer.from(rgba);
}

for (const size of [192, 512]) {
  const pixels = drawIcon(size);
  const png = encodePNG(pixels, size);
  const out = path.join(OUT, `icon-${size}.png`);
  fs.writeFileSync(out, png);
  console.log(`Written ${out}`);
}
