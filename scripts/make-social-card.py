#!/usr/bin/env python3
"""
生成分享卡片（`static/img/social-card.png`，1200x630）。

为什么是 Python：这个站没有 sharp / canvas 之类的依赖，而**宿主上连 PIL 都没有**
（见 dev-workflow：图片一律在容器里处理）。所以这张卡片的生成脚本也只在容器里跑：

    docker --context minipc exec clubparty-dev bash -lc \
      'cd /workspace && python3 scripts/make-social-card.py --assets /tmp/mc'

## 素材全部来自 `minecraft-assets`，一个字节都不是自己画的

- **字**：`assets/minecraft/font/unifont.zip` —— 原版游戏里显示中文用的就是它（Unifont 位图字体，
  `码位:十六进制位图`，BMP 每个字 16x16）。所以标题是**真正的 Minecraft 字形**，
  放大 4 倍后是干净的方块像素，不会像系统字体那样糊成一团。
- **地面**：`textures/block/grass_block_top.png`（草皮）与 `dirt.png`（泥土）。
- **装饰**：`textures/block/{oak_log,oak_planks,gold_block,diamond_block,bookshelf}.png`。

所有贴图都是 16x16，一律按**整数倍**放大（这里是 3 倍 = 48px），否则像素会被插值糊掉 ——
这也是为什么地面每块是 48px、而不是「铺满 1200 所以取 60px」。

## 构图

天空渐变 → 地平线在 390px → 草皮一行、泥土四行（各 48px）→ 标题压在天空上（白字 + 深色投影，
MC 自己的标题就是这么做的）→ 右下角一摞方块。

## 参数

    --assets <dir>   素材根目录，里面要有 `assets/minecraft/...`；默认 `../minecraft-assets`
    --out <file>     输出路径；默认 `static/img/social-card.png`
"""

import argparse
import os
import sys
import zipfile

from PIL import Image, ImageChops, ImageDraw

WIDTH, HEIGHT = 1200, 630
TILE = 48  # 16x16 贴图 × 3 —— **必须是整数倍**，非整数倍会把像素糊掉
HORIZON = 400  # 地平线：下面全是草地（俯视），方块塔站在上面
SKY_TOP = (108, 158, 240)
SKY_BOTTOM = (176, 208, 250)
INK = (255, 255, 255)
INK_SHADOW = (44, 48, 58)
# ⚠️ `grass_block_top` / `grass_block_side` 在游戏里是**灰度贴图**，颜色由生物群系叠加
# （平原草色）。直接贴出来是一块灰石头 —— 必须自己乘上这个色，否则地面看着像铺了水泥。
GRASS_TINT = (145, 189, 89)


def load_unifont(zip_path):
    """把 unifont 的 hex 读成 {码位: [[0/1, ...], ...]}。

    hex 的每一行是 `码位:位图`；位图按 16 行切，每行 `len(位图)/16` 个十六进制字符
    （所以 16 宽的字形是 64 个字符、8 宽的是 32 个）。宽字形（部分符号）也走同一个公式。
    """
    with zipfile.ZipFile(zip_path) as archive:
        name = next(n for n in archive.namelist() if n.endswith(".hex"))
        text = archive.read(name).decode("utf-8", "replace")
    glyphs = {}
    for line in text.splitlines():
        if ":" not in line:
            continue
        code, bits = line.split(":", 1)
        bits = bits.strip()
        if not bits or len(bits) % 16:
            continue
        per_row = len(bits) // 16
        columns = per_row * 4
        rows = []
        for r in range(16):
            value = int(bits[r * per_row:(r + 1) * per_row], 16)
            rows.append([(value >> (columns - 1 - c)) & 1 for c in range(columns)])
        try:
            glyphs[int(code, 16)] = rows
        except ValueError:
            continue
    return glyphs


def advance(glyphs, char):
    """这个字符占多宽（像素，未放大）。缺字按半角算，免得整行错位。"""
    rows = glyphs.get(ord(char))
    return len(rows[0]) if rows else 8


def draw_text(canvas, glyphs, text, x, y, scale, color=INK, shadow=INK_SHADOW, depth=1):
    """画一行像素字。先铺一层偏移的深色再压上本色 —— MC 标题的「投影」就是这么来的。"""
    if shadow:
        cursor = x + depth * scale
        for char in text:
            rows = glyphs.get(ord(char))
            if rows:
                stamp(canvas, rows, cursor, y + depth * scale, scale, shadow)
            cursor += advance(glyphs, char) * scale
    cursor = x
    for char in text:
        rows = glyphs.get(ord(char))
        if rows:
            stamp(canvas, rows, cursor, y, scale, color)
        cursor += advance(glyphs, char) * scale
    return cursor - x


def stamp(canvas, rows, x, y, scale, color):
    """把一个字形贴上去：先做成 1 位掩码再 NEAREST 放大，避免逐像素 paste。"""
    height = len(rows)
    width = len(rows[0])
    mask = Image.new("1", (width, height), 0)
    pixels = mask.load()
    for row in range(height):
        for column in range(width):
            if rows[row][column]:
                pixels[column, row] = 1
    mask = mask.resize((width * scale, height * scale), Image.NEAREST)
    canvas.paste(Image.new("RGB", mask.size, color), (x, y), mask)


def block_texture(root, name, size=TILE, tint=None):
    """取一张方块贴图，按整数倍放大；`tint` 用来还原游戏里按生物群系叠的那层色。"""
    path = os.path.join(root, "assets/minecraft/textures/block", name)
    image = Image.open(path).convert("RGBA").resize((size, size), Image.NEAREST)
    if tint:
        colored = ImageChops.multiply(
            image.convert("RGB"), Image.new("RGB", image.size, tint)
        ).convert("RGBA")
        colored.putalpha(image.getchannel("A"))
        image = colored
    return image


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--assets", default="../minecraft-assets")
    parser.add_argument("--out", default="static/img/social-card.png")
    args = parser.parse_args()

    font_zip = os.path.join(args.assets, "assets/minecraft/font/unifont.zip")
    if not os.path.exists(font_zip):
        sys.exit(f"找不到 {font_zip} —— --assets 要指向 minecraft-assets 的根目录")
    glyphs = load_unifont(font_zip)

    canvas = Image.new("RGB", (WIDTH, HEIGHT), SKY_TOP)
    draw = ImageDraw.Draw(canvas)

    # 天空：一条竖直渐变。逐行填，1200x390 很快。
    for y in range(HORIZON):
        ratio = y / max(HORIZON - 1, 1)
        draw.line(
            [(0, y), (WIDTH, y)],
            fill=tuple(round(a + (b - a) * ratio) for a, b in zip(SKY_TOP, SKY_BOTTOM)),
        )

    # 云：几块纯白的方块（MC 的云就是方块拼的），不用贴图，避免把 3D 云纹贴到 2D 上显得脏
    for x, y, w, h in [(120, 92, 132, 26), (196, 60, 74, 26), (812, 74, 156, 26), (884, 42, 84, 26)]:
        draw.rectangle([x, y, x + w, y + h], fill=(246, 250, 255))
    # 太阳：游戏里就是一块方的，不是圆的
    draw.rectangle([1088, 74, 1164, 150], fill=(255, 252, 214))

    # 地面：整块草地（俯视）。草皮是灰度贴图，染上平原草色才像草地。
    grass = block_texture(args.assets, "grass_block_top.png", tint=GRASS_TINT)
    for row in range((HEIGHT - HORIZON) // TILE + 1):
        for column in range(WIDTH // TILE + 1):
            canvas.paste(grass, (column * TILE, HORIZON + row * TILE))
    # 地面上不再放任何零碎方块：试过「挖开几处」和「一条石板小路」，2D 俯视里前者像噪点、
    # 后者像一堵横在草地上的石墙。一片干净的草地本来就是这个游戏的样子，留白更好。

    # 标题压在天空上。7 个字 × 16px × 4 倍 = 448px 宽，左边留 96px 呼吸
    draw_text(canvas, glyphs, "山商方块嘉年华", 96, 110, 4)
    draw_text(canvas, glyphs, "七个社团 · 一张方块校园", 100, 226, 2)
    draw_text(canvas, glyphs, "2026 · 山东工商学院", 100, 292, 1)

    # 右下角一摞方块（96px = 6 倍像素）。位置故意跨过地平线 —— 立在草地上，不是贴在地上
    STACK = 96
    stack = [
        ("oak_planks.png", 0, 0),
        ("gold_block.png", 1, 0),
        ("diamond_block.png", 2, 0),
        ("dirt.png", 0, 1),
        ("oak_log.png", 1, 1),
        ("cobblestone.png", 2, 1),
    ]
    for name, column, row in stack:
        canvas.paste(
            block_texture(args.assets, name, size=STACK),
            (876 + column * STACK, HORIZON - STACK + row * STACK),
        )
    # 塔脚下一条淡淡的影子，让它「站」在草地上而不是浮着
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rectangle(
        [876, HORIZON + STACK - 6, 876 + STACK * 3, HORIZON + STACK + 4], fill=(0, 0, 0, 46)
    )
    canvas.paste(shadow, (0, 0), shadow)

    canvas.save(args.out, "PNG", optimize=True)
    print(f"已生成 {args.out}（{WIDTH}x{HEIGHT}，{os.path.getsize(args.out) / 1024:.1f} KB）")


if __name__ == "__main__":
    main()
