'use strict';

/*
 * SVG 内在尺寸回归。
 * 运行：node --test scripts/checks/svg-size.test.js
 *
 * 边界：不访问真实图片解码；用带 naturalWidth/naturalHeight 的伪造 Image 验证
 * 资产层会用 SVG 元数据覆盖浏览器默认 300×150 替换元素框。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const loader = require('./loader.js');

const SAMPLE = fs.readFileSync(
  path.join(loader.ROOT, 'samples', 'gdj-divider-8799234.svg'),
  'utf8'
);

function svg(markup) {
  return '<svg xmlns="http://www.w3.org/2000/svg" ' + markup + '></svg>';
}

function closeTo(actual, expected, epsilon) {
  assert.ok(
    Math.abs(actual - expected) <= (epsilon || 1e-9),
    'expected ' + actual + ' to be close to ' + expected
  );
}

test('示例 SVG 使用 viewBox 尺寸', function () {
  const L = loader.load();
  const size = L.assets.svgIntrinsicSize(SAMPLE);
  assert.equal(size.width, 5000);
  assert.equal(size.height, 1081.5);
});

test('显式宽高优先于 viewBox', function () {
  const L = loader.load();
  const size = L.assets.svgIntrinsicSize(svg('width="24" height="24" viewBox="0 0 48 48"'));
  assert.equal(size.width, 24);
  assert.equal(size.height, 24);
});

test('绝对单位按 96dpi 换算', function () {
  const L = loader.load();
  const size = L.assets.svgIntrinsicSize(svg('width="10cm" height="5cm"'));
  closeTo(size.width, (10 / 2.54) * 96, 1e-9);
  closeTo(size.height, (5 / 2.54) * 96, 1e-9);
});

test('百分比不作为绝对尺寸并回退 viewBox', function () {
  const L = loader.load();
  const size = L.assets.svgIntrinsicSize(
    svg('width="100%" height="100%" viewBox="0 0 640 480"')
  );
  assert.equal(size.width, 640);
  assert.equal(size.height, 480);
});

test('单边绝对尺寸按 viewBox 比例推导', function () {
  const L = loader.load();
  const size = L.assets.svgIntrinsicSize(svg('width="300" viewBox="0 0 640 480"'));
  assert.equal(size.width, 300);
  assert.equal(size.height, 225);
});

test('没有可用尺寸信息时返回 null', function () {
  const L = loader.load();
  assert.equal(L.assets.svgIntrinsicSize(svg('')), null);
  assert.equal(L.assets.svgIntrinsicSize(svg('width="100%" height="100%"')), null);
  assert.equal(L.assets.svgIntrinsicSize(svg('viewBox="0 0 0 100"')), null);
});

test('根标签属性值中的 > 不影响解析', function () {
  const L = loader.load();
  const size = L.assets.svgIntrinsicSize(
    svg('data-note="a > b" viewBox="0 0 10 20"')
  );
  assert.equal(size.width, 10);
  assert.equal(size.height, 20);
});

test('setImageSize 覆盖浏览器默认尺寸，imageSize 处理空值', function () {
  const L = loader.load();
  const img = { naturalWidth: 300, naturalHeight: 65, width: 300, height: 65 };
  L.assets.setImageSize(img, { width: 5000, height: 1081.5 });
  assert.equal(L.assets.imageSize(img).width, 5000);
  assert.equal(L.assets.imageSize(img).height, 1081.5);

  const empty = L.assets.imageSize(null);
  assert.equal(empty.width, 0);
  assert.equal(empty.height, 0);
});

test('imageSourceRect 把逻辑裁剪换算到真实像素', function () {
  const L = loader.load();
  const img = {
    naturalWidth: 300,
    naturalHeight: 65,
    __listifyNatural: { width: 5000, height: 1081.5 },
    __listifySource: { x: 0, y: 0, width: 300, height: 65 }
  };
  const source = L.assets.imageSourceRect(img, { left: 10, top: 0, right: 0, bottom: 0 });
  closeTo(source.x, 0.6, 1e-9);
  closeTo(source.width, 299.4, 1e-9);
  closeTo(source.y, 0, 1e-9);
  closeTo(source.height, 65, 1e-9);
});

test('svgImageMetrics 使用内容边界并映射取样框', function () {
  const L = loader.load();
  const info = {
    width: 5000,
    height: 1081.5,
    viewBox: { x: 0, y: 0, width: 5000, height: 1081.5 },
    content: { x: 1000, y: 100, width: 1000, height: 500 },
    preserveAspectRatio: null
  };
  const metrics = L.assets.svgImageMetrics(info, { naturalWidth: 300, naturalHeight: 65 });
  assert.equal(metrics.natural.width, 1000);
  assert.equal(metrics.natural.height, 500);
  const scale = Math.min(300 / 5000, 65 / 1081.5);
  const offsetY = (65 - 1081.5 * scale) / 2;
  closeTo(metrics.source.x, 60, 1e-9);
  closeTo(metrics.source.y, offsetY + 100 * scale, 1e-9);
  closeTo(metrics.source.width, 60, 1e-9);
  closeTo(metrics.source.height, 500 * scale, 1e-9);
});

test('svgViewportMap 处理 preserveAspectRatio 留边', function () {
  const L = loader.load();
  const map = L.assets.svgViewportMap(
    { x: 0, y: 0, width: 1000, height: 500 },
    300, 300, 'xMidYMid meet'
  );
  closeTo(map.scaleX, 0.3, 1e-9);
  closeTo(map.scaleY, 0.3, 1e-9);
  closeTo(map.offsetX, 0, 1e-9);
  closeTo(map.offsetY, 75, 1e-9);
});

test('backgroundGeometry 使用附着在图片上的内在尺寸', function () {
  const L = loader.load();
  const img = {
    naturalWidth: 300,
    naturalHeight: 65,
    width: 300,
    height: 65,
    __listifyNatural: { width: 5000, height: 1081.5 }
  };
  const page = { width: 1080, height: 1920 };

  const original = L.render.backgroundGeometry(page, img, 'original');
  assert.equal(original.width, 5000);
  assert.equal(original.height, 1081.5);
  assert.equal(original.x, -1960);
  assert.equal(original.y, 419.25);

  const fillWidth = L.render.backgroundGeometry(page, img, 'fill-width');
  assert.equal(fillWidth.width, 1080);
  closeTo(fillWidth.height, (1080 * 1081.5) / 5000, 1e-9);
  assert.equal(fillWidth.x, 0);

  const cover = L.render.backgroundGeometry(page, img, 'cover');
  closeTo(cover.width / cover.height, 5000 / 1081.5, 1e-9);
  assert.equal(cover.height, 1920);
});

test('loadImage 在 resolve 前应用 SVG 内在尺寸', async function () {
  const runtime = loader.createRuntime();
  const assets = runtime.Listify.assets;
  const id = 'asset-svg-load-image';
  assets.addBlob(id, new Blob([SAMPLE], { type: 'image/svg+xml' }), 'sample.svg', 'image/svg+xml');

  function FakeImage() {
    this.width = 0;
    this.height = 0;
    this.naturalWidth = 300;
    this.naturalHeight = 65;
  }
  Object.defineProperty(FakeImage.prototype, 'src', {
    set: function () {
      const self = this;
      setTimeout(function () { self.onload(); }, 0);
    }
  });
  runtime.sandbox.Image = FakeImage;

  const img = await assets.loadImage(id);
  assert.equal(assets.imageSize(img).width, 5000);
  assert.equal(assets.imageSize(img).height, 1081.5);
});

test('projectIo.loadImageFromBlob 应用 SVG 内在尺寸', async function () {
  const runtime = loader.createRuntime();
  const projectIo = runtime.Listify.projectIo;

  function FakeImage() {
    this.width = 0;
    this.height = 0;
    this.naturalWidth = 300;
    this.naturalHeight = 65;
  }
  Object.defineProperty(FakeImage.prototype, 'src', {
    set: function () {
      const self = this;
      setTimeout(function () { self.onload(); }, 0);
    }
  });
  runtime.sandbox.Image = FakeImage;

  const blob = new Blob([SAMPLE], { type: 'image/svg+xml' });
  const decoded = await projectIo.loadImageFromBlob(blob, 'sample.svg');
  assert.equal(runtime.Listify.assets.imageSize(decoded.img).width, 5000);
  assert.equal(runtime.Listify.assets.imageSize(decoded.img).height, 1081.5);
});
