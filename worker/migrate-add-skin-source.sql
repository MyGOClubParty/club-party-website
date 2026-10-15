-- 给**已经建好**的 participants 表补上 `skin_source` 与 `littleskin_tid` 两列（2026-10-15）。
--
-- 为什么要单独一份：`worker/schema.sql` 里全是 `CREATE TABLE IF NOT EXISTS`，表已经存在时
-- 它整句跳过 —— 也就是说对线上那张表跑 `npm run db:migrate:remote` 什么都不会发生，
-- 而 Worker 一旦开始 INSERT 这两列，老表就会报 `no such column: skin_source`。
-- SQLite 的 `ALTER TABLE ADD COLUMN` 又不支持 `IF NOT EXISTS`，所以升级路径只能是
-- 「单独几条语句、只跑一次」，这份文件就是那几条。
--
-- 这两列是干嘛的：名单卡片下面那个标签原先只有「自备皮肤 / 默认皮肤」两种，分不出
-- 「同学自己传的 PNG」和「填了 TID、服务端去 LittleSkin 取回来的」。R2 对象上其实留了
-- 痕迹（`customMetadata` 里的 `source` / `tid`），但名单是公开接口、要一次列几十个人，
-- 逐个去 R2 问一遍既慢又会撞 subrequest 上限 —— 所以把来源再落一列，读名单时顺手带出来。
--
-- 用法（每张已存在的库跑一次）：
--   npm run db:migrate:source:local    # 容器里的模拟库
--   npm run db:migrate:source:remote   # 线上 D1（需要 Cloudflare 凭据）
--
-- ⚠️ **顺序不能反**：线上要「先跑这次迁移，再部署新 Worker」。反过来的话，新 Worker 一
--    INSERT 就报 `no such column`，`/api/register` 与 `/api/participants` 会一起 503。
--
-- ⚠️ **老记录不会自动补出来**：`DEFAULT ''` 只保证「有一列且不为 NULL」，它不知道这条
--    记录当初是上传还是 LittleSkin。名单页遇到空串退回笼统的「自备皮肤」，不瞎猜。
--    真要对账就用 R2 那边的留痕，或者等本人下次更新：
--   UPDATE participants SET skin_source = 'littleskin', littleskin_tid = '<TID>' WHERE student_id = '<学号>';
--   （公测数据会在 2026-10-17 正式报名前清空，这一批老记录本来也不会留到那时候。）
--
-- 重复执行会报 `duplicate column name: skin_source`。这是**设计如此**：本文件是一次性的，
-- 那句话就是「已经升过了」的信号，不是需要修的错。

ALTER TABLE participants ADD COLUMN skin_source TEXT NOT NULL DEFAULT '';

ALTER TABLE participants ADD COLUMN littleskin_tid TEXT;
