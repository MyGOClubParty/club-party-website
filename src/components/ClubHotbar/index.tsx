import type {CSSProperties, ReactNode} from 'react';
import Link from '@docusaurus/Link';

import {clubs} from '@site/src/data/clubs';
import styles from './styles.module.css';

/**
 * HUD 物品栏：社团的快速跳转。
 *
 * 从首页 `pages/index.tsx` 抽出来的（2026-10-16），因为文章里也要用同一块：后台文章讲首页那条
 * 物品栏时，直接嵌这个组件，而不是贴一张截图 —— 读者能真的点进去。抽出来之后**只有这一份**，
 * 首页与文章共用，几何、贴图、交互都不会两边跑偏。
 *
 * ## 几何
 *
 * 用原版 `hotbar.png` 当框。原版是 9 格（贴图 182×22：x=0 左黑边、x=1..180 九格、x=181 右黑边），
 * 这里**按社团数出格**、不留空格子 —— 所以框宽按 `1 + n×20 + 1` 推，右黑边另取贴图第 181 列
 * 补在右边缘（见 styles.module.css 的 `::after`）。格子几何照原版：第 i 格左上角 = 1 + i×20、
 * 格 20×20，整体放大 2 倍。
 *
 * `data-hotbar` / `data-slots` / `data-club-slot` 是给验收读的锚点（verify/site-check.cjs 会
 * 从 hotbar.png 的尺寸现推框宽与格距，对不上就红）。
 *
 * 底下那行提示的字色跟着主题走：`--hero-hint` / `--hero-shadow` 是首页 hero 定义的变量
 * （CSS 变量会继承，所以放在 hero 里时自动取到那一套）。文章里没有这两个变量，
 * 于是 CSS 里给了兜底值。
 */
export default function ClubHotbar(): ReactNode {
  return (
    <div className={styles.hotbar} data-hotbar>
      <div
        className={styles.hotbarFrame}
        data-slots={clubs.length}
        style={{'--slots': clubs.length} as CSSProperties}>
        {clubs.map((club, i) => (
          <Link
            key={club.slug}
            to={club.doc}
            className={styles.hotSlot}
            style={{'--i': i} as CSSProperties}
            data-club-slot={club.slug}>
            <img className={styles.hotIcon} src={club.logo} alt="" loading="lazy" decoding="async" />
            <span className={styles.hotName}>{club.name}</span>
          </Link>
        ))}
      </div>
      <p className={styles.hotHint}>点击格子进入各社团展位</p>
    </div>
  );
}
