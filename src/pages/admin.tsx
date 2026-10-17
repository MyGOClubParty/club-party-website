import {useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode} from 'react';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import {
  TURNSTILE_ACTION_ADMIN,
  loadTurnstileScript,
  turnstileSitekey,
} from '@site/src/components/turnstile';
import styles from './admin.module.css';

/**
 * 报名后台 —— 登录、看完整名单、导出 CSV / TXT。
 *
 * ## 页面只做三件事，判定全在服务端
 *
 * 这里没有一行「密码对不对」的判断：口令校验、签名 cookie、导出权限都在 `worker/admin.ts`。
 * 前端拿到的只有 `{user: "michael"}` 或 401 —— 一条越权路径都没留。
 *
 * ## 为什么导出用 `<a href>` 而不是 fetch + Blob
 *
 * `GET /api/admin/participants?format=csv` 同源、带 cookie，浏览器自己就会把它当下载处理，
 * 文件名由服务端的 `content-disposition` 决定。用 fetch 把几 MB 拉进内存再拼 Blob，
 * 只是多写二十行代码换同一个结果。
 *
 * ## 不放进导航
 *
 * 地址就是路由（`/admin`），导航与页脚都不指过来，`robots.txt` 也 Disallow 了它。
 * 后台不需要被发现。
 */

const TITLE = '报名后台';

type AdminRow = {
  studentId: string;
  name: string;
  college: string;
  className: string;
  qq: string;
  mcId: string;
  skinKey: string | null;
  skinSource: string | null;
  littleskinTid: string | null;
  registeredAt: string;
};

type State =
  | {kind: 'checking'}
  | {kind: 'anonymous'}
  | {kind: 'ready'; user: string; rows: AdminRow[]}
  | {kind: 'error'; message: string};

/** 皮肤来源的中文标签 —— 与后台导出的口径一致（服务端也有一份，两边都要改）。 */
function sourceLabel(row: AdminRow): string {
  if (row.skinSource === 'upload') return '上传';
  if (row.skinSource === 'littleskin') return 'LittleSkin';
  return row.skinKey ? '未记录' : '默认皮肤';
}

export default function Admin(): ReactNode {
  const [state, setState] = useState<State>({kind: 'checking'});
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** 人机校验 widget 的状态。`loading` 时允许提交（取不到票服务端会明说），`error` 时禁掉按钮。 */
  const [gateState, setGateState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [gateError, setGateError] = useState('');
  const gateBox = useRef<HTMLDivElement | null>(null);
  const gateWidget = useRef<string | null>(null);

  /** 票是一次性的：每次尝试之后都要重新出一张，否则第二次拿到的是「已过期」而不是「口令不对」。 */
  const resetGate = () => {
    if (gateWidget.current && window.turnstile) {
      window.turnstile.reset(gateWidget.current);
      setGateState('loading');
    }
  };

  /*
   * 渲染 widget。只在前端跑（`useEffect`），所以 SSR 那一帧输出的是一个空容器 ——
   * Docusaurus 会把这一页预渲染成静态 HTML，容器必须在 DOM 里、不能条件渲染掉，
   * 否则脚本回来时挂不上去。
   *
   * 依赖 `state.kind`：容器只出现在未登录那一支，登出之后要重新挂一次。
   */
  useEffect(() => {
    if (state.kind !== 'anonymous') return;
    const box = gateBox.current;
    if (!box) return;
    let disposed = false;

    const sitekey = turnstileSitekey();
    setGateState('loading');
    setGateError('');

    loadTurnstileScript()
      .then(() => {
        if (disposed || !box.isConnected) return;
        const api = window.turnstile;
        if (!api) throw new Error('人机校验脚本加载了但没挂上 API');
        gateWidget.current = api.render(box, {
          sitekey,
          action: TURNSTILE_ACTION_ADMIN,
          theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
          'refresh-expired': 'auto',
          'refresh-timeout': 'auto',
          callback: () => {
            if (disposed) return;
            setGateState('ready');
            setGateError('');
          },
          'error-callback': (code: unknown) => {
            if (disposed) return;
            setGateState('error');
            setGateError(code ? `校验没能完成（错误码 ${String(code)}）` : '校验没能完成');
          },
          'expired-callback': () => {
            if (disposed) return;
            setGateState('loading');
          },
        });
      })
      .catch((error: unknown) => {
        if (disposed) return;
        setGateState('error');
        setGateError(error instanceof Error ? error.message : '人机校验没能加载');
      });

    return () => {
      disposed = true;
      const api = window.turnstile;
      if (gateWidget.current && api) {
        api.remove(gateWidget.current);
        gateWidget.current = null;
      }
    };
  }, [state.kind]);

  const loadRows = useCallback(async (user: string) => {
    const response = await fetch('/api/admin/participants', {
      headers: {accept: 'application/json'},
      credentials: 'same-origin',
    });
    const payload = (await response.json().catch(() => null)) as
      | {ok: true; participants: AdminRow[]}
      | {ok: false; message?: string}
      | null;
    if (!response.ok || !payload || !payload.ok) {
      setState({
        kind: 'error',
        message:
          (payload && 'message' in payload && payload.message) || `读取名单失败（HTTP ${response.status}）`,
      });
      return;
    }
    setState({kind: 'ready', user, rows: payload.participants});
  }, []);

  // 一进来先问「我是谁」：cookie 有效就直接进后台，省一次手输
  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/admin/session', {headers: {accept: 'application/json'}});
        const payload = (await response.json().catch(() => null)) as
          | {ok: true; user: string | null}
          | null;
        if (payload?.ok && payload.user) {
          await loadRows(payload.user);
          return;
        }
      } catch {
        // 网络问题也当成「没登录」：反正下一次提交会说清楚
      }
      setState({kind: 'anonymous'});
    })();
  }, [loadRows]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice(null);
    // 票是一次性的：取一次、用一次。用完（不管成不成）都要 reset，见下面两个分支
    const turnstileToken =
      gateWidget.current && window.turnstile
        ? (window.turnstile.getResponse(gateWidget.current) ?? '').trim()
        : '';
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({password, turnstileToken}),
      });
      const payload = (await response.json().catch(() => null)) as
        | {ok: true; user: string}
        | {ok: false; message?: string}
        | null;
      if (!response.ok || !payload || !payload.ok) {
        setNotice(
          (payload && 'message' in payload && payload.message) || `登录失败（HTTP ${response.status}）`,
        );
        // 口令错、票过、被限流 —— 这一张票都已经用掉了，不换一张下次一定是「校验已过期」
        resetGate();
        return;
      }
      setPassword('');
      await loadRows(payload.user);
    } catch {
      setNotice('网络异常，没连上服务器');
      resetGate();
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await fetch('/api/admin/logout', {method: 'POST'}).catch(() => undefined);
    setState({kind: 'anonymous'});
    setNotice('已退出');
  };

  return (
    <Layout title={TITLE} description="活动报名后台：查看完整名单并导出。">
      <main className={styles.page} data-admin>
        <div className="container">
          <header className={styles.head}>
            <Heading as="h1" className={styles.title}>
              {TITLE}
            </Heading>
            <p className={styles.lead}>
              这里能看到完整的报名信息（学号、姓名、班级、QQ），也可以把名单导成 CSV 或 TXT。
              <strong>不要把这个地址发给参加活动的同学。</strong>
            </p>
          </header>

          {state.kind === 'checking' ? (
            <p className={styles.note} data-admin-state="checking">
              正在确认登录状态…
            </p>
          ) : null}

          {state.kind === 'anonymous' ? (
            <form className={styles.panel} onSubmit={submit} data-admin-state="anonymous">
              <label className={styles.label} htmlFor="admin-password">
                管理口令
              </label>
              <input
                id="admin-password"
                className={styles.input}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="输入你的口令"
                required
              />
              <div className={styles.turnstile} ref={gateBox} data-admin-turnstile />
              {gateState === 'error' ? <p className={styles.warn}>{gateError}</p> : null}
              <button
                className={styles.submit}
                type="submit"
                disabled={busy || password.length === 0 || gateState === 'error'}>
                {busy ? '验证中…' : '登录'}
              </button>
              {notice ? (
                <p className={styles.warn} data-admin-notice>
                  {notice}
                </p>
              ) : null}
              <p className={styles.hint}>
                口令由维护者分配。每次登录都会在服务端日志里留下时间和来源 IP —— 也就是说，
                <strong>谁登录过是可以查的</strong>。
              </p>
            </form>
          ) : null}

          {state.kind === 'error' ? (
            <div className={styles.panel} data-admin-state="error">
              <p className={styles.warn}>{state.message}</p>
              <button className={styles.submit} type="button" onClick={() => setState({kind: 'anonymous'})}>
                重新登录
              </button>
            </div>
          ) : null}

          {state.kind === 'ready' ? (
            <section data-admin-state="ready">
              <div className={styles.bar}>
                <p className={styles.who}>
                  当前登录：<strong data-admin-user>{state.user}</strong> · 共{' '}
                  <strong data-admin-count>{state.rows.length}</strong> 人
                </p>
                <div className={styles.actions}>
                  {/* 同源 GET + cookie，浏览器直接当下载处理；文件名由服务端的 content-disposition 定 */}
                  <a className={styles.action} href="/api/admin/participants?format=csv">
                    导出 CSV
                  </a>
                  <a className={styles.action} href="/api/admin/participants?format=txt">
                    导出 TXT
                  </a>
                  <button className={styles.actionGhost} type="button" onClick={() => void loadRows(state.user)}>
                    刷新
                  </button>
                  <button className={styles.actionGhost} type="button" onClick={() => void signOut()}>
                    退出
                  </button>
                </div>
              </div>

              {state.rows.length === 0 ? (
                <p className={styles.note}>还没有人报名。</p>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>学号</th>
                        <th>姓名</th>
                        <th>学院</th>
                        <th>班级</th>
                        <th>QQ</th>
                        <th>Minecraft ID</th>
                        <th>皮肤</th>
                        <th>报名时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.rows.map((row, index) => (
                        <tr key={row.studentId}>
                          <td className={styles.dim}>{index + 1}</td>
                          <td className={styles.mono}>{row.studentId}</td>
                          <td>{row.name}</td>
                          <td>{row.college}</td>
                          <td>{row.className}</td>
                          <td className={styles.mono}>{row.qq}</td>
                          <td className={styles.mono}>{row.mcId}</td>
                          <td className={styles.dim}>{sourceLabel(row)}</td>
                          <td className={styles.dim}>{row.registeredAt}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p className={styles.hint}>
                导出文件里另有两列：皮肤文件名与 LittleSkin TID。CSV 带 BOM，Excel 打开中文不会乱码。
              </p>
            </section>
          ) : null}
        </div>
      </main>
    </Layout>
  );
}
