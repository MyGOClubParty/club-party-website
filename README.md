<div align="center">

# 山商方块嘉年华

**七个社团，一张方块校园**

山东工商学院 · 校园联谊二课活动「方块嘉年华」官方网站

![Docusaurus](https://img.shields.io/badge/Docusaurus-3.10.2-3ECC5F?logo=docusaurus\&logoColor=white)

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react\&logoColor=black)

![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript\&logoColor=white)

![Node](https://img.shields.io/badge/Node-%E2%89%A5%2020-339933?logo=nodedotjs\&logoColor=white)

![UI](https://img.shields.io/badge/UI-minecraft--react--ui-3b8526)

![Workers](https://img.shields.io/badge/Workers-static%20assets-F38020?logo=cloudflare\&logoColor=white)

![GitHub](https://img.shields.io/badge/GitHub-MyGOClubParty-181717?logo=github\&logoColor=white)

</div>

> 依托山商MC煤炭社「元山商」校园还原工程，把社团风采展示、互动体验、摄影打卡与校园文化传播  
> 放进同一张 Minecraft 地图。

本仓库是这次活动的**说明与展示站点**：活动说明（背景、单位、时间、准备、流程、后期、奖项）、  
社团风采（七个社团的图文卡片）、活动日志（公告），外加**活动报名**与**小伙伴展示**两个互动页。  
说明与阅读部分是纯静态产物，丢给任意静态托管都能跑；报名与展示依赖同一个 Cloudflare Worker 上的  
`/api/*`（D1 报名表 + R2 皮肤存储），见[报名与皮肤](#报名与皮肤)。

**快速导航** ——  
[快速开始](#快速开始) ·  
[技术栈](#技术栈) ·  
[项目结构](#项目结构) ·  
[内容与数据](#内容与数据) ·  
[站点功能](#站点功能) ·  
[报名与皮肤](#报名与皮肤) ·  
[编写约定](#编写约定) ·  
[构建与部署](#构建与部署) ·  
[参与单位](#参与单位)

---

## 快速开始

需要 **Node ≥ 20**（本项目在 Node 22 / 24 上验证）。

```bash
npm install

npm run start     # 本地开发，默认 http://localhost:3000
npm run build     # 生产构建，产物在 build/
npm run serve     # 用静态服务器预览 build/ 的产物
```

| 命令                          | 作用                                                                    |
| --------------------------- | --------------------------------------------------------------------- |
| `npm run start`             | 启动开发服务器，改动即时热更新                                                       |
| `npm run build`             | 生产构建，输出到 `build/`（会先跑 `prebuild` 守卫，见「编写约定」）                          |
| `npm run serve`             | 本地静态预览 `build/`                                                       |
| `npm run typecheck`         | `tsc` 类型检查：站点与 Worker 两份 TS 工程各跑一次，无输出即通过                             |
| `npm run check:md`          | Markdown 残留守卫，单独执行                                                    |
| `npm run gen:clubs`         | 重新生成社团占位图与社团详情页                                                       |
| `npm run cf:dev`            | 起完整 Worker + 静态资产（`0.0.0.0:3000`）——**要试 `/api/*` 就用它**；纯前端调试用 `start` |
| `npm run cf:preview`        | 先构建，再用 wrangler 在本机起 Worker + 静态资产（默认 <http://localhost:8787>）        |
| `npm run cf:dry-run`        | 只做打包校验，不上传                                                            |
| `npm run cf:deploy`         | 先构建，再部署到 Cloudflare Workers                                           |
| `npm run cf:types`          | 从 `wrangler.jsonc` 重新生成 `worker/worker-configuration.d.ts`            |
| `npm run db:migrate:local`  | 手动建表（`worker/schema.sql`）。**平时不用跑**：表由第一个报名请求自动建起来，这条留给「手动重建本地库」 |
| `npm run db:migrate:remote` | 同上，作用于线上 D1（需要凭据）；线上同样平时不用跑                                      |
| `npm run db:migrate:college:local` / `:remote` | 给**已经建好的老表**补 `college` 列（`worker/migrate-add-college.sql`），每张老库跑一次 |
| `npm run db:migrate:source:local` / `:remote` | 同理补 `skin_source` 与 `littleskin_tid` 两列（`worker/migrate-add-skin-source.sql`） |
| `npm run db:query:local`    | 把本地报名表倒出来（**含学号与 QQ**，只给自己看）                                          |

## 技术栈

| 层     | 选型                                                                                                                                                |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 站点框架  | [Docusaurus](https://docusaurus.io/) 3.10.2（classic preset，已开 `future.v4`）                                                                        |
| 语言与视图 | React 19 + TypeScript 6                                                                                                                           |
| 组件库   | [`@iicemeta/minecraft-react-ui`](https://www.npmjs.com/package/@iicemeta/minecraft-react-ui) —— MC 风格的 `Button` / `Tag` / `Tooltip` / `FlexBox` 等 |
| 样式    | Infima + CSS Modules；MC 组件库的样式与 `--mc-*` 变量在 `src/css/custom.css` 全局接入                                                                            |
| 像素字体  | 组件库自带的 `Minecraft` 字体，另经 CDN 引入 `Minercraftory` 作兜底                                                                                               |
| 内容    | MDX（docs + blog），七个社团的数据来自一个 JSON                                                                                                                 |
| 皮肤渲染  | [`skinview3d`](https://github.com/bs-community/skinview3d) 3.4.2 —— 3D 皮肤预览；它是 ESM-only，**只能在浏览器里动态 `import()`**，构建期静态引入会炸 SSG                    |
| 数据与存储 | Cloudflare D1（报名表）+ R2（皮肤文件），Worker 里经 `env.DB` / `env.SKINS` 取用                                                                                  |
| 部署    | Cloudflare Workers：`build/` 作为静态资产整体上传，`worker/` 另挂 `/api/*`，配置见 `wrangler.jsonc`                                                                 |

## 项目结构

```text
club-party-website/
├── docs/
│   ├── intro.mdx                 # 活动总览
│   ├── activity/                 # 活动说明 7 篇（背景/单位/时间/准备/流程/后期/奖项）
│   └── clubs/                    # 社团一览 + 7 个社团详情页
├── blog/                         # 活动日志（另有 authors.yml / tags.yml）
├── src/
│   ├── components/
│   │   ├── ClubShowcase/         # 社团卡片：logo + 画廊 + 标签 + 详情入口
│   │   ├── ClubShowcaseSection/  # 卡片网格，每次进入随机排序
│   │   ├── Fireworks/            # hero 上的 canvas 烟花（useFireworks + <Fireworks>）
│   │   ├── GrassGarden/          # 草方块带 + 长在带子上的原版小花
│   │   ├── Lightbox/             # 点击主图放大
│   │   ├── SkinViewer/           # 皮肤：全站共用一个离屏 3D 舞台 + 各卡片的 2D 画布与头像兜底
│   │   └── HomepageFeatures/     # 模板遗留，当前未被引用
│   ├── data/
│   │   ├── clubs.json            # 七个社团的唯一数据源
│   │   └── clubs.ts              # 类型定义与画廊取值
│   ├── pages/                    # 首页、/signup 报名、/participants 小伙伴、/showcase 组件展示
│   ├── css/custom.css            # 全局样式与组件库接入
│   └── theme/Footer/             # Minecraft 风格页脚（手写，未用 swizzle 导出）
├── static/
│   ├── mc/blocks/                # 18 张原版方块贴图
│   ├── mc/gui/                   # 6 张 GUI 精灵图（按钮等）
│   ├── mc/plants/                # 14 张原版植物贴图（12 种花 + 草 + 蕨）
│   ├── mc/items/                 # 物品贴图（烟花火箭、人机校验面板的钥匙）
│   ├── img/clubs/<slug>/         # 社团 logo 与风采图
│   └── img/skins/                # 没交皮肤时的默认皮肤（deepseek-npz.png）
├── scripts/                      # 生成器与守卫脚本
├── worker/                       # Cloudflare Worker：路由、校验、它自己的 tsconfig 与生成的 Env 类型
│   ├── index.ts                  # 路由表（/api/*）+ 静态资产兜底
│   ├── register.ts               # 报名：人机校验 → 两道体积闸 → PNG 校验 → 写 D1 与 R2
│   ├── db.ts                     # 建表自举：库是空的时第一次报名按 schema.sql 把表建起来
│   ├── turnstile.ts              # 人机校验：siteverify + 「密钥从哪来」（唯一的本地/线上分岔）
│   ├── participants.ts           # 名单与取皮肤
│   ├── skin.ts                   # 皮肤命名与校验的唯一权威
│   ├── http.ts                   # JSON / 错误响应小工具
│   ├── env.d.ts                  # 手写的 Env 补充（secrets 不在 wrangler.jsonc 里，推不出来）
│   ├── schema.sql                # D1 表结构 —— 自动建表与手动迁移读的是同一份（唯一权威）
│   ├── migrate-add-college.sql   # 给老库补 college 列，一次性，只跑一遍
│   └── migrate-add-skin-source.sql # 同理补 skin_source / littleskin_tid（皮肤来源）
├── sidebars.ts                   # 侧边栏（autogenerated，跟随目录结构）
├── docusaurus.config.ts
├── wrangler.jsonc                # Cloudflare Workers 部署配置
└── package.json
```

侧边栏不需要手写：`sidebars.ts` 用的是 `{type: 'autogenerated'}`，顺序和标题由各目录的  
`_category_.json` 与文档 frontmatter 里的 `sidebar_position` 决定。

## 内容与数据

### 社团数据只有一个来源

七个社团的角色、展示项目、标签、图片、详情链接全部写在 **`src/data/clubs.json`**。  
新增或调整社团只改这一个文件，`src/data/clubs.ts` 负责补类型并派生出画廊列表：

```jsonc
{
  "slug": "mc-coal",             // 图片目录名与 DOM 钩子（data-club）
  "name": "山商MC煤炭社",
  "abbr": "MC",                  // 标题左侧的缩写块
  "role": "host",                // host / organizer / coOrganizer，决定标签配色
  "roleLabel": "主办单位",
  "accent": "#3b8526",           // 卡片主题色：顶部色条、悬停描边
  "project": "元山商校园展示",    // 卡片上的「展示项目」
  "summary": "……",
  "tags": ["元山商", "校园还原", "服务器"],
  "logo": "/img/clubs/mc-coal/logo.svg",
  "cover": "/img/clubs/mc-coal/cover.svg",      // images 为空时回落到它
  "images": ["…/shot-1.svg", "…/shot-2.svg"],   // 1 张时不出缩略图条
  "doc": "/docs/clubs/mc-coal"
}
```

顶层的 `activity` 放活动名、全称与社团数，首页 hero 区读的是 `name` / `fullName` / `clubCount`。  
`school` 与 `schoolLogo` 目前无人引用（首页那枚校徽已按需求撤掉），字段与  
`static/img/sdtbu-logo.png` 先留着备用。

### 素材状态

`static/img/clubs/<slug>/` 下目前是两种素材混用，组件会自动区分：

| 状态   | 判定方式            | 表现                                              |
| ---- | --------------- | ----------------------------------------------- |
| 占位图  | 路径以 `.svg` 结尾   | 挂「占位图」角标，开启 `image-rendering: pixelated` 保留像素硬边 |
| 真实素材 | `.jpg` / `.png` | 角标自动消失，改用浏览器默认的平滑缩放                             |

真实照片按「展示宽度 1600px 上限、`-strip` 去掉 EXIF」的标准处理后再入库，**不要**把社团发来的  
原图直接提交。把某个社团的 `clubs.json` 指向真实文件、再跑一次 `npm run gen:clubs`，  
对应的详情页文案（「图片待补」提示、alt 文案）会自动跟着变。

## 站点功能

| 位置                    | 行为                                                                            |
| --------------------- | ----------------------------------------------------------------------------- |
| 首页 · 入场               | 六块内容依次淡入上浮（`transform`/`opacity`，不动布局属性），延迟错开做出次序感                            |
| 首页 · 背景               | hero 的草方块底纹与花圃草带各自线性循环平移，一圈正好一个贴图周期，接缝处无缝                                     |
| 首页 · 花圃               | 草方块带上种着 12 种原版小花与草丛，逐棵错开周期左右摇摆；窄屏隔一棵藏一棵                                       |
| 首页 · 烟花               | 进站后**一直循环放**（每 650ms 一发，每 5 发收一次双响），页内「放烟花」按钮可再补 3 发；canvas 粒子，方块形状 + 尾迹 + 闪烁 |
| 首页 · 社团区              | 每次进入都重新打乱顺序，不存在固定先后；「重新排列」按钮可手动再洗一次                                           |
| 社团卡片 · 画廊             | 多图时出现缩略图条与 ‹ › 翻页，单图退化为一张，一张都没有时回落到 `cover`                                   |
| 社团卡片 · 灯箱             | 点主图放大到全屏，支持 Esc 关闭、←/→ 翻页、点遮罩关闭，打开时锁住页面滚动                                     |
| 卡片布局                  | 同一行的卡片等高，「社团详情」按钮贴底对齐                                                         |
| 页脚                    | 草方块包边 + 深板岩底纹，栏目标题配方块图标，链接用 GUI 按钮贴图（悬停切换高亮态）                                 |
| 报名页 · `/signup`       | 学号（10 位）、姓名、学院、班级、QQ、Minecraft 游戏 ID 六项必填，皮肤可选，提交前要过人机校验；文件大小在前端先拦一道，真正说了算的是 Worker              |
| 小伙伴 · `/participants` | 已报名的每人一张卡，游戏 ID 下面写学院；交过皮肤的用 skinview3d 转起来，没交的转默认皮肤，卡片上标注区别                              |
| 全站 · 顶栏公告            | 导航栏上方一条通知条（Docusaurus 自带的 `announcementBar`），设成不可关闭（`isCloseable: false`）、始终可见；文案与 id 在 `docusaurus.config.ts`，配色按主题给在 `src/css/custom.css` |
| 全站                    | 默认跟随系统深浅色，导航栏可手动切换 light / dark / auto                                        |

灯箱通过 `createPortal` 挂到 `document.body`：卡片本身有 `overflow: hidden`，就地渲染会被裁掉。  
它只在打开后才真正渲染，因此服务端渲染阶段不会碰到 `document`。

烟花同理走 canvas：一炮炸开是几十上百个粒子，拼 DOM 会让节点数瞬间到几百。  
发射位置整幅铺开，只留出两端各 8% 的余量，免得爆炸光环在边缘被切掉。  
火箭只有在 RAF 里才会前进，所以页面切到后台、或 hero 滚出视口时会主动停发——  
否则火箭只会无限堆在数组里，回到前台时一次性全炸。停发后粒子收尾即 `clearRect` 清空。  
系统开启「减少动效」时不自动放，但按钮仍可手动触发。

入场动画、摇摆、平移全部带 `@media (prefers-reduced-motion: reduce)` 关闭分支。

## 报名与皮肤

报名页 `/signup` 收六项：学号、姓名、学院、班级、QQ、Minecraft 游戏 ID；皮肤是可选项。名单页  
`/participants` 只读不改。两页都走同一个 Worker 的四条接口：

| 接口                  | 方法   | 说明                                       |
| ------------------- | ---- | ---------------------------------------- |
| `/api/health`       | GET  | 存活探针，回服务名                                |
| `/api/register`     | POST | `multipart/form-data`，**必须带人机校验的票**；成功回 201 与提交者本人的回执（含姓名与班级） |
| `/api/participants` | GET  | 名单，**只下发学院 / MC ID / 有没有皮肤 / 皮肤地址与来源** |
| `/api/skins/<key>`  | GET  | 取皮肤 PNG，带 ETag，命中 `If-None-Match` 回 304  |

`/api/participants` 的 SQL 与 JSON 里都不含学号、QQ、姓名与班级——名单是公开页面，学号只做唯一键用，  
姓名与班级只在库里存着给活动核对，展示口径是「游戏 ID + 学院」。重复学号会拿到 409。

皮肤那一栏给两个字段：`skinUrl`（没有就是 `null`，前端落回内置默认皮肤）与 **`skinSource`**
（`'upload'` = 同学自己传的，`'littleskin'` = 填了 TID 由服务端去取的，`null` = 没提供或这条记录
早于该字段）。名单卡片下面那个标签就按它分 **默认皮肤 / 手动上传 / LittleSkin** 三种
（映射唯一写在 `src/components/skinSource.ts`，卡片与弹窗共用）。`littleskin_tid` **不下发** ——
标签用不上它，库里存着、报名回执与 R2 的 `customMetadata` 里也有，够活动核对。

`college`、`skin_source`、`littleskin_tid` 都是**后加的列**，但只对**老库**有意义：

| 列 | 一次性迁移 |
|---|---|
| `college`（2026-10-14） | `npm run db:migrate:college:remote`（`worker/migrate-add-college.sql`） |
| `skin_source`、`littleskin_tid`（2026-10-15） | `npm run db:migrate:source:remote`（`worker/migrate-add-skin-source.sql`） |

**全新的库不用跑这两条**：自动建表读的就是 `worker/schema.sql`，那份本来就带全部列。加列之所以
还得手动一次，是因为 `schema.sql` 里全是 `CREATE TABLE IF NOT EXISTS` —— 表已存在时整句跳过，
`ADD COLUMN` 补不进去（SQLite 的 `ADD COLUMN` 又没有 `IF NOT EXISTS`）。

老库补列时，**先跑迁移、再部署新 Worker**：反过来新 Worker 一 INSERT 就报 `no such column`，
`/api/register` 与 `/api/participants` 会一起 503。

升级前入库的记录这两列都是空串。`college` 空着就不渲染那一行（不拿班级去顶），补一句
`UPDATE participants SET college = '<学院全称>' WHERE ...` 即可；`skin_source` 空着是因为
`DEFAULT ''` 只保证「有一列且不为 NULL」，它不知道当初是上传还是 TID —— 名单页对这类记录退回
笼统的「自备皮肤」，不瞎猜（公测数据会在 2026-10-17 前清空）。

### 没提交完的内容留在本机

报名页把填好的六项与 LittleSkin TID 存在浏览器 localStorage（键 `clubparty:signup-draft:v1`），
刷新、误关标签页、上传失败回来都不用重打一遍。恢复出来时页面上会有一行提示，说明这是恢复出来的、
存在哪台设备上、多久失效——同学的姓名学号落了盘，这件事得让他知道。旁边的**「清空重填」**一键
把表单和草稿一起抹掉。

**皮肤文件不缓存。** `<input type="file">` 的值是只读的，浏览器不让脚本往里塞文件；就算把字节
存进 IndexedDB 再读回状态，输入框仍然写着「No file chosen」，界面等于在撒谎。文件本来就在自己
硬盘上，重选一次就好。

两个清理时机：**提交成功后草稿与表单一起清空**（教室机器是共用的，不该给下一位同学留下已报名者
的姓名学号；表单也清掉，免得顺手再点一次提交撞上「同一个学号只能报名一次」），以及草稿自己
**7 天过期**。存储不可用（隐私模式、配额满）一律静默跳过——缓存只是体验，坏了不能影响报名本身。

### 人机校验（Turnstile）

报名接口是公开的写入接口（一次请求就能往 D1 与 R2 里塞东西），所以前面加了一道 Turnstile。
**判定只在服务端做**：前端那个 widget 只是「取一张票」，票是伪造得出来的，谁都能直接往接口
POST 一个字符串。

`/api/register` 里的检查次序是刻意的：

1. `Content-Length` 与「边读边数」两道体积闸（超了连 body 都不读完）；
2. **人机校验**——没票 / 票过期 / 判定失败，一律在这里结束；
3. 字段校验（学号、姓名、学院、班级、QQ、游戏 ID）；
4. 取皮肤（上传文件或 LittleSkin TID）、写 D1、写 R2。

也就是「能不能进这个接口」排在「填得对不对」之前。票是**一次性**的（官方文档：有效期 300 秒，
用过即废），所以页面每次提交结束后都会 `turnstile.reset()` 换一张新的；换主题也会整块重挂
widget（Turnstile 没有改主题的接口）。`reset()` 之后页面把状态退回「加载中」——旧票当场作废、
新票还没到手，这时候还写着「可以提交了」就是在骗人（真提交只会拿到一张空票）。

前端加载 `api.js` 时**不能给它加 `async`/`defer`**：加了 Turnstile 会拒绝 `turnstile.ready()`
（抛出 `[Cloudflare Turnstile] Remove async/defer from the Turnstile api.js script tag …`），
widget 一个都不渲染——容器里 `childElementCount` 恒为 0，`getResponse()` 抛「Could not find widget」。
**构建、类型检查、单元层面全绿**，因为票只在运行期取。动态插 `<script>` 时就绪信号用它的 `onload`
（onload 里直接 `render()`，即官方 explicit rendering 的 "Using onload callback" 写法），不要用 `ready()`。

**密钥从哪来——本地与线上唯一的分岔**

| 环境             | 密钥                | 从哪来                                              |
| -------------- | ----------------- | ------------------------------------------------ |
| 本地 `npm run cf:dev` | 官方**恒通过**测试密钥 `1x…0AA` | 写在 `package.json` 的脚本里，用 `--var` 注入              |
| 线上             | 你那个 widget 的密钥     | `wrangler secret put TURNSTILE_SECRET`           |

本地那把是 Cloudflare 公开的测试密钥，**只通过 `wrangler dev --var` 生效**，`wrangler deploy`
根本不看它，所以不可能跑到线上。刻意**不用 `.dev.vars`**：`wrangler types` 会把 `.dev.vars`
里的键顺带写进入库的 `worker-configuration.d.ts`（本地文件的内容跑进仓库），而且它生成的是
必填 `string`，与手写的 `?:` 冲突——这处冲突会被 `skipLibCheck` 悄悄吞掉。密钥缺失一律 503，
不静默放过。

前端按 `location.hostname` 挑 **sitekey**（本地用测试 sitekey `1x…AA`）：真实 sitekey 只在
自己注册过的域名上出票。sitekey 是公开信息，这么判没关系；服务端挑密钥**不**用同一个判据——
`Host` 是客户端可控的头，线上收到一个 `Host: localhost` 就能骗出「什么票都认」的测试密钥。

**上线要做的两件事**：把本站域名加进面板那个 widget 的 Hostname Management，然后
`wrangler secret put TURNSTILE_SECRET`。顺手也可以把域名填进 `wrangler.jsonc` 的
`TURNSTILE_HOSTNAMES`（逗号分隔），服务端会额外核对 siteverify 回来的域名归属；留空 = 不核对。

### 5 MB 是服务端说了算

前端那层 `accept` 与预检只是为了让同学早点看到提示，真正的闸有两道，都在解析之前或读取之中：

1. 先看 `Content-Length`：声明就超 5 MB 的直接 413，body 都不读；
2. 再在 `getReader()` 循环里边读边数字节，超限就 `reader.cancel()` 掐断。

只有第 1 道是不够的——`Content-Length` 可以省略（分块传输就没有这个头），也可以撒谎，  
所以第 2 道才是正确性保证。接口套件里专门有这两条：**不带** `Content-Length` 的 6 MB 分块流，  
以及刚过线 1 字节（5 MB + 1）的用例，后者证明卡的是解析出来的真实大小而不是那个声明值。

皮肤还要另过一道 PNG 校验：**认魔术字节与 IHDR 里的尺寸**，不认文件名也不认 `Content-Type`。  
把 JPEG 改名成 `.png`、或传 `128×64` 都会被 400 挡下；允许 `64×32` 以及原版起的正方形  
（HD 皮肤 128 / 256 / 512 / 1024）。写库顺序是先 D1 再 R2，R2 失败会把那条记录删掉，  
不留「有记录没皮肤」的半截状态。

### 文件怎么命名

入库的键是 **Minecraft 游戏 ID + 学号后两位**，例如 ID 是 `Notch`、学号以 `10` 结尾 → `Notch10.png`。  
取皮肤的路径也要过同一套正则，`../` 这类穿越写法拿不到东西。

### 没交皮肤的人

`skin_key` 为空就回落到 `static/img/skins/deepseek-npz.png`（64×64）。交了皮肤的与用默认皮肤的  
都会转 3D，卡片上标注了是哪种；只有在浏览器没有 WebGL 时才退回 2D 头像。

### 全站只有一个 WebGL 上下文

浏览器同时活着的 WebGL 上下文有硬上限（Chrome 16 个），超了会把**最老的**那个强行丢掉，  
被丢掉那张画布当场变空白。所以名单页不给每张卡片各建一个 3D 视图，而是：

- 全站共用一个**离屏舞台**（`[data-skin-stage]`，`position: fixed` 挪到行外，不参与布局与合成），  
  每个渲染帧只画一次，再把结果 `drawImage` 到各卡片自己的 2D 画布（`[data-skin-surface]`）上；
- **同一张皮肤只渲染一遍**，再 blit 给用它的每张卡片（默认皮肤那一大批就是这么省的）；
- 只有视口内的卡片会被重画，滚出去的直接跳过 —— 画布留在最后一帧，动画停但画面不塌；
- 一张可见卡片都没有时连 `requestAnimationFrame` 都不排，标签页切到后台同样停。
- 每张卡片底下恒有一张 64×64 的 2D 像素头像兜底（还没轮到渲染、或者浏览器没有 WebGL 时露出来），  
  所以**永远不会出现空白框**。
- 滚出视口的卡片会把像素缓冲**缩回 1 倍**（冻结帧先存下来再贴回去）。画布内存是按像素算的，  
  3 倍屏 + 窄屏单列时一张就是好几 MB，几十上百人挨个滚一遍全留着会顶到 iOS 的画布上限；  
  缩回之后内存只跟「看得见多少」有关，下次进视口 `measure()` 再把密度补回来  
  （observer 的 `rootMargin: 120px` 保证那是在**入画之前**）。

29 人的名单实测：**2 个上下文**（1 个一次性探测 + 舞台）、**0 条**上下文告警、**0 张**空白画布。  
作为对照，同数据量下「每张卡片各建一个视图 + 每张卡片再探一次 WebGL」的写法是  
**38 个上下文、23 条告警、若干张卡片变空白** —— `verify/probe-webgl-contexts.cjs` 就是这两组的取证脚本。

顺带一提，探测本身也会占名额：`getContext('webgl2')` 拿到的是**真上下文**，探完不还就一直占着。  
这里探一次、缓存结果，并立刻用 `WEBGL_lose_context` 还回去。

### 走起来，而不只是转

人物是**真的在走**：用库自带的 `WalkingAnimation`（摆四肢 + 头部微晃 + 披风摆，和 littleskin 是同一个  
动画类），外加一圈很慢的自转。

坑在这里：舞台是用 `renderPaused: true` 建来自己排帧的，而库的 `render()` **只画不推进** ——  
源码注释写得很直白（"This method does not change the animation progress"），推进动画的  
`animation.update(player, dt)` 在 `draw()` 里，`draw()` 又正是被 `renderPaused` 关掉的那条循环。  
所以只把 `animation` 设上、然后一帧帧 `render()`，画面里**只有自转**：转的是我们自己推的  
`playerWrapper.rotation.y`，四肢始终是初始站姿。时间得自己喂：


```ts
viewer.animation?.update(viewer.playerObject, dt);   // 摆四肢
angle += dt * ROTATE_SPEED;
viewer.playerWrapper.rotation.y = angle;             // 自转
viewer.render();                                     // 出图
```

`prefers-reduced-motion: reduce` 时两者都不推进，只出一张静态站姿。每帧还会把当前左腿角度写到  
舞台画布的 `data-skin-pose` 上 —— 这样「有没有在走」是可断言的（自转本身就能让像素变，光看  
「像素变没变」区分不出走和转）。

### 分辨率按显示密度给，不能省

卡片画布按 `rect × 显示密度` 分配像素，然后原样贴到同样大小的显示区域。**只要这个密度低于  
`devicePixelRatio`，浏览器就要把它放大，放大多少就糊多少。** 早先这里把上限卡在 2 倍，3 倍屏  
实测「每 CSS 像素只拿到 1.999 个画布像素」= 被放大 1.5 倍显示，就是肉眼看到的糊。

现在只做两端夹取：卡片不低于显示密度（不放大）、不高于 3 倍（封顶填充率）；舞台再抬一档到  
至少 2 倍，让 1 倍屏也能靠缩采样拿到干净边缘。显示密度会变（浏览器缩放、窗口拖到另一块屏），  
所以每帧对一次、变了就 `viewer.pixelRatio = …`。

`verify/probe-skin-sharpness.cjs` 是这件事的尺子：按 `DSF` 指定 deviceScaleFactor，量  
「每 CSS 像素拿到多少画布像素 / 舞台与画布分辨率是否对齐 / 人物占多少像素 / 相邻像素梯度」。

## 编写约定

### `:::` 的标题必须写在方括号里

Docusaurus 的 admonition 由 `remark-directive` 解析，容器指令只接受 `[label]` 或 `{attrs}`：

```markdown
:::warning[以有效打卡为准]          正确
:::warning{title="以有效打卡为准"}   也可以
:::warning 以有效打卡为准            错误，整块会静默降级成普通段落，并把 ::: 原样印在页面上
```

第三种写法**不会报错**，只是安静地渲染成一坨裸文本——所以 `scripts/check-md-residue.mjs`  
（`npm run check:md`）会在构建前扫全站，拦下这种写法和未闭合的 `:::`。该守卫挂在 `prebuild` 上，  
`npm run build` 会自动执行。

## 验证

跑哪些检查取决于**改了什么**。全套（约 3 分钟）不是每次都要跑 —— 它的价值在
「新功能 / 老功能更新 / 接口与数据变化」，不在「改了一句文案」。

**改 `title`、改一句站内文字、调一个配色值** → 启动 `npm run cf:dev` 看一眼就够了。
那 251 项里没有一项会因为 `title` 变了而变红，跑一遍只是花三分钟确认「没坏」。

### 分层

| 层 | 什么时候 | 跑什么 | 实测 |
|---|---|---|---|
| L0 | 每次改完存盘 | `npm run typecheck` | **7–9s** |
| L1 | 页面改动落地后 | L0 + `npm run build` + `verify/site-check.cjs --upto=<段>` | **~1.5 分钟** |
| L2 | 推送 / 部署前 | 全套（见下表） | **~3 分钟** |

`typecheck` 便宜到可以无脑跑，别省：它抓的是 Docusaurus 构建**不会报**的那类错
（改了个 prop 名、漏改一处调用点，构建照样成功，页面静默渲染错）。真正贵的是 `site-check`。

**改完要重启 `wrangler dev`**：静态资产清单在启动时扫一次，`docusaurus build` 之后不重启的话
`curl /` 会是 404（内容其实是对的）。这条 2026-10-13 记过、2026-10-15 又踩了一次。

### 四个套件

| 套件 | 管什么 | 耗时 | 跑在哪 |
|---|---|---|---|
| `verify/site-check.cjs` | 页面渲染、交互、动效、接口串联 | 161s（251 项） | **宿主机**（要 Chrome） |
| `verify/api-check.cjs` | Worker 接口的边界与隐私口径 | 5s（38 项） | 宿主机或容器 |
| `verify/turnstile-check.cjs` | 人机校验的五条（会自起一个 3099 的失败密钥实例） | 5s（5 项） | **容器内**（用仓库里的 wrangler） |
| `npm run cf:dry-run` | 部署配置能不能打包 | 3s | 容器内 |

### `site-check` 可以只跑前几段

它是一条线性脚本，时间**不是均摊的**。用 `--upto=<段>` 按改动范围收在某一处：

| `--upto=` | 覆盖到 | 累计 |
|---|---|---|
| `home` | 首页、hero、画廊、灯箱 | **~44s** |
| `docs` | 上面 + docs、关于、导航、公告条、页脚 | **~93s** |
| `signup` | 上面 + 报名表单、Turnstile、TID、草稿 | **~130s** |
| `roster` | 上面 + 小伙伴们名单、3D 舞台与弹窗查看器 | **~157s** |
| 不带参数 | 全部（再加活动日志：幕后文章里的真组件） | **174s（实测）** |

```bash
BASE=http://192.168.31.79:4023 node verify/site-check.cjs --upto=signup
```

跑完会打印一张分段耗时表。段之间是**顺序依赖**的（第 4 段断言用的夹具，是第 3 段走真实提交流程
注册出来的），所以只有「跑到某段为止」，没有「挑着跑任意几段」。
表中前四个累计值是按 2026-10-16 的分段耗时**累加**出来的（启动 0.4s + 43.9 + 49.1 + 36.5 + 27.1 =
157.0s；`--upto=home` 早先单独实测 41.5s，与累加一致），不带参数的 174s 则是那两趟挂钟
（3m11s / 3m6s，含起停浏览器的开销）—— 名单先重置成 20 条，起伏主要来自末段与上游 LittleSkin 往返。
名单越长末段越贵 —— 见下一节。

**只改「小伙伴们」页或四篇活动日志** → 直接跑全套（段在末尾，`--upto` 省不了）；只改
首页 / docs / 报名页才能靠 `--upto` 把后面那两段省掉。

### 跑 `site-check` 之前先重置名单

第 4 段要滚一遍「小伙伴们」名单，成本随名单条数线性涨；而套件每跑一次至少新增 4 条真实提交
（学号带时间戳，永不重复）。攒着不清理的话本地库会一路涨到几百条，那一段就从 13 秒涨到近 40 秒。
所以跑之前：

```bash
npm run db:seed:local    # 先建表（表不在时）再清空并铺固定的 20 条夹具（worker/seed-test-roster.sql）
```

套件在名单超过 40 条时会打一条提醒。

### 两个容易踩的顺序

- **先同步再跑**：容器里跑的是 `/workspace`，宿主机改的文件要先灌进去（见项目根 `dev-workflow.md`）。
- **重新 `build` 之后必须重启 `wrangler dev`**：它在启动时把 `build/` 扫成资产清单，不重启的话
  新页面根本不出现 —— 而旧服务照样返回 200，很容易误判成「改动没生效」。

## 构建与部署

`npm run build` 产出纯静态文件到 `build/`。说明与阅读部分丢给任何静态托管都能跑；  
`/signup` 与 `/participants` 要真能提交和展示，还得带上 `worker/`（见下）。

```bash
npm run build
npx serve build        # 或 npm run serve
```

### Cloudflare Workers

同一个 `build/` 也直接作为 **Workers 静态资产**部署（`wrangler.jsonc`）：产物整体上传，  
经 `assets.binding` 由 `env.ASSETS.fetch()` 提供；`worker/` 里另挂一层 `/api/*`  
（报名、名单、皮肤，见[报名与皮肤](#报名与皮肤)）。绑定两个 Cloudflare 资源：

| 绑定      | 类型 | 目标              |
| ------- | -- | --------------- |
| `DB`    | D1 | `club-party-db` |
| `SKINS` | R2 | `club-party`    |

**建表会自己发生。** 表结构随 Worker 一起发布（`worker/schema.sql` 以**文本模块**打进包里，
见 `worker/db.ts`）：某个库还是空的时候，第一个报名请求会撞上 `no such table`，就地建表再重试
一次。所以换一个 `database_id`、把库清空、重建库之后，**都不需要额外动作** —— 头一个报名的
同学顺手把表带出来。R2 桶也不用初始化。

顺带一个观感上的好处：空库期间 `/api/participants` 不回 503，而是如实回 **0 人**（读接口刻意
不建表，只是把「表不存在」当成「还没有人报名」）。

**加列仍然要手动跑一次。** `schema.sql` 里全是 `CREATE TABLE IF NOT EXISTS`，表已存在时整句跳过
—— 所以给老库加列只能单独跑一次迁移，不然 Worker 一 INSERT 新列就报 `no such column`：

| 列 | 一次性迁移 |
|---|---|
| `college`（2026-10-14） | `npm run db:migrate:college:local` / `:remote`（`worker/migrate-add-college.sql`） |
| `skin_source`、`littleskin_tid`（2026-10-15） | `npm run db:migrate:source:local` / `:remote`（`worker/migrate-add-skin-source.sql`） |

**老库照「先迁移、再部署」的顺序来** —— 反了新 Worker 一 INSERT 就 503。全新的库不用管这两条。

```bash
npm run cf:dry-run     # 只打包校验，不上传
npm run cf:preview     # 本机起 Worker + 资产，默认 http://localhost:8787
npm run cf:deploy      # 构建并部署（需要先 npx wrangler login，或设 CLOUDFLARE_API_TOKEN）
```

首次部署后可在 dashboard 里给这个 Worker（名 `club-party-website`）绑自定义域  
（`docusaurus.config.ts` 的 `url` 指的是 `https://club-party.iicemeta.com`）。

`wrangler.jsonc` 里有两个值和构建产物强绑，改之前先看这条：

| 配置                          | 值                     | 为什么                                                                                                                                                  |
| --------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assets.html_handling`      | `drop-trailing-slash` | Docusaurus 生成的站内链接是 `href=/docs/intro`（**没有**尾斜杠），而产物是 `docs/intro/index.html`。用默认的 `auto-trailing-slash` 会把这类请求 307 到 `/docs/intro/` —— 站内每一次点击都多一跳 |
| `assets.not_found_handling` | `404-page`            | 命中不到资产时回构建产物里的 `build/404.html`，且**带 404 状态码**（不是 SPA 那种 200 + index.html）                                                                           |

`assets.run_worker_first: ["/api/*"]` 也是必需的：兼容日期 ≥ 2025-04-01 时，  
导航请求（浏览器自带的 `Sec-Fetch-Mode: navigate`）默认**绕过** Worker 直接由静态资产服务，  
不列进 `run_worker_first` 的话，浏览器打开 `/api/health` 会拿到 404 页面而不是 JSON。

Worker 的类型分两段：运行期全局来自 `@cloudflare/workers-types`（devDependency），  
`Env` 绑定表来自 `worker/worker-configuration.d.ts` —— 后者由 `npm run cf:types` 从  
`wrangler.jsonc` 现推出来并入库，**别手改**；改了绑定就重跑一次。

`organizationName` / `projectName` 指向 GitHub 组织 `MyGOClubParty`  
（Docusaurus 自带的 `npm run deploy`（gh-pages）未使用）。

构建会在以下情况直接失败，这是刻意的：`onBrokenLinks: 'throw'`（死链）、`prebuild` 的 Markdown  
残留守卫、以及 `tsc` 类型错误。

## 参与单位

| 社团       | 分工   | 展示项目    | 详情页源码                                                           |
| -------- | ---- | ------- | --------------------------------------------------------------- |
| 山商MC煤炭社  | 主办单位 | 元山商校园展示 | [`mc-coal.mdx`](docs/clubs/mc-coal.mdx)                         |
| 电脑技术协会   | 承办单位 | 待定      | [`computer-tech.mdx`](docs/clubs/computer-tech.mdx)             |
| X动漫联盟协会  | 承办单位 | 待定      | [`x-anime.mdx`](docs/clubs/x-anime.mdx)                         |
| 山商视觉摄影协会 | 协办单位 | 待定      | [`photography.mdx`](docs/clubs/photography.mdx)                 |
| 516轮滑协会  | 协办单位 | 待定      | [`skate-516.mdx`](docs/clubs/skate-516.mdx)                     |
| 轩辕文学社    | 协办单位 | 待定      | [`xuanyuan-literature.mdx`](docs/clubs/xuanyuan-literature.mdx) |
| 山商魔术社    | 协办单位 | 待定      | [`magic.mdx`](docs/clubs/magic.mdx)                             |

## 相关链接

- 仓库：<https://github.com/MyGOClubParty/club-party-website>
- 组织：<https://github.com/MyGOClubParty/>
- 组件库：<https://www.npmjs.com/package/@iicemeta/minecraft-react-ui>

---

<div align="center">

Copyright © 2026 MyGOClubParty

</div>
