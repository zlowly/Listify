# Tasks

## 1. 纯逻辑：旋转角度计算、吸附与归一（js/model.js + 回归）

- [x] 1.1 新增纯函数 `model.wrapAngle(deg, halfRange)`（归一到 [-halfRange,halfRange]，0.1 精度）、`model.angleDeltaDeg(cx,cy,x0,y0,x1,y1)`（绕中心的角度增量，度，对增量做 ±180° 归一防接缝跳变）、`model.snapAngle(deg, step)`；并将 `ui.normalizeAngle(v)` 收敛为 `model.wrapAngle(v, 180)` 的委托，保持归一单一实现。验证：在 `scripts/checks/` 新增/扩展纯逻辑测试，覆盖 15° 吸附边界（14.5°→15°）、±180° 接缝不跳变、背景 400°→40°、内容 200°→-160°，`node --test scripts/checks/*.test.js` 通过。

## 2. 画布旋转手柄：绘制与命中（js/app-chrome.js）

- [x] 2.1 在 `imageHandlePoints`（或其旁）新增第 9 个旋转手柄点：自顶边中点沿 `model.rotateVector(0, -h/2, rad)` 向外约 24px，返回其屏幕坐标与旋转光标；背景图 `shape` 复用同一路径。验证：用 `agent-browser` 打开项目并选中自由图片，指针停在顶边中点上方手柄处，截图确认该点被识别为旋转手柄。
- [x] 2.2 在 `drawSelection` 与 `drawBackgroundSelection` 中绘制 stem 线（顶边中点→手柄）与圆形手柄（复用 `drawRoundHandle`）。验证：`agent-browser` 分别选中一张内容图与一张背景图，截图确认茎线+圆形手柄可见，且缩放/滚动后仍与选框对齐。
- [x] 2.3 在 `handleAt` 中于缩放手柄**之前**命中旋转手柄（命中半径约 9–10px）；`updateCursor` 悬停到该点时应用旋转光标。验证：`agent-browser` 将指针移至旋转手柄正上方（紧邻 `n` 手柄），断言命中为旋转手柄且优先于 `n` 缩放手柄。

## 3. 旋转拖拽分发（js/app-interactions.js）

- [x] 3.1 `onPointerDown` 命中旋转手柄时设 `surface.drag = { type:'rotate', center, startPointerAngle, startRotation, background }`，调用 `pushUndo('旋转图片'/'旋转背景图片')` 与 `beginPointer()`。验证：`agent-browser` 按下旋转手柄，可观察到角度开始随指针变化（进入拖拽态）。
- [x] 3.2 `onPointerMove` 处理 `type:'rotate'`：`newRot = startRotation + model.angleDeltaDeg(...)`；默认 `model.snapAngle(newRot, 15)`，Ctrl/⌘ 时不吸附；内容回写 `setElementField('rotation', model.wrapAngle(newRot, 180))`，背景回写 `setBackgroundImageValue(setId, imageId, 'rotation', model.wrapAngle(newRot, 360))`；`scheduleRedraw` 内容 `['content','overlay']`、背景 `['bg','overlay']`。验证：`agent-browser` 圆周拖拽，图片绕元素中心旋转、属性面板角度同步、吸附生效；松手后角度稳定。
- [x] 3.3 拖拽期间在 overlay 层手柄附近绘制当前取整角度，松手后清除。验证：`agent-browser` 拖拽中可见角度徽标，松手后消失（截图对比）。
- [x] 3.4 保持命中优先级：页面尺寸手柄 > 缩放/旋转手柄 > 列分隔线 > 抓取选中元素。验证：`agent-browser` 构造旋转手柄与上层元素重叠场景，确认命中旋转手柄而非抓取选中元素。

## 4. 集成与回归（跨组检查）

- [x] 4.1 纯逻辑回归全绿。验证：`node --test scripts/checks/*.test.js` 通过（含本 change 新增用例）。
- [x] 4.2 端到端流程：导入含图片项目或添加自由图片 → 选中 → 旋转手柄圆周拖拽（吸附/自由/角度徽标）→ 背景编辑态对背景图同操作 → 撤销/重做 → 保存后重新加载角度保持。验证：每步可观察/可断言；`project-persistence` 往返角度一致。
- [x] 4.3 既有行为不受影响：`n` 缩放手柄仍可点、内容拖拽=移动、滚轮=缩放不变、自由文字不可旋转、拖背景不重算内容层。验证：`agent-browser` 覆盖以上反例，均保持原状。
- [x] 4.4 构建一致。验证：`./build.sh` 退出码 0，`dist/` 不含 dev-only 文件，`index.html` 脚本顺序不变。

## Workflow follow-up

- 实现完成后运行 `graphify update .` 更新知识图谱（见 AGENTS.md）。
- 满足项目评审要求后归档本 change，并校验归档结果。
