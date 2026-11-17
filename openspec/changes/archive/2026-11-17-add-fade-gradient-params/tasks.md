# Tasks

## 1. 数据模型与几何

- [x] 1.1 在 `js/model.js` 增加范围常量、模式预设（`FADE_MODE_DEFAULTS`）与 `fadeDefaults` / `fadeValues`；把 `fadePosition` / `fadeWidth` / `fadeTop` / `fadeBottom` 加入 `DEFAULT_BACKGROUND_IMAGE` 与 `createImageElement`；验证：`node --test scripts/checks/model.test.js` 通过，新图默认字段完整
- [x] 1.2 增加 `model.fadeProfile(item)`：单向返回位置/宽度决定的渐变向量与两端 alpha；双向返回不透明带 + 两条坡的色标，带宽夹在图片内；验证：model 测试覆盖单向默认、位置/宽度/透明度、硬边退化、双向对称、带宽贴边与旧双向默认
- [x] 1.3 `hasImageEffects` 计入新字段；验证：任一非默认值返回 true，全默认返回 false

## 2. 渲染

- [x] 2.1 `js/render.js` 的 `imageEffects` 读取归一后的五个渐隐参数，`effectSignature` 加入四个新字段
- [x] 2.2 `fillFadeMask` 改为按 `fadeProfile` 的 `from/to/stops` 建渐变，单双向共用；验证：浏览器中单向位置 50%/宽度 50% 的 alpha 在图片中线处开始下降，双向位置 30%/宽度 20% 的上坡 20%、平台 20%、下坡 60%
- [x] 2.3 检查导出路径：`drawOneShotImage` 复用同一掩膜；验证：1080×1920 完整页面导出的像素与画布采样一致（纯色图 × 白底，逐点误差 ≤ 1/255）

## 3. 校验与持久化

- [x] 3.1 `js/project-schema.js` 增加四个可选字段的 0–1 校验；背景图加载时按模式补齐默认值
- [x] 3.2 `js/project-io.js` 的自由图片加载、序列化与背景图序列化补齐四个字段；验证：`node --test scripts/checks/io.test.js` 覆盖缺失合法、越界报错、旧项目按模式预设、非默认值往返
- [x] 3.3 `js/app.js` 的 `ELEMENT_FIELDS` 加入四个字段，自由图片走 `setElementField`，背景图沿用 `setBackgroundImageValue`

## 4. 属性面板

- [x] 4.1 高级区新增「渐隐位置」「转场宽度 / 不透明区宽度」「顶部透明度」「底部透明度」四个滑条；模式为关闭时禁用；双向时宽度标签改为「不透明区宽度」
- [x] 4.2 模式切换写入目标模式预设并重渲染面板；位置/宽度/透明度滑条实时写入并更新百分比标签
- [x] 4.3 背景图与自由图片两处面板共用同一组控件与绑定；验证：浏览器中两处都能切换双向、调整位置/宽度并即时看到画布变化

## 5. 文档与规格

- [x] 5.1 更新 `openspec/specs/image-effects`（主规格）与 `openspec/changes/add-fade-gradient-params/specs/*` 的 delta
- [x] 5.2 更新 `docs/歌单生成器需求.md` 与 `README.md` 的渐隐参数说明
- [x] 5.3 运行 `openspec validate add-fade-gradient-params --strict`

## 6. 集成验证

- [x] 6.1 `node --test scripts/checks/*.test.js` 全部通过
- [x] 6.2 浏览器手动回归：添加图片 → 高级 → 单向/双向切换 → 调整位置/宽度/两端透明度 → 旋转图片 → 刷新恢复草稿 → 导出完整页
- [x] 6.3 运行 `./build.sh` 确认零构建产物正常、`dist/` 不引用 `js/dev-checks.js`
- [x] 6.4 运行 `graphify update .` 保持知识图与源码一致
