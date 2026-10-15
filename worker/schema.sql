-- 活动报名表。
--
-- 本地模拟库：`npm run db:migrate:local`
-- 线上库（D1 `club-party-db`）：`npm run db:migrate:remote`（需要 Cloudflare 凭据）
--
-- 说明：
-- - `student_id` 唯一 —— 重复报名靠它挡住（应用层会先查一次给出好读的提示，这里是并发时的兜底）。
-- - `skin_key` 是 R2 里的对象键，命名规则 = Minecraft 游戏 id + 学号后两位 + ".png"；
--   NULL 表示这位同学没上传皮肤，展示时走站点内置的默认皮肤。
-- - `college` 与 `skin_source` / `littleskin_tid` **都排在最后，不是随手放这儿**：线上那张表
--   是靠 `ALTER TABLE ADD COLUMN` 补上的（见 migrate-add-college.sql、migrate-add-skin-source.sql），
--   而 SQLite 只能把新列追加到末尾。把新建表这条路也写成同样的列顺序，两条路得到的 schema
--   才逐列一致 —— 否则本地新库和线上老库会有一处只有 `PRAGMA table_info` 看得出来的差异，
--   日后对不上账。
-- - `skin_source` 记皮肤**是哪来的**：`'upload'` = 同学自己传的 PNG，`'littleskin'` = 填了 TID、
--   由服务端去 LittleSkin 取回来（见 worker/littleskin.ts）；空串 = 没提供皮肤，或者这条记录
--   早于这一列。名单页卡片下面那个标签就是照它分的：默认皮肤 / 手动上传 / LittleSkin。
--   （R2 对象的 customMetadata 里也留了一份 source/tid，那是「哪天想知道这文件哪来的」的留痕；
--   名单是公开接口、要一次列几十个人，逐个去 R2 问一遍既慢又会撞 subrequest 上限，所以再落一列。）
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
  college    TEXT    NOT NULL DEFAULT '',
  skin_source    TEXT NOT NULL DEFAULT '',
  littleskin_tid TEXT
);

CREATE INDEX IF NOT EXISTS idx_participants_created_at ON participants (created_at);
