(function () {
  'use strict';

  const L = window.Listify = window.Listify || {};

  function waitForAssets(project, page) {
    const ids = L.render.pageAssets(page);
    return Promise.all(ids.map(function (id) {
      return L.assets.loadImage(id);
    })).then(function () {
      if (document.fonts && document.fonts.ready) {
        return document.fonts.ready;
      }
      return null;
    });
  }

  function canvasToBlob(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error('画布导出失败'));
      }, 'image/png');
    });
  }

  async function exportPage(project, page, pageNumber, width, height) {
    const outWidth = Math.max(1, Math.round(Number(width)));
    const outHeight = Math.max(1, Math.round(Number(height)));
    await waitForAssets(project, page);
    const canvas = document.createElement('canvas');
    canvas.width = outWidth;
    canvas.height = outHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建导出画布');
    ctx.save();
    ctx.scale(outWidth / project.pageSize.width, outHeight / project.pageSize.height);
    L.render.drawPage(ctx, project, page, { editMode: false });
    ctx.restore();
    const blob = await canvasToBlob(canvas);
    L.model.downloadBlob(blob, '歌单_第' + pageNumber + '页.png');
    return { width: outWidth, height: outHeight };
  }

  function openDialog() {
    const app = L.app;
    const project = app.state.project;
    const page = app.currentPage();
    if (!page) return;
    const pageIndex = app.state.project.pages.indexOf(page);
    const defaultWidth = project.pageSize.width;
    const defaultHeight = project.pageSize.height;
    const ratio = defaultWidth / defaultHeight;

    const body = document.createElement('div');
    body.className = 'modal-form';
    body.innerHTML =
      '<p class="hint">只导出当前第 ' + (pageIndex + 1) + ' 页。页面外的内容会被裁剪，编辑辅助不会出现。</p>' +
      '<div class="field"><label>宽度</label><div class="control"><input id="export-width" class="input" type="number" min="1" step="1" value="' + defaultWidth + '"><span class="unit">px</span></div></div>' +
      '<div class="field"><label>高度</label><div class="control"><input id="export-height" class="input" type="number" min="1" step="1" value="' + defaultHeight + '"><span class="unit">px</span></div></div>' +
      '<div class="field"><label>锁定比例</label><div class="control"><label class="check-row"><input id="export-lock" type="checkbox" checked> 保持页面宽高比</label></div></div>' +
      '<p class="hint" id="export-size-hint">输出 ' + defaultWidth + ' × ' + defaultHeight + ' px</p>';

    let modal;
    const widthInput = body.querySelector('#export-width');
    const heightInput = body.querySelector('#export-height');
    const lockInput = body.querySelector('#export-lock');
    const hint = body.querySelector('#export-size-hint');

    function updateHint() {
      hint.textContent = '输出 ' + (widthInput.value || '?') + ' × ' + (heightInput.value || '?') + ' px';
    }

    widthInput.addEventListener('input', function () {
      if (lockInput.checked && Number(widthInput.value) > 0) {
        heightInput.value = Math.max(1, Math.round(Number(widthInput.value) / ratio));
      }
      updateHint();
    });
    heightInput.addEventListener('input', function () {
      if (lockInput.checked && Number(heightInput.value) > 0) {
        widthInput.value = Math.max(1, Math.round(Number(heightInput.value) * ratio));
      }
      updateHint();
    });
    lockInput.addEventListener('change', updateHint);

    modal = L.ui.modal.open({
      title: '导出 PNG',
      body: body,
      actions: [
        {
          label: '取消',
          onClick: function (close) { close(); }
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
            button.disabled = true;
            button.textContent = '导出中…';
            try {
              await exportPage(project, page, pageIndex + 1, width, height);
              close();
              L.ui.toast('已导出 歌单_第' + (pageIndex + 1) + '页.png', 'success');
            } catch (err) {
              button.disabled = false;
              button.textContent = '导出';
              L.ui.modal.alert('导出失败', err.message || String(err));
            }
          }
        }
      ]
    });
  }

  L.exporter = {
    exportPage: exportPage,
    openDialog: openDialog
  };
})();
