import {Fragment, useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode} from 'react';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import {
  TURNSTILE_ACTION_ADMIN,
  loadTurnstileScript,
  turnstileSitekey,
} from '@site/src/components/turnstile';
import styles from './admin.module.css';

/**
 * 报名后台 —— 登录、看完整名单、改填错的信息、导出 CSV / TXT。
 *
 * ## 页面只做接口调用，判定全在服务端
 *
 * 这里没有一行「密码对不对」的判断：口令校验、签名 cookie、导出权限、可改哪些字段、
 * 学号撞不撞车，全在 `worker/admin.ts`。前端拿到的只有 `{user: "michael"}` 或 401 ——
 * 一条越权路径都没留。
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

/**
 * 能改的六个字段。
 *
 * 皮肤**不在这里改**：换皮肤要上传文件，而重报名那条路本来就走得通；后台只负责把填错的
 * 文字改对。`skin_key`（R2 对象名）也不会跟着改 —— 见 `worker/admin.ts` 的 `update`。
 */
type DraftKey = 'studentId' | 'name' | 'college' | 'className' | 'qq' | 'mcId';
type Draft = Record<DraftKey, string>;

const EDIT_FIELDS: ReadonlyArray<{key: DraftKey; label: string; hint?: string}> = [
  {key: 'studentId', label: '学号', hint: '10 位数字，唯一'},
  {key: 'name', label: '姓名'},
  {key: 'college', label: '学院'},
  {key: 'className', label: '班级'},
  {key: 'qq', label: 'QQ'},
  {key: 'mcId', label: 'Minecraft ID', hint: '字母、数字、下划线'},
];

const EMPTY_DRAFT: Draft = {studentId: '', name: '', college: '', className: '', qq: '', mcId: ''};

export default function Admin(): ReactNode {
  const [state, setState] = useState<State>({kind: 'checking'});
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** 正在编辑的那一行（原学号）；`null` = 没有在编辑。 */
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  /** 保存成功后的回执（比如「改了 college、qq」），与登录失败那类警告分开。 */
  const [saved, setSaved] = useState<string | null>(null);
  /** 正在确认删除的那一行（学号）；null = 没有在删。 */
  const [deleting, setDeleting] = useState<string | null>(null);
  /** 确认框里手输的学号 —— 与服务端那次校验一起构成「两道确认」。 */
  const [confirmText, setConfirmText] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
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

  const startDelete = (row: AdminRow) => {
    // 编辑与删除互斥：同一行同时摊开两张表单，容易点错
    setEditing(null);
    setDeleting(row.studentId);
    setConfirmText('');
    setDeleteError(null);
    setSaved(null);
  };

  const confirmDelete = async (row: AdminRow) => {
    // 前端这道只是体验：真正的兜底在服务端（body 里学号要写两遍且一致）
    if (deleteBusy || confirmText !== row.studentId) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const response = await fetch('/api/admin/participants', {
        method: 'DELETE',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({studentId: row.studentId, confirmStudentId: confirmText}),
      });
      const payload = (await response.json().catch(() => null)) as
        | {ok: true; studentId: string; skinDeleted: boolean}
        | {ok: false; message?: string}
        | null;
      if (!response.ok || !payload || !payload.ok) {
        setDeleteError(
          (payload && 'message' in payload && payload.message) || `删除失败（HTTP ${response.status}）`,
        );
        return;
      }
      setDeleting(null);
      setConfirmText('');
      setSaved(
        `已删除 ${row.mcId}（${row.studentId}）` +
          (payload.skinDeleted ? '，皮肤文件一并删掉了' : ''),
      );
      if (state.kind === 'ready') await loadRows(state.user);
    } catch {
      setDeleteError('网络异常，没删成');
    } finally {
      setDeleteBusy(false);
    }
  };

  const signOut = async () => {
    await fetch('/api/admin/logout', {method: 'POST'}).catch(() => undefined);
    setState({kind: 'anonymous'});
    setNotice('已退出');
  };

  /** 把这一行摊开成表单。改的是副本，点「保存」之前不碰服务端。 */
  const startEdit = (row: AdminRow) => {
    // 编辑与删除互斥，见 startDelete
    setDeleting(null);
    setEditing(row.studentId);
    setDraft({
      studentId: row.studentId,
      name: row.name,
      college: row.college,
      className: row.className,
      qq: row.qq,
      mcId: row.mcId,
    });
    setEditError(null);
    setSaved(null);
  };

  const saveEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing || saving) return;
    setSaving(true);
    setEditError(null);
    try {
      const response = await fetch('/api/admin/participants', {
        method: 'PATCH',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({originalStudentId: editing, ...draft}),
      });
      const payload = (await response.json().catch(() => null)) as
        | {ok: true; changed: string[]}
        | {ok: false; message?: string}
        | null;
      if (!response.ok || !payload || !payload.ok) {
        setEditError(
          (payload && 'message' in payload && payload.message) || `保存失败（HTTP ${response.status}）`,
        );
        return;
      }
      setEditing(null);
      setSaved(payload.changed.length ? `已保存：改了 ${payload.changed.join('、')}` : '没有改动');
      if (state.kind === 'ready') await loadRows(state.user);
    } catch {
      setEditError('网络异常，没保存成功');
    } finally {
      setSaving(false);
    }
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

              {saved ? (
                <p className={styles.saved} data-admin-saved>
                  {saved}
                </p>
              ) : null}

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
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.rows.map((row, index) => (
                        <Fragment key={row.studentId}>
                          <tr>
                            <td className={styles.dim}>{index + 1}</td>
                            <td className={styles.mono}>{row.studentId}</td>
                            <td>{row.name}</td>
                            <td>{row.college}</td>
                            <td>{row.className}</td>
                            <td className={styles.mono}>{row.qq}</td>
                            <td className={styles.mono}>{row.mcId}</td>
                            <td className={styles.dim}>{sourceLabel(row)}</td>
                            <td className={styles.dim}>{row.registeredAt}</td>
                            <td>
                              <div className={styles.rowActions}>
                                <button
                                  type="button"
                                  className={styles.editButton}
                                  data-admin-edit={row.studentId}
                                  aria-expanded={editing === row.studentId}
                                  onClick={() =>
                                    editing === row.studentId ? setEditing(null) : startEdit(row)
                                  }>
                                  {editing === row.studentId ? '收起' : '编辑'}
                                </button>
                                <button
                                  type="button"
                                  className={styles.deleteButton}
                                  data-admin-delete={row.studentId}
                                  aria-expanded={deleting === row.studentId}
                                  onClick={() =>
                                    deleting === row.studentId ? setDeleting(null) : startDelete(row)
                                  }>
                                  {deleting === row.studentId ? '收起' : '删除'}
                                </button>
                              </div>
                            </td>
                          </tr>
                          {/* 编辑表单摊在这一行下面，而不是弹窗：改的时候还能看见原值 */}
                          {editing === row.studentId ? (
                            <tr className={styles.editRow}>
                              <td colSpan={10}>
                                <form
                                  className={styles.editForm}
                                  onSubmit={saveEdit}
                                  data-admin-edit-form={row.studentId}>
                                  {EDIT_FIELDS.map((field) => (
                                    <label key={field.key} className={styles.editField}>
                                      <span className={styles.editLabel}>
                                        {field.label}
                                        {field.hint ? <em className={styles.editHint}>{field.hint}</em> : null}
                                      </span>
                                      <input
                                        className={styles.input}
                                        value={draft[field.key]}
                                        onChange={(event) =>
                                          setDraft((current) => ({
                                            ...current,
                                            [field.key]: event.target.value,
                                          }))
                                        }
                                        required
                                      />
                                    </label>
                                  ))}
                                  <div className={styles.editActions}>
                                    <button className={styles.submit} type="submit" disabled={saving}>
                                      {saving ? '保存中…' : '保存'}
                                    </button>
                                    <button
                                      className={styles.actionGhost}
                                      type="button"
                                      onClick={() => {
                                        setEditing(null);
                                        setEditError(null);
                                      }}>
                                      取消
                                    </button>
                                  </div>
                                  {editError ? <p className={styles.warn}>{editError}</p> : null}
                                  <p className={styles.hint}>
                                    改学号会撞号（它是唯一键）。
                                    <strong>皮肤文件不会跟着改名</strong> —— 想换皮肤请让同学重新报名。
                                  </p>
                                </form>
                              </td>
                            </tr>
                          ) : null}
                          {/* 删除确认：写清会删掉什么，并要求把学号再输一遍才点得动 */}
                          {deleting === row.studentId ? (
                            <tr className={styles.deleteRow}>
                              <td colSpan={10}>
                                <div className={styles.deleteBox} data-admin-delete-form={row.studentId}>
                                  <p className={styles.deleteWarn}>
                                    <strong>删了不能撤销。</strong>
                                    会删除：学号 {row.studentId}（{row.name}）· Minecraft ID {row.mcId}
                                    {row.skinKey ? ` · 皮肤文件 ${row.skinKey}` : ' · 没有皮肤文件'}
                                    。同学之后可以重新报名，但皮肤要重新上传。
                                  </p>
                                  <label className={styles.editField}>
                                    <span className={styles.editLabel}>
                                      把学号再输一遍确认
                                      <em className={styles.editHint}>输错一个字都点不动</em>
                                    </span>
                                    <input
                                      className={styles.input}
                                      value={confirmText}
                                      onChange={(event) => setConfirmText(event.target.value)}
                                      placeholder={row.studentId}
                                      inputMode="numeric"
                                      autoComplete="off"
                                    />
                                  </label>
                                  <div className={styles.editActions}>
                                    <button
                                      className={styles.deleteConfirm}
                                      type="button"
                                      disabled={deleteBusy || confirmText !== row.studentId}
                                      onClick={() => void confirmDelete(row)}>
                                      {deleteBusy ? '删除中…' : '永久删除'}
                                    </button>
                                    <button
                                      className={styles.actionGhost}
                                      type="button"
                                      onClick={() => {
                                        setDeleting(null);
                                        setConfirmText('');
                                        setDeleteError(null);
                                      }}>
                                      取消
                                    </button>
                                  </div>
                                  {deleteError ? <p className={styles.warn}>{deleteError}</p> : null}
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
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
