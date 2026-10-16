import {useState, type CSSProperties, type ReactNode} from 'react';
import {Button} from '@iicemeta/minecraft-react-ui';

import BlogDemo from '../BlogDemo';
import styles from './styles.module.css';

/**
 * 「一格 = 多少像素」——首页那条比例基准，做成可以拖着看的。
 *
 * ## 这块在演示什么
 *
 * 首页的所有尺寸都从**一格**（`UNIT`）推出来：列宽 = 一格、贴图平铺 = 一格、草色顶边 = 一格/4、
 * 火把与灯笼的盒子 = 一格见方。这个组件把左右两栏摆在一起：
 *
 * - **左：贴图跟着一格走。** 拖滑块，草色顶边、火把盒子、贴图平铺一起缩放 ——
 *   不管一格是多少像素，火把**永远占一格**，「道具比方块还大」在结构上不可能发生。
 * - **右：贴图写死。** 这是当年那一版：一格 6px，而火把盒子写死 32px、草色条写死 4px
 *   （见 `.workbuddy/memory/notes-hero.md`）。滑块一动，格子变小、火把那 32px 不变 ——
 *   它占的格数就跟着涨，6px 那一档正好是 **5.33 格**。
 *
 * 两栏用的是同一个 `--unit`，所以差异只可能来自「贴图跟不跟一格走」这一件事。
 *
 * ## 数值不从别处抄
 *
 * 右栏那三个写死的值就是当年源码里的像素数（32 / 4 / 36），左栏的值全部由 `unit` 现算 ——
 * 面板上的「格数」是 `px ÷ unit` 除出来的，不是手写的字符串；验收断言读的也是这几个输出值。
 */
const TEXTURE = 16;
/** 当年那一版：一格 6px，火把盒子与草色条都不跟它走。 */
const BROKEN = {unit: 6, torch: 32, grass: 4};

const MIN_UNIT = 6;
const MAX_UNIT = 24;
/** 舞台上的土画几格高（够看出「一格」在哪儿就行）。 */
const GROUND_BLOCKS = 3;

type StageProps = {
  /** 现在这一格是多少像素（两栏共用）。 */
  unit: number;
  /** 火把盒子高度（px）——左栏跟一格走，右栏写死。 */
  torch: number;
  /** 草色顶边高度（px）——同上。 */
  grass: number;
  /** 验收锚点。 */
  kind: 'derived' | 'fixed';
};

function Stage({unit, torch, grass, kind}: StageProps): ReactNode {
  return (
    <div
      className={styles.stage}
      data-stage={kind}
      style={{'--unit': `${unit}px`, '--torch': `${torch}px`, '--grass': `${grass}px`} as CSSProperties}>
      {/* 一格网格：横竖都按 --unit 铺，所以「占了几格」是可以数出来的，不用听我说 */}
      <span className={styles.ruler} data-ruler aria-hidden="true" />
      <div className={styles.stack}>
        <span className={styles.propSlot}>
          <img className={styles.torch} src="/mc/blocks/torch.png" alt="" loading="lazy" decoding="async" />
        </span>
        {/* 土：贴图按一格平铺（image-rendering: pixelated，不做插值） */}
        <span className={styles.ground}>
          <span className={styles.grassBand} />
        </span>
      </div>
    </div>
  );
}

/**
 * 一行读数：左＝像素，右＝折算成几格。
 *
 * 两个值都挂在 `data-*` 上（`data-readout-px` / `data-readout-blocks`）—— 验收断言读的是
 * **现算出来的数**，不是页面上的字符串：「一格 6px 时火把盒子 = 5.33 格」这句话必须能被机器核。
 */
function Row({label, px, blocks}: {label: string; px: string; blocks: number}): ReactNode {
  const over = blocks > 1.001;
  const text = blocks.toFixed(2);
  return (
    <div className={styles.row} data-readout={label}>
      <span className={styles.rowLabel}>{label}</span>
      <span className={styles.rowPx} data-readout-px={px}>
        {px}
      </span>
      <span
        className={styles.rowBlocks}
        data-readout-blocks={text}
        data-over={over ? 'yes' : 'no'}>
        {text} 格
      </span>
    </div>
  );
}

export default function HeroScaleDemo(): ReactNode {
  const [unit, setUnit] = useState(16);

  return (
    <BlogDemo
      id="hero-unit"
      title="一格到底是多少像素"
      hint="拖动滑块，或按右边两个按钮"
      note={
        <>
          左栏是现在首页的做法（一切都由一格推出来），右栏是当年把贴图写死的那一版。
          滑块改的是「一格」，两栏一起变 —— 差别只在贴图跟不跟它走。数字是现算的：
          右栏 32 / 4 这两个像素值就是当年源码里的数（一格 6px 时贴图比一格大 16 ÷ 6 ≈ 2.67 倍）。
        </>
      }>
      <div className={styles.controls}>
        <label className={styles.slider}>
          <span className={styles.sliderLabel}>一格</span>
          <input
            type="range"
            min={MIN_UNIT}
            max={MAX_UNIT}
            step={1}
            value={unit}
            data-unit-slider=""
            aria-label="一格等于多少像素"
            onChange={(event) => setUnit(Number(event.target.value))}
          />
          <output className={styles.sliderValue} data-unit-value="">
            {unit} px
          </output>
        </label>
        <div className={styles.presets}>
          <Button variant="secondary" data-preset="now" onClick={() => setUnit(16)}>
            现在：16 px
          </Button>
          <Button variant="secondary" data-preset="broken" onClick={() => setUnit(BROKEN.unit)}>
            当年：6 px
          </Button>
        </div>
      </div>

      <div className={styles.stages}>
        <section className={styles.panel} data-panel="derived">
          <h4 className={styles.panelTitle}>
            <span className={styles.dotOk} aria-hidden="true" />
            贴图跟着一格走
          </h4>
          <Stage unit={unit} torch={unit} grass={unit / 4} kind="derived" />
          <div className={styles.readout}>
            <Row label="一格" px={`${unit} px`} blocks={1} />
            <Row label="草色顶边" px={`${(unit / 4).toFixed(2)} px`} blocks={unit / 4 / unit} />
            <Row label="火把盒子" px={`${unit} px`} blocks={unit / unit} />
          </div>
        </section>

        <section className={styles.panel} data-panel="fixed">
          <h4 className={styles.panelTitle}>
            <span className={styles.dotBad} aria-hidden="true" />
            贴图写死（当年）
          </h4>
          <Stage unit={unit} torch={BROKEN.torch} grass={BROKEN.grass} kind="fixed" />
          <div className={styles.readout}>
            <Row label="一格" px={`${unit} px`} blocks={1} />
            <Row label="草色顶边" px={`${BROKEN.grass} px`} blocks={BROKEN.grass / unit} />
            <Row label="火把盒子" px={`${BROKEN.torch} px`} blocks={BROKEN.torch / unit} />
          </div>
        </section>
      </div>

      <p className={styles.legend}>
        贴图本体是 16×16 的像素画，一比一铺上去最清楚 —— 所以「一格」定成 {TEXTURE} px
        不是随手取的数（土画了 {GROUND_BLOCKS} 格高，网格线就是一格一格）。
      </p>
    </BlogDemo>
  );
}
