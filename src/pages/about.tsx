import {useRef, type ReactNode, type RefObject} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import useIsomorphicLayoutEffect from '@docusaurus/useIsomorphicLayoutEffect';

import PixelParticles from '@site/src/components/PixelParticles';
import {activity} from '@site/src/data/clubs';
import styles from './about.module.css';

const SOURCE_URL = 'https://github.com/MyGOClubParty/club-party-website';
const TITLE = '关于本站';

/** 每个小节的标题图标，直接用 Minecraft 方块贴图（16px 原图，靠 CSS 放大成像素风）。 */
const ICONS = {
  stack: '/mc/blocks/crafting_table_top.png',
  layout: '/mc/blocks/bookshelf.png',
  pipeline: '/mc/blocks/diamond_block.png',
  build: '/mc/blocks/emerald_block.png',
};

const stack: Array<[string, string]> = [
  ['站点框架', 'Docusaurus 3.10.2（静态站点生成）'],
  ['UI 运行时', 'React 19'],
  ['语言', 'TypeScript 6'],
  ['内容格式', 'MDX / Markdown（docs/ 与 blog/）'],
  ['样式', 'CSS Modules + Infima 主题变量'],
  ['组件库', '@iicemeta/minecraft-react-ui 1.0.2（Minecraft 风格组件）'],
  ['视觉素材', 'Minecraft 原始材质贴图（static/mc/）'],
];

const structure: Array<[string, string]> = [
  ['src/data/clubs.json', '社团数据的唯一来源：名称、角色、主题色、图片路径都写在这里'],
  ['src/data/clubs.ts', '上述数据的类型定义与读取辅助'],
  ['src/components/', '自定义组件：社团卡片与画廊、灯箱、烟花、花草与粒子动效'],
  ['src/theme/Footer/', 'Minecraft 风格页脚（独立主题组件）'],
  ['src/pages/', '独立页面：首页、关于本站'],
  ['docs/', '活动说明与社团文档'],
  ['blog/', '活动日志'],
  ['scripts/', '内容生成与校验脚本'],
  ['static/', '图片与 Minecraft 贴图等静态资源'],
];

const scripts: Array<[string, string]> = [
  ['gen-club-docs.mjs', '读取 clubs.json，生成 docs/clubs/<slug>.mdx'],
  ['gen-club-placeholders.mjs', '为尚未提交素材的社团生成占位图'],
  ['check-md-residue.mjs', '构建前守卫，扫描 MDX 语法残留（挂在 prebuild）'],
];

const commands = [
  'npm install      # 安装依赖',
  'npm run start    # 本地开发服务器',
  'npm run build    # 生成静态站点到 build/',
  'npm run serve    # 预览构建产物',
].join('\n');

/**
 * 滚动入场：只有**首屏之外**的小节才先藏起来再淡入。
 *
 * 三个刻意的取舍：
 * - 用 `useLayoutEffect`（SSR 期退回 `useEffect`），在浏览器绘制前就把 `pending` 挂上，
 *   否则会先按 SSG 的样子画一帧再消失，闪一下。
 * - 已经落在首屏里的小节**不参与**：SSR 的 HTML 早就画出来了，再把它藏起来同样会闪。
 * - 判据是「元素的顶边进到视口内」而不是 IntersectionObserver 的交叉比。
 *   交叉比只在阈值穿越时才回调——锚点直达或一次滚到底会**跳过**某个小节，
 *   它从头到尾没和视口相交过，就永远停在 pending 上（内容直接没了）。
 *   按位置判断，跳过和正常滚动都能补上。
 */
function useReveal(ref: RefObject<HTMLElement | null>) {
  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.88) return;

    el.dataset.reveal = 'pending';

    let ticking = false;
    let done = false;
    const onScroll = () => {
      if (ticking || done) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        if (el.getBoundingClientRect().top >= window.innerHeight * 0.88) return;
        done = true;
        el.dataset.reveal = 'in';
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
      });
    };

    window.addEventListener('scroll', onScroll, {passive: true});
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [ref]);
}

function Section({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement | null>(null);
  useReveal(ref);

  return (
    <section ref={ref} className={styles.section}>
      <Heading as="h2" className={styles.sectionTitle}>
        <span className={styles.sectionIconFrame}>
          <img className={styles.sectionIcon} src={icon} alt="" aria-hidden="true" />
        </span>
        {title}
      </Heading>
      <div className={styles.panel} data-panel>{children}</div>
    </section>
  );
}

function Rows({rows}: {rows: Array<[string, string]>}) {
  return (
    <table className={styles.table}>
      <tbody>
        {rows.map(([key, value]) => (
          <tr key={key}>
            <th scope="row">{key}</th>
            <td>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function About(): ReactNode {
  return (
    <Layout
      title="关于本站"
      description={`${activity.fullName}活动官网的技术说明：本站由电脑技术协会开发，采用 Docusaurus + React 构建。`}>
      <main className={styles.page} data-about>
        <header className={styles.hero}>
          {/* 装饰层：天空贴图 + 云 + 日月 + 粒子。整块 aria-hidden，纯视觉。 */}
          <div className={styles.sky} aria-hidden="true">
            <div className={styles.clouds} data-clouds />
            <img
              className={clsx(styles.celestial, styles.sun)}
              src="/mc/environment/sun.png"
              alt=""
              data-celestial="sun"
            />
            <img
              className={clsx(styles.celestial, styles.moon)}
              src="/mc/environment/moon_full.png"
              alt=""
              data-celestial="moon"
            />
            <PixelParticles count={22} />
          </div>

          <div className={clsx('container', styles.heroInner)}>
            <Heading as="h1" className={styles.title} data-text={TITLE}>
              {TITLE}
            </Heading>
            <p className={styles.lead} data-lead>
              这里是「{activity.fullName}」的活动官方网站。网站由
              <Link to="/docs/clubs/computer-tech" className={styles.ownerLink}>
                电脑技术协会
              </Link>
              开发并维护，{activity.clubCount} 个参展社团的信息、活动说明与打卡流程都在本站发布。
            </p>

            <div className={styles.ownerCard} data-owner>
              <span className={styles.ownerBlockFrame}>
                <img
                  className={styles.ownerBlock}
                  src={ICONS.stack}
                  alt=""
                  aria-hidden="true"
                />
              </span>
              <div>
                <p className={styles.ownerTitle}>开发单位 · 电脑技术协会</p>
                <p className={styles.ownerText}>
                  作为本次活动的承办单位之一，电脑技术协会负责搭建并运营活动官方平台，
                  承担报名、客户端领取、打卡上传与平台审核；本站即为该平台的门户。
                </p>
              </div>
            </div>
          </div>
        </header>

        <div className="container">
          <Section icon={ICONS.stack} title="技术栈">
            <Rows rows={stack} />
          </Section>

          <Section icon={ICONS.layout} title="站点结构">
            <Rows rows={structure} />
            <p className={styles.note}>
              社团信息只在 <code>src/data/clubs.json</code> 里维护一次：首页卡片、社团风采文档页、
              占位图都由它派生，改一处即全站同步。
            </p>
          </Section>

          <Section icon={ICONS.pipeline} title="内容生成流水线">
            <Rows rows={scripts} />
          </Section>

          <Section icon={ICONS.build} title="本地开发与构建">
            <pre className={styles.code}>
              <code>{commands}</code>
            </pre>
            <p className={styles.note}>
              构建产物是纯静态文件，可直接托管在任意静态服务器上。源码托管在
              <a href={SOURCE_URL}> GitHub</a>。
            </p>
          </Section>
        </div>
      </main>
    </Layout>
  );
}
