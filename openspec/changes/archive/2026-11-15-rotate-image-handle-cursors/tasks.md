# Tasks

## 1. 光标生成与手柄接线

- [x] 1.1 在 `js/app.js` 实现角度归一化、标准方向判定、系统关键字映射、32×32 双向箭头 SVG 生成与 `Map<角度, 光标串>` 缓存，并让 `imageHandlePoints()` 按旋转角返回解析后的 `cursor`；验证：`agent-browser` 打开页面，旋转 0° 的图片悬停右边界时 `overlay.style.cursor` 仍为 `ew-resize`，旋转 30° 时同一手柄的值包含 `data:image/svg+xml`。
- [x] 1.2 校正八个手柄的方向矩阵并确认四角固定 `rotation + 45°`：验证 0° 时四角依次为 `nwse-resize`/`nesw-resize`（与改造前一致），45° 时右边界手柄为 `nwse-resize`，135° 时为 `nesw-resize`（用 `agent-browser` 逐项读取 `overlay.style.cursor`）。
- [x] 1.3 确认背景图片走同一路径：`drawBackgroundSelection()` 与 `handleAt()` 的 `resize-background` 复用的 `imageHandlePoints(shape)` 已返回旋转后的光标；验证：背景编辑中选中并旋转一张背景图到 30°，悬停右边界手柄得到自定义光标，旋转回 0° 得到 `ew-resize`。

## 2. 刷新时机与去重

- [x] 2.1 记录最后一次悬停的 overlay 坐标（`pointermove` 更新、`pointerleave` 清空），在 `redraw()` 绘制 overlay 后、非拖拽且非行内编辑时重跑 `updateCursor()`；验证：指针停住不动时在属性面板把旋转角从 0° 改为 30°，`overlay.style.cursor` 立即变为 30° 的自定义光标。
- [x] 2.2 增加 `lastAppliedCursor` 去重，只在光标串变化时写 `style.cursor`；验证：`pointermove` 在 30° 手柄的 8px 范围内连续移动时 `style.cursor` 的赋值次数不随移动次数增长（DevTools 断点或临时计数器确认），光标不闪烁。
- [x] 2.3 验证撤销/重做后光标同步：旋转到 30°、撤销回 0°，指针未移动时 `overlay.style.cursor` 回到 `ew-resize`。

## 3. 回归与兼容

- [x] 3.1 非图片控件不受影响：验证分类块/自由文字仍为 `ew-resize`，列分隔线为 `col-resize`，页尺寸手柄为 `nwse-resize`，元素本体悬停为 `move`。
- [x] 3.2 验证兜底声明：读取任一非标准角度的 `overlay.style.cursor`，确认形如 `url("data:image/svg+xml;…") 16 16, <系统关键字>`，确保浏览器不支持 SVG 光标时仍保留方向提示。
- [x] 3.3 手动目检 Chrome 中 0°/30°/45°/90° 的八个手柄与旋转背景图，光标箭头方向与边界垂直、四角为斜向；`agent-browser` 无法断言像素外观，此项需人工确认并记录结果。
- [x] 3.4 整页流程回归：从 `file://` 打开 `index.html`，导入歌单、添加图片、旋转、缩放手柄拖拽、切换页面、保存并重新载入项目，确认无控制台报错且拖拽几何未被光标改动影响。

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
