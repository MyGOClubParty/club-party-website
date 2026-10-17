/**
 * 管理员后台 —— 登录、会话、名单查看与导出。
 *
 * ## 为什么不碰数据库
 *
 * 后台只**读** `participants`（那条 schema 2026-10-17 已冻结，见 PRELAUNCH.md §4）。
 * 「谁登录过」不落库，走两条现成的通道：
 *
 * 1. `console.log('[admin] ...')` → 开着的 Observability（`wrangler tail` 与仪表盘都能查）；
 * 2. 登录后页面顶部直接写着「当前登录：xxx」，导出文件名与响应头里也带同一份标识。
 *
 * 这样后台不需要任何新表、新 KV、新 D1 写操作 —— 上线期最不该动的就是库。
 *
 * ## 口令从哪来
 *
 * 线上 `wrangler secret put ADMIN_PASSWORDS`，格式**两种都认**：
 *
 *   michael:口令A|tom:口令B|tim:口令C     ← 推荐：名字写在前面，日志里能直接看出是谁
 *   michael|tom|tim                       ← 也认：每一项就是一条口令，标识取口令摘要前 8 位
 *   [michael, tom, tim]                   ← 方括号与逗号也认（会去掉括号、按逗号切）
 *
 * 第二种写法虽然能用，但日志里只会出现 `admin-3f9a1c2e` 这种摘要，**看不出是谁** —— 所以
 * 多管理员时请用第一种。
 *
 * ## 会话是一枚签名 cookie，服务端不存任何东西
 *
 * `cp_admin = base64url({name, exp}) + "." + HMAC-SHA256(payload)`，密钥由 `ADMIN_PASSWORDS`
 * 本身派生（`SHA-256("club-party-admin-session|" + 口令表)`）。所以：
 *
 * - 不需要再多一个 secret；
 * - **改口令 = 所有现有会话立刻失效**（这正是我们要的）；
 * - 服务端零状态，任何 isolate 都能验，不需要 KV。
 *
 * Cookie 是 `HttpOnly; SameSite=Strict`，本地（http）不带 `Secure`，线上（https）一定带 ——
 * 否则本地根本设不上这个 cookie，测不了。
 */

import {fail, json, methodNotAllowed} from './http';

/** 会话有效期：12 小时。活动当天够用，过夜就失效。 */
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const COOKIE_NAME = 'cp_admin';

type Admin = {name: string; password: string};

/**
 * 把 `ADMIN_PASSWORDS` 解析成若干条口令。
 *
 * 容错是刻意的：这个值是人手敲进 `wrangler secret put` 的，多一个空格、少一个括号都会让
 * 「所有管理员都登不进去」，而那种故障在现场极难查（页面只会说「口令不对」）。
 */
export function parseAdmins(raw: string | undefined): Admin[] {
  let text = (raw ?? '').trim();
  if (!text) return [];
  // 允许写成数组样子：`["a","b"]` / `[a, b]`
  if ((text.startsWith('[') && text.endsWith(']')) || (text.startsWith('(') && text.endsWith(')'))) {
    text = text.slice(1, -1);
  }
  const separator = text.includes('|') ? '|' : ',';
  const admins: Admin[] = [];
  for (const piece of text.split(separator)) {
    const item = piece.trim().replace(/^["'`]|["'`]$/g, '').trim();
    if (!item) continue;
    const at = item.indexOf(':');
    if (at > 0) {
      const name = item.slice(0, at).trim();
      const password = item.slice(at + 1).trim();
      if (name && password) {
        admins.push({name, password});
        continue;
      }
    }
    // 没写名字：整项当口令，标识稍后用摘要生成
    admins.push({name: '', password: item});
  }
  return admins;
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function digest(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

/**
 * 找出这条口令是谁的。返回 `null` = 不对。
 *
 * 比较是在**摘要**上做的，而且循环里**不提前 break**：不管命中第几个，花的时间都一样，
 * 免得有人用响应时间试出「口令表里有几个、命中的是不是第一个」。
 */
async function identify(
  password: string,
  admins: Admin[],
): Promise<{name: string; fingerprint: string} | null> {
  const given = await digest(password);
  let matched: {name: string; fingerprint: string} | null = null;
  for (const admin of admins) {
    const candidate = await digest(admin.password);
    let difference = 0;
    for (let index = 0; index < candidate.length; index += 1) {
      difference |= candidate.charCodeAt(index) ^ given.charCodeAt(index);
    }
    if (difference === 0) {
      matched = {name: admin.name || `admin-${candidate.slice(0, 8)}`, fingerprint: candidate.slice(0, 8)};
    }
  }
  return matched;
}

function base64url(text: string): string {
  return btoa(unescape(encodeURIComponent(text)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  return decodeURIComponent(escape(atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))));
}

async function sessionKey(env: Env): Promise<CryptoKey> {
  const material = `club-party-admin-session|${(env.ADMIN_PASSWORDS ?? '').trim()}`;
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
  return crypto.subtle.importKey('raw', raw, {name: 'HMAC', hash: 'SHA-256'}, false, ['sign', 'verify']);
}

async function signSession(env: Env, name: string): Promise<string> {
  const payload = base64url(JSON.stringify({name, exp: Date.now() + SESSION_TTL_MS}));
  const key = await sessionKey(env);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return `${payload}.${base64url(String.fromCharCode(...new Uint8Array(signature)))}`;
}

/** 验签 + 验过期。返回登录名，`null` = 没登录 / 过期 / 被改过。 */
async function verifySession(env: Env, token: string): Promise<string | null> {
  const at = token.lastIndexOf('.');
  if (at <= 0) return null;
  const payload = token.slice(0, at);
  try {
    const key = await sessionKey(env);
    const signature = new Uint8Array(
      [...fromBase64url(token.slice(at + 1))].map((char) => char.charCodeAt(0)),
    );
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      signature,
      new TextEncoder().encode(payload),
    );
    if (!valid) return null;
    const parsed = JSON.parse(fromBase64url(payload)) as {name?: unknown; exp?: unknown};
    if (typeof parsed.name !== 'string' || typeof parsed.exp !== 'number') return null;
    if (parsed.exp < Date.now()) return null;
    return parsed.name;
  } catch {
    return null;
  }
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    const at = trimmed.indexOf('=');
    if (at > 0 && trimmed.slice(0, at) === name) return trimmed.slice(at + 1);
  }
  return null;
}

function sessionCookie(value: string, maxAgeSeconds: number, secure: boolean): string {
  const parts = [`${COOKIE_NAME}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAgeSeconds}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/** 当前登录者；没登录返回 `null`。 */
async function currentUser(request: Request, env: Env): Promise<string | null> {
  const token = readCookie(request, COOKIE_NAME);
  if (!token) return null;
  return verifySession(env, token);
}

function clientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? 'unknown';
}

// ---------------------------------------------------------------------------
// 接口
// ---------------------------------------------------------------------------

async function login(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed('POST');

  const ip = clientIp(request);
  // 防爆破：同一个 IP 一分钟 10 次。教室/宿舍同一个出口 IP 也不会有十几个人同时试后台口令。
  const gate = await env.ADMIN_LOGIN_LIMIT.limit({key: `login:${ip}`});
  if (!gate.success) {
    return fail(429, 'too_many_attempts', '尝试太频繁了，请等一分钟再试');
  }

  let body: {password?: unknown};
  try {
    body = (await request.json()) as {password?: unknown};
  } catch {
    return fail(400, 'bad_json', '请求格式不对');
  }
  const password = typeof body.password === 'string' ? body.password : '';
  if (!password) return fail(400, 'password_missing', '请输入口令');

  const admins = parseAdmins(env.ADMIN_PASSWORDS);
  if (admins.length === 0) {
    // 这不是「口令不对」，是我们没配 —— 必须说清楚，否则维护者会一直以为自己记错了口令
    return fail(503, 'admin_unconfigured', '后台还没有配置口令，请联系维护者');
  }

  const who = await identify(password, admins);
  if (!who) {
    console.log(`[admin] login failed ip=${ip}`);
    return fail(401, 'bad_password', '口令不对');
  }

  console.log(`[admin] login ok user=${who.name} ip=${ip}`);
  const token = await signSession(env, who.name);
  const secure = new URL(request.url).protocol === 'https:';
  return json(
    {ok: true, user: who.name},
    {headers: {'set-cookie': sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000), secure)}},
  );
}

function logout(request: Request): Response {
  const secure = new URL(request.url).protocol === 'https:';
  return json(
    {ok: true},
    {headers: {'set-cookie': sessionCookie('', 0, secure)}},
  );
}

async function whoami(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  return json({ok: true, user});
}

/** 后台用的完整字段 —— 这套口径**只在这条路由上出现**，公开名单里一个都不给。 */
type AdminRow = {
  student_id: string;
  name: string;
  college: string;
  class_name: string;
  qq: string;
  mc_id: string;
  skin_key: string | null;
  skin_source: string;
  littleskin_tid: string | null;
  created_at: string;
};

const COLUMNS = [
  'student_id',
  'name',
  'college',
  'class_name',
  'qq',
  'mc_id',
  'skin_key',
  'skin_source',
  'littleskin_tid',
  'created_at',
] as const;

const HEADERS: Record<(typeof COLUMNS)[number], string> = {
  student_id: '学号',
  name: '姓名',
  college: '学院',
  class_name: '班级',
  qq: 'QQ',
  mc_id: 'Minecraft ID',
  skin_key: '皮肤文件',
  skin_source: '皮肤来源',
  littleskin_tid: 'LittleSkin TID',
  created_at: '报名时间',
};

function stamp(): string {
  // 导出文件名与文件头里的时间戳。用 UTC+8 手算：Worker 的时区恒为 UTC，而这份表格是给人看的。
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`
  );
}

/** CSV 的一个字段：含逗号 / 引号 / 换行就整体加引号，引号翻倍。 */
function csvCell(value: string | null): string {
  const text = value ?? '';
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function sourceLabel(row: AdminRow): string {
  if (row.skin_source === 'upload') return '上传';
  if (row.skin_source === 'littleskin') return 'LittleSkin';
  return row.skin_key ? '未记录' : '默认皮肤';
}

async function list(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return methodNotAllowed('GET');

  const user = await currentUser(request, env);
  if (!user) return fail(401, 'unauthorized', '请先登录');

  const url = new URL(request.url);
  const format = (url.searchParams.get('format') ?? 'json').toLowerCase();

  let rows: AdminRow[];
  try {
    const result = await env.DB.prepare(
      `SELECT ${COLUMNS.join(', ')} FROM participants ORDER BY created_at DESC, id DESC`,
    ).all<AdminRow>();
    rows = result.results ?? [];
  } catch (error) {
    console.error('[admin] query failed', error instanceof Error ? error.message : error);
    return fail(503, 'db_unavailable', '读不到报名数据，请稍后重试');
  }

  if (format === 'json' || format === '') {
    return json({
      ok: true,
      user,
      count: rows.length,
      participants: rows.map((row) => ({
        studentId: row.student_id,
        name: row.name,
        college: row.college,
        className: row.class_name,
        qq: row.qq,
        mcId: row.mc_id,
        skinKey: row.skin_key,
        skinSource: row.skin_source || null,
        littleskinTid: row.littleskin_tid,
        registeredAt: row.created_at,
      })),
    });
  }

  const suffix = `${stamp()}`;
  if (format === 'csv') {
    const lines = [COLUMNS.map((column) => HEADERS[column]).join(',')];
    for (const row of rows) {
      // 皮肤来源用中文标签导出 —— 拿到表格的人不用再去翻代码猜 `upload` 是什么
      lines.push(
        [
          csvCell(row.student_id),
          csvCell(row.name),
          csvCell(row.college),
          csvCell(row.class_name),
          csvCell(row.qq),
          csvCell(row.mc_id),
          csvCell(row.skin_key),
          csvCell(sourceLabel(row)),
          csvCell(row.littleskin_tid),
          csvCell(row.created_at),
        ].join(','),
      );
    }
    console.log(`[admin] export csv user=${user} rows=${rows.length}`);
    return new Response(`\uFEFF${lines.join('\r\n')}\r\n`, {
      headers: {
        // BOM 是给 Excel 的：没有它，Excel 打开中文会是一堆乱码
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="participants-${suffix}.csv"`,
        'cache-control': 'no-store',
      },
    });
  }

  if (format === 'txt') {
    const width = [12, 10, 16, 12, 14, 16, 26, 12, 14, 20];
    const cell = (value: string, index: number) => {
      // 中文字符占两格：按显示宽度补空格，表格在没有等宽中文字体的地方也能大致对齐
      const display = [...value].reduce((sum, char) => sum + (char.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
      return value + ' '.repeat(Math.max(1, width[index]! - display));
    };
    const lines = [
      `# 山商方块嘉年华 · 报名名单（${rows.length} 人）`,
      `# 导出时间 ${stamp()} · 导出人 ${user}`,
      '',
      COLUMNS.map((column, index) => cell(HEADERS[column], index)).join(''),
      COLUMNS.map((_, index) => '-'.repeat(width[index]!)).join(''),
    ];
    for (const row of rows) {
      const values = [
        row.student_id,
        row.name,
        row.college,
        row.class_name,
        row.qq,
        row.mc_id,
        row.skin_key ?? '',
        sourceLabel(row),
        row.littleskin_tid ?? '',
        row.created_at,
      ];
      lines.push(values.map((value, index) => cell(value, index)).join(''));
    }
    console.log(`[admin] export txt user=${user} rows=${rows.length}`);
    return new Response(`${lines.join('\n')}\n`, {
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'content-disposition': `attachment; filename="participants-${suffix}.txt"`,
        'cache-control': 'no-store',
      },
    });
  }

  return fail(400, 'bad_format', 'format 只支持 json / csv / txt');
}

/** `/api/admin/*` 的入口。 */
export async function handleAdmin(request: Request, env: Env): Promise<Response> {
  const {pathname} = new URL(request.url);
  if (pathname === '/api/admin/login') return login(request, env);
  if (pathname === '/api/admin/logout') return logout(request);
  if (pathname === '/api/admin/session') return whoami(request, env);
  if (pathname === '/api/admin/participants') return list(request, env);
  return fail(404, 'no_such_endpoint', '没有这个后台接口');
}
