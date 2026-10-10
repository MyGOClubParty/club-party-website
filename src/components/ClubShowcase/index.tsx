import {useEffect, useRef, useState, type CSSProperties, type ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import {Button, FlexBox, Tag, Tooltip} from '@iicemeta/minecraft-react-ui';

import Lightbox from '@site/src/components/Lightbox';
import {galleryOf, roleTone, type Club} from '@site/src/data/clubs';
import styles from './styles.module.css';

export interface ClubShowcaseProps {
  club: Club;
  /** 在本次随机排布中的位置（1-based），只用于展示，不参与排序语义 */
  order?: number;
  /** 卡片总数，用于展示 `03 / 07` 这类计数 */
  total?: number;
}

/**
 * 社团风采卡片（可复用）。
 *
 * - 图片：`images` 有 n 张时自动出现画廊（缩略图 + 上/下一张）；只有 1 张时退化为单图，不显示缩略图条；
 *   一张都没有时回落到 `cover`。新增/删除图片只需改 `src/data/clubs.json`。
 * - 占位图：路径以 `.svg` 结尾时自动挂「占位图」角标，换成真实照片（.jpg/.png）后角标自动消失。
 * - 缩放：[`styles.pixelated`] 只在占位 svg 上启用（`image-rendering: pixelated`，保住像素画的硬边）；
 *   真实照片走浏览器默认的平滑缩放。logo 一律 `object-fit: contain`，因为社团 logo 未必是正方形。
 * - 竖图：主图框固定 16:10（保证同行卡片等高），`cover` 对竖图会把上下裁掉，所以竖图自动改
 *   `object-fit: contain` 完整展示，空出来的两侧用同一张图的虚化衬底 `styles.backdrop` 填上。
 *   横竖由图片加载后的 naturalWidth/Height 判定，首帧恒按横图渲染以保证与 SSG 输出一致。
 * - 灯箱：点主图打开全屏大图（`Lightbox`，portal 到 body）；卡片里的 ‹ › 仍只翻卡内画廊，
 *   大图里的 ‹ › 翻的是同一份画廊，两边共用 `active`，关掉灯箱后卡片停在最后看的那张。
 */
export default function ClubShowcase({club, order, total}: ClubShowcaseProps): ReactNode {
  const gallery = galleryOf(club);
  const [active, setActive] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const coverRef = useRef<HTMLImageElement>(null);

  // 社团数据可能变化（热更新 / 增删图片），越界时回到第一张，避免空白。
  useEffect(() => {
    if (active >= gallery.length) {
      setActive(0);
    }
  }, [active, gallery.length]);

  const current = gallery[Math.min(active, gallery.length - 1)];
  const isPlaceholder = current.endsWith('.svg');
  const logoIsPlaceholder = club.logo.endsWith('.svg');
  const hasGallery = gallery.length > 1;

  // 横竖只能等图片真正加载完才知道（naturalWidth/Height），所以这里在挂载后判断。
  // 首帧必须与 SSG 输出的 HTML 完全一致，否则水合报错 —— 故初值恒为 false，测量放在 effect 里。
  // 竖图：`cover` 会把上下裁掉（如 X动漫联盟协会的海报，裁完只剩中间一条），改为 `contain` 完整展示。
  useEffect(() => {
    const img = coverRef.current;
    if (!img) return;
    const sync = () => {
      const {naturalWidth: w, naturalHeight: h} = img;
      if (!w || !h) return; // src 刚换、新图还没解码出来
      setPortrait(h > w);
    };
    img.addEventListener('load', sync);
    sync(); // 命中缓存时不会再触发 load，这里补一次
    return () => img.removeEventListener('load', sync);
  }, [current]);

  const step = (delta: number) => {
    setActive((i) => (i + delta + gallery.length) % gallery.length);
  };

  return (
    <article
      className={styles.card}
      data-club={club.slug}
      style={{'--club-accent': club.accent} as CSSProperties}
    >
      <header className={styles.head}>
        <div className={styles.logoBox}>
          <img
            className={clsx(styles.logo, logoIsPlaceholder && styles.pixelated)}
            src={club.logo}
            alt={`${club.name} logo`}
            width={48}
            height={48}
          />
        </div>
        <div className={styles.headText}>
          <FlexBox align="center" style={{gap: 8, flexWrap: 'wrap'}}>
            <h3 className={styles.name}>{club.name}</h3>
            <Tag className={clsx('Tag', styles[roleTone[club.role]])}>{club.roleLabel}</Tag>
          </FlexBox>
          <p className={styles.project}>展示项目：{club.project}</p>
        </div>
        {typeof order === 'number' && (
          <span className={styles.order} aria-hidden="true">
            {String(order).padStart(2, '0')}
            {typeof total === 'number' ? `/${String(total).padStart(2, '0')}` : ''}
          </span>
        )}
      </header>

      <figure className={styles.figure}>
        <div className={styles.frame} data-portrait={portrait ? 'true' : undefined}>
          {/* 竖图的衬底：同一张图放大 + 虚化 + 压暗，只用来填 contain 留下的左右空档，
              本身没有任何信息量，故 aria-hidden 且不接指针事件。横图直接 cover 铺满，不渲染它。 */}
          {portrait && (
            <span
              className={styles.backdrop}
              style={{backgroundImage: `url(${current})`}}
              aria-hidden="true"
            />
          )}
          {/* 主图包一层按钮：既拿到「点图放大」，又能被键盘 Tab 到、回车触发。
              卡片里的 ‹ › 是它的兄弟节点、位置更靠后，点上去不会误开灯箱。 */}
          <button
            type="button"
            className={styles.zoom}
            data-zoom
            onClick={() => setLightboxOpen(true)}
            aria-label={`放大查看 ${club.name} 风采图 ${active + 1}`}
          >
            <img
              ref={coverRef}
              className={clsx(
                styles.cover,
                portrait && styles.contain,
                isPlaceholder && styles.pixelated,
              )}
              data-cover
              src={current}
              alt={`${club.name} 风采图 ${active + 1}`}
              loading="lazy"
              decoding="async"
            />
          </button>
          {isPlaceholder && <span className={styles.phBadge}>占位图</span>}

          {hasGallery && (
            <>
              <button type="button" className={clsx(styles.nav, styles.navPrev)} onClick={() => step(-1)} aria-label="上一张">
                ‹
              </button>
              <button type="button" className={clsx(styles.nav, styles.navNext)} onClick={() => step(1)} aria-label="下一张">
                ›
              </button>
              <span className={styles.counter} data-counter>
                {active + 1} / {gallery.length}
              </span>
            </>
          )}

          {/* 灯箱没有天然的视觉暗示，hover/聚焦时给一句提示 */}
          <span className={styles.zoomHint} aria-hidden="true">
            点击放大
          </span>
        </div>

        {hasGallery && (
          <div className={styles.thumbs} role="tablist" aria-label={`${club.name} 风采图`}>
            {gallery.map((src, i) => (
              <button
                key={src}
                type="button"
                role="tab"
                aria-selected={i === active}
                aria-label={`第 ${i + 1} 张`}
                className={clsx(styles.thumb, i === active && styles.thumbActive)}
                data-thumb={i}
                onClick={() => setActive(i)}
              >
                <img
                  className={clsx(src.endsWith('.svg') && styles.pixelated)}
                  src={src}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              </button>
            ))}
          </div>
        )}
      </figure>

      <p className={styles.summary}>{club.summary}</p>

      <ul className={styles.tags}>
        {club.tags.map((t) => (
          <li key={t}>
            <Tag className="Tag_success">{t}</Tag>
          </li>
        ))}
      </ul>

      <footer className={styles.foot}>
        <Link className={styles.docLink} to={club.doc}>
          <Tooltip content={`查看 ${club.name} 的介绍`} placement="top">
            <Button variant="secondary">社团详情</Button>
          </Tooltip>
        </Link>
      </footer>

      {lightboxOpen && (
        <Lightbox
          images={gallery}
          index={Math.min(active, gallery.length - 1)}
          alt={`${club.name} 风采图`}
          onIndexChange={setActive}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </article>
  );
}
