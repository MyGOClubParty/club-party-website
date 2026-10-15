import {useCallback, useEffect, useRef, useState, type ReactNode} from 'react';
import {Button, Switch, Tag} from '@iicemeta/minecraft-react-ui';

import {applyDefaultPose} from '../skinPose';
import {skinBadge, type SkinSource} from '../skinSource';
import styles from './styles.module.css';

/**
 * SKIN 弹窗查看器 —— 「小伙伴们」点名一张卡片，弹出来随便转着看。
 *
 * ## 为什么不是网格里的每张卡片各带一套相机
 *
 * 网格那套（`components/SkinViewer`）是「**一个离屏舞台 + 每卡片一张 2D 画布**」：全站只有
 * 一个 WebGL 上下文，挨个把渲染结果 `drawImage` 到卡片上。它换来的是「名单再长也不撞上下文
 * 上限」，代价是**所有卡片共用一台相机** —— 想让某一张能被鼠标任意旋转，改不动。
 *
 * 所以交互交给这个弹窗：它自己开**一个**上下文（全站常驻就是 2 个，离 Chrome 的 16 个上限
 * 还远）。**只开一次，之后一直复用**：库的 `dispose()` 只释放 three 自己持有的 GPU 资源，
 * **不归还上下文**（要等 canvas 被 GC），开关一次弹窗就丢一个的话，点二十张卡片就是二十个 ——
 * 正是网格那套当初踩过的坑。这里的做法是：canvas 恒挂在 DOM 上（关着时 `display: none`），
 * 视图建好就不再销毁，换人只是 `loadSkin()`。
 *
 * ## 库自带的那条循环这次要开着
 *
 * 网格那边用 `renderPaused: true` 自己排帧，因为要一帧画十几张。弹窗只有一个人，
 * 用库自己的循环反而更省事：它每帧 `animation.update()` + `controls.update()` + `render()`，
 * OrbitControls 的惯性、自转、动画全都在这一条里 —— 这正是 examples 里那份实现的用法。
 * 关掉弹窗时把 `renderPaused` 置回 `true`，循环立刻停，不在后台空转。
 *
 * ## 默认值
 *
 * 走路 + 不旋转 + 一组由标定台量出来的相机取景。**那组取景不在本文件里** —— 网格卡片与弹窗
 * 共用 `components/skinPose.ts` 那一份（`DEFAULT_*` 四个常量 + `applyDefaultPose()`），
 * 就是为了别让卡片和弹窗各摆各的、点开时画面跳一下。
 * **「重置视角」回的就是这一处** —— 库的 `resetCameraPose()` 摆的是**库默认**的正面
 * （fov 50 / 距离 43.82），早就不是这里的默认了，所以改成调自己的 `applyDefaultPose()`。
 *
 * ## 那些 `data-skin-modal-*` 属性
 *
 * 给验收用的锚点，不是装饰：`yaw` 是人物自转角（只有自转会让它变，**拖拽相机改的是相机**，
 * 所以它正好能把「自转」和「手动转」分开）、`cam` 是相机坐标、`fov` 是竖直视场角
 * （拖拽/滚轮有没有真的生效、取景是不是标定台量出的那一处，就看这几个）。
 * 见 `verify/site-check.cjs` 的名单段。
 */

/** 动作清单，与库 `src/animation.ts` 的导出类一一对应（映射见 ANIMATION_CLASSES）。 */
const ANIMATIONS = [
  {value: 'walk', label: '走路'},
  {value: 'idle', label: '站立'},
  {value: 'run', label: '跑步'},
  {value: 'fly', label: '飞行'},
  {value: 'wave', label: '挥手'},
  {value: 'crouch', label: '潜行'},
  {value: 'hit', label: '受击'},
  {value: 'swim', label: '游泳'},
] as const;

export type AnimationKey = (typeof ANIMATIONS)[number]['value'];

/** 库真正导出的那 8 个动画类名。 */
type AnimationExport =
  | 'IdleAnimation'
  | 'WalkingAnimation'
  | 'RunningAnimation'
  | 'FlyingAnimation'
  | 'WaveAnimation'
  | 'CrouchAnimation'
  | 'HitAnimation'
  | 'SwimAnimation';

/**
 * 动作 key → 库里的导出类名。**必须写全，不能拿 key 拼**。
 *
 * 踩过：一开始写的是 `new mod[`${key}Animation`]()`，以为类名就是把 key 首字母大写 —— 实际导出是
 * `WalkingAnimation` / `RunningAnimation`（`run` 甚至是 `Running`）。拼出来的 `walkAnimation` 是
 * `undefined`，于是每建一次动画实例就抛一次 `b[w] is not a constructor`（压缩后的样子），
 * **人物一直钉在初始站姿**。而且这个错只出现在浏览器控制台：`data-*` 属性照旧跟着 React 状态变，
 * 光看属性是「换动作成功」的 —— 是套件里那条「控制台错误为 0」把它揪出来的。
 */
const ANIMATION_CLASSES: Record<AnimationKey, AnimationExport> = {
  walk: 'WalkingAnimation',
  idle: 'IdleAnimation',
  run: 'RunningAnimation',
  fly: 'FlyingAnimation',
  wave: 'WaveAnimation',
  crouch: 'CrouchAnimation',
  hit: 'HitAnimation',
  swim: 'SwimAnimation',
};

/** 默认动作：走路。 */
const DEFAULT_ANIMATION: AnimationKey = 'walk';

/**
 * 动作速度的档位。
 *
 * **没有用滑块**：`@iicemeta/minecraft-react-ui` 的 `Slider` 在 `useMemo` 里写的是
 * `Array.from(new Array(max - min - 1))`，`max - min` 不是整数时 `new Array(0.7)` 直接抛
 * `RangeError: Invalid array length`（而且它压根没读 `step`，只能用整数区间）。
 * 这个错会在 **SSG 阶段**炸掉 `/participants` 的构建 —— 本地 dev 看不出来。
 * 档位按钮既躲开了它，也比滑块更适合「选一个速度」这件事。
 */
const SPEED_PRESETS = [0.5, 1, 1.5, 2] as const;

/** 默认速度：原速。 */
const DEFAULT_SPEED = 1;

/**
 * 弹窗画布的像素密度：**不低于 2 倍**，不高于 3 倍。
 *
 * 和网格舞台同一个口径（那边叫 `STAGE_MIN_RATIO`）：dpr=1 的屏也按 2 倍渲染再缩下来，
 * 缩采样比 1:1 出图的边缘干净 —— 这是「凑近看」的那块画面，不该比卡片更糊。
 * 不用库的 `'match-device'` 默认值，因为它不夹下限，dpr=1 时就真的按 1 倍出图。
 */
const MIN_PIXEL_RATIO = 2;
const MAX_PIXEL_RATIO = 3;

function targetPixelRatio(): number {
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  return Math.min(Math.max(dpr, MIN_PIXEL_RATIO), MAX_PIXEL_RATIO);
}

/** 只声明真正用到的那几个成员：不把 three 的类型图拉进站点的 typecheck（同 SkinViewer）。 */
type PlayerAnimationLike = {paused: boolean; speed: number};

type PeekViewer = {
  readonly canvas: HTMLCanvasElement;
  renderPaused: boolean;
  autoRotate: boolean;
  autoRotateSpeed: number;
  animation: PlayerAnimationLike | null;
  readonly controls: {
    enableRotate: boolean;
    enableZoom: boolean;
    enablePan: boolean;
    minDistance: number;
    maxDistance: number;
    /** 重新按 `camera.position` 算一遍朝向（`lookAt` 目标）。库的循环每帧调它。 */
    update: (deltaTime?: number) => void;
  };
  readonly camera: {position: {x: number; y: number; z: number}};
  readonly playerWrapper: {rotation: {y: number}};
  /** 只用来读左腿角（每帧挂到 `data-skin-modal-pose` 上，好让「真的在走」可断言） */
  readonly playerObject: unknown;
  /** 竖直视场角。**改它会动距离**（库的 setter 里调 `adjustCameraDistance()`）——
   *  摆位顺序那条规矩写在 `components/skinPose.ts` 的 `applyDefaultPose()` 里，别在这里再讲一遍。 */
  fov: number;
  /** 同上：也是靠 `adjustCameraDistance()` 生效。 */
  zoom: number;
  /** 改它会同时重设绘制缓冲与合成器尺寸（库的 setter 里做全了） */
  pixelRatio: number | 'match-device';
  loadSkin: (source: HTMLImageElement | string) => void | Promise<void>;
  setSize: (width: number, height: number) => void;
};

type AnimationCtor = new () => PlayerAnimationLike;

type Skinview3dModule = {
  SkinViewer: new (options: {
    canvas: HTMLCanvasElement;
    renderPaused?: boolean;
    preserveDrawingBuffer?: boolean;
  }) => PeekViewer;
} & Record<AnimationExport, AnimationCtor>;

/**
 * 人物左腿的摆动角度（弧度）—— `WalkingAnimation` 每帧写的就是它。
 *
 * 和网格那份（`components/SkinViewer/index.tsx` 的 `legSwing`）同一个用途：光看画布像素有没有变，
 * 只能证明「有东西在动」（相机被拖动、人物自转都能让它变），证明不了**动画实例真的建起来了**。
 * 腿角在 -0.5 ~ 0.5 之间来回摆，才是「换动作真的生效了」。读不到就返回 0，
 * 那条断言会红 —— 正是想要的信号（本轮就是这么抓到 `walkAnimation` 拼错的）。
 */
function legSwing(viewer: PeekViewer): number {
  const player = viewer.playerObject as
    | {skin?: {leftLeg?: {rotation?: {x?: number}}}}
    | null
    | undefined;
  const value = player?.skin?.leftLeg?.rotation?.x;
  return typeof value === 'number' ? value : 0;
}

/**
 * 全站唯一的那个弹窗视图。**建好就不再销毁**（见文件头：库的 dispose 不归还上下文）。
 * 因此这里用模块级单例而不是组件内 `useRef` —— 组件重挂（热更新、路由切换）也不该再造一个。
 */
let peekViewer: PeekViewer | null = null;
let peekModule: Skinview3dModule | null = null;
let peekPromise: Promise<PeekViewer | null> | null = null;
let peekCanvas: HTMLCanvasElement | null = null;
/** 上一次设进视图的像素密度 —— 显示密度没变就不用再动合成器尺寸 */
let peekRatio = 0;

async function ensurePeekViewer(canvas: HTMLCanvasElement | null): Promise<PeekViewer | null> {
  if (peekViewer) return peekViewer;
  if (!canvas) return null;
  if (peekPromise && peekCanvas === canvas) return peekPromise;
  peekCanvas = canvas;
  peekPromise = (async () => {
    try {
      const skinview3d = (await import('skinview3d')) as unknown as Skinview3dModule;
      const viewer = new skinview3d.SkinViewer({
        canvas,
        // 建的时候先停：等弹窗真打开、尺寸也量准了再开循环（见组件里那个 effect）
        renderPaused: true,
        // 验收要把这块画布 drawImage 到 2D 画布上数不透明像素，不保留绘制缓冲就读不到
        preserveDrawingBuffer: true,
      });
      // 与网格相反：这里要的就是鼠标控制。缩放上限收一收，免得一不小心滚成一个小点
      viewer.controls.enableRotate = true;
      viewer.controls.enableZoom = true;
      viewer.controls.enablePan = false;
      viewer.controls.minDistance = 14;
      viewer.controls.maxDistance = 96;
      // 默认不旋转（库的默认值也是 false，这里写出来是为了它被改掉时能被看见）
      viewer.autoRotate = false;
      // 建好就摆到默认取景：即使「打开」那个 effect 还没跑到，第一帧也不是库默认的正面。
      // 放在限位之后 —— `controls.update()` 会把距离夹进 [minDistance, maxDistance]
      applyDefaultPose(viewer);
      peekModule = skinview3d;
      peekViewer = viewer;
      return viewer;
    } catch {
      // 没有 GPU / 上下文没批下来：弹窗里给一句实话，别一直转圈
      peekPromise = null;
      peekCanvas = null;
      return null;
    }
  })();
  return peekPromise;
}

export type PeekPerson = {
  mcId: string;
  /** 学院。可能是空串（早于这一列的记录），那就整行不显示。 */
  college: string;
  hasSkin: boolean;
  /** 皮肤来源，映射见 `components/skinSource.ts`（卡片用的是同一个函数）。 */
  skinSource: SkinSource;
  /** 要展示的皮肤地址（没上传时是默认皮肤）。 */
  skin: string;
};

export type SkinModalProps = {
  /** 当前要查看的人；`null` = 关着。 */
  person: PeekPerson | null;
  onClose: () => void;
};

export default function SkinModal({person, onClose}: SkinModalProps): ReactNode {
  const open = person !== null;
  const mcId = person?.mcId ?? null;
  const skinUrl = person?.skin ?? null;
  /** 皮肤来源标签 —— 与卡片下面那个是同一个函数算出来的（见 components/skinSource.ts）。 */
  const badge = person ? skinBadge(person.hasSkin, person.skinSource) : null;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  /** 打开弹窗前的焦点，关掉时还回去（不然键盘用户被丢回页面开头） */
  const openerRef = useRef<HTMLElement | null>(null);
  /** 当前装载在视图上的动作 key —— 一样就不重建，免得每帧重置动画进度 */
  const animationRef = useRef<AnimationKey | null>(null);

  const [animation, setAnimation] = useState<AnimationKey>(DEFAULT_ANIMATION);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [failed, setFailed] = useState(false);

  const close = useCallback(() => onClose(), [onClose]);

  /**
   * 视角复位 = 相机回默认取景（标定台量出的那一处）**+ 人物自转角归零**。
   *
   * 两件事都必须自己来：
   * - 库的 `resetCameraPose()` 回的是**库默认**的正面（fov 50 / 距离 43.82），不是这里的默认，
   *   所以不用它 —— 否则点一下「重置视角」就跳回正面，把标定的取景丢了。
   * - 自转是加在 `playerWrapper.rotation.y` 上的，库的复位压根不碰它。只摆相机的话，
   *   转过一圈之后「重置视角」会把人物留在侧面 —— 看着就像没复位。
   */
  const resetView = useCallback(() => {
    void ensurePeekViewer(canvasRef.current).then((viewer) => {
      if (viewer) applyDefaultPose(viewer);
    });
  }, []);

  /**
   * 生命周期：建视图 + 按容器实际尺寸出图 + 开关库的渲染循环。
   *
   * `ResizeObserver` 盯的是画布**外面**那个盒子，不是画布自己 —— `viewer.setSize()` 会给画布
   * 写死 px 的 `style.width/height`（three 的行为），盯画布就会自己触发自己。
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!open) {
      if (peekViewer) peekViewer.renderPaused = true;
      return;
    }

    // 自转必须**立刻**关掉，不能等下面那个 effect：库的循环每帧都看 `viewer.autoRotate`，
    // 而 React 把状态设回 false 要晚一轮提交 —— 中间那几帧会把人物转过一点（实测 0.009 rad），
    // 而复位只在打开那一刻做一次，那点角度就一直留着。上次**开着自转**关掉弹窗时就能看见。
    if (peekViewer) peekViewer.autoRotate = false;

    let cancelled = false;
    const host = canvas.parentElement;

    // 每次打开都回到默认：走路 + 不旋转 + 原速 + 不暂停（需求指定的默认展示状态）。
    // 不复用上一次的选择 —— 这个弹窗是「看一眼某人的皮肤」，每次进来都该是同一个起点，
    // 而且视角本来就会复位，留着动作与自转的旧选择只会让人对不上。
    setAnimation(DEFAULT_ANIMATION);
    setSpeed(DEFAULT_SPEED);
    setPaused(false);
    setAutoRotate(false);

    const applySize = (viewer: PeekViewer) => {
      if (!host) return;
      const rect = host.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) return;
      const ratio = targetPixelRatio();
      if (peekRatio !== ratio) {
        peekRatio = ratio;
        viewer.pixelRatio = ratio;
      }
      viewer.setSize(rect.width, rect.height);
    };

    void ensurePeekViewer(canvas).then((viewer) => {
      if (cancelled) return;
      if (!viewer) {
        setFailed(true);
        return;
      }
      applySize(viewer);
      viewer.renderPaused = false;
    });

    const observer = host ? new ResizeObserver(() => {
      if (peekViewer) applySize(peekViewer);
    }) : null;
    if (host && observer) observer.observe(host);

    return () => {
      cancelled = true;
      observer?.disconnect();
      if (peekViewer) peekViewer.renderPaused = true;
    };
  }, [open]);

  /** 换人：装皮肤 + 取景复位（不然上一个人被拖到别处，下一个也歪着出来）。 */
  useEffect(() => {
    if (!open || !skinUrl) return;
    let cancelled = false;
    void ensurePeekViewer(canvasRef.current).then((viewer) => {
      if (cancelled || !viewer) return;
      void viewer.loadSkin(skinUrl);
      applyDefaultPose(viewer);
    });
    return () => {
      cancelled = true;
    };
  }, [open, skinUrl]);

  /** 换动作：每次换都得新建实例（库的动画把进度存在实例里）。 */
  useEffect(() => {
    if (!open) return;
    if (animationRef.current === animation) return;
    let cancelled = false;
    void ensurePeekViewer(canvasRef.current).then((viewer) => {
      if (cancelled || !viewer || !peekModule) return;
      viewer.animation = new peekModule[ANIMATION_CLASSES[animation]]();
      animationRef.current = animation;
    });
    return () => {
      cancelled = true;
    };
  }, [open, animation]);

  /** 速度与暂停。依赖里带 `animation`：刚换完动作的新实例要立刻套上这两项。 */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void ensurePeekViewer(canvasRef.current).then((viewer) => {
      if (cancelled || !viewer) return;
      const current = viewer.animation;
      if (!current) return;
      current.speed = speed;
      current.paused = paused;
    });
    return () => {
      cancelled = true;
    };
  }, [open, animation, speed, paused]);

  /**
   * 自转开关。库的循环里已经处理好了「用户正在拖的时候不自转」
   * （`if (!(controls.enableRotate && isUserRotating))`），这里只管把开关接上。
   */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void ensurePeekViewer(canvasRef.current).then((viewer) => {
      if (cancelled || !viewer) return;
      viewer.autoRotate = autoRotate;
    });
    return () => {
      cancelled = true;
    };
  }, [open, autoRotate]);

  /** 把自转角、腿角、相机坐标与 fov 挂到画布上，供验收读（见文件头）。关着时不用跑。 */
  useEffect(() => {
    if (!open) return;
    let handle = 0;
    const loop = () => {
      const viewer = peekViewer;
      const canvas = canvasRef.current;
      if (viewer && canvas) {
        canvas.dataset.skinModalYaw = viewer.playerWrapper.rotation.y.toFixed(3);
        canvas.dataset.skinModalPose = legSwing(viewer).toFixed(3);
        canvas.dataset.skinModalFov = viewer.fov.toFixed(1);
        const {x, y, z} = viewer.camera.position;
        canvas.dataset.skinModalCam = `${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`;
      }
      handle = window.requestAnimationFrame(loop);
    };
    handle = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(handle);
  }, [open]);

  /** Esc 关闭 + 打开期间锁住页面滚动（弹窗里的滚轮是缩放，不该再带动页面）。 */
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  /** 焦点：进来落在关闭键上，出去还给点开它的那张卡片。 */
  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const opener = openerRef.current;
    return () => opener?.focus();
  }, [open]);

  return (
    <div
      className={styles.overlay}
      data-skin-modal={open ? 'open' : 'closed'}
      // mousedown 而不是 click：拖拽旋转时松手位置在面板外，click 会在遮罩上收尾、把弹窗关掉
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={mcId ? `查看 ${mcId} 的皮肤` : '皮肤查看器'}>
        <div className={styles.head}>
          <div className={styles.who}>
            <p className={styles.mcId} data-skin-modal-mcid={mcId ?? undefined}>
              {mcId}
            </p>
            {person?.college ? <p className={styles.college}>{person.college}</p> : null}
          </div>
          {/* 标签与卡片下面那个一致（同一个 `skinBadge()`）：默认皮肤 / 手动上传 / LittleSkin。
              库的 `Tag` 只接 className 与 children，`title` 得挂在外层这个 span 上。 */}
          {badge ? (
            <span title={badge.title} data-skin-modal-tag={badge.label}>
              <Tag>{badge.label}</Tag>
            </span>
          ) : null}
          <Button
            ref={closeRef}
            variant="clear"
            onClick={close}
            aria-label="关闭查看器"
            data-skin-modal-close="">
            ✕
          </Button>
        </div>

        <div className={styles.stage} data-skin-modal-stage="">
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            data-skin-modal-canvas=""
            data-skin-modal-animation={animation}
            data-skin-modal-speed={speed.toFixed(1)}
            data-skin-modal-rotate={autoRotate ? 'on' : 'off'}
            data-skin-modal-paused={paused ? 'on' : 'off'}
          />
          {failed ? (
            <p className={styles.failed}>这台设备开不了 WebGL，皮肤转不出来。</p>
          ) : (
            <p className={styles.hint} aria-hidden="true">
              拖拽旋转 · 滚轮缩放
            </p>
          )}
        </div>

        <div className={styles.controls}>
          <div className={styles.row}>
            <span className={styles.label}>动作</span>
            <div className={styles.animations}>
              {ANIMATIONS.map((item) => (
                <Button
                  key={item.value}
                  variant="secondary"
                  active={item.value === animation}
                  aria-pressed={item.value === animation}
                  data-skin-modal-animation-button={item.value}
                  onClick={() => setAnimation(item.value)}>
                  {item.label}
                </Button>
              ))}
            </div>
          </div>

          <div className={styles.row}>
            <span className={styles.label}>速度</span>
            <div className={styles.speeds}>
              {SPEED_PRESETS.map((preset) => (
                <Button
                  key={preset}
                  variant="secondary"
                  active={preset === speed}
                  aria-pressed={preset === speed}
                  data-skin-modal-speed-button={preset.toFixed(1)}
                  onClick={() => setSpeed(preset)}>
                  {preset}×
                </Button>
              ))}
            </div>
          </div>

          <div className={styles.row}>
            {/* 这一行没有标签，但占位必须留着 —— 不然三行控件的左边缘对不齐 */}
            <span className={styles.label} aria-hidden="true" />
            <div className={styles.toggleRow}>
              <label className={styles.toggle}>
                <Switch
                  value={autoRotate}
                  onChange={setAutoRotate}
                  aria-label="自动旋转"
                  data-skin-modal-rotate-switch=""
                />
                <span>自动旋转</span>
              </label>
              <Button
                variant="secondary"
                onClick={() => setPaused((value) => !value)}
                data-skin-modal-pause="">
                {paused ? '继续' : '暂停'}
              </Button>
              <Button variant="secondary" onClick={resetView} data-skin-modal-reset="">
                重置视角
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
