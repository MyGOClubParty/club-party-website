/**
 * `POST /api/register` —— 活动报名，皮肤可选。
 *
 * 收 `multipart/form-data`（不用 JSON）：皮肤要跟报名表单一起提交，一个请求完成，
 * 走到这里的东西一律**重新验一遍**，前端做的事不作数。
 *
 * **人机校验（Turnstile）排在最前面**：没有票、票是编的、票过期了，都在这一道被挡住，
 * 后面那些事（取 LittleSkin 的图、写 D1、写 R2）一件都不做。见 worker/turnstile.ts。
 *
 * 皮肤有两个来源，二选一：
 * - 上传文件（`skin` 字段）；
 * - 填 LittleSkin 皮肤 TID（`littleskinTid` 字段）—— 由服务端去 LittleSkin 取回来
 *   （见 `worker/littleskin.ts`），同学不必自己下载再上传。
 *
 * 两个都给 → 400，不猜他要哪个（猜错等于把人家挑好的那张悄悄丢了）。
 * 拿到字节之后两条路**完全合并**：同一道 `inspectSkin` 闸门、同一条 R2 命名规则。
 * 但**来源要分开记**：`skin_source` 落 `'upload'` / `'littleskin'`，TID 另存 `littleskin_tid`
 * —— 名单页靠它把标签分成「手动上传 / LittleSkin」（见 worker/migrate-add-skin-source.sql）。
 *
 * 落库 / 落桶的顺序是刻意的：先写 D1（学号唯一，重复报名在这一步被挡住），
 * 再 put R2；R2 失败就把刚才那行删掉 —— 宁可没有记录，也不要留一条指向不存在对象的行。
 */

import {fail, json, methodNotAllowed} from './http';
import {skinBytesFromTid} from './littleskin';
import {verifyTurnstile} from './turnstile';
import {
  MC_ID_RE,
  MAX_BODY_BYTES,
  MAX_SKIN_BYTES,
  inspectSkin,
  readBodyCapped,
  skinKey,
} from './skin';

const MULTIPART = 'multipart/form-data';

/**
 * 学号是**本校的 10 位数字**（如 `2026010101`）。早先写成 `4–20` 位是为了宽容，
 * 但报名页的提示写着 10 位 —— 提示与实际判定不一致时，同学会照着提示填、然后被后端
 * 用另一套规则拒掉。两处只能是同一个数，所以收紧到这里，前端那份也同步（signup.tsx）。
 */
const STUDENT_ID_RE = /^\d{10}$/;
const QQ_RE = /^\d{5,12}$/;
/** 控制字符一律不收（换行、制表符塞进字段里会把后续展示弄乱）。 */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

type Registration = {
  studentId: string;
  name: string;
  college: string;
  className: string;
  qq: string;
  mcId: string;
};

type FieldResult = {ok: true; value: Registration} | {ok: false; message: string};

function text(form: FormData, key: string): string {
  const raw = form.get(key);
  return typeof raw === 'string' ? raw.trim() : '';
}

function parseRegistration(form: FormData): FieldResult {
  const studentId = text(form, 'studentId');
  const name = text(form, 'name');
  const college = text(form, 'college');
  const className = text(form, 'className');
  const qq = text(form, 'qq');
  const mcId = text(form, 'mcId');

  if (!STUDENT_ID_RE.test(studentId)) {
    return {ok: false, message: '请填写学号（10 位数字）'};
  }
  if (!name || name.length > 20 || CONTROL_CHARS.test(name)) {
    return {ok: false, message: '请填写姓名（1–20 个字）'};
  }
  if (!college || college.length > 40 || CONTROL_CHARS.test(college)) {
    return {ok: false, message: '请填写学院（1–40 个字，写全称）'};
  }
  if (!className || className.length > 40 || CONTROL_CHARS.test(className)) {
    return {ok: false, message: '请填写班级（1–40 个字）'};
  }
  if (!QQ_RE.test(qq)) {
    return {ok: false, message: '请填写 QQ 号（5–12 位数字）'};
  }
  if (!MC_ID_RE.test(mcId)) {
    return {ok: false, message: '请填写 Minecraft 游戏 ID（字母、数字、下划线，最长 32 位）'};
  }
  return {ok: true, value: {studentId, name, college, className, qq, mcId}};
}

export async function handleRegister(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed('POST');

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith(MULTIPART)) {
    return fail(415, 'bad_content_type', '报名接口只接受 multipart/form-data');
  }

  const body = await readBodyCapped(request, MAX_BODY_BYTES);
  if (!body.ok) {
    if (body.code === 'too_large') {
      return fail(
        413,
        'skin_too_large',
        `皮肤文件不能超过 ${MAX_SKIN_BYTES / 1024 / 1024} MB`,
      );
    }
    return fail(400, 'empty_body', '请求体是空的');
  }

  let form: FormData;
  try {
    form = await new Response(body.bytes, {headers: {'content-type': contentType}}).formData();
  } catch {
    return fail(400, 'bad_multipart', '表单解析失败，请重新提交');
  }

  // 「能不能进这个接口」排在「填得对不对」之前：票不对就不用往下走了，
  // 字段校验、取图、写库这些事一件都不做。
  const gate = await verifyTurnstile(request, env, form);
  if (!gate.ok) return fail(gate.status, gate.code, gate.message);

  const fields = parseRegistration(form);
  if (!fields.ok) return fail(400, 'invalid_field', fields.message);
  const {studentId, name, college, className, qq, mcId} = fields.value;

  // 皮肤是可选项，两个来源二选一：上传文件，或者填 LittleSkin TID。
  // （没选文件、或选了个空文件，都按「没上传」处理 —— 浏览器在用户取消选择后就是这个状态）
  const upload = form.get('skin');
  const hasFile = upload instanceof File && upload.size > 0;
  const tid = text(form, 'littleskinTid');
  if (hasFile && tid) {
    return fail(400, 'skin_conflict', '上传皮肤文件与 LittleSkin TID 只能填一个，请清掉其中一个再提交');
  }

  let skinBytes: Uint8Array | undefined;
  let skinFrom: 'upload' | 'littleskin' | null = null;
  let skinTid: string | null = null;
  /** 写进 R2 的留痕：日后想知道某张皮肤是从哪来的，看对象的自定义元数据即可。 */
  let skinMeta: Record<string, string> = {source: 'upload'};

  if (upload instanceof File && upload.size > 0) {
    // 第二道大小闸：这里量的是**解析出来的真实字节数**，跟请求头声明无关
    if (upload.size > MAX_SKIN_BYTES) {
      return fail(
        413,
        'skin_too_large',
        `皮肤文件不能超过 ${MAX_SKIN_BYTES / 1024 / 1024} MB（当前 ${(upload.size / 1024 / 1024).toFixed(2)} MB）`,
      );
    }
    const bytes = new Uint8Array(await upload.arrayBuffer());
    const inspected = inspectSkin(bytes);
    if (!inspected.ok) return fail(400, inspected.code, inspected.message);
    skinBytes = bytes;
    skinFrom = 'upload';
  } else if (tid) {
    // 去 LittleSkin 取：拿到什么算什么都由服务端定，客户端那个 TID 只是个查询键
    const fetched = await skinBytesFromTid(tid);
    if (!fetched.ok) return fail(fetched.status, fetched.code, fetched.message);
    skinBytes = fetched.bytes;
    skinFrom = 'littleskin';
    skinTid = fetched.skin.tid;
    skinMeta = {source: 'littleskin', tid: fetched.skin.tid, hash: fetched.skin.hash};
  }

  const key = skinBytes ? skinKey(mcId, studentId) : null;

  try {
    const duplicated = await env.DB.prepare('SELECT id FROM participants WHERE student_id = ?')
      .bind(studentId)
      .first();
    if (duplicated) {
      return fail(409, 'student_id_taken', '这个学号已经报名过了，不用重复提交');
    }
    if (key) {
      const clash = await env.DB.prepare('SELECT student_id FROM participants WHERE skin_key = ?')
        .bind(key)
        .first();
      if (clash) {
        return fail(
          409,
          'skin_key_taken',
          `皮肤文件名 ${key} 被占用了（同一个 Minecraft ID + 相同学号后两位），请联系工作人员处理`,
        );
      }
    }

    await env.DB.prepare(
      'INSERT INTO participants (student_id, name, college, class_name, qq, mc_id, skin_key, skin_source, littleskin_tid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      // 来源与 TID 跟皮肤一起入库：名单卡片下面那个标签要按它分「手动上传 / LittleSkin」，
      // 而且日后对账能查出这张皮肤是从哪个 TID 取的（R2 对象的 customMetadata 里也留了一份，
      // 但名单是公开接口、不能为了一个标签去逐个问 R2 —— 见 worker/migrate-add-skin-source.sql）。
      .bind(studentId, name, college, className, qq, mcId, key, skinFrom ?? '', skinTid)
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // UNIQUE 约束是并发下的兜底：上面那次 SELECT 挡不住两个请求同时进来
    if (message.includes('UNIQUE')) {
      return fail(409, 'student_id_taken', '这个学号已经报名过了，不用重复提交');
    }
    return fail(503, 'store_failed', '报名数据保存失败，请稍后重试');
  }

  if (key && skinBytes) {
    try {
      await env.SKINS.put(key, skinBytes, {
        httpMetadata: {contentType: 'image/png'},
        customMetadata: skinMeta,
      });
    } catch {
      await env.DB.prepare('DELETE FROM participants WHERE student_id = ?').bind(studentId).run();
      return fail(502, 'skin_store_failed', '皮肤上传失败，报名未保存，请稍后重试');
    }
  }

  return json(
    {
      ok: true,
      // 这份回执只发给刚提交的那个人自己（「报名成功：青木阳菜（金融学院 金融2601 · Rana）」），
      // 所以姓名/班级可以照原样回给他看。公开名单走的是另一条路，那边连字段都不查
      // —— 见 worker/participants.ts。
      participant: {
        name,
        college,
        className,
        mcId,
        hasSkin: Boolean(key),
        skinKey: key,
        // 皮肤是哪来的：报名页据此说明「已从 LittleSkin 取到」，也方便日后对账
        skinSource: skinFrom,
        skinTid,
      },
    },
    {status: 201},
  );
}
