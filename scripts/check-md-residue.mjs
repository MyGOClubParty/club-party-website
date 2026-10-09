#!/usr/bin/env node
/**
 * Markdown 残留守卫：在 build 前拦截「会静默渲染成裸文本」的写法。
 *
 * 背景：Docusaurus 用 remark-directive 解析 admonition，标题必须写在方括号里：
 *
 *   :::warning[以有效打卡为准]     ✅
 *   :::warning{title="以有效打卡为准"}  ✅
 *   :::warning 以有效打卡为准       ❌ 不会被识别成 directive，
 *                                    整块退化成普通段落，`:::` 原样印在页面上
 *
 * 用法：
 *   node scripts/check-md-residue.mjs     # 有问题的文件会以非 0 退出码结束
 *
 * 由 package.json 的 `prebuild` 自动调用，也可单独跑。
 */

import {readdirSync, readFileSync, statSync} from 'node:fs';
import {dirname, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = resolve(__dirname, '..');
const SCAN_DIRS = ['docs', 'blog'];
const EXTS = new Set(['.md', '.mdx']);

/** 永不合法、但会被当成普通段落静默吞掉的 directive 写法 */
const RULES = [
  {
    id: 'admonition-title-outside-brackets',
    test: /^:::([a-zA-Z][\w-]*)[ \t]+(?=\S)/,
    hint: '标题必须写在方括号里：`:::<type>[标题]`（或 `:::<type>{title="标题"}`）',
  },
  {
    id: 'admonition-fence-space',
    test: /^:::[ \t]/,
    hint: '`:::` 后面必须紧跟类型名，不能有空格',
  },
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) out.push(...walk(abs));
    else if (EXTS.has(entry.slice(entry.lastIndexOf('.')))) out.push(abs);
  }
  return out;
}

const problems = [];
const files = SCAN_DIRS.flatMap((d) => {
  const abs = join(SITE_ROOT, d);
  try {
    return walk(abs);
  } catch {
    return [];
  }
});

for (const file of files) {
  const rel = relative(SITE_ROOT, file).replace(/\\/g, '/');
  const lines = readFileSync(file, 'utf8').split('\n');
  let openers = 0;
  let closers = 0;

  lines.forEach((line, i) => {
    for (const rule of RULES) {
      if (rule.test.test(line)) {
        problems.push({file: rel, line: i + 1, rule: rule.id, hint: rule.hint, text: line.trim()});
      }
    }
    if (/^:::[a-zA-Z][\w-]*(\[|\{|[ \t]*$)/.test(line)) openers += 1;
    if (/^:::[ \t]*$/.test(line)) closers += 1;
  });

  if (openers !== closers) {
    problems.push({
      file: rel,
      line: 0,
      rule: 'admonition-fence-unbalanced',
      hint: `开启 ${openers} 处、闭合 ${closers} 处，数量不一致（未闭合会把后续内容吞进 admonition）`,
      text: '',
    });
  }
}

if (problems.length === 0) {
  console.log(`markdown 残留守卫：扫描 ${files.length} 个文件，未发现问题。`);
  process.exit(0);
}

console.error(`markdown 残留守卫：发现 ${problems.length} 个问题\n`);
for (const p of problems) {
  console.error(`  ${p.file}${p.line ? ':' + p.line : ''}  [${p.rule}]`);
  if (p.text) console.error(`      ${p.text}`);
  console.error(`      → ${p.hint}`);
}
console.error('\n这些写法不会报错，但会在页面上原样渲染成裸文本（或吞掉正文），必须先修掉。');
process.exit(1);
