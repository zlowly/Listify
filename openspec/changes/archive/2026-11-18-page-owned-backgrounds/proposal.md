# Proposal

## Why

背景库是项目内共享实体，普通用户却要面对「背景组 / 全局背景 / 固化 / 独立副本 / 使用页数」五个概念，才能回答「这一页用什么背景」。这份库又不跨项目复用，管理成本没有对应收益。共享与统一仍需要，但可以用一条用户可自述的规则表达。

## What Changes

- 背景改为页面拥有：每页保存自己的填充色与有序图片列表，不再有项目级背景集、背景 ID 引用、背景名称与使用页数。
- 全局背景改为「指向某一页背景」的覆盖：后设置覆盖先设置，取消即无全局；来源页背景的修改实时影响所有页，但各页自己的背景数据不变。
- 全局生效时，非来源页的背景只读：更换、加叠图、调色、定位、排序、复制背景全部拒绝，必须先取消全局或让本页接管；接管不需要额外确认。
- 新增「复制背景…」：以整页背景（填充色 + 全部图片及其定位/效果）为单位，从任意其它页复制到当前页。
- 删除全局来源页 SHALL 自动取消全局；新增页 SHALL 复制当前有效背景作为自己的背景。
- 移除背景库管理界面：`管理背景库` 弹窗、背景命名、复制/删除背景、引用页数、固化到所有页、本页独立副本、背景组下拉、全局背景组下拉。
- 预置素材的整套应用改为替换当前页背景，不再创建或复用「预置·X」背景集。
- **BREAKING**：项目 JSON 升级到版本 4；版本 1–3 导入时自动迁移。版本 4 的项目不能被旧版本加载。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `background-layer`: 背景归属、全局覆盖规则、只读约束、跨页复制；删除背景库、背景集管理与旧全局模式；预置整套应用语义随之调整。
- `page-editor`: 页面新增、删除与全局来源页的关系；图层面板在全局覆盖下的呈现与选择；页面背景选择入口。
- `project-persistence`: 版本 4 的保存格式、版本 1–3 到版本 4 的迁移、全局来源页字段的校验与恢复。
- `modal-dialog`: 删除「背景库」对话框后，规范中引用该入口的示例改为仍然存在的对话框，保持示例与界面一致。

## Impact

- 数据：`project.backgrounds[]`、`unifiedBackground`、`unifiedBackgroundId`、`page.backgroundId` 移除；新增 `page.background` 与 `project.globalBackgroundPageId`。
- 代码：`model`、`render`、`export`、`project-schema`、`project-io`、`draft-store`、`app`、`app-backgrounds`、`app-presets`、`app-import-export`、`ui`、`ui-property-panel`、`ui-pickers`、`style.css`、`index.html` 的文案与入口。
- 文档：`README.md`、`AGENTS.md`、`docs/歌单生成器需求.md` 的背景章节。
- 测试：`scripts/checks/io.test.js`、`model.test.js`、`draft-encoding.test.js` 需覆盖新结构、迁移与只读规则。
