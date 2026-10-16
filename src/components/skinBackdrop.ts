/**
 * 皮肤视图的**背景** —— 实景（Minecraft 全景）与素底，两件事都在这一个文件里。
 *
 * ## 为什么把人物放进实景
 *
 * 面板原来只有「跟站点主题走」的一块纯色底（浅色主题压白罩子、深色主题压近黑罩子），
 * 可皮肤跟主题没关系 —— 浅色皮肤坐在浅底上，实测轮廓像素平均 1.34:1、86.6% 低于 1.6:1，
 * 人和底糊成一团（读者截图，见 `verify/_probe-skin-legibility.cjs`）。
 *
 * 中间试过一版「量每身皮肤的明暗、浅皮肤压深底」：判据再准也还是**在两种纯色之间挑一个**，
 * 碰上黑白相间的皮肤两边都分不掉 —— 白衬衫在浅底上看不见，同一条裤腿在深底上也看不见，
 * 一身的像素一半丢在一边。所以这条路放弃了。
 *
 * 现在改成：**把人物直接放进 Minecraft 实景**。`scene.background` 贴一张 equirectangular
 * 全景（草地、树、河、云、太阳），明暗层次是图里本来就有的，人物站在场景中央 ——
 * 这就是 skinview3d `examples/` 里的用法，也是「在游戏里看一个人」的样子，
 * 不必再为纯色底做取舍。实现是库的 `loadPanorama()`。
 *
 * ## 素底还剩两件事要做
 *
 * 1. **全景没就位时不黑屏**：全景是异步来的（一张 4K webp），贴上去之前总得有个底 ——
 *    而且卡片是懒建舞台的，第一帧往往就落在这段空窗里。
 * 2. **弹窗里让用户切过去**：想看清皮肤纹理（半透明外层、细密的像素画）时，
 *    一块安静的纯色底比实景好用。
 *
 * ## 素底色从 CSS 现读，不在这里再抄一份
 *
 * 3D 画布是**不透明**的（库建 `WebGLRenderer` 时没开 `alpha`），人物一画上去就把卡片 /
 * 弹窗那两层 CSS 底纹整个盖住 —— 素底只能由 three 的 `scene.background` 给出。
 * 但颜色不该在这儿写第二份：`--skin-solid` 定义在 `src/css/custom.css` 里（按主题各一份，
 * 值是石头贴图叠主题罩子的合成色），这里**读**它。改了那边，这边跟着变。
 */

/** 两种背景。`panorama` = 实景全景，`solid` = 一块跟主题走的纯色。 */
export type SkinBackdrop = 'panorama' | 'solid';

/**
 * 全景图（equirectangular，2:1）的站内路径。
 *
 * 与 `static/mc/blocks/stone.png` 一样写死根路径：站点 `baseUrl` 是 `/`，
 * 而静态素材的引用在这几个 CSS 模块里也都是这么写的。
 */
export const SKIN_PANORAMA = '/mc/panorama.webp';

/** 上一次读到的主题与结果 —— `getComputedStyle` 会触发样式重算，别每帧都读。 */
let cachedTheme: string | null = null;
let cachedSolid: string | null = null;

/** 量不出来时的兜底：`--skin-solid` 读不到（样式还没上、SSG）就返回 `null`，调用方跳过设置。 */
export function solidBackdrop(): string | null {
  if (typeof document === 'undefined') return null;
  const theme = document.documentElement.getAttribute('data-theme') ?? 'light';
  if (theme === cachedTheme) return cachedSolid;
  const value = getComputedStyle(document.documentElement).getPropertyValue('--skin-solid').trim();
  cachedTheme = theme;
  cachedSolid = value || null;
  return cachedSolid;
}
