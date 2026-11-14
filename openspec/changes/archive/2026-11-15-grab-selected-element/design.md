# Design

## Context

画布点选/拖拽集中在 `js/app.js` 的 `onPointerDown`,命中链固定为:页面尺寸手柄 → 缩放/旋转手柄(`handleAt`)→ 列分隔线(`dividerAt`)→ `renderer.hitTest`(内容元素,最上层优先,选择状态不参与)→ `editingBackground()` 时的 `renderer.hitTestBackground` → 页边距 → 选中页面。键盘处理在 `js/ui.js` 的一个 `document` keydown 监听器(已含表单字段守卫,处理 Ctrl/⌘+Z、Delete/Backspace、Escape)。撤销为全项目 JSON 快照栈(`pushUndo`,上限 20)。几何工具已导出:`elementBounds`、`imageLocalPoint`(旋转图片局部坐标)、`hitTestBackground`(含 fit 矩形与 `model.rotateVector` 旋转判断)。零构建、无依赖,`file://` 直接打开运行。

## Goals / Non-Goals

**Goals:**
- 在现有命中链上以最小侵入实现"选中者优先"(内容元素 + 具体选中的背景图)。
- 复用现有几何函数,不新增 fit/旋转计算路径。
- 方向键微调挂到现有键盘监听器,撤销合并不改动 `pushUndo` 本身。

**Non-Goals:**
- 不改 `hitTest`/`hitTestBackground` 的"最上层优先"语义(光标、双击仍用它们)。
- 不做多选、框选、吸附、对齐参考线。
- 不改双击编辑文字的命中规则。
- 不加 UI 文案/帮助提示(行为自解释,选择框即提示)。

## Decisions

### D1 选中元素优先检查插在命中链第 3 步之后

在 `onPointerDown` 中,`dividerAt` 之后、内容 `hitTest` 之前,新增检查:当前 `state.selection.type === 'element'` 时,取该元素做范围判断(图片走 `imageLocalPoint` 旋转局部坐标 + 半宽高,其余类型走 `elementBounds` 矩形),命中则按现有 `drag.type === 'move'` 分支建立拖拽(选择已是它,无需改 selection)。

**为什么这里**:页面手柄、缩放/旋转手柄、列分隔线是"小目标"精确控件,必须继续优先;选中元素是"抓整个块"的粗粒度意图,排在其后。

**备选**:
- 把优先参数传进 `renderer.hitTest` → 拒绝:hitTest 还被光标(`updateCursor`)和双击复用,纯"最上层"语义应留在渲染层,交互层策略不下沉。
- 放在手柄检查之前 → 拒绝:会破坏"选中分类块后点内部分隔线"这类现有操作。

### D2 背景图优先:仅当选中具体背景图,且复用 `hitTestBackground`

当 `state.selection.type === 'backgroundImage'` 时,在内容 `hitTest` 之前调用 `renderer.hitTestBackground`,**仅当**返回图片 id 等于 `state.selection.imageId` 时走现有 `drag.type === 'move-background'` 分支(含 `ensureCustomBackgroundImage` 的 fit→none 烘焙);否则维持现状(内容优先)。选中 `backgroundSet`(无具体图)时不做此检查。

**为什么**:fit 定位与旋转几何已在 `hitTestBackground` 内实现,复用避免第二套计算;"仅匹配选中图"的过滤保证只选背景集时行为不变,与 spec delta 一致。

### D3 方向键微调:扩展现有 document keydown,委托新 API

在 `js/ui.js` 现有 keydown 监听器(表单字段守卫之后)加方向键分支:`event.preventDefault()` 后调用新的 `L.app.nudgeSelection(dx, dy)`(Shift 时步长 ×10)。`nudgeSelection` 在 `js/app.js` 实现:选中元素 → 改 `element.x/y`;背景编辑且选中具体背景图 → 改 `image.x/y`(同样 `Math.round`);选中为页面/背景集 → 不 `preventDefault`,不拦截(保持页面自然滚动)。

**为什么在这里**:监听器已有表单守卫和 Ctrl/⌘+Z、Delete、Escape,是唯一的"画布快捷键"入口;app 侧新增 API 符合现有 `L.app.*` 委托模式。

### D4 微调撤销合并:会话变量,不动 pushUndo

`app.js` 模块级 `nudgeSession = { selectionKey, direction }`:

- `selectionKey` 取当前选中标识(元素 id 或背景图 id),防止跨选择误合并。
- 同 session(同 key + 同方向)的后续微调**不再** `pushUndo`——栈顶快照即该序列首次微调前状态,撤销一次回到序列起点,满足 spec。
- 换方向/换选择 → 新 session,重新 `pushUndo('微调元素'/'微调背景图片')`。
- 在 `onPointerDown` 开头清空 session,避免"微调→拖拽→同方向微调"把拖拽卷进旧快照。

**备选**:定时归并(500ms 无按键落一条)→ 拒绝:按键无"松手"事件,方向切换已是自然边界,计时器徒增状态。

### D5 双击与光标不动

`onDoubleClick` 继续用 `renderer.hitTest`(最上层优先)决定进入哪个文字的编辑;`updateCursor` 的 'move' 光标在新规则下依然正确(选中块范围内本就该显示 move),不改。

## Risks / Trade-offs

- [陷阱区回归:选中大元素后,点它上面叠着的小元素会拖大元素] → 选择框提供"将会拖什么"的视觉提示;Escape/点空白即恢复;spec 已明确接受此取舍,QA 用 agent-browser 覆盖"选中分类块 → 点内部小元素"与"小目标仍优先"两类用例。
- [整页 cover 背景图被选中后,页面上任何点击都会抓背景而非内容] → 这是用户显式选择背景图后的预期行为(意图即"我要动它");Escape 退出。不做额外限制。
- [nudgeSession 跨操作残留] → `onPointerDown` 清空(D4),且 selectionKey 绑定选择本身;`pushUndo` 上限 20 条不变,合并只会减少条目。
- [背景图 `hitTestBackground` 依赖 `L.assets.getCachedImage`,图片未加载时返回 null] → 与现状一致(未加载时本就不可命中),无新增风险。

## Migration Plan

无数据迁移:项目模型、存储格式不变。发布即生效;回滚 = 还原本次提交,行为退回"最上层优先"。

## Open Questions

(无阻塞性未决项。)
