# Design

## Context

现状（均已核实）：

- 左侧分类工具条是 `index.html` 中的静态 DOM（`#category-toolbar`），依次为 `#btn-import`（`btn btn-primary btn-sm`）、`#btn-edit-playlist`（`btn btn-sm`）、`<span class="hint">或拖入 .txt</span>`；静态放置正是为了让面板重渲染不销毁按钮、不重复绑事件。
- 问号提示机制已就绪：`js/ui.js` 中 `helpTip(文本)` 产出 12px 圆形 `<button class="help-tip" data-tip aria-label>?</button>`，全局单例 `.prop-tip`（`position:fixed`，内置视口越界翻转）负责显隐与定位；事件委托目前只挂在 `ui.els.propertyPanel` 与 `ui.els.modalRoot` 两个根上（`initPropTips()`），Esc 在捕获阶段关闭提示。
- 歌单数据在 `project.playlist.categories: [{ name, songs: [] }]`，分类名是身份键；存储顺序即展示顺序，歌名保存原始顺序。
- 下载已有通用工具 `L.model.downloadBlob(blob, filename)`（Blob + `a[download]`），项目 JSON 与 PNG 导出都走它，`file://` 下已被验证可用。
- 弹窗用 `ui.modal.open({ title, body, width, actions })`，`js/ui.js` 中已有 promise 化的确认交互可参照；导出项目成功后的 `ui.toast('项目已导出。', 'success')` 是现成的反馈范式。
- 导入解析在 `js/import.js`（`L.importer.parseText`）：`#` 行是分类名、其余非空行是歌名、首尾空白忽略、分类名与歌名各自全局唯一、歌名不得以 `#` 开头。导出格式以它为对偶。

硬约束：零构建、`file://` 可开、经典 `<script>`、无新依赖；改动不得影响项目 JSON、草稿、PNG 导出与导入解析。

## Goals / Non-Goals

**Goals:**

- 歌单数据出向通道：当前歌单 → 约定格式 .txt → 浏览器下载，且文本可被现有导入无差别还原（往返一致）。
- 拖放提示迁入 `?` 图标 + 共享浮动提示，复用既有机制与视觉语言，不另造提示组件。
- 空歌单时导出入口转为模板引导：提醒 + 询问 + 下载符合格式规则的固定样例。

**Non-Goals:**

- 不改导入解析、不新增导入路径（模板靠用户手动导入，不提供“一键导入模板”）。
- 不改项目 JSON 结构、草稿、PNG 导出、分类块排版与放置逻辑；导出与页面版面完全无关。
- 不提供多格式导出或导出选项（编码、换行、文件名的可选配置一概不做）。

## Decisions

### D1: 导出逻辑放独立模块 `js/playlist-export.js`

**做法**：新增 `L.playlistExport`，与 `js/import.js` 的 `L.importer` 对称，只负责纯数据变换与模板常量：`serialize(categories)` 返回文本、`sampleTemplate()` 返回模板文本、`exportPlaylist(project)` 串起“空判定 → 序列化/引导 → `L.model.downloadBlob`”。UI 侧（`#btn-export-playlist` 事件、弹窗按钮绑定）放在 `js/app.js`，与 `#btn-import` 的绑定同一处。

**理由**：项目惯例是按职责拆小文件（import/clipboard-image/export 各自独立）；纯函数模块便于在浏览器控制台直接对拍往返一致性。

**备选**：直接写进 `app.js`——被否，`app.js` 已承担编排职责，序列化与模板常量不属于 UI 编排。

### D2: `?` 图标用静态 HTML + 把工具条纳入既有委托

**做法**：在 `index.html` 的 `#category-toolbar` 中直接手写一个与 `helpTip()` 输出同构的按钮（`class="help-tip"`、`data-tip="也可以直接把 .txt 文件拖入分类区域导入"`、`aria-label` 同文案、`type="button"`），放在 `#btn-edit-playlist` 之后（原 hint span 的位置）；移除 `<span class="hint">或拖入 .txt</span>`。`js/ui.js` 的元素捕获中新增 `categoryToolbar = getElementById('category-toolbar')`，`initPropTips()` 的委托根数组从 `[propertyPanel, modalRoot]` 扩为包含该工具条。

**理由**：工具条是静态 DOM，只需一次委托即可覆盖，不用每次渲染重绑；单例 `.prop-tip` 是 `fixed` 定位且已内置越界翻转，在左栏（距视口左缘 0–300px）同样适用，预计零 CSS 改动。文案保留原“或拖入 .txt”的语义并说清位置。

**备选**：继续用原生 `title`——被否，项目已明确选择可控的浮动提示语言且键盘可达；每图标独立 tooltip 节点——被否，与既有单例架构不一致。

### D3: 序列化规则——显式 `#未分类` 行

**做法**：`serialize(categories)` 按 `categories` 存储顺序输出，每分类一行 `'#' + name`，随后按 `songs` 存储顺序每行一个歌名；分类之间与文件末尾各留一个换行（空行无语义，导入侧会跳过）。对“未分类”分类同样输出显式 `#未分类` 行，而不是把其歌名裸放在文件开头。

**理由**：导入侧把“首个 `#` 之前的歌名归入未分类”是解析约定而非数据表达；若裸放歌名，当“未分类”不在存储顺序第一位时往返会改变分类顺序。显式行让导出成为纯函数：同一份数据永远得到同一份文本，且顺序稳定。重新导入后数据模型中“未分类”就是同名分类，往返一致成立。

**备选**：裸放歌名依赖“未分类必须排第一”——被否，该约束目前不存在且未来无必要引入。

### D4: 空歌单引导用既有模态确认，模板为固定常量

**做法**：`exportPlaylist` 判定 `categories.length === 0`（无分类即无歌名）时，在 `app.js` 打开模态：标题“没有歌单”，正文说明目前没有歌单并询问是否导出模板，动作按钮为「导出模板」（主样式）与「取消」；确认后调用 `sampleTemplate()` 生成文本并以 `歌单模板.txt` 下载，成功提示 toast；取消则直接关闭。模板内容写死为常量：

```
#流行
夜曲
晴天
七里香
告白气球

#摇滚
光辉岁月
海阔天空
无地自容
梦的河
```

**理由**：两个分类、各 4 首歌（满足 3–5 首的规范），歌名取常见可识别的歌，用户照着改字面即可用；固定常量比占位符（“歌曲 1/2/3”）更能示范真实用法，且天然满足唯一性、无 `#` 开头等规则。下载文件名：当前歌单用 `歌单.txt`，模板用 `歌单模板.txt`，与 `歌单项目.json` 的命名风格一致。

**备选**：占位符样例——被否，示范价值低；让用户在弹窗里自定义模板内容——被否，超出本次范围且弹窗复杂度不划算。

### D5: 按钮顺序与样式

**做法**：工具条顺序为 `#btn-import`（保持 `btn-primary`）→ 新增 `#btn-export-playlist`（`btn btn-sm` 默认样式）→ `#btn-edit-playlist` → `?` 图标。

**理由**：用户要求“导入歌单旁”；导入仍是主操作，导出用默认样式区分主次，与顶栏“导出 PNG 主样式、其余默认样式”的先例一致。图层视图本就隐藏整个分类工具条，导出按钮无需单独处理隐藏逻辑。

## Risks / Trade-offs

- [`.prop-tip` 在左栏定位异常（被视口左缘裁切或压住工具条按钮）] → 组件已内置越界翻转；验证任务中在 1440px 与最小宽度（约 900px）两档窗口各悬停一次确认，异常时只在 `.prop-tip` 定位逻辑上微调，不改机制。
- [`initPropTips()` 委托根数组改动影响既有面板/模态提示] → 数组仅做加法，且工具条是独立容器不嵌套于既有根内；冒烟时顺带回归一次属性面板与背景库弹窗的 `?` 提示。
- [固定模板歌名可能与用户实际歌单重名，导入模板后触发重名校验] → 模板只在空歌单时可用（有歌单时导出的是当前歌单），重名风险自然不存在；非空歌单场景不受影响。
- [导出文本换行符差异（Windows CRLF）] → 统一用 `\n` 生成；导入侧 `parseText` 已把 `\r\n?` 归一为 `\n`，两个方向都不受 CRLF 影响。

## Migration Plan

纯增量功能，无数据迁移。回滚即还原 `index.html` / `js/ui.js` / `js/app.js` 的改动并删除 `js/playlist-export.js`；导出只产生本地下载，不写任何持久化状态，回滚无残留。

## Open Questions

无。文件名（`歌单.txt` / `歌单模板.txt`）与模板具体歌名为本设计记录的合理默认，不影响规范与任务拆解。
