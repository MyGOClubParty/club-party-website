#!/usr/bin/env node
/**
 * 生成各社团的占位图（logo / 封面 / 截图）。
 *
 * 数据源：src/data/clubs.json —— 里面的 logo / cover / images 路径就是生成目标。
 * 用法：
 *   node scripts/gen-club-placeholders.mjs          # 只生成缺失的文件（不会覆盖已有图片）
 *   node scripts/gen-club-placeholders.mjs --force  # 全部重新生成
 *
 * 社团发来真实图片后：
 *   1. 把真实图片放进 static/img/clubs/<slug>/ ；
 *   2. 把 clubs.json 里对应路径改成真实文件名（例如 shot-1.jpg）；
 *   3. 删掉不再使用的占位 svg 即可。组件无需任何改动。
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = resolve(__dirname, '..');
const STATIC_ROOT = join(SITE_ROOT, 'static');
const DATA = JSON.parse(readFileSync(join(SITE_ROOT, 'src/data/clubs.json'), 'utf8'));

const FORCE = process.argv.includes('--force');
const BG = '#23232a';

/* ---------------------------------------------------------------- helpers */

const FONT = "'Minercraftory', 'Minecraft', ui-monospace, Menlo, Consolas, monospace";

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 确定性伪随机：同一个 seed 永远得到同一张图，重跑不会产生 diff。 */
function makeRng(seed) {
  let h = parseInt(createHash('sha1').update(seed).digest('hex').slice(0, 8), 16) >>> 0;
  return () => {
    h ^= h << 13; h >>>= 0;
    h ^= h >> 17;
    h ^= h << 5; h >>>= 0;
    return h / 0xffffffff;
  };
}

function hexToRgb(hex) {
  const v = hex.replace('#', '');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

/** 在基准色上做亮度缩放，用于铺出像素方块底纹。 */
function shade(hex, factor) {
  const [r, g, b] = hexToRgb(hex);
  const c = (n) => Math.max(0, Math.min(255, Math.round(n * factor)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

/** 铺一层像素方块底纹。 */
function pixelField({ w, h, cell, accent, seed, opacity }) {
  const rng = makeRng(seed);
  const out = [];
  for (let y = 0; y < h; y += cell) {
    for (let x = 0; x < w; x += cell) {
      const f = 0.3 + rng() * 0.9;
      out.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${shade(accent, f)}"/>`);
    }
  }
  return `<g opacity="${opacity}" shape-rendering="crispEdges">${out.join('')}</g>`;
}

/** MC 风格的凹陷边框：左上走亮色、右下走暗色。 */
function bezel({ x = 0, y = 0, w, h, size = 4 }) {
  return `<g fill="none" stroke-linecap="butt">
    <path d="M${x},${y + h} L${x},${y} L${x + w},${y}" stroke="rgba(255,255,255,0.32)" stroke-width="${size}"/>
    <path d="M${x + w},${y} L${x + w},${y + h} L${x},${y + h}" stroke="rgba(0,0,0,0.5)" stroke-width="${size}"/>
  </g>`;
}

function label({ x, y, size, text, fill = '#ffffff', weight = 400, spacing = 0 }) {
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}"
    fill="${fill}" text-anchor="middle" letter-spacing="${spacing}"
    style="paint-order:stroke" stroke="rgba(0,0,0,0.7)" stroke-width="${Math.max(2, Math.round(size / 8))}">${esc(text)}</text>`;
}

/** 背景 + 全幅像素底纹 + 暗化 + 外框，三种图共用的底。 */
function backdrop({ w, h, cell, club, seed, dim, tileOpacity }) {
  return `<rect x="0" y="0" width="${w}" height="${h}" fill="${BG}"/>
  ${pixelField({ w, h, cell, accent: club.accent, seed, opacity: tileOpacity })}
  <rect x="0" y="0" width="${w}" height="${h}" fill="rgba(10,10,14,${dim})"/>
  ${bezel({ x: 3, y: 3, w: w - 6, h: h - 6, size: 6 })}`;
}

/* ------------------------------------------------------------ generators */

function logoSvg(club) {
  const s = 256;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${s}" height="${s}" role="img" aria-label="${esc(club.name)} logo 占位图">
  <title>${esc(club.name)} · logo 占位图</title>
  ${backdrop({ w: s, h: s, cell: 16, club, seed: `${club.slug}-logo`, dim: 0.42, tileOpacity: 0.95 })}
  ${label({ x: s / 2, y: s / 2 + 26, size: club.abbr.length > 2 ? 64 : 86, text: club.abbr, weight: 700 })}
</svg>
`;
}

function coverSvg(club) {
  const w = 1280, h = 720;
  const px = 96, py = 176, pw = w - px * 2, ph = 368;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(club.name)} 封面占位图">
  <title>${esc(club.name)} · 封面占位图</title>
  ${backdrop({ w, h, cell: 40, club, seed: `${club.slug}-cover`, dim: 0.4, tileOpacity: 0.6 })}
  <rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="rgba(0,0,0,0.6)"/>
  ${bezel({ x: px, y: py, w: pw, h: ph, size: 7 })}
  ${label({ x: w / 2, y: py + 96, size: 34, text: '占位图 · COVER', fill: 'rgba(255,255,255,0.72)', spacing: 6 })}
  ${label({ x: w / 2, y: py + 196, size: 76, text: club.name, weight: 700, spacing: 4 })}
  ${label({ x: w / 2, y: py + 262, size: 34, text: club.project, fill: 'rgba(255,255,255,0.82)' })}
  ${label({ x: w / 2, y: h - 48, size: 24, text: `1280×720 · 替换 static/img/clubs/${club.slug}/cover.*`, fill: 'rgba(255,255,255,0.45)' })}
</svg>
`;
}

function shotSvg(club, i) {
  const w = 960, h = 720;
  const n = String(i).padStart(2, '0');
  const px = 88, py = 196, pw = w - px * 2, ph = 328;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(club.name)} 截图占位图 ${n}">
  <title>${esc(club.name)} · 截图占位图 ${n}</title>
  ${backdrop({ w, h, cell: 32, club, seed: `${club.slug}-shot-${i}`, dim: 0.46, tileOpacity: 0.55 })}
  <rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="rgba(0,0,0,0.6)"/>
  ${bezel({ x: px, y: py, w: pw, h: ph, size: 7 })}
  ${label({ x: w / 2, y: py + 130, size: 48, text: `截图占位图 ${n}`, weight: 700, spacing: 4 })}
  ${label({ x: w / 2, y: py + 194, size: 30, text: club.name, fill: 'rgba(255,255,255,0.85)' })}
  ${label({ x: w / 2, y: h - 44, size: 22, text: `960×720 · 替换 static/img/clubs/${club.slug}/shot-${i}.*`, fill: 'rgba(255,255,255,0.45)' })}
</svg>
`;
}

/* ------------------------------------------------------------------ main */

const jobs = [];
for (const club of DATA.clubs) {
  jobs.push({ path: club.logo, svg: logoSvg(club) });
  jobs.push({ path: club.cover, svg: coverSvg(club) });
  club.images.forEach((p, idx) => jobs.push({ path: p, svg: shotSvg(club, idx + 1) }));
}

let created = 0, replaced = 0, skipped = 0;
for (const job of jobs) {
  if (!job.path || !job.path.endsWith('.svg')) {
    console.log(`  skip（非 svg，视为真实图片）: ${job.path}`);
    skipped++;
    continue;
  }
  const abs = join(STATIC_ROOT, job.path.replace(/^\//, ''));
  mkdirSync(dirname(abs), { recursive: true });
  const exists = existsSync(abs);
  if (exists && !FORCE) { skipped++; continue; }
  writeFileSync(abs, job.svg, 'utf8');
  exists ? replaced++ : created++;
}

console.log(`占位图：新建 ${created}，覆盖 ${replaced}，跳过 ${skipped}（共 ${jobs.length} 个目标）`);
console.log(`输出目录：${join(STATIC_ROOT, 'img', 'clubs')}`);
