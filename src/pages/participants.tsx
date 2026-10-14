import {useCallback, useEffect, useState, type ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import {Button, Tag} from '@iicemeta/minecraft-react-ui';

import SkinViewer from '@site/src/components/SkinViewer';
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
  registeredAt: string;
};

type State =
  | {kind: 'loading'}
  | {kind: 'error'; message: string}
  | {kind: 'ready'; participants: Participant[]};

export default function Participants(): ReactNode {
  const [state, setState] = useState<State>({kind: 'loading'});

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
      description={`${activity.fullName}的报名名单：用 Minecraft 皮肤查看器展示每位同学上传的皮肤，没上传的统一穿默认皮肤。`}>
      <main className={styles.page} data-participants>
        <div className="container">
          <header className={styles.head}>
            <Heading as="h1" className={styles.title}>
              小伙伴们
            </Heading>
            <p className={styles.lead}>
              已经报名的同学都在这里
              {count !== null ? <>（<strong data-participant-count>{count}</strong> 人）</> : null}
              ，每人一格 3D 皮肤。没有上传皮肤的同学暂时穿着默认皮肤，
              想换成自己的皮肤就去 <Link to="/signup">活动报名</Link> 补一份。
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
              {state.participants.map((person) => (
                <li
                  key={`${person.mcId}-${person.registeredAt}`}
                  className={styles.card}
                  data-participant={person.mcId}
                  data-has-skin={person.hasSkin}>
                  <SkinViewer
                    skin={person.skinUrl ?? DEFAULT_SKIN}
                    label={`${person.mcId} 的 Minecraft 皮肤`}
                  />
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
                  <div className={styles.tags}>
                    {person.hasSkin ? (
                      <Tag>自备皮肤</Tag>
                    ) : (
                      // 需求：没上传的一律用默认皮肤，这里如实标出来，别让人以为是同学自己的皮肤
                      <Tag>默认皮肤</Tag>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </main>
    </Layout>
  );
}
