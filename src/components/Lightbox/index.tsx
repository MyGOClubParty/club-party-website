import {useCallback, useEffect, useRef, type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import clsx from 'clsx';

import styles from './styles.module.css';

export interface LightboxProps {
  /** 画廊全部图片；空数组时调用方不应渲染本组件 */
  images: string[];
  /** 当前展示第几张（受控） */
  index: number;
  /** 图片说明，用于 aria-label 与角标文案 */
  alt: string;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

/**
 * 图片灯箱。
 *
 * - 通过 portal 挂到 `document.body`：`.card` 上有 `overflow: hidden`，
 *   就地渲染的话放大后的图会被父级裁掉。
 * - 只在打开后才渲染，因此 SSR/SSG 阶段不会碰到 `document`。
 * - Esc 关闭，←/→ 翻页，点击遮罩（而不是点图片/按钮）关闭。
 * - 打开期间锁 body 滚动，关闭时恢复原值（不写死 `''`，避免踩到别的组件）。
 */
export default function Lightbox({
  images,
  index,
  alt,
  onIndexChange,
  onClose,
}: LightboxProps): ReactNode {
  const count = images.length;
  const src = images[index];
  const closeRef = useRef<HTMLButtonElement>(null);

  const step = useCallback(
    (delta: number) => {
      if (count < 2) return;
      onIndexChange((index + delta + count) % count);
    },
    [count, index, onIndexChange],
  );

  // 键盘 + 滚动锁。依赖 step 会让监听器随 index 变化重装，但成本可忽略，
  // 换来的是回调里永远拿到最新的 index。
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      } else if (event.key === 'ArrowLeft') {
        step(-1);
      } else if (event.key === 'ArrowRight') {
        step(1);
      }
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose, step]);

  // 打开即把焦点交给关闭按钮，方便键盘用户立刻 Esc / Tab。
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return createPortal(
    <div
      className={styles.overlay}
      data-lightbox
      role="dialog"
      aria-modal="true"
      aria-label={`${alt} 大图`}
      onClick={(event) => {
        // 只有点中遮罩本身才关；点图片、点按钮都不关。
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <button
        ref={closeRef}
        type="button"
        className={clsx(styles.ctl, styles.close)}
        data-lightbox-close
        onClick={onClose}
        aria-label="关闭大图"
      >
        ×
      </button>

      {count > 1 && (
        <>
          <button
            type="button"
            className={clsx(styles.ctl, styles.prev)}
            data-lightbox-prev
            onClick={() => step(-1)}
            aria-label="上一张"
          >
            ‹
          </button>
          <button
            type="button"
            className={clsx(styles.ctl, styles.next)}
            data-lightbox-next
            onClick={() => step(1)}
            aria-label="下一张"
          >
            ›
          </button>
        </>
      )}

      <figure className={styles.stage}>
        <img
          className={clsx(styles.image, src.endsWith('.svg') && styles.pixelated)}
          data-lightbox-image
          src={src}
          alt={`${alt} 大图 ${index + 1}`}
        />
        <figcaption className={styles.caption}>
          <span>{alt}</span>
          {count > 1 && (
            <span className={styles.counter} data-lightbox-counter>
              {index + 1} / {count}
            </span>
          )}
        </figcaption>
      </figure>
    </div>,
    document.body,
  );
}
