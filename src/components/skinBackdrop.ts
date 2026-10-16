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
 * ## 两档图：卡片一档、弹窗一档（2026-10-16 下午）
 *
 * 一开始两者贴的是同一张 4096×2048（378 KB / 贴到 GPU 是 32 MiB）。名单页一屏十几张卡片，
 * 而卡片上「看得见的背景」只有约 47° 的水平视野（相机在斜前方，fov 60 竖着算下来就是这个数）
 * —— 整张 4K 图有 **87% 的像素是卡片永远看不到的**，却要看它解码、上传、生成 mipmap。
 * 实测：`verify/_shot-panorama-res.cjs` 拍三档分辨率的卡片特写，**2048×1024 这一档肉眼分不出来**；
 * `verify/_probe-panorama-decode.cjs` 单独掐表（五趟中位）—— 解码 55.8 → 15.8 ms、
 * 裸纹理 32.0 → 8.0 MiB、下行 387,482 → 126,800 B。所以：
 *
 * | 用在哪 | 文件 | 尺寸 | 大小 |
 * |---|---|---|---|
 * | 名单卡片（离屏舞台） | `SKIN_PANORAMA_GRID` | 2048×1024 | 124 KB |
 * | 弹窗（要能自由旋转） | `SKIN_PANORAMA` | 4096×2048 | 378 KB |
 *
 * 弹窗那档不降：那里的相机是**用户自己拖着转的**，一转就转到卡片从来没显示过的经度上，
 * 整张 4K 都是有效像素。**两档都是 2:1**（equirect 贴球面的硬要求），验收里各有一条盯着。
 *
 * ## 加载：自己读字节流，因为要有进度条
 *
 * 库的 `loadPanorama(url)` 内部是 `loadImage` —— **拿不到进度**，界面只能干等。
 * 想要「下载 → 解析 → 贴上去」这一段有反馈，就只能自己 `fetch` 那个字节流：
 * 见下面的 `panoramaBitmap()`。它同时兼一份**按 URL 的缓存**：同一张图无论多少消费者，
 * 都只下载、只解码一次。
 *
 * ## ⚠️ 解码时要显式 `imageOrientation: 'flipY'`，否则实景上下颠倒
 *
 * 这条是 2026-10-16 踩出来的：卡片背景刚从「传 URL」改成「传 ImageBitmap」，实景就**倒过来了**
 * —— 草在天上、天空在脚底（读者截图）。
 *
 * 根因在**浏览器**这一侧，不在 three：three 对每次纹理上传都执行
 * `pixelStorei(UNPACK_FLIP_Y_WEBGL, texture.flipY)`（0.156.1 里是无条件的，见
 * `three/build/three.module.js:24256`），而 `Texture.flipY` 默认 `true`。可 WebGL 规范给
 * `ImageBitmap` 单开了一条：**源是 ImageBitmap 时 `UNPACK_FLIP_Y_WEBGL` 被忽略**，
 * 改用它自己的 `imageOrientation`。于是 that 那句 `pixelStorei` 对 bitmap 白设，
 * 图就这么上下颠倒地被贴上了 —— 而 `<img>` 那条路一直靠它翻正。
 *
 * 实测（`verify/_probe-flipy.cjs`：造一张「上红下蓝」的图，三种源各上传一次再读屏幕上下沿）：
 *
 * | 源 | `UNPACK_FLIP_Y_WEBGL` | 结果 |
 * |---|---|---|
 * | `<img>` | `false` | 上蓝下红（颠倒） |
 * | `<img>` | `true` | **上红下蓝（正）** —— 对 `<img>` 生效 |
 * | `ImageBitmap`（默认解码） | `true` | 上蓝下红（颠倒）—— **被忽略** |
 * | `ImageBitmap`（解码时 `flipY`） | 两个值都一样 | **上红下蓝（正）** |
 *
 * 所以修法只有一处：解码时把它翻掉，`pixelStorei` 那边一个字都不用动。
 * `premultiplyAlpha: 'none'` 同理 —— 它也属于「对 ImageBitmap 被忽略、得在解码时定」的那组，
 * 与 three `ImageBitmapLoader` 的默认一致（three 自己的 loader 默认就是
 * `{premultiplyAlpha: 'none'}`）。
 *
 * ## 素底还剩两件事要做
 *
 * 1. **全景没就位时不黑屏**：全景是异步来的（还得解码），贴上去之前总得有个底 ——
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
 * 弹窗用的完整全景（equirectangular，2:1）。
 *
 * 与 `static/mc/blocks/stone.png` 一样写死根路径：站点 `baseUrl` 是 `/`，
 * 而静态素材的引用在这几个 CSS 模块里也都是这么写的。
 */
export const SKIN_PANORAMA = '/mc/panorama.webp';

/**
 * 名单卡片用的全景：同一张图降到 2048×1024。
 *
 * 卡片是**一个离屏舞台 + 每卡片一张 2D 画布**（见 `components/SkinViewer`），所以全站
 * 只有这一份，再多卡片也不会多贴一张 —— 但也正因为它是每帧都要采样的那张，
 * 降一档省下来的上传与采样成本是实打实的，而观感（见文件头那张表）分不出来。
 */
export const SKIN_PANORAMA_GRID = '/mc/panorama-grid.webp';

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

/**
 * 全景加载的三个阶段。
 *
 * - `download`：读字节流。`total` 拿到了才有 `ratio`，否则界面走「不定进度」。
 * - `decode`：`createImageBitmap()` 在解。**这一段没有百分比可报** —— 浏览器不给回调，
 *   硬要画一条动来动去的假进度才是骗人。
 * - `done`：解码好了，调用方接着把它贴到 `scene.background`。
 */
export type PanoramaProgress = {
  phase: 'download' | 'decode' | 'done';
  /** 已经拿到的字节数 */
  loaded: number;
  /** 响应头里的总长度；拿不到（分块传输、被代理剥掉）时为 `null` */
  total: number | null;
  /** `loaded / total`，`total` 未知时为 `null` */
  ratio: number | null;
};

export type PanoramaProgressHandler = (progress: PanoramaProgress) => void;

/** 按 URL 缓存的解码结果。同一张全景，无论多少消费者都只下载一次、只解一次。 */
const bitmaps = new Map<string, Promise<ImageBitmap>>();

/**
 * 把全景取回来、解码好，交给 `viewer.loadPanorama()`。
 *
 * 返回 `ImageBitmap` 而不是 URL，是有意的：库的 `loadPanorama()` 收到 `TextureSource`
 * 时**是同步的**（收到 URL 才会自己去 `loadImage`），所以「解码」这一步就落在我们手里，
 * 也就能在它前面插一段可测量的下载进度。
 *
 * ⚠️ 别把返回的 bitmap `close()` 掉：它同时被多个 `Texture` 引用（卡片舞台、弹窗），
 * 关掉之后 three 再上传就会拿到一张空的图。
 */
export function panoramaBitmap(url: string, onProgress?: PanoramaProgressHandler): Promise<ImageBitmap> {
  const cached = bitmaps.get(url);
  if (cached) {
    // 已经在这条路上走过一遍的消费者：没有下载可报，直接说「在解」，界面不至于闪回 0%
    cached.then(
      () => onProgress?.({phase: 'done', loaded: 0, total: null, ratio: 1}),
      () => {},
    );
    return cached;
  }

  const task = (async (): Promise<ImageBitmap> => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`panorama ${url} → HTTP ${response.status}`);
    const header = Number(response.headers.get('content-length'));
    const total = Number.isFinite(header) && header > 0 ? header : null;
    const type = response.headers.get('content-type') ?? 'image/webp';

    let blob: Blob;
    const reader = response.body?.getReader();
    if (!reader) {
      // 拿不到流（老浏览器、或者被中间层剥了 body）：退回一次性读取，进度条只能走不定进度
      onProgress?.({phase: 'download', loaded: 0, total, ratio: null});
      blob = await response.blob();
    } else {
      const chunks: Uint8Array[] = [];
      let loaded = 0;
      for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.byteLength;
        onProgress?.({phase: 'download', loaded, total, ratio: total ? Math.min(1, loaded / total) : null});
      }
      onProgress?.({phase: 'download', loaded, total, ratio: total ? 1 : null});
      blob = new Blob(chunks as BlobPart[], {type});
    }

    onProgress?.({phase: 'decode', loaded: blob.size, total, ratio: null});
    // ⚠️ 这两个选项是**必须**的，不是调优：WebGL 对 ImageBitmap 忽略 UNPACK_FLIP_Y_WEBGL
    // 与 UNPACK_PREMULTIPLY_ALPHA_WEBGL，朝向与预乘只能在解码时定下来（见文件头）。
    // 少了 flipY，整张实景就会上下颠倒 —— 而这件事 typecheck、build、别的断言**全都看不见**。
    const bitmap = await createImageBitmap(blob, {imageOrientation: 'flipY', premultiplyAlpha: 'none'});
    onProgress?.({phase: 'done', loaded: blob.size, total, ratio: 1});
    return bitmap;
  })();

  bitmaps.set(url, task);
  // 失败的那次别留在缓存里，否则一次网络抖动会让这张图在这个会话里永远取不回来
  task.catch(() => bitmaps.delete(url));
  return task;
}
