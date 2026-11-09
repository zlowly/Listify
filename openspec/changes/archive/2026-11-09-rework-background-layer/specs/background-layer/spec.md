# Spec Delta

## REMOVED Requirements

### Requirement: 每页背景图片
**Reason**: 背景不再由每页单独持有或通过页面引用组共享，改为项目级背景库 + 页面 `backgroundId`。
**Migration**: 加载 v1/v2 项目时按迁移规则把每页背景或引用组转换为背景库中的背景；运行时使用 `page.backgroundId` 解析有效背景。

### Requirement: 背景尺寸模式
**Reason**: 尺寸模式从“整个背景一张图”改为“每张背景图独立定位”，并新增自定义固定矩形模式。
**Migration**: 旧的 `fit` 值映射到对应图片的 `fit`；旧背景图保持原有视觉。

### Requirement: 背景透明度与模糊
**Reason**: 透明度与模糊改为每张背景图独立设置，并明确绘制顺序和模糊裁剪范围。
**Migration**: 旧背景的 `opacity`/`blur` 写到该背景唯一图片上。

### Requirement: 跨页共享图片资产
**Reason**: 页面引用组和所有者页面被项目级背景库取代；任意页可直接引用任意背景，不再依赖所有者页。
**Migration**: v2 的引用组按 `resolveBackgroundOwner` 折叠为一个背景；所有组成员写入同一 `backgroundId`。所有者页删除不再需要物化。

## MODIFIED Requirements

### Requirement: 背景填充色
每个背景 SHALL 支持填充色，默认 SHALL 为白色；填充色 SHALL 位于该背景所有图片下方；填充色 SHALL 属于背景集，不属于单张图片或页面；同一背景被多页使用时填充色 SHALL 共享。

#### Scenario: 无背景图
- **WHEN** 背景没有任何图片
- **THEN** 页面显示该背景的填充色

#### Scenario: 图片留白
- **WHEN** 原大小图片小于页面
- **THEN** 图片周围显示填充色

#### Scenario: 共享填充色
- **WHEN** 两个页面引用同一背景，用户在其中一页修改填充色
- **THEN** 两个页面的填充色同时更新

### Requirement: 背景层位置
背景层 SHALL 始终位于内容层下方，不属于内容元素的 z-order；背景 SHALL 在正常内容编辑时不响应画布点击；当用户在图层中选中背景集或某张背景图后，系统 SHALL 进入背景编辑状态：画布 SHALL 命中背景图片并显示选择框/手柄，内容点击仍 SHALL 优先选中内容；按 Escape 或选中页面 SHALL 退出背景编辑；背景图片的拖拽、缩放和旋转 SHALL 与内容图片使用同一套坐标与手柄命中规则；对 fit 模式图片执行直接操作 SHALL 自动转为 `none` 并烘焙当前矩形。完整页面导出 SHALL 包含当前页有效背景的全部图片；仅歌单层导出 SHALL 跳过整个背景层。

#### Scenario: 内容覆盖背景
- **WHEN** 内容层有分类块和自由文字
- **THEN** 它们都渲染在背景之上

#### Scenario: 画布点击不选背景
- **WHEN** 用户没有在图层中选中背景，点击页面空白处
- **THEN** 背景不会被选中，页面或内容按原有规则响应

#### Scenario: 选中背景后画布编辑
- **WHEN** 用户在图层面板选中某张背景图，然后在画布上拖动它
- **THEN** 该背景图移动并显示选择框，其它内容不变

#### Scenario: 内容优先
- **WHEN** 背景图处于选中状态，用户点击一个分类块
- **THEN** 分类块被选中，背景退出编辑状态

#### Scenario: 退出背景编辑
- **WHEN** 用户按 Escape 或点击页面标签
- **THEN** 背景选择被清除，属性面板回到页面属性

#### Scenario: 直接操作 fit 图
- **WHEN** 用户拖动一张 `cover` 背景图
- **THEN** 该图转为 `none`，当前 cover 矩形被烘焙为固定 x/y/宽高，之后页面尺寸变化不再重排

#### Scenario: 导出包含全部背景图
- **WHEN** 有效背景包含两张图片，用户导出完整页面
- **THEN** PNG 包含两张图片及其填充色

#### Scenario: 仅歌单层跳过背景
- **WHEN** 用户选择仅歌单层导出
- **THEN** PNG 不包含背景填充色或任何背景图片

### Requirement: 图片读取失败
添加或替换背景图片时，若文件无法解码，系统 SHALL 报错并保持背景集不变，MUST NOT 加入损坏图片；加载项目时，若背景引用的资产缺失或损坏，系统 SHALL 报错并保留当前项目；导出时，若有效背景的任一图片无法加载，系统 SHALL 按导出失败处理，MUST NOT 生成不完整文件。

#### Scenario: 选择损坏图片
- **WHEN** 用户选择无法解码的文件作为背景图
- **THEN** 系统报错，背景集不变

#### Scenario: 加载缺失资产
- **WHEN** 项目 JSON 中某张背景图引用不存在的资产
- **THEN** 系统提示项目损坏并停止加载

#### Scenario: 导出失败
- **WHEN** 有效背景的某张图片在导出时无法加载
- **THEN** 系统提示导出失败，不产生文件

## ADDED Requirements

### Requirement: 背景库与每页背景
项目 SHALL 维护一个背景库，包含至少一个背景；每个背景 SHALL 有唯一 ID、名称、填充色和有序图片列表；每个页面 SHALL 通过 `backgroundId` 引用一个背景；背景库 SHALL 在项目内共享，不随页面切换复制；新增页面 SHALL 继承当前页的有效背景 ID；删除未被引用的背景 MUST NOT 影响任何页面。

#### Scenario: 新建背景并用于页面
- **WHEN** 用户新建一个背景并指定给第 2 页
- **THEN** 第 2 页使用该背景，第 1 页不变

#### Scenario: 多页共用同一背景
- **WHEN** 第 1、2 页引用同一背景，用户修改该背景的图片
- **THEN** 两页同时更新

#### Scenario: 新增页面继承背景
- **WHEN** 当前页使用背景 A，用户新增一页
- **THEN** 新页的 `backgroundId` 为 A

#### Scenario: 至少保留一个背景
- **WHEN** 背景库只剩一个背景，用户尝试删除
- **THEN** 系统阻止删除并提示至少保留一个背景

### Requirement: 背景图片组合
每个背景 SHALL 包含有序的图片列表；图片 SHALL 按列表顺序从底到顶绘制；背景 SHALL 先绘制填充色，再绘制全部图片；所有背景图片 SHALL 被裁剪在页面边界内；背景层 MUST NOT 进入内容元素的 z-order；背景图片 MUST NOT 作为内容元素被层级排序。

#### Scenario: 多图叠加
- **WHEN** 同一背景依次加入图片 A、B
- **THEN** B 绘制在 A 之上

#### Scenario: 调整顺序
- **WHEN** 用户把 B 下移一层
- **THEN** A 绘制在 B 之上

#### Scenario: 填充色在图片下
- **WHEN** 图片透明度为 50%
- **THEN** 填充色从图片下透出

#### Scenario: 页面裁剪
- **WHEN** 自定义背景图超出页面边界
- **THEN** 只显示页面内的部分，页面外不绘制

### Requirement: 背景图片尺寸与自定义定位
每张背景图片 SHALL 支持 `original`、`fill-width`、`fill-height`、`cover`、`none` 五种定位模式；前四种 SHALL 以页面中心为基准，按页面尺寸实时计算矩形并随页面尺寸/方向变化重排；`none` SHALL 使用图片自身的 x/y/width/height，坐标相对页面左上角，页面尺寸变化时 MUST NOT 重排；`none` SHALL 支持任意角度旋转和等比锁定；从 fit 模式切换到 `none` 时 SHALL 把当前矩形烘焙为固定值；从 `none` 切回 fit 模式时 SHALL 忽略固定矩形。

#### Scenario: 原大小
- **WHEN** 图片原始尺寸小于页面且选择原大小
- **THEN** 图片按原始像素居中显示，四周显示填充色

#### Scenario: 横向占满
- **WHEN** 选择横向占满
- **THEN** 图片宽度等于页面宽度，高度按比例缩放并居中

#### Scenario: 竖向占满
- **WHEN** 选择竖向占满
- **THEN** 图片高度等于页面高度，宽度按比例缩放并居中

#### Scenario: 最适合
- **WHEN** 选择最适合
- **THEN** 图片按比例放大到覆盖页面宽高，居中裁剪

#### Scenario: 自定义矩形不随页面重排
- **WHEN** 图片为 `none`，用户把页面从 1080×1920 改为 1920×1080
- **THEN** 图片的 x/y/宽高保持不变

#### Scenario: 切换自定义烘焙矩形
- **WHEN** 图片当前为 `cover`，用户切换到 `none`
- **THEN** 图片的 x/y/宽高等于当前 cover 矩形，之后页面尺寸变化不再重排

#### Scenario: 切回 fit
- **WHEN** 图片当前为 `none`，用户切回 `cover`
- **THEN** 图片按当前页面尺寸重新计算 cover 矩形

### Requirement: 背景图片透明度、模糊与绘制顺序
每张背景图片 SHALL 独立支持 0% 到 100% 的透明度和大于等于 0 像素的模糊；透明度和模糊 SHALL 只作用于该图片，不作用于填充色或其它图片；模糊 SHALL 在页面裁剪范围内绘制，MUST NOT 被单张图片矩形裁掉；图片列表顺序 SHALL 决定绘制顺序。

#### Scenario: 单图透明度
- **WHEN** 用户把某张背景图透明度设为 50%
- **THEN** 该图半透明，填充色或下层图片透出

#### Scenario: 单图模糊
- **WHEN** 用户把某张背景图模糊设为 12 像素
- **THEN** 该图产生 12 像素模糊，模糊可超出图片矩形但被页面边界裁剪

#### Scenario: 多图独立
- **WHEN** 同一背景有两张图，用户只修改其中一张的透明度
- **THEN** 另一张不受影响

### Requirement: 背景图片编辑
系统 SHALL 允许向背景添加本地图片、替换选中图片、删除选中图片和调整顺序；添加或替换 SHALL 使用用户手势文件选择；添加的图片 SHALL 追加到列表末尾（最上层）；新图片在空背景中默认 `cover`，在非空背景中默认 `original` 并居中；替换 SHALL 保留原图片的定位、透明度、模糊和顺序；删除 SHALL 只移除该图片，不影响同背景其它图片。

#### Scenario: 添加背景图
- **WHEN** 用户向空背景添加一张本地图片
- **THEN** 背景增加该图，默认 `cover`，绘制在填充色之上

#### Scenario: 添加第二张图
- **WHEN** 用户向已有图片的背景再添加一张图
- **THEN** 新图默认 `original` 居中并追加到最上层

#### Scenario: 替换背景图
- **WHEN** 用户替换某张背景图
- **THEN** 新图替换原图，fit、自定义矩形、透明度、模糊和顺序保持不变

#### Scenario: 删除背景图
- **WHEN** 用户删除背景中的一张图
- **THEN** 只移除该图，同背景其它图和填充色不变

#### Scenario: 调整图片顺序
- **WHEN** 用户把某张背景图上移一层
- **THEN** 该图在绘制顺序中位于原上方图片之上

### Requirement: 全局背景模式
项目 SHALL 支持全局背景开关；开启时所有页面 SHALL 渲染 `unifiedBackgroundId` 指定的背景，忽略各页 `backgroundId`；关闭时 SHALL 恢复各页自己的 `backgroundId`；全局背景 ID SHALL 在关闭后保留；开启时 SHALL 使用记住的全局背景，若其无效则使用当前页有效背景；系统 SHALL 提供“固化到所有页”（把所有页的 `backgroundId` 设为全局背景并关闭全局模式）和“本页独立副本”（复制全局背景给当前页，其它页固化到全局背景，再关闭全局模式）；全局开关和全局背景下拉 MUST NOT 覆写各页 `backgroundId`，除非执行固化或副本动作；全局模式下新增页面 SHALL 使用全局背景 ID。

#### Scenario: 开启全局背景
- **WHEN** 第 1 页存有背景 B，用户开启全局背景并选择背景 A
- **THEN** 所有页面显示 A，第 1 页的 `backgroundId` 仍为 B

#### Scenario: 关闭恢复各页
- **WHEN** 全局背景为 A、第 1 页存有 B，用户关闭全局开关
- **THEN** 第 1 页显示 B，其它页恢复各自的 `backgroundId`

#### Scenario: 记住全局背景
- **WHEN** 用户开启全局背景选择 A，关闭后再开启
- **THEN** 全局背景仍为 A，而不是当前页的背景 B

#### Scenario: 固化到所有页
- **WHEN** 全局背景为 A，用户点击“固化到所有页”
- **THEN** 所有页的 `backgroundId` 变为 A，全局模式关闭，所有页仍显示 A

#### Scenario: 本页独立副本
- **WHEN** 全局背景为 A，用户在第 1 页点击“本页独立副本”
- **THEN** 系统复制 A 为 A'，第 1 页使用 A'，其它页使用 A，全局模式关闭；之后编辑 A' 只影响第 1 页

#### Scenario: 全局模式下新增页面
- **WHEN** 全局背景为 A，用户新增一页
- **THEN** 新页的 `backgroundId` 为 A

### Requirement: 背景库管理
系统 SHALL 提供背景库管理：新建空白背景、复制、重命名、删除；SHALL 显示每个背景被多少页面通过 `backgroundId` 引用，当前全局背景 SHALL 标记为全局使用中；删除被任何页面 `backgroundId` 引用或当前全局背景时 SHALL 被阻止并提示先改派或更换全局背景；项目 MUST 保留至少一个背景；删除背景或图片 SHALL 释放不再被任何内容元素或背景引用的图片资产；复制背景 SHALL 复制图片列表和设置，但共享图片资产。

#### Scenario: 新建空白背景
- **WHEN** 用户新建背景
- **THEN** 新背景填充色为白色且没有图片

#### Scenario: 复制背景
- **WHEN** 用户复制背景 A
- **THEN** 生成 A 副本，图片和设置相同但 ID 不同；编辑副本不影响 A

#### Scenario: 重命名背景
- **WHEN** 用户把背景 A 重命名为“封面”
- **THEN** 背景库和图层面板显示“封面”，页面内容不变

#### Scenario: 删除被引用的背景
- **WHEN** 背景 A 被两个页面引用，用户尝试删除
- **THEN** 系统阻止删除并提示先改派这些页面

#### Scenario: 删除未使用背景
- **WHEN** 背景 A 没有被任何页面引用且不是全局背景
- **THEN** 删除成功，未被其它地方引用的图片资产被释放

#### Scenario: 删除最后一套背景
- **WHEN** 背景库只剩一个背景
- **THEN** 系统阻止删除
