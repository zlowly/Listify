# Tasks

## 1. 纯吸附核心

- [x] 1.1 新增 `js/snap.js`，实现 `SCREEN_THRESHOLD`、`RELEASE_SCREEN`、`pageThreshold(scale)`、`choose({anchor, targets, threshold, release, hold, isValid})`、`widthFromEdge(...)` 与 `applyDividerDelta(...)`；在 `index.html` 中按 `model.js -> snap.js -> layout.js` 的顺序加入经典 `defer` 脚本。验证：`node -e "const L=require('./scripts/checks/loader.js').load(); if(!L.snap) process.exit(1)"` 退出码为 0，且直接打开页面无脚本加载错误。
- [x] 1.2 新增 `scripts/checks/snap.test.js`，覆盖阈值内/外、缩放换算、最近目标、同距优先级、同坐标去重、`hold` 在 `threshold + release` 内保持与超出释放、`isValid` 过滤、`widthFromEdge` 四个分支、`applyDividerDelta` 的最小列宽保护与总宽不变。验证：`node --test scripts/checks/snap.test.js` 全部通过。
- [x] 1.3 更新 `AGENTS.md` 的模块依赖顺序，把 `snap` 放在 `model` 与 `layout` 之间，并说明它是纯几何计算、不依赖 DOM。验证：`grep -n "snap" AGENTS.md` 能看到该顺序，且文中没有把吸附逻辑描述成 UI 或 layout 的职责。

## 2. 候选快照、块移动与参考线

- [x] 2.1 在 `app-interactions.js` 增加只读的候选快照：页面内容区四边/中心、其它分类块外框/中心、其它块中有左右内缩的表格边、其它列分隔线；每个目标带参考线跨度和优先级，同一坐标去重，排除被拖元素自身。快照只在 pointerdown 建立，保存到 `surface.drag.snap`。验证：浏览器中拖动分类块时 observable 行为符合预期——块左边停在距页左边距 4 屏幕像素处会落到 `margins.left`，且不会把被拖块自己的边当成目标。
- [x] 2.2 在块移动分支应用 X/Y 吸附：锚点为块左/中/右、上/中/下及有内缩的表格左右边；每个轴最多一条，按 `snap.choose` 的最近/同距规则落值；`event.altKey` 时跳过吸附，并在拖拽期间监听 Alt 的 keydown/keyup 用最后指针位置重算。验证：分别测试吸页边距、吸另一块上/下边形成紧邻、吸另一块右边、吸页面中心、跨块表格右边；按住 Alt 经过同一目标时不吸附，松开后即使不移动指针也立即恢复吸附与参考线。
- [x] 2.3 在 `surface.snapGuides` 写入当前吸附线并在 `drawOverlayLayer` 中绘制：蓝色实线、两端 5px 短刻度、跨度取并集并裁剪到页面、表格内边锚点加 6px 标记；无吸附或 Alt 时清空；pointerup 清空。验证：参考线只在吸附时出现，视觉上能与页边距的 48% 虚线区分；缩放 200% 和滚动后仍与页面几何对齐；松手后不残留。

## 3. 块宽吸附

- [x] 3.1 在 `resizeDrag` 的分类块 `e/w` 分支应用吸附：`e` 用块右边和有内缩表格右边，`w` 用块左边和有内缩表格左边；用 `snap.widthFromEdge` 换算宽度，换算结果仍经过 `clamp(80, pageWidth * 3)`，不可达目标由 `isValid` 跳过；表格因 `MIN_TABLE_WIDTH` 或 `table.x` clamp 退化时不加入改宽锚点；保留 `scaleManualWidths` 的原比例缩放。验证：右手柄吸另一块右边、吸页右边距、吸另一块表格右边（两块外框不对齐）；左手柄对称；手动列宽随宽度按比例变化且不出现负宽；退化窄表拖动时不会吸到换算不一致的表格边。
- [x] 3.2 宽度吸附命中表格内边时显示对应锚点标记，并确认吸附只改当前块的 `x/width`，不改页面边距、表格边距或其它块坐标。验证：属性面板中检查两块表格边距保持不变，只有被拖块的宽度和位置变化；Alt 期间宽度连续变化、无标记。

## 4. 列分隔线吸附

- [x] 4.1 在 `dividerDrag` 应用吸附：原始边界为 `startWidths` 前缀和加表格页坐标；目标为同块/其它块的其它列分隔线与页面内容区左右边；用 `snap.applyDividerDelta` 写回，任一侧低于 `MIN_COL_WIDTH` 时回退无吸附的原始 `dx`，不冻结拖动。验证：同块两张表列边界对齐、跨块列边界对齐、吸页边距；最小列宽附近继续拖动不会被卡死。
- [x] 4.2 确认列宽拖动后表格总宽、列数、填充方式、对齐与四边距不变，`widthMode` 为 `manual`，且只改变被拖边界两侧的列宽。验证：在属性面板对比拖动前后的表格结构与边距；`node --test scripts/checks/layout.test.js` 通过。

## 5. 集成验证

- [x] 5.1 跑完整纯逻辑回归：`node --test scripts/checks/*.test.js` 全部通过。
- [x] 5.2 浏览器手工走查：分类块移动/改宽、同块与跨块列分隔线、200% 缩放、滚动后参考线、Alt 临时关闭、方向键微调不吸附；确认一次拖动只产生一条撤销记录。
- [x] 5.3 导出与持久化回归：导出 PNG 与“仅歌单”均不包含参考线；切换页面、刷新草稿后没有任何吸附状态残留；项目 JSON 未新增字段。
- [x] 5.4 代码变更完成后运行 `graphify update .`，确认知识图更新无报错。

## Workflow follow-up

- 实现完成并通过上述验证后，运行 `/opsx-apply` 的收尾流程；归档前按项目 review 要求检查变更。
