/**
 * LittleSkin 皮肤引入 —— 把同学填的「皮肤 TID」换成真正的皮肤 PNG。
 *
 * 走 LittleSkin 的两个公开只读接口（社区的下载脚本用的也是这两条）：
 *
 *   1. `GET https://littleskin.cn/texture/<tid>`    → JSON：hash / type / name / public / protected
 *   2. `GET https://littleskin.cn/textures/<hash>`  → 皮肤 PNG 本体（hash 是内容指纹，天然就是缓存键）
 *
 * ## 为什么在服务端抓，而不是让浏览器抓完再一起提交
 *
 * 那两个接口**都带 CORS**（实测带 `Origin` 请求会回显 Origin + `allow-credentials`），
 * 所以浏览器自己其实拿得到。但「入库的字节由谁定」是另一件事：只要判定在客户端，
 * 同学改几行 JS 就能把 TID 换成任意 URL、把任意文件当成皮肤交上来。
 * 放在服务端，`littleskin.cn` 就是写死在代码里的常量，不经过任何客户端输入。
 *
 * 还有一条实现上的理由：本站的 `SkinHead` 与 3D 舞台都用 `new Image()` 直读像素
 * （**不开** `crossOrigin`），跨域图会污染画布；站内代理一份同源副本它们才用得上 ——
 * 这也是 `GET /api/skin-preview` 存在的理由。
 *
 * ## 拿到之后与上传走同一条路
 *
 * 上游 bytes 与同学上传的文件**共用** `inspectSkin()` 与同一条 R2 命名规则，
 * 所以「TID 来的皮肤」在下游（名单、取图、3D）与上传的没有任何区别。
 */

import {fail, methodNotAllowed} from './http';
import {MAX_SKIN_BYTES, inspectSkin, readBodyCapped} from './skin';

/** 只认这一个来源。TID 是自增整数，放到 10 位够用很久。 */
const LITTLESKIN_ORIGIN = 'https://littleskin.cn';

/**
 * TID 形状。与 `src/pages/signup.tsx` 里的同名常量必须一致 ——
 * 前端那份只决定「什么时候去问后端」，不构成校验。
 */
export const TID_RE = /^\d{1,10}$/;

/**
 * TID 的上界 = PostgreSQL 的 `integer` 上界。
 *
 * 上游 `/texture/<tid>` 是直接拿 TID 去查 `integer` 列的，**超出范围它自己会 500**：
 * 实测 `8551589999` 回
 * `SQLSTATE[22003]: Numeric value out of range ... value "8551589999" is out of range for type integer`。
 * 与其让同学看到一句莫名其妙的 500，不如在这里就判定「这个 TID 不可能存在」。
 * （10 位数可以超过 int32，所以形状检查之外还得卡这个数。）
 */
const MAX_TID = 2_147_483_647;

/** `hash` 是 sha256 十六进制。拿它拼 URL 之前先卡形状：上游返回什么都不能直接信。 */
const HASH_RE = /^[0-9a-f]{64}$/i;

/** 上游最长等 8 秒：同学在报名页上等着，宁可给一句「稍后重试」也别拖到超时。 */
const UPSTREAM_TIMEOUT_MS = 8000;

export type SkinTidInfo = {
  tid: string;
  hash: string;
  name: string;
  /** `steve` = 4px 手臂，`alex` = 3px。skinview3d 自己会判，取出来只为展示与留痕。 */
  model: string;
};

/** 失败一律是这个形状，`status` 直接拿去回给客户端。 */
export type TidFailure = {ok: false; status: number; code: string; message: string};
export type TidLookup = {ok: true; skin: SkinTidInfo} | TidFailure;
export type TidBytes =
  | {ok: true; skin: SkinTidInfo; bytes: Uint8Array; width: number; height: number}
  | TidFailure;

function unreachable(): TidFailure {
  return {
    ok: false,
    status: 502,
    code: 'littleskin_unreachable',
    message: '连不上 LittleSkin，请稍后重试，或者改成上传皮肤文件',
  };
}

function badResponse(): TidFailure {
  return {
    ok: false,
    status: 502,
    code: 'littleskin_bad_response',
    message: 'LittleSkin 返回了认不出的内容，请稍后重试，或者改成上传皮肤文件',
  };
}

/** 私密 / 受保护的皮肤：上游口径是「仅上传者和管理员可查看」，那就别装作能引用它。 */
function notAvailable(): TidFailure {
  return {
    ok: false,
    status: 400,
    code: 'tid_not_available',
    message: '这个皮肤在 LittleSkin 上是私密的（仅上传者可见），不能直接引用，请改成上传皮肤文件',
  };
}

/** 第一步：TID → hash 与皮肤信息。 */
export async function lookupSkinTid(rawTid: string): Promise<TidLookup> {
  const tid = rawTid.trim();
  // 两种「不可能存在」要分开说：纯数字但越界（比如手滑多按了几位）如果也回「只能是数字」，
  // 同学会盯着自己明明全是数字的输入发愣
  if (!TID_RE.test(tid)) {
    return {
      ok: false,
      status: 400,
      code: 'tid_invalid',
      message: 'LittleSkin TID 只能是数字（皮肤详情页地址末尾那串，例如 855158）',
    };
  }
  if (Number(tid) > MAX_TID) {
    return {
      ok: false,
      status: 400,
      code: 'tid_invalid',
      message: '这个 TID 超出了 LittleSkin 的编号范围，核对一下详情页地址是不是多按了几位',
    };
  }

  let response: Response;
  try {
    response = await fetch(`${LITTLESKIN_ORIGIN}/texture/${tid}`, {
      headers: {accept: 'application/json'},
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return unreachable();
  }

  if (response.status === 404) {
    return {
      ok: false,
      status: 404,
      code: 'tid_not_found',
      message: `LittleSkin 上没有 TID 为 ${tid} 的皮肤，核对一下详情页地址`,
    };
  }
  // 403 = 上游自己说「请求的材质已经设为私密，仅上传者和管理员可查看」（实测正文原文）
  if (response.status === 403) return notAvailable();
  if (!response.ok) {
    return {
      ok: false,
      status: 502,
      code: 'littleskin_error',
      message: `LittleSkin 没能给出 TID 为 ${tid} 的皮肤（上游返回 ${response.status}），核对一下 TID 或稍后重试`,
    };
  }

  // 上游出错时回的是 HTML（404 / 500 都实测到过），先看类型再解析 ——
  // 否则 JSON.parse 会在 HTML 上抛异常，日志里只剩一句语法错，看不出真正原因
  if (!(response.headers.get('content-type') ?? '').includes('json')) {
    return badResponse();
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return badResponse();
  }

  const record = (payload ?? {}) as Record<string, unknown>;
  const hash = typeof record.hash === 'string' ? record.hash : '';
  if (!HASH_RE.test(hash)) return badResponse();

  // 这两个标记是接口文档里的口径，实测中还遇到过上游直接对私密皮肤回 403（上面那条）；
  // 两条路都要挡，谁先命中都行
  if (record.public === false || record.protected === true) return notAvailable();

  return {
    ok: true,
    skin: {
      tid,
      hash: hash.toLowerCase(),
      name: typeof record.name === 'string' && record.name.trim() ? record.name.trim() : `TID ${tid}`,
      model: typeof record.type === 'string' ? record.type : 'steve',
    },
  };
}

/** 第二步：hash → 字节。上限与上传同一条线（`MAX_SKIN_BYTES`）。 */
async function fetchTexture(hash: string): Promise<{ok: true; bytes: Uint8Array} | TidFailure> {
  let response: Response;
  try {
    response = await fetch(`${LITTLESKIN_ORIGIN}/textures/${hash}`, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return unreachable();
  }

  if (!response.ok) {
    if (response.status === 404) {
      return {
        ok: false,
        status: 404,
        code: 'littleskin_texture_missing',
        message: '这张皮肤的文件在 LittleSkin 上取不到（可能已被作者删除或设为受保护），请改成上传皮肤文件',
      };
    }
    if (response.status === 403) return notAvailable();
    return {
      ok: false,
      status: 502,
      code: 'littleskin_error',
      message: `LittleSkin 没能给出这张皮肤的文件（上游返回 ${response.status}），请稍后重试或改成上传皮肤文件`,
    };
  }

  // 复用读 body 的那道闸：声明超限直接拒，边读边数超限就掐断
  const body = await readBodyCapped(response, MAX_SKIN_BYTES);
  if (!body.ok) {
    if (body.code === 'too_large') {
      return {
        ok: false,
        status: 413,
        code: 'skin_too_large',
        message: `皮肤文件不能超过 ${MAX_SKIN_BYTES / 1024 / 1024} MB`,
      };
    }
    return badResponse();
  }
  return {ok: true, bytes: body.bytes};
}

/** TID → 校验过的皮肤字节。报名与预览都从这里走，两条路的行为不会分叉。 */
export async function skinBytesFromTid(rawTid: string): Promise<TidBytes> {
  const lookup = await lookupSkinTid(rawTid);
  if (!lookup.ok) return lookup;

  const texture = await fetchTexture(lookup.skin.hash);
  if (!texture.ok) return texture;

  const inspected = inspectSkin(texture.bytes);
  if (!inspected.ok) {
    return {
      ok: false,
      status: 400,
      code: inspected.code,
      message: `LittleSkin 上这张皮肤不是可用的 PNG 皮肤：${inspected.message}`,
    };
  }

  return {
    ok: true,
    skin: lookup.skin,
    bytes: texture.bytes,
    width: inspected.width,
    height: inspected.height,
  };
}

/**
 * `GET /api/skin-preview?tid=<数字>` —— 报名页的即时预览。
 *
 * 返回的是**皮肤 PNG 本体**（同源代理），不是 JSON：报名页要的是那张图，
 * 让浏览器再跨域去 LittleSkin 取一次纯属多一跳，而且跨域图会污染画布。
 * 附带三个 `x-skin-*` 响应头把皮肤名与模型一起带回去 —— 预览区想显示
 * 「白丝猫娘（alex）」这种信息时不用再发第二个请求。名字可能是中文，
 * 响应头只能是 ASCII，所以用 `encodeURIComponent` 编过，前端解码回来。
 */
export async function handleSkinPreview(request: Request): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return methodNotAllowed('GET');

  const tid = new URL(request.url).searchParams.get('tid') ?? '';
  const result = await skinBytesFromTid(tid);
  if (!result.ok) return fail(result.status, result.code, result.message);

  const headers = new Headers({
    'content-type': 'image/png',
    // TID 底下的 hash 随时可能被作者换掉（改皮肤保留 TID），所以这里只缓存 10 分钟；
    // 真正定格的是报名那一刻写进 R2 的那份副本
    'cache-control': 'public, max-age=600',
    etag: `"${result.skin.hash}"`,
    'x-skin-tid': result.skin.tid,
    'x-skin-model': result.skin.model,
    'x-skin-name': encodeURIComponent(result.skin.name),
  });

  if (request.headers.get('if-none-match') === headers.get('etag')) {
    return new Response(null, {status: 304, headers});
  }
  return new Response(request.method === 'HEAD' ? null : result.bytes, {headers});
}
