# Design

## Context

- 运行时是 `file://` 直开的静态页，不能 `fetch`/XHR 读本地素材，也不能把 `file://` 图片画进 canvas 后导出；因此预置字节必须在打包期 base64 内嵌（见 `add-preset-background-library` 的实测）。
- 现有生成物：`js/presets-data/index.js`（分类、条目元数据、160px 缩略图、`chunkMap`/`chunks`）+ `<category>(-N).js`（仅 `id -> data URL`），单片预算 700KB。
- 现状体积：`js/presets-data/` 合计 8,245,006 字节。其中分类块 base64 7,980,614 字节，索引 259,329 字节（缩略图约 246KB、元数据约 13KB）。原始 WebP 合计 5,984,770 字节，base64 膨胀约 33%。
- 体积大头：`watercolor-texture` 994KB、`rose` 834KB、`newsprint` 675KB、`hearts-pattern` 658KB、`watercolor-bouquet` 488KB、`vintage-frame` 429KB；`overlay` + `pattern` 共约 6.1MB（74%）。
- 打包脚本只允许 python3 标准库 + ImageMagick `magick`；`presets/` 里的 `.webp` 是归一化后的编码源，`normalize()` 会把源图转成 WebP 1400 q78 并替换原文件，仓库里没有 2K 原始素材。
- 目标浏览器为 Chrome（项目现有运行环境）；`file://` 下不存在按格式回退的运行时加载能力。

## Goals / Non-Goals

**Goals:**

- 保持成品长边 1400 不变，把仓库内预置数据从 8.25MB 降到约 4.55MB（-45%）。
- 运行时加载器、资产管线、应用与导出链路零改动。
- 打包脚本可重复运行、结果确定，支持 `--format webp` 回退。
- 体积与画质有构建期门禁，不靠人工记忆。

**Non-Goals:**

- 不降成品分辨率，不改 `cover`/`original` 等定位与默认尺寸。
- 不把缩略图转 AVIF（实测 96px AVIF 冷启动解码 27.3ms，128px WebP 为 16.8ms）。
- 不做缩略图懒加载拆分或弹窗首开重构（实测缩略图优化只省 5–10ms，收益不足，另行评估）。
- 不做二进制外置、首次导入素材目录、本地 HTTP 服务或浏览器启动参数。
- 不引入运行时 AVIF 解码库、WASM、Worker 或特性检测。
- 不把 `solid` 改成 CSS 渐变（需要动渲染模型，超出本次范围）。

## Decisions

### 1. 完整素材用 AVIF 1400 q55，分辨率不变

长边仍为 1400，编码格式从 WebP q78 改为 AVIF q55。实测全库 base64 从 7.98MB 降到 4.38MB，PSNR 均值 43.34 dB（相对当前 WebP 源），最小 31.37 dB。

备选 q50：base64 3.70MB（-54%），PSNR 42.66 dB。体积再小 0.68MB，但大幅渐变与高细节图的伪影风险更高。默认取 q55；`--quality 50` 保留为可选档，是否改默认由目视验收决定。

上述 q55/q50 是 Pillow/libavif 的实测档位；ImageMagick/libheif 对 `-quality` 的映射可能不同。打包脚本必须先用 6 张最大图校准：以「PSNR ≈ 43 dB、全库 base64 ≈ 4.4MB」为目标调整 `-quality`，记录校准值后再全量生成；门禁以校准后的结果为准，不能假设 `-quality 55` 与 Pillow 的 q55 等价。

校准结果（本机 ImageMagick 7.1.2 + libheif 1.23.7）：libheif 的刻度的确更低，q55 时 6 张最大素材的 PSNR 均值仅约 38.8 dB，会跌破 40 dB 门禁；加上 `heic:speed=0` 与 `heic:chroma=444` 后整体约 +1.4 dB。最终默认取 **avif / 58**：6 张最大素材 PSNR 均值 41.06 dB（最低 33.33 dB），全库 34 张均值 43.17 dB，base64 合计约 4.9MB；q60 已达 5.2MB，超出 5.0MB 预算。完整数据见 `verification.md`。

备选 WebP q70：base64 6.55MB（-18%），最小 PSNR 28.39 dB，渐变图有明显色带，收益也不足，放弃。

### 2. `presets/` 仍是 WebP 源，AVIF 只作为生成物，不回写

`normalize()` 的现有行为（WebP 且长边 ≤1400 直接复用字节，否则转码并替换源文件）保持不变。新增的 AVIF 编码发生在生成 data URL 之前：把 `presets/<cat>/*.webp` 转码到临时文件，读取字节写入分类块，然后删除临时文件。

- 不把 AVIF 写回 `presets/`，否则下次打包会从 AVIF 再转 AVIF，产生累积代际损失。
- 每次打包都是「WebP q78 → AVIF q55」的一次转码，结果可重复。
- 仓库仍保留 WebP 源，`--format webp` 可以直接重建旧格式。

备选：把 `presets/` 改成 AVIF 源并把 `normalize()` 的目标改成 `.avif`——会让源与生成物同格式，但一旦需要换质量/回退就要从 AVIF 再转，代际损失不可逆，放弃。

### 3. `solid` 分类保持 WebP q78，允许分类块混合 MIME

4 张渐变图只有 28KB base64，占比可忽略；大面积平滑渐变在 AVIF q55 或 WebP q70 下都可能出现色带。保持 WebP q78，其它分类用 AVIF q55。

运行时不需要特殊处理：`js/app-presets.js` 从 data URL 提取 MIME，`js/assets.js` 按 MIME 包装 `File`，`<img>`/canvas 按内容解码。分类块里可以同时出现 `data:image/avif` 与 `data:image/webp`。

备选：solid 也用 AVIF q70——需要单独校准 quality 映射，且 4 张图省不到 20KB，不值得。

### 4. 缩略图 160 WebP q72 → 128 WebP q60

实测 38 张缩略图数据从约 260KB 降到 167KB（-36%），冷启动解码 21.5ms → 16.8ms（桌面），6x 降速 50.9ms → 48.7ms。收益不大但方向正确，且不引入 AVIF 小图解码更慢的问题。

缩略图仍由 `presets/` 的 WebP 源生成：不透明图等比缩放到长边 128、透明图居中裁剪为 128×128，质量 q60。

### 5. 工具检测与回退

`build-presets.sh` 在调用 Python 前检测：

- `magick` 存在；
- `magick -list format` 含 `WEBP`；
- 默认格式为 `avif` 时，含 `AVIF`（需要 libheif）。

缺失 AVIF 时明确报错，提示安装带 libheif 的 ImageMagick 或用 `--format webp` 回退，不静默降级。格式与质量通过 `--format`、`--quality` 传入 Python；Python 侧只认参数，不读环境变量猜测。

### 6. 体积与画质门禁

打包结束时输出报告：每类原图字节、base64 字节、条目数、最大条目；总 base64 字节；相对上一次的差值（若旧索引存在）。

失败条件：

- 总 base64 > 5.0MB；
- 单条 data URL > 700KB；
- 单个分类块 > 700KB（复用现有 `CHUNK_BUDGET`）；
- 抽样 PSNR 均值 < 40 dB（源 WebP vs 生成 AVIF，抽样至少覆盖 6 张最大图）。

PSNR 用 `magick compare -metric PSNR` 计算，不引入第三方库。

### 7. 运行时零改动与兼容性

`js/presets.js`、`js/app-presets.js`、`js/assets.js`、`js/render.js`、`js/export.js` 均不修改。data URL 的 MIME 从 `image/webp` 变成 `image/avif` 后：

- `js/app-presets.js` 的 `/^data:(image\/[a-z0-9.+-]+)/i` 能匹配 `image/avif`；
- `base64ToBlob` 与 `File` 构造与格式无关；
- Chrome 85+ 的 `<img>`、canvas 解码支持 AVIF。

不做双格式内嵌或运行时特性检测：`file://` 下无法按能力回退，双份数据会让体积翻倍，违背本次目标。

## Risks / Trade-offs

- [ImageMagick 缺 libheif，打包机无法生成 AVIF] → `build-presets.sh` 启动即检测并给出明确安装/回退提示；生成物已入库，普通克隆不需要重跑。
- [Chrome <85 不支持 AVIF] → 项目运行环境是 Chrome，README 注明要求 Chrome 85+；不做运行时回退。
- [WebP q78 → AVIF q55 的一次代际损失] → PSNR 均值 43.34 dB；6 张大图目视验收；不满意时用 `--quality 55` 以上或局部提质量。
- [渐变图色带] → `solid` 保持 WebP q78；其它分类如出现明显色带，再按条目覆盖质量。
- [PSNR 与观感不一致] → 门禁只做兜底，最终以目视验收为准；报告保留每类体积便于定位。
- [生成物 diff 变大（约 4.5MB）] → 只在素材或编码变更的提交中出现；比当前 8MB diff 更小。
- [打包时间增加（AVIF 编码慢）] → 只在素材变更时运行；38 张全量转码在开发机可接受。

## Migration Plan

1. 修改 `scripts/build-presets.py`：增加 `--format`/`--quality`，新增 AVIF 转码步骤，改 `data_url()` 的 MIME，缩略图改 128 q60，加报告与门禁。
2. 修改 `scripts/build-presets.sh`：检测 AVIF 支持，默认传 `--format avif --quality 55`。
3. 运行一次 `./scripts/build-presets.sh`，重新生成 `js/presets-data/`，确认体积约 4.55MB。
4. 抽样 PSNR + 6 张大图目视验收；必要时调整默认 quality。
5. `file://` 手测：打开弹窗、切换分类、应用预置、透明叠层 alpha、导出 PNG。
6. `./build.sh --zip` 后解压产物，重复手测；确认产物不含 `presets/`。
7. 更新 `scripts/README.md`、`README.md`、`AGENTS.md`。
8. 回滚：`./scripts/build-presets.sh --format webp --quality 78` 重建 WebP 生成物；运行时无需改动。

## Open Questions

- 默认档位最终取 q55 还是 q50：以 6 张大图的目视对比为准，默认先 q55。
- `solid` 是否在后续变更中改为 CSS 渐变以彻底移除 28KB：本次不做。