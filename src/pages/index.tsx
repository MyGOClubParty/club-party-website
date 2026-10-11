/**
 * 首页 hero：一个「Minecraft 主菜单 × 方块校园」的画面。
 *
 * 分层（从后往前）：天空渐变 → 星星 → 云 → 月亮 / 太阳 → 远景山峦 → 近景山峦（插火把 /
 * 挂灯笼）→ 粒子 → 烟花 → 正文 → HUD 物品栏。
 *
 * 整个 hero 随站点主题切换：深色主题 = 夜空 + 月亮 + 灯火，浅色主题 = 白天 + 太阳
 * （日间配色跟 /about 共用一套，见 index.module.css 顶部的变量表）。所以日、月**两个都渲染**，
 * 由 CSS 决定显示哪一个 —— 换主题不需要重新渲染，也就不会破坏 SSG 的确定性。
 *
 * 六条硬约束：
 * - 装饰层整块 `aria-hidden`，不参与读屏，也不进键盘顺序。
 * - 位置 / 高度 / 周期必须是**确定性**的：首页是 SSG 预渲染的，render 期取随机数会让水合
 *   前后 DOM 对不上。星星用固定种子的 LCG 在**模块作用域**算一次（服务端和浏览器会算出
 *   同一串数，不在 render 期产生熵）；山峦轮廓是把正弦叠加的结果**固化成的字面量数组**。
 * - **一格 = 一张贴图 = 一列**（`UNIT = 16`）。这是全篇唯一的比例基准：泥土按 `--unit` 平铺、
 *   草色顶边 = `unit/4`（grass_block_side 顶部 4/16 行）、火把与灯笼的盒子也是 unit 见方 ——
 *   所以「道具比草方块还大」在结构上不可能发生。改之前一格只有 6px 而贴图按 16px 铺，
 *   差 2.67 倍，于是火把成了 5.33 格高的巨物、草色条成了 0.67 格。
 * - `.scene` 不能带 z-index：那会让它自成 stacking context，`mix-blend-mode: screen` 的云
 *   就只能跟透明背景混，黑底会直接显出来。隔离交给 `.heroBanner` 的 isolation。
 * - 两层地形的**底边都落在同一条地平线（bottom: 0）**上，抬高的只是轮廓。远景那层原来抬的是
 *   底边，于是近景矮列的上方会漏出「远景底边 → 近景顶边」之间的一条天空 —— 截图里那些
 *   「泥土之间的空隙」就是它。底边齐平之后，山体内部在结构上不可能有洞。
 * - 地形是**一整块土体**用 `clip-path` 切出轮廓，不是一排等宽柱子。柱子方案里每列的贴图相位
 *   各自从列左边缘起算，列与列之间会有肉眼可见的竖向错缝（看着像一根根独立柱子）。
 * - 贴图一律从 `minecraft-assets` 原字节拷来（`static/mc/`），不重编码。
 *
 * 一层的宽度 = `COLUMNS × UNIT` = 2560px，比视口宽，超出的部分由 `.heroBanner` 的 overflow
 * 裁掉。为什么不用百分比让列自动铺满：一格必须等于一列、贴图必须等于一格，用百分比的话
 * 格子会随视口横向拉伸，方块就不是方的了。代价是 >2560px 的视口两侧会露出天空。
 *
 * 竖直方向只放草方块与泥土：石块在地表以下，从侧面看山也不会露在草方块的下方/上方。
 * （草色只出现在「暴露方块」的顶边，而花圃的草带在山脚 —— 层序见 index.module.css。）
 *
 * `data-scene` / `data-moon-wrap` 两个属性是给 verify/site-check.cjs 当锚点的：
 * 上面那条 stacking context 的约束没有编译期检查，也没有视觉上必然的报错（只是黑底露出来），
 * 所以让断言能直接量到这两个元素的 z-index，把它变成一条能失败的回归守卫。
 */

import type {CSSProperties, ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import {Button, FlexBox, Tag, Tooltip} from '@iicemeta/minecraft-react-ui';

import ClubShowcaseSection from '@site/src/components/ClubShowcaseSection';
import Fireworks, {useFireworks} from '@site/src/components/Fireworks';
import GrassGarden from '@site/src/components/GrassGarden';
import PixelParticles from '@site/src/components/PixelParticles';
import {activity, clubs} from '@site/src/data/clubs';
import styles from './index.module.css';

/** Minecraft 风格的像素标题 */
function MinecraftTitle({children}: {children: ReactNode}) {
  return <span className={styles.minecraftFont}>{children}</span>;
}

/**
 * 平滑滚动到社团风采区。
 * 这里用按钮而不是 `<a href="#clubs">`：首页是 React 页面，Docusaurus 的
 * broken-anchor 检查拿不到 React 页面的锚点元数据，会把它当成坏链误报。
 */
function scrollToClubs() {
  document.getElementById('clubs')?.scrollIntoView({behavior: 'smooth', block: 'start'});
}

/** 活动关键信息，hero 里的紧凑事实条 */
const FACTS = [
  {label: '报名 / 领客户端', value: '10.17 08:00 – 10.19 15:00'},
  {label: '服务器开放 / 打卡', value: '10.19 18:00 – 10.25 21:00'},
  {label: '形式', value: '线上开展'},
];

/** 主菜单旁边那句斜着的小字。三个轮流显示，纯 CSS 轮播，不需要 JS。 */
const SPLASHES = ['七社联袂！', '方块校园！', '一起来打卡！'];

/* ------------------------------------------------------------ 星空与地形 */

/**
 * 确定性伪随机（与 PixelParticles 用同一组 LCG 常数）。
 * 在模块作用域算一次 —— 服务端和浏览器都会得到同一串数，所以水合是安全的。
 */
function makeRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const STAR_COUNT = 46;

/** 星星只铺在天空上半部，避开 hero 下沿的山脊与 HUD。 */
const STARS = (() => {
  const random = makeRandom(0x5eed1);
  return Array.from({length: STAR_COUNT}, () => ({
    x: random() * 100,
    y: random() * 58,
    size: random() < 0.7 ? 2 : 3,
    duration: 2.4 + random() * 3.4,
    delay: random() * 4.2,
  }));
})();

/**
 * 一格多少 CSS 像素。取 16 —— 正好是原版贴图的原始边长，贴图 1:1 铺不缩放、像素最锐，
 * 也正是「16×16 的贴图 = 一个方块」这个原版比例的字面还原。
 */
const UNIT = 16;

/**
 * 一层的列数。一格 = 一列，所以一层宽 = COLUMNS × UNIT = 2560px（比常见视口宽，靠裁切）。
 */
const COLUMNS = 160;

/**
 * 两层山峦的高度轮廓，单位是「方块」。**一列一格**，所以数组长度 = 列数 = 上面那个 COLUMNS。
 *
 * 形状是三条不同波长的正弦叠加、线性归一化到目标区间后取整，再**固化成的字面量** ——
 * 相位全部写死，渲染期不做任何计算（首页 SSG 预渲染，render 期产生熵会让水合前后 DOM 对不上）。
 * 近景 2..6 格、远景 5..9 格，且远景恒定比近景高 ≥ 2 格 —— 所以近丘后面永远探得出一层远山。
 */
const RIDGE_FRONT_PROFILE = [
  5, 5, 5, 5, 5, 4, 3, 3, 2, 2, 2, 2, 2, 3, 3, 3,
  3, 3, 3, 3, 2, 2, 2, 3, 3, 4, 4, 5, 5, 5, 5, 5,
  4, 4, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 3, 3, 3,
  3, 3, 4, 4, 5, 5, 6, 6, 6, 5, 5, 5, 4, 4, 4, 4,
  5, 5, 5, 5, 5, 5, 4, 3, 3, 2, 2, 2, 2, 3, 3, 4,
  4, 4, 4, 3, 3, 3, 3, 3, 3, 3, 4, 4, 5, 5, 5, 5,
  4, 4, 3, 3, 2, 2, 3, 3, 3, 4, 4, 4, 4, 4, 3, 3,
  3, 3, 3, 4, 4, 5, 6, 6, 6, 6, 6, 5, 5, 4, 4, 4,
  4, 5, 5, 5, 5, 5, 4, 4, 3, 3, 2, 2, 2, 3, 3, 4,
  4, 4, 5, 4, 4, 4, 3, 3, 3, 3, 4, 4, 4, 5, 5, 4,
];

const RIDGE_BACK_PROFILE = [
  8, 8, 8, 8, 8, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
  7, 7, 7, 8, 8, 7, 7, 7, 7, 6, 6, 7, 7, 7, 7, 7,
  6, 6, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 5, 5, 5,
  5, 6, 6, 6, 7, 7, 8, 8, 8, 8, 9, 9, 9, 9, 9, 9,
  9, 9, 8, 8, 8, 8, 8, 8, 8, 8, 8, 9, 9, 9, 9, 8,
  8, 8, 8, 8, 8, 7, 7, 7, 7, 7, 8, 8, 8, 8, 9, 9,
  9, 9, 9, 9, 9, 9, 8, 8, 8, 8, 7, 7, 7, 7, 7, 7,
  7, 7, 7, 7, 7, 7, 8, 8, 8, 8, 8, 7, 7, 6, 6, 6,
  6, 7, 7, 7, 7, 7, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
  6, 7, 7, 7, 7, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8,
];

/**
 * 把高度轮廓转成 `clip-path: polygon()`：每列两个折点（左上、右上），首尾各补一个底角。
 * 于是整座山是**一块连续的土体**（一张贴图铺满全宽，相位一致），轮廓由多边形切出来。
 * 折点数 = 2n + 2，断言按这个数守。
 */
function ridgeClip(heights: number[]): string {
  const n = heights.length;
  const max = Math.max(...heights);
  const pts = ['0% 100%'];
  heights.forEach((blocks, i) => {
    const y = (((max - blocks) / max) * 100).toFixed(4);
    pts.push(`${((i / n) * 100).toFixed(4)}% ${y}%`, `${(((i + 1) / n) * 100).toFixed(4)}% ${y}%`);
  });
  pts.push('100% 100%');
  return `polygon(${pts.join(', ')})`;
}

/**
 * 插火把 / 挂灯笼的列号，写死。
 *
 * 两批错开、互不重叠（相隔 8 列），并且**每隔 16 列一个** —— 一格 = 一列 = 16px，
 * 所以它们是每隔 256px 一个。4 和 12 落在最前面，是为了让手机竖屏（只看得见前 ~24 列）
 * 也至少有一支火把和一盏灯笼。
 */
const TORCH_AT = [4, 20, 36, 52, 68, 84, 100, 116, 132, 148];
const LANTERN_AT = [12, 28, 44, 60, 76, 92, 108, 124, 140, 156];

/* ---------------------------------------------------------------- 装饰层 */

/** 星空。每颗星的位置/大小/闪烁周期都从 STARS 来，不在渲染期算。 */
function StarField(): ReactNode {
  return (
    <div className={styles.stars} data-stars={STAR_COUNT}>
      {STARS.map((s, i) => (
        <span
          key={i}
          className={styles.star}
          style={
            {
              '--x': s.x,
              '--y': s.y,
              '--s': `${s.size}px`,
              '--dur': `${s.duration}s`,
              animationDelay: `${s.delay}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

/**
 * 一层山峦：一整块土体 + 等宽列。
 *
 * 土体（`.mass`）铺满整层、底边落在地平线上，用 `clip-path` 按轮廓切出山形 —— 一层只有
 * 一张贴图，列与列之间不会出现相位错缝，也不可能出现空洞。
 * 列（`.col`）只负责三件事：给出轮廓折点对应的宽度、把草色顶边钉在各自的顶边上、
 * 给火把灯笼当锚点。列本身不画土。
 *
 * 比例全部从 `--unit`（一格）推出来：列宽 = 一格、贴图平铺 = 一格、草色条 = 一格/4、
 * 火把与灯笼的盒子 = 一格见方。JS 只给「格数」，像素换算一律留给 CSS。
 */
function Terrain({
  heights,
  front,
}: {
  heights: number[];
  /** 近景那层：插火把挂灯笼、并压低一档。必填 —— 漏传会静默渲染成远景层。 */
  front: boolean;
}): ReactNode {
  const max = Math.max(...heights);
  return (
    <div
      className={clsx(styles.ridge, front ? styles.ridgeFront : styles.ridgeBack)}
      data-ridge={front ? 'front' : 'back'}
      data-columns={heights.length}
      style={
        {
          '--unit': `${UNIT}px`,
          '--cols': heights.length,
          '--max': max,
        } as CSSProperties
      }>
      <div className={styles.mass} data-mass style={{clipPath: ridgeClip(heights)}} />
      {heights.map((blocks, i) => (
        <span
          key={i}
          className={styles.col}
          data-col
          style={{'--blocks': blocks} as CSSProperties}>
          <span className={styles.colGrass} data-grass />
          {front && TORCH_AT.includes(i) ? (
            <span className={styles.propSlot} data-torch>
              <img className={styles.torch} src="/mc/blocks/torch.png" alt="" loading="lazy" />
            </span>
          ) : null}
          {front && LANTERN_AT.includes(i) ? (
            <span className={styles.propSlot} data-lantern>
              <span className={styles.lantern} />
            </span>
          ) : null}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ 物品栏 */

/**
 * HUD 物品栏：社团的快速跳转。
 * 用原版 `hotbar.png` 当框。原版是 9 格（贴图 182×22：x=0 左黑边、x=1..180 九格、x=181 右黑边），
 * 这里**按社团数出格**、不留空格子 —— 所以框宽按 `1 + n×20 + 1` 推，右黑边另取贴图第 181 列
 * 补在右边缘（见 index.module.css 的 `::after`）。格子几何照原版：第 i 格左上角 = 1 + i×20、
 * 格 20×20，整体放大 2 倍。
 */
function ClubHotbar(): ReactNode {
  return (
    <div className={styles.hotbar} data-hotbar>
      <div
        className={styles.hotbarFrame}
        data-slots={clubs.length}
        style={{'--slots': clubs.length} as CSSProperties}>
        {clubs.map((club, i) => (
          <Link
            key={club.slug}
            to={club.doc}
            className={styles.hotSlot}
            style={{'--i': i} as CSSProperties}
            data-club-slot={club.slug}>
            <img className={styles.hotIcon} src={club.logo} alt="" loading="lazy" decoding="async" />
            <span className={styles.hotName}>{club.name}</span>
          </Link>
        ))}
      </div>
      <p className={styles.hotHint}>点击格子进入各社团展位</p>
    </div>
  );
}

/* -------------------------------------------------------------------- hero */

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  // canvas 和「放烟花」按钮都在 hero 里，所以把引擎挂在这一层，回调直接传
  const {canvasRef, launch} = useFireworks();

  return (
    <header className={clsx('hero', styles.heroBanner)} data-hero>
      {/* 装饰层：夜空、星星、云、月亮、两层地形、粒子。全部不进无障碍树。 */}
      <div className={styles.scene} data-scene aria-hidden="true">
        <StarField />
        <div className={styles.clouds} data-clouds />
        {/* 光晕必须是圆的，而 box-shadow 只会跟着元素的方框 → 单独放一层。
            注意 `.moonWrap` 不能带 transform/filter/z-index：那会自成 stacking context，
            里面 screen 混合的日月就只能跟透明背景混，黑底会显出来。
            日月共用同一个位置，由 CSS 按主题决定显示哪一个（深色=月，浅色=日）。 */}
        <span className={styles.moonWrap} data-moon-wrap>
          <span className={styles.moonHalo} data-moon-halo />
          <img className={styles.moon} src="/mc/environment/moon_full.png" alt="" data-moon />
          <span className={styles.sunHalo} data-sun-halo />
          <img className={styles.sun} src="/mc/environment/sun.png" alt="" data-sun />
        </span>
        <Terrain heights={RIDGE_BACK_PROFILE} front={false} />
        <Terrain heights={RIDGE_FRONT_PROFILE} front />
        <PixelParticles count={26} />
      </div>

      <Fireworks canvasRef={canvasRef} />

      <div className={clsx('container', styles.heroInner)}>
        <FlexBox
          className={styles.logoRow}
          align="center"
          justify="center"
          style={{gap: 12, marginBottom: 10, flexWrap: 'wrap'}}>
          <img className={styles.schoolLogo} src={activity.schoolLogo} alt={activity.school} />
          <Tag className="Tag_success">多社团联合</Tag>
          <Tag>{activity.clubCount} 个社团</Tag>
          <Tag>2026</Tag>
        </FlexBox>

        <div className={styles.titleWrap}>
          <Heading
            as="h1"
            className={clsx('hero__title', styles.title, styles.minecraftFont)}
            data-text={siteConfig.title}>
            <MinecraftTitle>{siteConfig.title}</MinecraftTitle>
          </Heading>
          <div className={styles.splash} data-splash={SPLASHES.length}>
            {SPLASHES.map((s, i) => (
              <span key={s} style={{'--i': i} as CSSProperties}>
                {s}
              </span>
            ))}
          </div>
        </div>

        <p className={styles.subtitle}>{activity.fullName}</p>

        <p className={styles.lead}>
          依托“元山商”校园还原工程搭建的线上虚拟校园，七个学生社团在同一张 Minecraft
          地图里各设展位。下载客户端、连上服务器，在方块校园里逛社团、完成互动并拍照打卡。
        </p>

        <div className={styles.buttons}>
          <Link className={styles.mcLink} to="/docs/intro">
            <Button variant="primary">活动说明</Button>
          </Link>
          <Tooltip content="每个社团都有独立展位" placement="bottom">
            <Button variant="secondary" onClick={scrollToClubs}>
              社团风采
            </Button>
          </Tooltip>
          <Tooltip content="再放一轮烟花" placement="bottom">
            <Button variant="secondary" onClick={() => launch(3)}>
              <img className={styles.celebrateIcon} src="/mc/items/firework_rocket.png" alt="" />
              放烟花
            </Button>
          </Tooltip>
        </div>

        <dl className={styles.facts}>
          {FACTS.map((f) => (
            <div key={f.label} className={styles.fact}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>

        <ClubHotbar />
      </div>
    </header>
  );
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.title}
      description={`${activity.fullName}：${activity.clubCount} 个学生社团联合举办的 Minecraft 校园联谊活动。`}>
      <HomepageHeader />
      <GrassGarden />
      <main>
        <ClubShowcaseSection />
      </main>
    </Layout>
  );
}
