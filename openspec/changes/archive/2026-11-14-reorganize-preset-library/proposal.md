# Proposal

## Why

预置素材库要从小样扩成正式库：当前 14 张素材平铺在 `presets/`，清单由打包脚本硬编码，增删或改名都得改代码；用户在弹窗里也只能按「背景图 / 透明图」二分浏览。把素材按主题分目录、把分类和显示名交给配置文件、把体积拆成按需加载的块，可以一次把容量扩到 38 张而不拖慢首屏，并让后续维护只改配置和目录。

## What Changes

- 重组 `presets/` 为 6 个分类子目录：`texture/`(6)、`solid/`(4)、`landscape/`(6)、`floral/`(6)、`pattern/`(7)、`overlay/`(9)。
- 删除 `light-spot`、`thin-border`、`flower-corner` 三个装饰素材及其源文件；保留 4 张柔光渐变、颗粒叠层和 6 张纸张纹理。
- 新增 27 张 Pixabay 素材，重编码为长边 1400 的 WebP 衍生图、以语义化文件名入库；2K 原图不入库。
- `presets/manifest.json` 成为唯一事实源：分类 id / 名称 / 目录 / 默认 kind / 来源许可，以及每张图的显示名和可选覆盖（颜色、定位、不透明度、隐藏、来源）。
- 预置数据由单文件改为「索引 + 6 个分类块」：索引含元数据与 160px 缩略图，块只含 `id -> data URL`；按分类懒加载，悬停预热，失败可重试。
- 「选择背景图」弹窗的分类标签改为配置驱动（保留「全部」），不再硬编码「背景图 / 透明图」。
- 打包与素材生成脚本迁入 `scripts/`，新增 `scripts/README.md` 说明每个脚本的使用场景。
- `build.sh` 递归拷贝 `js/` 子目录、注入预置资源版本常量、校验索引列出的每个分类块都进入产物。
- **BREAKING**（仅开发期）：`js/presets-data.js`、`presets/pack.sh`、`presets/pack.py` 被新的索引/分块产物与 `scripts/` 脚本取代；已物化到项目里的预置不受影响。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `background-layer`: 预置清单改为配置驱动的分类目录与「索引 + 分类块」按需加载；弹窗标签由配置生成；应用预置前按需加载块，失败可重试且不改变背景集。
- `release-build`: 产物清单改为递归包含 `js/` 子目录；版本注入覆盖预置索引与分类块共用的版本常量，并校验分类块齐全。

## Impact

`presets/`（配置、图片、许可说明）、新增 `scripts/`、`js/presets.js`、新增 `js/presets-data/`、`js/ui.js`、`js/app.js`、`build.sh`、`README.md`、`SOURCES.md`。

不变：运行时依赖（vendored LeaferJS）、零构建 / `file://` 约束、项目持久化格式、`index.html` 的脚本引用；预置应用后仍是普通图片资产。
