/**
 * 皮肤查看的**默认取景** —— 网格卡片（`components/SkinViewer/`）与弹窗
 * （`components/SkinModal/`）共用这一份。
 *
 * ## 数是从哪来的
 *
 * `clubparty/fov-quick-view/` 那个标定台 2026-10-15 15:38 量出来的，原样抄：
 *
 * ```
 * 模式      转相机
 * 相机位置  (-21.99, -1.56, 31.15)      ← 方位角 -35.23°、仰角 -2.34°
 * 距离      38.16   fov 60°   zoom 0.90
 * 画布      536×460 css · 1072×920 buffer (dpr 2)
 * ```
 *
 * 需求是「默认视角如参考图」，而 LittleSkin 的「材质预览」是**斜前方**（约 -35°），不是正对镜头 ——
 * 曾经把它读成正面、白做一轮，所以做了标定台，读数全出自那里。
 *
 * ## 为什么抽成一份
 *
 * 网格与弹窗是**两处独立实现**（网格是「一个离屏舞台 + 每卡片 2D 画布」，弹窗自己开一个上下文），
 * 但用户看到的必须是**同一个取景** —— 卡片是斜前方的缩略图，点开弹窗还是那个角度才不跳。
 * 四个常量分两处写就是下一次漂移的入口，所以只在**这里**写一次。
 *
 * ## 三条别踩的
 *
 * 1. `DEFAULT_CAMERA_POSITION` 那三个数**只用来定方向**（方位角、仰角），多远由
 *    `DEFAULT_CAMERA_DISTANCE` 说了算：两条都是从读数那一行抄下来的，所以模长本来就相等
 *    （`hypot(...)` = 38.1617 ≈ 38.16）；分开写是为了「改方向」和「改远近」互不牵连。
 * 2. **不要用库的 `adjustCameraDistance()` 去推距离**：那是 fov/zoom 的公式值
 *    （fov 60 / zoom 0.9 → **36.25**）。标定台里改完 fov 又滚了一下滚轮，距离早就不等于公式值了
 *    —— 实测 **38.16**，差 5%，画面会紧一档。
 * 3. **量的时候是「转相机」模式，所以这里落的是相机位置**。两种转法**不等价**：库的
 *    `cameraLight` 挂在相机上（`this.camera.add(this.cameraLight)`），转相机时灯跟着走、
 *    明暗与「转人物」不同。想要标定台里看到的那幅画面，就只能把相机摆过去。
 */

/** 竖直视场角。 */
export const DEFAULT_FOV = 60;
/** 相机 zoom（透视相机的 `camera.zoom`，和 fov 一起决定库算出的距离）。 */
export const DEFAULT_ZOOM = 0.9;
/** 标定台「相机位置」那一行：给的是方向，距离见下一个常量。 */
export const DEFAULT_CAMERA_POSITION = [-21.99, -1.56, 31.15] as const;
/** 标定台「距离」那一行（**不是** fov/zoom 的公式值，见文件头第 2 条）。 */
export const DEFAULT_CAMERA_DISTANCE = 38.16;

/**
 * 摆位要动到的那几个成员 —— 两个视图各自把自己的类型对到这里（**结构性**，不引 three 的类型图）。
 */
export type PoseTarget = {
  /** 竖直视场角。**改它会动距离**：库的 setter 里调 `adjustCameraDistance()`（保方向、改长度）。 */
  fov: number;
  /** 同上，也是靠 `adjustCameraDistance()` 生效。 */
  zoom: number;
  readonly camera: {position: {x: number; y: number; z: number}};
  /** `update()` 会按 `position` 与目标重算朝向（`lookAt`），并顺手把距离夹进 [10, 256]。 */
  readonly controls: {update: (deltaTime?: number) => void};
  /** 自转是加在它上面的，库的相机复位压根不碰（要归零得自己写）。 */
  readonly playerWrapper: {rotation: {y: number}};
};

/**
 * 把相机摆回默认取景，并把人物自转角归零。
 *
 * **顺序是这里唯一要紧的事**：`fov` 与 `zoom` 两个 setter 都会调库的 `adjustCameraDistance()`
 * （保方向、按公式把 `camera.position` 缩放过去），所以 `camera.position` 必须**最后**写 ——
 * 先写位置的话，紧跟着的 setter 会把距离重算成 36.25，标定台那个 38.16 就丢了。
 *
 * 末尾亲手 `controls.update()`：弹窗那边库的循环每帧都会调，但这样**第一帧就已经朝向目标**，
 * 打开后立刻采样也不会读到上一处的朝向；网格那边（`enableControls: false`，自己排帧、没有
 * 别的时机去转相机）就**只能**靠这一下来定朝向。它不受 `enabled` 影响 —— `enabled` 只挡事件处理器。
 */
export function applyDefaultPose(viewer: PoseTarget): void {
  const [x, y, z] = DEFAULT_CAMERA_POSITION;
  const scale = DEFAULT_CAMERA_DISTANCE / Math.hypot(x, y, z);
  viewer.fov = DEFAULT_FOV;
  viewer.zoom = DEFAULT_ZOOM;
  viewer.camera.position.x = x * scale;
  viewer.camera.position.y = y * scale;
  viewer.camera.position.z = z * scale;
  viewer.playerWrapper.rotation.y = 0;
  viewer.controls.update();
}
