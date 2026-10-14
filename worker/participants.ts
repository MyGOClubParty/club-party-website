/**
 * 名单与皮肤读取。
 *
 * 一个刻意的分寸：名单是**公开页面**（「小伙伴们」）的数据源，所以这里只挑学院、
 * Minecraft ID 和皮肤往外给 —— 学号、QQ、姓名、班级都属于个人信息，既不查也不下发。
 * 姓名与班级是 2026-10-14 一起收起来的：名单卡片上那两位原本摆在游戏 ID 下面，
 * 主办方的展示口径改成学院之后，字段就没必要再出网（少下发一个字段，就少一分在公开
 * 页面泄露个人信息的可能）。库里照旧存着，活动核对要用。
 */

import {fail, json, methodNotAllowed} from './http';
import {SKIN_KEY_RE} from './skin';

type Row = {
  college: string;
  mc_id: string;
  skin_key: string | null;
  created_at: string;
};

export async function listParticipants(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return methodNotAllowed('GET');

  let rows: Row[];
  try {
    const result = await env.DB.prepare(
      'SELECT college, mc_id, skin_key, created_at FROM participants ORDER BY created_at DESC, id DESC',
    ).all<Row>();
    rows = result.results ?? [];
  } catch {
    // 两种都要说：还没建表（`db:migrate:remote` 没跑），或者表在但 `college` 这一列
    // 还没补（`db:migrate:college:remote` 没跑）—— 后者会在这里报 `no such column`。
    return fail(503, 'db_unavailable', '报名数据暂时读不到，可能是数据库还没初始化或没升级');
  }

  return json({
    ok: true,
    count: rows.length,
    participants: rows.map((row) => ({
      // 早于这一列的记录，值来自迁移时那条 `DEFAULT ''`（见 worker/migrate-add-college.sql）。
      // 空串就如实给空串，不拿班级去顶；名单页遇到空值不显示这一行。
      college: row.college,
      mcId: row.mc_id,
      hasSkin: row.skin_key !== null,
      // 没上传皮肤的走站点里的默认皮肤，路径由前端决定，这里明确给 null
      skinUrl: row.skin_key ? `/api/skins/${row.skin_key}` : null,
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
