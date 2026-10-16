import {useEffect, useRef, useState, type ChangeEvent, type ReactNode} from 'react';
import {Button, Input, Tag} from '@iicemeta/minecraft-react-ui';

import BlogDemo from '../BlogDemo';
import {SkinHead} from '../SkinViewer';
import {skinBadge, type SkinSource} from '../skinSource';
import styles from './styles.module.css';

/**
 * 报名页那两件事，搬进文章里给你按：**皮肤会存成什么名字**、**最后会标成哪一类**。
 *
 * ## 命名规则
 *
 * 「游戏 ID + 学号后两位」——同一个 `slice(-2)` 就在报名页里（`pages/signup.tsx` 的
 * `previewName`），这里照抄规则、不另发明一份：`Rana` + 学号 `2026010101` → `Rana01.png`。
 * 提前看得见名字，是为了避免「上传半天不知道自己选对文件没有」。
 *
 * ## 选一张本地图看看
 *
 * 文件选择框里挑一张 PNG，**头像立刻出来** —— 走的是 `URL.createObjectURL` 与名单页同一个
 * `SkinHead`（从 64×64 图集里精确裁出头部 + 帽子层）。整个过程**不出这台设备**：不传服务器、
 * 不落任何地方，页面刷新就没了。这里只把「文件名 / 尺寸 / 大小」量给你看，
 * **不做合格判定** —— 真正的闸门在服务端（PNG 魔术字节 + 尺寸白名单 + 两道体积闸，见
 * `worker/skin.ts`），前端复制一份判断只会两边不一致。
 *
 * ## 三条路会变成哪个标签
 *
 * 标签由 `skinBadge()` 算（名单卡片与弹窗用的是同一个函数），所以这里点出来的词，
 * 就是报名成功后卡片下面会印的那个词。
 */
type Path = 'none' | 'upload' | 'littleskin';

const PATHS: {value: Path; label: string; hint: ReactNode}[] = [
  {
    value: 'none',
    label: '两样都不填',
    hint: (
      <>
        皮肤是选填的。什么都不交，就穿本站的默认皮肤（<code>static/img/skins/deepseek-npz.png</code>）。
      </>
    ),
  },
  {
    value: 'upload',
    label: '自己传一张',
    hint: (
      <>
        PNG、5 MB 以内、建议 64×64 —— 文件从你的浏览器直接进服务器，不经过别的手，也不进 LittleSkin。
      </>
    ),
  },
  {
    value: 'littleskin',
    label: '填 LittleSkin 编号',
    hint: (
      <>
        皮肤详情页地址末尾那串数字（TID）。我们替你取回来，并在<b>报名那一刻定格一份副本</b> ——
        之后作者改了自己那张也不影响名单。
      </>
    ),
  },
];

/** 与报名页同一份示例资料，逐格对得上，看数字就知道哪一格该填什么。 */
const EXAMPLE = {mcId: 'Rana', studentId: '2026010101'};
const DEFAULT_SKIN = '/img/skins/deepseek-npz.png';

type Picked = {name: string; size: number; width: number; height: number; url: string};

export default function SkinNameDemo(): ReactNode {
  const [mcId, setMcId] = useState(EXAMPLE.mcId);
  const [studentId, setStudentId] = useState(EXAMPLE.studentId);
  const [path, setPath] = useState<Path>('upload');
  const [picked, setPicked] = useState<Picked | null>(null);
  const pickedUrlRef = useRef<string | null>(null);

  // blob: URL 得自己收：换一张、离开页面都要撤掉，不然那份文件一直占着内存
  useEffect(
    () => () => {
      if (pickedUrlRef.current) URL.revokeObjectURL(pickedUrlRef.current);
    },
    [],
  );

  /** 与报名页同一条规则：游戏 ID + 学号后两位。 */
  const trimmedId = mcId.trim();
  const trimmedStudent = studentId.trim();
  const previewName =
    trimmedId && trimmedStudent ? `${trimmedId}${trimmedStudent.slice(-2)}.png` : null;

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (pickedUrlRef.current) URL.revokeObjectURL(pickedUrlRef.current);
    const url = URL.createObjectURL(file);
    pickedUrlRef.current = url;
    setPicked({name: file.name, size: file.size, width: 0, height: 0, url});
    const probe = new Image();
    probe.onload = () => {
      setPicked((current) =>
        current && current.url === url
          ? {...current, width: probe.naturalWidth, height: probe.naturalHeight}
          : current,
      );
    };
    probe.src = url;
    // 同一个文件再选一次也要能触发 change
    event.target.value = '';
  };

  const skinSource: SkinSource = path === 'upload' ? 'upload' : path === 'littleskin' ? 'littleskin' : null;
  const badge = skinBadge(path !== 'none', skinSource);

  return (
    <BlogDemo
      id="signup-skin"
      title="皮肤：会存成什么名字、标成哪一类"
      hint="改改游戏 ID 与学号"
      note={
        <>
          名字的规则、标签的映射都是从站点源码里取的同一份（<code>signup.tsx</code> 的{' '}
          <code>previewName</code>、<code>components/skinSource.ts</code> 的{' '}
          <code>skinBadge()</code>）。挑一张本地 PNG 试试：头像用的是名单页同一个{' '}
          <code>SkinHead</code>，图片<b>不出这台设备</b>。
        </>
      }>
      <div className={styles.fields}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Minecraft 游戏 ID</span>
          <Input
            value={mcId}
            data-skin-name-mcid=""
            placeholder={EXAMPLE.mcId}
            onChange={(value) => setMcId(value)}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>学号</span>
          <Input
            value={studentId}
            data-skin-name-student=""
            placeholder={EXAMPLE.studentId}
            onChange={(value) => setStudentId(value)}
          />
        </label>
      </div>

      <div className={styles.result}>
        <div className={styles.headBox}>
          {/* 名单页同一个 2D 头像组件；没挑文件时预览默认皮肤 */}
          <SkinHead skin={picked?.url ?? DEFAULT_SKIN} className={styles.head} />
        </div>
        <div className={styles.resultText}>
          <p className={styles.nameRow}>
            <span className={styles.resultLabel}>会存成</span>
            <code className={styles.fileName} data-skin-name-preview="">
              {previewName ?? '—'}
            </code>
          </p>
          <p className={styles.fileMeta} data-skin-name-meta={picked ? 'picked' : 'none'}>
            {picked
              ? `${picked.name} ｜ ${
                  picked.width ? `${picked.width}×${picked.height}` : '读取中…'
                } ｜ ${(picked.size / 1024).toFixed(1)} KB`
              : '还没挑文件 —— 上面预览的是本站默认皮肤。'}
          </p>
          <label className={styles.pick}>
            <input type="file" accept="image/png" data-skin-name-file="" onChange={onPick} />
            <span className={styles.pickButton}>挑一张 PNG</span>
          </label>
        </div>
      </div>

      <div className={styles.paths}>
        <span className={styles.pathsLabel}>皮肤这条路</span>
        <div className={styles.pathButtons}>
          {PATHS.map((item) => (
            <Button
              key={item.value}
              variant={path === item.value ? 'primary' : 'secondary'}
              data-skin-path={item.value}
              onClick={() => setPath(item.value)}>
              {item.label}
            </Button>
          ))}
        </div>
        {/* 标签由 skinBadge() 算 —— 卡片下面印的就是这个词 */}
        <span className={styles.badgeBox} title={badge.title} data-skin-name-badge={badge.label}>
          <Tag>{badge.label}</Tag>
        </span>
      </div>

      <p className={styles.pathHint} data-skin-path-active={path}>
        {PATHS.find((item) => item.value === path)?.hint}
      </p>
    </BlogDemo>
  );
}
