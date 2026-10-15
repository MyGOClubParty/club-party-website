/**
 * 皮肤的**来源**与它对应的那个标签 —— 名单卡片（`pages/participants.tsx`）与弹窗
 * （`components/SkinModal/`）共用这一份。
 *
 * ## 为什么要有它
 *
 * 原先卡片下面只分「自备皮肤 / 默认皮肤」两种。但「自备」底下其实是两条不同的路：
 * 同学自己传一张 PNG，或者填一个 LittleSkin 的 TID 让服务端去取（见 `worker/littleskin.ts`）。
 * 对看名单的人来说这两件事含义不同 —— 上传的是他本人的文件，LittleSkin 那张可能随时被作者
 * 改掉（我们是报名那一刻定格了一份副本）。所以要分开标。
 *
 * ## 三种（严格说是四种）取值
 *
 * - `!hasSkin` → **默认皮肤**：没提供皮肤，展示的是站点内置的那张。
 * - `'upload'` → **手动上传**：同学自己传的 PNG。
 * - `'littleskin'` → **LittleSkin**：填了 TID，服务端替他去取回来的。
 * - `hasSkin` 但来源是 `null` → **自备皮肤**：这条记录早于 `skin_source` 这一列
 *   （见 `worker/migrate-add-skin-source.sql`），库里没写下来源。**不猜**——那个时间点上
 *   上传与 TID 两条路都能走，猜成哪一种都是在编；笼统的「自备皮肤」是唯一如实的话。
 *   公测数据会在 2026-10-17 正式报名前清空，这一种在正式名单里不会出现。
 *
 * 卡片与弹窗都调这里，别各写各的 `hasSkin ? … : …`：同一个人的标签在两处必须一致。
 */

/** 服务端 `/api/participants` 给的那个词；`null` = 没记录来源（含「没提供皮肤」）。 */
export type SkinSource = 'upload' | 'littleskin' | null;

export type SkinBadge = {
  /** 标签上的字。 */
  label: string;
  /** 给 `title` 用的一句话：标签本身就俩字，鼠标停一下能看到它到底指什么。 */
  title: string;
};

export function skinBadge(hasSkin: boolean, source: SkinSource): SkinBadge {
  if (!hasSkin) {
    return {
      label: '默认皮肤',
      title: '这位同学没有提供皮肤，展示的是站点内置的默认皮肤',
    };
  }
  if (source === 'littleskin') {
    return {
      label: 'LittleSkin',
      title: '填了 LittleSkin 皮肤 TID，由服务端替他取回来（报名时定格了一份副本）',
    };
  }
  if (source === 'upload') {
    return {
      label: '手动上传',
      title: '同学自己上传的皮肤文件',
    };
  }
  return {
    label: '自备皮肤',
    title: '自备皮肤，但这条记录早于「皮肤来源」字段，没写下是上传的还是 LittleSkin 的',
  };
}
