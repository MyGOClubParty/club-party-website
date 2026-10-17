/**
 * 手写补充的 `Env`。
 *
 * `wrangler types` 只从 wrangler.jsonc 生成，而 **secrets 不在配置里** —— 所以密钥得在这儿
 * 声明。两份声明都是全局 `interface Env`，靠声明合并拼在一起（生成的那份由 `npm run cf:types`
 * 重写，不会覆盖本文件）。
 *
 * 两个坑，写在这儿免得下次重犯：
 *
 * 1. **别用 `.dev.vars` 存这个密钥。** `wrangler types` 会把 `.dev.vars` 里的键**顺带写进**
 *    生成的那份类型（实测：生成结果里多出一行 `TURNSTILE_SECRET: string`），于是「一个被
 *    gitignore 的本地文件」的内容跑进了入库的文件；而且它生成的是**必填** `string`，跟这里的
 *    `?:` 冲突 —— 这处冲突会被 `skipLibCheck` 悄悄吞掉，正是最难查的那种假绿。
 *    本地要密钥请用 `npm run cf:dev`（脚本自己带官方测试密钥，--var 只对 dev 生效）。
 * 2. **已经在 wrangler.jsonc `vars` 里的键别在这里重复声明**（比如 `TURNSTILE_HOSTNAMES`）：
 *    `--strict-vars` 会把它推成字面量类型，跟手写的 `string` 对不上。
 */
interface Env {
  /**
   * Turnstile 校验密钥。
   *
   * 线上：`wrangler secret put TURNSTILE_SECRET`（值在 CF 面板那个 widget 里）。
   * 本地：`npm run cf:dev` 已经带了官方测试密钥。
   *
   * **运行时可能没有**（本地漏了 --var、线上忘了 secret put），所以代码里一律 `?? ''` 再判空：
   * 缺了一律 503，不静默放过。
   */
  TURNSTILE_SECRET?: string;

  /**
   * 管理员后台的口令表（见 `worker/admin.ts`）。
   *
   * 线上：`wrangler secret put ADMIN_PASSWORDS`
   * 本地：`npm run cf:dev` 带一个测试口令（`npm run cf:dev` 的 `--var`）。
   *
   * 格式三种都认，**多管理员请用第一种**（否则日志里只有口令摘要，看不出是谁）：
   *
   *     michael:口令A|tom:口令B|tim:口令C
   *     michael|tom|tim
   *     [michael, tom, tim]
   *
   * 缺了 / 空的后果是**后台登录 503**，不是「放行」—— 与 TURNSTILE_SECRET 同一条规矩。
   */
  ADMIN_PASSWORDS?: string;
}

/**
 * `worker/schema.sql` 是以**文本**模块导入的（`import schemaSql from './schema.sql'`，
 * 见 worker/db.ts）。TypeScript 不认 `.sql` 后缀，所以在这儿给它一个字符串类型。
 * 真正把文件内容变成模块的是 **wrangler 内置的默认规则**（`type: "Text"`，globs 覆盖
 * 子目录里的全部 `.sql`）—— 不用在 wrangler.jsonc 里自己再声明一条：自己声明会把默认那条
 * 挤掉（默认还管着 .txt / .html），wrangler 会为此发一条 fallthrough 警告。
 *
 * ⚠️ 上面那个 glob 别照原样写进来：它中间那三个字符是「星号紧接星号紧接斜杠」，而
 * `/*` 开的块注释恰恰在那三个字符处**提前闭合** —— 后面的反引号随即被当成模板字符串起点，
 * `tsc` 报「Unterminated template literal」。只有这道类型闸门会红：`docusaurus build` 与
 * 页面渲染全都照常（2026-10-16 踩到，`67cbe0d` 带进来的）。
 */
declare module '*.sql' {
  const content: string;
  export default content;
}
