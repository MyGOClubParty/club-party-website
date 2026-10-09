#!/usr/bin/env node
/**
 * 由 src/data/clubs.json 生成每个社团的 docs 页面（docs/clubs/<slug>.mdx）。
 *
 * 用法：
 *   node scripts/gen-club-docs.mjs          # 只生成缺失的页面（不覆盖已手写/已改过的文件）
 *   node scripts/gen-club-docs.mjs --force  # 全部重新生成
 *
 * 想给某个社团写更丰富的内容时，直接编辑生成的 mdx 即可 —— 不加 --force 重跑不会覆盖它。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = resolve(__dirname, '..');
const OUT_DIR = join(SITE_ROOT, 'docs', 'clubs');
const DATA = JSON.parse(readFileSync(join(SITE_ROOT, 'src/data/clubs.json'), 'utf8'));

const FORCE = process.argv.includes('--force');

const ROLE_NOTE = {
  host: '本次活动**主办单位**',
  organizer: '本次活动**承办单位**',
  'co-organizer': '本次活动**协办单位**',
};

function render(club, position) {
  const images = club.images ?? [];
  const gallery =
    images.length > 0
      ? images
          .map((src, i) => `![${club.name} 风采占位图 ${i + 1}](${src})`)
          .join('\n\n')
      : `![${club.name} 封面占位图](${club.cover})`;

  return `---
title: ${club.name}
sidebar_label: ${club.name}
sidebar_position: ${position}
slug: /clubs/${club.slug}
description: ${club.name} —— ${club.roleLabel}，展示项目：${club.project}
---

# ${club.name}

${club.summary}

## 基本信息

| 项目 | 内容 |
| --- | --- |
| 参与身份 | ${club.roleLabel} |
| 服务器内展示项目 | ${club.project} |
| 关键词 | ${club.tags.join('、')} |
| 相关流程 | [活动流程](/docs/activity/process) |

## 在本次活动中的分工

${ROLE_NOTE[club.role]}。${club.summary.replace(/^[^。]*。/, '')}

## 风采展示

:::info[图片待补]
下列为**占位图**，用于确认版面与图片数量。社团正式提交素材后，把图片放进
\`static/img/clubs/${club.slug}/\` 并在 \`src/data/clubs.json\` 里把路径改成真实文件名即可，
首页卡片与本文档会自动更新。
:::

${gallery}

## 相关页面

- [活动总览](/docs/intro)
- [社团一览](/docs/clubs)
- [活动流程](/docs/activity/process)
`;
}

mkdirSync(OUT_DIR, { recursive: true });

let created = 0, skipped = 0;
DATA.clubs.forEach((club, idx) => {
  const abs = join(OUT_DIR, `${club.slug}.mdx`);
  if (existsSync(abs) && !FORCE) { skipped++; return; }
  writeFileSync(abs, render(club, idx + 1), 'utf8');
  created++;
});

console.log(`社团文档：新建 ${created}，跳过 ${skipped}（共 ${DATA.clubs.length} 个社团）`);
console.log(`输出目录：${OUT_DIR}`);
