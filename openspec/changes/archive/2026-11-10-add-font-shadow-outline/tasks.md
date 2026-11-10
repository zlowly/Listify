# Tasks

## 1. 数据模型（js/model.js）

- [x] 1.1 在 `DEFAULT_TITLE_STYLE` / `DEFAULT_SONG_STYLE` / `DEFAULT_TEXT_STYLE` 中增加 `shadow: {enabled:false,color:'#000000',offsetX:2,offsetY:2,blur:4}` 与 `outline: {enabled:false,color:'#000000',width:2}` 默认值；用 `node --check js/model.js` 验证语法通过
- [x] 1.2 在 `normalizeStyle` 中对 `shadow` / `outline` 做容错归一（缺失或形状不对 → 默认关闭；数值 clamp：`width`/`blur` ≥ 0，偏移可为负；颜色缺省 `'#000000'`），并加入模块导出；用一段 `node -e` 调用 `normalizeStyle` 验证：缺字段、畸形字段、负 blur 三种输入都归一为合法关闭/合法值

## 2. 渲染（js/render.js）

- [x] 2.1 抽取文字绘制辅助（描边→填充顺序，`lineJoin:'round'`），并按区域两遍绘制阴影：开启 Canvas 阴影画一遍全部文字（含描边）、关闭阴影再画一遍，让 `drawCategory` 标题、歌名（含 justify/center/right 分支）、`drawFreeText` 都走该辅助；`node --check js/render.js` 验证语法通过
- [x] 2.2 用浏览器打开页面手工验证：歌名开启阴影（偏移 2/2、模糊 4）画布出现标准投影；阴影纵向偏移设为负值时投影朝上但不叠在同区域文字之上；开启轮廓后描边在文字之下；关闭后完全回到原样；分类名与歌名设置互不影响
- [x] 2.3 手工验证布局解耦：歌名开启轮廓并设线宽 6，换行、列宽、行高、分类块高度与关闭前一致（对照 `layout.js` 计算路径确认未读取 shadow/outline）

## 3. 属性面板（js/ui.js + style.css）

- [x] 3.1 新增 `shadowOutlineFields(prefix, style)` / `bindShadowOutline(prefix, style)`（开关 + 颜色/偏移/模糊/线宽控件，关闭时参数禁用），接入 `categoryStyleFields`（标题、歌名）与 `textStyleFields`（自由文字）及其绑定；`node --check js/ui.js` 验证语法通过
- [x] 3.2 在 `style.css` 中为新控件补充与现有字段一致的排版样式（分组行、禁用态）；浏览器中确认三处样式面板均出现“阴影”“轮廓”分组且开关/参数联动正常（开启后可编辑、关闭时禁用、重开面板状态不丢）

## 4. 序列化与持久化（js/io.js）

- [x] 4.1 在 `serializeStyle` 中写出归一后的 `shadow` / `outline`（含 `enabled:false` 默认）；`node --check js/io.js` 验证语法通过
- [x] 4.2 浏览器手工验证项目往返：设置阴影+轮廓后“保存项目”再“加载项目”，设置原样恢复；再加载一份不含新字段的旧项目 JSON，确认阴影/轮廓为关闭且其它样式不变

## 5. 集成验证（跨模块）

- [x] 5.1 浏览器完整流程验证：导入 `samples/21songs.txt`，分别给分类名（轮廓）与歌名（阴影）设置装饰，自由文字加轮廓；导出 PNG 确认图中阴影/轮廓与画布一致；确认旧版本兼容——用手工构造的旧 JSON（无 shadow/outline 字段）加载不报错

## Workflow follow-up

- 全部任务完成并经用户确认后，运行 `openspec archive add-font-shadow-outline` 归档并更新主 specs。
- 归档后确认 `openspec/specs/category-layout/spec.md` 与 `openspec/specs/page-editor/spec.md` 已并入阴影/轮廓要求。
