# Tasks

## 1. 素材与配置重组

- [x] 1.1 建立 `presets/texture|solid|landscape|floral|pattern|overlay/` 六个分类目录，把保留的 11 张旧素材转码为 `.webp` 并归位；验证：`find presets -name '*.webp' | wc -l` 恰好 11 且没有残留在 `presets/` 根下
- [x] 1.2 迁入 27 张 Pixabay 素材并统一重编码为长边 1400、WebP q78，按附录文件名落位；验证：`magick identify` 遍历 38 个文件，格式全为 WEBP 且长边 ≤ 1400，透明图保留 alpha
- [x] 1.3 删除 `light-spot`、`thin-border`、`flower-corner` 与 `ivyleaf.png`，同步移除 `gen-selfmade` 中对应产出；验证：`grep -r "light-spot\|thin-border\|flower-corner\|ivyleaf" presets scripts` 无结果
- [x] 1.4 按 design 附录编写 `presets/manifest.json`（6 分类、38 条显示名、来源许可、`version`/`showAll`）；验证：配置条数与磁盘文件一一对应，`python3 -c "import json;json.load(open('presets/manifest.json'))"` 通过
- [x] 1.5 编写 `presets/SOURCES.md`，记录 27 张 Pixabay Content License、6 张 Pexels License、5 张自产 CC0，并声明第三方素材不适用 MIT；验证：38 条来源与配置逐条对账无遗漏

## 2. 打包脚本与生成物

- [x] 2.1 新增 `scripts/build-presets.py`：读取并校验配置（缺显示名、引用缺失文件、分类 id 冲突即失败并指出条目；未登记文件警告跳过，`hidden` 静默跳过），推导不透明图建议色，驱动 magick 归一化与 160px 缩略图；验证：故意删一条显示名运行，脚本失败并打印该条目
- [x] 2.2 新增 `scripts/build-presets.sh` 入口：检查 `magick -list format` 含 WEBP、准备临时目录、调用 py；验证：`./scripts/build-presets.sh` 一条命令成功退出并产出 `js/presets-data/` 下 7 个文件
- [x] 2.3 生成物按约定结构输出：`index.js` 含分类、items、160px 缩略图与 `chunks` 数组；每个分类块只含 `id -> data URL`；验证：`grep -c "data:image/webp" js/presets-data/*.js` 与各分类张数一致，索引中无完整图数据
- [x] 2.4 把 `gen-selfmade.sh` / `gen-selfmade.py` 迁入 `scripts/` 并只保留 4 张渐变与颗粒叠层；验证：重跑后 5 个文件尺寸与预览与改造前一致，脚本不再生成被删素材
- [x] 2.5 新增 `scripts/README.md`，按场景说明用哪个脚本：新增/替换素材与改分类名 → `build-presets.sh`；改自产素材外观 → `gen-selfmade.sh` 后再打包；发版 → 根目录 `build.sh`；验证：照 README 从零跑一遍能复现生成物
- [x] 2.6 删除 `presets/pack.sh`、`presets/pack.py` 与 `js/presets-data.js`；验证：`grep -rn "presets-data\.js\|pack\.py\|pack\.sh" --exclude-dir=openspec .` 只命中新 loader 的说明或零命中

## 3. 运行时加载与弹窗

- [x] 3.1 重写 `js/presets.js`：暴露 `DATA_VER`，加载索引，按分类加载块并复用并发请求，提供 `hydrate(item)` 与失败重试；验证：控制台删除某块文件后点击瓦片，出现中文 toast 且可重试
- [x] 3.2 改造 `js/ui.js` 弹窗：标签由索引分类生成（最前「全部」、默认选中），切标签/悬停标签或瓦片触发预取，未就绪瓦片显示加载态，保留本地图片瓦片、拖入与素材链接区；验证：六个标签顺序与配置一致，切换时网络/磁盘只加载对应块
- [x] 3.3 在 `js/app.js` 的 `applyPreset` 入口 await hydrate，加载失败时提示并保持背景集不变；验证：块加载失败时点击预置，背景库与页面背景均无变化
- [x] 3.4 回归预置应用三条链路（整套 / 加图 / 替换）与 `kind` 决定的默认定位、建议色与深色提示；验证：透明分类的图默认 `original`，背景分类默认 `cover`，深色图出现提示 toast
- [x] 3.5 素材指引区改为两组：保留「更多免费素材」四站，新增「在线生成纹理」组（Creatica、Haikei），tooltip 注明许可/用法与建议导出尺寸 1080×1920（2 倍 2160×3840、PNG）；沿用静态常量结构，不新增网络请求；验证：两行分组显示且 hover 有说明，断开网络打开弹窗无任何请求；README 的素材库小节是否同步由 5.1 一并处理

## 4. 构建与发布

- [x] 4.1 `build.sh` 的产物拷贝改为 `find js vendor -type f`，保留子目录结构；验证：产物存在 `dist/js/presets-data/index.js` 与 6 个分类块
- [x] 4.2 版本注入从改写 `DATA_SRC` 改为改写 `js/presets.js` 的 `DATA_VER`，索引与分类块共用；验证：`VERSION=1.0.0` 构建后产物中常量为 `1.0.0`，`dist/index.html` 仍为 16 处 `?v=1.0.0`
- [x] 4.3 构建增加分类块完整性校验：读取索引 `chunks`，逐个断言产物中存在，缺失即失败并指名；验证：临时删除一个块再构建，构建失败并打印缺失块名
- [x] 4.4 确认产物不含开发期文件；验证：`find dist -path '*scripts*' -o -path '*presets*'` 无结果

## 5. 文档与集成验证

- [x] 5.1 更新 `README.md`：预置库改为 6 分类说明、配置文件用法、脚本位置与使用场景、许可段落；验证：按 README 描述能找到 `presets/manifest.json`、`scripts/README.md`，且分类名与配置一致
- [x] 5.2 浏览器手测完整流程（`file://` 打开）：打开弹窗 → 六个分类与全部标签 → 点背景图/透明图应用到当前页与全局 → 加图与替换 → 拖入本地图 → 深色提示 → 导出 PNG；验证：每一步符合 specs 场景，控制台无报错
- [x] 5.3 `./build.sh --zip` 后解压 `dist/listify-<版本>.zip` 到临时目录并用 `file://` 打开，重复 5.2 的弹窗与导出检查；验证：zip 内的索引与分类块全部可加载，版本参数生效

## Workflow follow-up

- 按项目评审要求确认后归档本变更，并验证主 specs 已同步 `background-layer` 与 `release-build` 的更新。
