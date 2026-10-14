-- 活动报名表。
--
-- 本地模拟库：`npm run db:migrate:local`
-- 线上库（D1 `club-party-db`）：`npm run db:migrate:remote`（需要 Cloudflare 凭据）
--
-- 说明：
-- - `student_id` 唯一 —— 重复报名靠它挡住（应用层会先查一次给出好读的提示，这里是并发时的兜底）。
-- - `college` **排在最后一列，不是随手放这儿**：线上那张表是靠 `ALTER TABLE ADD COLUMN`
--   补上的（见 migrate-add-college.sql），而 SQLite 只能把新列追加到末尾。把新建表这条路
--   也写成同样的列顺序，两条路得到的 schema 才逐列一致 —— 否则本地新库和线上老库会有一处
--   只有 `PRAGMA table_info` 看得出来的差异，日后对不上账。
-- - `skin_key` 是 R2 里的对象键，命名规则 = Minecraft 游戏 id + 学号后两位 + ".png"；
--   NULL 表示这位同学没上传皮肤，展示时走站点内置的默认皮肤。
-- - 学号与 QQ 属于个人信息，只在库里存，`/api/participants` 不查也不下发。
--   姓名与班级同理：名单页（「小伙伴们」）只展示 Minecraft ID 与学院。

CREATE TABLE IF NOT EXISTS participants (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT    NOT NULL UNIQUE,
  name       TEXT    NOT NULL,
  class_name TEXT    NOT NULL,
  qq         TEXT    NOT NULL,
  mc_id      TEXT    NOT NULL,
  skin_key   TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  college    TEXT    NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_participants_created_at ON participants (created_at);
