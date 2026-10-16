import type {ReactNode} from 'react';

import styles from './styles.module.css';

/**
 * 文章里的互动演示面板 —— 只做「外壳」，内容由各演示组件自己填。
 *
 * ## 为什么文章要嵌真组件，而不是截图
 *
 * 幕后文章最早是纯文字 + 一批截图。截图的问题不是丑，是**贵**：一张 1440 宽的整屏 PNG
 * 就是 300 KB 到 1 MB，四篇文章十几张下来，读者为了看几个方块小人要下几兆图片；
 * 而这些页面上大半的内容（社团卡片墙、皮肤网格、烟花）本来就是**这个站点自己的 React 组件**，
 * 直接嵌进 MDX 既省掉那份体积，又能让读者真的按一按、转一转。所以现在的原则是：
 *
 * > 能在文章里跑起来的，就让它跑起来；跑不起来的（手机视口、深色首页整屏）才留一张压缩过的图。
 *
 * ## 这个面板负责什么
 *
 * 三件事：给演示一个**看得出来的边界**（它和正文不是一回事）、标一句「这是演示不是截图」、
 * 以及**验收锚点** —— `data-blog-demo="<id>"`。套件拿它确认那块组件真的渲染出来了，
 * 而且里面确实跑着真东西（而不是「文章里写着有」）。
 *
 * 配色与卡片走同一套 `minecraft-react-ui` 深色 GUI 变量（固定深色、不随主题翻转），
 * 所以面板里要自己声明 `color` —— 浅色页面下文字才不会继承成深色。
 */
export type BlogDemoProps = {
  /** 验收锚点：`data-blog-demo="<id>"`，全站唯一。 */
  id: string;
  /** 面板顶栏的标题。 */
  title: string;
  /** 顶栏右侧的一句提示，比如「拖一下试试」。 */
  hint?: string;
  /** 面板底下那句交代：这块演示与真实页面是什么关系。 */
  note?: ReactNode;
  children: ReactNode;
};

export default function BlogDemo({id, title, hint, note, children}: BlogDemoProps): ReactNode {
  return (
    <div className={styles.demo} data-blog-demo={id}>
      <div className={styles.head}>
        <span className={styles.badge}>互动</span>
        <span className={styles.title}>{title}</span>
        {hint ? <span className={styles.hint}>{hint}</span> : null}
      </div>
      <div className={styles.body}>{children}</div>
      {note ? <p className={styles.note}>{note}</p> : null}
    </div>
  );
}
