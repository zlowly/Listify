# Tasks

## 1. 数据模型与校验

- [x] 1.1 在 `js/model.js` 增加范围常量和默认值：`BRIGHTNESS_MIN/MAX`（0.5/1.5）、`HUE_MIN/MAX`（-180/180）、`FADE_MODES`（`off|single|double`）、`FADE_ANGLE_MIN/MAX`（0/360），并把 `brightness`/`hue`/`fadeMode`/`fadeAngle` 加进 `DEFAULT_BACKGROUND_IMAGE` 与 `createImageElement`；验证：`node --test scripts/checks/model.test.js` 通过，且新建的自由图片与背景图都带 4 个默认字段
- [x] 1.2 新增 `model.hasImageEffects(item)`（任一字段非默认即 true）与 `model.fadeGradientPoints(angle, width, height)`（返回局部坐标下的渐变两端点）；验证：在 `scripts/checks/model.test.js` 覆盖 0°/90°/45°/双向 三种角度 × 宽高不等的断言（0° 时 x 相同、90° 时 y 相同、45° 时端点在盒子外接投影上），并覆盖默认值判定
- [x] 1.3 在 `js/project-schema.js` 增加可选校验：字段缺失通过，存在则要求有限数值与范围、`fadeMode` 属于枚举；越界报错文案沿用“第 N 个背景第 M 张图片的…无效。”；验证：`node --test scripts/checks/io.test.js` 通过，并新增用例覆盖“缺失合法 / 亮度 2.4 报错 / fadeMode='x' 报错 / angle=400 报错”
- [x] 1.4 打通读写两端：`project-io.serializeElement`（自由图片分支）与 `serializeBackgroundImage` 始终写出 4 个字段；`buildProject` 的自由图片字面量与 `projectSchema.buildBackgroundSet` 读取时缺失取默认；验证：新增 `scripts/checks` 用例断言“旧对象（无字段）→ 加载 → 序列化”后 4 个字段为显式默认值，且带非默认值的对象往返后逐字段相等

## 2. 渲染处理缓存

- [x] 2.1 在 `js/render.js` 把 `blurredImage` 泛化为 `processedImage(assetId, effects, width, height, ratio)`：缓存键包含 `blur|brightness|hue|fadeMode|fadeAngle`，烘焙时 `ctx.filter` 串为 `blur(...) brightness(...) hue-rotate(...)`，有渐隐时再用 `destination-in` + 局部渐变掩膜；验证：临时在 `dev-checks` 里比较“烘焙位图绘制”与“每帧 filter+掩膜”的像素差，肉眼与 `getImageData` 抽样均一致
- [x] 2.2 保持无效果的快速路径并修正冻结匹配：`blur===0 && !hasImageEffects` 时直接 `drawImage`、不分配离屏；`blurCacheFrozen` 的复用前缀改为完整参数前缀；验证：拖拽一张未调色的图时文档 `drawStats` 的缓存条目数不增长；拖拽一张已调色的图时不会出现颜色/渐隐在相邻帧之间跳变
- [x] 2.3 接入两条绘制路径：`drawFreeImage` 与 `drawBackground` 改用 `processedImage`，`globalAlpha` 仍取 `opacity`（与渐隐 alpha 相乘），背景图仍只受页面裁剪；验证：浏览器手测 0°/90°/45° × 单向/双向 × 旋转 0°/30° 六种组合，渐隐方向与图片旋转一致，页面外无绘制
- [x] 2.4 掩膜按“图片矩形 ∩ 页面”建立，并把交集到局部坐标的换算抽成纯函数放在 `model`；验证：`node --test scripts/checks/model.test.js` 覆盖“cover 矩形大于页面”“矩形完全在页面内”“旋转 30° 后的交集”三种输入，且 4K 导出单图峰值不出现整张 3840×3840 位图

## 3. 导出保真

- [x] 3.1 在 `export.js` / `render.js` 增加导出分支：`blur===0` 且有调色/渐隐时用一次性全分辨率位图（不进缓存），`blur>0` 时沿用缓存；验证：同一页分别以 1080×1920 与 2160×3840 导出，图片细节在 2× 下不发虚，效果与画布一致
- [x] 3.2 用 `agent-browser` 跑完整导出回归：完整页面含调色+渐隐时 PNG 有对应像素变化，仅歌单层导出的角像素仍为全透明；验证：两种导出的角落与中心像素抽样符合预期，控制台无报错

## 4. 属性面板与高级开关

- [x] 4.1 在 `js/ui-fields.js` 增加 `ui.advancedImage`（模块级布尔，默认 false）与「高级」按钮渲染辅助：按钮带 `class="btn pill"` 与 `aria-pressed`，保证 `ui.js` 的 `summary .btn` 拦截生效（或把 `.pill` 加进该选择器）；验证：点击开关不折叠分组，Tab 可聚焦，Enter/空格可切换，`aria-pressed` 与可见性一致
- [x] 4.2 在 `js/ui-property-panel.js` 为背景图「显示」与自由图片「外观」两处补控件：亮度（0.5–1.5，显示百分比）、色相（-180–180，显示 `°`）、渐隐模式（`selectInput`：关闭/单向/双向）、渐隐角度（0–360，模式为关闭时 `disabled`），仅在高级开启时渲染；有非默认值时在开关旁显示 `已调整`；验证：两处面板切换一致，关闭高级后控件消失但画布不变，`已调整` 只在有值时出现
- [x] 4.3 打通写入：`js/app.js` 的 `ELEMENT_FIELDS` 加 4 个字段，背景图沿用 `setBackgroundImageValue`；面板只调用意图方法；验证：拖动每个控件时画布即时更新，背景图只重绘背景层（`drawStats.bg` 增加、`drawStats.content` 不变），控制台无报错
- [x] 4.4 在 `scripts/checks/model.test.js` 补“复制背景集保留效果”与“替换图片保留效果”的模型级用例（`cloneBackgroundSet` / `cloneBackgroundImage`）；验证：`node --test scripts/checks/model.test.js` 通过，副本的 4 个字段与原图一致

## 5. 文档同步

- [x] 5.1 更新 `docs/歌单生成器需求.md`：图片能力补上亮度、色相、透明度渐隐（含角度、单向/双向、相对图片坐标）与高级开关；验证：文档描述与 `openspec/specs/image-effects` 的语义一致，无相互矛盾表述
- [x] 5.2 更新 `README.md` 的功能清单与图片编辑说明；验证：README 中可找到这三项能力与“默认隐藏、高级开关开启”的说明

## 6. 集成验证

- [x] 6.1 运行 `node --test scripts/checks/*.test.js`；验证：全部通过，无新增失败
- [x] 6.2 运行 `./build.sh`；验证：`dist/` 正常生成、版本注入与预置分片校验通过、`dist/index.html` 不引用 `js/dev-checks.js`、`dist/` 中无新增运行时文件
- [x] 6.3 浏览器全流程回归：导入歌单 → 加背景图与自由图片 → 调亮度/色相/渐隐（单向与双向各一次）→ 旋转图片 → 刷新恢复草稿 → 导出完整页与仅歌单层；验证：刷新后参数与画面一致，完整页含效果，仅歌单层透明，深色背景下无明显色带或可记录为已知问题
- [x] 6.4 兼容性回归：用一个不含新字段的旧项目 JSON 导入；验证：项目正常加载、图片按默认效果绘制、再次导出后 JSON 补齐字段

## Workflow follow-up

- 实现完成后运行 `openspec validate add-image-color-fade --strict`，再按 `openspec-archive-change` 归档并把 delta 合入主规格。
- 实现落地后运行 `graphify update .` 保持知识图与源码一致。
- 若验收时深色背景的渐隐色带明显，单独开一个 change 评估 1/255 抖动噪点，不并入本次。
