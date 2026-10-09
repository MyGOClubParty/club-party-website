import {useEffect, useState, type CSSProperties, type ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import {Button, FlexBox, Tag, Tooltip} from '@iicemeta/minecraft-react-ui';

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
 */
export default function ClubShowcase({club, order, total}: ClubShowcaseProps): ReactNode {
  const gallery = galleryOf(club);
  const [active, setActive] = useState(0);

  // 社团数据可能变化（热更新 / 增删图片），越界时回到第一张，避免空白。
  useEffect(() => {
    if (active >= gallery.length) {
      setActive(0);
    }
  }, [active, gallery.length]);

  const current = gallery[Math.min(active, gallery.length - 1)];
  const isPlaceholder = current.endsWith('.svg');
  const hasGallery = gallery.length > 1;

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
          <img className={styles.logo} src={club.logo} alt={`${club.name} logo`} width={48} height={48} />
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
        <div className={styles.frame}>
          <img
            className={styles.cover}
            data-cover
            src={current}
            alt={`${club.name} 风采图 ${active + 1}`}
            loading="lazy"
            decoding="async"
          />
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
                <img src={src} alt="" loading="lazy" decoding="async" />
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
    </article>
  );
}
