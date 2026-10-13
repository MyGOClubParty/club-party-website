/** `/api/*` 的响应助手：统一 JSON 形状与「一律不缓存」。 */

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  // 报名结果与名单都必须现读：中间层缓存住会让刚报名的同学看不到自己
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), {...init, headers});
}

/** 失败一律是这个形状：`{ok:false, code, message}`，前端按 `code` 分支。 */
export function fail(status: number, code: string, message: string): Response {
  return json({ok: false, code, message}, {status});
}

export function methodNotAllowed(allow: string): Response {
  const response = fail(405, 'method_not_allowed', `这个接口只支持 ${allow}`);
  response.headers.set('allow', allow);
  return response;
}
