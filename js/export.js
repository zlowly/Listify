(function () {
  'use strict';

  const L = window.Listify = window.Listify || {};

  const MODE_FULL = 'full';
  const MODE_PLAYLIST = 'playlist';
  const RANGE_CURRENT = 'current';
  const RANGE_ALL = 'all';

  function waitForFonts() {
    if (document.fonts && document.fonts.ready) return document.fonts.ready;
    return Promise.resolve();
  }

  function loadImages(ids) {
    return Promise.all(ids.map(function (id) {
      return L.assets.loadImage(id);
    }));
  }

  function waitForAssets(project, page, mode) {
    if (mode === MODE_PLAYLIST) return waitForFonts();
    return loadImages(L.render.pageAssets(project, page)).then(waitForFonts);
  }

  async function preloadPages(project, pages, mode) {
    if (mode === MODE_PLAYLIST) {
      await waitForFonts();
      return;
    }
    const assetPages = new Map();
    pages.forEach(function (page, index) {
      L.render.pageAssets(project, page).forEach(function (id) {
        if (!assetPages.has(id)) assetPages.set(id, index + 1);
      });
    });
    await Promise.all(Array.from(assetPages.keys()).map(async function (id) {
      try {
        await L.assets.loadImage(id);
      } catch (err) {
        err.pageNumber = assetPages.get(id);
        throw err;
      }
    }));
    await waitForFonts();
  }

  function canvasToBlob(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error('画布导出失败'));
      }, 'image/png');
    });
  }

  async function renderPageBlob(project, page, width, height, mode) {
    const outWidth = Math.max(1, Math.round(Number(width)));
    const outHeight = Math.max(1, Math.round(Number(height)));
    const canvas = document.createElement('canvas');
    canvas.width = outWidth;
    canvas.height = outHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建导出画布');
    ctx.save();
    ctx.scale(outWidth / project.pageSize.width, outHeight / project.pageSize.height);
    L.render.drawPage(ctx, project, page, {
      editMode: false,
      includeBackground: mode !== MODE_PLAYLIST,
      includeElementTypes: mode === MODE_PLAYLIST ? ['category'] : null
    });
    ctx.restore();
    const blob = await canvasToBlob(canvas);
    return { blob: blob, width: outWidth, height: outHeight };
  }

  function pageLabel(pageNumber, mode, pad) {
    const number = pad ? String(pageNumber).padStart(pad, '0') : String(pageNumber);
    return '歌单_第' + number + '页' + (mode === MODE_PLAYLIST ? '_透明' : '') + '.png';
  }

  function zipLabel(total, mode) {
    return '歌单_' + total + '页' + (mode === MODE_PLAYLIST ? '_透明' : '') + '.zip';
  }

  function hasCategory(page) {
    return page.elements.some(function (element) {
      return element.type === 'category';
    });
  }

  function nextFrame() {
    return new Promise(function (resolve) {
      let settled = false;
      function finish() {
        if (settled) return;
        settled = true;
        resolve();
      }
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(finish);
      setTimeout(finish, 50);
    });
  }

  async function exportPage(project, page, pageNumber, width, height, mode, options) {
    const opts = options || {};
    await waitForAssets(project, page, mode);
    if (opts.isCancelled && opts.isCancelled()) return null;
    const result = await renderPageBlob(project, page, width, height, mode);
    if (opts.isCancelled && opts.isCancelled()) return null;
    L.model.downloadBlob(result.blob, pageLabel(pageNumber, mode));
    return result;
  }

  async function exportAllPages(project, pages, width, height, mode, options) {
    const opts = options || {};
    const total = pages.length;
    const pad = Math.max(2, String(total).length);
    const entries = [];
    const skipped = [];

    await preloadPages(project, pages, mode);

    for (let i = 0; i < total; i += 1) {
      if (opts.isCancelled && opts.isCancelled()) {
        return { cancelled: true, total: total, exported: 0, skipped: skipped };
      }
      const page = pages[i];
      const pageNumber = i + 1;
      if (mode === MODE_PLAYLIST && !hasCategory(page)) {
        skipped.push(pageNumber);
        if (opts.onProgress) opts.onProgress(i + 1, total);
        await nextFrame();
        continue;
      }
      let result;
      try {
        result = await renderPageBlob(project, page, width, height, mode);
      } catch (err) {
        err.pageNumber = pageNumber;
        throw err;
      }
      entries.push({ name: pageLabel(pageNumber, mode, pad), blob: result.blob });
      if (opts.onProgress) opts.onProgress(i + 1, total);
      await nextFrame();
    }

    if (opts.isCancelled && opts.isCancelled()) {
      return { cancelled: true, total: total, exported: 0, skipped: skipped };
    }
    if (entries.length === 0) {
      const err = new Error('没有可导出的分类块');
      err.code = 'EMPTY';
      throw err;
    }

    if (opts.onPack) opts.onPack();
    const zip = await L.zip.build(entries);
    if (opts.isCancelled && opts.isCancelled()) {
      return { cancelled: true, total: total, exported: 0, skipped: skipped };
    }
    L.model.downloadBlob(zip, zipLabel(total, mode));
    return { cancelled: false, total: total, exported: entries.length, skipped: skipped };
  }

  function openDialog() {
    const app = L.app;
    const project = app.state.project;
    const page = app.currentPage();
    if (!page) return;
    const pageIndex = project.pages.indexOf(page);
    const totalPages = project.pages.length;
    const defaultWidth = project.pageSize.width;
    const defaultHeight = project.pageSize.height;
    const ratio = defaultWidth / defaultHeight;

    const body = document.createElement('div');
    body.className = 'modal-form';
    body.innerHTML =
      '<p class="hint">页面外的内容会被裁剪，编辑辅助不会出现。</p>' +
      '<div class="field"><label>导出范围</label><div class="control export-options">' +
        '<label class="check-row"><input type="radio" name="export-range" value="current" checked> 本页</label>' +
        '<label class="check-row"><input type="radio" name="export-range" value="all"> 所有页（ZIP）</label>' +
      '</div></div>' +
      '<div class="field"><label>导出内容</label><div class="control export-options">' +
        '<label class="check-row"><input type="radio" name="export-content" value="full" checked> 完整页面</label>' +
        '<label class="check-row"><input type="radio" name="export-content" value="playlist"> 仅歌单层（透明底）</label>' +
      '</div></div>' +
      '<div class="field"><label>宽度</label><div class="control"><input id="export-width" class="input" type="number" min="1" step="1" value="' + defaultWidth + '"><span class="unit">px</span></div></div>' +
      '<div class="field"><label>高度</label><div class="control"><input id="export-height" class="input" type="number" min="1" step="1" value="' + defaultHeight + '"><span class="unit">px</span></div></div>' +
      '<div class="field"><label>锁定比例</label><div class="control"><label class="check-row"><input id="export-lock" type="checkbox" checked> 保持页面宽高比</label></div></div>' +
      '<p class="hint" id="export-size-hint"></p>';

    const widthInput = body.querySelector('#export-width');
    const heightInput = body.querySelector('#export-height');
    const lockInput = body.querySelector('#export-lock');
    const hint = body.querySelector('#export-size-hint');
    const rangeInputs = body.querySelectorAll('input[name="export-range"]');
    const contentInputs = body.querySelectorAll('input[name="export-content"]');

    let modal;
    let exportButton = null;
    let busy = false;
    let cancelled = false;
    let finished = false;

    function selected(name) {
      const input = body.querySelector('input[name="' + name + '"]:checked');
      return input ? input.value : null;
    }

    function selectedRange() {
      return selected('export-range') || RANGE_CURRENT;
    }

    function selectedMode() {
      return selected('export-content') || MODE_FULL;
    }

    function isEmptySelection() {
      if (selectedMode() !== MODE_PLAYLIST) return false;
      if (selectedRange() === RANGE_CURRENT) return !hasCategory(page);
      return !project.pages.some(hasCategory);
    }

    function outputLabel() {
      const mode = selectedMode();
      if (selectedRange() === RANGE_ALL && totalPages > 1) {
        return zipLabel(totalPages, mode);
      }
      return pageLabel(pageIndex + 1, mode);
    }

    function updateHint() {
      const width = widthInput.value || '?';
      const height = heightInput.value || '?';
      const empty = isEmptySelection();
      let text = '输出 ' + outputLabel() + '（' + width + ' × ' + height + ' px）';
      if (selectedRange() === RANGE_ALL && totalPages === 1 && !empty) {
        text = '输出 ' + outputLabel() + '（当前只有 1 页，将导出 PNG）';
      }
      if (empty) {
        text += selectedRange() === RANGE_CURRENT
          ? '；当前页没有分类块，无法导出'
          : '；没有可导出的分类块';
      }
      hint.textContent = text;
      if (exportButton) exportButton.disabled = busy || empty;
    }

    function setBusy(value) {
      busy = value;
      body.querySelectorAll('input').forEach(function (input) {
        input.disabled = value;
      });
      if (exportButton) exportButton.disabled = value || isEmptySelection();
    }

    function updateProgress(done, total) {
      if (exportButton) exportButton.textContent = '导出中 ' + done + '/' + total + '…';
      hint.textContent = '正在导出 ' + done + '/' + total + ' 页…';
    }

    function applyRatioFromWidth() {
      if (lockInput.checked && Number(widthInput.value) > 0) {
        heightInput.value = Math.max(1, Math.round(Number(widthInput.value) / ratio));
      }
    }

    function applyRatioFromHeight() {
      if (lockInput.checked && Number(heightInput.value) > 0) {
        widthInput.value = Math.max(1, Math.round(Number(heightInput.value) * ratio));
      }
    }

    widthInput.addEventListener('input', function () {
      applyRatioFromWidth();
      updateHint();
    });
    heightInput.addEventListener('input', function () {
      applyRatioFromHeight();
      updateHint();
    });
    lockInput.addEventListener('change', updateHint);
    rangeInputs.forEach(function (input) {
      input.addEventListener('change', updateHint);
    });
    contentInputs.forEach(function (input) {
      input.addEventListener('change', updateHint);
    });

    modal = L.ui.modal.open({
      title: '导出 PNG',
      body: body,
      onClose: function () {
        if (!finished) cancelled = true;
      },
      actions: [
        {
          label: '取消',
          onClick: function (close) {
            close();
          }
        },
        {
          label: '导出',
          className: 'btn-primary',
          onClick: async function (close, button) {
            const width = Number(widthInput.value);
            const height = Number(heightInput.value);
            if (!(width > 0) || !(height > 0)) {
              L.ui.toast('请输入有效的宽度和高度', 'error');
              return;
            }
            if (isEmptySelection()) {
              L.ui.toast('没有可导出的分类块', 'error');
              return;
            }
            const range = selectedRange();
            const mode = selectedMode();
            const pages = range === RANGE_ALL ? project.pages.slice() : [page];
            setBusy(true);
            button.textContent = '导出中…';
            try {
              if (pages.length === 1) {
                const pageNumber = project.pages.indexOf(pages[0]) + 1;
                const result = await exportPage(project, pages[0], pageNumber, width, height, mode, {
                  isCancelled: function () { return cancelled; }
                });
                if (cancelled || !result) {
                  close();
                  return;
                }
                finished = true;
                close();
                L.ui.toast('已导出 ' + pageLabel(pageNumber, mode), 'success');
                return;
              }

              const result = await exportAllPages(project, pages, width, height, mode, {
                isCancelled: function () { return cancelled; },
                onProgress: updateProgress,
                onPack: function () {
                  if (exportButton) exportButton.textContent = '正在打包…';
                  hint.textContent = '正在打包 ZIP…';
                }
              });
              if (result.cancelled || cancelled) {
                close();
                return;
              }
              finished = true;
              close();
              let message = '已导出 ' + zipLabel(pages.length, mode) + '（' + result.exported + ' 页）';
              if (result.skipped.length) {
                message += '，第 ' + result.skipped.join('、') + ' 页无分类块已跳过';
              }
              L.ui.toast(message, 'success');
            } catch (err) {
              if (cancelled) return;
              close();
              let message = err.message || String(err);
              if (err.pageNumber) message = '第 ' + err.pageNumber + ' 页导出失败：' + message;
              L.ui.modal.alert('导出失败', message);
            }
          }
        }
      ]
    });

    exportButton = modal.footer.querySelector('.btn-primary');
    updateHint();
  }

  L.exporter = {
    exportPage: exportPage,
    exportAllPages: exportAllPages,
    renderPageBlob: renderPageBlob,
    pageLabel: pageLabel,
    zipLabel: zipLabel,
    hasCategory: hasCategory,
    openDialog: openDialog
  };
})();
