/**
 * 名单与皮肤读取。
 *
 * 一个刻意的分寸：名单是**公开页面**（「小伙伴们」）的数据源，所以这里只挑姓名、班级、
 * Minecraft ID 和皮肤往外给 —— 学号与 QQ 属于个人信息，既不查也不下发。
 */

import {fail, json, methodNotAllowed} from './http';
import {SKIN_KEY_RE} from './skin';

type Row = {
  name: string;
  class_name: string;
  mc_id: string;
  skin_key: string | null;
  created_at: string;
};

export async function listParticipants(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return methodNotAllowed('GET');

  let rows: Row[];
  try {
    const result = await env.DB.prepare(
      'SELECT name, class_name, mc_id, skin_key, created_at FROM participants ORDER BY created_at DESC, id DESC',
    ).all<Row>();
    rows = result.results ?? [];
  } catch {
    // 多半是还没建表（`npm run db:migrate:remote` 没跑）。给一句能照着做的话，别甩 500。
    return fail(503, 'db_unavailable', '报名数据暂时读不到，可能是数据库还没初始化');
  }

  return json({
    ok: true,
    count: rows.length,
    participants: rows.map((row) => ({
      name: row.name,
      className: row.class_name,
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
