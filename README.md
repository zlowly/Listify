# Listify · 歌单排版生成器

把纯文本歌单排成适合手机分享的图片版面。导入 `#分类` + 歌名格式的文本后，自动计算列宽、动态行数与续表，做少量调整即可导出 PNG。

纯前端静态应用：**零安装、零构建、无后端、无网络请求**，文件始终留在本机浏览器中。

## 特性

- **文本歌单导入**：支持 BOM / 无 BOM、UTF-8 / GBK 编码；`#分类名` 开始一个分类，其后的非空行为歌名；带未分类、重名校验与重复导入确认。
- **歌单编辑**：左侧分类列表，弹窗内可改名、增删改歌名、粘贴多列文本、排序与跨分类移动。
- **自动排版**：按视觉字宽计算（中文/全角字符 = 2，拉丁字符 = 1），支持列优先 / 行优先两种填充顺序、自动/手动列宽、动态行数与满页自动续表。
- **分类块**：标题与歌名两个子分区可分别设置字体列表、字号、粗细、颜色、行距、对齐、阴影与轮廓；新建块继承同页最近同类型块的文字样式快照。
- **多页画布**：页面增删切换、页面尺寸与四边边距（数值输入或画布拖拽）、10%–400% 缩放、适应窗口。
- **背景层**：每页拥有自己的背景（填充色 + 有序图片/图形条目叠加）；单图支持原大小/横向占满/竖向占满/最适合/自定义、透明度、模糊、亮度、色相、透明度渐隐（位置/转场宽度/角度/两端透明度）、旋转。任意页可设为全局背景（来源页指针、最后设置生效，取消后各页恢复自己的背景）；全局期间其它页背景只读，可跨页复制整页背景。
- **预置背景库**：背景选择弹窗内置 38 个免费素材，按 6 个分类组织（纸张纹理、纯色渐变、山水风景、花卉植物、图案插画、透明叠层），点击即可应用/加图/替换；完整素材为长边 1400 的 AVIF（`solid` 渐变固定 WebP，避免色带），整个生成物约 4.9 MB；分类与显示名由 `presets/manifest.json` 配置；素材来源与许可见 `presets/SOURCES.md`。
- **自由文字、图片与图形**：自由图片可从文件添加或 `Ctrl/Cmd + V` 粘贴剪贴板图片，支持位置/尺寸数值编辑、旋转、透明度、模糊、亮度、色相、渐隐与等比缩放开关。图形工具可拖拽绘制或单击插入方形/菱形，画一次即退出并选中新图形，支持 0–90° 内夹角、带符号圆角（正值外凸、负值内凹）、实心/边框、内侧边框厚度，以及和图片一致的不透明度、模糊、调色与渐隐；工具栏入口只添加内容图形，页面背景卡片的「＋ 图形」入口添加背景图形，背景图形可与图片任意交错叠放。
- **图片调色与渐隐**：背景图、自由图片与图形都可逐张调亮度（50%–150%，默认 100%）与色相（-180°–180°，默认 0°），并可开启单向/双向透明度渐隐，参数比照 Kdenlive 的 Alpha Gradient：位置、转场宽度、0–360° 角度（0° 自上而下、顺时针递增，方向随图片旋转）、顶部/底部透明度；单向的位置是坡起点、宽度是坡长，双向的位置是不透明带中心、宽度是带宽，因此上下坡可以不等长；切换模式会重置为该模式预设（角度保留）。最终不透明度 = 基础透明度 × 渐隐系数，渲染顺序为模糊 → 调色 → 渐隐，渐隐只改透明度而不改颜色、几何与命中，背景图仍按页面裁剪。控件**默认隐藏**，点属性分组标题右侧的「高级」开关才展开（会话级界面状态，不写入项目、不触发重绘）；开关关闭且图片有非默认值时，旁边显示「已调整」。这些字段在项目版本 3 及以后的版本中可选（当前项目版本 5），旧项目按默认值加载，保存时写出明确数值；复制背景、替换图片与应用预置素材都会保留已设置的数值。
- **导出**：PNG 支持当前页/所有页、完整页面/仅歌单层透明底，多页自动打包为 ZIP。
- **本地草稿**：项目结构与图片资产都存 `IndexedDB`（`draftMeta` 存结构化项目快照，`assetBlobs` 存二进制图片，`assets` 仅保留旧版 base64 记录供读取；恢复时统一交付纯 base64，`data:` 前缀会被剥除），页面隐藏或关闭时才同步写一次 `localStorage` 兜底；刷新或重新打开自动恢复。项目可导出/导入 JSON（当前版本 5，兼容 v1–v4 旧文件迁移）用于备份与跨浏览器迁移。
- **编辑辅助**：最近 20 步撤销（`Ctrl/Cmd + Z`）、键盘放置分类、焦点环、原生 `<dialog>` 模态对话框与字段可访问性标注。

## 快速开始

1. 使用 Chrome **85+** 打开仓库根目录的 `index.html`（直接双击，`file://` 即可运行；预置素材为 AVIF，需要 Chrome 85+ 解码支持）。
2. 点击左侧「导入歌单」选择 `.txt` 文件，或把文件拖入左栏；没有素材时可点「导入示例歌单」。
3. 把左侧分类拖到画布上，或点击/回车放到当前页底部。
4. 在右侧属性面板调整页面、分类块、表格与背景。
5. 点击右上角「导出 PNG」。

无需安装依赖、启动服务器或联网。

## 歌单格式

```text
#分类1
歌名1
歌名2

#分类2
歌名3
歌名4
```

- 第一个 `#` 之前的歌名归入「未分类」。
- 歌名前后空白会被忽略，空行无意义。
- 分类名与歌名在导入完成后保持唯一：同名分类会合并到第一次出现的分类，重复歌名保留第一次出现、后续行跳过并提示；重复导入会先提示覆盖。
- 示例文件见 `samples/`（UTF-8、GBK、BOM 等测试用例与 21 首示例）；`samples/duplicate.txt` 是“去重成功”样例，可验证同名分类合并与文件内重复歌名跳过。

## 常用快捷键

| 快捷键 | 作用 |
| --- | --- |
| `Ctrl/Cmd + Z` | 撤销最近一步（最多 20 步） |
| `Delete` / `Backspace` | 删除选中元素 |
| `Esc` | 回到页面选择 / 关闭浮层 |
| `Ctrl/Cmd + V` | 粘贴剪贴板图片（画布上） |
| `Ctrl/Cmd + 滚轮` | 缩放画布 |

## 目录结构

```text
Listify/
├── index.html          # 入口页面（经典 <script defer> 按依赖顺序加载，DOM 就绪后启动）
├── style.css           # 全站样式与设计令牌
├── js/
│   ├── app.js          # 应用编排：状态、撤销、选择、页面管理、意图动作与公开 API
│   ├── app-chrome.js   # 装饰层与选择框绘制、手柄命中、光标
│   ├── app-viewport.js # 画布表面、分层重绘、缩放与滚动
│   ├── app-interactions.js # 指针拖拽、行内编辑、分类拖放
│   ├── app-presets.js  # 预置素材应用
│   ├── app-backgrounds.js # 页面背景、全局来源页与背景图控制
│   ├── app-draft.js    # 草稿防抖保存、恢复与错误上报
│   ├── app-import-export.js # 歌单与项目导入导出
│   ├── assets.js       # 图片资产缓存、哈希、Base64/Blob 与下载工具
│   ├── model.js        # 数据模型、默认值、字体、样式与几何
│   ├── layout.js       # 字宽测量、表格列宽与填充/续表算法
│   ├── render.js       # 画面渲染
│   ├── project-schema.js # 项目校验与旧版背景迁移
│   ├── project-io.js   # 项目序列化、构建与文件加载
│   ├── draft-store.js  # IndexedDB / localStorage 草稿存储
│   ├── io.js           # 兼容聚合层（合并上述三个模块为 L.io）
│   ├── ui.js           # 侧栏、页面标签、帮助提示与事件委托
│   ├── ui-fields.js    # 表单字段工厂与 <details> 分组折叠
│   ├── ui-modal.js     # 原生 <dialog> 模态框与 Esc/遮罩关闭
│   ├── ui-pickers.js   # 预置选择与复制背景弹窗
│   ├── ui-playlist-editor.js # 歌单编辑器
│   ├── ui-property-panel.js  # 页面/背景/分类/文字/图片属性面板
│   ├── import.js       # 文本导入与编码处理
│   ├── playlist-export.js # 歌单文本导出
│   ├── export.js       # PNG / ZIP 导出
│   ├── zip.js          # 纯 JS ZIP 打包
│   ├── fontpicker.js   # 本机字体选择
│   ├── clipboard-image.js
│   ├── dev-checks.js   # 控制台自检（开发期文件，不进入 dist）
│   └── presets-data/   # 预置索引与分类数据块（打包生成文件，勿手改；单文件超 700KB 时按 `<分类>-N.js` 分片）
├── vendor/             # 随仓库分发的 LeaferJS UMD（唯一运行时依赖）
├── presets/            # 预置素材（6 个分类目录）、manifest.json 配置与 SOURCES.md
├── scripts/            # 开发期脚本：预置打包与自产素材生成（见 scripts/README.md）
├── samples/            # 示例歌单与测试素材
├── docs/               # 原始需求文档
├── openspec/           # 能力规范（specs）与已归档变更
├── DESIGN.md           # 设计系统与视觉规范
├── PRODUCT.md          # 产品定位、用户与约束
├── AGENTS.md           # 开发约定与易错领域规则
├── LICENSE             # MIT 许可证
├── VERSION             # 唯一版本号来源（语义化 x.y.z）
└── build.sh            # 发布打包脚本（运行时不参与构建）
```

## 开发约定

- 运行时保持零构建：不引入打包器、包管理器、转译步骤或 CDN；`file://` 下不能使用 ES module，脚本一律用经典 `<script defer>` 标签，按 `index.html` 中的顺序执行，并在 `DOMContentLoaded`（或已就绪时立即）启动应用。
- 用户可见文案使用中文，标识符使用英文。
- 新增文件优先拆分为普通 `js/*.js` 模块，挂载到 `window.Listify` 命名空间；依赖必须单向：`model/assets/layout → project-* / draft-store → ui-* → app-* → app.js`。
- UI 不直接写模型字段：属性面板通过 `L.app.setElementField` / `setElementStyleField` / `setBackgroundColor` / `setBackgroundImageField` 等意图方法修改并触发局部重绘。
- 工具函数只保留一份实现：`model.clamp`、`model.clone`、`L.assets.downloadBlob`、`ui.esc`。
- 文件导入只能经用户手势（`<input type="file">` / 拖放），不能访问后端或额外文件系统能力。
- 纯逻辑回归检查：`node --test scripts/checks/*.test.js`（零依赖，不需要安装 npm 包；不覆盖 canvas 绘制、交互与 IndexedDB）。交互与导出仍需在浏览器中手动验证。
- `js/dev-checks.js` 只在开发期手动注入，`./build.sh` 拷贝阶段排除并断言产物不含该文件。
- `js/app.js` 的 `BUILD` 是占位常量，构建时由 `./build.sh` 按 `VERSION` 注入，始终与 `?v=` 一致。

领域细节（字宽规则、图层顺序、页面背景语义等）见 `AGENTS.md` 与 `openspec/specs/`。

## 构建与发布

`build.sh` 只做拷贝、版本注入和可选打包，不改变运行时语义；`dist/` 已被忽略，构建不会修改源文件。

```bash
./build.sh                 # 生成 dist/
./build.sh --zip           # 额外生成 dist/listify-<version>.zip
./build.sh --pages --dry-run
./build.sh --zip --pages   # 发布到 origin/gh-pages（需交互确认）
```

- 版本号只维护在 `VERSION` 中，构建时为 `index.html` 里的本地资源引用注入 `?v=<version>`。
- 构建会校验预置生成物：索引 `chunks` 列出的分类块必须齐全、每块至少含一条 data URL，且 AVIF 生成物的 base64 合计 ≤ 5.0 MB、单块 ≤ 700 KB；WebP 回退生成物超限只警告。
- `--pages` 仅在 `origin` 指向 GitHub 仓库时可用；当前 AtomGit 远程会被脚本拒绝发布。

## 数据与隐私

- 所有歌单文本、图片与项目数据只在浏览器本地处理，不上传任何服务器。
- 自动草稿依赖当前浏览器的本地存储，可能因清除浏览数据、更换浏览器配置或存储压力而丢失；重要项目请使用「导出项目」生成本地 JSON 备份。
- 仅保证 Chrome 下的使用体验（需要 Chrome 85+），不做跨浏览器兼容承诺。

## 预置素材与推荐素材库

「选择背景图」弹窗内置 38 个免费预置素材，按 6 个分类组织：纸张纹理 6、纯色渐变 4、山水风景 6、花卉植物 6、图案插画 7、透明叠层 9。整套应用背景图会替换当前页背景（建议填充色 + 该图）；透明叠层默认以原大小加入当前页背景，作为覆盖装饰；本地图片仍走原有文件选择流程。打开弹窗只加载索引（缩略图与元数据）；各分类素材在悬停约 300ms 或按下时预取，脚本注入推迟到独立的异步任务，`file://` 下离线可用。索引里的 `chunkMap` 记录每个分类由哪些分片文件组成（单文件超过 700KB 时自动拆成 `<分类>-N.js`），运行时并发加载后合并。

分类、分类名与每张图的显示名由 `presets/manifest.json` 决定；改完必须运行 `scripts/build-presets.sh` 重新打包才生效（弹窗运行时不读配置文件，这是 `file://` 的限制）。

- 编码：完整素材为长边 1400 的 AVIF（`data:image/avif`），`solid` 分类的渐变固定 WebP q78（`data:image/webp`，避免色带）；索引缩略图统一为长边 128 的 WebP。整个 `js/presets-data/` 约 4.9 MB（旧版全 WebP q78 为 8.25 MB，−38%）。
- 静态分享包：`./build.sh --zip` 产物从旧版的约 6.1 MB 降到约 3.9 MB（−36%）。
- 源图仍是 `presets/**/*.webp`（长边 ≤1400、q78）：AVIF 只是打包生成物，不回写 `presets/`，因此可以随时用 `--format webp --quality 78` 回退，不会累积画质损失。
- 打包脚本会执行体积与画质门禁（总 base64 ≤ 5.0 MB、单条 ≤ 700 KB、单块 ≤ 700 KB、抽样 PSNR 均值 ≥ 40 dB），细节见 `scripts/README.md`。

- 素材来源与许可：`presets/SOURCES.md`（Pexels 照片遵循 Pexels License；Pixabay 素材遵循 Pixabay Content License；Listify 自产 5 张为 CC0）
- 新增/替换素材、改分类名、改自产素材外观、发版分别用哪个脚本：`scripts/README.md`
- 推荐补充素材库（免费可商用，中国大陆可直连）：
  - [Pexels](https://www.pexels.com/) — 照片，Pexels License
  - [Pixabay](https://pixabay.com/) — 照片与插画，Pixabay Content License
  - [Unsplash](https://unsplash.com/) — 照片，Unsplash License
  - [OpenGameArt](https://opengameart.org/) — 游戏美术素材，单件许可需逐一确认（优先选 CC0）
- 在线生成纹理（免费、免登录；导出 PNG 后直接拖入弹窗，建议 1080×1920，2 倍图 2160×3840）：
  - [Creatica](https://creatica.app/backgrounds) — 59 种无缝纹理 / 图案 / 渐变生成器，SVG 与 PNG 导出
  - [Haikei](https://app.haikei.app/) — 波形、渐变、低多边形等参数化背景，可自定义画布尺寸与配色

## 文档

- 原始需求：`docs/歌单生成器需求.md`
- 能力规范：`openspec/specs/`（导入、分类布局、页面编辑、背景层、PNG 导出、项目持久化、发布构建等）
- 历史变更：`openspec/changes/archive/`
- 视觉规范：`DESIGN.md`
- 产品定位：`PRODUCT.md`

## 许可证

本项目采用 [MIT License](LICENSE) 发布。

`vendor/` 目录中的 LeaferJS 属于第三方依赖，遵循其自身许可，不在本项目的 MIT 许可范围内；再分发时请保留其原始许可声明。

`presets/` 目录内嵌的免费照片与插画遵循各自许可（详见 `presets/SOURCES.md`）：Pexels 素材遵循 Pexels License，Pixabay 素材遵循 Pixabay Content License，均不在本项目 MIT 许可范围内；再分发时请保留其原始许可声明。
