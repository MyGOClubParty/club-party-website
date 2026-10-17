/**
 * 报名表单的字段校验 —— **唯一权威**。
 *
 * 两条路都要用：报名（`worker/register.ts`）与后台编辑（`worker/admin.ts`）。规则分叉的后果
 * 很具体 —— 会出现「报名时收得下的值，后台改不回去」，或者反过来把非法值写进库里。
 * 所以这里只放一份，两边都调它。
 *
 * 学号是**本校的 10 位数字**（如 `2026010101`）。早先写成 `4–20` 位是为了宽容，但报名页的提示
 * 写着 10 位 —— 提示与实际判定不一致时，同学会照着提示填、然后被后端用另一套规则拒掉。
 * 三处（DOM 的 maxLength、FIELDS 声明、这里的正则）只能是同一个数。
 */

import {MC_ID_RE} from './skin';

export type Registration = {
  studentId: string;
  name: string;
  college: string;
  className: string;
  qq: string;
  mcId: string;
};

export type FieldResult = {ok: true; value: Registration} | {ok: false; message: string};

/** 学号：本校 10 位数字。 */
export const STUDENT_ID_RE = /^\d{10}$/;

/** QQ：5–12 位数字。 */
const QQ_RE = /^\d{5,12}$/;

/** 控制字符一律不收（换行、制表符塞进字段里会把后续展示弄乱）。 */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * 逐字段校验。入参宽松（`Partial`）是有意的：调用方从表单或 JSON 里捡字段，
 * 缺哪个都当作空串处理，报错文案里会说该填什么，而不是抛一个类型错。
 */
export function validateRegistration(
  raw: Partial<Record<keyof Registration, string>>,
): FieldResult {
  const studentId = (raw.studentId ?? '').trim();
  const name = (raw.name ?? '').trim();
  const college = (raw.college ?? '').trim();
  const className = (raw.className ?? '').trim();
  const qq = (raw.qq ?? '').trim();
  const mcId = (raw.mcId ?? '').trim();

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
