/**
 * 一身皮肤是**浅色还是深色** —— 3D 区那块衬底该压哪一块，就看它。
 *
 * ## 为什么要有这么一件事
 *
 * 衬底原本只有「跟着主题走」一种：浅色主题压一层白罩子（面板 ≈ #eeeeef）、深色主题压一层
 * 近黑罩子。可是**皮肤跟主题没有关系**：读者反馈的那一屏上，几位同学都是浅色皮肤，
 * 坐在浅色主题的浅底上，实测轮廓像素**平均 1.34:1、86.6% 低于 1.6:1** —— 和没有底一样，
 * 人只剩一团白（对比度全部按 WCAG 相对亮度算，量法见 `verify/_probe-skin-legibility.cjs`）。
 * 深色主题那边是同一个毛病的另一半：深色皮肤坐在近黑的底上同样糊掉。
 *
 * 所以这里量一次皮肤的明暗，把答案交给 CSS（`data-skin-tone` 属性）：
 * **皮肤浅 → 压深底，皮肤深 → 压浅底**。两块底就是原来那两块，只是不再跟着主题走。
 *
 * ## 判据：不是「平均亮度」，是「有多少像素在自己的底上分不出来」
 *
 * - 「分不出来」= 与底的 WCAG 对比度低于 {@link BLIND_RATIO}（1.6:1）。
 *   WCAG 对图形要求的是 3:1，但那是给**功能性**图形定的（图表、控件边界）；
 *   这里只要「看得见是个站立的人」，用更松的一条，免得整站卡片为了几处描边翻来翻去。
 * - 数的是**像素比例**而不是平均值：均值会把「白衬衫 + 黑裤子」拉成中性色，
 *   可白衬衫在浅底上照样看不见。超过 {@link MAX_WASHED_SHARE}（2%）才换底，
 *   也不要求归零 —— 深色鞋子、黑色描边在深底上永远差一点点，那点面积不值得为它翻掉一块底。
 * - 两块底都够清楚 → `mid`：**不换，跟着主题走**。这是刻意的保守：
 *   换底是有代价的（浅色主题下一屏卡片里突然站出一块深底），只在真糊掉时才动。
 *
 * ## 图从哪来
 *
 * 量的是**皮肤图集本身**（缩到 64×64 数像素），不是渲染结果 —— 图集在皮肤图一到位就能量，
 * 而渲染要等卡片进视口、舞台把这一张装上；后者会让衬底在卡片画好之后才改，先按主题的底
 * 闪一下。图集与渲染结果实测差在 2 个百分点以内（同一批皮肤、同一把尺子，
 * `verify/_probe-skin-tone.py` 量图集、`verify/_probe-skin-legibility.cjs` 量渲染）。
 *
 * ## 与 CSS 的关系
 *
 * 这里需要**两块底真正画出来的亮度**才能算对比度，而颜色写在两个 CSS 模块里
 * （`SkinViewer/styles.module.css` 与 `SkinModal/styles.module.css`，两边同值）。
 * 所以 {@link MATS} 是那两条 `--skin-veil` 的第三份抄写 —— 多出来的一份用断言钉住：
 * `verify/site-check.cjs` 会读这三处，值不一致就红。
 */

/** 皮肤的明暗。`mid` = 两块底都够清楚（或者量不出来），**不换底、跟着主题走**。 */
export type SkinTone = 'light' | 'dark' | 'mid';

/**
 * 两块衬底的配方：半透明罩子的颜色与 alpha，抄自上面说的那两个 CSS 模块。
 * 面板真正画出来的颜色 = 罩子按 alpha 盖在石头贴图上（见 {@link STONE}）。
 */
const MATS = {
  light: {rgb: [250, 251, 252], alpha: 0.9},
  dark: {rgb: [17, 21, 26], alpha: 0.88},
} as const;

/** 石头贴图（`static/mc/blocks/stone.png`，16×16）的平均色，三通道同值（实测 125.5）。 */
const STONE = 125.5;

/**
 * 「分不出来」的对比度界线。到这一步轮廓只剩一个色块的印象，和没有底差不多。
 * 与 `verify/_probe-skin-tone.py` / `verify/_probe-skin-legibility.cjs` 里那条同值，
 * 好让探针报出来的「<1.6 占比」可以**直接**和这里的判断对上。
 */
const BLIND_RATIO = 1.6;

/** 允许被洗掉的像素比例（见文件头）。数的是比例不是均值。 */
const MAX_WASHED_SHARE = 0.02;

/** 量的时候把图集缩到这么大 —— 皮肤本来就是 64 的倍数，缩采样只是让 HD 皮肤不那么贵。 */
const ATLAS = 64;

/** alpha 低于这个值的像素不算「人物」：现代皮肤第二层大片是空的，算进去会把肤色拉向透明处。 */
const OPAQUE_ALPHA = 128;

function toLinear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** WCAG 相对亮度：皮肤贴图是 sRGB，先转线性再加权。 */
function luminance(r: number, g: number, b: number): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG 对比度（1 到 21）。 */
function contrast(a: number, b: number): number {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

/** 一块底**真正画出来**的亮度（罩子盖在石头上，不是罩子自己的颜色）。 */
function panelLuminance(mat: {readonly rgb: readonly [number, number, number]; readonly alpha: number}): number {
  const blended = mat.rgb.map((channel) => mat.alpha * channel + (1 - mat.alpha) * STONE);
  return luminance(blended[0], blended[1], blended[2]);
}

const PANEL = {light: panelLuminance(MATS.light), dark: panelLuminance(MATS.dark)};

/**
 * 量一身皮肤的明暗。**纯函数**：同一个图量几次结果一样，缓存交给调用方（见下面那三个入口）。
 *
 * 图还没解码好（宽高为 0）、跨域污染了画布、或者整张图都是透明的 —— 一律返回 `mid`：
 * 量不了就退回「跟着主题走」，别把卡片弄坏。
 */
export function measureSkinTone(image: HTMLImageElement | HTMLCanvasElement): SkinTone {
  if (typeof document === 'undefined') return 'mid';
  const width = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
  const height = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
  if (!width || !height) return 'mid';

  const canvas = document.createElement('canvas');
  canvas.width = ATLAS;
  canvas.height = ATLAS;
  const ctx = canvas.getContext('2d');
  if (!ctx) return 'mid';
  ctx.drawImage(image, 0, 0, ATLAS, ATLAS);

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, ATLAS, ATLAS).data;
  } catch {
    // 跨域图会把画布标成 tainted，读像素直接抛 SecurityError（littleskin 的图走的是
    // 站内代理 `/api/skin-preview`，正常不会走到这里）
    return 'mid';
  }

  let total = 0;
  let washedLight = 0;
  let washedDark = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < OPAQUE_ALPHA) continue;
    const value = luminance(data[i], data[i + 1], data[i + 2]);
    total += 1;
    if (contrast(value, PANEL.light) < BLIND_RATIO) washedLight += 1;
    if (contrast(value, PANEL.dark) < BLIND_RATIO) washedDark += 1;
  }
  if (total === 0) return 'mid';

  const light = washedLight / total;
  const dark = washedDark / total;
  if (light <= MAX_WASHED_SHARE && dark <= MAX_WASHED_SHARE) return 'mid';
  if (dark < light) return 'light'; // 深底更清楚 → 这身皮肤偏浅
  if (light < dark) return 'dark'; // 浅底更清楚 → 这身皮肤偏深
  return 'mid';
}

type Entry = {
  tone: SkinTone | null;
  waiters: Array<(tone: SkinTone) => void>;
};

/** 量过的结果按皮肤地址存这儿：一屏二十张卡片穿的可能是同一张皮肤，量的只该是一次。 */
const tones = new Map<string, Entry>();

/**
 * 记下已经量好的结果。
 *
 * 网格那条路（`SkinViewer`）里的图是它自己取回来的，量完直接记在这儿 —— 省掉一次重复取图，
 * 也让衬底在**第一帧**就是对的，不会先按主题的底闪一下。
 */
export function rememberSkinTone(skin: string, tone: SkinTone): void {
  const entry = tones.get(skin) ?? {tone: null, waiters: []};
  entry.tone = tone;
  tones.set(skin, entry);
  const waiters = entry.waiters.splice(0, entry.waiters.length);
  for (const waiter of waiters) waiter(tone);
}

/**
 * 取一身皮肤的明暗。**量不出来时返回 `null`，图到手了会回调**（拿得到就同步返回，回调不会再响）。
 *
 * 弹窗那条路走这个入口（它自己不去解码皮肤）；网格那条路用 `rememberSkinTone` 直接喂结果。
 */
export function skinToneOf(skin: string, onReady?: (tone: SkinTone) => void): SkinTone | null {
  const entry = tones.get(skin);
  if (entry?.tone) return entry.tone;
  if (typeof document === 'undefined') return null;
  if (entry) {
    // 已经在取：排个队，别为同一张皮肤再发一次请求
    if (onReady) entry.waiters.push(onReady);
    return null;
  }

  const record: Entry = {tone: null, waiters: onReady ? [onReady] : []};
  tones.set(skin, record);
  const image = new Image();
  image.decoding = 'async';
  image.addEventListener('load', () => rememberSkinTone(skin, measureSkinTone(image)));
  // 取不回来（404、断网）就按 `mid` 收尾：不换底，也别把等着的人永远挂在那儿
  image.addEventListener('error', () => rememberSkinTone(skin, 'mid'));
  image.src = skin;
  return null;
}
