import {useEffect, useRef, type ReactNode} from 'react';

import styles from './styles.module.css';

/**
 * Minecraft 粒子层：把原版 `textures/particle/*.png` 当精灵，在 canvas 上缓慢上浮，
 * 给「关于本站」页的 hero 做氛围。沿用首页烟花组件的几条约定：
 *
 * - 构图用**确定性伪随机**（LCG，固定种子）→ 每次刷新位置一致，截图与断言都可复现。
 * - 出视口 / 切后台必须停 RAF，否则回到前台会一次性补画一堆积压帧。
 * - `prefers-reduced-motion: reduce` 时只画一帧静态图，不起循环。
 * - `data-particles` / `data-sprites` / `data-frames` 暴露给取证脚本，
 *   这样「在动」有客观判据（帧号在涨），而不是「看着像在动」。
 */

/** 原版粒子贴图，全部 8×8，原字节从 minecraft-assets 拷来。 */
const SPRITES = [
  '/mc/particles/glow.png',
  '/mc/particles/spark.png',
  '/mc/particles/firefly.png',
  '/mc/particles/note.png',
];

/** 确定性伪随机（数值由 Numerical Recipes 的 LCG 常数而来）。 */
function makeRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

type Particle = {
  /** 归一化坐标与速度，跟画布实际尺寸解耦，resize 后不用重排。 */
  x: number;
  y: number;
  size: number;
  speed: number;
  sway: number;
  alpha: number;
  sprite: number;
};

function makeParticles(count: number): Particle[] {
  const random = makeRandom(20261011);
  return Array.from({length: count}, () => ({
    x: random(),
    y: random(),
    size: 6 + Math.round(random() * 12),
    speed: 8 + random() * 16,
    sway: 0.5 + random() * 1.2,
    alpha: 0.25 + random() * 0.55,
    sprite: Math.floor(random() * SPRITES.length),
  }));
}

export default function PixelParticles({count = 24}: {count?: number}): ReactNode {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const host = canvas?.parentElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !host || !ctx) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const particles = makeParticles(count);
    const images: HTMLImageElement[] = [];

    let raf = 0;
    let running = false;
    let visible = false;
    let last = 0;
    let frames = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const {clientWidth: w, clientHeight: h} = host;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // 粒子是 8×8 像素画，放大必须保持硬边
      ctx.imageSmoothingEnabled = false;
    };

    const paint = (dt: number) => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      const t = performance.now() / 1000;
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        p.y -= (p.speed * dt) / h;
        if (p.y < -0.08) {
          // 循环回底部时横向挪一段，免得同一列来回反复
          p.y = 1.06;
          p.x = (p.x + 0.31) % 1;
        }
        const px = p.x * w + Math.sin(t * p.sway + p.x * 12) * 9;
        ctx.globalAlpha = p.alpha;
        ctx.drawImage(images[p.sprite], px, p.y * h, p.size, p.size);
      }
      ctx.globalAlpha = 1;
    };

    const tick = (now: number) => {
      if (!running) return;
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      paint(dt);
      frames += 1;
      // 每帧写 dataset 会白掉一次属性写入，攒 12 帧报一次足够取证
      if (frames % 12 === 0) canvas.dataset.frames = String(frames);
      raf = requestAnimationFrame(tick);
    };

    const start = () => {
      if (running || reduce.matches) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };

    const stop = () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    /** 收口：只有一个地方决定该不该跑。 */
    const sync = () => {
      if (visible && !document.hidden) start();
      else stop();
    };

    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries[0].isIntersecting;
        sync();
      },
      {threshold: 0},
    );

    const onVisibility = () => sync();

    const onResize = () => {
      resize();
      if (!running) paint(0.016);
    };

    let ready = 0;
    const settle = () => {
      ready += 1;
      if (ready !== SPRITES.length) return;
      resize();
      canvas.dataset.sprites = String(SPRITES.length);
      canvas.dataset.particles = String(particles.length);
      canvas.dataset.motion = reduce.matches ? 'reduced' : 'full';
      paint(0.016); // 首帧静态图：reduced-motion 下这就是最终画面
      observer.observe(host);
      sync();
    };

    SPRITES.forEach((src, index) => {
      const img = new Image();
      img.decoding = 'async';
      img.addEventListener('load', settle);
      img.addEventListener('error', settle);
      img.src = src;
      images[index] = img;
    });

    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      observer.disconnect();
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [count]);

  return <canvas ref={ref} className={styles.canvas} data-particles-layer aria-hidden="true" />;
}
