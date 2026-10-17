/**
 * 名单与皮肤读取。
 *
 * 一个刻意的分寸：名单是**公开页面**（「小伙伴们」）的数据源，所以这里只挑学院、
 * Minecraft ID 和皮肤（地址 + **来源**）往外给 —— 学号、QQ、姓名、班级都属于个人信息，
 * 既不查也不下发。姓名与班级是 2026-10-14 一起收起来的：名单卡片上那两位原本摆在游戏 ID
 * 下面，主办方的展示口径改成学院之后，字段就没必要再出网（少下发一个字段，就少一分在公开
 * 页面泄露个人信息的可能）。库里照旧存着，活动核对要用。
 *
 * 皮肤来源只给一个词（`'upload'` / `'littleskin'` / `null`）：名单卡片下面那个标签要分
 * 「手动上传 / LittleSkin / 默认皮肤」。**`littleskin_tid` 不在这儿下发** —— 标签用不上它，
 * 库里存着给活动核对就够（要查某张皮肤出自哪个 TID，报名回执与 R2 的 customMetadata 里都有）。
 */

import {isMissingTable} from './db';
import {fail, json, methodNotAllowed} from './http';
import {SKIN_KEY_RE} from './skin';

type Row = {
  college: string;
  mc_id: string;
  skin_key: string | null;
  skin_source: string;
  littleskin_tid: string | null;
  created_at: string;
};

/**
 * 名单的分页参数。
 *
 * `limit` 默认 **100**，不是「一页 24 张」：这条接口不只服务名单页 —— 后台导出、外部脚本、
 * 以及任何「先把人拿全」的调用方都在用它，把默认值压到一页会悄悄改掉它们的语义。
 * 名单页自己传 `?limit=24&offset=…`（见 `src/pages/participants.tsx`）。
 *
 * 上限 200：真要全量（导出）请走 `/api/admin/participants`，那条是登录后的完整口径。
 */
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

function clampLimit(raw: string | null): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(value), MAX_LIMIT);
}

function clampOffset(raw: string | null): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

export async function listParticipants(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return methodNotAllowed('GET');

  const url = new URL(request.url);
  const limit = clampLimit(url.searchParams.get('limit'));
  const offset = clampOffset(url.searchParams.get('offset'));

  let rows: Row[];
  let total: number;
  try {
    // 总数单独查一次：分页控件要显示「共 N 人」，而 LIMIT 之后的长度说明不了总共有多少
    const counted = await env.DB.prepare('SELECT COUNT(*) AS total FROM participants').first<{
      total: number;
    }>();
    total = counted?.total ?? 0;
    const result = await env.DB.prepare(
      'SELECT college, mc_id, skin_key, skin_source, littleskin_tid, created_at FROM participants ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?',
    )
      .bind(limit, offset)
      .all<Row>();
    rows = result.results ?? [];
  } catch (error) {
    // 表还不存在 = 这个库刚建出来、第一个报名还没来（建表由报名那一刻触发，见 worker/db.ts）。
    // 那不是故障，是「还没有人报名」—— 照常回一份空名单，页面显示 0 人。
    // （读接口刻意**不**顺手建表：GET 触发 DDL 很别扭，而且真正该建表的是报名那条路。）
    if (isMissingTable(error)) {
      return json({ok: true, count: 0, total: 0, limit, offset, hasMore: false, participants: []});
    }
    // 表在但列不齐（老库没跑 `db:migrate:college:remote` / `db:migrate:source:remote`）会报
    // `no such column` —— 那种是真的没升级完，如实 503。
    return fail(503, 'db_unavailable', '报名数据暂时读不到，可能是数据库还没升级完');
  }

  return json({
    ok: true,
    /** 本次返回了几条（等于 `participants.length`，留着给老调用方） */
    count: rows.length,
    /** 库里一共多少人 —— 分页控件用 */
    total,
    limit,
    offset,
    hasMore: offset + rows.length < total,
    participants: rows.map((row) => ({
      // 早于这一列的记录，值来自迁移时那条 `DEFAULT ''`（见 worker/migrate-add-college.sql）。
      // 空串就如实给空串，不拿班级去顶；名单页遇到空值不显示这一行。
      college: row.college,
      mcId: row.mc_id,
      hasSkin: row.skin_key !== null,
      // 没上传皮肤的走站点里的默认皮肤，路径由前端决定，这里明确给 null
      skinUrl: row.skin_key ? `/api/skins/${row.skin_key}` : null,
      // 皮肤来源：`'upload'` = 同学自己传的，`'littleskin'` = 填了 TID 由服务端去取的。
      // 名单卡片下面那个标签按它分「手动上传 / LittleSkin」。**空串只能给 null**：早于这一列的
      // 记录没写下来源（那时上传与 TID 两条路都存在），猜成哪一种都是在编 —— 名单页遇到 null
      // 退回笼统的「自备皮肤」。
      skinSource:
        row.skin_source === 'upload' || row.skin_source === 'littleskin' ? row.skin_source : null,
      registeredAt: row.created_at,
    })),
  });
}

/** `GET /api/skins/<key>` —— 从 R2 取皮肤。桶没开公共访问，这是唯一的取图口子。 */
export async function serveSkin(request: Request, env: Env, key: string): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return methodNotAllowed('GET');
  // 键形状先卡死：挡住 `../` 之类的路径穿越，也挡住在桶里乱翻
  if (!SKIN_KEY_RE.test(key)) return fail(400, 'bad_skin_key', '皮肤文件名不合法');

  const object = await env.SKINS.get(key);
  if (!object) return fail(404, 'skin_not_found', '没有找到这张皮肤');

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  if (!headers.has('content-type')) headers.set('content-type', 'image/png');
  headers.set('etag', object.httpEtag);
  // 允许浏览器缓存一小会儿：改皮肤等于换文件名，不存在「缓存了新名字还是旧图」的问题
  headers.set('cache-control', 'public, max-age=300');

  if (request.headers.get('if-none-match') === object.httpEtag) {
    return new Response(null, {status: 304, headers});
  }
  return new Response(object.body, {headers});
}
