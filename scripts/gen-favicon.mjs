/**
 * 由 minecraft-assets 的官方启动器图标生成站点 favicon.ico。
 *
 * 官方图标集已自带 16/32/48/128/256 五档 PNG，所以这里**不做任何缩放或重编码**，
 * 只是把 16/32/48 三张原图塞进 ICO 容器（PNG 内嵌式 ICO，Vista+ / 现代浏览器全支持）。
 * 也就是说 favicon 的像素与 Mojang 原版逐字节一致。
 *
 * 用法：node scripts/gen-favicon.mjs
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const md5 = (buf) => crypto.createHash('md5').update(buf).digest('hex');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ICONS = path.resolve(ROOT, '..', 'minecraft-assets', 'assets', 'icons');
const OUT = path.join(ROOT, 'static', 'img', 'favicon.ico');

/** 用的档位：16（浏览器标签）/ 32（Windows 任务栏）/ 48（快捷方式） */
const SIZES = [16, 32, 48];

/** 把若干 PNG 打包成 ICO。ICONDIR + n × ICONDIRENTRY(16B) + 各 PNG 原始字节 */
function buildIco(entries) {
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0); // reserved
  dir.writeUInt16LE(1, 2); // type: 1 = icon
  dir.writeUInt16LE(entries.length, 4);

  let offset = 6 + entries.length * 16;
  const header = [];
  for (const {size, png} of entries) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // width（0 表示 256）
    e.writeUInt8(size >= 256 ? 0 : size, 1); // height
    e.writeUInt8(0, 2); // 调色板数
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // color planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(png.length, 8); // bytesInRes
    e.writeUInt32LE(offset, 12); // imageOffset
    header.push(e);
    offset += png.length;
  }
  return Buffer.concat([dir, ...header, ...entries.map((e) => e.png)]);
}

/** 读 PNG 的 IHDR，拿真实宽高（不信任文件名） */
function pngSize(buf) {
  if (buf.subarray(0, 8).toString('latin1') !== '\x89PNG\r\n\x1a\n') {
    throw new Error('不是 PNG');
  }
  if (buf.subarray(12, 16).toString('latin1') !== 'IHDR') {
    throw new Error('缺少 IHDR');
  }
  return {width: buf.readUInt32BE(16), height: buf.readUInt32BE(20)};
}

const entries = [];
for (const size of SIZES) {
  const file = path.join(ICONS, `icon_${size}x${size}.png`);
  if (!fs.existsSync(file)) {
    console.error(`[gen-favicon] 缺少官方图标：${file}`);
    process.exit(1);
  }
  const png = fs.readFileSync(file);
  const {width, height} = pngSize(png);
  if (width !== size || height !== size) {
    console.error(`[gen-favicon] ${file} 实际是 ${width}x${height}，与档位 ${size} 不符`);
    process.exit(1);
  }
  entries.push({size, png});
}

const ico = buildIco(entries);
fs.mkdirSync(path.dirname(OUT), {recursive: true});
fs.writeFileSync(OUT, ico);

console.log('[gen-favicon] 输入（minecraft-assets 官方启动器图标，逐字节内嵌）');
for (const {size, png} of entries) {
  console.log(`  icon_${size}x${size}.png  ${size}x${size}  ${png.length}B  md5=${md5(png)}`);
}
console.log(`[gen-favicon] 输出 ${path.relative(ROOT, OUT)}  ${ico.length}B  (${SIZES.join('/')}px)`);
