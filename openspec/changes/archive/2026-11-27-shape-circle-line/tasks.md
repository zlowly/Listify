# Tasks

## 1. 数据模型与纯逻辑（js/shape.js + Node 回归）

- [x] 1.1 在 `js/shape.js` 扩展 `SHAPE_KINDS` 加入 `circle`/`line`；`normalizeShape`/`clampShape` 支持新形状：circle 的 inradius 与 rect 同式，line 强制 `radius = 0`；`DEFAULT_SHAPE` 不变。验证：`node --test scripts/checks/shape.test.js` 新增用例全绿。
- [x] 1.2 在 `js/shape.js` 实现圆形与直线的命中判断：circle 按椭圆方程（外接框四角不命中），line 按点到线段距离 ≤ 边框厚度/2 + 容差（带状区域，外接框空白不命中）。验证：命中判断的 Node 单测覆盖四角、带内外。
- [x] 1.3 在 `scripts/checks/` 补项目读写用例：circle/line 序列化与读入不回落 rect。验证：`node --test scripts/checks/*.test.js` 全绿。

## 2. 渲染与序列化

- [x] 2.1 在 `js/render.js` 的 `traceShape` 增加 circle（外接框内切椭圆路径）与 line（线段路径）；描边/填充沿用现有管线；`taper > 0` 时线段改为锥形多边形填充（两端各在 taper 距离内线性收窄至端点成尖，长度不足时等比缩小实际渐尖距离），`taper = 0` 走既有描边路径。验证：画布目视 + 手工导出 PNG 含新形状与渐尖线段。
- [x] 2.2 在 `js/project-io.js` 把两处形状白名单（序列化与读入）从 `diamond ? diamond : rect` 改为四值集合。验证：任务 1.3 的读写回归全绿。

## 3. 绘制交互（js/app-interactions.js / js/app-chrome.js）

- [x] 3.1 `shape-draw` 拖拽预览支持 circle（任意宽高椭圆）与 line（起点到当前点的线段），preview 数据结构与现有矩形兼容。验证：浏览器拖拽目视预览形状正确。
- [x] 3.2 实现 Ctrl 约束：circle 拖拽时外接框夹为正方形（以起点为角、取当前较大跨度）；line 拖拽时当前点吸附到以起点为端点的 45° 整数倍方向线；均基于指针事件的 `ctrlKey` 实时生效，松开恢复自由。验证：浏览器拖拽中按住/松开 Ctrl 目视切换。
- [x] 3.3 单击插入按形状分流：circle 240×240 正圆、line 240×8 水平线段（以点击点为中心夹在页面内），其余维持 240×240。验证：浏览器单击插入三种形状。
- [x] 3.4 落地 `createShapeFromDrag` 写入新形状字段，撤销/退出行为不变。验证：创建后撤销只移除新图形。
- [x] 3.5 工具栏「添加图形」改为分裂按钮（方形/圆形/直线 变体菜单，记忆上次选择，主按钮执行当前变体；落点/激活态行为不变）。验证：浏览器目视菜单与变体记忆。

## 4. 属性面板（js/ui-property-panel.js）

- [x] 4.1 形状下拉增加 圆形/直线 选项；直线隐藏圆角输入；切换形状保留外接框、切到 line 时圆角归零。验证：四种形状互切，外接框尺寸不变。
- [x] 4.2 自由图形提示文案按形状显示（方形/菱形/圆形/直线）；直线属性面板显示「两端渐尖距离」数值输入（仅 line 可见，负值就地夹取为 0）。验证：目视属性面板提示与渐尖输入。

## 5. 验证（第一轮）

- [x] 5.1 跑零依赖回归：`node --test scripts/checks/*.test.js` 全绿。验证：命令退出码 0。
- [x] 5.2 浏览器手工走查（`file://` 打开）：圆形边框/实心、拖成椭圆、Ctrl 正圆、直线 45° 吸附与自由绘制、直线两端渐尖（含 0 不变与长度不足夹取）、形状下拉互切、背景层绘制、全局背景覆盖页不可绘制、导出 PNG 不含预览。验证：逐项操作无异常。

## 6. 直线「框随方向」模型重构（用户反馈：外接框放线段不妥，横线无法加粗）

- [x] 6.1 在 `js/shape.js` 改为「框随方向」：线段恒为框的水平中线，`height` 同步为 `strokeWidth`，厚度上限为线长一半（`shapeInradius` line 分支）；移除端点字段 `x1..y2` 与 `normalizeLine`。验证：`node --test scripts/checks/shape.test.js` 新增用例全绿。
- [x] 6.2 在 `js/project-io.js`：line 序列化不再写端点/flip；旧 flip/端点数据读入时迁移为 长度 × 线粗 + 方向（rotation = 旧 rotation + 端点角度，线段中点锚定）。验证：io 回归新增迁移与往返用例全绿。
- [x] 6.3 在 `js/render.js`：`traceShape`/`traceTaperedLine` 按「框内水平中线」画线（含渐尖多边形）。验证：画布目视与导出 PNG。
- [x] 6.4 在 `js/app-interactions.js`：绘制落点写入 长度/方向（Ctrl 45° 吸附作用于方向）；拖拽移动为平移 x/y；选中直线改用两个端点手柄拖拽（框中心锚定，拖拽端点调整 长度+方向）。验证：浏览器四方向拖拽 + 端点手柄拖拽。
- [x] 6.5 在 `js/app-chrome.js`：直线预览按两端点页面坐标绘制线段；选中态显示两个端点手柄（替代八向手柄）。验证：浏览器目视。
- [x] 6.6 在 `js/ui-property-panel.js`：直线属性面板以 长度/角度 输入替代 宽/高（长度即框宽，角度即旋转，框中心锚定）。验证：目视 + 修改后画布一致。
- [x] 6.7 回归测试全绿（`node --test scripts/checks/*.test.js`）。
- [x] 6.8 浏览器走查：四方向直线绘制预览方向正确、横线加粗（框高同步）、端点手柄拖拽、Ctrl 45° 吸附、渐尖线段、属性面板 长度/角度、移动/旋转/撤销。验证：逐项无异常。
- [x] 6.9 运行 `graphify update .`。验证：命令成功退出。
