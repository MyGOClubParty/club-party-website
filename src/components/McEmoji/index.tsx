import type {ReactNode} from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';

import styles from './styles.module.css';

/**
 * 原版贴图当 emoji 用。
 *
 * 站点里到处在放方块贴图（首页、报名页、页脚），唯独文章里没有 —— 写博客的时候只能画字符画。
 * 这个组件把 `static/mc/emoji/<name>.png` 当**行内图标**塞进正文：贴图本来就是 16×16 的像素画，
 * 一张 137–400 字节（`static/mc/emoji/` 里 75 张合计 91 KB，且都 `loading="lazy"`），
 * 比文章里塞截图便宜两个数量级。
 *
 * ## 为什么不是 `![](/mc/emoji/torch.png)`
 *
 * markdown 图片是块级的，夹在字里行间会换行、还会占满一行宽；这里要的是「字里的一颗火把」。
 * 所以宽度锁死 `1em`（跟着字号走）、`vertical-align` 微调到底线附近，并且**默认当场装饰**
 * （`aria-hidden`）—— 贴图是给眼睛看的，读屏软件念「火把图片」毫无意义。真要念名字就传 `label`。
 *
 * ## 名字从哪来
 *
 * 就是 `static/mc/emoji/` 里的文件名（不带 `.png`），资源由 `scripts/sync-mc-emoji.mjs`
 * 从 `minecraft-assets` 拷过来。名字写错不会报错，只会在控制台留一条 404 —— 所以
 * `verify/site-check.cjs` 会拿文章源码里的 `name=` 逐个比对目录，缺一张就红。
 */
export type McEmojiProps = {
  /** `static/mc/emoji/` 下的文件名（不带扩展名），如 `torch`、`written_book`。 */
  name: string;
  /** 真要念给读屏软件听时填（默认当纯装饰）。 */
  label?: string;
  /** 字号倍数，默认 1（跟正文字号一样高）。 */
  size?: number;
};

export default function McEmoji({name, label, size}: McEmojiProps): ReactNode {
  // 线上是非根路径部署（CF Pages 子路径）也能用，所以路径走 useBaseUrl 而不是写死 '/mc/...'
  const src = useBaseUrl(`/mc/emoji/${name}.png`);
  return (
    <img
      className={styles.emoji}
      src={src}
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      width={16}
      height={16}
      loading="lazy"
      decoding="async"
      style={size ? {width: `${size}em`, height: `${size}em`} : undefined}
      onError={() => {
        // 静默 404 是最难查的一类问题：图片没加载出来，页面上只是「少了一块」。
        // 生产环境也留着这条 —— 一行控制台，换一个当场可查的线索。
        console.warn(`[McEmoji] static/mc/emoji/${name}.png 不存在（名字要与文件名一致）`);
      }}
    />
  );
}
