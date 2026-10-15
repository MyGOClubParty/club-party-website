import {useCallback, useEffect, useState, type ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import {Button, Tag} from '@iicemeta/minecraft-react-ui';

import SkinViewer from '@site/src/components/SkinViewer';
import SkinModal from '@site/src/components/SkinModal';
import {skinBadge, type SkinSource} from '@site/src/components/skinSource';
import {activity} from '@site/src/data/clubs';
import styles from './participants.module.css';

/** 没有上传皮肤的同学统一穿这一张（需求指定的图，放在 static/img/skins/ 下）。 */
const DEFAULT_SKIN = '/img/skins/deepseek-npz.png';

type Participant = {
  /** 学院。可能是空串（早于这一列的记录），那就整行不显示，见下面卡片里的判断。 */
  college: string;
  mcId: string;
  hasSkin: boolean;
  skinUrl: string | null;
  /**
   * 皮肤来源：`'upload'` = 同学自己传的，`'littleskin'` = 填了 TID 由服务端取的，
   * `null` = 这条记录没写下来源（早于这一列）。卡片下面那个标签按它分，
   * 映射写在 `components/skinSource.ts`（弹窗用的是同一份，别在这儿另写一套）。
   */
  skinSource: SkinSource;
  registeredAt: string;
};

type State =
  | {kind: 'loading'}
  | {kind: 'error'; message: string}
  | {kind: 'ready'; participants: Participant[]};

export default function Participants(): ReactNode {
  const [state, setState] = useState<State>({kind: 'loading'});
  /** 正在放大查看的那个人；null = 弹窗关着。 */
  const [peek, setPeek] = useState<Participant | null>(null);

  const load = useCallback(async () => {
    setState({kind: 'loading'});
    try {
      const response = await fetch('/api/participants', {headers: {accept: 'application/json'}});
      const payload = (await response.json().catch(() => null)) as
        | {ok: true; participants: Participant[]}
        | {ok: false; message?: string}
        | null;
      if (!response.ok || !payload || !payload.ok) {
        setState({
          kind: 'error',
          message:
            (payload && 'message' in payload && payload.message) ||
            `名单读取失败（HTTP ${response.status}）`,
        });
        return;
      }
      setState({kind: 'ready', participants: payload.participants});
    } catch {
      setState({kind: 'error', message: '网络异常，名单没读回来'});
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const count = state.kind === 'ready' ? state.participants.length : null;

  return (
    <Layout
      title="小伙伴们"
      description={`${activity.fullName}的报名名单：用 Minecraft 皮肤查看器展示每位同学的皮肤（自己上传或取自 LittleSkin），没提供的统一穿默认皮肤。`}>
      <main className={styles.page} data-participants>
        <div className="container">
          <header className={styles.head}>
            <Heading as="h1" className={styles.title}>
              小伙伴们
            </Heading>
            <p className={styles.lead}>
              已经报名的同学都在这里
              {count !== null ? <>（<strong data-participant-count>{count}</strong> 人）</> : null}
              ，每人一格 3D 皮肤，都在原地走路。<strong>点任意一格</strong>可以放大查看 ——
              拖拽旋转、滚轮缩放，还能切动作、开自动旋转。卡片下面写着这张皮肤是哪来的
              （自己上传的 / 取自 LittleSkin / 默认皮肤）；还没提供皮肤的同学目前穿着默认皮肤，
              想换成自己的就去 <Link to="/signup">活动报名</Link> 补一份。
            </p>
            <Button variant="secondary" onClick={() => void load()}>
              重新读取
            </Button>
          </header>

          {state.kind === 'loading' ? (
            <p className={styles.note} data-participants-state="loading">
              正在读取名单…
            </p>
          ) : null}

          {state.kind === 'error' ? (
            <p
              className={clsx(styles.note, styles.noteError)}
              data-participants-state="error"
              data-participants-message={state.message}>
              {state.message}
            </p>
          ) : null}

          {state.kind === 'ready' && state.participants.length === 0 ? (
            <p className={styles.note} data-participants-state="empty">
              还没有人报名 —— 第一个填表的同学就能占到头一格。
            </p>
          ) : null}

          {state.kind === 'ready' && state.participants.length > 0 ? (
            <ul className={styles.grid} data-participants-state="ready">
              {state.participants.map((person) => {
                // 皮肤是哪来的：默认皮肤 / 手动上传 / LittleSkin（映射见 components/skinSource.ts，
                // 弹窗用的是同一个函数 —— 同一个人的标签在两处必须一致）
                const badge = skinBadge(person.hasSkin, person.skinSource);
                // `data-has-skin` 与 `data-skin-source` 都是给验收读的锚点（页面不依赖它们）。
                // 来源有四种取值：`upload` / `littleskin` / `unknown`（有皮肤但记录里没写来源）/
                // `none`（压根没皮肤）—— **不能拿 `hasSkin` 顶替**：「有皮肤」和「来源是哪条路」
                // 是两件事，混起来就验不了「上传的那张写的是『手动上传』」。
                return (
                  <li
                    key={`${person.mcId}-${person.registeredAt}`}
                    className={styles.card}
                    data-participant={person.mcId}
                    data-has-skin={person.hasSkin}
                    data-skin-source={person.skinSource ?? (person.hasSkin ? 'unknown' : 'none')}>
                    {/*
                      卡片即按钮：点开弹窗才能用鼠标任意旋转缩放。整张 3D 区做成一个真 button
                      （而不是给 li 挂 onClick），键盘能 Tab 到、回车能开，屏幕阅读器也有名字。
                      网格自身照旧只播走路、不转 —— 转着看是弹窗里的事。
                    */}
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
                      <p className={styles.mcId} data-participant-mcid>
                        {person.mcId}
                      </p>
                      {/*
                        游戏 ID 下面只写学院 —— 展示口径是主办方定的，姓名与班级不回传也不显示
                        （见 worker/participants.ts）。老记录这一栏是空串，那就整行不渲染：
                        空一行比写个「（未知）」更像坏了。
                      */}
                      {person.college ? (
                        <p className={styles.college} data-participant-college>
                          {person.college}
                        </p>
                      ) : null}
                    </div>
                    {/*
                      标签只有两个字，`title` 放在这个容器上（库的 Tag 只接 className 与 children，
                      透传不了 title）：鼠标停一下能看到「默认皮肤」到底指什么、LittleSkin 那张
                      是报名时定格的副本。`data-skin-tag` 是给验收读的锚点 —— 四种来源各对应一个词。
                    */}
                    <div className={styles.tags} title={badge.title} data-skin-tag={badge.label}>
                      <Tag>{badge.label}</Tag>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        {/*
          弹窗始终挂在页面上（关着时只是 CSS 隐藏）—— 里面那块画布一旦卸载，
          WebGL 上下文就跟着没了，再开一次就是又占一个名额。见 SkinModal 文件头。
        */}
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
      </main>
    </Layout>
  );
}
