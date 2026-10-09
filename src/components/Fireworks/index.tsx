/**
 * Minecraft 风格的烟花 —— canvas 粒子。
 *
 * 为什么用 canvas 而不是拼 DOM：一炮炸开就是几十上百个粒子，每个还要拖尾，
 * DOM 节点数会瞬间到几百，重排 + GC 抖动很显眼；canvas 一帧批量画完，
 * 而且可以用 `destination-out` 把上一帧整体擦淡，尾迹基本白送。
 *
 * 四个约定：
 * - 粒子一律画成整数对齐的方块。Minecraft 的 spark 粒子就是小方块，抗锯齿反而假。
 * - 火箭本体用官方 `firework_rocket.png` 贴图（`imageSmoothingEnabled = false`），
 *   加载不出来就退回一个色块，不抛异常。
 * - 没有粒子时立刻停掉 RAF 并把画布擦干净，不做常驻空转。
 * - 自动演出是**循环**的（见 `useFireworks`），所以「不可见」必须停发：火箭只有在
 *   RAF 跑起来之后才会前进，页面藏起来还在发射的话，火箭只会无限堆在数组里。
 */

import {useCallback, useEffect, useRef, type ReactNode, type RefObject} from 'react';

import styles from './styles.module.css';

/** 16 种染料色里挑的鲜艳子集，用来当爆炸颜色。 */
const DYE_COLORS = [
  '#F9FFFE',
  '#F9801D',
  '#FED83D',
  '#80C71F',
  '#3AB3DA',
  '#169C9C',
  '#3C44AA',
  '#8932B8',
  '#C74EBD',
  '#F38BAA',
  '#B02E26',
];

/** 爆炸形状。MC 原版还有 creeper/burst，这里只做三种最常见的。 */
type Shape = 'ball' | 'star' | 'burst';
const SHAPES: Shape[] = ['ball', 'ball', 'ball', 'burst', 'burst', 'star'];

const G_ROCKET = 300; // px/s²，火箭重力（轻微，让它出膛后减速）
const G_PARTICLE = 130; // px/s²，烟花粒子重力
const DRAG_PER_SEC = 0.11; // 粒子速度每秒保留比例 → 炸开后先快后慢
const TRAIL_MAX = 6; // 每条拖尾保留的历史点数

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  /** 扁平的 [x0,y0,x1,y1,...]，避免每帧造对象。 */
  trail: number[];
  /** MC 的 spark 粒子尾段会闪，这里照做。 */
  flicker: boolean;
}

interface Rocket {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 到这个高度就炸。 */
  ceiling: number;
  color: string;
  shape: Shape;
  trail: number[];
  /** 齐射时错开起爆时间。 */
  delay: number;
}

/** 爆炸瞬间的一圈扩散光环。 */
interface Flash {
  x: number;
  y: number;
  r: number;
  life: number;
  max: number;
  color: string;
}

interface Engine {
  launch: (count?: number) => void;
  resize: () => void;
  destroy: () => void;
}

function createEngine(canvas: HTMLCanvasElement): Engine | null {
  const context = canvas.getContext('2d');
  if (!context) return null;
  // 显式标注成非空类型：TS 的窄化不会带进下面那些函数声明里，
  // 否则每一处 ctx.xxx 都要写 `!.`
  const ctx: CanvasRenderingContext2D = context;

  const rocketImg = new Image();
  let rocketReady = false;
  rocketImg.onload = () => {
    rocketReady = true;
  };
  rocketImg.src = '/mc/items/firework_rocket.png';

  let w = 1;
  let h = 1;
  let particles: Particle[] = [];
  let rockets: Rocket[] = [];
  let flashes: Flash[] = [];
  let raf = 0;
  let last = 0;
  let shots = 0;

  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

  function resize(): void {
    const rect = canvas.getBoundingClientRect();
    // 限制到 2x：再高只是白烧几倍像素，方块粒子看不出差别。
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = Math.max(1, Math.round(rect.width));
    h = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }

  function explode(x: number, y: number, color: string, shape: Shape): void {
    const speed = shape === 'burst' ? 250 : 195;
    const count = shape === 'burst' ? 96 : shape === 'star' ? 78 : 58;

    for (let i = 0; i < count; i += 1) {
      let angle: number;
      let sp: number;
      if (shape === 'star') {
        // 8 根辐条交替长/短 → 四角星，而不是一圈等长的"轮子"
        const spoke = Math.floor(rand(0, 8));
        const isLong = spoke % 2 === 0;
        angle = (spoke / 8) * Math.PI * 2 + rand(-0.05, 0.05);
        sp = speed * (isLong ? rand(0.85, 1) : rand(0.4, 0.55));
      } else if (shape === 'burst') {
        angle = rand(0, Math.PI * 2);
        sp = speed * rand(0.72, 1);
      } else {
        // sqrt 分布 → 圆面均匀，不是往圆心堆
        angle = rand(0, Math.PI * 2);
        sp = speed * Math.sqrt(rand(0.02, 1));
      }
      const life = rand(1.0, 1.75);
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * sp,
        vy: Math.sin(angle) * sp,
        life,
        max: life,
        color,
        size: rand(2.4, 3.6),
        trail: [],
        flicker: Math.random() < 0.55,
      });
    }
    flashes.push({x, y, r: 4, life: 0.22, max: 0.22, color});
  }

  function launch(count = 1): void {
    for (let i = 0; i < count; i += 1) {
      // 整幅铺开，中轴不躲避：只留出两端各 8% 的余量，免得光环在边缘被切掉。
      const x = rand(w * 0.08, w * 0.92);
      const ceiling = rand(h * 0.1, h * 0.48);
      const y0 = h + 8;
      // 由 vy² = 2·g·s 反推初速，再留 6% 余量：火箭到顶时仍在上升，靠 vy>=0 判定炸开
      const vy = -Math.sqrt(2 * G_ROCKET * Math.max(20, y0 - ceiling)) * 1.06;
      rockets.push({
        x,
        y: y0,
        vx: rand(-16, 16),
        vy,
        ceiling,
        color: pick(DYE_COLORS),
        shape: pick(SHAPES),
        trail: [],
        delay: i * 0.22,
      });
    }
    shots += count;
    // 累计发射数写在 canvas 上：自动化里据此判断「循环在持续发」，比只看像素稳。
    canvas.dataset.shots = String(shots);
    ensureRunning();
  }

  function step(dt: number): void {
    for (let i = rockets.length - 1; i >= 0; i -= 1) {
      const r = rockets[i];
      if (r.delay > 0) {
        r.delay -= dt;
        continue;
      }
      r.trail.push(r.x, r.y);
      if (r.trail.length > TRAIL_MAX * 2) r.trail.splice(0, 2);
      r.vy += G_ROCKET * dt;
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      if (r.vy >= 0 || r.y <= r.ceiling) {
        explode(r.x, r.y, r.color, r.shape);
        rockets.splice(i, 1);
      }
    }

    const drag = Math.pow(DRAG_PER_SEC, dt);
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.trail.push(p.x, p.y);
      if (p.trail.length > TRAIL_MAX * 2) p.trail.splice(0, 2);
      p.vx *= drag;
      p.vy = p.vy * drag + G_PARTICLE * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }

    for (let i = flashes.length - 1; i >= 0; i -= 1) {
      const f = flashes[i];
      f.life -= dt;
      f.r += 260 * dt;
      if (f.life <= 0) flashes.splice(i, 1);
    }
  }

  function draw(): void {
    // 把上一帧擦淡（而不是擦掉），尾迹就有了；同时画布本身仍然是透明的，
    // 不会像半透明黑罩那样把 hero 压暗。
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.26)';
    ctx.fillRect(0, 0, w, h);

    ctx.globalCompositeOperation = 'lighter';

    for (const f of flashes) {
      const t = f.life / f.max;
      ctx.globalAlpha = Math.max(0, t * 0.45);
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const r of rockets) {
      if (r.delay > 0) continue;
      const n = r.trail.length / 2;
      for (let i = 0; i < n; i += 1) {
        const f = (i + 1) / n; // 旧 → 新
        ctx.globalAlpha = 0.3 * f;
        ctx.fillStyle = i % 2 ? '#f5b942' : r.color;
        const s = 1.6 + 2.4 * f;
        ctx.fillRect(r.trail[i * 2] | 0, r.trail[i * 2 + 1] | 0, s, s);
      }
      ctx.globalAlpha = 1;
      if (rocketReady) {
        ctx.save();
        ctx.translate(r.x, r.y);
        // 贴图是“朝上”的，速度朝上时 atan2 = -π/2，+π/2 后正好不转
        ctx.rotate(Math.atan2(r.vy, r.vx) + Math.PI / 2);
        ctx.drawImage(rocketImg, -5, -9, 10, 18);
        ctx.restore();
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect((r.x - 1.5) | 0, (r.y - 3) | 0, 3, 8);
      }
    }

    for (const p of particles) {
      const t = p.life / p.max; // 1 → 0
      let alpha = t * t;
      if (p.flicker && t < 0.5) alpha *= Math.sin(p.life * 46) > 0 ? 1 : 0.12;
      const s = p.size * (0.45 + 0.55 * t);
      ctx.fillStyle = p.color;

      const n = p.trail.length / 2;
      for (let i = 0; i < n; i += 1) {
        ctx.globalAlpha = Math.max(0, alpha * 0.28 * ((i + 1) / n));
        ctx.fillRect(p.trail[i * 2] | 0, p.trail[i * 2 + 1] | 0, s * 0.7, s * 0.7);
      }
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.fillRect(p.x | 0, p.y | 0, s, s);
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function frame(now: number): void {
    raf = 0;
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    step(dt);
    draw();
    if (rockets.length || particles.length || flashes.length) {
      raf = requestAnimationFrame(frame);
      return;
    }
    // 全部结束：destination-out 会留残影，这里彻底擦一遍再收工
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, w, h);
  }

  function ensureRunning(): void {
    if (raf === 0) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  resize();
  const observer = new ResizeObserver(() => resize());
  observer.observe(canvas);

  return {
    launch,
    resize,
    destroy() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      observer.disconnect();
      particles = [];
      rockets = [];
      flashes = [];
    },
  };
}

/**
 * 自动演出的节奏，和「刚进站那一轮」完全一致：首发放 400ms，此后每 650ms 一发，
 * 每 5 发收一次双响。原来是 setTimeout 一次性排完这一串，现在改成无限循环。
 */
const FIRST_SHOT_MS = 400;
const SHOT_INTERVAL_MS = 650;
const SHOTS_PER_CYCLE = 5;

/**
 * 把 canvas 和引擎绑在一起。
 * 返回的 `launch` 给按钮用；`canvasRef` 交给 `<Fireworks>` 渲染。
 *
 * 自动演出是循环的，但只在「用户没有要求减少动效」且「画布可见」时进行；
 * 手动点按钮则照放（显式操作应当被执行）。
 */
export function useFireworks(options: {autoShow?: boolean} = {}): {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  launch: (count?: number) => void;
} {
  const {autoShow = true} = options;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const engine = createEngine(canvas);
    engineRef.current = engine;
    if (!engine) return undefined;

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const looping = autoShow && !reduced;

    let shootTimer = 0;
    let shotIndex = 0;
    let inView = true;
    let running = false;

    const stop = () => {
      running = false;
      if (shootTimer) window.clearTimeout(shootTimer);
      shootTimer = 0;
    };

    // 递归 setTimeout 而非 setInterval：每发都严格是「上一发之后 650ms」，
    // 即使某一帧卡住，也不会把攒下的几发挤在一帧里全炸。
    const tick = () => {
      engine.launch(shotIndex % SHOTS_PER_CYCLE === SHOTS_PER_CYCLE - 1 ? 2 : 1);
      shotIndex += 1;
      shootTimer = window.setTimeout(tick, SHOT_INTERVAL_MS);
    };

    const start = () => {
      if (!looping || running || !inView || document.hidden) return;
      running = true;
      shootTimer = window.setTimeout(tick, FIRST_SHOT_MS);
    };

    const sync = () => {
      if (inView && !document.hidden) start();
      else stop();
    };

    // 火箭要在 RAF 里才会前进，所以页面藏起来时继续「发射」只会让火箭无限堆积，
    // 回到前台时一次性全炸。切后台、或 hero 滚出视口，一律停发。
    const observer =
      typeof IntersectionObserver === 'function'
        ? new IntersectionObserver((entries) => {
            inView = entries[entries.length - 1].isIntersecting;
            sync();
          })
        : null;
    observer?.observe(canvas);
    document.addEventListener('visibilitychange', sync);
    if (!observer) sync(); // 没有 IntersectionObserver 时按「一直在视口内」处理

    return () => {
      stop();
      observer?.disconnect();
      document.removeEventListener('visibilitychange', sync);
      engine.destroy();
      engineRef.current = null;
    };
  }, [autoShow]);

  const launch = useCallback((count = 1) => {
    engineRef.current?.launch(count);
  }, []);

  return {canvasRef, launch};
}

export default function Fireworks({
  canvasRef,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
}): ReactNode {
  return <canvas ref={canvasRef} className={styles.canvas} data-fireworks aria-hidden="true" />;
}
