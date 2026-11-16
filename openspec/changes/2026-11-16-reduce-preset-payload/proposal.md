# Proposal

## Why

预置库的 38 张素材目前统一按长边 1400、WebP q78 生成并 base64 内嵌，`js/presets-data/` 合计 8.25MB：分类块里的 base64 数据 7.98MB，索引 0.26MB（其中缩略图 0.25MB）。体积集中在少数大图：6 张图贡献约 4MB，`overlay` 与 `pattern` 两类合计占 74%。

这份体积会进入每次克隆、每个静态分享包，并在 `file://` 打开弹窗或应用预置时被解析。页面成品只需要 1400 长边，因此可以只换编码格式、不动分辨率来减重。

实测（38 张全库、长边 1400 不变）：

- WebP q78（现状）：base64 后 7.98MB，基准。
- AVIF q55：base64 后 4.38MB（-45%），PSNR 均值 43.34 dB。
- AVIF q50：base64 后 3.70MB（-54%），PSNR 均值 42.66 dB。

AVIF 的运行时链路已在 HeadlessChrome 151 的 `file://` 下验证：`data:image/avif` 与 `blob:` 均可加载，`getImageData` 正常（透明通道 `minAlpha=0`），`toBlob`、`createImageBitmap` 均通过。

## What Changes

- 完整素材保持长边 1400，编码从 WebP q78 改为 **AVIF q55**；分类块与索引中的 data URL MIME 改为 `data:image/avif`。
- `solid` 分类的 4 张渐变图保持 WebP q78：大面积渐变对低质量编码更敏感，避免色带；分类块允许混合 MIME。
- 缩略图从 160px WebP q72 改为 **128px WebP q60**（数据 -32%，解码更快）；缩略图不转 AVIF（实测小图 AVIF 解码更慢）。
- `scripts/build-presets.py` 增加输出格式与质量参数（默认 `avif`/`q55`），新增独立编码步骤：从 `presets/*.webp` 转码到临时文件，**不覆盖 `presets/` 源图**，避免重复打包产生累积损失。
- `scripts/build-presets.sh` 增加 ImageMagick 的 AVIF 能力检测；缺失时明确报错并提示 `--format webp` 回退。
- 打包期增加体积与画质门禁：输出每类体积报告；总 base64 体积 ≤ 5.0MB、单条 data URL ≤ 700KB、单个分类块 ≤ 700KB；超限即失败。抽样计算 PSNR，均值低于 40 dB 时失败。
- 重新生成 `js/presets-data/` 并入库；更新 `scripts/README.md`、`README.md`、`AGENTS.md` 的预置编码与构建依赖说明。
- 预期产物：8.25MB → 约 4.55MB（-45%）。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `background-layer`: 明确预置完整素材的编码格式、分辨率、缩略图规格、体积目标与 `solid` 例外；运行时按 data URL 的 MIME 解码，不引入格式特性检测。
- `release-build`: 预置生成物的格式/体积门禁、AVIF 工具检测与 WebP 回退、产物完整性校验。
- `code-architecture`: 零构建约束不变，明确 AVIF 编码器只是开发期可选工具，运行时不得引入解码库、WASM 或网络请求。

## Impact

- 修改：`scripts/build-presets.py`、`scripts/build-presets.sh`、`scripts/README.md`、`README.md`、`AGENTS.md`。
- 重新生成：`js/presets-data/` 下全部索引与分类块（data URL 内容与 MIME 变化，文件结构不变）。
- 不变：`presets/manifest.json`、`presets/` 源图格式与路径、`js/presets.js` 加载器、`js/app-presets.js` 应用链路、`js/assets.js` 资产管线、项目持久化格式、`index.html` 脚本引用、`build.sh` 的产物清单与版本注入逻辑。
- 兼容性：目标浏览器为支持 AVIF 的 Chrome 85+；项目现有运行环境即 Chrome，不新增运行时回退。