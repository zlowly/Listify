# Design

## Context

编辑器是 `ui.playlistEditor.open(options)` 内的一个大闭包：`working.categories` 工作副本 + `activeIndex` + `errors` 等闭包变量，DOM 分三块——左 rail（`.playlist-editor-rail-title` + `.playlist-editor-category-list`，`renderRail()` 整段重建 innerHTML）、右侧 head、网格 `renderGrid()`。所有工作副本变更最终都会走到 `updateValidation()`（格 `input`/`blur`、分类名 `input`、结构变更经 `refreshAfterStructureChange()`），它是天然的单一刷新汇聚点。

既有可复用件：`selectCategory(index)`（提交当前格→切分类→重渲染）、`focusCell(index)`（按索引聚焦歌名格）、`ui.isComposingEvent(event)`（IME 防护）、字体选择器的搜索先例（`type="search"` + `toLocaleLowerCase` 部分匹配 + `input` 事件实时过滤）。`scripts/checks/loader.js` 按 `index.html` 顺序把全部运行时脚本载入 Node 沙箱（document 打桩），`model.js` 的纯函数已在此沙箱中被 `model.test.js` 回归。

约束：零构建、经典 `<script>`、不引入依赖；样式遵循现有 rail/head 约定（180px rail、2px 半透明蓝焦点环、`--blue-soft` 等变量）；行为需求见 `specs/playlist-editing/spec.md` delta。

## Goals / Non-Goals

**Goals:**
- 在 rail 顶部提供搜索框，查询非空时匹配列表替换分类列表，点击/Enter 跳转到分类并聚焦歌名格。
- 匹配算法抽为可单测的纯函数，进现有 Node 回归套件。
- 与现有工作副本/校验/渲染链路零冲突：跳转不产生额外数据变更，清空查询即完整恢复现状。

**Non-Goals:**
- 不做「上一处/下一处」循环匹配、网格内过滤模式、搜索分类名（proposal 已定）。
- 不改画布排版、持久化、导出链路；不动 `renderGrid()` 的格子结构与键盘编辑流。

## Decisions

### D1. 匹配算法放 `L.model.findSongMatches(categories, query)`（model.js）
纯函数：`query` 先 `trim()` 再 `toLocaleLowerCase()`；对每首歌（原始值）做部分匹配，返回 `[{ categoryIndex, songIndex, start, end }]`，`start/end` 是**原歌名坐标**下的命中区间（供 UI 高亮）。
- 为什么不放 `ui-playlist-editor.js`：编辑器闭包内的函数无法被 loader 沙箱单测；model.js 是现有「纯逻辑 + Node 回归」的家，且依赖方向（ui → model）合规。
- 为什么不返回高亮 HTML：模型不碰展示，UI 侧用 `esc()` 分段包 `<mark>` 自行渲染。
- 大小写区间细节：个别 Unicode 字符 `toLocaleLowerCase()` 会变长（如 `İ`→`i̇`），不能直接拿小写串索引当原串坐标。实现上用「逐前缀小写化定位」：找最小的 `i` 使 `song.slice(0, i).toLocaleLowerCase().indexOf(q) === i - q.length`（歌名短，O(n²) 无性能问题）。

### D2. 搜索框是 `.playlist-editor-category-list` 的兄弟节点，不在重建区内
`renderRail()` 整段重建列表 innerHTML；若搜索框在列表内部，每次重建会丢焦点和输入状态。结构：

```
.playlist-editor-rail
├── .playlist-editor-rail-title        （「分类」，保留）
├── input.playlist-editor-search       （新增，type="search"，永不重建）
└── .playlist-editor-category-list     （重建区：查询空→分类行；查询非空→匹配行）
```

匹配模式下把重建区的 `role` 从 `tablist` 切到 `listbox`、行 `role="option"`（对齐 fontpicker 的 listbox 约定）。选中行 `selectedMatch` 用 `.selected` 类标记，`↑/↓` 在匹配列表内移动（`L.model.clamp` 环绕可选，取简单不回绕：到头/到尾停住）。

### D3. 实时刷新挂在 `updateValidation()` 汇聚点
`updateValidation()` 是所有工作副本变更（格输入、失格提交、分类名输入、增删歌、拖拽移动）的共同出口。在其末尾加：`if (searchQuery) renderMatchList()`（重算 `L.model.findSongMatches` 并重绘重建区）。`renderRail()` 同时改为按 `searchQuery` 分支——结构变更整段重建 rail 时也能正确显示匹配列表。
- 成本：每次击键多一次全量 `indexOf` 扫描。歌名量级（数千条 × 短串）实测远低于 1ms；仅在 `searchQuery` 非空时执行。
- 为什么不各变更点分别挂：入口多（`bindCellInput`/`appendSongs`/拖拽/改名…），漏一个就是「搜不到刚改的名字」这类 bug。

### D4. 跳转 = `selectCategory` + `focusCell` + `scrollIntoView`，并在跳转瞬间复核匹配
`jumpToMatch(i)`：取 match → `selectCategory(match.categoryIndex)`（内部会 `commitActiveElement()` 提交当前聚焦格）→ 复核 `working.categories[ci].songs[si]` 仍包含查询（小写化比较）→ `focusCell(si)` 后 `input.scrollIntoView({ block: 'nearest' })`。
- 复核原因：`selectCategory` 的提交会 trim 当前格；若用户在另一格正在编辑一个靠空格匹配的旧值，match 可能已失效。复核失败则 `renderMatchList()` 刷新列表并把焦点还给搜索框，不跳转。
- 不复用浏览器原生 `dialog` 之外的焦点机制；聚焦歌名格即「已定位」信号（复用现有焦点环样式，不另加高亮闪烁）。

### D5. 搜索框按键流与 IME
搜索框 `keydown`：先 `if (ui.isComposingEvent(event)) return;`，再分发 `ArrowDown/ArrowUp`（移动选中行，`preventDefault`）、`Enter`（`jumpToMatch(selectedMatch)`）、`Escape`（清空 `searchQuery` 与输入框值、重绘、焦点留在搜索框）。`input` 事件直接更新 `searchQuery` 并 `renderMatchList()`——IME 组合期的中间值照旧实时过滤（与 fontpicker 一致，组合中间态的过滤无害）。
- 跳转后焦点在歌名格，搜索框失焦但查询与列表保留（规格已定）；再搜由用户点回搜索框。

### D6. 结果行渲染与高亮
每行：歌名（`esc()` 分段，命中区间包 `<mark class="playlist-editor-match-hit">`）+ 第二行所属分类名（小字）。行是 `<button>`（可聚焦、可 Enter），`title` 带完整歌名（rail 180px 下长歌名截断省略）。列表上方 meta 行：`N 个匹配`；零匹配：「没有匹配的歌名」（hint 样式，非错误色）。

### D7. 样式约定
新增类集中在 `style.css` 现有 `/* playlist editor */` 区段：`.playlist-editor-search`（复用 `.input` 基础样式，rail 宽度自适应）、`.playlist-editor-search-meta`、`.playlist-editor-match-row`（对齐 `.playlist-editor-rail-row` 的 hover/active 语言）、`.selected` 用与当前分类行同源的 `--blue-soft` 底、`mark` 命中高亮用浅黄底（与蓝色选中态区分），焦点环统一 `2px rgba(37,99,235,0.25)`。

## Risks / Trade-offs

- [每次击键全量重算匹配] → 仅在查询非空时执行；输入规模下可忽略，若未来歌单到万级再考虑 100ms 防抖（不预做）。
- [跳转瞬间 match 失效（并发编辑 + trim）] → D4 的跳转前复核兜底：刷新列表、焦点回搜索框，绝不错格跳转。
- [小写化长度变化导致高亮错位] → D1 的前缀小写化定位，单测覆盖含 `İ` 的用例。
- [匹配模式下列表 role 切换] → 仅在查询非空时切 `listbox/option`，清空即还原 `tablist`；屏幕阅读器语义与视觉一致。
- [rail 180px 窄列下结果行信息密度] → 歌名+分类名两行布局，长文本 ellipsis + title 全名，不扩展 rail 宽度（保持现有布局）。

## Migration Plan

无数据迁移：不改项目结构、持久化与版本。回滚 = 撤销本变更（新增类/函数均为增量，`renderRail` 的分支在 `searchQuery` 为空时走原路径）。

## Open Questions

- 无阻塞性问题。占位文案（拟「定位歌名…」）与 `mark` 具体色值属实现细节，apply 时定。
