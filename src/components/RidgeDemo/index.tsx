import {useMemo, useState, type CSSProperties, type ReactNode} from 'react';
import {Button} from '@iicemeta/minecraft-react-ui';

import BlogDemo from '../BlogDemo';
import styles from './styles.module.css';

/**
 * 「土画在列上，还是画成一整块」—— 首页那座山的修法，做成可以切着看的。
 *
 * ## 这块在演示什么
 *
 * 一排起伏的山脊，两种画法、两种列宽，四个组合各说一件事：
 *
 * | | 列宽 = 一格 | 列宽 = 2.5 格 |
 * | --- | --- | --- |
 * | **土画在每一列上** | 看着没毛病 —— 最容易骗过自己的一档 | 每根柱子都从自己的左边缘重新铺贴图，错缝冒出来 |
 * | **一整块土体 + clip-path** | 无接缝 | 仍然无接缝（列宽根本影响不到它） |
 *
 * 第三格是全部意义所在：**接缝的根子不在列宽上，在「谁画土」上。** 现在首页的土体是一整块、
 * 只按轮廓切一刀，列（`.col`）退化成一把刻度尺 —— 只给轮廓折点定宽、把草色顶边钉在各自顶边上、
 * 给火把灯笼当锚点，自己一格土都不画。
 *
 * ## 那排黄线
 *
 * 舞台上那排细黄线是**诊断标尺**，不是装饰：它画的是「贴图每隔一格重新开始」的位置。
 * 用列画土时，每列各自从自己的左边缘重新开始，所以线距会在列与列之间突然变窄 —— 那就是接缝。
 * 一整块土体时线距全程均匀，一眼能看出相位是全局一致的。
 *
 * 列宽那一档是**故意夸张**的：真实站点里列宽 = 一格，而且土早已不画在列上，所以页面上看不到缝。
 * 当年是 36px 的列宽配 16px 的贴图（2.25 格），正是「列宽 2.5 格」这一档的处境。
 */
/** 示范用的小山脊：每列几格高。真站点用的是一百六十列 + 三条正弦波叠出来的轮廓数组。 */
const PROFILE = [2, 3, 3, 4, 3, 2, 3, 2];
const MAX_HEIGHT = Math.max(...PROFILE);
const TEXTURE = 16;

type Paint = 'columns' | 'mass';

/** 轮廓 → `clip-path: polygon(...)`：列宽变化它不用重算（百分比起作用）。 */
function ridgeClip(profile: readonly number[], max: number): string {
  const n = profile.length;
  const y = (h: number) => (1 - h / max) * 100;
  const points: string[] = ['0% 100%', `0% ${y(profile[0])}%`];
  profile.forEach((h, i) => {
    const x = ((i + 1) / n) * 100;
    points.push(`${x}% ${y(h)}%`);
    if (i < n - 1) points.push(`${x}% ${y(profile[i + 1])}%`);
  });
  points.push('100% 100%');
  return `polygon(${points.join(', ')})`;
}

const HINT: Record<string, string> = {
  'columns-1': '列宽正好一格，这么看没毛病 —— 这是最容易骗过自己的一档。',
  'columns-2.5':
    '列宽不是整数格了：每根柱子都从自己的左边缘重新铺贴图，接缝立刻冒出来（当年 36px ÷ 16px = 2.25 格，正是这一档）。',
  'mass-1': '土是一整块，贴图相位全局一致 —— 看不到任何竖向接缝。',
  'mass-2.5': '列宽改成 2.5 格，画面纹丝不动：列的宽窄已经影响不到土了。',
};

export default function RidgeDemo(): ReactNode {
  const [paint, setPaint] = useState<Paint>('columns');
  const [colw, setColw] = useState(1);

  const clipPath = useMemo(() => ridgeClip(PROFILE, MAX_HEIGHT), []);
  const key = `${paint}-${colw}`;

  return (
    <BlogDemo
      id="hero-ridge"
      title="山：土画在列上，还是画成一整块"
      hint="两排按钮，四个组合都点一遍"
      note={
        <>
          黄线是诊断标尺（贴图每隔一格重新开始的位置），不是装饰。整块土体那一档里，
          列只剩三件事：给出轮廓折点的宽度、把草色顶边钉在自己的顶边上、给火把灯笼当锚点。
        </>
      }>
      <div className={styles.controls}>
        <div className={styles.group}>
          <span className={styles.groupLabel}>土画在哪</span>
          <div className={styles.pair}>
            <Button
              variant={paint === 'columns' ? 'primary' : 'secondary'}
              data-paint="columns"
              onClick={() => setPaint('columns')}>
              每一列上
            </Button>
            <Button
              variant={paint === 'mass' ? 'primary' : 'secondary'}
              data-paint="mass"
              onClick={() => setPaint('mass')}>
              一整块 + 切轮廓
            </Button>
          </div>
        </div>
        <div className={styles.group}>
          <span className={styles.groupLabel}>列宽</span>
          <div className={styles.pair}>
            <Button
              variant={colw === 1 ? 'primary' : 'secondary'}
              data-colw="1"
              onClick={() => setColw(1)}>
              一格
            </Button>
            <Button
              variant={colw === 2.5 ? 'primary' : 'secondary'}
              data-colw="2.5"
              onClick={() => setColw(2.5)}>
              2.5 格
            </Button>
          </div>
        </div>
      </div>

      {/* --unit 是唯一比例基准：列宽、贴图平铺、草色顶边全部由它推出来（与首页一致） */}
      <div
        className={styles.stage}
        data-paint-active={paint}
        data-colw-active={colw}
        style={
          {
            '--unit': `${TEXTURE}px`,
            '--colw': colw,
            '--cols': PROFILE.length,
            '--maxh': MAX_HEIGHT,
          } as CSSProperties
        }>
        <div className={styles.hill}>
          {paint === 'mass' ? (
            <div className={styles.mass} data-mass style={{clipPath}} />
          ) : null}
          {/* 一整块土体时标尺也按同一条轮廓裁：线只在土上出现，不会飘到山脊上方的天空里 */}
          {paint === 'mass' ? (
            <span className={styles.ticks} data-ticks aria-hidden="true" style={{clipPath}} />
          ) : null}
          {PROFILE.map((blocks, i) => (
            <span
              key={i}
              className={styles.col}
              data-col
              style={{'--blocks': blocks} as CSSProperties}>
              {/* 土画在列上（当年）：每列各自从自己的左边缘起铺贴图 */}
              {paint === 'columns' ? <span className={styles.colDirt} /> : null}
              {paint === 'columns' ? (
                <span className={styles.colTicks} data-ticks aria-hidden="true" />
              ) : null}
              <span className={styles.colGrass} data-grass />
            </span>
          ))}
        </div>
      </div>

      <p className={styles.hint} data-ridge-hint={key}>
        {HINT[key]}
      </p>
    </BlogDemo>
  );
}
