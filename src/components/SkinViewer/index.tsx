import {useEffect, useRef, useState, type ReactNode} from 'react';
import clsx from 'clsx';

import {applyDefaultPose} from '../skinPose';
import styles from './styles.module.css';

/**
 * SKIN 组件 —— 把 skinview3d（three.js 驱动的 Minecraft 皮肤查看器）封成卡片里能直接用的东西。
 *
 * ## 为什么不给每张卡片各开一个 3D 视图
 *
 * 浏览器同时活着的 WebGL 上下文有硬上限（Chrome 16 个），超了会把**最老的**那个强行丢掉：
 * 控制台一串 `WARNING: Too many active WebGL contexts`，被丢掉那张画布当场变空白。
 * 26 人的名单实测创建了 **38 个上下文**，首屏就 23 条告警，表现就是「有的卡片没加载出来」。
 * 两个来源：
 *
 * 1. **探测**：每张卡片的 effect 都 `document.createElement('canvas').getContext('webgl2')` 探一次
 *    WebGL —— 这是**真的创建一个上下文**，而且那张画布只活在局部变量里，要等 GC 才回收。
 *    26 张卡片就是 26 个，光这一项就超了上限。
 * 2. **视图**：每张卡片各建一个 `SkinViewer`，滚出视口 `dispose()`。但 `dispose()` **不归还上下文**
 *    —— 它只释放 three 自己持有的 GPU 资源，上下文要等 canvas 被 GC 才回收 ——
 *    于是滚动一趟下来「已 dispose 但还没回收」的越堆越多，被丢掉的偏偏是仍在视野里的老卡片。
 *
 * 所以这里换成：**全站只开一个离屏 3D 舞台**（`data-skin-stage`），每帧把渲染结果
 * `drawImage` 到各卡片自己的 2D 画布上。上下文恒为 1 个，名单再长也不会撞上限；
 * 顺带省掉了「每次滚过都重建一遍 three 场景」的开销（着色器重编译是最贵的那部分）。
 * 探测也只做一次，而且探完立刻 `loseContext()` 还回去，不占名额。
 *
 * ## 动画只给视口内的卡片跑
 *
 * 视口外的卡片直接跳过渲染，画布保留最后一帧 —— 就是「关闭超出视口的动画」。
 * 一张可见卡片都没有时连 `requestAnimationFrame` 都不排，页面静置不烧 CPU/GPU；
 * 标签页切到后台同样停。皮肤相同的卡片（默认皮肤那一大批）共享同一次渲染，
 * 只多做几次 `drawImage`。
 *
 * ## 渲染节奏是自己排的（含动画推进）
 *
 * 舞台用 `renderPaused: true` 建，库自带的那条 RAF 循环不开，要出图时手动 `render()`。
 * 但 `render()` **只画不推进**（库源码里就是这么写的：「This method does not change the
 * animation progress」）—— 推进动画的 `animation.update(player, dt)` 在 `draw()` 里，
 * 而 `draw()` 正是被 `renderPaused` 关掉的那条循环。所以光把 `animation` 设上、
 * 然后一帧帧 `render()`，人物会**一动不动**（四肢始终是初始站姿）。要真的走起来，得自己喂时间：
 * 每帧 `animation.update(playerObject, dt)` 再 `render()`。
 *
 * 走路用库自带的 `WalkingAnimation`（摆四肢 + 头部微晃 + 披风摆），和 littleskin 是同一个
 * 动画类；`prefers-reduced-motion: reduce` 时不推进，只出静态站姿。
 *
 * ## 网格不自转、但也不再是正面（2026-10-15 起）
 *
 * 原先这里每帧推 `playerWrapper.rotation.y` 让一屏卡片一起自转。**已去掉**：一屏十几张一起转
 * 既晃眼，也让「想看清某个人的皮肤」变得做不到（得等它转到正面）。现在网格只播走路、不转人物，
 * 想要真的转着看就点开弹窗（`SkinModal`）——那边是真正的 OrbitControls，鼠标拖拽旋转 + 滚轮缩放，
 * 而且带自转开关与动作选择。
 *
 * 「不转」的是**人物**，相机是摆好的：`ensureStage()` 里建完视图就调 `applyDefaultPose()`，
 * 把它摆到标定台量出的那个**斜前方**（方位角约 -35°）。卡片、弹窗看到的是**同一处取景**
 * （同一份常量在 `components/skinPose.ts`），所以点开卡片不会跳角度。
 *
 * ## 分辨率跟着显示密度走
 *
 * 卡片画布按 `rect × 显示密度` 分配像素，再原样贴到同样大小的显示区域上 —— 只要这个密度
 * 低于 `devicePixelRatio`，浏览器就要把它放大，**放大多少就糊多少**。实测（探针
 * `verify/probe-skin-sharpness.cjs`）：把上限卡在 2 时，3 倍屏下每 CSS 像素只拿到 1.999 个
 * 画布像素，等于被放大 1.5 倍显示 —— 就是用户看到的「很模糊」。所以这里只做两端夹取：
 * 不低于 1（等于显示密度，不放大），不高于 3（封顶填充率）。舞台再抬一档到至少 2，
 * 让 dpr=1 的屏幕也能靠缩采样拿到干净的边缘。
 */

/** 卡片的四个状态，落在 `data-mode` 上（验收断言读的就是它）。
 *  - `pending`：还没轮到它渲染，显示 2D 像素头像兜底
 *  - `live`：在视口里，正在实时渲染
 *  - `idle`：画过，但已经滚出视口 —— 动画停了，画布留在最后一帧
 *  - `blocked`：没有 WebGL，或者这张皮肤取不回来，只能一直是 2D 头像
 */
type CardMode = 'pending' | 'live' | 'idle' | 'blocked';

/** 只声明真正用到的那几个成员：不把 three 的类型图拉进站点的 typecheck。 */
type StageViewer = {
  readonly canvas: HTMLCanvasElement;
  render: () => void;
  loadSkin: (source: HTMLImageElement) => void;
  setSize: (width: number, height: number) => void;
  /** 走路/站姿等动画；每帧得自己 `update()`，见顶部注释。
   *  写成方法签名（而不是 `update: (...) => void`）是为了走 TS 的**双变**检查 —— 库那边参数是
   *  `PlayerObject`，两个方向都要求可赋值，函数属性签名的逆变检查会顶牛。 */
  animation: {update(player: unknown, deltaTime: number): void} | null;
  /** 只有喂给 `animation.update()`，所以不必把 three 的 `PlayerObject` 拖进来 */
  readonly playerObject: unknown;
  /** 摆默认取景要动的四个成员（`applyDefaultPose` 的入参形状，见 `components/skinPose.ts`）：
   *  `playerWrapper` 只用来把自转角归零（每帧一并挂到 `data-skin-yaw` 上，好让「网格不自转」
   *  可断言），`controls.update()` 负责按相机位置把朝向（`lookAt`）算出来 ——
   *  这台视图 `enableControls: false`，鼠标控制全关，但 `update()` 不受 `enabled` 影响：
   *  `enabled` 只挡事件处理器，所以它照样能把相机摆正。 */
  readonly playerWrapper: {rotation: {y: number}};
  readonly camera: {position: {x: number; y: number; z: number}};
  readonly controls: {update: (deltaTime?: number) => void};
  /** 竖直视场角。**改它会动距离**（库的 setter 里调 `adjustCameraDistance()`），摆位时必须先写。 */
  fov: number;
  /** 同上：也靠 `adjustCameraDistance()` 生效。 */
  zoom: number;
  /** 改它会同时改绘制缓冲与合成器尺寸（库的 setter 里做全了） */
  pixelRatio: number | 'match-device';
  dispose: () => void;
};

type Card = {
  skin: string;
  host: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
  /** 卡片在页面上占的 CSS 尺寸；舞台按可见卡片里最大的那张渲染 */
  cssWidth: number;
  cssHeight: number;
  visible: boolean;
  /** 已经往画布上画过至少一帧 —— 一旦为真就不再回退成 2D 头像 */
  drawn: boolean;
  blocked: boolean;
  /** 重新量一次尺寸，并按需重建画布的像素缓冲 */
  measure: () => boolean;
  /** 离开视口时把像素缓冲缩回 1 倍（冻结帧留着），见注释 */
  shrink: () => void;
  /** 让 React 侧重算 `data-mode` */
  sync: () => void;
};

type SkinEntry = {
  state: 'loading' | 'ready' | 'failed';
  image: HTMLImageElement | null;
  waiters: Array<(image: HTMLImageElement | null) => void>;
};

type Stage = {
  viewer: StageViewer;
  /** 当前装载在舞台上的皮肤：同一张皮肤连着渲染时不用重复 loadSkin */
  skin: string | null;
  /** 上一次 setSize 用的 CSS 尺寸 */
  cssWidth: number;
  cssHeight: number;
  /** 上一次设进 viewer 的 pixelRatio —— 显示密度变了才需要重设 */
  ratio: number;
};

/** 卡片画布相对 CSS 像素的倍数下限：等于显示密度，低于它浏览器就要放大、就糊。 */
const MIN_RENDER_RATIO = 1;
/** 上限。主流设备最高 3 倍（高分屏手机、Windows 300% 缩放）；再高只是白烧填充率。 */
const MAX_RENDER_RATIO = 3;
/** 舞台的额外下限：dpr=1 的屏也按 2 倍渲染再缩下来，缩采样比 1:1 出图边缘干净。 */
const STAGE_MIN_RATIO = 2;
/** 帧间隔：24fps。一屏可能有十几张卡片要 blit，走路这个幅度用 60fps 纯属浪费。 */
const FRAME_INTERVAL = 1000 / 24;

const cards = new Set<Card>();
const skinImages = new Map<string, SkinEntry>();

let stage: Stage | null = null;
let stagePromise: Promise<Stage | null> | null = null;
let stageFailed = false;
let frameHandle = 0;
let lastPaint = 0;
let dirty = true;
let globalsBound = false;
let reducedMotionQuery: MediaQueryList | null = null;
let webglSupport: boolean | null = null;
/** 上一次给卡片画布用的密度，变了就得重建缓冲 */
let appliedCardRatio = 0;

/**
 * 显示密度变了，就把可见卡片的像素缓冲重建一遍。
 *
 * 光靠 `resize` 事件不够：只改 `devicePixelRatio`（浏览器缩放、窗口拖到另一块屏、CDP 里改
 * `deviceScaleFactor`）不一定伴随窗口尺寸变化，`resize` 就可能一次都不来 —— 表现就是
 * 「dpr 都 3 了，画布还按 1 倍存」，等于没修。反正渲染循环本来就在跑，每帧对一下最省事。
 */
function syncCardRatio(): void {
  const ratio = displayRatio();
  if (ratio === appliedCardRatio) return;
  appliedCardRatio = ratio;
  for (const card of cards) {
    if (card.visible) card.measure();
  }
}

function cardMode(card: Card): CardMode {
  if (card.blocked) return 'blocked';
  if (!card.drawn) return 'pending';
  return card.visible ? 'live' : 'idle';
}

function deviceDpr(): number {
  if (typeof window === 'undefined') return 1;
  return window.devicePixelRatio || 1;
}

/** 卡片画布该按几倍存像素。**必须 ≥ 显示密度**，否则浏览器放大显示 → 糊。 */
function displayRatio(): number {
  return Math.min(Math.max(deviceDpr(), MIN_RENDER_RATIO), MAX_RENDER_RATIO);
}

/** 舞台渲染倍率。再抬到至少 2 倍，缩采样下来的边缘比 1:1 干净。 */
function stageRatio(): number {
  return Math.min(Math.max(displayRatio(), STAGE_MIN_RATIO), MAX_RENDER_RATIO);
}

/**
 * 人物左腿的摆动角度（弧度）——`WalkingAnimation` 每帧写的就是它。
 *
 * 只为了让「有没有真的在走」变成可断言的事实：光看画布像素有没有变，只能证明「有东西在动」，
 * 证明不了动的是腿。腿角在 -0.5 ~ 0.5 之间来回摆才是走路。读不到就返回 0
 * （库改了内部结构也不至于抛错，只是那条断言会红 —— 正是想要的信号）。
 */
function legSwing(viewer: StageViewer): number {
  const player = viewer.playerObject as
    | {skin?: {leftLeg?: {rotation?: {x?: number}}}}
    | null
    | undefined;
  const value = player?.skin?.leftLeg?.rotation?.x;
  return typeof value === 'number' ? value : 0;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  if (!reducedMotionQuery) {
    reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  }
  return reducedMotionQuery.matches;
}

/**
 * 探一次 WebGL，结果缓存。
 *
 * 关键是**探完把上下文还回去**：`getContext('webgl2')` 拿到的是真上下文，不还就一直占着
 * 名额（Chrome 一共给 16 个）。这里用 `WEBGL_lose_context` 立刻丢掉，
 * 所以全站常驻的上下文只有舞台那一个。
 */
function hasWebGL(): boolean {
  if (webglSupport !== null) return webglSupport;
  try {
    const probe = document.createElement('canvas');
    const context = probe.getContext('webgl2') || probe.getContext('webgl');
    webglSupport = context !== null;
    const extension = (context as {getExtension?: (name: string) => unknown} | null)?.getExtension?.(
      'WEBGL_lose_context',
    ) as {loseContext?: () => void} | undefined;
    extension?.loseContext?.();
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

/** 离屏舞台的容器：挪出行外、裁成一像素、不参与合成，但留在 DOM 里方便排查。 */
function stageHost(): HTMLElement {
  const existing = document.querySelector<HTMLElement>('[data-skin-stage-host]');
  if (existing) return existing;
  const host = document.createElement('div');
  host.dataset.skinStageHost = '';
  host.className = styles.stageHost;
  host.setAttribute('aria-hidden', 'true');
  document.body.appendChild(host);
  return host;
}

/**
 * 皮肤图片按 URL 缓存，全站只取一次 —— 2D 头像和 3D 舞台共用这一份。
 * 默认皮肤会被十几张卡片同时用到，不共用就是十几份解码后的位图。
 */
function requestSkin(
  skin: string,
  onReady?: (image: HTMLImageElement | null) => void,
): HTMLImageElement | null {
  let entry = skinImages.get(skin);
  if (!entry) {
    const record: SkinEntry = {state: 'loading', image: null, waiters: []};
    skinImages.set(skin, record);
    const image = new Image();
    image.decoding = 'async';
    image.addEventListener('load', () => {
      record.state = 'ready';
      record.image = image;
      const waiters = record.waiters.splice(0, record.waiters.length);
      for (const waiter of waiters) waiter(image);
      markDirty();
    });
    image.addEventListener('error', () => {
      record.state = 'failed';
      const waiters = record.waiters.splice(0, record.waiters.length);
      for (const waiter of waiters) waiter(null);
      // 这张皮肤取不回来：用它的卡片就停在 2D 头像上，别一直显示成「待渲染」
      for (const card of cards) {
        if (card.skin === skin) {
          card.blocked = true;
          card.sync();
        }
      }
    });
    image.src = skin;
    entry = record;
  }
  if (!onReady) return entry.state === 'ready' ? entry.image : null;
  if (entry.state === 'ready') return entry.image;
  if (entry.state === 'loading') entry.waiters.push(onReady);
  return null;
}

function hasVisible(): boolean {
  for (const card of cards) {
    // blocked 的卡片画不出来，别让它把帧循环一直挂着空转
    if (card.visible && !card.blocked) return true;
  }
  return false;
}

/** 「有变化了」的统一入口：标脏并确保帧循环在跑。 */
function markDirty(): void {
  dirty = true;
  pump();
}

function pump(): void {
  if (frameHandle !== 0 || !stage) return;
  if (typeof document === 'undefined' || document.hidden) return;
  if (!hasVisible()) return;
  frameHandle = window.requestAnimationFrame(tick);
}

function tick(now: number): void {
  frameHandle = 0;
  // 没有可见卡片 / 标签页在后台 / 舞台还没建好：循环到此为止，等下一次 pump 再起来
  if (typeof document === 'undefined' || document.hidden || !hasVisible() || !stage) return;

  if (prefersReducedMotion()) {
    // 静态站姿下画面本来就是静的，只在「真有变化」时重画一次，不用一直跑
    if (dirty) paint(now);
    return;
  }
  if (now - lastPaint >= FRAME_INTERVAL) paint(now);
  frameHandle = window.requestAnimationFrame(tick);
}

/** 把当前可见的卡片重画一遍 —— 舞台渲染 + blit。 */
function paint(now: number): void {
  const current = stage;
  if (!current) return;
  dirty = false;
  syncCardRatio();

  const visible: Card[] = [];
  for (const card of cards) {
    if (!card.visible) continue;
    // 还没量到尺寸（布局刚稳定、卡片刚挂上）就再试一次；量到了就不再重量
    if (!card.ctx && !card.measure()) continue;
    if (card.ctx) visible.push(card);
  }
  if (visible.length === 0) return;

  // 舞台按可见卡片里最大的那张渲染；比它小的卡片靠 drawImage 缩一下
  let cssWidth = 0;
  let cssHeight = 0;
  for (const card of visible) {
    if (card.cssWidth > cssWidth) cssWidth = card.cssWidth;
    if (card.cssHeight > cssHeight) cssHeight = card.cssHeight;
  }
  // 显示密度会变（浏览器缩放、窗口拖到另一块屏）。舞台的 pixelRatio 得跟上，
  // 否则它会一直按旧密度渲染，卡片却在按新密度存 —— 差出来的那点就是「被放大显示的糊」。
  const ratio = stageRatio();
  if (current.ratio !== ratio) {
    current.ratio = ratio;
    current.viewer.pixelRatio = ratio;
  }

  if (cssWidth > 0 && (cssWidth !== current.cssWidth || cssHeight !== current.cssHeight)) {
    current.cssWidth = cssWidth;
    current.cssHeight = cssHeight;
    current.viewer.setSize(cssWidth, cssHeight);
  }

  // dt 夹一下，标签页切回来时不会因为累积的时间突然跳一大截
  const dt = lastPaint === 0 ? 0 : Math.min((now - lastPaint) / 1000, 0.1);
  lastPaint = now;

  if (!prefersReducedMotion()) {
    // 走路：库的 `render()` 不推进动画（见文件头），时间得自己喂。
    // 不推自转 —— `playerWrapper.rotation.y` 一直是 0；斜前方的取景是**相机**摆出来的
    // （见 `ensureStage()` 里那次 `applyDefaultPose()`），想自己转着看走弹窗。
    // 顺带：库的 `cameraLight` 挂在相机上 → 相机摆过去，明暗也跟着和弹窗一致。
    current.viewer.animation?.update(current.viewer.playerObject, dt);
  }
  // 把当前腿角、自转角与相机取景挂到画布上，好让「到底有没有在走」「有没有偷偷自转」
  // 「卡片是不是弹窗那一处取景」都变成可断言的事实（对照 `components/skinPose.ts` 的常量）
  current.viewer.canvas.dataset.skinPose = legSwing(current.viewer).toFixed(3);
  current.viewer.canvas.dataset.skinYaw = current.viewer.playerWrapper.rotation.y.toFixed(3);
  current.viewer.canvas.dataset.skinFov = current.viewer.fov.toFixed(1);
  const {x, y, z} = current.viewer.camera.position;
  current.viewer.canvas.dataset.skinCam = `${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`;

  // 同一张皮肤只渲染一次，再一次 drawImage 给这一组里每张卡片
  const groups = new Map<string, Card[]>();
  for (const card of visible) {
    const group = groups.get(card.skin);
    if (group) group.push(card);
    else groups.set(card.skin, [card]);
  }

  for (const [skin, group] of groups) {
    const entry = skinImages.get(skin);
    // 图片还没解码好就先跳过，load 事件会把 dirty 标回来
    if (!entry || entry.state !== 'ready' || !entry.image) continue;
    if (current.skin !== skin) {
      // 传 HTMLImageElement 时 loadSkin 是同步的（皮肤足够小，不用等）
      current.viewer.loadSkin(entry.image);
      current.skin = skin;
    }
    current.viewer.render();
    for (const card of group) {
      const {ctx, canvas} = card;
      if (!ctx) continue;
      // 必须先清空：drawImage 是 source-over，模型以外的透明像素盖不掉上一帧，不清会拖出残影
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(current.viewer.canvas, 0, 0, canvas.width, canvas.height);
      if (!card.drawn) {
        card.drawn = true;
        card.sync();
      }
    }
  }
}

/** 懒建全站唯一的那个舞台。失败就记住，别让每张卡片都重试一遍。 */
function ensureStage(): Promise<Stage | null> {
  if (stagePromise) return stagePromise;
  stagePromise = (async () => {
    try {
      const skinview3d = await import('skinview3d');
      const canvas = document.createElement('canvas');
      canvas.dataset.skinStage = '';
      stageHost().appendChild(canvas);
      const viewer: StageViewer = new skinview3d.SkinViewer({
        canvas,
        width: 240,
        height: 320,
        pixelRatio: stageRatio(),
        // 渲染节奏由 tick 排：库自带的那条 RAF 循环关掉，动画推进也自己喂（见文件头）。
        renderPaused: true,
        // 关了它，库的 `autoRotate` 与 OrbitControls 也一起失效 —— 网格本来就要这两样都不生效
        enableControls: false,
        // 卡片要反复把这块画布 drawImage 走，显式保留绘制缓冲最稳
        preserveDrawingBuffer: true,
        model: 'auto-detect',
      });
      // 走路：和 littleskin 用的是同一个动画类（摆四肢 + 头部微晃 + 披风）。设上它只是
      // 让 pose 归位，真正推进靠每帧那次 `animation.update()` —— 少了那一步人物是钉住的。
      viewer.animation = new skinview3d.WalkingAnimation();
      // 取景：卡片和弹窗共用 `components/skinPose.ts` 那一份标定读数（斜前方约 -35°），
      // 点开卡片时才不会跳角度。这台视图的鼠标控制是关着的，相机的朝向就靠 `applyDefaultPose()`
      // 末尾那次 `controls.update()` 定下来 —— 摆位顺序（fov/zoom 先、`camera.position` 最后）
      // 也在那边的注释里，别挪。
      applyDefaultPose(viewer);
      stage = {viewer, skin: null, cssWidth: 0, cssHeight: 0, ratio: stageRatio()};
      return stage;
    } catch {
      // 没有 GPU、上下文没批下来……所有卡片停在 2D 头像上，不再重试
      stageFailed = true;
      stagePromise = null;
      for (const card of cards) {
        if (!card.blocked) {
          card.blocked = true;
          card.sync();
        }
      }
      return null;
    }
  })();
  return stagePromise;
}

function bindGlobals(): void {
  if (globalsBound || typeof window === 'undefined') return;
  globalsBound = true;
  window.addEventListener(
    'resize',
    () => {
      // 视口一变，卡片的 CSS 尺寸也跟着变。**只重量可见的那些**：改画布尺寸会清空画布，
      // 而视口外的卡片此刻不会重画，一改就一直空着。让它们先按旧尺寸 CSS 缩放显示冻帧，
      // 等下次进视口时 observer 里那次 measure() 自然会纠正过来。
      for (const card of cards) {
        if (card.visible) card.measure();
      }
      markDirty();
    },
    {passive: true},
  );
  document.addEventListener('visibilitychange', () => {
    // 后台时 tick 会自己停；回到前台要重新排一帧
    if (!document.hidden) markDirty();
  });
  prefersReducedMotion();
  reducedMotionQuery?.addEventListener('change', () => markDirty());
}

export type SkinHeadProps = {
  /** 皮肤 PNG 的地址（站内路径或 blob: URL）。 */
  skin: string;
  className?: string;
};

/**
 * 2D 像素头像：从 64x64 皮肤图集里裁出头部正面 + 外层（帽子层）。
 *
 * 不依赖 WebGL，也不依赖 skinview3d —— 所以它同时是「3D 还没轮到」「浏览器没有 WebGL」
 * 「皮肤还没取回来」这三种情况下的兜底画面。用 `<canvas>` 手动 `drawImage` 而不是 CSS 背景，
 * 是因为按百分比定位图集格子很容易差半像素，而 drawImage 的源矩形是精确的。
 */
export function SkinHead({skin, className}: SkinHeadProps): ReactNode {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let cancelled = false;

    const draw = (image: HTMLImageElement | null) => {
      if (cancelled || !image) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      // 皮肤是老游戏贴图：放大必须保留硬边，不能平滑
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 64x64（现代）与 64x32（旧版）的头部都在 (8,8) 8x8，外层在 (40,8) 8x8；
      // HD 皮肤按 64 的倍数放大，所以要按实际宽度换算
      const unit = image.width / 64;
      if (unit < 1 || image.height < 32 * unit) return;
      ctx.drawImage(image, 8 * unit, 8 * unit, 8 * unit, 8 * unit, 0, 0, 64, 64);
      ctx.drawImage(image, 40 * unit, 8 * unit, 8 * unit, 8 * unit, 0, 0, 64, 64);
    };

    // 和舞台共用同一份缓存：同一张皮肤全站只取一次
    const ready = requestSkin(skin, draw);
    if (ready) draw(ready);

    return () => {
      cancelled = true;
    };
  }, [skin]);

  return (
    <canvas
      ref={ref}
      width={64}
      height={64}
      className={clsx(styles.head, className)}
      aria-hidden="true"
    />
  );
}

export type SkinViewerProps = {
  /** 皮肤 PNG 的地址。 */
  skin: string;
  /** 无障碍标签：这张皮肤是谁的。 */
  label: string;
  className?: string;
};

export default function SkinViewer({skin, label, className}: SkinViewerProps): ReactNode {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<CardMode>('pending');

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    if (!hasWebGL() || stageFailed) {
      setMode('blocked');
      return;
    }

    bindGlobals();

    const card: Card = {
      skin,
      host,
      canvas,
      ctx: null,
      cssWidth: 0,
      cssHeight: 0,
      visible: false,
      drawn: false,
      blocked: false,
      measure: () => false,
      shrink: () => {},
      sync: () => {},
    };

    card.measure = () => {
      const rect = host.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) return false;
      card.cssWidth = rect.width;
      card.cssHeight = rect.height;
      const ratio = displayRatio();
      const width = Math.round(rect.width * ratio);
      const height = Math.round(rect.height * ratio);
      if (canvas.width !== width || canvas.height !== height) {
        // 改像素尺寸会把画布内容清掉，好在紧接着就会排一帧重画
        canvas.width = width;
        canvas.height = height;
        if (card.ctx) card.ctx.imageSmoothingEnabled = true;
      }
      if (!card.ctx) {
        card.ctx = canvas.getContext('2d');
        if (card.ctx) card.ctx.imageSmoothingEnabled = true;
      }
      return card.ctx !== null;
    };

    /**
     * 离开视口时把像素缓冲缩回 1 倍。
     *
     * 画布内存是**按像素算**的：3 倍屏 + 窄屏单列时一张卡片就是好几 MB，几十上百人挨个滚一遍
     * 全留着，几张就能把页面顶到 iOS 的画布上限。缩回去之后冻结帧照旧在（离屏谁也看不清），
     * 下次进视口 `measure()` 自然把密度补回来 —— observer 的 `rootMargin` 保证那是**在入画之前**。
     *
     * 改像素尺寸会把内容清掉，所以先把当前冻结帧存进临时画布，缩完再贴回来。
     */
    card.shrink = () => {
      if (displayRatio() <= 1) return;
      const width = Math.round(card.cssWidth);
      const height = Math.round(card.cssHeight);
      if (width < 8 || height < 8) return;
      if (canvas.width <= width && canvas.height <= height) return;
      const frozen = document.createElement('canvas');
      frozen.width = canvas.width;
      frozen.height = canvas.height;
      const frozenCtx = frozen.getContext('2d');
      if (!frozenCtx) return;
      frozenCtx.drawImage(canvas, 0, 0);
      canvas.width = width;
      canvas.height = height;
      if (!card.ctx) card.ctx = canvas.getContext('2d');
      if (!card.ctx) return;
      card.ctx.imageSmoothingEnabled = true;
      card.ctx.drawImage(frozen, 0, 0, width, height);
    };

    card.sync = () => setMode(cardMode(card));

    // 先把皮肤取回来，进视口时才有东西可画（同 URL 只取一次）
    requestSkin(skin);

    const observer = new IntersectionObserver(
      (entries) => {
        const last = entries[entries.length - 1];
        if (!last) return;
        if (last.isIntersecting) {
          // 「可见」先认下来，量尺寸失败也不丢下这张卡片（下一帧 paint 会接着量）
          card.visible = true;
          card.measure();
          card.sync();
          // 舞台懒建：第一次真的有卡片进视口，才开始拉 three 那几百 KB
          void ensureStage().then((ready) => {
            if (ready) markDirty();
          });
        } else {
          card.visible = false;
          card.sync();
          // 滚出去的卡片不再渲染，画布留在最后一帧 —— 但缓冲缩回 1 倍，别让内存跟着名单长度涨
          card.shrink();
          markDirty();
        }
      },
      // 只比视口本身多留一点：多算进来一张就多画一张，没必要
      {rootMargin: '120px 0px'},
    );
    observer.observe(host);
    cards.add(card);

    return () => {
      observer.disconnect();
      cards.delete(card);
      markDirty();
    };
  }, [skin]);

  return (
    <div
      ref={hostRef}
      className={clsx(styles.viewer, className)}
      data-mode={mode}
      data-skin-viewer={skin}
      role="img"
      aria-label={label}
    >
      <canvas ref={canvasRef} className={styles.stageCanvas} data-skin-surface="" aria-hidden="true" />
      {/* 兜底头像全程留着，只在 live/idle 时由 CSS 藏起来 —— 这样永远不会出现空白框 */}
      <SkinHead skin={skin} />
    </div>
  );
}
