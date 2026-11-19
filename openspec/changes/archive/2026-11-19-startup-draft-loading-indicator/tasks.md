# Tasks

## 1. 启动载入提示的结构与样式

- [x] 1.1 在 `index.html` 的 `#canvas-pane` 内新增 `#startup-loading` 节点（环形指示器 + 「正在载入本地草稿…」文案，`role="status"`、`aria-live="polite"`），并给 `#empty-hint` 加 `hidden`；验证：在浏览器禁用 JavaScript 后打开 `file://` 入口，仍能看到载入提示、看不到导入空态
- [x] 1.2 在 `style.css` 增加 `.startup-loading` 与指示器样式，复用空态提示贴的中央定位、12px 圆角、70% 纸白与 2px 模糊，改用实线结构线；设置 `z-index: 5`、`pointer-events: none`，并新增 `prefers-reduced-motion: reduce` 下停止旋转的覆盖；验证：正常模式可见旋转，模拟减少动效后圆环与文案仍完整可见且不旋转
- [x] 1.3 在 `DESIGN.md` 的画布空态附近补充启动载入贴的说明（位置、边框、文案、动效偏好与不进入导出的边界）；验证：文档描述与最终 DOM/CSS 实际取值一致

## 2. 状态切换与启动流程接线

- [x] 2.1 在 `js/ui.js` 增加 `ui.setStartupLoading(active)`：切换 `#startup-loading.hidden` 并同步 `#canvas-pane` 的 `aria-busy`；验证：在控制台调用 `L.ui.setStartupLoading(true)` / `(false)`，节点显隐与 `aria-busy` 同步变化且不报错
- [x] 2.2 在 `js/app.js` 的 `init()` 中用 `try/finally` 包住 `restoreDraftOnStartup()` 与首次 `ui.renderAll()`，在 `finally` 关闭载入提示；在 `boot()` 的 catch 中同样兜底关闭；验证：用 DevTools CPU 6× 降速并加载含多页/多图草稿，载入提示持续到内容出现才消失，人为让 `init()` 抛错时提示消失且只出现既有 toast
- [x] 2.3 验证无草稿与恢复失败路径：清除 IndexedDB 草稿后启动，载入提示消失并显示默认空白项目与既有空态提示；向 `listify.draft.v1` 写入非法 JSON 并清空 IndexedDB 草稿后启动，载入提示消失，出现损坏提示与空白项目，画布不残留「正在载入」

## 3. 集成验证与发布检查

- [x] 3.1 运行 `node --test scripts/checks/*.test.js`，确认现有纯逻辑回归全部通过（本变更不修改模型/布局/IO 逻辑）
- [x] 3.2 用 `agent-browser` 或手工浏览器走查：有草稿启动、无草稿启动、损坏草稿启动、减少动效四种场景，确认载入期间不出现「从左侧导入歌单」、恢复后页面/歌单/背景可正常操作，并确认 PNG 导出画面不含载入提示
- [x] 3.3 运行 `./build.sh`，检查生成的 `dist/index.html` 同时含 `#startup-loading` 与带 `hidden` 的 `#empty-hint`，且本地资源版本号注入正常

## Workflow follow-up

- 审查通过后归档该 change，并确认归档后的 `project-persistence` 规格包含启动载入反馈场景。
