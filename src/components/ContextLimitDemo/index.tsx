import {useState, type ReactNode} from 'react';
import {Button, Switch} from '@iicemeta/minecraft-react-ui';

import BlogDemo from '../BlogDemo';
import styles from './styles.module.css';

/**
 * 「浏览器只肯同时养 16 个 3D 绘图环境」——把名单页踩过的那个坑画出来。
 *
 * ## 这块是示意，但数字不瞎写
 *
 * 它**不会真的去创建 WebGL 上下文**（那正好是我们要避免的事，而且真撞上限会毁掉文章里其它
 * 演示的 3D 画面）。它只按真实规则算账，并把结果摊开：
 *
 * - Chrome 同时活着的上下文上限 **16**（超出后浏览器强行丢掉**最老的那个**，对应画布当场空白）；
 * - 当年每张卡片各建一个视图（`+1`），而且**初始化时还要探测一次 WebGL —— 探测本身就是建一个
 *   上下文**（`+1`），所以一张卡片两个名额；
 * - 于是 9 位同学就超了：18 个上下文，最老的两个被丢掉。
 *
 * 打开几档开关、加减几个人，能直接看到「共享一个舞台」为什么把这件事一次解决掉：
 * **上下文恒为 1，名单多长都撞不到上限。**
 *
 * 面板上的数字全部由 `cards` 与两个开关现算（`data-contexts-*` 上挂着结果），验收断言读那三个值。
 */
/** Chrome 同时活着的 WebGL 上下文上限。 */
const LIMIT = 16;
/** 初始名单人数：按当年的做法（每卡一个视图 + 一次探测）刚好越界。 */
const START_CARDS = 9;
const MAX_CARDS = 24;

export default function ContextLimitDemo(): ReactNode {
  const [cards, setCards] = useState(START_CARDS);
  const [shared, setShared] = useState(false);
  const [probe, setProbe] = useState(true);

  /** 每张卡片要占几个上下文名额：一个 3D 视图，外加一次探测（探测自己就建了一个上下文）。 */
  const perCard = 1 + (probe ? 1 : 0);
  const total = shared ? 1 : cards * perCard;
  const live = Math.min(total, LIMIT);
  const dropped = Math.max(0, total - LIMIT);
  /** 老卡片先被丢掉：前 `dropped` 张的上下文已经不在了，画布是空白。 */
  const blanks = shared ? 0 : Math.min(dropped, cards);

  return (
    <BlogDemo
      id="skin-contexts"
      title="同时能养几个 3D 视图"
      hint="加减人数、切开关看看"
      note={
        <>
          示意：这里不真的去创建 WebGL 上下文（那会毁掉文章里其它演示），只按真实规则算账 ——
          上限 {LIMIT} 个、超出丢掉<b>最老的那一个</b>。每张卡片的两个名额来自「一个 3D 视图」
          加上「初始化时探测一次 WebGL」，而探测本身就是建一个上下文。
        </>
      }>
      <div className={styles.controls}>
        <div className={styles.group}>
          <span className={styles.label}>名单人数</span>
          <div className={styles.counter}>
            <Button variant="secondary" data-cards-remove="" onClick={() => setCards((n) => Math.max(1, n - 1))}>
              −
            </Button>
            <span className={styles.count} data-cards-value="">
              {cards}
            </span>
            <Button variant="secondary" data-cards-add="" onClick={() => setCards((n) => Math.min(MAX_CARDS, n + 1))}>
              ＋
            </Button>
          </div>
        </div>

        <div className={styles.group}>
          <span className={styles.label}>3D 视图</span>
          <Button
            variant={shared ? 'primary' : 'secondary'}
            data-shared=""
            onClick={() => setShared((v) => !v)}>
            {shared ? '共用一个舞台 ✓' : '每张卡片各建一个'}
          </Button>
        </div>

        <label className={styles.group}>
          <span className={styles.label}>初始化时探测 WebGL</span>
          <Switch
            value={probe}
            onChange={setProbe}
            disabled={shared}
            aria-label="每张卡片初始化时探测一次 WebGL"
            data-probe=""
          />
        </label>

        <Button
          variant="secondary"
          data-reset=""
          onClick={() => {
            setCards(START_CARDS);
            setShared(false);
            setProbe(true);
          }}>
          重置
        </Button>
      </div>

      <div className={styles.meters}>
        <span className={styles.meter} data-contexts-total={total}>
          已创建 <b>{total}</b> 个
        </span>
        <span className={styles.meter} data-contexts-live={live} data-over={live >= LIMIT ? 'yes' : 'no'}>
          活着 <b>{live}</b> / 上限 {LIMIT}
        </span>
        <span className={styles.meter} data-contexts-dropped={dropped} data-over={dropped > 0 ? 'yes' : 'no'}>
          被丢掉 <b>{dropped}</b>
        </span>
      </div>

      {/* 一屏卡片：活着的有石头底纹，被丢掉的就是一片空白（当年读者看到的样子） */}
      <ul className={styles.cards} data-mode={shared ? 'shared' : 'per-card'}>
        {Array.from({length: cards}, (_, i) => {
          const blank = i < blanks;
          return (
            <li
              key={i}
              className={styles.card}
              data-card={blank ? 'blank' : 'live'}
              aria-label={blank ? '这张卡片的画布已经空白' : '正常显示'}>
              {blank ? <span className={styles.blankMark} aria-hidden="true" /> : null}
            </li>
          );
        })}
      </ul>

      <p className={styles.verdict} data-verdict={shared ? 'shared' : dropped > 0 ? 'over' : 'ok'}>
        {shared
          ? `共用一个离屏舞台：上下文恒为 1 个，${cards} 张卡片各自把渲染结果拓印到自己的 2D 画布上 —— 名单再长也撞不到上限。`
          : dropped > 0
            ? `${cards} 张卡片已经用掉 ${total} 个名额，超出 ${LIMIT} 的 ${dropped} 个最老的被浏览器丢掉 —— 带头那几张卡片就是一片空白。`
            : `${cards} 张卡片用掉 ${total} 个名额，还在 ${LIMIT} 以内，看着一切正常 —— 再加几个人就超了。`}
      </p>
    </BlogDemo>
  );
}
