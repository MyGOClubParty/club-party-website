import {useEffect, useState, type ReactNode} from 'react';
import Link from '@docusaurus/Link';
import {Tag} from '@iicemeta/minecraft-react-ui';

import BlogDemo from '../BlogDemo';
import SkinModal from '../SkinModal';
import SkinViewer from '../SkinViewer';
import {skinBadge, type SkinSource} from '../skinSource';
import styles from './styles.module.css';

/**
 * 「小伙伴们」那一屏的原样搬进文章 —— 离屏舞台、2D 拓印、弹窗旋转，全是名单页那两个组件。
 *
 * ## 为什么这块值得嵌
 *
 * 它是整站最贵的一处（一个离屏 WebGL 舞台 + 每卡片一张 2D 画布 + 库里 8 种动作），
 * 也最难用文字讲清楚：讲「只在视口里跑动画」「上下文恒为 1」，不如让读者自己把鼠标按下去转一圈。
 * 所以文章里放的是**真组件**而不是截图：`SkinViewer`、`SkinModal`、`skinBadge()` 三份都是从
 * 名单页直接 import 的，卡片与弹窗的取景也共用 `components/skinPose.ts` 那一组标定常量 ——
 * 在文章里点开，和在名单页点开，看到的是同一个角度、同一套动作。
 *
 * ## 数据
 *
 * 走的是名单页同一个接口 `/api/participants`（只读公开字段：游戏 ID、学院、皮肤、来源），
 * 取前 `count` 位。接口读不回来（本地没起服务、线上崩了）或者还没人报名时，
 * 退到几张**明说是示例**的卡片 —— 空着一片黑比占位更让人以为坏了。
 *
 * 卡片上的 `data-participant` / `data-skin-source` / `data-skin-tag` 与名单页同名同义，
 * 验收断言读它们（`verify/site-check.cjs` 的博客段）。
 */
const DEFAULT_SKIN = '/img/skins/deepseek-npz.png';

type Person = {
  mcId: string;
  college: string;
  hasSkin: boolean;
  skinUrl: string | null;
  skinSource: SkinSource;
};

/** 名单为空时的占位：全部走默认皮肤，标签如实是「默认皮肤」。 */
const FALLBACK: Person[] = [
  {mcId: 'Steve', college: '示例学院', hasSkin: false, skinUrl: null, skinSource: null},
  {mcId: 'Alex', college: '示例学院', hasSkin: false, skinUrl: null, skinSource: null},
  {mcId: 'Rana', college: '示例学院', hasSkin: false, skinUrl: null, skinSource: null},
  {mcId: 'Miku', college: '示例学院', hasSkin: false, skinUrl: null, skinSource: null},
];

export type SkinGridDemoProps = {
  /** 最多展示几张（默认 6；窄屏靠 CSS 回落成两列）。 */
  count?: number;
};

export default function SkinGridDemo({count = 6}: SkinGridDemoProps): ReactNode {
  const [people, setPeople] = useState<Person[]>(FALLBACK);
  const [state, setState] = useState<'loading' | 'ready' | 'fallback'>('loading');
  const [peek, setPeek] = useState<Person | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch('/api/participants', {headers: {accept: 'application/json'}});
        const payload = (await response.json().catch(() => null)) as
          | {ok: true; participants: Person[]}
          | {ok: false}
          | null;
        if (cancelled) return;
        const list = payload?.ok ? payload.participants.slice(0, count) : [];
        if (list.length > 0) {
          setPeople(list);
          setState('ready');
          return;
        }
        setPeople(FALLBACK);
        setState('fallback');
      } catch {
        if (cancelled) return;
        setPeople(FALLBACK);
        setState('fallback');
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [count]);

  return (
    <BlogDemo
      id="skin-grid"
      title="三十秒体验一下名单页"
      hint="点任意一格放大，能拖着转"
      note={
        state === 'ready' ? (
          <>
            这是从 <code>/api/participants</code> 实时读回来的前 {people.length} 位同学，接的就是
            <Link to="/participants">小伙伴们</Link>那一页的接口。点开之后可以拖拽旋转、滚轮缩放，
            八个动作都能换。
          </>
        ) : (
          <>
            这会儿没读回名单（服务没起，或者还没人报名），下面是几张**示例卡**；正式报名一开始，
            这里就会换成真的同学。卡片、弹窗、取景用的都是名单页那套组件。
          </>
        )
      }>
      <ul className={styles.grid} data-skin-grid-state={state}>
        {people.map((person) => {
          const badge = skinBadge(person.hasSkin, person.skinSource);
          return (
            <li
              key={person.mcId}
              className={styles.card}
              data-participant={person.mcId}
              data-skin-source={person.skinSource ?? (person.hasSkin ? 'unknown' : 'none')}>
              <button
                type="button"
                className={styles.peek}
                data-skin-peek={person.mcId}
                onClick={() => setPeek(person)}
                aria-label={`放大查看 ${person.mcId} 的皮肤（可旋转缩放）`}>
                <SkinViewer
                  skin={person.skinUrl ?? DEFAULT_SKIN}
                  label={`${person.mcId} 的 Minecraft 皮肤`}
                />
                <span className={styles.peekHint} aria-hidden="true">
                  点击放大 · 可旋转缩放
                </span>
              </button>
              <div className={styles.meta}>
                <p className={styles.mcId}>{person.mcId}</p>
                {person.college ? <p className={styles.college}>{person.college}</p> : null}
              </div>
              <div className={styles.tags} title={badge.title} data-skin-tag={badge.label}>
                <Tag>{badge.label}</Tag>
              </div>
            </li>
          );
        })}
      </ul>

      {/* 关着也要挂在页面上：那块画布一旦卸载，WebGL 上下文就跟着没了（见 SkinModal 文件头）。 */}
      <SkinModal
        person={
          peek
            ? {
                mcId: peek.mcId,
                college: peek.college,
                hasSkin: peek.hasSkin,
                skinSource: peek.skinSource,
                skin: peek.skinUrl ?? DEFAULT_SKIN,
              }
            : null
        }
        onClose={() => setPeek(null)}
      />
    </BlogDemo>
  );
}
