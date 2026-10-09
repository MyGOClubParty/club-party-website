import {useState, type ReactNode} from 'react';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import {
  Button,
  ButtonGroup,
  Checkbox,
  CheckboxGroup,
  DropdownMenu,
  FlexBox,
  Input,
  List,
  Menu,
  MenuIcon,
  RadioGroup,
  Select,
  Slider,
  Switch,
  Tag,
  Tooltip,
  type Item,
} from '@iicemeta/minecraft-react-ui';

import styles from './showcase.module.css';

function Section({title, children}: {title: string; children: ReactNode}) {
  return (
    <section className={styles.section}>
      <Heading as="h2">{title}</Heading>
      <div className={styles.panel}>{children}</div>
    </section>
  );
}

const demoItems: Item[] = Array.from({length: 20}, (_, i) => ({
  id: `club-${i + 1}`,
  name: `社团 ${i + 1}`,
}));

export default function Showcase(): ReactNode {
  const [view, setView] = useState('grid');
  const [nickname, setNickname] = useState('');
  const [agree, setAgree] = useState(false);
  const [notify, setNotify] = useState(true);
  const [perms, setPerms] = useState<string[]>(['read']);
  const [level, setLevel] = useState('normal');
  const [volume, setVolume] = useState(75);
  const [material, setMaterial] = useState<string | undefined>();

  return (
    <Layout title="组件展示" description="minecraft-react-ui 组件展示页">
      <main className="container margin-vert--lg">
        <Heading as="h1">Minecraft React UI 组件展示</Heading>
        <p>
          所有组件来自 <code>@iicemeta/minecraft-react-ui</code>，与 Docusaurus SSG 兼容。
        </p>

        <Section title="Button / ButtonGroup">
          <FlexBox direction="col" style={{gap: 16}}>
            <FlexBox align="center" style={{gap: 12}}>
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="clear">Clear</Button>
              <Button active>Active</Button>
              <Button disabled>Disabled</Button>
            </FlexBox>
            <ButtonGroup
              value={view}
              onChange={setView}
              options={[
                {value: 'grid', label: '网格'},
                {value: 'list', label: '列表'},
                {value: 'detail', label: '详情'},
              ]}
            />
          </FlexBox>
        </Section>

        <Section title="Input / Select / Slider">
          <FlexBox direction="col" style={{gap: 16}}>
            <Input
              value={nickname}
              onChange={setNickname}
              placeholder="输入昵称..."
            />
            <Select
              value={material}
              onChange={setMaterial}
              placeholder="选择方块..."
              searchPlaceholder="搜索方块..."
              options={[
                {label: 'Oak Planks', value: 'oak_planks'},
                {label: 'Stone Bricks', value: 'stone_bricks'},
                {label: 'Nether Brick', value: 'nether_brick'},
                {label: 'End Stone', value: 'end_stone'},
              ]}
            />
            <FlexBox align="center" style={{gap: 12}}>
              <Slider value={volume} min={0} max={100} onChange={setVolume} />
              <Tag>{volume}%</Tag>
            </FlexBox>
          </FlexBox>
        </Section>

        <Section title="Checkbox / Switch / RadioGroup / CheckboxGroup">
          <FlexBox direction="col" style={{gap: 16}}>
            <FlexBox align="center" style={{gap: 8}}>
              <Checkbox value={agree} onChange={setAgree} />
              <span>我已阅读活动须知</span>
            </FlexBox>
            <FlexBox align="center" style={{gap: 8}}>
              <Switch value={notify} onChange={setNotify} />
              <span>{notify ? 'ON' : 'OFF'}</span>
            </FlexBox>
            <RadioGroup
              name="difficulty"
              value={level}
              onChange={setLevel}
              direction="row"
              options={[
                {label: 'Easy', value: 'easy'},
                {label: 'Normal', value: 'normal'},
                {label: 'Hard', value: 'hard'},
              ]}
            />
            <CheckboxGroup
              name="permissions"
              value={perms}
              onChange={setPerms}
              direction="row"
              options={[
                {label: 'Read', value: 'read'},
                {label: 'Write', value: 'write'},
                {label: 'Delete', value: 'delete'},
              ]}
            />
          </FlexBox>
        </Section>

        <Section title="Tooltip / DropdownMenu / Menu / Tag">
          <FlexBox align="center" style={{gap: 16}}>
            <Tooltip content="悬停提示！" placement="top">
              <Button variant="secondary">Hover 我</Button>
            </Tooltip>
            <DropdownMenu
              items={[
                {id: 'rename', label: '重命名'},
                {id: 'delete', label: '删除', disabled: true},
              ]}
            />
            <FlexBox align="center" style={{gap: 8}}>
              <MenuIcon />
              <Menu
                items={[
                  {id: 'cut', label: '剪切'},
                  {id: 'copy', label: '复制'},
                ]}
              />
            </FlexBox>
            <FlexBox align="center" style={{gap: 8}}>
              <Tag>v1.0.2</Tag>
              <Tag className="Tag_success">进行中</Tag>
            </FlexBox>
          </FlexBox>
        </Section>

        <Section title="List（虚拟列表 + 拖拽排序 + 多选）">
          <div style={{height: 380}}>
            <List
              items={demoItems}
              itemSize={48}
              draggable
              selection={{initialSelectedIds: []}}
              renderItem={({item}) => (
                <div style={{minHeight: 47, display: 'flex', alignItems: 'center'}}>
                  <strong>{item.name}</strong>
                  <span style={{marginLeft: 8, opacity: 0.7}}>摆摊摊位</span>
                </div>
              )}
            />
          </div>
        </Section>
      </main>
    </Layout>
  );
}
