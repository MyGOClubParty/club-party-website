#!/usr/bin/env node
/**
 * 把原版贴图同步成「文章里的 emoji」——`static/mc/emoji/<名字>.png`。
 *
 * 用法：
 *   node scripts/sync-mc-emoji.mjs            # 缺哪张拷哪张，已存在且字节一致就跳过
 *   node scripts/sync-mc-emoji.mjs --check    # 只核对，不动文件（缺/不一致 → 非 0 退出）
 *
 * 为什么单开一份清单而不是「把 item/ 整目录拷进来」：`minecraft-assets` 里有一千多张贴图，
 * 全拷进来是几百 KB 的无用体积，而文章用得上的就那么几十张。清单里的每一项都是**按字节比对
 * 出来的**（源文件与 `static/mc/emoji/` 里的同名文件 md5 一致），所以这份表同时就是溯源记录：
 * 左边是文章里写 `<McEmoji name="..." />` 用的名字，右边是它在原版素材里的出处。
 *
 * 加新 emoji：往 MANIFEST 里补一行，把 `minecraft-assets/assets/minecraft/textures/` 下对应的
 * png 放好，再跑一次本脚本。**不要手改 `static/mc/emoji/` 里的文件** —— 那会让它与原版不一致。
 *
 * 源素材目录与站点仓库同级（`../minecraft-assets`），不在仓库里；目录不存在时本脚本会明说并
 * 跳过（`--check` 下算失败），而不是静默当成「全都对」。
 */

import {createHash} from 'node:crypto';
import {copyFileSync, existsSync, mkdirSync, readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = resolve(__dirname, '..');
const SRC_ROOT = resolve(SITE_ROOT, '..', 'minecraft-assets', 'assets', 'minecraft', 'textures');
const DST_ROOT = join(SITE_ROOT, 'static', 'mc', 'emoji');

/** [文章里用的名字, 原版素材里的相对路径] */
const MANIFEST = [
  ['amethyst_shard', 'item/amethyst_shard.png'],
  ['apple', 'item/apple.png'],
  ['armor_stand', 'item/armor_stand.png'],
  ['barrier', 'item/barrier.png'],
  ['beacon', 'block/beacon.png'],
  ['beetroot', 'item/beetroot.png'],
  ['bell', 'item/bell.png'],
  ['bone', 'item/bone.png'],
  ['book', 'item/book.png'],
  ['bookshelf', 'block/bookshelf.png'],
  ['bread', 'item/bread.png'],
  ['brush', 'item/brush.png'],
  ['cake', 'item/cake.png'],
  ['clock', 'item/clock_00.png'],
  ['coal', 'item/coal.png'],
  ['compass', 'item/compass_16.png'],
  ['crafting_table', 'block/crafting_table_front.png'],
  ['diamond', 'item/diamond.png'],
  ['diamond_block', 'block/diamond_block.png'],
  ['dirt', 'block/dirt.png'],
  ['echo_shard', 'item/echo_shard.png'],
  ['egg', 'item/egg.png'],
  ['elytra', 'item/elytra.png'],
  ['emerald', 'item/emerald.png'],
  ['emerald_block', 'block/emerald_block.png'],
  ['enchanting_table', 'block/enchanting_table_top.png'],
  ['ender_eye', 'item/ender_eye.png'],
  ['ender_pearl', 'item/ender_pearl.png'],
  ['experience_bottle', 'item/experience_bottle.png'],
  ['feather', 'item/feather.png'],
  ['firework_rocket', 'item/firework_rocket.png'],
  ['firework_star', 'item/firework_star.png'],
  ['flint_and_steel', 'item/flint_and_steel.png'],
  ['glow_ink', 'item/glow_ink_sac.png'],
  ['goat_horn', 'item/goat_horn.png'],
  ['gold_block', 'block/gold_block.png'],
  ['golden_apple', 'item/golden_apple.png'],
  ['grass_block_side', 'block/grass_block_side.png'],
  ['grass_block_top', 'block/grass_block_top.png'],
  ['heart_of_the_sea', 'item/heart_of_the_sea.png'],
  ['honeycomb', 'item/honeycomb.png'],
  ['hopper', 'item/hopper.png'],
  ['iron_block', 'block/iron_block.png'],
  ['iron_ingot', 'item/iron_ingot.png'],
  ['item_frame', 'item/item_frame.png'],
  ['lantern', 'block/lantern.png'],
  ['lead', 'item/lead.png'],
  ['mace', 'item/mace.png'],
  ['map', 'item/filled_map.png'],
  ['milk_bucket', 'item/milk_bucket.png'],
  ['name_tag', 'item/name_tag.png'],
  ['nautilus_shell', 'item/nautilus_shell.png'],
  ['nether_star', 'item/nether_star.png'],
  ['observer', 'block/observer_front.png'],
  ['ominous_bottle', 'item/ominous_bottle.png'],
  ['painting', 'item/painting.png'],
  ['piston', 'block/piston_top.png'],
  ['pumpkin_pie', 'item/pumpkin_pie.png'],
  ['quartz', 'item/quartz.png'],
  ['redstone', 'item/redstone.png'],
  ['repeater', 'item/repeater.png'],
  ['shears', 'item/shears.png'],
  ['slime_ball', 'item/slime_ball.png'],
  ['spyglass', 'item/spyglass.png'],
  ['stick', 'item/stick.png'],
  ['stone', 'block/stone.png'],
  ['sweet_berries', 'item/sweet_berries.png'],
  ['sword', 'item/wooden_sword.png'],
  ['tnt', 'block/tnt_side.png'],
  ['torch', 'block/torch.png'],
  ['totem', 'item/totem_of_undying.png'],
  ['trial_key', 'item/trial_key.png'],
  ['trident', 'item/trident.png'],
  ['writable_book', 'item/writable_book.png'],
  ['written_book', 'item/written_book.png'],
];

const CHECK_ONLY = process.argv.includes('--check');
const md5 = (file) => createHash('md5').update(readFileSync(file)).digest('hex');

if (!existsSync(SRC_ROOT)) {
  const message = `找不到原版素材目录：${SRC_ROOT}`;
  if (CHECK_ONLY) {
    console.error(`${message}\n（--check 模式下这算失败：核不了就等于没核）`);
    process.exit(1);
  }
  console.log(`${message}\n本机没有素材库，跳过同步（${MANIFEST.length} 项清单未处理）。`);
  process.exit(0);
}

mkdirSync(DST_ROOT, {recursive: true});

const missing = [];
let copied = 0;
let same = 0;
let stale = 0;

for (const [name, rel] of MANIFEST) {
  const from = join(SRC_ROOT, rel);
  const to = join(DST_ROOT, `${name}.png`);
  if (!existsSync(from)) {
    missing.push(`${name} ← ${rel}（源文件不存在）`);
    continue;
  }
  if (existsSync(to)) {
    if (md5(from) === md5(to)) {
      same += 1;
      continue;
    }
    stale += 1;
    if (CHECK_ONLY) {
      missing.push(`${name} ← ${rel}（与源文件字节不一致）`);
      continue;
    }
  }
  if (CHECK_ONLY) {
    missing.push(`${name} ← ${rel}（还没同步）`);
    continue;
  }
  copyFileSync(from, to);
  copied += 1;
}

const summary = `清单 ${MANIFEST.length} 项：新增/更新 ${copied}、字节一致 ${same}、待修 ${missing.length}`;
if (missing.length) {
  console.error(`emoji 同步：${summary}`);
  for (const m of missing) console.error(`  ✗ ${m}`);
  process.exit(1);
}
console.log(`emoji 同步：${summary}${CHECK_ONLY ? '（--check，未动文件）' : ''}`);
if (stale > 0 && !CHECK_ONLY) console.log(`  其中 ${stale} 项原本与源文件不一致，已覆盖。`);
