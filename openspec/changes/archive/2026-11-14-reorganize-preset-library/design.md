# Design

## Context

现状与约束见 proposal.md 的 Why；这里只列影响方案的部分：

- 运行时是 `file://` 直开的静态页。`fetch`/XHR 读本地 JSON 会被拒绝，把 `file://` 图片画进 canvas 会污染画布，导出入库失败。因此预置字节只能在打包期 base64 内嵌，配置只能是打包期输入。
- 现有预置是单文件 `js/presets-data.js`（2.1MB base64），由 `presets/pack.py` 从硬编码的 14 条清单生成；`js/presets.js` 动态注入该脚本，弹窗标签硬编码「全部/背景图/透明图」。
- 本次素材共 38 张：保留 11 张旧素材，新增 27 张 Pixabay 素材（原图在 `/mnt/d/Downloads/LyricBG_2K/`，约 26MB、长边约 2K）。
- 实测体积：全部压到长边 1400、WebP q78 后约 5.3MB，base64 后约 7MB；缩略图 160px 共约 0.45MB。
- 零构建约束：仓库里只能有静态文件与开发期脚本；`build.sh` 是唯一允许的打包入口。

## Goals / Non-Goals

**Goals:**

- 素材按主题分 6 个目录，分类、分类名、图片显示名全部由 `presets/manifest.json` 决定，增删图不改代码。
- 首屏不受影响；弹窗打开只加载索引，分类数据按需加载，最坏单次加载约 3.6MB。
- 38 张素材与生成物一并入库，克隆后双击 `index.html` 即可用，无需联网或起服务器。
- 打包脚本可重复运行、结果确定，且能直接吃 2K 原图或已归一化的衍生图。

**Non-Goals:**

- 不做运行期读配置、不做本地服务器、不引入 CDN 或构建工具。
- 不做搜索框、收藏、最近使用；不做运行期自定义分类。
- 不把透明素材拆成两个分类（已确认保持 6 类）。
- 不改图片资产的持久化格式，不改 LeaferJS 绘制与导出链路。

## Decisions

### 1. 配置是唯一事实源，目录扫描只做核对

`presets/manifest.json` 逐条列出分类与图片；打包时扫描分类目录，用于发现「配置没写的文件」和「配置写了但没有的文件」。

- 未登记文件 → 警告并跳过；标 `hidden` 的文件 → 静默跳过（这就是「不删文件但从库里拿掉」的开关）。
- 配置引用不存在的文件、或图片缺显示名 → 报错并中止，不产出新的数据文件。
- 顺序即声明顺序，不引入 `order` 字段。

备选：只扫描目录、显示名回退文件名——会让中文界面漏出 `ai-generated-2`，且顺序不可控，放弃。
备选：目录扫描为主、配置只写覆盖——省几十行配置，但漏写不会报错，改名/拼错会静默丢图，放弃。

### 2. 索引 + 6 个分类块，块只存字节

```
js/presets-data/index.js        L.PRESETS_INDEX = { version, showAll, categories:[...], items:[...], chunks:["texture",...] }
js/presets-data/<category>.js   L.PRESETS_CHUNKS["<category>"] = { "<id>": "data:image/webp;base64,..." }
```

索引项只保留展示与默认值所需字段（id、分类、名称、kind、color、fit、opacity、thumb、source、license）；块里不再重复元数据，hydrate 即 `item.data = chunk[item.id]`。

- 打开弹窗：加载索引（约 0.45MB），立刻出全部瓦片。
- 切换分类 / 悬停标签或瓦片：加载该分类块；同一分类的并发加载复用同一个 promise。
- 点击时块未就绪：等待加载完成再应用；失败则 toast 且背景集不变，瓦片可点重试。
- 索引里的 `chunks` 数组供 `build.sh` 校验产物完整性，也避免 loader 猜测文件名。

备选：继续单文件——38 张约 8MB，首开弹窗要解析全部 base64，放弃。
备选：打开即后台顺序预取全部——`file://` 尚可，GitHub Pages 上等于每次开弹窗下 8MB，放弃。

### 3. 统一编码：长边 1400 WebP q78，只提交衍生图

不透明图与透明图走同一套编码，magick 实测 libwebp 1.6.0 可用；26 张样本合计 5.25MB。透明图保留 alpha，`kind` 由打包时是否含 alpha 判定，配置可覆盖。

仓库内 38 个文件统一使用 `.webp` 扩展名（含原 JPEG/PNG 素材），避免扩展名与实际字节格式不一致；打包脚本按内容判断格式，已归一化（WebP 且长边 ≤ 1400）的输入直接复用字节，不再二次编码，因此重复打包不会产生代际画质损失。

原图（2K、26MB）不进货：仓库只存 1400 衍生图，许可上更接近「用于作品/应用」而不是原样再分发；打包脚本对输入即时归一化，所以以后把 2K 原图丢进目录也能直接打包。

备选：JPEG + WebP 混用——体积更大且多一套格式判断，放弃。
备选：1200 q75——4.8MB，1080 宽页面 `cover` 会轻微发虚，放弃。

### 4. 弹窗标签由配置生成，保留「全部」并默认选中

标签 = `全部` + 6 个分类（`showAll` 可关）；默认停在「全部」，38 张缩略图一屏可翻。透明素材在「透明叠层」分类里，kind 仍驱动默认定位（overlay → `original`，background → `cover`），应用逻辑不变。

### 5. 脚本迁入 `scripts/`，两个入口加一份说明

```
scripts/README.md          什么情况用哪个脚本（新增/替换素材、改分类名、改自产素材外观、发版）
scripts/build-presets.py   读配置、校验、推导颜色、调用 magick、写索引与分类块（唯一决策者）
scripts/build-presets.sh   入口：检查 magick/WebP、准备临时目录、调用上面的 py
scripts/gen-selfmade.sh    仅当要改 4 张柔光渐变/颗粒叠层的观感时重跑
scripts/gen-selfmade.py    上述素材的生成实现
```

`presets/` 只留配置、图片与 `SOURCES.md`。`build.sh` 留在仓库根（发布入口，AGENTS.md 与 release-build 规格都按根目录描述）。

备选：保留 `presets/pack.sh`——脚本和素材混在一起，且用户明确要求集中到 `scripts/`，放弃。
备选：Makefile 统一入口——多一层工具依赖，收益不足，放弃。

### 6. 构建：递归拷贝、共用版本常量、校验块齐全

- `build_dist` 从 `js/*` glob 改为 `find js vendor -type f`，保留子目录结构。
- `js/presets.js` 暴露 `DATA_VER` 常量，索引与分类块地址共用；`build.sh` 把该常量改写为 `VERSION`，替代原来的 `DATA_SRC` 字符串注入。
- 构建前读 `js/presets-data/index.js` 的 `chunks`，逐个断言 `dist/js/presets-data/<id>.js` 存在，缺失即失败。
- `scripts/`、`presets/` 不进入产物。

### 7. 旧素材与命名

删除 `light-spot`、`thin-border`、`flower-corner`（含 `ivyleaf.png` 源与 `gen-selfmade` 中对应产出）；保留 4 张渐变、颗粒叠层、6 张纸张纹理。27 张新素材改成语义化文件名，显示名全部走配置，完整清单见附录。

### 8. 许可

`SOURCES.md` 记录 27 张为 Pixabay Content License、6 张为 Pexels License、5 张自产为 CC0；两类第三方素材均不进 MIT 授权范围。链接区文案不变。

## Risks / Trade-offs

- [生成物入库后每次重打包产生大 diff（约 8–9MB）] → 生成文件头部标注「勿手改」，diff 只发生在确认过素材变更的提交里；仓库体积换「克隆即用」。
- [overlay 单块约 3.6MB，首次点开有等待] → 悬停预热 + 瓦片加载态；分类粒度已确认不再拆。
- [1400 宽素材在 1080 宽页面 `cover` 时约 1.3 倍放大] → 观感损失可接受；若将来出现 4K 导出需求，再提高编码长边并重打包。
- [配置与目录漂移（改名后忘改配置）] → 打包把「缺失文件」「缺显示名」设为硬错误，未登记文件给警告。
- [索引 0.45MB 仍要首开加载] → 只含缩略图与元数据，且仅在打开弹窗时加载；首屏不受影响。
- [Pixabay 素材的许可解释风险] → 只分发重编码衍生图并逐条记录来源与许可；README/SOURCES 写明不适用 MIT。
- [`file://` 下动态注入子目录脚本失败（路径写错）] → 加载失败走统一 toast + 重试；`build.sh` 的块校验覆盖发布包。

## Migration Plan

1. 归档已完成变更 `add-preset-background-library`（已执行，预置需求已进入主 specs）。
2. 新增目录与素材：建立 6 个分类目录，迁入并重命名 27 张新素材、保留的 11 张旧素材；删除 3 个装饰素材与源文件。
3. 写 `presets/manifest.json`（附录清单）与 `SOURCES.md`。
4. 迁移脚本到 `scripts/`，新增 README；运行一次打包生成 `js/presets-data/`，删除 `js/presets-data.js`。
5. 更新 loader、弹窗与应用前 hydrate；更新 `build.sh`。
6. 更新 README 的预置与许可段落；浏览器手测（打开弹窗、切分类、点瓦片、拖本地图、导出、`./build.sh --zip`）。

回滚：整组改动都在工作区，`git checkout` 即可回到当前状态；运行时没有需要迁移的存量数据，已物化到项目里的预置是普通资产，不受影响。

## Open Questions

无。视觉细节（标签换行、网格高度、瓦片尺寸）在实现时按现有弹窗风格处理，不改变本设计。

## 附录：预置清单（38 张）

| 分类 | 文件 | 显示名 | kind | 来源 |
| --- | --- | --- | --- | --- |
| texture | beige-paper.webp | 米色纸 | background | Pexels |
| texture | black-paper.webp | 墨黑纸 | background | Pexels |
| texture | blue-cloth.webp | 蓝布 | background | Pexels |
| texture | clouds.webp | 云绢 | background | Pexels |
| texture | dark-old-paper.webp | 深色旧纸 | background | Pexels |
| texture | parchment.webp | 羊皮纸 | background | Pexels |
| solid | paper-light.webp | 浅色纸 | background | Listify (CC0) |
| solid | night-dark.webp | 深色夜 | background | Listify (CC0) |
| solid | mist-blue.webp | 雾蓝 | background | Listify (CC0) |
| solid | dusk-warm.webp | 暖霞 | background | Listify (CC0) |
| landscape | cliffs.webp | 山崖晨雾 | background | Pixabay |
| landscape | mountains.webp | 青灰群山 | background | Pixabay |
| landscape | water.webp | 湖光倒影 | background | Pixabay |
| landscape | night-mountain.webp | 星夜山峦 | background | Pixabay |
| landscape | crescent-moon.webp | 月下草原 | background | Pixabay |
| landscape | ink-landscape.webp | 水墨小景 | background | Pixabay |
| floral | white-flower.webp | 白花特写 | background | Pixabay |
| floral | botanical.webp | 植物插画 | background | Pixabay |
| floral | daffodils.webp | 水仙 | background | Pixabay |
| floral | green-leaves.webp | 绿叶 | background | Pixabay |
| floral | maple.webp | 秋枫 | background | Pixabay |
| floral | tulip-line-art.webp | 粉线郁金香 | background | Pixabay |
| pattern | hearts-pattern.webp | 紫心纹 | background | Pixabay |
| pattern | hearts-bokeh.webp | 紫心散景 | background | Pixabay |
| pattern | newsprint.webp | 报纸字纹 | background | Pixabay |
| pattern | paint-splatter.webp | 彩色泼溅 | background | Pixabay |
| pattern | watercolor-wash.webp | 水彩晕染 | background | Pixabay |
| pattern | doodle-icons.webp | 涂鸦图标 | background | Pixabay |
| pattern | castle.webp | 城堡插画 | background | Pixabay |
| overlay | rose.webp | 水彩玫瑰 | overlay | Pixabay |
| overlay | floral-bunch.webp | 花束 | overlay | Pixabay |
| overlay | floral-garland.webp | 花串 | overlay | Pixabay |
| overlay | floral-wreath.webp | 花环 | overlay | Pixabay |
| overlay | watercolor-bouquet.webp | 水彩花束 | overlay | Pixabay |
| overlay | stars.webp | 星点 | overlay | Pixabay |
| overlay | vintage-frame.webp | 复古边框 | overlay | Pixabay |
| overlay | watercolor-texture.webp | 水彩纹理 | overlay | Pixabay |
| overlay | grain-overlay.webp | 颗粒叠层 | overlay | Listify (CC0) |

分类中文名：`纸张纹理`、`纯色渐变`、`山水风景`、`花卉植物`、`图案插画`、`透明叠层`。

配置文件形状（节选，其余图片按上表补齐）：

```json
{
  "version": 1,
  "showAll": true,
  "categories": [
    {
      "id": "texture",
      "name": "纸张纹理",
      "dir": "texture",
      "kind": "background",
      "source": "Pexels",
      "license": "Pexels License",
      "images": {
        "beige-paper.webp": "米色纸",
        "black-paper.webp": "墨黑纸"
      }
    },
    {
      "id": "solid",
      "name": "纯色渐变",
      "dir": "solid",
      "kind": "background",
      "source": "Listify",
      "license": "CC0",
      "images": {
        "night-dark.webp": { "name": "深色夜", "color": "#0b0d12" }
      }
    }
  ]
}
```
