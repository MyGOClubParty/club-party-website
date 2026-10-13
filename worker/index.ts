/**
 * 站点的 Worker 入口 —— 站点本体是 Docusaurus 预渲染出来的静态文件（`build/`），
 * 由 `assets.binding` 以 `env.ASSETS.fetch()` 提供；这个 Worker 只管 `/api/*`：
 *
 *   POST /api/register            活动报名（multipart；皮肤可选：上传文件或填 LittleSkin TID）→ D1 + R2
 *   GET  /api/participants        已报名名单（**不含学号与 QQ**）
 *   GET  /api/skins/<key>         从 R2 取一张皮肤
 *   GET  /api/skin-preview?tid=   报名页用：按 LittleSkin TID 取回皮肤 PNG（同源代理）
 *   GET  /api/health              存活探测
 *
 * 请求是怎么走到这里的（由 wrangler.jsonc 的 assets 配置决定，别只看这个文件）：
 *   - `/api/*`：`run_worker_first` 命中 → 一定进这个 fetch，不看静态资产；
 *     这条是必需的：compat date ≥ 2025-04-01 时导航请求在找不到资产时不会进 Worker，
 *     否则浏览器打开 `/api/health` 会拿到 404.html。
 *   - 其余路径命中 `build/` 里的文件 → 由静态资产直接服务，**不调用这个 Worker**（不计费）。
 *   - 都没命中 → `not_found_handling: "404-page"` → 回 `build/404.html` + 404 状态码。
 * 也就是说下面那个 `env.ASSETS.fetch()` 只是兜底，正常流量不会走到。
 *
 * `Env` 由 `npm run cf:types` 生成（见 worker/worker-configuration.d.ts），
 * 不在本文件手写 —— 绑定名以 wrangler.jsonc 为单一事实源。
 */

import {fail, json} from './http';
import {handleSkinPreview} from './littleskin';
import {listParticipants, serveSkin} from './participants';
import {handleRegister} from './register';

const SKIN_PREFIX = '/api/skins/';

async function route(request: Request, env: Env): Promise<Response> {
  const {pathname} = new URL(request.url);

  if (pathname === '/api/health') {
    return json(
      {ok: true, service: 'club-party-website', at: new Date().toISOString()},
      // 健康检查要能看出「这是现算的」，别让中间层缓存住
      {headers: {'Cache-Control': 'no-store'}},
    );
  }

  if (pathname === '/api/register') return handleRegister(request, env);
  if (pathname === '/api/participants') return listParticipants(request, env);
  if (pathname === '/api/skin-preview') return handleSkinPreview(request);
  if (pathname.startsWith(SKIN_PREFIX)) {
    return serveSkin(request, env, decodeURIComponent(pathname.slice(SKIN_PREFIX.length)));
  }
  if (pathname.startsWith('/api/')) {
    return fail(404, 'no_such_endpoint', '没有这个接口');
  }

  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (error) {
      // 兜底：栈进 Worker 日志（`wrangler dev` / `wrangler tail` 能看），
      // 对外只给一句话 —— 别把内部细节当成响应体漏出去
      console.error(
        `unhandled ${request.method} ${new URL(request.url).pathname}`,
        error instanceof Error ? (error.stack ?? error.message) : error,
      );
      return fail(500, 'internal_error', '服务出错了，请稍后重试');
    }
  },
} satisfies ExportedHandler<Env>;
