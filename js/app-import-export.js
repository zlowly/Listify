(function () {
  'use strict';

  const L = window.Listify = window.Listify || {};
  const model = L.model;
  const layout = L.layout;
  const renderer = L.render;
  const ui = L.ui;
  const clamp = model.clamp;
  const escapeHtml = ui.esc;

  L.appImportExport = {
    create: function (appCtx) {
      const state = appCtx.state;
      const viewport = appCtx.viewport;
      const surface = appCtx.surface;
      const actions = appCtx.actions;

      function showImportErrors(result) {
        const items = (result.errors || ['导入失败。']).map(function (message) {
          return '<li>' + escapeHtml(message) + '</li>';
        }).join('');
        ui.modal.open({
          title: '导入失败',
          body: '<div class="prop-group"><p class="hint">本次导入未修改现有歌单。请修正文件后重试。</p>' +
            '<ul class="import-error-list">' + items + '</ul></div>',
          actions: [{ label: '知道了', className: 'btn-primary', onClick: function (close) { close(); } }]
        });
      }
    
      function openEncodingDialog(file, message) {
        const body =
          '<div class="prop-group">' +
            '<p class="hint">' + escapeHtml(message) + '</p>' +
            '<div class="field"><label for="encoding-select">尝试编码</label><div class="control">' +
              '<select id="encoding-select" class="select">' +
                '<option value="utf-8">UTF-8</option>' +
                '<option value="gb18030">GB18030</option>' +
                '<option value="utf-16le">UTF-16LE</option>' +
                '<option value="utf-16be">UTF-16BE</option>' +
              '</select>' +
            '</div></div>' +
          '</div>';
        const modal = ui.modal.open({
          title: '选择文件编码',
          body: body,
          width: '420px',
          actions: [
            { label: '取消', onClick: function (close) { close(); } },
            {
              label: '重试导入',
              className: 'btn-primary',
              onClick: function (close) {
                const select = modal.body.querySelector('#encoding-select');
                const encoding = select ? select.value : 'utf-8';
                close();
                handleImportFile(file, encoding);
              }
            }
          ]
        });
      }
    
      function confirmReimport(result) {
        const rec = L.importer.reconcile(state.project, result.categories);
        if (!state.project.playlist.categories.length) return Promise.resolve(true);
    
        const oldSongs = {};
        state.project.playlist.categories.forEach(function (category) { oldSongs[category.name] = category.songs; });
        const newSongs = {};
        result.categories.forEach(function (category) { newSongs[category.name] = category.songs; });
        const songUpdates = (rec.kept || []).map(function (name) {
          return { name: name, count: actions.countSongChanges(oldSongs[name] || [], newSongs[name] || []) };
        }).filter(function (item) { return item.count > 0; });
    
        if (!rec.added.length && !rec.removed.length && !songUpdates.length) return Promise.resolve(true);
    
        return new Promise(function (resolve) {
          let settled = false;
          function finish(value) {
            if (settled) return;
            settled = true;
            resolve(value);
          }
          const lines = [];
          if (rec.added.length) {
            lines.push('<p><strong>新增分类（未放置）：</strong>' + escapeHtml(rec.added.join('、')) + '</p>');
          }
          if (rec.removed.length) {
            lines.push('<p><strong>将删除分类块：</strong>' + escapeHtml(rec.removed.join('、')) + '</p>');
          }
          if (songUpdates.length) {
            lines.push('<p><strong>将更新歌名：</strong>' +
              escapeHtml(songUpdates.map(function (item) { return item.name + '（' + item.count + ' 处）'; }).join('、')) + '</p>');
          }
          lines.push('<p class="hint">同名分类会保留位置、尺寸、样式、表格结构和手动列宽，只更新歌名并重新排序。</p>');
          const modal = ui.modal.open({
            title: '重新导入确认',
            body: '<div class="prop-group">' + lines.join('') + '</div>',
            width: '460px',
            actions: [
              { label: '取消', onClick: function (close) { finish(false); close(); } },
              {
                label: '继续导入',
                className: 'btn-primary',
                onClick: function (close) {
                  finish(true);
                  close();
                }
              }
            ],
            onClose: function () { finish(false); }
          });
        });
      }
    
      async function handleImportFile(file, overrideEncoding) {
        if (!file) return;
        const result = await L.importer.importFile(file, overrideEncoding);
        if (!result.ok) {
          const encodingIssue = (result.errors || []).some(function (message) {
            return /编码|解码/.test(message);
          });
          if (encodingIssue) openEncodingDialog(file, (result.errors || ['无法识别文件编码。'])[0]);
          else showImportErrors(result);
          return;
        }
    
        const ok = await confirmReimport(result);
        if (!ok) return;
    
        actions.pushUndo('导入歌单');
        L.importer.applyImport(state.project, result.categories);
        if (state.selection.type === 'element') {
          const found = actions.findElementAnywhere(state.selection.id);
          if (!found) state.selection = { type: 'page' };
        }
        ui.renderAll();
        ui.toast('已导入 ' + result.stats.categories + ' 个分类、' + result.stats.songs + ' 首歌名（' + result.encoding + '）。', 'success');
      }
    
      function openImport() {
        const input = document.getElementById('import-file');
        input.value = '';
        input.click();
      }
    
      function exportPlaylist() {
        const result = L.playlistExport.exportPlaylist(state.project);
        if (result.empty) {
          ui.modal.confirm('没有歌单', '目前没有歌单，是否要导出歌单模板？', { confirmLabel: '导出模板' }).then(function (ok) {
            if (!ok) return;
            L.playlistExport.downloadTemplate();
            ui.toast('歌单模板已导出。', 'success');
          });
          return;
        }
        ui.toast('歌单已导出。', 'success');
      }
    
      async function exportProject() {
        try {
          await L.io.downloadProject(state.project);
          ui.toast('项目已导出。', 'success');
        } catch (err) {
          ui.modal.alert('导出失败', err.message);
        }
      }
    
      function openImportProject() {
        const input = document.getElementById('load-file');
        input.value = '';
        input.click();
      }
    
      function discardBuiltAssets(store) {
        if (!store || !store.urls) return;
        store.urls.forEach(function (url) {
          URL.revokeObjectURL(url);
        });
      }
    
      async function handleImportProject(file) {
        if (!file) return;
        const result = await L.io.loadProjectFile(file);
        if (!result.ok) {
          ui.modal.alert('导入失败', result.error || '项目文件无法加载。');
          return;
        }
        const ok = await ui.modal.confirm(
          '导入项目',
          '导入会替换当前草稿，且不可撤销。确定继续吗？',
          { confirmLabel: '替换草稿' }
        );
        if (!ok) {
          discardBuiltAssets(result.assets);
          return;
        }
    
        appCtx.draft.restoring = true;
        try {
          try {
            await L.io.persistAssetStore(result.assets);
          } catch (err) {
            appCtx.draft.reportDraftError(err);
          }
          L.io.installAssets(result.assets);
          state.project = result.project;
          state.currentPageId = state.project.pages[0].id;
          state.selection = { type: 'page' };
          appCtx.undo.stack.length = 0;
          ui.renderAll();
        } finally {
          appCtx.draft.restoring = false;
        }
        await appCtx.draft.saveDraftNow({ force: true });
        ui.toast('项目已导入。', 'success');
      }
    
      async function newProject() {
        const ok = await ui.modal.confirm(
          '新建项目',
          '新建会清空当前草稿和所有图片，且不可撤销。确定新建吗？',
          { confirmLabel: '新建项目', danger: true }
        );
        if (!ok) return;
    
        appCtx.draft.restoring = true;
        try {
          try {
            await L.io.clearDraft();
          } catch (err) {
            appCtx.draft.reportDraftError(err);
          }
          L.assets.clear();
          state.project = model.createDefaultProject();
          state.currentPageId = state.project.pages[0].id;
          state.selection = { type: 'page' };
          appCtx.undo.stack.length = 0;
          ui.renderAll();
        } finally {
          appCtx.draft.restoring = false;
        }
        appCtx.draft.setDraftStatus('idle');
        ui.toast('已新建空白项目。', 'success');
      }

      return {
        showImportErrors, openEncodingDialog, confirmReimport, handleImportFile, openImport, exportPlaylist, exportProject, openImportProject, discardBuiltAssets, handleImportProject, newProject
      };
    }
  };
})();
