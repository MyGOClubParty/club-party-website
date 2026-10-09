import {useCallback, useState, type ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import {
  Button,
  ButtonGroup,
  Checkbox,
  DropdownMenu,
  FlexBox,
  Input,
  Select,
  Slider,
  Switch,
  Tag,
  Tooltip,
} from '@iicemeta/minecraft-react-ui';

import styles from './index.module.css';

/** Minecraft 风格的像素标题 */
function MinecraftTitle({children}: {children: ReactNode}) {
  return <span className={styles.minecraftFont}>{children}</span>;
}

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <FlexBox justify="center" align="center" style={{gap: 12, marginBottom: 8}}>
          <Tag className="Tag_success">多社团联合</Tag>
          <Tag>2026</Tag>
        </FlexBox>
        <Heading as="h1" className="hero__title">
          <MinecraftTitle>{siteConfig.title}</MinecraftTitle>
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link className={styles.mcLink} to="/docs/intro">
            <Button variant="primary">活动指南</Button>
          </Link>
          <Link className={styles.mcLink} to="/showcase">
            <Tooltip content="看看这套 Minecraft UI 都有什么" placement="bottom">
              <Button variant="secondary">组件展示</Button>
            </Tooltip>
          </Link>
        </div>
      </div>
    </header>
  );
}

/** 用 minecraft-react-ui 搭建的互动试玩区，验证组件库在 Docusaurus 中可用 */
function McPlayground() {
  const [view, setView] = useState('join');
  const [nickname, setNickname] = useState('');
  const [material, setMaterial] = useState<string | undefined>();
  const [agree, setAgree] = useState(false);
  const [notify, setNotify] = useState(true);
  const [volume, setVolume] = useState(80);

  const onSubmit = useCallback(() => {
    alert(nickname ? `欢迎加入，${nickname}！` : '请先输入游戏昵称');
  }, [nickname]);

  return (
    <section className={styles.playground}>
      <div className="container">
        <Heading as="h2" className={styles.playgroundTitle}>
          <MinecraftTitle>互动试玩台</MinecraftTitle>
        </Heading>
        <p className={styles.playgroundDesc}>
          本页交互组件由 <code>@iicemeta/minecraft-react-ui</code> 驱动，快来试一试。
        </p>
        <div className={styles.playgroundPanel}>
          <FlexBox direction="col" style={{gap: 20, width: '100%', maxWidth: 560}}>
            <ButtonGroup
              value={view}
              onChange={setView}
              options={[
                {value: 'join', label: '报名'},
                {value: 'info', label: '须知'},
                {value: 'map', label: '地图'},
              ]}
            />
            <Input
              value={nickname}
              onChange={setNickname}
              placeholder="输入你的游戏昵称..."
            />
            <Select
              value={material}
              onChange={setMaterial}
              placeholder="选择你擅长的方块材料..."
              searchPlaceholder="搜索材料..."
              options={[
                {label: '橡木木板', value: 'oak_planks'},
                {label: '石砖', value: 'stone_bricks'},
                {label: '下界砖', value: 'nether_brick'},
                {label: '末地石', value: 'end_stone'},
              ]}
            />
            <FlexBox align="center" style={{gap: 12, width: '100%'}}>
              <Slider value={volume} min={0} max={100} onChange={setVolume} />
              <Tag>{volume}%</Tag>
            </FlexBox>
            <FlexBox align="center" justify="space-between" style={{width: '100%'}}>
              <FlexBox align="center" style={{gap: 8}}>
                <Checkbox value={agree} onChange={setAgree} />
                <span>我已阅读活动须知</span>
              </FlexBox>
              <FlexBox align="center" style={{gap: 8}}>
                <Switch value={notify} onChange={setNotify} />
                <span>{notify ? '接收活动通知' : '免打扰'}</span>
              </FlexBox>
            </FlexBox>
            <FlexBox align="center" justify="space-between" style={{width: '100%'}}>
              <Tooltip content={agree ? '点我提交！' : '请先勾选活动须知'} placement="top">
                <Button variant="primary" active={agree} onClick={onSubmit}>
                  提交报名
                </Button>
              </Tooltip>
              <DropdownMenu
                placement="bottom-end"
                items={[
                  {id: 'rules', label: '查看规则'},
                  {id: 'qq', label: '加入 QQ 群'},
                  {id: 'contact', label: '联系主办方', disabled: false},
                ]}
              />
            </FlexBox>
          </FlexBox>
        </div>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={`Hello from ${siteConfig.title}`}
      description="Description will go into a meta tag in <head />">
      <HomepageHeader />
      <main>
        <McPlayground />
      </main>
    </Layout>
  );
}
