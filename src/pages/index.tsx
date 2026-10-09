import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import {Button, FlexBox, Tag, Tooltip} from '@iicemeta/minecraft-react-ui';

import ClubShowcaseSection from '@site/src/components/ClubShowcaseSection';
import {activity} from '@site/src/data/clubs';
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

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero', styles.heroBanner)}>
      <div className="container">
        <FlexBox align="center" justify="center" style={{gap: 12, marginBottom: 10, flexWrap: 'wrap'}}>
          <img className={styles.schoolLogo} src={activity.schoolLogo} alt={activity.school} />
          <Tag className="Tag_success">多社团联合</Tag>
          <Tag>{activity.clubCount} 个社团</Tag>
          <Tag>2026</Tag>
        </FlexBox>

        <Heading as="h1" className={clsx('hero__title', styles.title)}>
          <MinecraftTitle>{siteConfig.title}</MinecraftTitle>
        </Heading>

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
        </div>

        <dl className={styles.facts}>
          {FACTS.map((f) => (
            <div key={f.label} className={styles.fact}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </header>
  );
}

/** 用草方块贴图铺一条像素分隔带，衔接 hero 与社团区 */
function BlockDivider() {
  return <div className={styles.blockDivider} role="presentation" />;
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.title}
      description={`${activity.fullName}：${activity.clubCount} 个学生社团联合举办的 Minecraft 校园联谊活动。`}>
      <HomepageHeader />
      <BlockDivider />
      <main>
        <ClubShowcaseSection />
      </main>
    </Layout>
  );
}
