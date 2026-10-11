/**
 * 草方块花圃：一条会横向流动的草方块带，上面种着从官方素材里挑的原版小花。
 *
 * 三个刻意的做法：
 * - 花的位置、摇摆周期全部写死在 `PLANTS` 里，不在渲染期取随机数。
 *   首页是 SSG 预渲染的，render 阶段一旦随机，水合时 DOM 就对不上。
 * - **一株花就是一格**：花的大小不写死在数据里，而是取 `--band`（一格 = 草带的整高，
 *   34px）。原版花贴图就是 16×16、占满一格，所以这里也不该有 30/36/42 这种参差 ——
 *   参差是贴图本身画出来的，不是靠缩放捏的。
 * - 花用 `clamp()` 夹在带子内侧，摇摆的旋转不会把花甩出视口 —— 420px 窄屏下
 *   不会多出一条横向滚动条。窄屏另外会藏掉一半的花，免得糊成一片。
 */

import type {CSSProperties, ReactNode} from 'react';

import styles from './styles.module.css';

interface Plant {
  /** static/mc/plants/<name>.png */
  name: string;
  /** 希望落点，百分数；实际会被 clamp 夹进安全区 */
  left: string;
  /** 摇摆动画延迟，错开免得整排一起晃 */
  delay: number;
  /** 摇摆一个来回的时长 */
  duration: number;
}

const PLANTS: Plant[] = [
  {name: 'short_grass', left: '3%', delay: 0, duration: 4.6},
  {name: 'poppy', left: '8%', delay: 0.5, duration: 5.4},
  {name: 'short_grass', left: '13%', delay: 1.1, duration: 5},
  {name: 'dandelion', left: '18%', delay: 0.3, duration: 5.8},
  {name: 'cornflower', left: '23%', delay: 1.6, duration: 5.2},
  {name: 'blue_orchid', left: '28%', delay: 0.8, duration: 6},
  {name: 'fern', left: '33%', delay: 2, duration: 4.8},
  {name: 'red_tulip', left: '39%', delay: 0.2, duration: 5.6},
  {name: 'azure_bluet', left: '44%', delay: 1.3, duration: 5.2},
  {name: 'pink_tulip', left: '50%', delay: 0.6, duration: 5.9},
  {name: 'short_grass', left: '55%', delay: 1.9, duration: 4.7},
  {name: 'oxeye_daisy', left: '60%', delay: 0.4, duration: 5.5},
  {name: 'allium', left: '65%', delay: 1.4, duration: 6.1},
  {name: 'lily_of_the_valley', left: '71%', delay: 0.9, duration: 5.3},
  {name: 'white_tulip', left: '76%', delay: 0.1, duration: 5.7},
  {name: 'short_grass', left: '81%', delay: 2.2, duration: 4.5},
  {name: 'orange_tulip', left: '87%', delay: 1, duration: 5.4},
  {name: 'fern', left: '94%', delay: 0.7, duration: 5.1},
];

export default function GrassGarden(): ReactNode {
  return (
    <div className={styles.garden} role="presentation" data-garden>
      <div className={styles.band} />
      <div className={styles.plants}>
        {PLANTS.map((p, i) => (
          <span
            key={`${p.name}-${i}`}
            className={styles.plant}
            style={
              {
                '--left': p.left,
                '--duration': `${p.duration}s`,
                animationDelay: `${p.delay}s`,
              } as CSSProperties
            }>
            <img src={`/mc/plants/${p.name}.png`} alt="" loading="lazy" decoding="async" />
          </span>
        ))}
      </div>
    </div>
  );
}
