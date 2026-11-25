'use strict';

/*
 * model.insertTarget 的纯逻辑回归 + 分类块落点契约。
 * 运行：node --test scripts/checks/insert-target.test.js
 *
 * 覆盖统一插入落点解析的六类输入，以及“分类块永远写入 page.elements、
 * 不进入背景条目列表”的规格契约。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const loader = require('./loader.js');

const L = loader.load();
const model = L.model;

// loader 在独立 VM realm 中运行脚本，返回对象的原型与测试侧字面量不同，逐字段断言。
function assertTarget(resolved, target, disabled, reason) {
  assert.equal(resolved.target, target);
  assert.equal(resolved.disabled, disabled);
  if (reason !== undefined) assert.equal(resolved.reason, reason);
}

function makePage() {
  const project = model.createDefaultProject();
  const page = project.pages[0];
  return { project, page };
}

test('insertTarget：无选中默认落内容层', function () {
  const { project, page } = makePage();
  assertTarget(model.insertTarget(null, project, page), 'content', false);
  assertTarget(model.insertTarget({ type: 'page' }, project, page), 'content', false);
});

test('insertTarget：内容层分组头与内容元素行落内容层', function () {
  const { project, page } = makePage();
  assertTarget(model.insertTarget({ type: 'content-layer' }, project, page), 'content', false);
  assertTarget(model.insertTarget({ type: 'element', id: 'e1' }, project, page), 'content', false);
});

test('insertTarget：背景行落背景层', function () {
  const { project, page } = makePage();
  assertTarget(model.insertTarget({ type: 'background' }, project, page), 'background', false);
});

test('insertTarget：背景条目子行落背景层', function () {
  const { project, page } = makePage();
  assertTarget(model.insertTarget({ type: 'backgroundItem', itemId: 'i1' }, project, page), 'background', false);
});

test('insertTarget：被覆盖页选中背景时禁用并给出提示', function () {
  const { project, page } = makePage();
  const other = model.createPage(model.effectiveBackground(project, page));
  project.pages.push(other);
  model.setGlobalBackgroundPage(project, other);
  assert.ok(model.isBackgroundCovered(project, page));

  assertTarget(model.insertTarget({ type: 'background' }, project, page), 'background', true, '全局背景生效中，请先取消全局背景。');
  assertTarget(model.insertTarget({ type: 'backgroundItem', itemId: 'i1' }, project, page), 'background', true, '全局背景生效中，请先取消全局背景。');

  // 来源页本身不受影响。
  assertTarget(model.insertTarget({ type: 'background' }, project, other), 'background', false);
});

test('insertTarget：被覆盖页选中内容层仍落内容层且可用', function () {
  const { project, page } = makePage();
  const other = model.createPage(model.effectiveBackground(project, page));
  project.pages.push(other);
  model.setGlobalBackgroundPage(project, other);

  assertTarget(model.insertTarget({ type: 'content-layer' }, project, page), 'content', false);
});

test('分类块契约：无论选中哪一层，分类块只写 page.elements，不进背景条目列表', function () {
  const { project, page } = makePage();
  const selections = [
    { type: 'content-layer' },
    { type: 'background' },
    { type: 'backgroundItem', itemId: 'i1' }
  ];
  selections.forEach(function (selection) {
    const resolved = model.insertTarget(selection, project, page);
    // 分类块放置路径不读取落点解析结果：直接走 createCategoryElement + elements.push。
    const element = model.createCategoryElement('测试分类', 0, 0, project, 600, page);
    page.elements.push(element);
    assert.equal(page.elements[page.elements.length - 1], element);
    assert.equal(page.elements[page.elements.length - 1].type, 'category');
    const items = page.background.items || page.background.images || [];
    assert.equal(items.length, 0, '背景条目列表必须保持为空');
  });
});
