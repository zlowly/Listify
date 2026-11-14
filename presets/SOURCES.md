# 预置素材来源与许可

本目录 38 个预置素材的来源记录。`presets/manifest.json` 是分类、显示名、来源与许可的唯一事实源；
运行时生成物 `js/presets-data/` 由 `scripts/build-presets.sh` 从配置与素材合成。本文逐条与配置对账。

## 许可总览

- **27 张 Pixabay 素材**：遵循 [Pixabay Content License](https://pixabay.com/service/license-summary/)。
- **6 张 Pexels 素材**：遵循 [Pexels License](https://www.pexels.com/license/)。
- **5 张自产素材**（4 张柔光渐变 + 1 张颗粒叠层）：由本仓库 `scripts/gen-selfmade.*` 确定性生成，按 CC0 释出。
- 第三方素材**不适用**本项目的 MIT 许可。仓库只分发重编码后的衍生图（长边 ≤ 1400、WebP q78），
  2K 原图不随仓库分发；再分发这些衍生图时请保留其原始许可声明。

## 纸张纹理（6，Pexels License）

| 预置 | 文件 | 来源 | 作者 |
| --- | --- | --- | --- |
| 米色纸 | `texture/beige-paper.webp` | [Pexels 8824187](https://www.pexels.com/photo/close-up-photo-of-crinkled-beige-paper-8824187/) | Tamanna Rumee |
| 墨黑纸 | `texture/black-paper.webp` | [Pexels 20818845](https://www.pexels.com/photo/creased-black-paper-20818845/) | Артём Дворецкий |
| 蓝布 | `texture/blue-cloth.webp` | [Pexels 7794385](https://www.pexels.com/photo/close-up-shot-of-a-wrinkled-light-blue-fabric-7794385/) | Monstera Production |
| 云绢 | `texture/clouds.webp` | [Pexels 55787](https://www.pexels.com/photo/white-clouds-and-blue-sky-55787/) | Donald Tong |
| 深色旧纸 | `texture/dark-old-paper.webp` | [Pexels 16557322](https://www.pexels.com/photo/yellow-plain-surface-16557322/) | Lumber Film |
| 羊皮纸 | `texture/parchment.webp` | [Pexels 24285669](https://www.pexels.com/photo/brown-wrinkled-paper-24285669/) | Engin Akyurt |

## 纯色渐变（4，自产 CC0）

| 预置 | 文件 | 来源 |
| --- | --- | --- |
| 浅色纸 | `solid/paper-light.webp` | `scripts/gen-selfmade.*`（确定性参数） |
| 深色夜 | `solid/night-dark.webp` | `scripts/gen-selfmade.*`（确定性参数） |
| 雾蓝 | `solid/mist-blue.webp` | `scripts/gen-selfmade.*`（确定性参数） |
| 暖霞 | `solid/dusk-warm.webp` | `scripts/gen-selfmade.*`（确定性参数） |

## 山水风景（6，Pixabay Content License）

| 预置 | 文件 | 原始素材文件 | 来源 |
| --- | --- | --- | --- |
| 山崖晨雾 | `landscape/cliffs.webp` | `cliffs.jpg` | Pixabay（原始作者/素材页未记录） |
| 青灰群山 | `landscape/mountains.webp` | `mountains.jpg` | Pixabay（原始作者/素材页未记录） |
| 湖光倒影 | `landscape/water.webp` | `water.jpg` | Pixabay（原始作者/素材页未记录） |
| 星夜山峦 | `landscape/night-mountain.webp` | `minimalist.jpg` | Pixabay（原始作者/素材页未记录） |
| 月下草原 | `landscape/crescent-moon.webp` | `moon.jpg` | Pixabay（原始作者/素材页未记录） |
| 水墨小景 | `landscape/ink-landscape.webp` | `swamp.png` | Pixabay（原始作者/素材页未记录） |

## 花卉植物（6，Pixabay Content License）

| 预置 | 文件 | 原始素材文件 | 来源 |
| --- | --- | --- | --- |
| 白花特写 | `floral/white-flower.webp` | `ai-generated-2.jpg` | Pixabay（原始作者/素材页未记录） |
| 植物插画 | `floral/botanical.webp` | `flower.png` | Pixabay（原始作者/素材页未记录） |
| 水仙 | `floral/daffodils.webp` | `flowers.png` | Pixabay（原始作者/素材页未记录） |
| 绿叶 | `floral/green-leaves.webp` | `leaves.jpg` | Pixabay（原始作者/素材页未记录） |
| 秋枫 | `floral/maple.webp` | `maple.jpg` | Pixabay（原始作者/素材页未记录） |
| 粉线郁金香 | `floral/tulip-line-art.webp` | `leaves.png` | Pixabay（原始作者/素材页未记录） |

## 图案插画（7，Pixabay Content License）

| 预置 | 文件 | 原始素材文件 | 来源 |
| --- | --- | --- | --- |
| 紫心纹 | `pattern/hearts-pattern.webp` | `ractapopulous-background-1994460.jpg` | Pixabay（作者 ractapopulous，ID 1994460） |
| 紫心散景 | `pattern/hearts-bokeh.webp` | `hearts.jpg` | Pixabay（原始作者/素材页未记录） |
| 报纸字纹 | `pattern/newsprint.webp` | `lovelytocu-digital-paper-10473751.jpg` | Pixabay（作者 lovelytocu，ID 10473751） |
| 彩色泼溅 | `pattern/paint-splatter.webp` | `geralt-dirt-7455661.jpg` | Pixabay（作者 geralt，ID 7455661） |
| 水彩晕染 | `pattern/watercolor-wash.webp` | `painting.jpg` | Pixabay（原始作者/素材页未记录） |
| 涂鸦图标 | `pattern/doodle-icons.webp` | `children.png` | Pixabay（原始作者/素材页未记录） |
| 城堡插画 | `pattern/castle.webp` | `ai-generated-1.png` | Pixabay（原始作者/素材页未记录） |

## 透明叠层（9：8 Pixabay + 1 自产）

| 预置 | 文件 | 原始素材文件 | 来源 |
| --- | --- | --- | --- |
| 水彩玫瑰 | `overlay/rose.webp` | `prawny-ai-generated-8154949.png` | Pixabay（作者 prawny，ID 8154949） |
| 花束 | `overlay/floral-bunch.webp` | `kollsd-flower-4865379.png` | Pixabay（作者 kollsd，ID 4865379） |
| 花串 | `overlay/floral-garland.webp` | `kollsd-flower-5587380.png` | Pixabay（作者 kollsd，ID 5587380） |
| 花环 | `overlay/floral-wreath.webp` | `phuonglucky-flowers-6745956.png` | Pixabay（作者 phuonglucky，ID 6745956） |
| 水彩花束 | `overlay/watercolor-bouquet.webp` | `lucianapappdesign-watercolour-flowers-4262321.png` | Pixabay（作者 lucianapappdesign，ID 4262321） |
| 星点 | `overlay/stars.webp` | `eleatell-confetti-7320700.png` | Pixabay（作者 eleatell，ID 7320700） |
| 复古边框 | `overlay/vintage-frame.webp` | `rebeccaread-grunge-2479783.png` | Pixabay（作者 rebeccaread，ID 2479783） |
| 水彩纹理 | `overlay/watercolor-texture.webp` | `artsybee-splash-1763305_1920.png` | Pixabay（作者 artsybee，ID 1763305） |
| 颗粒叠层 | `overlay/grain-overlay.webp` | `scripts/gen-selfmade.*` | 自产（CC0，确定性参数） |

## 说明

- `manifest.json`：分类、显示名、来源与许可的配置（打包输入；新增/改名先改这里）。
- `scripts/build-presets.sh`：校验配置、归一化素材、生成缩略图与 `js/presets-data/`（日常改素材/分类后用）。
- `scripts/gen-selfmade.sh`：仅当要改 4 张柔光渐变或颗粒叠层的外观时重跑，之后仍需 `build-presets.sh`。
- 照片/插画素材统一归一化为长边 ≤ 1400 的 WebP q78；透明叠层保留 alpha。仓库不保存 2K 原图。
