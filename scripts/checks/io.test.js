'use strict';

/*
 * js/io.js 的结构序列化、项目校验与草稿信封回归。
 * 运行：node --test scripts/checks/io.test.js
 *
 * 边界：不打开 IndexedDB、不解码图片、不写 localStorage；这些路径依赖浏览器，
 * 由手工回归覆盖。这里只锁住“项目 JSON 结构”和“错误分类”的现有语义。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const loader = require('./loader.js');

const L = loader.load();
const model = L.model;
const io = L.io;
const plain = loader.toPlain;

/* 一份合法 v5 项目夹具：分类块 + 文本 + 图片（含 1 个图片资产）。 */
function validRaw() {
  return {
    version: 5,
    pageSize: { width: 1080, height: 1920 },
    margins: { top: 60, right: 60, bottom: 60, left: 60 },
    playlist: {
      categories: [{ name: '流行', songs: ['夜曲', '晴天'] }]
    },
    assets: [{ id: 'asset-1', name: '封面', mime: 'image/png', data: 'AAAA' }],
    globalBackgroundPageId: null,
    pages: [
      {
        id: 'page-1',
        background: {
          color: '#ffffff',
          items: [
            {
              id: 'bgimg-1',
              kind: 'image',
              assetId: 'asset-1',
              fit: 'cover',
              x: 0,
              y: 0,
              width: 0,
              height: 0,
              rotation: 0,
              keepRatio: true,
              opacity: 1,
              blur: 0
            }
          ]
        },
        elements: [
          {
            id: 'el-cat',
            type: 'category',
            category: '流行',
            showTitle: true,
            x: 60,
            y: 60,
            width: 960,
            titleStyle: {},
            songStyle: {},
            tables: [
              {
                columns: 2,
                rows: 0,
                fill: 'column',
                align: 'left',
                widthMode: 'auto',
                widths: [],
                margins: { top: 0, right: 0, bottom: 0, left: 0 }
              }
            ]
          },
          { id: 'el-text', type: 'text', x: 60, y: 800, width: 480, text: '副标题', style: {} },
          {
            id: 'el-img',
            type: 'image',
            x: 60,
            y: 1000,
            width: 400,
            height: 300,
            assetId: 'asset-1',
            keepRatio: true,
            rotation: 0,
            opacity: 1,
            blur: 0
          }
        ]
      }
    ]
  };
}

function mutated(mutator) {
  const raw = validRaw();
  mutator(raw);
  return raw;
}

function errorsOf(raw) {
  return plain(io.validateProject(raw));
}

/* 版本 3 夹具：用于迁移测试，结构就是 v4 夹具加上背景库与页面引用。 */
function validV3Raw() {
  const raw = validRaw();
  raw.version = 3;
  delete raw.globalBackgroundPageId;
  const page = raw.pages[0];
  raw.backgrounds = [{
    id: 'bg-1',
    name: '背景 1',
    color: page.background.color,
    images: page.background.items
  }];
  raw.unifiedBackground = false;
  raw.unifiedBackgroundId = null;
  page.backgroundId = 'bg-1';
  delete page.background;
  return raw;
}

/* ---------- 合法项目 ---------- */

test('validateProject：合法 v4 项目零错误', function () {
  assert.deepEqual(errorsOf(validRaw()), { ok: true, errors: [] });
});

test('背景文字条目：v5 校验通过', function () {
  const raw = validRaw();
  raw.pages[0].background.items.push({
    id: 'bgtext-1',
    kind: 'text',
    x: 100,
    y: 200,
    width: 480,
    height: 120,
    text: '底纹文字',
    style: { fontFamily: 'sans-serif', fontSize: 48, color: '#111827' }
  });
  assert.deepEqual(errorsOf(raw), { ok: true, errors: [] });
});

test('validateProject：背景文字条目缺内容或矩形无效时报错', function () {
  const missingText = validRaw();
  missingText.pages[0].background.items.push({
    id: 'bgtext-2', kind: 'text', x: 0, y: 0, width: 100, height: 50
  });
  assert.ok(errorsOf(missingText).errors.length > 0);

  const badRect = validRaw();
  badRect.pages[0].background.items.push({
    id: 'bgtext-3', kind: 'text', x: 0, y: 0, width: 0, height: 50, text: 'x', style: {}
  });
  assert.ok(errorsOf(badRect).errors.length > 0);
});

/* ---------- 错误分类 ---------- */

test('validateProject：非对象项目', function () {
  assert.deepEqual(errorsOf(null), {
    ok: false,
    errors: ['项目文件不是有效的 JSON 对象。']
  });
  assert.deepEqual(errorsOf([]), {
    ok: false,
    errors: ['项目文件不是有效的 JSON 对象。']
  });
});

test('validateProject：缺失或未来版本', function () {
  assert.deepEqual(errorsOf({}), {
    ok: false,
    errors: ['项目版本无效或缺失，无法加载。']
  });
  assert.deepEqual(errorsOf(mutated(function (raw) { raw.version = 6; })), {
    ok: false,
    errors: ['项目版本 6 高于当前支持的版本 5，无法加载。']
  });
});

test('validateProject：页面 ID 重复', function () {
  const raw = mutated(function (value) {
    value.pages.push({ id: 'page-1', background: { color: '#fff', items: [] }, elements: [] });
  });
  assert.deepEqual(errorsOf(raw), {
    ok: false,
    errors: ['页面 ID 重复：page-1']
  });
});

test('validateProject：分类名称重复', function () {
  const raw = mutated(function (value) {
    value.playlist.categories.push({ name: '流行', songs: [] });
  });
  assert.deepEqual(errorsOf(raw), {
    ok: false,
    errors: ['分类名称重复：流行']
  });
});

test('validateProject：图片资产 ID 重复', function () {
  const raw = mutated(function (value) {
    value.assets.push({ id: 'asset-1', name: '另一张', mime: 'image/png', data: 'AAAA' });
  });
  assert.deepEqual(errorsOf(raw), {
    ok: false,
    errors: ['图片资产 ID 重复：asset-1']
  });
});

test('validateProject：元素 ID 重复', function () {
  const raw = mutated(function (value) {
    value.pages[0].elements[1].id = 'el-cat';
  });
  assert.deepEqual(errorsOf(raw), {
    ok: false,
    errors: ['元素 ID 重复：el-cat']
  });
});

test('validateProject：图片资产缺少 base64 数据', function () {
  const raw = mutated(function (value) {
    value.assets[0].data = '';
  });
  assert.deepEqual(errorsOf(raw), {
    ok: false,
    errors: ['图片资产“asset-1”缺少 base64 数据。']
  });
});

test('validateProject：缺失的图片资产（元素引用）', function () {
  const raw = mutated(function (value) {
    value.pages[0].elements[2].assetId = 'missing-asset';
  });
  assert.deepEqual(errorsOf(raw), {
    ok: false,
    errors: ['第 1 页第 3 个元素引用了不存在的图片资产。']
  });
});

test('validateProject：缺失的图片资产（背景图引用）', function () {
  const raw = mutated(function (value) {
    value.pages[0].background.items[0].assetId = 'missing-asset';
  });
  assert.deepEqual(errorsOf(raw), {
    ok: false,
    errors: ['第 1 页第 1 个背景条目（图片）引用了不存在的图片资产。']
  });
});

test('validateProject：无效的背景图定位模式', function () {
  const raw = mutated(function (value) {
    value.pages[0].background.items[0].fit = 'stretch';
  });
  assert.deepEqual(errorsOf(raw), {
    ok: false,
    errors: ['第 1 页第 1 个背景条目（图片）定位模式无效。']
  });
});

test('validateProject：页面缺少背景', function () {
  const raw = mutated(function (value) {
    delete value.pages[0].background;
  });
  assert.deepEqual(errorsOf(raw), {
    ok: false,
    errors: ['第 1 页的背景缺失或无效。']
  });
});

test('validateProject：错误可累积（多个问题一并返回）', function () {
  const raw = mutated(function (value) {
    value.pages[0].elements[0].category = '不存在的分类';
    value.pages[0].background.items[0].opacity = 2;
  });
  const result = errorsOf(raw);
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [
    '第 1 页第 1 个背景条目（图片）透明度无效。',
    '第 1 页第 1 个元素引用了不存在的分类。'
  ]);
});

/* ---------- 结构序列化 ---------- */

test('validateProject：裁剪字段缺失合法、非负整数合法', function () {
  assert.deepEqual(errorsOf(validRaw()), { ok: true, errors: [] });
  const raw = mutated(function (item) {
    item.pages[0].elements[2].crop = { top: 10, right: 0, bottom: 10, left: 0 };
    item.pages[0].background.items[0].crop = { top: 0, right: 5, bottom: 0, left: 5 };
  });
  assert.deepEqual(errorsOf(raw), { ok: true, errors: [] });
});

test('validateProject：负数或非整数裁剪报错', function () {
  const negative = mutated(function (item) {
    item.pages[0].elements[2].crop = { top: -1, right: 0, bottom: 0, left: 0 };
  });
  assert.equal(errorsOf(negative).ok, false);
  const fraction = mutated(function (item) {
    item.pages[0].background.items[0].crop = { top: 1.5, right: 0, bottom: 0, left: 0 };
  });
  assert.equal(errorsOf(fraction).ok, false);
});

test('serializeProjectStructure：图片与背景图导出裁剪字段', function () {
  const project = model.createDefaultProject();
  project.assets = [{ id: 'asset-1', name: '封面', mime: 'image/png' }];
  const page = project.pages[0];
  page.background.items.push(model.createBackgroundImage('asset-1', 'cover'));
  page.background.items[0].crop = { top: 1, right: 2, bottom: 3, left: 4 };
  const element = model.createImageElement(project, 'asset-1', 400, 300);
  element.crop = { top: 5, right: 6, bottom: 7, left: 8 };
  page.elements.push(element);

  const structure = plain(io.serializeProjectStructure(project));
  assert.deepEqual(structure.pages[0].background.items[0].crop,
    { top: 1, right: 2, bottom: 3, left: 4 });
  assert.deepEqual(structure.pages[0].elements[0].crop,
    { top: 5, right: 6, bottom: 7, left: 8 });
});

/* ---------- 项目结构序列化 ---------- */

test('serializeProjectStructure：导出结构字段与合法项目一致', function () {
  const project = model.createDefaultProject();
  project.playlist.categories = [
    { name: '流行', songs: ['夜曲', '晴天'] },
    { name: '摇滚', songs: ['光辉岁月'] }
  ];
  const page = project.pages[0];
  const element = model.createCategoryElement('流行', project.margins.left, project.margins.top, project, 960, page);
  page.elements.push(element);
  page.elements.push(model.createTextElement(project, '副标题', page));

  const structure = plain(io.serializeProjectStructure(project));

  assert.equal(structure.version, 5);
  assert.deepEqual(structure.pageSize, { width: 1080, height: 1920 });
  assert.deepEqual(structure.margins, { top: 60, right: 60, bottom: 60, left: 60 });
  assert.deepEqual(structure.playlist, {
    categories: [
      { name: '流行', songs: ['夜曲', '晴天'] },
      { name: '摇滚', songs: ['光辉岁月'] }
    ]
  });
  assert.deepEqual(structure.assets, []);
  assert.equal(structure.globalBackgroundPageId, null);
  assert.equal(structure.pages.length, 1);
  assert.equal(structure.pages[0].id, page.id);
  assert.deepEqual(structure.pages[0].background, { color: '#ffffff', items: [] });
  assert.deepEqual(
    structure.pages[0].elements.map(function (item) { return item.type; }),
    ['category', 'text']
  );

  // 结构本身可被校验器接受。
  assert.deepEqual(errorsOf(structure), { ok: true, errors: [] });
});

test('serializeProjectStructure：JSON 往返稳定且可重复序列化', function () {
  const project = model.createDefaultProject();
  project.playlist.categories = [{ name: '流行', songs: ['夜曲', '晴天'] }];
  project.assets = [{ id: 'asset-1', name: '封面', mime: 'image/png' }];
  project.pages[0].background.items.push(model.createBackgroundImage('asset-1', 'cover'));
  project.pages[0].background.items[0].id = 'bgimg-1';
  const page = project.pages[0];
  page.elements.push(model.createCategoryElement('流行', 60, 60, project, 960, page));
  page.elements.push(model.createTextElement(project, '副标题', page));

  const structure = io.serializeProjectStructure(project);
  const roundTripped = JSON.parse(JSON.stringify(structure));

  assert.deepEqual(plain(roundTripped), plain(structure));
  // 对结构再序列化一次应保持不变（幂等），说明字段没有丢失或二次包装。
  assert.deepEqual(plain(io.serializeProjectStructure(roundTripped)), plain(roundTripped));
});

test('serializeProjectStructure：只导出被引用的资产元数据，不含 base64', function () {
  const project = model.createDefaultProject();
  project.assets = [
    { id: 'asset-used', name: '用到的图', mime: 'image/png' },
    { id: 'asset-unused', name: '未用的图', mime: 'image/png' }
  ];
  project.pages[0].background.items.push(model.createBackgroundImage('asset-used', 'cover'));
  project.pages[0].background.items[0].id = 'bgimg-used';

  const structure = plain(io.serializeProjectStructure(project));

  assert.deepEqual(structure.assets, [
    { id: 'asset-used', name: '用到的图', mime: 'image/png' }
  ]);
  assert.equal(Object.prototype.hasOwnProperty.call(structure.assets[0], 'data'), false);
  assert.equal(JSON.stringify(structure).indexOf('"data"'), -1);
});

/* ---------- 草稿信封 ---------- */

test('createDraftEnvelope：包含 schema/ui/结构，不含 base64 资产数据', function () {
  const project = model.createDefaultProject();
  project.playlist.categories = [{ name: '流行', songs: ['夜曲'] }];
  project.assets = [{ id: 'asset-1', name: '封面', mime: 'image/png' }];
  project.pages[0].background.items.push(model.createBackgroundImage('asset-1', 'cover'));
  project.pages[0].background.items[0].id = 'bgimg-1';

  const envelope = plain(io.createDraftEnvelope(project, project.pages[0].id));

  assert.equal(envelope.schema, io.DRAFT_SCHEMA);
  assert.equal(envelope.savedAt, 0);
  assert.deepEqual(envelope.ui, { currentPageId: project.pages[0].id });
  assert.deepEqual(envelope.project.assets, [
    { id: 'asset-1', name: '封面', mime: 'image/png' }
  ]);

  const text = JSON.stringify(envelope);
  assert.equal(text.indexOf('"data"'), -1);
  assert.equal(text.indexOf('base64'), -1);
  assert.equal(text.indexOf('data:image'), -1);
});

/* ---------- 图片调色与渐隐字段 ---------- */

test('validateProject：图片效果字段缺失合法、存在且在范围内合法', function () {
  assert.deepEqual(errorsOf(validRaw()), { ok: true, errors: [] });

  const raw = mutated(function (value) {
    const image = value.pages[0].background.items[0];
    image.brightness = 1.3;
    image.hue = -45;
    image.fadeMode = 'double';
    image.fadeAngle = 120;
    image.fadePosition = 0.4;
    image.fadeWidth = 0.2;
    image.fadeTop = 0.75;
    image.fadeBottom = 0.5;
    const free = value.pages[0].elements[2];
    free.brightness = 0.8;
    free.hue = 60;
    free.fadeMode = 'single';
    free.fadeAngle = 30;
    free.fadePosition = 0.1;
    free.fadeWidth = 0.8;
    free.fadeTop = 0.25;
    free.fadeBottom = 0.9;
  });
  assert.deepEqual(errorsOf(raw), { ok: true, errors: [] });
});

test('validateProject：背景图效果字段越界报错', function () {
  assert.deepEqual(errorsOf(mutated(function (value) {
    value.pages[0].background.items[0].brightness = 2.4;
  })), {
    ok: false,
    errors: ['第 1 页第 1 个背景条目（图片）的亮度无效。']
  });

  assert.deepEqual(errorsOf(mutated(function (value) {
    value.pages[0].background.items[0].fadeMode = 'x';
  })), {
    ok: false,
    errors: ['第 1 页第 1 个背景条目（图片）的渐隐模式无效。']
  });

  assert.deepEqual(errorsOf(mutated(function (value) {
    value.pages[0].background.items[0].fadeAngle = 400;
  })), {
    ok: false,
    errors: ['第 1 页第 1 个背景条目（图片）的渐隐角度无效。']
  });

  [
    ['fadePosition', 1.4, '渐隐位置'],
    ['fadeWidth', -0.1, '转场宽度'],
    ['fadeTop', 1.2, '顶部透明度'],
    ['fadeBottom', -1, '底部透明度']
  ].forEach(function (item) {
    assert.deepEqual(errorsOf(mutated(function (value) {
      value.pages[0].background.items[0][item[0]] = item[1];
    })), {
      ok: false,
      errors: ['第 1 页第 1 个背景条目（图片）的' + item[2] + '无效。']
    });
  });
});

test('validateProject：自由图片效果字段越界报错', function () {
  assert.deepEqual(errorsOf(mutated(function (value) {
    value.pages[0].elements[2].hue = 200;
  })), {
    ok: false,
    errors: ['第 1 页第 3 个元素的色相无效。']
  });
});

test('buildProject：旧对象缺少效果字段时取默认值，序列化后补齐', async function () {
  const raw = validRaw();
  // 不加载任何资产：本用例只关心字段归一化，跳过图片解码。
  raw.assets = [];
  assert.deepEqual(
    Object.prototype.hasOwnProperty.call(raw.pages[0].background.items[0], 'brightness'),
    false
  );

  const built = await io.buildProject(raw);
  const backgroundImage = built.project.pages[0].background.items[0];
  assert.equal(backgroundImage.brightness, 1);
  assert.equal(backgroundImage.hue, 0);
  assert.equal(backgroundImage.fadeMode, 'off');
  assert.equal(backgroundImage.fadeAngle, 0);
  assert.equal(backgroundImage.fadePosition, 0);
  assert.equal(backgroundImage.fadeWidth, 1);
  assert.equal(backgroundImage.fadeTop, 0);
  assert.equal(backgroundImage.fadeBottom, 1);

  const freeImage = built.project.pages[0].elements.find(function (element) {
    return element.type === 'image';
  });
  assert.equal(freeImage.brightness, 1);
  assert.equal(freeImage.hue, 0);
  assert.equal(freeImage.fadeMode, 'off');
  assert.equal(freeImage.fadeAngle, 0);
  assert.equal(freeImage.fadePosition, 0);
  assert.equal(freeImage.fadeWidth, 1);
  assert.equal(freeImage.fadeTop, 0);
  assert.equal(freeImage.fadeBottom, 1);

  const structure = plain(io.serializeProjectStructure(built.project));
  const serializedBackground = structure.pages[0].background.items[0];
  assert.equal(serializedBackground.brightness, 1);
  assert.equal(serializedBackground.hue, 0);
  assert.equal(serializedBackground.fadeMode, 'off');
  assert.equal(serializedBackground.fadeAngle, 0);
  assert.equal(serializedBackground.fadePosition, 0);
  assert.equal(serializedBackground.fadeWidth, 1);
  assert.equal(serializedBackground.fadeTop, 0);
  assert.equal(serializedBackground.fadeBottom, 1);
  const serializedFree = structure.pages[0].elements.find(function (element) {
    return element.type === 'image';
  });
  assert.equal(serializedFree.brightness, 1);
  assert.equal(serializedFree.hue, 0);
  assert.equal(serializedFree.fadeMode, 'off');
  assert.equal(serializedFree.fadeAngle, 0);
  assert.equal(serializedFree.fadePosition, 0);
  assert.equal(serializedFree.fadeWidth, 1);
  assert.equal(serializedFree.fadeTop, 0);
  assert.equal(serializedFree.fadeBottom, 1);
});

test('buildProject：非默认效果字段往返后逐字段相等', async function () {
  const raw = validRaw();
  raw.assets = [];
  const backgroundImage = raw.pages[0].background.items[0];
  backgroundImage.brightness = 1.3;
  backgroundImage.hue = 60;
  backgroundImage.fadeMode = 'double';
  backgroundImage.fadeAngle = 120;
  backgroundImage.fadePosition = 0.4;
  backgroundImage.fadeWidth = 0.2;
  backgroundImage.fadeTop = 0.75;
  backgroundImage.fadeBottom = 0.5;
  const freeImage = raw.pages[0].elements[2];
  freeImage.brightness = 0.8;
  freeImage.hue = -45;
  freeImage.fadeMode = 'single';
  freeImage.fadeAngle = 30;
  freeImage.fadePosition = 0.1;
  freeImage.fadeWidth = 0.8;
  freeImage.fadeTop = 0.25;
  freeImage.fadeBottom = 0.9;

  const built = await io.buildProject(raw);
  const structure = plain(io.serializeProjectStructure(built.project));
  const serializedBackground = structure.pages[0].background.items[0];
  const serializedFree = structure.pages[0].elements[2];

  [
    [serializedBackground, backgroundImage],
    [serializedFree, freeImage]
  ].forEach(function (pair) {
    const actual = pair[0];
    const expected = pair[1];
    ['brightness', 'hue', 'fadeMode', 'fadeAngle',
      'fadePosition', 'fadeWidth', 'fadeTop', 'fadeBottom'].forEach(function (key) {
      assert.equal(actual[key], expected[key], key + ' 应往返一致');
    });
  });
});

test('buildProject：渐隐字段缺失时按模式预设补齐', async function () {
  const raw = validRaw();
  raw.assets = [];
  raw.pages[0].background.items[0].fadeMode = 'double';
  raw.pages[0].elements[2].fadeMode = 'single';

  const built = await io.buildProject(raw);
  const backgroundImage = built.project.pages[0].background.items[0];
  assert.deepEqual(
    [backgroundImage.fadePosition, backgroundImage.fadeWidth,
      backgroundImage.fadeTop, backgroundImage.fadeBottom],
    [0.5, 0, 1, 1]
  );
  const freeImage = built.project.pages[0].elements[2];
  assert.deepEqual(
    [freeImage.fadePosition, freeImage.fadeWidth,
      freeImage.fadeTop, freeImage.fadeBottom],
    [0, 1, 0, 1]
  );
});

/* ---------- 图形v5 ---------- */

function shapeElement(overrides) {
  return Object.assign({
    id: 'el-shape',
    type: 'shape',
    x: 100,
    y: 200,
    width: 240,
    height: 160,
    rotation: 15,
    shape: 'diamond',
    mode: 'stroke',
    color: '#123456',
    radius: -18,
    strokeWidth: 8,
    opacity: 0.8,
    blur: 2,
    brightness: 1.1,
    hue: -30,
    fadeMode: 'single',
    fadeAngle: 45,
    fadePosition: 0.2,
    fadeWidth: 0.5,
    fadeTop: 0.4,
    fadeBottom: 0.9
  }, overrides || {});
}

test('validateProject：v5 内容图形与背景图形合法', function () {
  const raw = validRaw();
  raw.pages[0].elements.push(shapeElement());
  raw.pages[0].background.items.push(Object.assign(shapeElement({ id: 'bgshape-1' }), { kind: 'shape' }));
  assert.deepEqual(errorsOf(raw), { ok: true, errors: [] });
});

test('validateProject：v5 拒绝未知背景条目 kind 与非法图形枚举', function () {
  const unknown = validRaw();
  unknown.pages[0].background.items.push({ id: 'bg-unknown', kind: 'video' });
  assert.equal(errorsOf(unknown).ok, false);

  const badShape = validRaw();
  badShape.pages[0].elements.push(shapeElement({ shape: 'ellipse' }));
  assert.equal(errorsOf(badShape).ok, false);

  const badMode = validRaw();
  badMode.pages[0].elements.push(shapeElement({ mode: 'glow' }));
  assert.equal(errorsOf(badMode).ok, false);
});

test('validateProject：v5 拒绝超出正负上限的圆角与边框厚度', function () {
  const rect = function (overrides) {
    return Object.assign({
      id: 'shape-limit', type: 'shape', shape: 'rect', mode: 'fill', color: '#333333',
      x: 0, y: 0, width: 200, height: 100, rotation: 0, radius: 0, strokeWidth: 8,
      opacity: 1, blur: 0, brightness: 1, hue: 0, fadeMode: 'off'
    }, overrides);
  };
  [rect({ radius: 80 }), rect({ radius: -80 }), rect({ mode: 'stroke', strokeWidth: 80 })].forEach(function (element) {
    const raw = validRaw();
    raw.assets = [];
    raw.pages[0].elements.push(element);
    assert.equal(errorsOf(raw).ok, false);
  });
});

test('validateProject：v5 背景只接受 items，不再接受 images', function () {
  const raw = validRaw();
  raw.pages[0].background = {
    color: '#ffffff',
    images: raw.pages[0].background.items
  };
  assert.equal(errorsOf(raw).ok, false);
});

test('buildProject：v5 图形字段往返一致（含负圆角）', async function () {
  const raw = validRaw();
  raw.assets = [];
  const source = shapeElement();
  raw.pages[0].elements.push(source);
  const shapeItem = Object.assign(shapeElement({ id: 'bgshape-1' }), { kind: 'shape' });
  raw.pages[0].background.items.push(shapeItem);

  const built = await io.buildProject(raw);
  const structure = plain(io.serializeProjectStructure(built.project));
  const serialized = structure.pages[0].elements.find(function (item) { return item.type === 'shape'; });
  const serializedBackground = structure.pages[0].background.items.find(function (item) { return item.kind === 'shape'; });
  [serialized, serializedBackground].forEach(function (item) {
    ['shape', 'mode', 'color', 'radius', 'strokeWidth', 'rotation',
      'opacity', 'blur', 'brightness', 'hue', 'fadeMode', 'fadeAngle',
      'fadePosition', 'fadeWidth', 'fadeTop', 'fadeBottom'].forEach(function (key) {
      assert.equal(item[key], source[key], key + ' 应往返一致');
    });
    assert.equal(item.radius, -18);
  });
  assert.equal(Object.prototype.hasOwnProperty.call(structure.pages[0].background, 'images'), false);
});

/* ---------- 版本迁移：背景入库 → 每页背景 ---------- */

test('buildProject：v4 背景 images 按原顺序迁移为 v5 items', async function () {
  const raw = validRaw();
  raw.assets = [];
  raw.version = 4;
  const images = raw.pages[0].background.items;
  delete raw.pages[0].background.items;
  raw.pages[0].background.images = images.map(function (image) {
    const copy = Object.assign({}, image);
    delete copy.kind;
    return copy;
  });
  raw.pages[0].background.images.push(Object.assign({}, raw.pages[0].background.images[0], {
    id: 'bgimg-2',
    assetId: 'asset-1',
    opacity: 0.4
  }));

  const built = await io.buildProject(raw);
  assert.equal(built.project.version, 5);
  const items = built.project.pages[0].background.items;
  assert.equal(items.length, 2);
  assert.deepEqual(items.map(function (item) { return item.id; }), ['bgimg-1', 'bgimg-2']);
  assert.deepEqual(items.map(function (item) { return item.kind; }), ['image', 'image']);
  assert.equal(items[1].opacity, 0.4);
});

test('buildProject：v3 全局背景迁移为来源页，各页保留自己的背景副本', async function () {
  const raw = validV3Raw();
  raw.assets = [];
  raw.pages.push({
    id: 'page-2',
    backgroundId: 'bg-1',
    elements: []
  });
  raw.unifiedBackground = true;
  raw.unifiedBackgroundId = 'bg-1';

  const built = await io.buildProject(raw);
  assert.equal(built.project.version, 5);
  assert.equal(built.project.globalBackgroundPageId, 'page-1');
  assert.equal(built.project.pages.length, 2);
  assert.equal(built.project.pages[0].background.items.length, 1);
  assert.equal(built.project.pages[1].background.items.length, 1);
  assert.notEqual(
    built.project.pages[0].background.items[0].id,
    built.project.pages[1].background.items[0].id
  );
  assert.equal(built.project.pages[1].background.items[0].assetId, 'asset-1');
});

test('buildProject：v3 全局背景没有页面引用时复制到第一页并成为来源', async function () {
  const raw = validV3Raw();
  raw.assets = [];
  raw.backgrounds.push({
    id: 'bg-2',
    name: '全局',
    color: '#101010',
    images: []
  });
  raw.unifiedBackground = true;
  raw.unifiedBackgroundId = 'bg-2';

  const built = await io.buildProject(raw);
  assert.equal(built.project.globalBackgroundPageId, 'page-1');
  assert.equal(built.project.pages[0].background.color, '#101010');
  assert.equal(built.project.pages[0].background.items.length, 0);
});

test('buildProject：v3 无全局背景时不设置来源页', async function () {
  const raw = validV3Raw();
  raw.assets = [];

  const built = await io.buildProject(raw);
  assert.equal(built.project.globalBackgroundPageId, null);
  assert.equal(built.project.pages[0].background.color, '#ffffff');
});

test('buildProject：v2 引用组折叠为每页背景，共享时设来源页', async function () {
  const raw = validV3Raw();
  raw.assets = [];
  raw.version = 2;
  delete raw.backgrounds;
  delete raw.unifiedBackground;
  delete raw.unifiedBackgroundId;
  const page1 = raw.pages[0];
  page1.background = {
    assetId: 'asset-1',
    fit: 'cover',
    color: '#ffffff',
    opacity: 0.8,
    blur: 2
  };
  delete page1.backgroundId;
  raw.pages.push({
    id: 'page-2',
    backgroundRef: 'page-1',
    elements: []
  });

  const built = await io.buildProject(raw);
  assert.equal(built.project.version, 5);
  assert.equal(built.project.pages[1].background.items.length, 1);
  assert.equal(built.project.pages[1].background.items[0].assetId, 'asset-1');
  assert.equal(built.project.pages[1].background.items[0].opacity, 0.8);
  assert.equal(built.project.globalBackgroundPageId, 'page-1');
});

test('validateProject：v4 全局来源页必须指向存在的页面', function () {
  assert.deepEqual(errorsOf(mutated(function (value) {
    value.globalBackgroundPageId = 'missing-page';
  })), {
    ok: false,
    errors: ['全局背景来源页无效。']
  });
  assert.deepEqual(errorsOf(mutated(function (value) {
    value.globalBackgroundPageId = null;
  })), { ok: true, errors: [] });
});

test('buildProject：迁移结果不残留背景库字段', async function () {
  const raw = validV3Raw();
  raw.assets = [];
  const built = await io.buildProject(raw);
  assert.equal(Object.prototype.hasOwnProperty.call(built.project, 'backgrounds'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(built.project, 'unifiedBackground'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(built.project.pages[0], 'backgroundId'), false);
});
