(function () {
  'use strict';

  const L = window.Listify = window.Listify || {};
  const model = L.model;
  const layout = L.layout;
  const renderer = L.render;
  const ui = L.ui;
  const clamp = model.clamp;
  const escapeHtml = ui.esc;

  L.appBackgrounds = {
    create: function (appCtx) {
      const state = appCtx.state;
      const viewport = appCtx.viewport;
      const surface = appCtx.surface;
      const actions = appCtx.actions;

      let pendingBackgroundSetId = null;
      let pendingBackgroundImageId = null;
      let pendingBackgroundWhole = false;

      function addBackgroundSet() {
        const set = model.createBackgroundSet('背景 ' + (state.project.backgrounds.length + 1));
        state.project.backgrounds.push(set);
        state.selection = { type: 'backgroundSet', setId: set.id };
        ui.renderAll();
        return set;
      }
    
      function duplicateBackgroundSet(setId) {
        const source = model.findBackground(state.project, setId);
        if (!source) return null;
        const copy = model.cloneBackgroundSet(source);
        copy.name = source.name + ' 副本';
        state.project.backgrounds.push(copy);
        state.selection = { type: 'backgroundSet', setId: copy.id };
        ui.renderAll();
        return copy;
      }
    
      function renameBackgroundSet(setId, name) {
        const set = model.findBackground(state.project, setId);
        if (!set) return;
        const trimmed = String(name == null ? '' : name).trim();
        if (!trimmed) return;
        set.name = trimmed;
        ui.renderAll();
      }
    
      function deleteBackgroundSet(setId) {
        const set = model.findBackground(state.project, setId);
        if (!set) return;
        const check = model.canDeleteBackground(state.project, setId);
        if (!check.ok) {
          ui.modal.alert('无法删除背景', check.reason);
          return;
        }
        const index = state.project.backgrounds.indexOf(set);
        state.project.backgrounds.splice(index, 1);
        (set.images || []).forEach(function (image) { actions.releaseUnusedAsset(image.assetId); });
        state.selection = { type: 'page' };
        ui.renderAll();
        ui.toast('已删除背景“' + set.name + '”。');
      }
    
      function setPageBackground(setId) {
        const page = actions.currentPage();
        if (!page) return;
        if (!model.findBackground(state.project, setId)) return;
        page.backgroundId = setId;
        state.selection = { type: 'page' };
        ui.renderAll();
      }
    
      function pickBackgroundImage(setId, imageId) {
        const set = model.findBackground(state.project, setId);
        if (!set) return;
        pendingBackgroundSetId = setId;
        pendingBackgroundImageId = imageId || null;
        const input = document.getElementById('bg-file');
        input.value = '';
        input.click();
      }
    
      async function handleBackgroundFile(file) {
        if (!file) return;
        const setId = pendingBackgroundSetId;
        const imageId = pendingBackgroundImageId;
        const whole = pendingBackgroundWhole;
        pendingBackgroundSetId = null;
        pendingBackgroundImageId = null;
        pendingBackgroundWhole = false;
        const set = model.findBackground(state.project, setId) ||
          model.effectiveBackground(state.project, actions.currentPage());
        if (!set) return;
        let assetId;
        try {
          assetId = await L.assets.addFile(file);
          const loaded = await L.assets.loadImage(assetId);
          const meta = L.assets.getMeta(assetId);
          model.ensureAssetMeta(state.project, assetId, file.name, meta ? meta.mime : file.type);
          await appCtx.draft.persistDraftAssetQuietly(assetId);
          const target = imageId
            ? (set.images || []).find(function (image) { return image.id === imageId; })
            : null;
          if (target) {
            const oldAssetId = target.assetId;
            target.assetId = assetId;
            if (target.fit === 'none') {
              const rect = renderer.backgroundImageRect(state.project.pageSize, target, loaded);
              target.width = target.width > 0 ? target.width : rect.width;
              target.height = target.height > 0 ? target.height : rect.height;
            }
            actions.releaseUnusedAsset(oldAssetId);
            state.selection = { type: 'backgroundImage', setId: set.id, imageId: target.id };
          } else {
            const image = model.createBackgroundImage(assetId, set.images.length ? 'original' : 'cover');
            set.images.push(image);
            state.selection = { type: 'backgroundImage', setId: set.id, imageId: image.id };
          }
          ui.renderAll();
          if (whole) {
            const page = actions.currentPage();
            if (page) page.backgroundId = set.id;
            state.selection = { type: 'page' };
            ui.toast('已创建背景“' + set.name + '”并应用到当前页。');
          } else {
            ui.toast('背景图片已更新。');
          }
        } catch (err) {
          if (assetId) L.assets.remove(assetId);
          ui.toast('背景图片读取失败：' + err.message, 'error');
        }
      }
    
      function pickBackgroundImageWhole() {
        const set = addBackgroundSet();
        pendingBackgroundSetId = set.id;
        pendingBackgroundImageId = null;
        pendingBackgroundWhole = true;
        const input = document.getElementById('bg-file');
        input.value = '';
        input.click();
      }
    
      async function handleDroppedBackgroundFile(mode, context, file) {
        if (!file) return;
        const ctx = context || {};
        if (mode === 'whole') {
          const set = addBackgroundSet();
          pendingBackgroundSetId = set.id;
          pendingBackgroundImageId = null;
          pendingBackgroundWhole = true;
        } else {
          pendingBackgroundSetId = ctx.setId || null;
          pendingBackgroundImageId = mode === 'replace' ? (ctx.imageId || null) : null;
        }
        await handleBackgroundFile(file);
      }
    
      function deleteBackgroundImage(setId, imageId) {
        const set = model.findBackground(state.project, setId);
        if (!set) return;
        const index = (set.images || []).findIndex(function (image) { return image.id === imageId; });
        if (index < 0) return;
        const image = set.images[index];
        set.images.splice(index, 1);
        actions.releaseUnusedAsset(image.assetId);
        state.selection = { type: 'backgroundSet', setId: setId };
        ui.renderAll();
      }
    
      function moveBackgroundImage(setId, imageId, delta) {
        const set = model.findBackground(state.project, setId);
        if (!set) return;
        const plan = model.planStepMove(set.images, imageId, delta);
        if (!plan) return;
        actions.pushUndo('调整背景图片顺序');
        model.moveItem(set.images, plan.from, plan.to);
        ui.renderAll();
      }

      function moveBackgroundImageTo(setId, imageId, targetId, placement) {
        const set = model.findBackground(state.project, setId);
        if (!set) return false;
        const plan = model.planDisplayMove(set.images, imageId, targetId, placement);
        if (!plan) return false;
        actions.pushUndo('调整背景图片顺序');
        model.moveItem(set.images, plan.from, plan.to);
        ui.renderAll();
        return true;
      }
    
      function setBackgroundImageFit(setId, imageId, fit) {
        const set = model.findBackground(state.project, setId);
        if (!set) return;
        const image = (set.images || []).find(function (item) { return item.id === imageId; });
        if (!image) return;
        if (fit === 'none') {
          actions.ensureCustomBackgroundImage(image);
        } else {
          image.fit = fit;
          image.rotation = 0;
        }
        ui.renderAll();
      }
    
      function restoreBackgroundImageFit(setId, imageId) {
        setBackgroundImageFit(setId, imageId, 'cover');
      }
    
      function setBackgroundImageValue(setId, imageId, key, value) {
        const set = model.findBackground(state.project, setId);
        if (!set) return;
        const image = (set.images || []).find(function (item) { return item.id === imageId; });
        if (!image) return;
        image[key] = value;
        const inputIds = {
          x: 'prop-bg-x',
          y: 'prop-bg-y',
          width: 'prop-bg-w',
          height: 'prop-bg-h',
          rotation: 'prop-bg-rotation'
        };
        const input = inputIds[key] ? document.getElementById(inputIds[key]) : null;
        if (input) input.value = image[key];
        if (layout.invalidate) layout.invalidate();
        appCtx.viewport.scheduleRedraw(['bg', 'overlay']);
      }
    
      function toggleUnifiedBackground(value) {
        const next = !!value;
        if (next) {
          let id = state.project.unifiedBackgroundId;
          if (!model.findBackground(state.project, id)) {
            const effective = model.effectiveBackground(state.project, actions.currentPage());
            id = effective ? effective.id : (state.project.backgrounds[0] || {}).id || null;
          }
          state.project.unifiedBackgroundId = id;
        }
        state.project.unifiedBackground = next;
        state.selection = { type: 'page' };
        ui.renderAll();
      }
    
      function setUnifiedBackground(setId) {
        if (!model.findBackground(state.project, setId)) return;
        state.project.unifiedBackgroundId = setId;
        state.project.unifiedBackground = true;
        ui.renderAll();
      }
    
      function bakeUnifiedBackground() {
        const id = state.project.unifiedBackgroundId;
        if (!id) return;
        state.project.pages.forEach(function (page) { page.backgroundId = id; });
        state.project.unifiedBackground = false;
        state.selection = { type: 'page' };
        ui.renderAll();
        ui.toast('已将全局背景固化到所有页。');
      }
    
      function copyUnifiedBackgroundToPage() {
        const id = state.project.unifiedBackgroundId;
        const globalSet = model.findBackground(state.project, id);
        const page = actions.currentPage();
        if (!globalSet || !page) return;
        const copy = model.cloneBackgroundSet(globalSet);
        copy.name = globalSet.name + ' 副本';
        state.project.backgrounds.push(copy);
        state.project.pages.forEach(function (item) {
          item.backgroundId = item.id === page.id ? copy.id : id;
        });
        state.project.unifiedBackground = false;
        state.selection = { type: 'backgroundSet', setId: copy.id };
        ui.renderAll();
        ui.toast('已为当前页创建独立背景副本。');
      }

      return {
        addBackgroundSet, duplicateBackgroundSet, renameBackgroundSet, deleteBackgroundSet, setPageBackground, pickBackgroundImage, handleBackgroundFile, pickBackgroundImageWhole, handleDroppedBackgroundFile, deleteBackgroundImage, moveBackgroundImage, moveBackgroundImageTo, setBackgroundImageFit, restoreBackgroundImageFit, setBackgroundImageValue, toggleUnifiedBackground, setUnifiedBackground, bakeUnifiedBackground, copyUnifiedBackgroundToPage
      };
    }
  };
})();
