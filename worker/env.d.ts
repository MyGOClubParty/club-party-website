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
}
