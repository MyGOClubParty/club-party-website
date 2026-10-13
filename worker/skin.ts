/**
 * 皮肤文件的校验与命名。
 *
 * 这里是**唯一的权威判定**：前端在提交前也会看一眼大小、给个即时提示，但那只影响体验，
 * 不作数 —— 谁都可以绕过浏览器直接 POST，所以尺寸、类型、内容一律在这边重新验一遍。
 */

/** 单个皮肤文件上限：5 MB（用户要求）。 */
export const MAX_SKIN_BYTES = 5 * 1024 * 1024;

/**
 * 整个请求体的上限 = 文件上限 + 表单其余字段与 multipart 边界的余量。
 * 超过它在**读 body 之前**就 413，不给恶意请求把 5 MB 拉进内存的机会。
 */
export const MAX_BODY_BYTES = MAX_SKIN_BYTES + 64 * 1024;

/**
 * 允许的皮肤尺寸：64x32（旧版单层）+ 64 起的正方形（含 HD 2 的幂）。
 * 与 skinview3d 支持的范围一致（README 的 Features 里写明 1.8 / HD 皮肤都吃）。
 */
export const ALLOWED_SKIN_SIZES: ReadonlyArray<readonly [number, number]> = [
  [64, 32],
  [64, 64],
  [128, 128],
  [256, 256],
  [512, 512],
  [1024, 1024],
];

/**
 * 游戏 id 的字符集：Java 版规则（字母 / 数字 / 下划线），长度放宽到 32。
 * 放宽是有意的 —— id 会进 R2 对象键与 URL，必须限定在**安全字符**里；
 * 而在长度上卡死 3–16 只会把个别同学挡在门外，前端提示里写清 Java 版规则就够了。
 */
export const MC_ID_RE = /^[A-Za-z0-9_]{1,32}$/;

/** 对象键形状（取图路由用它挡住路径穿越与任意键枚举）。 */
export const SKIN_KEY_RE = /^[A-Za-z0-9_]{3,34}\.png$/;

/** Minecraft 游戏 id + 学号后两位 —— 用户指定的命名规则。 */
export function skinKey(mcId: string, studentId: string): string {
  return `${mcId}${studentId.slice(-2)}.png`;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type SkinInspection =
  | {ok: true; width: number; height: number}
  | {ok: false; code: string; message: string};

/**
 * 认一张皮肤：先看是不是 PNG（签名 + 第一个 chunk 必须是 IHDR），再把宽高读出来对尺寸表。
 *
 * 只认魔数、**不认** `Content-Type` 与文件名的 —— 那两个都是客户端说了算的，骗得过。
 */
export function inspectSkin(bytes: Uint8Array): SkinInspection {
  if (bytes.byteLength === 0) {
    return {ok: false, code: 'skin_empty', message: '皮肤文件是空的'};
  }
  if (bytes.byteLength < 24) {
    return {ok: false, code: 'skin_not_png', message: '这不是一张有效的 PNG 图片'};
  }
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (bytes[i] !== PNG_SIGNATURE[i]) {
      return {ok: false, code: 'skin_not_png', message: '皮肤必须是 PNG 图片'};
    }
  }
  const chunkType = String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!);
  if (chunkType !== 'IHDR') {
    return {ok: false, code: 'skin_not_png', message: '这不是一张有效的 PNG 图片'};
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (!ALLOWED_SKIN_SIZES.some(([w, h]) => w === width && h === height)) {
    return {
      ok: false,
      code: 'skin_bad_size',
      message: `皮肤尺寸 ${width}x${height} 不被支持，请用 64x64 或 64x32（HD 皮肤可用 128/256/512/1024 的正方形）`,
    };
  }
  return {ok: true, width, height};
}

export type CappedBody =
  | {ok: true; bytes: Uint8Array}
  | {ok: false; code: 'too_large' | 'no_body'};

/**
 * 带上限地把 body 读进来。
 *
 * 两道闸，缺一不可：
 * 1. `Content-Length` 声明超限 → 连流都不读，直接拒；
 * 2. 边读边累加字节数 → 声明缺失或撒谎（分块传输、伪造小数字）时，累计一超限就
 *    `cancel()` 掐断，绝不等它读完。第 2 道才是真正顶上「防恶意上传」的那道。
 *
 * 参数收 `Request | Response`：**从上游抓回来的 body 也要过这两道闸**
 * （见 `worker/littleskin.ts`），不能因为「来源可信」就整段读进内存。
 */
export async function readBodyCapped(request: Request | Response, limit: number): Promise<CappedBody> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) {
    return {ok: false, code: 'too_large'};
  }

  const body = request.body;
  if (!body) return {ok: false, code: 'no_body'};

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      return {ok: false, code: 'too_large'};
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return {ok: true, bytes};
}
