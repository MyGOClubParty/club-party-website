/**
 * 数据库的「自举」：表结构随 Worker 一起发布，第一个报名进来时自己把表建起来。
 *
 * 为什么不让部署的人手跑一次 `db:migrate:remote`
 * --------------------------------------------
 * 那条命令要么写在 README 里等人记得跑，要么写在部署流程里等人记得改 —— 两条都靠记性。
 * 忘了跑的后果还不只是报个错：`/api/register` 与 `/api/participants` 会一起 503，而站点
 * 其余部分看着完全正常（静态资产不碰库），排查得从「表单为什么提交不了」查起。把建表挪进
 * Worker 之后，**谁先来谁触发**：换一个 database_id、库被清空、重建，都不需要额外动作。
 *
 * 代价是每个 isolate 的第一次报名多一次 `exec`（一次 subrequest，几条 DDL）。报名是
 * 几十上百人的量级，这笔账划算。
 *
 * 幂等性
 * ------
 * `schema.sql` 里是 `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`，重复执行
 * 无副作用；两个请求同时撞上「表不存在」，也只会有一个真去建，另一个被 IF NOT EXISTS 挡掉。
 * 所以这里**不加锁、也不缓存「建过了」的标志** —— 缓存反而会害事：库被重建之后那个 true 还
 * 留在 isolate 里，INSERT 就会一直撞 `no such table`，而这一次连自愈的机会都没有了。
 *
 * `worker/schema.sql` 是唯一权威：自动建表与手动 `db:migrate:*` 读的是同一个文件，
 * 所以不会出现「本地建的列序」与「线上补的列序」对不上账（见 schema.sql 顶部那段）。
 *
 * 导入方式：`.sql` 由 **wrangler 内置的默认规则**当文本模块处理，不用在 wrangler.jsonc 里自己
 * 声明一条 Text 规则 —— 声明了会把默认那条挤掉（默认还管着 .txt / .html），wrangler 会因此发
 * fallthrough 警告。类型声明在 worker/env.d.ts。
 */

import schemaSql from './schema.sql';

/**
 * D1 在表不存在时抛的就是 SQLite 那句 `no such table: participants`。
 * 本地 miniflare 与线上同一套说法，所以这一个判据两边通用。
 */
export function isMissingTable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /no such table/i.test(message);
}

/**
 * 把 `schema.sql` 切成一条条语句。
 *
 * 为什么不把整份直接丢给 `DB.exec()`：**exec 是按行切语句的**（实测：多行写法的
 * `CREATE TABLE IF NOT EXISTS participants (` 被当成了一条完整语句，报
 * `D1_EXEC_ERROR: ... incomplete input`），而 schema.sql 是给人读的，每条语句都摊成好几行。
 * 所以这里按分号自己切、把每条内部的换行折叠成空格，再交给 `batch()` 逐条执行。
 *
 * 按分号切在**这份** DDL 上是安全的：里面没有含分号的字符串字面量（`datetime('now')`、
 * `DEFAULT ''` 都没有）。哪天加了含分号的默认值，就得换成正经的 SQL 切分 —— 别默默依赖这里。
 */
function schemaStatements(): string[] {
  return schemaSql
    .replace(/^[ \t]*--.*$/gm, '') // 注释行不参与执行，先去掉，免得跟着被切
    .split(';')
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => part.length > 0);
}

/**
 * 建表（幂等）。
 *
 * 用 `batch()` 而不是 `exec()`：前者逐条 `prepare` 后执行，语义是「我给了 N 条语句」，
 * 不涉及字符串怎么切；后者得靠上面那个自己切的数组。两者都只发一次往返（batch 是原子的）。
 */
export async function ensureSchema(env: Env): Promise<void> {
  await env.DB.batch(schemaStatements().map((statement) => env.DB.prepare(statement)));
}
