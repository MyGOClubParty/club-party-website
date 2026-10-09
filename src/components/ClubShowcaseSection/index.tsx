import {useCallback, useEffect, useState, type ReactNode} from 'react';
import {Button, Tooltip} from '@iicemeta/minecraft-react-ui';

import ClubShowcase from '@site/src/components/ClubShowcase';
import {clubs as allClubs, type Club} from '@site/src/data/clubs';
import styles from './styles.module.css';

export interface ClubShowcaseSectionProps {
  clubs?: Club[];
  title?: string;
  description?: string;
}

/** Fisher–Yates 洗牌，返回新数组。 */
function shuffle<T>(input: readonly T[]): T[] {
  const out = input.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 社团风采展示区。
 *
 * 排序策略：**每次进入页面都重新随机排列**，因此不存在「哪个社团固定排第一」的问题。
 * SSR/SSG 阶段必须输出确定性的顺序（否则水合会不一致），所以首帧按原始顺序渲染，
 * 水合完成后（useEffect）立刻洗牌。
 */
export default function ClubShowcaseSection({
  clubs = allClubs,
  title = '社团风采',
  description = '七社联袂，各展风华。展示无分先后，每次刷新，都是一次全新的相遇。',
}: ClubShowcaseSectionProps): ReactNode {
  const [ordered, setOrdered] = useState<Club[]>(() => clubs.slice());
  const [shuffled, setShuffled] = useState(false);

  useEffect(() => {
    setOrdered(shuffle(clubs));
    setShuffled(true);
  }, [clubs]);

  const reshuffle = useCallback(() => {
    setOrdered((prev) => shuffle(prev));
  }, []);

  return (
    <section className={styles.section} aria-labelledby="clubs">
      <div className="container">
        <header className={styles.header}>
          <h2 id="clubs" className={styles.title}>
            {title}
          </h2>
          <p className={styles.desc}>{description}</p>
          <div className={styles.tools}>
            <span className={styles.hint} data-shuffled={shuffled ? 'yes' : 'no'}>
              {shuffled ? '本次顺序：随机排列' : '正在随机排列…'}
            </span>
            <Tooltip content="换一个顺序看看" placement="top">
              <Button variant="primary" onClick={reshuffle}>
                重新排列
              </Button>
            </Tooltip>
          </div>
        </header>

        <div className={styles.grid}>
          {ordered.map((club, i) => (
            <ClubShowcase key={club.slug} club={club} order={i + 1} total={ordered.length} />
          ))}
        </div>
      </div>
    </section>
  );
}
