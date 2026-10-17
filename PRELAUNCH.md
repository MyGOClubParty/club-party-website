# 上线前检查清单

> 2026-10-17 逐项实测。**凡是有数字的都是今天跑出来的**，没有数字的会写明「无法从仓库判断」。
> 闸门（全部 EXIT 0）：`typecheck` · `build` · `cf:dry-run` · `api-check 38/38` ·
> `turnstile-check 5/5` · `site-check 266/266`（209.3s，分段 104/60/25/58/19）。
> 也就是说：**功能层面没有已知坏点** —— 下面这些全是套件看不见的东西。

---

## 2026-10-17 晚：本轮已处理

| 原条目 | 做了什么 | 怎么验的 |
|---|---|---|
| 0.1 域名 | 确认是 **`clubparty.iicemeta.com`**（不是 `club-party.…`），`docusaurus.config.ts` 的 `url` 已改 | canonical / og / sitemap 全部指向新域名 |
| 0.2 secret | `TURNSTILE_SECRET` 已在仪表盘设置 | — |
| 0.3 库 | 线上 `254dd607-…` 已确认 | — |
| 2.1 `/showcase` 窄屏 | 五个按钮那行允许换行 | 420px 溢出 **234px → 0**（9 个页面 × 2 个宽度全 0） |
| 2.2 模板页 | 删 `src/pages/markdown-page.mdx` | `/markdown-page` → **404** |
| 2.3 分享卡 | 新 `static/img/social-card.png`（1200×630，19.2 KB）：原版 `unifont` 画的中文 + 原版方块贴图 | `scripts/make-social-card.py`（可重跑） |
| 2.4 robots.txt | 补 `static/robots.txt`（`Disallow: /admin` + `Sitemap:`） | 200 |
| 2.5 `/api/skin-preview` | 边缘缓存（`caches.default`，key 规范化）+ 限流 120/60s/IP | 同一 TID 第二次 **42ms** vs 首次 **461ms** |
| 2.6 observability | 写进 `wrangler.jsonc`（仪表盘开的同时代码里也要有） | `cf:dry-run` 通过 |
| 2.7 管理后台 | 新增 `/admin`：登录、看完整名单、导出 CSV / TXT | `api-check` **43/43**；401 / 200 / 退出后 401 都实测过 |
| 2.8 登录防爆破 | 登录加 **Turnstile**（action=`admin`，与报名页的票不能串用）+ 10/60s/IP 限流 + 摘要比对；票一次性，失败即 `reset()` 重出票 | 无票 → `403 turnstile_missing`；有票错口令 → `401 bad_password`；有票对口令 → 200。`api-check` 为此加了 3 条 |
| 2.9 后台编辑 | 表格行内编辑六个字段（学号/姓名/学院/班级/QQ/MCID），`PATCH /api/admin/participants`；校验与报名**同一份**（`worker/fields.ts`）；学号先查重，皮肤不跟着改名 | `api-check` **47/47**（+4：登录、未登录 401、改完公开名单读到新值、非法值 400） |
| 2.10 后台删除 | 行内删除 + **两道确认**（前端要手输学号才点得动，服务端要求学号写两遍且一致）；先删 D1 再删 R2；被删整行进日志便于恢复 | `api-check` **52/52**（+5：单独造一条记录、未登录 401、确认不符 400 且一条没删、删完名单里消失且 R2 文件一并删除、再删 404） |
| 3.1 分页 | `/api/participants?limit=&offset=`，前端每页 24；新增 `total` / `hasMore` | 接口断言 2 条 + 套件里 1 条 |
| 3.4 死代码 | 删 `HomepageFeatures/` 与 3 个 `undraw_docusaurus_*.svg`、`docusaurus.png` | 产物少 84.5 KB |
| 3.6 hostname | `TURNSTILE_HOSTNAMES` 填 `clubparty.iicemeta.com`（测试密钥下自动跳过） | 本地仍可报名 |
| 3.9 CI | 部署改为 **Workers Builds 接 GitHub main**（Cloudflare 侧触发，仓库里不需要 workflow） | 见下面「部署清单」 |

### 管理员后台

- 入口 `/admin`（**不在导航、不在 sitemap、`robots.txt` 也 Disallow**）。
- **能改人**：表格里点「编辑」，在那一行下面摊开六个字段（学号/姓名/学院/班级/QQ/Minecraft ID），
  保存走 `PATCH /api/admin/participants`。校验与报名是**同一份**（`worker/fields.ts`）；
  学号可改但要先查重（撞号 409）；**皮肤文件不跟着改名**（改名要跨 D1 与 R2，中途失败会留脏记录）。
- 口令放 `ADMIN_PASSWORDS`（secret）。格式三种都认：

  ```
  michael:口令A|tom:口令B|tim:口令C     ← 推荐
  michael|tom|tim
  [michael, tom, tim]
  ```

  **多管理员请用第一种**：后两种只有口令、没有名字，日志里只会出现 `admin-3f9a1c2e` 这种摘要。
- 会话是**签名 cookie**（`HttpOnly; SameSite=Strict; Secure`，12 小时），服务端零状态 ——
  不写库、不建表；密钥由 `ADMIN_PASSWORDS` 派生，所以**改口令 = 所有人立刻重新登录**。
- 谁登录过：每次登录都 `console.log('[admin] login ok user=… ip=…')`，Observability 里可查；
  后台页面顶部也直接写着当前登录者。
- **登录的三道闸**（顺序是刻意的，不要调换）：
  1. **Turnstile** —— 挡自动化。widget 的 action 是 `admin`，与报名页的 `signup` **不能串用**
     （服务端会比对票里带的 action）。票**一次性**，前端每次失败都 `reset()` 重出票，
     否则用户改完口令再点提交，拿到的是「校验已过期」而不是「口令不对」。
     没配 `TURNSTILE_SECRET` 时后台登录会 503 —— 与报名接口同一条规矩，不静默放过。
  2. **10 次/60s/IP**（`ADMIN_LOGIN_LIMIT`）—— 挡连点。单 IP 有上限，但**分布式爆破它挡不住**，
     所以第 1 道才是主力。
  3. **口令摘要比对** —— SHA-256 上比，循环不提前 break，防时序侧信道。
- 口令长度服务端**不强制**（配置是人填的，强制只会让所有人 503），但短于 8 位会在登录时打一条
  `warn`，建议 12 位以上随机串。
- 导出：`?format=csv`（带 BOM，Excel 不乱码）/ `?format=txt`（按全角宽度对齐的文本表格），
  文件名 `participants-YYYYMMDD-HHmm.{csv,txt}`，导出动作同样进日志。

### 部署清单（Workers Builds）

| 项 | 值 |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy`（`wrangler.jsonc` 里已配 `main` 与 `assets`） |
| Root directory | 留空（仓库根就是这个项目） |
| Node 版本 | 建议设 `NODE_VERSION=22`（`package.json` 的 `engines` 是 `>=20`） |
| 密钥 | `TURNSTILE_SECRET`（已设）、**`ADMIN_PASSWORDS`（必须设，否则后台登录 503）** |

⚠️ `wrangler.jsonc` 里**不要**再写 `routes`：域名已经在仪表盘绑好了，两处都写会打架。

---

## 0. 三件只能由人确认的事（仓库里看不出来）

| # | 事 | 为什么无法判断 | 怎么确认 |
|---|---|---|---|
| 0.1 | 正式域名 `club-party.iicemeta.com` 是否已绑到 Worker | `wrangler.jsonc` 里**没有 `routes`、没有 `custom_domain`、没有 `workers_dev`** —— 绑定要么在控制台手做的，要么还没做 | `npx wrangler deployments list` + 控制台 Workers → Settings → Domains & Routes |
| 0.2 | 线上 `TURNSTILE_SECRET` 是否已 `secret put` | 密钥刻意不进配置、不进仓库 | `npx wrangler secret list`（应能看到 `TURNSTILE_SECRET`） |
| 0.3 | 线上 D1 是不是 `254dd607-b77f-41ab-a349-1dad25242ac6`，里面有没有表 | 仓库只记 id，不记库里的状态 | `npx wrangler d1 execute club-party-db --remote --command "SELECT name FROM sqlite_master WHERE type='table'"` |

⚠️0.1 的后果最硬：`docusaurus.config.ts` 的 `url` 已经写成 `https://club-party.iicemeta.com`，
所以 canonical、og:image、sitemap **39 条**全都指向这个域名。域名没绑好 = 全站互相指向一个打不开的地址。

---

## 1. P0 —— 阻塞上线

> 上面 0.1 / 0.2 / 0.3 三条归为 P0。

---

## 2. P1 —— 上线前应修

| # | 问题 | 证据 | 影响 |
|---|---|---|---|
| 2.1 | `/showcase` 在 420px 下**横向溢出 234px** | 探针 `_prelaunch-audit.cjs` 实测：`div.FlexBox_row` 宽 614px、右边界到 654 | 手机用户看到整页横向滚动条；这个页面还进了 sitemap |
| 2.2 | `/markdown-page` 是 **Docusaurus 模板残留页**，200 可访问、且进了 sitemap | `src/pages/markdown-page.mdx` 全文：`title: Markdown page example` / “You don't need React to write simple standalone pages.” | 每个访客都可能撞见一页英文模板；搜索引擎也会收 |
| 2.3 | 分享卡片 `og:image` 仍是 **Docusaurus 默认图** | `docusaurus.config.ts:81` → `img/docusaurus-social-card.jpg`（55,746 B，10-09 模板文件） | 分享到微信/QQ/微博时，缩略图是 Docusaurus 的默认插画 |
| 2.4 | **没有 `robots.txt`** | `curl /robots.txt` → **404**（`static/` 下没有该文件） | 爬虫没有入口约束；不影响访问，但不是「做好了」的状态 |
| 2.5 | `/api/skin-preview` **无缓存、无限流** | `worker/littleskin.ts:262`：每次调用都走 `lookupSkinTid` + `fetchTexture` 两次上游请求；`cache-control: max-age=600` 只作用于浏览器 | 任何人可以 `?tid=1..N` 循环刷，把 Worker 当免费代理使，同时打上游。建议在 Worker 里用 `caches.default` 按 tid 缓存响应 |
| 2.6 | 线上**日志不持久化** | `wrangler.jsonc` 没有 `observability` 段 | 出问题时只有 `wrangler tail` 的实时流；错过了就没了。建议加 `"observability": {"enabled": true}` |
| 2.7 | **没有管理后台**：改一字、删一条、导一份名单，只能 `wrangler d1 execute --remote` 直连线上库 | `worker/index.ts` 只有 5 条只读/报名路由 | 与「数据库冻结」叠加后风险更高：一次手滑的 `UPDATE`/`DELETE` 没有二次确认，也没有留痕 |

---

## 3. P2 —— 可以上线后再做

| # | 问题 | 证据 |
|---|---|---|
| 3.1 | `/api/participants` **无分页、无 LIMIT**，一次全量返回 | `worker/participants.ts:33` 的 SELECT 没有 LIMIT。20 人时 ~3 KB，200 人时 ~30 KB —— 现在没事，报名破百后值得加 |
| 3.2 | 名单里的 `skinUrl` **带学号后两位** | `skinKey()` = `mcId + studentId.slice(-2)`（`worker/skin.ts:42`），公开接口直接下发 `/api/skins/KSMUT179214750148503.png`。这是当初定下的命名规则，只是提醒：公开页面上它属于个人信息的最小暴露面 |
| 3.3 | 社团照未压缩，而且**同一张图存了两份** | `img/clubs/photography/shot-1.jpg` 471.7 KB 与 `assets/images/shot-1-*.jpg` 471.7 KB 内容相同；构建总体积 9.9 MB |
| 3.4 | 模板残留文件还打进产物 | `src/components/HomepageFeatures/` 已**无人引用**（全仓 grep 只在它自己内部命中），但它引用的 3 个 `undraw_docusaurus_*.svg`（36.0 + 31.5 + 11.9 KB）与未被引用的 `static/img/docusaurus.png`（5.1 KB）仍在 |
| 3.5 | 窄屏断言只覆盖 3 处 | `site-check.cjs` 的 420px 只测了 hero、花圃、关于 —— 报名页、名单页、`/showcase` 都没有。2.1 就是这么漏掉的 |
| 3.6 | `TURNSTILE_HOSTNAMES` 为空 = 不校验域名归属 | `wrangler.jsonc` 的 `vars`。填上正式域名后，siteverify 回来的 hostname 对不上会 403（只在真实密钥下生效） |
| 3.7 | R2 写失败的回滚没有二次兜底 | `worker/register.ts:256` `catch` 里再 `DELETE`，若这步也抛错，异常冒到入口变 500，库里可能留一条指向不存在对象的行 |
| 3.8 | 没有 CSP / 安全响应头 | 只有静态资产默认头。Cloudflare 层可配 HSTS、CSP（注意 Docusaurus 内联样式较多，CSP 要留 `unsafe-inline` 或 nonce） |
| 3.9 | **没有 CI** | 无 `.github/workflows/`；`npm run cf:deploy` 靠人手跑，闸门靠记性 |

---

## 4. 数据库：冻结之后怎么走

### 4.1 冻结的边界（先把话说准）

- **冻的是 schema**：`participants` 那 11 列、列序、类型、索引，一律不再动。
- **没冻的是数据**：同学填错学院、要退赛、要换皮肤 —— 这些是运营，迟早会发生。
  两者要分开对待，否则「冻结」会在第一次需要改字的时候被破掉。
- **自举不是「会动库」**：`ensureSchema()` 执行的是 `CREATE TABLE IF NOT EXISTS`，
  表已存在时**完全 no-op**（`worker/db.ts:65`）。线上表已在，所以部署新版本不会碰它。

### 4.2 扩展：只加新表，不动旧表

**不要**用 `ALTER TABLE ADD COLUMN`（那是改表），**不要**用 JSON 列（那也要先加列）。
唯一安全的方向是**新增一张表**，用已有的稳定键关联：

```sql
-- 加在 worker/schema.sql 末尾，与线上那张表并存
CREATE TABLE IF NOT EXISTS participants_extra (
  participant_id INTEGER PRIMARY KEY,   -- = participants.id（业务键，非 FK 约束）
  ...,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

⚠️ **不要指望外键**：SQLite 的 `FOREIGN KEY` 默认不启用，D1 不会替你开 ——
所以关联的正确性由应用层保证（插入前先 `SELECT id FROM participants WHERE student_id = ?`），
`REFERENCES` 只当注释写。

### 4.3 真正的坑：新表不会被自动建出来

现在的自举是**异常驱动**的 —— 只有撞上 `no such table: participants` 才建表
（`worker/register.ts:229`）。线上 `participants` 已经存在，所以：

> **往 `schema.sql` 里加一张新表，部署完它永远不会被创建。**

网上线后要加表，只能三选一：

| 做法 | 代价 | 评价 |
|---|---|---|
| A. 部署后手动跑一次 `npm run db:migrate:remote` | 一条命令，全部 `IF NOT EXISTS`，幂等 | 可行，但**又回到靠记性** |
| B. 把自举从「异常驱动」改成「表清单驱动」 | 每次写操作多一次 `sqlite_master` 查询 | **推荐**，见下 |
| C. 让读接口也兜底建表 | GET 触发 DDL | 现在刻意避免的，别翻回来 |

**推荐 B 的具体形状**：把 `ensureSchema()` 改成先查清单——

```ts
const EXPECTED = ['participants', 'participants_extra'];
const rows = await env.DB.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('participants','participants_extra')"
).all();
if (rows.results.length < EXPECTED.length) await ensureSchema(env);
```

放在报名那条写路径上（一次低频 subrequest，几十上百人的量级完全划算）。
这样「加一张表」就变成**纯代码改动**：改 `schema.sql` + 加清单里的名字 → 部署 → 第一个报名自动补建。

### 4.4 数据修正：给运营留一条安全通道

schema 冻结之后，改数据只有 `wrangler d1 execute --remote` 一条路，而它是**直连线上库、没有二次确认**的。
上线前至少要定两件事：

1. **SOP**：改之前先 `SELECT` 出那一行、把结果存成文件，再 `UPDATE ... WHERE student_id = ?`（**永远带 WHERE，永远按唯一键**），改完再 `SELECT` 一次贴进记录。
2. **或者**做一条受保护的管理接口（`POST /api/admin/...` + 一个独立的 secret + 只允许改白名单字段），把「改一处」从手写 SQL 变成一次可留痕的调用。**这条不进 P0/P1，但要在活动开始前定下来**——活动当天现写就来不及了。

### 4.5 兜底：万一改坏了

D1 自带 **Time Travel（默认保留 30 天）**，可以按时间点恢复：

```bash
npx wrangler d1 time-travel info club-party-db --remote
npx wrangler d1 time-travel restore club-party-db --remote --timestamp <ISO8601>
```

⚠️ 恢复是**整库**回滚，不是单行 —— 所以 4.4 的「先存一份再改」仍然必要。

### 4.6 一句话结论

**「不能改表」不等于「不能扩展」**：加新表 + 把自举改成表清单驱动 + 给运营一条改数据的通道，
这三件事都不碰现有那张表。要提前决定的是**第 4.4 条**，其余都是可以等以后再做的技术演进。

---

## 5. 建议的修复顺序

1. 先确认 0.1 / 0.2 / 0.3（没有这三条，其余都白搭）。
2. 2.2 删模板页、2.3 换社交卡、2.4 补 robots.txt —— 都是十几分钟的活，但直接决定「看起来像不像正式站」。
3. 2.1 修 `/showcase` 窄屏（要么给它加入口、要么下线它；溢出本身改 `FlexBox` 的换行）。
4. 2.6 开 observability、2.5 给 preview 加缓存 —— 上线后出问题时的抓手。
5. 2.7 / 4.4 管理通道，在活动开始前定方案。
