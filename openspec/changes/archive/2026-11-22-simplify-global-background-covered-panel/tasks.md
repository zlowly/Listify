# Tasks

## 1. 被覆盖页的分组结构与文档

- [x] 1.1 在 `js/ui-property-panel.js` 的 `backgroundGroup(page)` 被覆盖分支中，删除 `field('全局背景', '… 本页接管')` 复选框行；把来源说明从 `.bg-card` 的 `.bg-fields` 中移出，放在 `.inline-actions`（「取消全局背景」按钮）之后，输出为 `<p class="bg-source-note bg-global-note">目前全局背景为第 X 页的背景</p>`，X 继续用 `pageNumber(project, source)`；验证：被覆盖页的属性面板只显示缩略图 →「取消全局背景」→ 来源说明，DOM 中不存在 `#prop-bg-global` 或「本页接管」文字，来源序号与来源页一致
- [x] 1.2 保留 `bindBackgroundGroup` 中的 `prop-bg-global` change 处理器与 `L.app.setGlobalBackgroundPage` / `clearGlobalBackground` 调用不变，确认它们只服务未覆盖页；验证：未覆盖页勾选「全局背景」后所有页切换背景，被覆盖页取消全局后本页立即出现同一开关并可勾选成为新来源
- [x] 1.3 更新 `AGENTS.md` 中全局背景只读描述，把「They can only clear global or take over by checking the box; takeover needs no confirmation.」改为「They can only clear global; to take over, clear global first and then check the global box on that page.」；验证：`grep -n "take over" AGENTS.md` 不再出现一步接管的说法，描述与新的两步路径一致

## 2. 提示文案与样式

- [x] 2.1 把 `js/app.js`、`js/app-backgrounds.js`、`js/app-presets.js` 中被覆盖页拒绝编辑的 toast 统一改为「全局背景生效中，请先取消全局背景。」；验证：`grep -rn "让本页接管" js` 无结果，且在被覆盖页触发图形工具、更换背景与预置应用时看到同一句提示
- [x] 2.2 在 `style.css` 新增 `.bg-global-note { margin-top: 8px; }`，并删除只匹配已移除「本页接管」行的 `.prop-group[data-group="background"] .inline-actions + .field` 规则；验证：被覆盖页来源说明与取消按钮之间有 8px 间距，未覆盖页的「全局背景」行与背景条目属性面板的间距不变，面板中不存在失效的相邻选择器

## 3. 集成验证

- [x] 3.1 运行 `node --test scripts/checks/*.test.js`；验证：全部通过，无失败或报错
- [x] 3.2 用 `agent-browser` 或手动走查：第 1 页背景被第 2 页全局覆盖时，第 1 页显示缩略图、取消按钮与「目前全局背景为第 2 页的背景」，无「本页接管」；切换来源页后说明序号同步；取消全局后第 1 页恢复自己的背景并出现「全局背景」开关；勾选后第 1 页成为来源；在被覆盖页尝试编辑时只提示先取消全局背景；验证：逐场景通过并记录结果

## Workflow follow-up

- 评审通过后归档本变更：`openspec archive simplify-global-background-covered-panel`，并确认 `openspec/specs/background-layer/spec.md` 已按 delta 更新。
