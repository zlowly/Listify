# Tasks

## 1. 打包脚本与编码

- [x] 1.1 `scripts/build-presets.py` 增加 `--format avif|webp` 与 `--quality <n>` 参数，默认 `avif` / `55`；格式与质量只从参数读取，不从环境变量猜测。验证：`python3 scripts/build-presets.py --help` 列出两个参数，缺省运行输出 `format=avif quality=55`
- [x] 1.1a 用 6 张最大图校准 ImageMagick/libheif 的 `-quality` 映射：以 PSNR ≈ 43 dB、全库 base64 ≈ 4.4MB 为目标，记录实际 quality 与体积；若与 Pillow 的 q55 不等价，把校准值写回默认参数。验证：校准报告列出每张的 quality、字节数、PSNR，全量预估落在门禁内
- [x] 1.2 新增独立转码步骤：从 `presets/<cat>/*.webp` 生成 AVIF 到临时目录，读取字节后删除临时文件；**不得覆盖 `presets/` 源图**。验证：打包前后 `find presets -name '*.webp' -newer VERSION` 无变化，`presets/` 中无 `.avif` 文件
- [x] 1.3 `data_url()` 按实际编码写 MIME：`data:image/avif;base64,` 或 `data:image/webp;base64,`。验证：`grep -c "data:image/avif" js/presets-data/*.js` 合计为 34，`solid.js` 只含 `data:image/webp`
- [x] 1.4 `solid` 分类强制使用 WebP q78；其它分类使用所选格式与质量。验证：`solid.js` 只含 `data:image/webp`，其余分类块只含 `data:image/avif`
- [x] 1.5 缩略图改为 128px WebP q60，尺寸规则不变（不透明图适配 160×200 框、透明图居中裁剪），文件名仍为 `thumb-<id>.webp`。验证：索引中的缩略图解码后长边为 128（透明图为 128×128），`index.js` 体积 ≤ 200KB
- [x] 1.6 打包结束输出体积报告：每类原图字节 / base64 字节 / 条目数 / 最大条目，总 base64 字节，以及相对旧索引的差值。验证：报告能被重定向到文件并用于提交说明
- [x] 1.7 增加门禁并在超限时失败：总 base64 > 5.0MB、单条 data URL > 700KB、单个分类块 > 700KB、抽样 PSNR 均值 < 40 dB。验证：临时把 `--quality` 设为 90 触发体积门禁，脚本非零退出并打印超限项
- [x] 1.8 `scripts/build-presets.sh` 检测 `magick` 的 AVIF 支持（默认格式为 avif 时），缺失则报错并提示安装 libheif 或 `--format webp`；透传 `--format`/`--quality`。验证：在无 AVIF 支持的 magick 环境下运行，脚本在编码前失败并给出可操作提示

## 2. 生成物与质量验收

- [x] 2.1 运行 `./scripts/build-presets.sh` 重新生成 `js/presets-data/`。验证：`du -cb js/presets-data/*.js | tail -1` 约 4.4–4.7MB，产物文件与索引 `chunkMap` 列出的块名一一对应（含拆片）
- [x] 2.2 抽样计算 PSNR（源 `presets/*.webp` vs 生成 AVIF，至少 6 张最大图）。验证：均值 ≥ 40 dB，单张 ≥ 28 dB；结果记录在变更说明中
- [x] 2.3 目视验收 6 张大图（watercolor-texture、rose、newsprint、hearts-pattern、watercolor-bouquet、vintage-frame），重点看渐变、半透明边缘、细纹理。验证：无可见色带/块效应/alpha 毛边；不满意时只对问题条目提高质量后重跑
- [x] 2.4 检查尺寸与透明通道：所有 AVIF 长边 = 1400（源小于 1400 的保持原尺寸），透明图 alpha 仍在。验证：`magick identify` 遍历生成临时文件，格式为 AVIF，透明图 `%[opaque]` 为 false
- [x] 2.5 检查索引与分类块结构未变：`index.js` 仍含 `categories`/`items`/`thumb`/`chunkMap`/`chunks`，分类块仍为 `id -> data URL`。验证：`js/presets.js` 不改动即可加载（见 3.1）

## 3. 运行时与构建验证

- [x] 3.1 `file://` 打开 `index.html`：打开「选择背景图」弹窗，切换全部/6 个分类，缩略图正常显示。验证：控制台无解码错误，缩略图清晰度与现状无明显差异
- [x] 3.2 应用预置三条链路（整套 / 加图 / 替换），包括透明叠层的 `original` 定位与半透明效果。验证：背景集、全局背景、页面背景行为与现状一致，无位置/尺寸漂移
- [x] 3.3 导出 PNG：完整页面与仅歌单层各一次，含透明叠层。验证：导出成功、无挂起，叠层 alpha 正确，成品视觉与现状一致
- [x] 3.4 `./build.sh --zip` 构建并解压 `dist/listify-<版本>.zip` 到临时目录，用 `file://` 重复 3.1–3.3。验证：产物索引与分类块齐全，`?v=` 生效，`dist/` 中无 `presets/` 与 `scripts/`
- [x] 3.5 回退演练：`./scripts/build-presets.sh --format webp --quality 78` 重建 WebP 生成物，确认运行时同样可用；再切回 AVIF。验证：两次生成物都可加载，回退不涉及运行时改动

## 4. 文档与收尾

- [x] 4.1 更新 `scripts/README.md`：预置编码格式（AVIF q55 / solid 例外 / 缩略图 128 q60）、`--format`/`--quality` 用法、AVIF 工具依赖与回退方式。验证：按 README 从零跑一遍可复现生成物
- [x] 4.2 更新 `README.md`：浏览器要求 Chrome 85+、预置体积说明、静态分享包大小变化。验证：文档中的体积数字与实际 `du` 结果一致
- [x] 4.3 更新 `AGENTS.md` 的预置库条目：生成格式、源图仍为 WebP、不得把 AVIF 回写 `presets/`。验证：`grep -n "AVIF\|avif" AGENTS.md` 命中新增说明
- [x] 4.4 记录本次体积对比（8.25MB → 约 4.55MB，-45%；缩略图 246KB → 167KB）到提交说明或变更说明。验证：数字与 2.1 的 `du` 输出一致

## Workflow follow-up

- 按项目评审要求确认后归档本变更，并验证主 specs 已同步 `background-layer`、`release-build`、`code-architecture` 的更新。