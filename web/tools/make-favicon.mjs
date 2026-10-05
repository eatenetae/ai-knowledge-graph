#!/usr/bin/env node
/**
 * 生成 web/public/favicon.ico —— 与 index.html 里内联 SVG 图标同一幅「三点连线」图形。
 *
 * 为什么需要它：内联 data: URI 图标省了请求，但书签站、爬虫和一部分客户端仍会
 * 直接请求 /favicon.ico，没有这个文件就是一次 404。内联声明保留，这个文件兜底。
 *
 * 为什么自己画而不用设计工具：图形就是三个圆 + 两条线，纯数学可以精确复现；
 * 脚本零依赖（只用 node:zlib），图标要调整时改这里的参数重跑一次即可：
 *
 *   node web/tools/make-favicon.mjs
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TARGET = resolve(HERE, '../public/favicon.ico');

// 图形定义在 32×32 的坐标系里，与 index.html 内联 SVG 完全一致
const VIEWBOX = 32;
const CIRCLES = [
  { cx: 16, cy: 7, r: 4.5, color: [0x2f, 0x6d, 0xf6] }, // 蓝：上游知识点
  { cx: 7, cy: 24, r: 3.5, color: [0x14, 0xa3, 0x7f] }, // 绿：下游一
  { cx: 25, cy: 24, r: 3.5, color: [0xa8, 0x55, 0xc9] }, // 紫：下游二
];
const EDGES = [
  [16, 11.5, 8.5, 20.5],
  [16, 11.5, 23.5, 20.5],
].map(([x1, y1, x2, y2]) => ({ x1, y1, x2, y2, color: [0x99, 0x99, 0x99] }));
const STROKE_RADIUS = 1; // SVG 里 stroke-width: 2 的一半
const SIZES = [16, 32, 48]; // 16 浏览器标签页 / 32 任务栏 / 48 桌面快捷方式
const SUPERSAMPLE = 4; // 每轴 4 倍超采样，圆的边缘才不会锯齿

/** 把 32×32 坐标系里的图形光栅化成 size×size 的 RGBA 像素。 */
function render(size) {
  const scale = size / VIEWBOX;
  const pixels = new Uint8Array(size * size * 4);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let hits = 0;

      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const x = (px + (sx + 0.5) / SUPERSAMPLE) / scale;
          const y = (py + (sy + 0.5) / SUPERSAMPLE) / scale;
          const color = colorAt(x, y);
          if (color) {
            red += color[0];
            green += color[1];
            blue += color[2];
            hits++;
          }
        }
      }

      const offset = (py * size + px) * 4;
      if (hits > 0) {
        pixels[offset] = Math.round(red / hits);
        pixels[offset + 1] = Math.round(green / hits);
        pixels[offset + 2] = Math.round(blue / hits);
        pixels[offset + 3] = Math.round((hits / (SUPERSAMPLE * SUPERSAMPLE)) * 255);
      }
    }
  }

  return pixels;
}

/** 点 (x, y) 落在图形上时返回它的颜色，否则返回 null。 */
function colorAt(x, y) {
  for (const edge of EDGES) {
    if (distanceToSegment(x, y, edge) <= STROKE_RADIUS) return edge.color;
  }
  for (const circle of CIRCLES) {
    const dx = x - circle.cx;
    const dy = y - circle.cy;
    if (dx * dx + dy * dy <= circle.r * circle.r) return circle.color;
  }
  return null;
}

function distanceToSegment(x, y, { x1, y1, x2, y2 }) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared));
  const px = x1 + t * dx;
  const py = y1 + t * dy;
  return Math.hypot(x - px, y - py);
}

/** RGBA 像素 → PNG 文件字节（每行前置 filter=0，IDAT 用 zlib 压缩）。 */
function encodePng(size, pixels) {
  const stride = size * 4 + 1; // 每行 = 1 字节 filter + size×4 字节像素
  const raw = Buffer.alloc(stride * size);
  for (let row = 0; row < size; row++) {
    raw[row * stride] = 0; // filter: None
    Buffer.from(pixels.buffer, row * size * 4, size * 4).copy(raw, row * stride + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 位深
  ihdr[9] = 6; // 颜色类型：RGBA
  ihdr[10] = 0; // 压缩
  ihdr[11] = 0; // 滤波
  ihdr[12] = 0; // 隔行

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 0);
  return Buffer.concat([head, data, crc]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** 把各尺寸的 PNG 打包进一个 ICO 容器（Vista 起支持 PNG 条目，现代浏览器全兼容）。 */
function packIco(pngs) {
  const count = pngs.length;
  const entries = Buffer.alloc(6 + 16 * count);
  entries.writeUInt16LE(0, 0); // reserved
  entries.writeUInt16LE(1, 2); // type: icon
  entries.writeUInt16LE(count, 4);

  let offset = entries.length;
  const parts = [entries];
  pngs.forEach((png, index) => {
    const base = 6 + 16 * index;
    entries[base] = SIZES[index] >= 256 ? 0 : SIZES[index]; // 0 表示 256
    entries[base + 1] = entries[base]; // 高度同宽度（图形是方的）
    entries.writeUInt16LE(1, base + 4); // planes
    entries.writeUInt16LE(32, base + 6); // 位深
    entries.writeUInt32LE(png.length, base + 8);
    entries.writeUInt32LE(offset, base + 12);
    parts.push(png);
    offset += png.length;
  });

  return Buffer.concat(parts);
}

mkdirSync(dirname(TARGET), { recursive: true });
const pngs = SIZES.map((size) => encodePng(size, render(size)));
writeFileSync(TARGET, packIco(pngs));
process.stdout.write(`✓ 已写出 ${TARGET}（尺寸 ${SIZES.join(' / ')}，共 ${pngs.reduce((n, p) => n + p.length, 0)} 字节 PNG）\n`);
