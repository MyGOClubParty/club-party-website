import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import {Button, Input} from '@iicemeta/minecraft-react-ui';

import {SkinHead} from '@site/src/components/SkinViewer';
import {activity} from '@site/src/data/clubs';
import styles from './signup.module.css';

/** 皮肤上限 5 MB。这里只是**提前拦一下、省一次白跑的上传**，判定权在后端（worker/skin.ts）。 */
const MAX_SKIN_BYTES = 5 * 1024 * 1024;

const MC_ID_RE = /^[A-Za-z0-9_]{1,32}$/;
const STUDENT_ID_RE = /^\d{4,20}$/;

/**
 * LittleSkin 皮肤 TID 的形状，与 `worker/littleskin.ts` 的 `TID_RE` 必须一致。
 * 这里那份只决定「什么时候去问后端」，不构成校验 —— 真正的判定在后端。
 */
const TID_RE = /^\d{1,10}$/;

/** 输入停下来多久才去 LittleSkin 查一次。逐字符查等于每敲一位都打一次上游。 */
const TID_RESOLVE_DELAY = 450;

/**
 * Turnstile（人机校验）。
 *
 * - `TURNSTILE_SITEKEY` 是面板上那个 widget 的公开标识；
 * - 本地一律换成**官方测试 sitekey** —— 真实 sitekey 只在自己注册过的域名上出票，
 *   localhost / 局域网地址上会被直接拒掉。官方文档：[测试用 sitekey 与密钥]
 *   （https://developers.cloudflare.com/turnstile/troubleshooting/testing/）。
 *
 * 「算不算本地」按 `location.hostname` 判。这是**公开信息**，这么判没关系；但服务端
 * **不**用同一个判据去挑密钥（Host 头是客户端可控的，线上发个 `Host: localhost` 就能骗出
 * 「什么票都认」的测试密钥）—— 那边认的是 `npm run cf:dev` 的 `--var` / `wrangler secret`，
 * 见 worker/turnstile.ts 顶部。两边选的是两样东西，判据不同是故意的。
 */
const TURNSTILE_SITEKEY = '0x4AAAAAAEmcKHpkdTedZjS9';
const TURNSTILE_TEST_SITEKEY = '1x00000000000000000000AA';
/** 与 worker/turnstile.ts 的 `TURNSTILE_ACTION` 必须一致：服务端会拿它比对。 */
const TURNSTILE_ACTION = 'signup';
/** 本机预览的判据：localhost、回环、以及 RFC1918 的局域网地址（走 4023 隧道时是这个）。 */
const LOCAL_HOSTNAMES =
  /^(localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|0\.0\.0\.0|\[?::1\]?|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/;

/** `render=explicit`：widget 什么时候出现、出现在哪儿由我们说了算，不靠它自己扫 DOM。 */
const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/**
 * 只用得到这几个成员，没必要把官方的类型包拉进来（它也没有 d.ts 发布）。
 *
 * 这里**故意没有 `ready()`**。它不是「等 api.js 就绪」的通用姿势：官方只在
 * 「script 标签不带 async/defer」时才允许调它，否则它当场抛
 * `[Cloudflare Turnstile] Remove async/defer from the Turnstile api.js script tag
 * before using turnstile.ready()` —— widget 一个都不会出现（实测过：容器里
 * childElementCount 恒为 0）。动态插 script 时官方给的姿势是用 script 自己的
 * `onload`，也就是下面 `loadTurnstileScript()` 那个 promise 的 resolve 时机。
 */
type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
  getResponse: (widgetId?: string) => string | undefined;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * api.js 只在报名页加载（站里别的页面用不上）。
 *
 * 同一个 promise 复用，避免重复插 `<script>`；失败时把缓存清掉，重挂载（或切主题触发重渲）
 * 还有再来一次的机会。
 *
 * **不要给这张 script 加 `async`/`defer`**：加了 Turnstile 就拒绝 `turnstile.ready()`
 * （见上面 `TurnstileApi` 的说明）。动态插进来的 script 本来就是异步下载、不阻塞解析的，
 * `async = false` 只是把 `async` 属性摘掉（不写这个属性默认就是异步），没有任何代价。
 * 就绪信号用 `onload` —— 它触发时 api.js 已经执行完，`window.turnstile.render` 可以直接用。
 */
let turnstileScript: Promise<void> | null = null;
function loadTurnstileScript(): Promise<void> {
  if (turnstileScript) return turnstileScript;
  turnstileScript = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => {
      turnstileScript = null;
      reject(new Error('人机校验脚本加载失败'));
    };
    document.head.appendChild(script);
  });
  return turnstileScript;
}

/** widget 的三种状态：`loading` 期间允许提交（取不到票会就地提示），`error` 时禁掉按钮。 */
type TurnstileState = 'loading' | 'ready' | 'error';

type FieldName = 'studentId' | 'name' | 'className' | 'qq' | 'mcId';

const FIELDS: ReadonlyArray<{
  name: FieldName;
  label: string;
  placeholder: string;
  hint: string;
  /** 与后端 worker/register.ts 的校验保持一致，别让同学填完才被拒。 */
  maxLength: number;
  wide?: boolean;
}> = [
  {
    name: 'studentId',
    label: '学号',
    placeholder: '例如 20230012345',
    hint: '4–20 位数字，同一个学号只能报名一次',
    maxLength: 20,
  },
  {name: 'name', label: '姓名', placeholder: '真实姓名', hint: '用于活动核对', maxLength: 20},
  {
    name: 'className',
    label: '班级',
    placeholder: '例如 计算机科学与技术 2301',
    hint: '填到班级即可',
    maxLength: 40,
    wide: true,
  },
  {name: 'qq', label: 'QQ', placeholder: '5–12 位数字', hint: '后续通知用', maxLength: 12},
  {
    name: 'mcId',
    label: 'Minecraft 游戏 ID',
    placeholder: '例如 Steve',
    hint: 'Java 版 ID：字母、数字、下划线',
    maxLength: 32,
  },
];

type Status = 'idle' | 'sending' | 'done' | 'error';

type Registered = {
  name: string;
  className: string;
  mcId: string;
  hasSkin: boolean;
  skinKey: string | null;
  /** 皮肤来源：上传的文件、LittleSkin TID，或没传。 */
  skinSource: 'upload' | 'littleskin' | null;
  skinTid: string | null;
};

/**
 * TID 的解析状态。
 *
 * `ready` 里的 `url` 是本页 fetch 回来的 blob URL（**同源**，所以画布不受污染），
 * 换一个 TID 就要撤销一个，别让它一直挂在内存里。
 */
type TidPreview =
  | {state: 'idle'}
  | {state: 'checking'}
  | {state: 'ready'; url: string; name: string; model: string}
  | {state: 'error'; message: string};

/** 预览区当前展示的是哪一张皮肤 —— 两个来源共用一个位置，同一时刻只会有一个是活的。 */
type Preview = {source: 'upload' | 'littleskin'; url: string; label: string};

export default function Signup(): ReactNode {
  const [values, setValues] = useState<Record<FieldName, string>>({
    studentId: '',
    name: '',
    className: '',
    qq: '',
    mcId: '',
  });
  const [skin, setSkin] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [tid, setTid] = useState('');
  const [tidPreview, setTidPreview] = useState<TidPreview>({state: 'idle'});
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const [registered, setRegistered] = useState<Registered | null>(null);
  /** 「二选一」要能把文件输入清空 —— 受控组件的 value 是只读的，只能走 DOM。 */
  const fileRef = useRef<HTMLInputElement | null>(null);

  // ---- 人机校验（Turnstile）。widget 是命令式的，所以实例、容器都拿 ref 记着。
  const tsBox = useRef<HTMLDivElement | null>(null);
  const tsWidget = useRef<string | null>(null);
  const [tsState, setTsState] = useState<TurnstileState>('loading');
  const [tsError, setTsError] = useState('');
  /** 实际用了哪个 sitekey。挂到 DOM 上，测试（和排查问题时的人）不用猜。 */
  const [tsSitekey, setTsSitekey] = useState('');

  /**
   * 当前主题。**读 `data-theme`，不用 `useColorMode`**：那个 hook 要待在 `@theme/Layout`
   * 里面的 `<ColorModeProvider>` 之下，而页面组件本身在 provider 之外 —— 构建时报
   * 「Hook useColorMode is called outside the <ColorModeProvider>」直接炸 SSG。
   * 再说 `data-theme` 正是本站 CSS 判断主题用的东西，widget 跟着它走就等于跟着页面走。
   *
   * 初值在客户端渲染时现读一次（`<html data-theme>` 由 head 里的内联脚本先设好），
   * 这样 widget 一上来就是对的主题，不用先画错再改。
   */
  const [tsTheme, setTsTheme] = useState<'light' | 'dark'>(() =>
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark'
      ? 'dark'
      : 'light',
  );
  useEffect(() => {
    const read = () =>
      document.documentElement.dataset.theme === 'dark' ? ('dark' as const) : ('light' as const);
    const observer = new MutationObserver(() => setTsTheme(read()));
    observer.observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']});
    return () => observer.disconnect();
  }, []);

  /**
   * 装 widget。依赖 `tsTheme`：换主题要整块重挂 —— Turnstile 没有「改主题」的接口，
   * 只能 remove 再 render（代价是票要重取一次，managed 模式下基本是瞬间的事）。
   */
  useEffect(() => {
    const box = tsBox.current;
    if (!box) return;
    let disposed = false;

    function fail(error: unknown) {
      if (disposed) return;
      setTsState('error');
      setTsError(error instanceof Error ? error.message : String(error));
    }

    const sitekey = LOCAL_HOSTNAMES.test(window.location.hostname)
      ? TURNSTILE_TEST_SITEKEY
      : TURNSTILE_SITEKEY;
    setTsSitekey(sitekey);
    setTsState('loading');
    setTsError('');

    loadTurnstileScript()
      .then(() => {
        if (disposed || !box.isConnected) return;
        const api = window.turnstile;
        if (!api) throw new Error('人机校验脚本加载了但没挂上 API');
        try {
          tsWidget.current = api.render(box, {
            sitekey,
            action: TURNSTILE_ACTION,
            theme: tsTheme,
            // 票 5 分钟就过期。同学可能边填边想，让它自己换一张，
            // 别等人点了提交才发现票已经废了。
            'refresh-expired': 'auto',
            'refresh-timeout': 'auto',
            callback: () => {
              if (disposed) return;
              setTsState('ready');
              setTsError('');
            },
            'error-callback': (code: unknown) => {
              fail(code ? `错误码 ${String(code)}` : '校验没能完成');
            },
            'expired-callback': () => {
              if (disposed) return;
              setTsState('loading');
            },
          });
        } catch (error) {
          fail(error);
        }
      })
      .catch(fail);

    return () => {
      disposed = true;
      const api = window.turnstile;
      const id = tsWidget.current;
      if (api && id !== null) {
        try {
          api.remove(id);
        } catch {
          // widget 可能已经被移除了，忽略
        }
      }
      tsWidget.current = null;
    };
  }, [tsTheme]);

  // 选中的皮肤先在本机预览：blob URL 用完要撤销，不然每选一次泄一个
  const previewUrl = useMemo(() => (skin ? URL.createObjectURL(skin) : null), [skin]);
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  /**
   * 填了 TID 就顺带把皮肤取回来预览。
   *
   * 走的是站内的 `/api/skin-preview`（后端替我们去 LittleSkin 取），不是直接跨域拉图：
   * 跨域图会污染画布，`SkinHead` 与 3D 舞台都用不了。
   * 去抖 + `AbortController`：边打字边发请求既打上游也容易让旧响应盖掉新的。
   */
  useEffect(() => {
    const value = tid.trim();
    if (!value) {
      setTidPreview({state: 'idle'});
      return;
    }
    if (!TID_RE.test(value)) {
      setTidPreview({state: 'error', message: 'TID 只能是数字（皮肤详情页地址末尾那串）'});
      return;
    }

    const controller = new AbortController();
    let objectUrl: string | null = null;
    setTidPreview({state: 'checking'});

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/skin-preview?tid=${encodeURIComponent(value)}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {message?: string} | null;
          if (controller.signal.aborted) return;
          setTidPreview({
            state: 'error',
            message: payload?.message || `这张皮肤取不回来（HTTP ${response.status}），可以改成上传文件`,
          });
          return;
        }
        const blob = await response.blob();
        // 每个 await 之后都对一次：TID 可能已经又变了、清理也跑过了。
        // 这时再往下走会留下一个没人撤销的 blob URL，还会用旧 TID 的结果盖掉新状态。
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setTidPreview({
          state: 'ready',
          url: objectUrl,
          // 皮肤名可能是中文，后端用 encodeURIComponent 编过放进响应头
          name: decodeURIComponent(response.headers.get('x-skin-name') ?? ''),
          model: response.headers.get('x-skin-model') ?? '',
        });
      } catch {
        if (controller.signal.aborted) return;
        setTidPreview({
          state: 'error',
          message: '取皮肤时网络出错，请重试，或者改成上传皮肤文件',
        });
      }
    }, TID_RESOLVE_DELAY);

    return () => {
      clearTimeout(timer);
      controller.abort();
      // 上一个 TID 的预览图没用了：撤销掉，别让 blob 攒在内存里
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [tid]);

  /** 按后端的命名规则先把文件名算出来给同学看一眼：Minecraft ID + 学号后两位。 */
  const plannedKey =
    MC_ID_RE.test(values.mcId.trim()) && STUDENT_ID_RE.test(values.studentId.trim())
      ? `${values.mcId.trim()}${values.studentId.trim().slice(-2)}.png`
      : null;

  /** 预览区只有一个位置：文件优先（刚选完文件的当下最想看它），否则用 TID 那张。 */
  const preview: Preview | null = previewUrl
    ? {source: 'upload', url: previewUrl, label: skin?.name ?? ''}
    : tidPreview.state === 'ready'
      ? {
          source: 'littleskin',
          url: tidPreview.url,
          label: `LittleSkin #${tid.trim()} · ${tidPreview.name}（${tidPreview.model}）`,
        }
      : null;

  const setField = (name: FieldName) => (value: string) => {
    setValues((previous) => ({...previous, [name]: value}));
    if (status === 'error') {
      setStatus('idle');
      setMessage('');
    }
  };

  const pickSkin = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0] ?? null;
    if (picked && picked.size > MAX_SKIN_BYTES) {
      // 前端这一下只是为了不让同学白等一次上传，后端还会再量一遍真实字节数
      setFileError(`皮肤不能超过 5 MB（这个文件 ${(picked.size / 1024 / 1024).toFixed(2)} MB）`);
      setSkin(null);
      event.target.value = '';
      return;
    }
    setFileError('');
    setSkin(picked);
    // 两个来源二选一：选了文件就把 TID 清掉，免得提交时被后端按「两个都填」挡回来
    if (picked) setTid('');
  };

  const setTidValue = (value: string) => {
    setTid(value);
    // 反向的同一件事：开始填 TID 就取消已选的文件
    if (value.trim() && skin) {
      setSkin(null);
      setFileError('');
      if (fileRef.current) fileRef.current.value = '';
    }
    if (status === 'error') {
      setStatus('idle');
      setMessage('');
    }
  };

  /** 提交前取票。票是**一次性**的：用过或过期都得重取，所以失败之后还要 reset。 */
  const readToken = (): string => {
    const api = window.turnstile;
    const id = tsWidget.current;
    if (!api || id === null) return '';
    try {
      return (api.getResponse(id) ?? '').trim();
    } catch {
      return '';
    }
  };

  const resetWidget = () => {
    const api = window.turnstile;
    const id = tsWidget.current;
    if (!api || id === null) return;
    try {
      api.reset(id);
    } catch {
      // widget 可能已经被移除了，忽略；没 reset 成功就别把状态改成 loading，免得卡住
      return;
    }
    // 票是一次性的：reset 当场作废旧票，新票要等下一次回调才到手。这中间如果还挂着
    // `ready`，面板会写「校验已通过，可以提交了」，而 `readToken()` 读回来的是空串 ——
    // 提示跟事实相反，人点了提交只会拿到「没取到校验票」。回到 `loading`，等新票回调再翻回。
    setTsState('loading');
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === 'sending') return;

    // 先看有没有票。没有就不发请求 —— 服务端也会挡（403），但这一下能少一次白跑，
    // 而且能给出比「HTTP 403」像样的提示。
    const token = readToken();
    if (!token) {
      setStatus('error');
      setMessage('人机校验还没完成（没取到校验票），稍等一两秒或刷新页面后再提交');
      return;
    }

    setStatus('sending');
    setMessage('');

    const body = new FormData();
    for (const field of FIELDS) body.append(field.name, values[field.name].trim());
    if (skin) body.append('skin', skin);
    else if (tid.trim()) body.append('littleskinTid', tid.trim());
    // 字段名固定是 `cf-turnstile-response`（widget 自己那个隐藏输入也叫这个），
    // 服务端按同名取票 —— 改名字要改 worker/turnstile.ts。
    body.append('cf-turnstile-response', token);

    try {
      const response = await fetch('/api/register', {method: 'POST', body});
      const payload = (await response.json().catch(() => null)) as
        | {ok: true; participant: Registered}
        | {ok: false; message?: string}
        | null;
      if (response.ok && payload && payload.ok) {
        setStatus('done');
        setRegistered(payload.participant);
        return;
      }
      setStatus('error');
      setMessage(
        (payload && 'message' in payload && payload.message) ||
          `提交失败（HTTP ${response.status}），请稍后重试`,
      );
    } catch {
      setStatus('error');
      setMessage('网络异常，报名没有提交成功，请检查网络后重试');
    } finally {
      // 票一次性：不管成没成，下一次提交都得有一张新的
      resetWidget();
    }
  };

  return (
    <Layout
      title="活动报名"
      description={`${activity.fullName}的在线报名入口：填写学号、姓名、班级、QQ 与 Minecraft 游戏 ID，可自愿上传一张 5 MB 以内的皮肤，或直接填 LittleSkin 皮肤 TID。`}>
      <main className={styles.page} data-signup>
        <div className="container">
          <header className={styles.head}>
            <Heading as="h1" className={styles.title}>
              活动报名
            </Heading>
            <p className={styles.lead}>
              填写下面五项即可完成报名，提交后会出现在
              <Link to="/participants"> 小伙伴们 </Link>
              名单里。皮肤是可选的 —— 可以上传一张 PNG，也可以直接填 LittleSkin 的皮肤 TID
              让我们替你取；两样都不填的同学会穿上本站的默认皮肤。提交前有一道人机校验，
              通过就能提交了。
            </p>
          </header>

          <form onSubmit={submit} data-signup-form>
            <section className={styles.panel}>
              <Heading as="h2" className={styles.panelTitle}>
                <img src="/mc/blocks/crafting_table_top.png" alt="" aria-hidden="true" />
                基本信息
              </Heading>
              <div className={styles.grid}>
                {FIELDS.map((field) => (
                  <label
                    key={field.name}
                    className={clsx(styles.field, field.wide && styles.fieldWide)}>
                    <span className={styles.label}>{field.label}</span>
                    <Input
                      className={styles.input}
                      name={field.name}
                      value={values[field.name]}
                      placeholder={field.placeholder}
                      onChange={setField(field.name)}
                      autoComplete="off"
                      maxLength={field.maxLength}
                      data-field={field.name}
                    />
                    <span className={styles.hint}>{field.hint}</span>
                  </label>
                ))}
              </div>
            </section>

            <section className={styles.panel}>
              <Heading as="h2" className={styles.panelTitle}>
                <img src="/mc/blocks/stone.png" alt="" aria-hidden="true" />
                Minecraft 皮肤
                <span className={styles.optional}>（可选）</span>
              </Heading>

              <div className={styles.fileRow}>
                <input
                  ref={fileRef}
                  className={styles.fileInput}
                  type="file"
                  name="skin"
                  accept="image/png"
                  onChange={pickSkin}
                  data-field="skin"
                />
                <span className={styles.hint}>仅支持 PNG，最大 5 MB，建议 64x64</span>
              </div>

              {fileError ? (
                <p className={styles.hint} data-skin-error>
                  {fileError}
                </p>
              ) : null}

              <p className={styles.orRow}>
                <span>或者</span>
              </p>

              <label className={styles.field}>
                <span className={styles.label}>LittleSkin 皮肤 TID</span>
                <Input
                  className={styles.input}
                  name="littleskinTid"
                  value={tid}
                  placeholder="例如 855158"
                  onChange={setTidValue}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={10}
                  data-field="littleskinTid"
                />
                <span className={styles.hint}>
                  不想自己下载再上传的话，填皮肤详情页地址末尾那串数字就行（例如{' '}
                  <a href="https://littleskin.cn/skinlib" target="_blank" rel="noreferrer noopener">
                    littleskin.cn
                  </a>{' '}
                  的 <span className={styles.keyName}>/skinlib/show/855158</span>
                  ）。两种方式二选一，切换时另一项会自动清空。
                </span>
              </label>

              {tidPreview.state === 'checking' ? (
                <p className={styles.hint} data-skin-tid-state="checking">
                  正在向 LittleSkin 查这张皮肤…
                </p>
              ) : null}

              {tidPreview.state === 'error' ? (
                <p className={styles.hint} data-skin-tid-state="error" data-skin-tid-message={tidPreview.message}>
                  {tidPreview.message}
                </p>
              ) : null}

              {preview ? (
                <div className={styles.preview} data-skin-preview data-skin-source={preview.source}>
                  <span className={styles.previewFrame}>
                    <SkinHead skin={preview.url} className={styles.previewHead} />
                  </span>
                  <span className={styles.previewMeta}>
                    {preview.label}
                    <br />
                    将存为{' '}
                    <span className={styles.keyName} data-skin-key>
                      {plannedKey ?? '（填好学号与游戏 ID 后显示）'}
                    </span>
                  </span>
                </div>
              ) : null}
            </section>

            {/*
              人机校验。放在表单里、提交按钮之前 —— 它出的票要跟这份表单一起提交。
              `data-turnstile-state` / `data-turnstile-sitekey` 是给测试读的（也方便排查
              「本地到底用的哪个 sitekey」），状态本身不看 widget 的 iframe，看这几个属性。
            */}
            <section className={styles.panel} data-turnstile-panel>
              <Heading as="h2" className={styles.panelTitle}>
                <img src="/mc/items/trial_key.png" alt="" aria-hidden="true" />
                人机校验
              </Heading>
              <div
                className={styles.turnstileBox}
                ref={tsBox}
                data-turnstile
                data-turnstile-state={tsState}
                data-turnstile-sitekey={tsSitekey || undefined}
              />
              <p className={styles.hint} data-turnstile-hint>
                {tsState === 'ready'
                  ? '校验已通过，可以提交了。'
                  : tsState === 'error'
                    ? `校验没能加载（${tsError || '原因未知'}）。刷新页面可以重试；一直不行就找工作人员。`
                    : '正在加载校验，稍等一下…'}
              </p>
            </section>

            <div className={styles.actions}>
              <Button
                variant="primary"
                type="submit"
                disabled={status === 'sending' || tsState === 'error'}>
                {status === 'sending' ? '提交中…' : '提交报名'}
              </Button>
              <span className={styles.actionsNote}>
                学号与 QQ 只用于活动核对，不会出现在公开名单里；游戏 ID、姓名与班级会公开展示。
              </span>
            </div>

            {/* 提交结果。成功与失败各有一条，靠 data-signup-status 分辨 */}
            <p
              className={clsx(
                styles.status,
                status === 'error' && styles.statusError,
                status === 'done' && styles.statusDone,
              )}
              role="status"
              data-signup-status={status}
              data-signup-message={message || undefined}
              hidden={status !== 'error' && status !== 'done'}>
              {status === 'error' ? message : null}
              {status === 'done' && registered ? (
                <>
                  报名成功：<strong>{registered.name}</strong>（{registered.className} ·{' '}
                  {registered.mcId}）已加入名单
                  {registered.hasSkin ? (
                    registered.skinSource === 'littleskin' ? (
                      <>
                        ，皮肤取自 LittleSkin #{registered.skinTid}，存为{' '}
                        <span className={styles.keyName}>{registered.skinKey}</span>
                      </>
                    ) : (
                      <>
                        ，皮肤存为 <span className={styles.keyName}>{registered.skinKey}</span>
                      </>
                    )
                  ) : (
                    '；没有提供皮肤，展示时使用默认皮肤'
                  )}
                  。去<Link to="/participants">小伙伴们</Link>看看。
                </>
              ) : null}
            </p>
          </form>
        </div>
      </main>
    </Layout>
  );
}
