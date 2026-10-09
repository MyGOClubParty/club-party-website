import React from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import {useThemeConfig} from '@docusaurus/theme-common';
import type {FooterLinkItem, MultiColumnFooter} from '@docusaurus/theme-common';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import styles from './styles.module.css';

/** 每个栏目标题前挂一块方块贴图，按栏目序号轮取 */
const COLUMN_BLOCKS = [
  'grass_block_top',
  'crafting_table_top',
  'bookshelf',
  'diamond_block',
  'emerald_block',
  'gold_block',
];

function FooterItem({item}: {item: FooterLinkItem}) {
  const className = styles.mcButton;

  if (item.html) {
    // eslint-disable-next-line react/no-danger
    return <li className={styles.item} dangerouslySetInnerHTML={{__html: item.html}} />;
  }
  if (item.to) {
    return (
      <li className={styles.item}>
        <Link className={className} to={item.to}>
          {item.label}
        </Link>
      </li>
    );
  }
  if (item.href) {
    return (
      <li className={styles.item}>
        <a className={className} href={item.href}>
          {item.label}
        </a>
      </li>
    );
  }
  return null;
}

/**
 * 用 Minecraft 素材重做页脚：
 * 草方块包边 + 深板岩底纹 + GUI 按钮贴图的链接（悬停换成 button_highlighted）。
 * 栏目内容仍来自 docusaurus.config.ts 的 themeConfig.footer.links。
 */
export default function Footer(): React.JSX.Element | null {
  const {footer} = useThemeConfig();
  const {siteConfig} = useDocusaurusContext();
  const {sourceCodeUrl, builtWith} = siteConfig.customFields as {
    sourceCodeUrl?: string;
    builtWith?: string;
  };

  if (!footer) {
    return null;
  }

  const {copyright} = footer;
  // 本站用的是「多栏」页脚形式：links = [{title, items}]
  const columns = (footer as MultiColumnFooter).links ?? [];

  return (
    <footer className={styles.footer} data-site-footer>
      <div className={styles.grassEdge} aria-hidden="true" />

      <div className={clsx('container', styles.inner)}>
        {columns.length > 0 && (
          <div className={styles.columns}>
            {columns.map((column, index) => (
              <div className={styles.column} key={column.title ?? index}>
                {column.title && (
                  <h2 className={styles.columnTitle}>
                    <img
                      className={styles.titleIcon}
                      src={`/mc/blocks/${COLUMN_BLOCKS[index % COLUMN_BLOCKS.length]}.png`}
                      alt=""
                      aria-hidden="true"
                    />
                    {column.title}
                  </h2>
                )}
                <ul className={styles.list}>
                  {(column.items ?? []).map((item, itemIndex) => (
                    <FooterItem item={item} key={itemIndex} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        <div className={styles.bottom}>
          <p className={styles.copyright}>
            {copyright}
            {builtWith ? ` ${builtWith}` : ''}
          </p>
          {sourceCodeUrl && (
            <p className={styles.sourceLine}>
              <a className={clsx(styles.mcButton, styles.sourceButton)} href={sourceCodeUrl}>
                Source Codes
              </a>
            </p>
          )}
        </div>
      </div>
    </footer>
  );
}
