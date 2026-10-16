import type {ReactNode} from 'react';
import {Button, Tooltip} from '@iicemeta/minecraft-react-ui';

import BlogDemo from '../BlogDemo';
import Fireworks, {useFireworks} from '../Fireworks';
import styles from './styles.module.css';

/**
 * 首页那颗「放烟花」按钮 —— 文章里原样搬一份，连引擎都是同一个。
 *
 * 唯一改掉的是**自动演出**：首页开着（`useFireworks()` 默认 `autoShow: true`，在视口里就一直
 * 循环放），文章里必须关掉 —— 读者是来看字的，一片循环燃放的夜空会一直占着 `requestAnimationFrame`
 * 和 GPU，还得让人分神。手动点是显式操作，照放：`launch(3)` 一次三发。
 *
 * 这块也顺便说明一件事：文章里嵌的是**真组件**，不是截图。按下去掉帧不掉帧、粒子长什么样，
 * 和首页那一颗按钮完全一致。
 */
export default function FireworksPanel(): ReactNode {
  const {canvasRef, launch} = useFireworks({autoShow: false});

  return (
    <BlogDemo
      id="hero-fireworks"
      title="放一轮烟花"
      hint="按一下，真的放"
      note={
        <>
          这不是视频也不是动图：首页 hero 里那颗按钮跑的就是这块画布，同一个引擎、同一套粒子。
          文章里把「自动演出」关了，所以它现在安安静静地等你按。
        </>
      }>
      <div className={styles.sky}>
        <Fireworks canvasRef={canvasRef} />
        <div className={styles.inner}>
          <Tooltip content="再放一轮" placement="bottom">
            <Button variant="primary" data-fireworks-launch="" onClick={() => launch(3)}>
              <img className={styles.icon} src="/mc/items/firework_rocket.png" alt="" />
              放烟花
            </Button>
          </Tooltip>
        </div>
      </div>
    </BlogDemo>
  );
}
