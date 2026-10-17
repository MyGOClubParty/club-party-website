/**
 * Turnstile 人机校验（服务端这半边）。
 *
 * 为什么判定必须在这里：前端那个 widget 只负责**取一张票**，票本身是伪造得出来的 ——
 * 任何人往报名接口直接 POST 一个字符串就绕过了。所以票要拿到这里换成 Cloudflare 的判定，
 * 而且排在最前面（**写 D1、去 LittleSkin 取图之前**）：这样被挡下的是额度与存储，
 * 不只是「名单难看」。
 *
 * ## 密钥从哪来（本地 / 线上唯一的分岔）
 *
 * - 线上：`wrangler secret put TURNSTILE_SECRET`（值在面板那个 widget 里），没有默认值；
 * - 本地：`npm run cf:dev` 用 `--var` 把官方测试密钥（`1x…0AA`）带进 `wrangler dev`。
 *   `--var` 只影响 dev 进程，`wrangler deploy` 根本不看它 —— 测试密钥不可能跑到线上。
 *   刻意**不用 `.dev.vars`**（它是 wrangler 的约定文件名，但会被 `wrangler types` 顺带写进
 *   入库的类型文件，理由见 worker/env.d.ts 顶部）。
 *
 * 也刻意**不按请求的 Host 判「是不是本地」**：`Host` 是客户端可控的头，线上只要收到一个
 * `Host: localhost` 就会切到「任何票都通过」的测试密钥 —— 校验等于没有。密钥缺失一律 503，
 * 不静默放过。
 *
 * ## 与前端的分工
 *
 * 前端按 `location.hostname` 决定用哪个 **sitekey**（本地用测试 sitekey）—— 那是公开信息，
 * 这么判没关系。两边选的是两样东西（一个 sitekey、一个 secret），判据不同是**故意**的，
 * 别把它们想成同一个开关。
 */

/** siteverify。官方要求必须从服务端调，前端一律不许直连。 */
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** 官方测试密钥。**只该由 `npm run cf:dev` 的 `--var` 带进 dev 进程**，线上永远不该有。 */
const TEST_SECRET = '1x0000000000000000000000000000000AA';

/** token 上限，官方文档写死 2048 字符。超了这个数连上游都不问。 */
const TOKEN_MAX_LENGTH = 2048;

/** 上游最长等 10 秒。同学在报名页上等着，宁可给一句「稍后重试」也别拖到超时。 */
const VERIFY_TIMEOUT_MS = 10_000;

/**
 * 报名页那个 widget 的 action。与 `src/pages/signup.tsx` 的 `TURNSTILE_ACTION` 必须一致
 * （两边对不上，正常提交会被判成 403；site-check 里有一条断言钉着这两个常量）。
 */
export const TURNSTILE_ACTION = 'signup';

/**
 * 报名后台登录那个 widget 的 action。与 `src/components/turnstile.ts` 的
 * `TURNSTILE_ACTION_ADMIN` 必须一致。
 *
 * 分成两个是**有意的**：报名页的票不该能拿来登后台，反之亦然。票里带着 widget 渲染时
 * 写进去的 action，服务端这边只能比对 —— 所以两处字符串必须逐字相同。
 */
export const TURNSTILE_ADMIN_ACTION = 'admin';

type SiteverifyPayload = {
  success?: boolean;
  hostname?: string;
  action?: string;
  'error-codes'?: string[];
};

export type TurnstileGate =
  | {ok: true; testKey: boolean; hostname: string | null; action: string | null}
  | {ok: false; status: number; code: string; message: string};

function bad(status: number, code: string, message: string): TurnstileGate {
  return {ok: false, status, code, message};
}

/**
 * 问一次 siteverify。
 *
 * 官方把 `internal-error` 归进「重试」那一类，所以这一支**只重试一次**；两次要带**同一个**
 * `idempotency_key` —— 官方文档专门提了这一条：不带幂等键重试，第二次可能被当成另一笔请求，
 * 把同一枚票重复消费掉。
 *
 * 其余失败一律不重试：拿不到判定就不放行（fail closed），重试只是多烧一次额度。
 */
async function siteverify(
  secret: string,
  token: string,
  remoteip: string | null,
): Promise<{ok: true; payload: SiteverifyPayload} | {ok: false}> {
  const idempotencyKey = crypto.randomUUID();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      const body = new URLSearchParams({secret, response: token, idempotency_key: idempotencyKey});
      if (remoteip) body.set('remoteip', remoteip);
      response = await fetch(SITEVERIFY_URL, {
        method: 'POST',
        headers: {'content-type': 'application/x-www-form-urlencoded'},
        body,
        signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      });
    } catch {
      // 连不上 / 超时：没有判定，不放行
      return {ok: false};
    }

    if (!response.ok) return {ok: false};

    let payload: SiteverifyPayload;
    try {
      payload = (await response.json()) as SiteverifyPayload;
    } catch {
      return {ok: false};
    }

    const codes = payload['error-codes'] ?? [];
    if (!payload.success && codes.includes('internal-error') && attempt === 0) continue;
    return {ok: true, payload};
  }

  // 循环要么 return 要么 continue 一次，走不到这里；留着是为了让返回路径闭合
  return {ok: false};
}

/** 把官方那串英文错误码翻译成人话 + 该给的 HTTP 状态。 */
function explainFailure(codes: string[]): TurnstileGate {
  if (codes.includes('invalid-input-secret') || codes.includes('missing-input-secret')) {
    // 密钥本身有问题：这是我们的配置错了，不该说成「同学没通过」
    return bad(503, 'turnstile_unconfigured', '服务端的人机校验密钥无效，请联系工作人员');
  }
  if (codes.includes('timeout-or-duplicate')) {
    // 最常见的一种：票 5 分钟过期，或者被重复提交（票是一次性的）
    return bad(403, 'turnstile_expired', '人机校验已过期（有效期 5 分钟），请刷新页面后重新提交');
  }
  return bad(403, 'turnstile_failed', '人机校验没通过，请刷新页面后重试');
}

/**
 * 报名接口的入口闸门：从表单里取票 → 交 siteverify → 判定。
 *
 * 返回 `ok:false` 时调用方直接 `fail(gate.status, gate.code, gate.message)`，
 * 什么都别做 —— 特别是别写库。
 */
export async function verifyTurnstile(
  request: Request,
  env: Env,
  form: FormData,
): Promise<TurnstileGate> {
  // widget 会把票写进一个名叫 `cf-turnstile-response` 的隐藏字段，报名页自己拼 FormData 时
  // 用的也是这个名字 —— 两边必须是同一个（改名字要同时改 signup.tsx）。
  const raw = form.get('cf-turnstile-response');
  return verifyTurnstileToken(request, env, typeof raw === 'string' ? raw : '', TURNSTILE_ACTION);
}

/**
 * 通用版：票由调用方给，**用途也要指明**。
 *
 * 报名后台（`worker/admin.ts`）走这条，传的是 `TURNSTILE_ADMIN_ACTION` —— 一张报名页的票
 * 不该能拿来登后台。action 是 widget 渲染时写进票里的，服务端只能比对，没法补写。
 */
export async function verifyTurnstileToken(
  request: Request,
  env: Env,
  rawToken: string,
  expectedAction: string,
): Promise<TurnstileGate> {
  const secret = (env.TURNSTILE_SECRET ?? '').trim();
  if (!secret) {
    return bad(
      503,
      'turnstile_unconfigured',
      '服务端还没配人机校验密钥，暂时无法提交，请联系工作人员',
    );
  }

  const token = rawToken.trim();
  if (!token) {
    return bad(403, 'turnstile_missing', '没有拿到人机校验结果，请刷新页面后重新提交');
  }
  if (token.length > TOKEN_MAX_LENGTH) {
    // 形状就不对：自己挡掉，省一次出网
    return bad(403, 'turnstile_invalid', '人机校验的数据不合法，请刷新页面后重新提交');
  }

  const remoteip = request.headers.get('CF-Connecting-IP');
  const verified = await siteverify(secret, token, remoteip);
  if (!verified.ok) {
    // 「我们判断不了」不等于「对方是机器人」：回 503 让同学稍后重试，别把锅扣在他头上。
    // 但一样**不放行**。
    return bad(503, 'turnstile_unreachable', '人机校验服务暂时不可用，请稍后重试');
  }

  const {payload} = verified;
  const codes = payload['error-codes'] ?? [];
  if (!payload.success) return explainFailure(codes);

  const hostname = payload.hostname ?? null;
  const action = payload.action ?? null;
  // 用测试密钥时这几个字段都是合成的：实测 hostname 恒为 `example.com`，action 干脆不返回。
  // 所以下面两道人话校验只在真实密钥下才有意义。
  const testKey = secret === TEST_SECRET;

  if (!testKey) {
    // action 只在**真的带回来**时才比。官方文档说 widget 设了 action 就会回，但这一条在本地
    // （测试密钥）先验不了；宁可「没带就不比」，也不要因为一个没法事先验证的字段把整场报名
    // 挡在门外。真实密钥下的每次通过都会把它连 hostname 一起打进日志，便于第一次上线后核对。
    if (action && action !== expectedAction) {
      return bad(403, 'turnstile_mismatch', '人机校验的用途对不上，请刷新页面后重新提交');
    }
    const allowed = (env.TURNSTILE_HOSTNAMES ?? '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    if (allowed.length > 0 && (hostname === null || !allowed.includes(hostname.toLowerCase()))) {
      return bad(403, 'turnstile_mismatch', '人机校验来自非本站域名，请刷新页面后重新提交');
    }
    // 上线后的第一手证据：真实的 hostname / action 长什么样，看 Observability 即可
    console.log(`[turnstile] pass action=${action} (expect ${expectedAction}) hostname=${hostname}`);
  }

  return {ok: true, testKey, hostname, action};
}
