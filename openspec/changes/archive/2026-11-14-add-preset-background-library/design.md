# Design

## Context

- 现状：项目级背景库 `project.backgrounds[]`（填充色 + 有序图片列表），每张图片引用 `assetId`；所有图片经 `L.assets` 资产管线——上传时 `FileReader`→blob→`addFile`（内容 hash 去重），渲染/导出用 blob 的 objectURL（`blob:`）加载 `Image`。
- 硬约束：零构建、`file://` 可开、无网络、无新运行时依赖；`fetch()`/XHR 在 `file://` 下被浏览器 CORS 禁止，但 `<img>` 与 `<script>` 标签可以加载本地文件。
- 关键实测（2026-11-13，HeadlessChrome 157，测试页留存在 `/tmp/listify-spike/compare.html`）：

  | 图片来源 | 结果 |
  |---|---|
  | `file://` 相对路径本地图 | `drawImage` 成功，但 `getImageData` 抛 SecurityError（画布被污染），**`toBlob` 回调永不触发** |
  | base64 `data:` URL | `toBlob` 成功 |
  | `blob:` objectURL（现有上传路径） | `toBlob` 成功 |

  而 PNG 导出（`js/export.js` 的 `canvasToBlob`）依赖 `toBlob` 回调——画布一旦被 `file://` 图片污染，导出 Promise 永不 settle，表现为导出无限挂起。这解释了现有 App 为什么把上传图片转成 blob 再用：**blob/data 来源不污染画布，file:// 来源污染**。

## Goals / Non-Goals

**Goals:**
- 用户在选背景的同一入口里一键套用预置背景/叠层，或像现在一样选本地图片。
- 预置素材完全离线可用，且不影响 PNG 导出、项目保存/加载、草稿、多页共享与资产释放的任何现有行为。
- 项目 JSON 保持自包含：应用过预置的项目在任何环境都能加载导出。

**Non-Goals:**
- 不做在线素材市场、用户自定义预置、预置编辑/再分发。
- 不改背景库模型（背景集、图片条目、全局模式的数据结构均不变）。
- 不引入渐变填充色等新背景能力（填充色仍是单色）。

## Decisions

### D1. 物化进现有资产管线（而非引用式）

应用预置时，把清单中的 base64 转 blob（`model.base64ToBlob`），包装成 `File` 后走现有 `L.assets.addFile`（hash 去重、meta 记录、objectURL 生成全部复用），背景图片条目的 `assetId` 存产生的 hash ID。

- 备选 B（引用式：`assetId: "preset:x"`，项目 JSON 只存 ID）：JSON 体积恒定，但需要改三处持久化（`collectReferencedAssetIds` 排除、`validateProject` 认清单、`loadImage` 加清单分支），且项目加载将依赖 App 随附的清单版本，草稿恢复还有清单未加载的竞态。
- 备选 C（`file://` 直接引盘上文件）：已排除——实测画布污染导致导出挂起（见 Context）。
- 选择物化的理由：模型/持久化/导出/草稿/释放**零改动**；项目自包含；"预置图片"从此就是普通图片，所有既有背景图行为（透明度、模糊、顺序、替换、画布编辑）自动成立。代价是项目 JSON/草稿体积增加（每用过的素材 +200–400KB，hash 去重后每素材仅一份）——与用户自己上传一张图同量级，可接受。

### D2. 统一"选择背景图"弹窗（单一入口，来源是内容）

三个入口（页面属性 `[选择背景图]`、图层面板 `＋`、图片属性"替换图片"）都打开同一个弹窗；**入口决定模式（整套/加图/替换），内容决定来源（背景图预置/透明图预置/本地）**。

- 备选（每入口拆"预置/本地"双按钮）：本地少一步，但同一职责两个按钮、三个入口六处按钮，与用户偏好的 Windows 式单一入口相悖。
- 弹窗内：分类标签（全部/背景图/透明图）+ 缩略图网格 + 网格末尾虚线"本地图片"瓦片（点击打开文件选择；弹窗支持拖入文件）。纯色不入弹窗（用户已决定；填充色在背景集属性编辑）。
- 本地图片走现有用户手势读取链路，加图/替换语义不变；"整套模式 + 本地图片"是新增行为（新建集 cover 后指派）。

### D3. 分类轴 = kind（背景图/透明图）

素材按**用途**分类而非材质：`background`（整版主背景，默认 `cover`）与 `overlay`（带 alpha 的 PNG 叠层——颗粒、角光、边框、角饰，默认 `original` + 清单默认不透明度，对应背景集"第二张图"的用法）。分类即行为：kind 决定整套模式的建集方式与加图默认定位。

### D4. 背景集去重命名

整套模式应用预置时，先按名称"预置·X"（X=预置名称）查找背景集：存在则直接指派，不存在则新建（填充色=建议填充色，图片按 kind 默认定位）。避免用户点几个预置就在背景库堆积一次性空壳集；用户重命名过的集不会被误判（名称不再匹配则新建）。

### D5. 全局模式指派

整套模式应用时：全局背景开启 → 指派 `unifiedBackgroundId`（沿用现有"全局开关不覆写各页 backgroundId"规则）；关闭 → 指派当前页 `backgroundId`。

### D6. 清单懒加载 + 构建注入

- 清单数据放 `js/presets-data.js`（`window.LISTIFY_PRESETS = [...]`，classic script，开发时由脚本从 `presets/` 源文件生成并提交）；加载器放 `js/presets.js`（index.html 静态引用），**首次打开弹窗才动态注入** `js/presets-data.js?v=...` 的 `<script>` 标签（`file://` 下 script 标签不受 CORS 限制）。清单约 3.5MB，不进首屏。
- `build.sh`：`js/` 拷贝与 index.html 注入自动覆盖新文件（注入模式本就匹配 `js/` 前缀）；需新增一行 sed，把 `js/presets.js` 里的懒加载引用串也注入 `?v=<version>`（gh-pages 缓存正确性）。
- 清单加载失败：报错，弹窗本地瓦片仍可用（见 spec）。

### D7. 深色提示用建议填充色亮度

每个预置携带建议填充色 `color`。应用整套背景图后，按 `color` 的相对亮度（推荐阈值：亮度 < 0.35 视为深色）toast 提示"建议调亮歌名文字颜色"，不改任何数据。不引入 `tone` 字段——亮度从 color 计算即可。

### D8. 清单数据结构（每条目）

```
{ id, name, kind: "background"|"overlay",
  color,        // 建议填充色
  fit,          // 默认定位：background→cover，overlay→original
  opacity,      // 默认不透明度（overlay 可 < 1）
  thumb,        // data URL，约 160px
  data,         // data URL，完整素材
  source, license }  // 来源与许可，README credits 同源
```

`id` 为稳定 slug，只增不改不删（D1 物化后其实项目不依赖 id，但清单 UI 与调试依赖它稳定）。

### D9. 素材计划（14 个：10 背景图 + 4 透明图）

| 预置 | kind | 来源 | 加工 |
|---|---|---|---|
| 浅色纸 | 背景图 | 自制 | 2000×2000 JPEG，#faf7f2 + 4% 细颗粒 |
| 深色夜 | 背景图 | 自制 | 2000×2000 JPEG，靛蓝→近黑渐变 + 暗角 |
| 雾蓝 | 背景图 | 自制 | 2000×2000 JPEG，柔和蓝灰渐变 |
| 暖霞 | 背景图 | 自制 | 2000×2000 JPEG，桃色→淡紫渐变 |
| 米色纸 | 背景图 | Pexels 8824187（免费许可） | 长边 1600px、q80 |
| 深色旧纸 | 背景图 | Pexels 16557322（免费许可） | 长边 1600px、q80 |
| 云纹 | 背景图 | Pexels 55787（免费许可） | 长边 1600px、q80 |
| 蓝布 | 背景图 | Pexels 7794385（免费许可） | 长边 1600px、q80 |
| 羊皮纸 | 背景图 | Pexels 24285669（免费许可） | 长边 1600px、q80 |
| 黑纸 | 背景图 | Pexels 20818845（免费许可） | 长边 1600px、q80 |
| 颗粒叠层 | 透明图 | 自制 | PNG ~1200×1500，低 alpha 噪点 |
| 光斑角饰 | 透明图 | 自制 | PNG ~1200×1500，角落柔和径向光 |
| 细边框 | 透明图 | 自制 | PNG ~1200×1500，细圆角边框 |
| 花枝角饰 | 透明图 | OGA「Hand-Drawn Ivy Leaf」CC0（Rosy Lazenby），回退自制花枝 | 保留 alpha |

自制素材与打包（base64 + 160px thumb + 清单）由开发时脚本一次生成。生成脚本可调用本机已装系统工具（ImageMagick `magick`、python3/node 标准库），不引入任何项目依赖（无 package.json/CDN），产物提交进仓库。许可：全部 CC0 或自制（CC0 无需署名，仍记录来源 URL 于清单与 README credits）。

> 实施更正（2026-11-13）：rawpixel 四个直链全部 403（反爬），Wikimedia Commons / archive.org 本机不可达，Pixabay CDN 拒绝脚本请求；6 张背景照片改从 Pexels（免费许可，署名可选，URL 见 `presets/SOURCES.md`）下载；花枝角饰候选 OGA「Hand-Drawn Ivy Leaf」（CC0，Rosy Lazenby），若下载不可行则回退为自制花枝。生成脚本采用 ImageMagick 渲染（系统工具），纯标准库无法编码 JPEG，任务 1.4 措辞已同步放宽。

### D10. 代码落点

- `js/presets.js`（新）：清单懒加载器（Promise 化、失败上报）+ 预置数据访问。
- `js/presets-data.js`（新，生成）：清单数据。
- `js/ui.js`：统一弹窗（复用 `ui.modal.open`）、三入口按钮接线。
- `js/app.js`：应用处理器（物化 → 建集/加图/替换 → 去重 → 指派 → 选中 → 深色 toast → `persistDraftAssetQuietly`）。
- 渲染/导出/持久化：**零改动**（物化后走既有路径）。

### D11. 素材指引链接（弹窗底部）

外部素材库链接放在统一弹窗底部，与网格、本地瓦片形成"内置预置 → 本地图片 → 外部素材库"三层递进（同 PowerPoint"库存图片"模式）。收录 Pixabay / Unsplash / Pexels / OpenGameArt 四个站（用户选定），均 `target=_blank rel=noopener` 新标签页打开；App 自身零请求（是用户浏览器去访问，不是应用发请求）。

可达性验证（硬约束：中国大陆必须不受限直连；2026-11-13，GreatFire 实时测量 + 中文社区报告）：

| 站点 | https 主站 | 备注 |
|---|---|---|
| Pexels | 未屏蔽（2026-08） | 最稳，中文社区报告速度好 |
| Unsplash | 未屏蔽（2026-11，含 images 子域） | 偶有慢，可用 |
| Pixabay | 未屏蔽（2026-10-12） | 个别线路偶发拒连；浏览/下载无需登录 |
| OpenGameArt | 未屏蔽（2026-10） | 可达但下载偏慢 |

四站均未被屏蔽，满足"无需代理"约束；稳定性梯度见上表。链接列表为静态常量（`js/ui.js` 中 `[{name,url,note}]`），某站将来失效时按换预置素材的方式替换即可。README 增加"推荐素材库"一节，与弹窗列表一致。

## Risks / Trade-offs

- [rawpixel CC0 下载链接实施时可能失效/需登录] → 失败即用同来源同类素材替换（pixy.org、Wikimedia Commons CC0 分类），清单记录最终来源。
- [3.5MB 清单解析开销] → 懒加载，只有打开弹窗才付出；classic script 解析 ~3MB 约数十毫秒。
- [项目 JSON/草稿体积增长] → hash 去重（每素材一份）；本地应用、无上传场景；用户已有"上传图片内嵌 JSON"的同量级预期。
- [canvas 污染回归] → 已实测排除；物化链路只产 blob:/objectURL，与现有上传路径同构。实施回归时把"含预置页导出 PNG"列为必测。
- [预置观感与默认深色文字冲突] → D7 的 toast 提示；后续版本可考虑按亮度自动建议文字色（不在本次范围）。

## Migration Plan

纯增量：无项目数据迁移（JSON 版本保持 3）；回滚 = 还原 js 改动并删除新文件，已物化的用户项目不受影响（JSON 里是普通资产）。发布时升 `VERSION`（minor），`?v=` 注入保证缓存更新。

## Open Questions

- 花枝角饰的具体 CC0 文件与四个 rawpixel 直链的最终确认（实施第一步验证；不可用即按 Risks 第一条替换）。
- 深色判定阈值的具体取值（实施时以 0.35 起步，用 6 个预置的实际填充色校准）。
