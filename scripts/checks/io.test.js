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

/* 一份合法 v3 项目夹具：分类块 + 文本 + 图片（含 1 个图片资产）。 */
function validRaw() {
  return {
    version: 3,
    pageSize: { width: 1080, height: 1920 },
    margins: { top: 60, right: 60, bottom: 60, left: 60 },
    playlist: {
      categories: [{ name: '流行', songs: ['夜曲', '晴天'] }]
    },
    assets: [{ id: 'asset-1', name: '封面', mime: 'image/png', data: 'AAAA' }],
    backgrounds: [
      {
        id: 'bg-1',
        name: '背景 1',
        color: '#ffffff',
        images: [
          {
            id: 'bgimg-1',
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
      }
    ],
    unifiedBackground: false,
    unifiedBackgroundId: null,
    pages: [
      {
        id: 'page-1',
        backgroundId: 'bg-1',
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

/* ---------- 合法项目 ---------- */

test('validateProject：合法 v3 项目零错误', function () {
  assert.deepEqual(errorsOf(validRaw()), { ok: true, errors: [] });
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
  assert.deepEqual(errorsOf(mutated(function (raw) { raw.version = 4; })), {
    ok: false,
    errors: ['项目版本 4 高于当前支持的版本 3，无法加载。']
  });
});

test('validateProject：页面 ID 重复', function () {
  const raw = mutated(function (value) {
    value.pages.push({ id: 'page-1', backgroundId: 'bg-1', elements: [] });
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
    value.backgrounds[0].images[0].assetId = 'missing-asset';
  });
  assert.deepEqual(errorsOf(raw), {
    ok: false,
    errors: ['第 1 个背景第 1 张图片引用了不存在的图片资产。']
  });
});

test('validateProject：无效的背景图定位模式', function () {
  const raw = mutated(function (value) {
    value.backgrounds[0].images[0].fit = 'stretch';
  });
  assert.deepEqual(errorsOf(raw), {
    ok: false,
    errors: ['第 1 个背景第 1 张图片定位模式无效。']
  });
});

test('validateProject：页面缺少背景 ID', function () {
  const raw = mutated(function (value) {
    delete value.pages[0].backgroundId;
  });
  assert.deepEqual(errorsOf(raw), {
    ok: false,
    errors: ['第 1 页缺少背景 ID。']
  });
});

test('validateProject：错误可累积（多个问题一并返回）', function () {
  const raw = mutated(function (value) {
    value.pages[0].elements[0].category = '不存在的分类';
    value.backgrounds[0].images[0].opacity = 2;
  });
  const result = errorsOf(raw);
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [
    '第 1 个背景第 1 张图片透明度无效。',
    '第 1 页第 1 个元素引用了不存在的分类。'
  ]);
});

/* ---------- 结构序列化 ---------- */

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

  assert.equal(structure.version, 3);
  assert.deepEqual(structure.pageSize, { width: 1080, height: 1920 });
  assert.deepEqual(structure.margins, { top: 60, right: 60, bottom: 60, left: 60 });
  assert.deepEqual(structure.playlist, {
    categories: [
      { name: '流行', songs: ['夜曲', '晴天'] },
      { name: '摇滚', songs: ['光辉岁月'] }
    ]
  });
  assert.deepEqual(structure.assets, []);
  assert.equal(structure.backgrounds.length, 1);
  assert.equal(structure.backgrounds[0].id, project.backgrounds[0].id);
  assert.deepEqual(structure.backgrounds[0].images, []);
  assert.equal(structure.unifiedBackground, false);
  assert.equal(structure.unifiedBackgroundId, null);
  assert.equal(structure.pages.length, 1);
  assert.equal(structure.pages[0].id, page.id);
  assert.equal(structure.pages[0].backgroundId, project.backgrounds[0].id);
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
  project.backgrounds[0].images.push(model.createBackgroundImage('asset-1', 'cover'));
  project.backgrounds[0].images[0].id = 'bgimg-1';
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
  project.backgrounds[0].images.push(model.createBackgroundImage('asset-used', 'cover'));
  project.backgrounds[0].images[0].id = 'bgimg-used';

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
  project.backgrounds[0].images.push(model.createBackgroundImage('asset-1', 'cover'));
  project.backgrounds[0].images[0].id = 'bgimg-1';

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
    const image = value.backgrounds[0].images[0];
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
    value.backgrounds[0].images[0].brightness = 2.4;
  })), {
    ok: false,
    errors: ['第 1 个背景第 1 张图片的亮度无效。']
  });

  assert.deepEqual(errorsOf(mutated(function (value) {
    value.backgrounds[0].images[0].fadeMode = 'x';
  })), {
    ok: false,
    errors: ['第 1 个背景第 1 张图片的渐隐模式无效。']
  });

  assert.deepEqual(errorsOf(mutated(function (value) {
    value.backgrounds[0].images[0].fadeAngle = 400;
  })), {
    ok: false,
    errors: ['第 1 个背景第 1 张图片的渐隐角度无效。']
  });

  [
    ['fadePosition', 1.4, '渐隐位置'],
    ['fadeWidth', -0.1, '转场宽度'],
    ['fadeTop', 1.2, '顶部透明度'],
    ['fadeBottom', -1, '底部透明度']
  ].forEach(function (item) {
    assert.deepEqual(errorsOf(mutated(function (value) {
      value.backgrounds[0].images[0][item[0]] = item[1];
    })), {
      ok: false,
      errors: ['第 1 个背景第 1 张图片的' + item[2] + '无效。']
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
    Object.prototype.hasOwnProperty.call(raw.backgrounds[0].images[0], 'brightness'),
    false
  );

  const built = await io.buildProject(raw);
  const backgroundImage = built.project.backgrounds[0].images[0];
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
  const serializedBackground = structure.backgrounds[0].images[0];
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
  const backgroundImage = raw.backgrounds[0].images[0];
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
  const serializedBackground = structure.backgrounds[0].images[0];
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
  raw.backgrounds[0].images[0].fadeMode = 'double';
  raw.pages[0].elements[2].fadeMode = 'single';

  const built = await io.buildProject(raw);
  const backgroundImage = built.project.backgrounds[0].images[0];
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
