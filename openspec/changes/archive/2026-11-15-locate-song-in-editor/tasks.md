# Tasks

## 1. 匹配纯函数（js/model.js + Node 回归）

- [x] 1.1 在 `js/model.js` 实现 `L.model.findSongMatches(categories, query)`：query `trim()` + `toLocaleLowerCase()` 后对每首歌原始值部分匹配，返回 `[{ categoryIndex, songIndex, start, end }]`（start/end 为原歌名坐标，用逐前缀小写化定位）；空 query 返回 `[]`。验证：`node --test scripts/checks/model.test.js` 通过。
- [x] 1.2 在 `scripts/checks/model.test.js` 补充用例：部分匹配、大小写不敏感、无匹配、空查询、跨多分类多条命中、重名歌各出一条、含 `İ` 类小写化变长字符的 start/end 坐标正确。验证：`node --test scripts/checks/*.test.js` 全绿。

## 2. 编辑器搜索 UI（js/ui-playlist-editor.js）

- [x] 2.1 在 rail 中、`.playlist-editor-category-list` 之前插入搜索框 `<input type="search">`（`.playlist-editor-search`，placeholder「定位歌名…」，`aria-label="定位歌名"`，`autocomplete="off"`，不在 `renderRail()` 重建区内）；`renderRail()` 按 `searchQuery` 分支：空→现有分类行（`tablist` 不变），非空→匹配列表（`role="listbox"`，行 `role="option"`）+ meta 行（`N 个匹配` / 「没有匹配的歌名」）。验证：浏览器打开编辑器，输入查询后匹配列表替换分类列表、清空后恢复，且输入过程中搜索框不丢焦点。
- [x] 2.2 匹配行渲染：歌名 `esc()` 分段、命中区间包 `<mark>`，第二行所属分类名，长文本 ellipsis + `title` 全名；空态行不可点击。验证：浏览器中输入命中查询，确认高亮区间与歌名子串一致；歌名含 `<`、`>`、`&` 时不产生 HTML 注入/错乱。
- [x] 2.3 实现 `jumpToMatch(i)`：`selectCategory(match.categoryIndex)` → 复核目标格当前值仍含查询（不成立则 `renderMatchList()` 并聚焦回搜索框，不跳转）→ `focusCell(match.songIndex)` + `scrollIntoView({ block: 'nearest' })`；匹配行 `click` 与 Enter 共用该入口。验证：浏览器点击结果行与键盘 Enter，均切到对应分类、目标格聚焦可见，键入直接改工作副本；构造「跳转前目标格被 trim 改变」场景确认不跳转且列表刷新。
- [x] 2.4 搜索框 `keydown`：`ui.isComposingEvent` 提前返回；`ArrowDown/ArrowUp` 移动选中行（`preventDefault`，不越界），`Enter` 跳转选中行，`Esc` 清空查询并恢复分类列表（焦点留在搜索框）。验证：浏览器键盘流逐项确认；中文输入法组合中按方向键/Enter 不触发选行、跳转或清空。
- [x] 2.5 实时刷新：在 `updateValidation()` 末尾挂 `if (searchQuery) renderMatchList()`（重算 `L.model.findSongMatches(working.categories, searchQuery)` 并重绘列表区，`selectedMatch` 越界时收敛到合法范围）。验证：浏览器在查询非空时编辑歌名（使其脱离/进入命中）、改分类名、增删歌、拖拽移动歌，列表与计数均即时更新；重名歌（非法态）照常显示。

## 3. 样式（style.css）

- [x] 3.1 在现有 playlist editor 样式区段新增：`.playlist-editor-search`（复用 `.input` 基础样式）、`.playlist-editor-search-meta`、`.playlist-editor-match-row`（hover 与 `.playlist-editor-rail-row` 同语言，`.selected` 用 `--blue-soft` 底）、`mark` 命中高亮（浅黄底，与蓝色选中态区分）、焦点环统一 `2px rgba(37, 99, 235, 0.25)`。验证：浏览器确认搜索框/结果行视觉与 rail 一致，键盘焦点环可见且不与选中态混淆，rail 180px 下两行文本布局不撑破。

## 4. 集成验证

- [x] 4.1 `node --test scripts/checks/*.test.js` 全量回归通过（确认 model 变更无回归）。
- [x] 4.2 端到端手工回归（浏览器/agent-browser）：导入多分类歌单 → 打开编辑器 → 定位并编辑一首歌 → 取消（确认无数据变化）→ 重新打开 → 定位编辑 → 应用（确认画布按新歌名重排、摘要正确）；确认搜索框不影响既有编辑流（Enter 下一格、Esc 还原、拖拽、排序）与校验/待修正计数。

## Workflow follow-up

- 评审通过后归档变更：`openspec archive "locate-song-in-editor"`，delta 合入 `openspec/specs/playlist-editing/spec.md`。
- 归档后按仓库约定提交（版本号策略由用户决定）。
