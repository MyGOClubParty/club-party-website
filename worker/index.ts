/**
 * 站点的 Worker 入口 —— 目前只做两件事：接 `/api/*`，其余原样交回静态资产。
 *
 * 这个站的内容几乎全部是 Docusaurus 预渲染出来的静态文件（`build/`），由 `assets.binding`
 * 以 `env.ASSETS.fetch()` 提供。留这个入口的目的**不是**现在要服务端渲染，而是把后续
 * 动态内容的接缝先摆好：要加 D1 / KV / R2 / AI 之类，直接在下面的 `/api/*` 分支里挂绑定即可，
 * 不用再动部署形态（构建产物目录、路由、缓存行为都不变）。
 *
 * 请求是怎么走到这里的（由 wrangler.jsonc 的 assets 配置决定，别只看这个文件）：
 *   - `/api/*`：`run_worker_first` 命中 → 一定进这个 fetch，不看静态资产；
 *     这条是必需的：compatibility_date ≥ 2025-04-01 时导航请求默认**绕过** Worker，
 *     否则浏览器打开 `/api/health` 会拿到 404.html。
 *   - 其余路径命中 `build/` 里的文件 → 由静态资产直接服务，**不调用这个 Worker**（不计费）。
 *   - 都没命中 → `not_found_handling: "404-page"` → 回 `build/404.html` + 404 状态码，
 *     同样不经过这里。
 * 也就是说下面那个 `env.ASSETS.fetch()` 只是兜底，正常流量不会走到。
 *
 * `Env` 由 `npm run cf:types` 生成（见 worker/worker-configuration.d.ts），
 * 不在本文件手写 —— 绑定名以 wrangler.jsonc 为单一事实源。
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const {pathname} = new URL(request.url);

    if (pathname === '/api/health') {
      return Response.json(
        {ok: true, service: 'club-party-website', at: new Date().toISOString()},
        // 健康检查要能看出「这是现算的」，别让中间层缓存住
        {headers: {'Cache-Control': 'no-store'}},
      );
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
