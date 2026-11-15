(function () {
  'use strict';

  const L = window.Listify = window.Listify || {};
  const ui = L.ui = L.ui || {};

  const model = L.model;
  const esc = ui.esc;
  const helpTip = ui.helpTip;

  function openBackgroundLibrary() {
    const project = L.app.state.project;
    const rows = (project.backgrounds || []).map(function (set) {
      const count = model.backgroundReferenceCount(project, set.id);
      const isGlobal = !!project.unifiedBackground && project.unifiedBackgroundId === set.id;
      const check = model.canDeleteBackground(project, set.id);
      return '<div class="bg-library-row" data-bg-lib-row="' + esc(set.id) + '">' +
        '<input class="input" data-bg-lib-name="' + esc(set.id) + '" value="' + esc(set.name) + '">' +
        '<span class="hint">' + count + ' 页使用' + (isGlobal ? ' · 全局使用中' : '') + '</span>' +
        '<div class="inline-actions">' +
          '<button class="btn btn-sm" data-bg-lib-duplicate="' + esc(set.id) + '">复制</button>' +
          '<button class="btn btn-sm btn-danger" data-bg-lib-delete="' + esc(set.id) + '"' +
            (check.ok ? '' : ' disabled title="' + esc(check.reason) + '"') + '>删除</button>' +
        '</div>' +
      '</div>';
    }).join('');
    const modal = ui.modal.open({
      title: '背景库',
      width: '560px',
      body: '<div class="prop-group">' +
        '<div class="bg-library-tiprow">' +
          helpTip('背景库只管理背景本身；页面使用哪一套背景由页面属性或全局背景决定。') +
        '</div>' +
        '<div class="bg-library-list">' + rows + '</div>' +
      '</div>',
      actions: [
        {
          label: '新建空白背景',
          onClick: function () {
            L.app.addBackgroundSet();
            openBackgroundLibrary();
          }
        },
        { label: '关闭', className: 'btn-primary', onClick: function (close) { close(); } }
      ]
    });
    modal.body.querySelectorAll('[data-bg-lib-name]').forEach(function (input) {
      input.addEventListener('change', function () {
        L.app.renameBackgroundSet(input.getAttribute('data-bg-lib-name'), input.value);
      });
    });
    modal.body.querySelectorAll('[data-bg-lib-duplicate]').forEach(function (button) {
      button.addEventListener('click', function () {
        L.app.duplicateBackgroundSet(button.getAttribute('data-bg-lib-duplicate'));
        openBackgroundLibrary();
      });
    });
    modal.body.querySelectorAll('[data-bg-lib-delete]').forEach(function (button) {
      button.addEventListener('click', function () {
        L.app.deleteBackgroundSet(button.getAttribute('data-bg-lib-delete'));
        openBackgroundLibrary();
      });
    });
  }

  /* ---------- 预置素材选择（选择背景图） ---------- */

  // 素材指引外链（静态列表：将来某站失效直接改这里；hover 提示注明许可/用法）。
  const PRESET_SOURCE_LINKS = [
    { name: 'Pixabay', url: 'https://pixabay.com/', note: 'Pixabay License：可自由使用、可商用、无需署名' },
    { name: 'Unsplash', url: 'https://unsplash.com/', note: 'Unsplash License：可自由使用、可商用、建议署名' },
    { name: 'Pexels', url: 'https://www.pexels.com/', note: 'Pexels License：可自由使用、可商用、无需署名' },
    { name: 'OpenGameArt', url: 'https://opengameart.org/', note: '单件许可不一，使用前请逐件确认（优先 CC0）' }
  ];

  // 在线纹理生成器：免费免登录，导出 PNG 后直接拖回弹窗。
  // 建议导出尺寸 1080×1920（页面默认竖版），2 倍图 2160×3840。
  const PRESET_GENERATOR_LINKS = [
    {
      name: 'Creatica',
      url: 'https://creatica.app/backgrounds',
      note: '免费、免登录；导出 PNG，建议 1080×1920（2 倍图 2160×3840）'
    },
    {
      name: 'Haikei',
      url: 'https://app.haikei.app/',
      note: '免费、免登录；导出 PNG，建议 1080×1920（2 倍图 2160×3840）'
    }
  ];

  // 统一「选择背景图」弹窗。mode 决定应用链路，弹窗内内容决定图片来源：
  //   whole   页面属性入口：预置整套应用（新建/复用「预置·X」集并指派当前页；本地→新建集+图→指派）
  //   add     图层面板/背景集加图：追加到当前背景集
  //   replace 图片属性替换：替换选中的背景图片（保留定位/透明度/模糊）
  function openPresetPicker(mode, context) {
    const ctx = context || {};
    const body = document.createElement('div');
    body.className = 'preset-picker';
    body.innerHTML = '<div class="preset-picker-loading">正在加载预置素材…</div>';
    const handle = ui.modal.open({
      title: '选择背景图',
      width: '640px',
      body: body
    });
    const modalEl = handle.root.querySelector('.modal');
    if (modalEl) modalEl.classList.add('preset-modal');

    // 拖入图片文件走本地图片链路（复用现有读取管线）。
    body.addEventListener('dragover', function (event) {
      event.preventDefault();
      body.classList.add('dragging');
    });
    body.addEventListener('dragleave', function () { body.classList.remove('dragging'); });
    body.addEventListener('drop', function (event) {
      event.preventDefault();
      body.classList.remove('dragging');
      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (!file) return;
      if (!file.type || file.type.indexOf('image/') !== 0) {
        ui.toast('请拖入图片文件。', 'error');
        return;
      }
      handle.close(true);
      L.app.handleDroppedBackgroundFile(mode, ctx, file);
    });

    // 打开弹窗只加载索引（约 0.45MB），分类数据块按需加载。
    function loadPicker() {
      body.innerHTML = '<div class="preset-picker-loading">正在加载预置素材…</div>';
      L.presets.loadIndex().then(function (index) {
        if (!document.contains(body)) return;
        renderPresetGrid(body, index, mode, ctx, handle);
      }).catch(function () {
        if (!document.contains(body)) return;
        renderPresetIndexError(body, mode, ctx, handle, loadPicker);
      });
    }
    loadPicker();
  }

  // 索引加载失败：报错但保留本地图片入口（spec：清单加载失败不影响本地图片）。
  function renderPresetIndexError(body, mode, ctx, handle, retry) {
    body.innerHTML = '';
    const notice = document.createElement('div');
    notice.className = 'preset-picker-error';
    notice.textContent = '预置素材索引加载失败，请重试；本地图片仍可使用。';
    body.appendChild(notice);
    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'btn preset-retry';
    retryBtn.textContent = '重新加载预置素材';
    retryBtn.addEventListener('click', retry);
    body.appendChild(retryBtn);
    body.appendChild(createLocalRow(mode, ctx, handle));
    body.appendChild(createHint('预置素材加载失败时，仍可点击上方“本地图片”，或直接把图片文件拖入本弹窗。'));
  }

  // 本地图片入口：网格下方整行虚线按钮，任何标签下都无需滚动即可见。
  function createLocalRow(mode, ctx, handle) {
    const local = document.createElement('button');
    local.type = 'button';
    local.className = 'preset-local-row';
    local.title = '从本机选择图片文件，或直接把图片拖入本弹窗';
    local.innerHTML = '<span class="preset-local-icon">＋</span>' +
      '<span class="preset-local-text">本地图片<span class="preset-local-sub"> — 或直接把图片文件拖入本弹窗</span></span>';
    local.addEventListener('click', function () {
      handle.close(true);
      if (mode === 'whole') L.app.pickBackgroundImageWhole();
      else L.app.pickBackgroundImage(ctx.setId, mode === 'replace' ? ctx.imageId : null);
    });
    return local;
  }

  // 素材指引区：两行两组（素材库 / 在线生成器），均为代码内静态常量。
  function createLinks() {
    const links = document.createElement('div');
    links.className = 'preset-links';
    let linksHtml = '<div class="preset-links-row"><span class="preset-links-label">更多免费素材：</span>';
    PRESET_SOURCE_LINKS.forEach(function (link) {
      linksHtml += '<a class="preset-link" href="' + esc(link.url) + '" target="_blank" rel="noopener" title="' + esc(link.note) + '">' + esc(link.name) + '</a>';
    });
    linksHtml += '</div><div class="preset-links-row"><span class="preset-links-label">在线生成纹理：</span>';
    PRESET_GENERATOR_LINKS.forEach(function (link) {
      linksHtml += '<a class="preset-link" href="' + esc(link.url) + '" target="_blank" rel="noopener" title="' + esc(link.note) + '">' + esc(link.name) + '</a>';
    });
    linksHtml += '</div>';
    links.innerHTML = linksHtml;
    return links;
  }

  function createHint(text) {
    const hint = document.createElement('div');
    hint.className = 'preset-hint';
    hint.textContent = text;
    return hint;
  }

  function renderPresetGrid(body, index, mode, ctx, handle) {
    const categories = Array.isArray(index.categories) ? index.categories : [];
    const items = Array.isArray(index.items) ? index.items : [];
    const showAll = index.showAll !== false;
    const ALL = 'all';
    let filter = showAll ? ALL : (categories.length ? categories[0].id : ALL);
    body.innerHTML = '';

    function categoryName(catId) {
      for (let i = 0; i < categories.length; i += 1) {
        if (categories[i].id === catId) return categories[i].name;
      }
      return catId;
    }

    function chunkReady(catId) {
      return !!(L.PRESETS_CHUNKS && L.PRESETS_CHUNKS[catId]);
    }

    // 标签由索引分类生成：最前「全部」（配置可关），顺序与配置一致。
    const tabs = document.createElement('div');
    tabs.className = 'preset-tabs';
    const tabDefs = [];
    if (showAll) tabDefs.push({ id: ALL, name: '全部' });
    categories.forEach(function (category) { tabDefs.push({ id: category.id, name: category.name }); });
    tabDefs.forEach(function (def) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'preset-tab' + (filter === def.id ? ' active' : '');
      tab.textContent = def.name;
      tab.addEventListener('click', function () {
        filter = def.id;
        tabs.querySelectorAll('.preset-tab').forEach(function (item) { item.classList.remove('active'); });
        tab.classList.add('active');
        renderTiles();
      });
      // 悬停标签预热该分类：停留 300ms 才触发，快速划过不注入；按下立即预热。
      tab.addEventListener('pointerenter', function () { prefetchSoon(def.id); });
      tab.addEventListener('pointerleave', function () { cancelPrefetchSoon(def.id); });
      tab.addEventListener('pointerdown', function () { prefetch(def.id); });
      tabs.appendChild(tab);
    });
    body.appendChild(tabs);

    const status = document.createElement('div');
    status.className = 'preset-grid-status';
    status.hidden = true;
    body.appendChild(status);

    const grid = document.createElement('div');
    grid.className = 'preset-grid';
    body.appendChild(grid);

    function setStatus(text, isError) {
      if (!text) {
        status.hidden = true;
        status.textContent = '';
        return;
      }
      status.hidden = false;
      status.className = 'preset-grid-status' + (isError ? ' preset-grid-status-error' : '');
      status.textContent = text;
    }

    // 预取分类块：已加载无操作，同一分类并发由 loader 复用 Promise。
    // 预取失败只在当前分类上给状态提示，不 toast，避免重复打扰。
    const prefetchTimers = Object.create(null);
    const PREFETCH_DELAY = 300;

    function prefetchSoon(catId) {
      if (!catId || catId === ALL || chunkReady(catId)) return;
      cancelPrefetchSoon(catId);
      prefetchTimers[catId] = setTimeout(function () {
        delete prefetchTimers[catId];
        prefetch(catId);
      }, PREFETCH_DELAY);
    }

    function cancelPrefetchSoon(catId) {
      if (!catId || !prefetchTimers[catId]) return;
      clearTimeout(prefetchTimers[catId]);
      delete prefetchTimers[catId];
    }

    function prefetch(catId) {
      if (!catId || catId === ALL) return;
      if (chunkReady(catId)) {
        if (filter === catId) setStatus('');
        return;
      }
      if (filter === catId) setStatus('正在加载“' + categoryName(catId) + '”素材…', false);
      L.presets.loadChunk(catId).then(function () {
        if (filter === catId) setStatus('');
      }).catch(function () {
        if (filter === catId) setStatus('“' + categoryName(catId) + '”素材加载失败，点击瓦片重试。', true);
      });
    }

    // 点击瓦片：先进入加载态（防重复触发），hydrate 成功后关闭弹窗并走唯一应用入口。
    function chooseTile(item, tile) {
      if (tile.dataset.loading === '1') return;
      tile.dataset.loading = '1';
      tile.disabled = true;
      tile.classList.remove('preset-tile-error');
      tile.classList.add('preset-tile-loading');
      L.presets.hydrate(item).then(function () {
        handle.close(true);
        L.app.applyPreset(item, mode, ctx);
      }).catch(function (err) {
        tile.disabled = false;
        delete tile.dataset.loading;
        tile.classList.remove('preset-tile-loading');
        tile.classList.add('preset-tile-error');
        ui.toast('预置素材加载失败：' + (err && err.message ? err.message : '未知错误') + '，请重试。', 'error');
      });
    }

    function renderTiles() {
      grid.innerHTML = '';
      const visible = filter === ALL ? items : items.filter(function (item) { return item.category === filter; });
      visible.forEach(function (item) {
        const tile = document.createElement('button');
        tile.type = 'button';
        tile.className = 'preset-tile' + (item.kind === 'overlay' ? ' preset-tile-transparent' : '');
        tile.title = item.license ? item.name + '（' + item.license + '）' : item.name;
        const thumb = document.createElement('span');
        thumb.className = 'preset-thumb';
        // 缩略图直接来自索引；分类块未加载时也先显示缩略图，不出现空白。
        if (item.thumb) {
          const thumbImg = document.createElement('span');
          thumbImg.className = 'preset-thumb-img';
          thumbImg.style.backgroundImage = "url('" + item.thumb + "')";
          thumb.appendChild(thumbImg);
        }
        const name = document.createElement('span');
        name.className = 'preset-name';
        name.textContent = item.name;
        tile.appendChild(thumb);
        tile.appendChild(name);
        // 悬停瓦片预热所属分类（「全部」下的混合瓦片各按所属分类加载）。
        tile.addEventListener('pointerenter', function () { prefetchSoon(item.category); });
        tile.addEventListener('pointerleave', function () { cancelPrefetchSoon(item.category); });
        tile.addEventListener('pointerdown', function () { prefetch(item.category); });
        tile.addEventListener('click', function () { chooseTile(item, tile); });
        grid.appendChild(tile);
      });
      if (filter === ALL) setStatus('');
      else prefetch(filter);
    }
    renderTiles();

    body.appendChild(createLocalRow(mode, ctx, handle));
    body.appendChild(createLinks());
    body.appendChild(createHint('预置素材免费可离线使用；透明图默认以原大小作为叠加装饰。不够用时可在上面两个生成器里做一张，导出 PNG 后直接拖进本弹窗。'));
  }

  ui.openBackgroundLibrary = openBackgroundLibrary;
  ui.openPresetPicker = openPresetPicker;
})();
