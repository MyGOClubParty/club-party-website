/**
 * Turnstile（Cloudflare 人机校验）的前端共用部分。
 *
 * 报名页与报名后台都要用，所以从 `pages/signup.tsx` 里搬出来一份 —— **只能有一份**：
 * `TURNSTILE_SITEKEY` 是面板上那个 widget 的公开标识，本地要换成官方测试 sitekey
 * （真实 sitekey 只在自己注册过的域名上出票，localhost / 局域网地址会被直接拒）。
 * 这个判据分叉一次，后台就会在线上永远过不去，而页面只会显示「校验没通过」。
 *
 * ## 两个坑，都踩过
 *
 * 1. **不要给 api.js 加 `async` / `defer`**。加了之后 Turnstile 拒绝 `turnstile.ready()`
 *    （报 `Remove async/defer from the Turnstile api.js script tag before using
 *    turnstile.ready()`），widget 一个都不出现，而 typecheck / build / 别的断言全都正常。
 *    动态插进来的 script 本来就是异步下载、不阻塞解析的，`async = false` 只是把属性摘掉。
 * 2. **票是一次性的**（5 分钟过期，用掉即废）。登录失败后必须 `reset()`，否则用户改完口令
 *    再点提交，票已经用过了 —— 会拿到「校验已过期」而不是「口令不对」，非常误导。
 *
 * 服务端那边判据是**另一套**（`--var` / `wrangler secret`），两边选的是两样东西，
 * 故意不同：Host 头是客户端可控的，服务端按它挑密钥等于让人随便骗出「什么票都认」。
 * 见 `worker/turnstile.ts` 顶部。
 */

/** 面板上那个 widget 的公开标识。 */
const TURNSTILE_SITEKEY = '0x4AAAAAAEmcKHpkdTedZjS9';
/** 官方测试 sitekey：任何域名都出票，只在本地/预览用。 */
const TURNSTILE_TEST_SITEKEY = '1x00000000000000000000AA';

/** 本机预览的判据：localhost、回环、以及 RFC1918 的局域网地址（走 4023 隧道时是这个）。 */
const LOCAL_HOSTNAMES =
  /^(localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|0\.0\.0\.0|\[?::1\]?|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/;

/** `render=explicit`：widget 什么时候出现、出现在哪儿由我们说了算，不靠它自己扫 DOM。 */
const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/**
 * 每个 widget 的 `action` —— **服务端会拿它比对**，所以字符串必须与 `worker/turnstile.ts`
 * 里的常量逐字一致。分两个是因为报名与登录是两件事：一张报名页的票不该能拿来登后台。
 */
export const TURNSTILE_ACTION_SIGNUP = 'signup';
export const TURNSTILE_ACTION_ADMIN = 'admin';

/**
 * 只用得到这几个成员，没必要把官方的类型包拉进来（它也没有 d.ts 发布）。
 *
 * 这里**故意没有 `ready()`**：它不是「等 api.js 就绪」的通用姿势，官方只在 script 不带
 * async/defer 时才允许调它。就绪信号用 script 自己的 `onload`。
 */
export type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
  getResponse: (widgetId?: string) => string | undefined;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/** 当前该用哪个 sitekey。`window` 不存在时（SSR）给测试 key —— 反正那一帧不会 render。 */
export function turnstileSitekey(): string {
  if (typeof window === 'undefined') return TURNSTILE_TEST_SITEKEY;
  return LOCAL_HOSTNAMES.test(window.location.hostname) ? TURNSTILE_TEST_SITEKEY : TURNSTILE_SITEKEY;
}

/**
 * 加载一次 api.js（同一个 promise 复用）。失败时清掉缓存，下次挂载还能再来一次。
 */
let turnstileScript: Promise<void> | null = null;
export function loadTurnstileScript(): Promise<void> {
  if (turnstileScript) return turnstileScript;
  turnstileScript = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => {
      turnstileScript = null;
      reject(new Error('人机校验脚本加载失败'));
    };
    document.head.appendChild(script);
  });
  return turnstileScript;
}
