(function () {
  'use strict';

  const L = window.Listify = window.Listify || {};
  const model = L.model;
  const layout = L.layout;
  const renderer = L.render;
  const ui = L.ui;

  L.appBackgrounds = {
    create: function (appCtx) {
      const state = appCtx.state;
      const actions = appCtx.actions;

      let pendingBackgroundImageId = null;
      let pendingBackgroundWhole = false;

      function currentEditablePage() {
        const page = actions.currentPage();
        if (!page) return null;
        if (!model.canEditPageBackground(state.project, page)) {
          ui.toast('全局背景生效中，请先取消全局背景。');
          return null;
        }
        return page;
      }

      function items(page) {
        const background = page && page.background;
        return background && (background.items || background.images) || [];
      }

      function imageItems(page) {
        return items(page).filter(function (item) {
          return item && item.kind === 'image';
        });
      }

      function releaseBackgroundAssets(previous, current) {
        const keep = new Set((current && (current.items || current.images) || []).map(function (item) {
          return item.kind === 'shape' ? null : item.assetId;
        }).filter(Boolean));
        (previous && (previous.items || previous.images) || []).forEach(function (item) {
          if (item && item.kind === 'image' && item.assetId && !keep.has(item.assetId)) {
            actions.releaseUnusedAsset(item.assetId);
          }
        });
      }

      function setGlobalBackgroundPage() {
        const page = actions.currentPage();
        if (!page) return;
        if (state.project.globalBackgroundPageId === page.id) return;
        actions.pushUndo('设为全局背景');
        model.setGlobalBackgroundPage(state.project, page);
        state.selection = { type: 'page' };
        ui.renderAll();
        ui.toast('已让所有页显示第 ' + (state.project.pages.indexOf(page) + 1) + ' 页的背景 · 撤销');
      }

      function clearGlobalBackground() {
        if (!state.project.globalBackgroundPageId) return;
        actions.pushUndo('取消全局背景');
        model.clearGlobalBackground(state.project);
        state.selection = { type: 'page' };
        ui.renderAll();
        ui.toast('已取消全局背景，各页恢复自己的背景 · 撤销');
      }

      function copyBackgroundFromPage(sourcePageId) {
        const target = currentEditablePage();
        if (!target) return false;
        const source = model.getPage(state.project, sourcePageId);
        if (!source || source.id === target.id) return false;
        const previous = target.background;
        const wasGlobal = state.project.globalBackgroundPageId === target.id;
        actions.pushUndo('复制背景');
        target.background = model.clonePageBackground(source.background);
        releaseBackgroundAssets(previous, target.background);
        state.selection = { type: 'background' };
        ui.renderAll();
        if (wasGlobal) {
          ui.toast('已复制第 ' + (state.project.pages.indexOf(source) + 1) + ' 页的背景；本页是全局来源，所有页一起改变 · 撤销');
        } else {
          ui.toast('已复制第 ' + (state.project.pages.indexOf(source) + 1) + ' 页的背景 · 撤销');
        }
        return true;
      }

      function clearPageBackground() {
        const page = currentEditablePage();
        if (!page) return;
        const previous = page.background;
        actions.pushUndo('清空背景');
        page.background = model.createPageBackground();
        releaseBackgroundAssets(previous, page.background);
        state.selection = { type: 'page' };
        ui.renderAll();
        ui.toast('已清空本页背景 · 撤销');
      }

      // 整套替换：填充色与图片列表一起换掉，旧图片资产按引用释放。
      function replacePageBackground(background) {
        const page = currentEditablePage();
        if (!page) return false;
        const previous = page.background;
        actions.pushUndo('更换背景');
        page.background = model.clonePageBackground(background);
        releaseBackgroundAssets(previous, page.background);
        const firstImage = items(page).find(function (item) { return item.kind === 'image'; });
        state.selection = firstImage
          ? { type: 'backgroundItem', itemId: firstImage.id }
          : { type: 'background' };
        ui.renderAll();
        return true;
      }

      function pickBackgroundImage(imageId) {
        const page = currentEditablePage();
        if (!page) return;
        if (imageId && !imageItems(page).some(function (image) { return image.id === imageId; })) return;
        pendingBackgroundImageId = imageId || null;
        pendingBackgroundWhole = false;
        const input = document.getElementById('bg-file');
        input.value = '';
        input.click();
      }

      function pickBackgroundImageWhole() {
        const page = currentEditablePage();
        if (!page) return;
        pendingBackgroundImageId = null;
        pendingBackgroundWhole = true;
        const input = document.getElementById('bg-file');
        input.value = '';
        input.click();
      }

      async function handleBackgroundFile(file) {
        if (!file) return;
        const page = currentEditablePage();
        const imageId = pendingBackgroundImageId;
        const whole = pendingBackgroundWhole;
        pendingBackgroundImageId = null;
        pendingBackgroundWhole = false;
        if (!page) return;
        let assetId;
        try {
          assetId = await L.assets.addFile(file);
          const loaded = await L.assets.loadImage(assetId);
          const meta = L.assets.getMeta(assetId);
          model.ensureAssetMeta(state.project, assetId, file.name, meta ? meta.mime : file.type);
          await appCtx.draft.persistDraftAssetQuietly(assetId);
          const background = page.background;
          const target = imageId
            ? items(page).find(function (item) { return item.id === imageId && item.kind === 'image'; })
            : null;
          if (target) {
            const oldAssetId = target.assetId;
            actions.pushUndo('替换背景图');
            target.assetId = assetId;
            model.resetCrop(target);
            if (target.fit === 'none') {
              const rect = renderer.backgroundImageRect(state.project.pageSize, target, loaded);
              target.width = target.width > 0 ? target.width : rect.width;
              target.height = target.height > 0 ? target.height : rect.height;
            }
            actions.releaseUnusedAsset(oldAssetId);
            state.selection = { type: 'backgroundItem', itemId: target.id };
          } else if (whole) {
            const previous = background;
            actions.pushUndo('更换背景');
            const image = model.createBackgroundImage(assetId, 'cover');
            page.background = { color: previous.color, items: [image] };
            releaseBackgroundAssets(previous, page.background);
            state.selection = { type: 'backgroundItem', itemId: image.id };
          } else {
            actions.pushUndo('添加背景图');
            const image = model.createBackgroundImage(assetId,
              imageItems(page).length ? 'original' : 'cover');
            background.items.push(image);
            state.selection = { type: 'backgroundItem', itemId: image.id };
          }
          ui.renderAll();
          if (whole) {
            ui.toast('已更换本页背景 · 撤销');
          } else {
            ui.toast('背景图片已更新。');
          }
        } catch (err) {
          if (assetId) L.assets.remove(assetId);
          ui.toast('背景图片读取失败：' + err.message, 'error');
        }
      }

      async function handleDroppedBackgroundFile(mode, context, file) {
        if (!file) return;
        const ctx = context || {};
        if (mode === 'whole') {
          pendingBackgroundImageId = null;
          pendingBackgroundWhole = true;
        } else {
          pendingBackgroundImageId = mode === 'replace' ? (ctx.imageId || null) : null;
          pendingBackgroundWhole = false;
        }
        await handleBackgroundFile(file);
      }

      function deleteBackgroundItem(itemId) {
        const page = currentEditablePage();
        if (!page) return;
        const list = items(page);
        const index = list.findIndex(function (item) { return item.id === itemId; });
        if (index < 0) return;
        const item = list[index];
        actions.pushUndo(item.kind === 'shape' ? '删除背景图形' : '删除背景图');
        list.splice(index, 1);
        if (item.assetId) actions.releaseUnusedAsset(item.assetId);
        state.selection = { type: 'background' };
        ui.renderAll();
      }

      function deleteBackgroundImage(imageId) {
        const page = currentEditablePage();
        if (!page) return;
        const image = items(page).find(function (item) {
          return item.id === imageId && item.kind === 'image';
        });
        if (!image) return;
        deleteBackgroundItem(imageId);
      }

      function moveBackgroundItem(itemId, delta) {
        const page = currentEditablePage();
        if (!page) return;
        const list = items(page);
        const plan = model.planStepMove(list, itemId, delta);
        if (!plan) return;
        actions.pushUndo('调整背景条目顺序');
        model.moveItem(list, plan.from, plan.to);
        ui.renderAll();
      }

      function moveBackgroundItemTo(itemId, targetId, placement) {
        const page = currentEditablePage();
        if (!page) return false;
        const list = items(page);
        const plan = model.planDisplayMove(list, itemId, targetId, placement);
        if (!plan) return false;
        actions.pushUndo('调整背景条目顺序');
        model.moveItem(list, plan.from, plan.to);
        ui.renderAll();
        return true;
      }

      function moveBackgroundImage(imageId, delta) {
        moveBackgroundItem(imageId, delta);
      }

      function moveBackgroundImageTo(imageId, targetId, placement) {
        return moveBackgroundItemTo(imageId, targetId, placement);
      }

      function setBackgroundImageFit(imageId, fit) {
        const page = currentEditablePage();
        if (!page) return;
        const image = items(page).find(function (item) {
          return item.id === imageId && item.kind === 'image';
        });
        if (!image) return;
        if (fit === 'none') {
          actions.ensureCustomBackgroundImage(image);
        } else {
          image.fit = fit;
          image.rotation = 0;
        }
        ui.renderAll();
      }

      function restoreBackgroundImageFit(imageId) {
        setBackgroundImageFit(imageId, 'cover');
      }

      function setBackgroundImageValue(imageId, key, value) {
        const page = currentEditablePage();
        if (!page) return;
        const image = items(page).find(function (item) {
          return item.id === imageId && item.kind === 'image';
        });
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

      return {
        setGlobalBackgroundPage, clearGlobalBackground, copyBackgroundFromPage,
        clearPageBackground, replacePageBackground,
        pickBackgroundImage, handleBackgroundFile, pickBackgroundImageWhole, handleDroppedBackgroundFile,
        deleteBackgroundImage, deleteBackgroundItem,
        moveBackgroundImage, moveBackgroundImageTo, moveBackgroundItem, moveBackgroundItemTo,
        setBackgroundImageFit, restoreBackgroundImageFit, setBackgroundImageValue
      };
    }
  };
})();
