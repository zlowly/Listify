(function () {
  'use strict';

  const L = window.Listify = window.Listify || {};
  const model = L.model;
  const layout = L.layout;
  const renderer = L.render;
  const ui = L.ui;
  const clamp = model.clamp;
  const escapeHtml = ui.esc;

  L.appPresets = {
    create: function (appCtx) {
      const state = appCtx.state;
      const viewport = appCtx.viewport;
      const surface = appCtx.surface;
      const actions = appCtx.actions;

      async function applyPreset(preset, mode, context) {
        if (!preset) return;
        // 索引项只有缩略图：应用前先补齐完整图数据；失败时提示并保持背景库/页面背景不变。
        if (!preset.data) {
          try {
            await L.presets.hydrate(preset);
          } catch (err) {
            ui.toast('预置素材加载失败：' + (err && err.message ? err.message : '未知错误') + '，请重试。', 'error');
            return;
          }
        }
        if (!preset.data) return;
        const ctx = context || {};
        let assetId;
        let loaded = null;
        try {
          const raw = String(preset.data);
          const comma = raw.indexOf(',');
          const match = /^data:(image\/[a-z0-9.+-]+)/i.exec(raw);
          const mime = match ? match[1] : 'image/png';
          const blob = L.assets.base64ToBlob(raw.slice(comma + 1), mime);
          assetId = await L.assets.addFile(new File([blob], preset.name, { type: mime }));
          loaded = await L.assets.loadImage(assetId);
          model.ensureAssetMeta(state.project, assetId, preset.name, mime);
          await appCtx.draft.persistDraftAssetQuietly(assetId);
        } catch (err) {
          ui.toast('预置素材应用失败：' + err.message, 'error');
          return;
        }
        try {
          if (mode === 'whole') applyPresetWhole(preset, assetId);
          else if (mode === 'add') applyPresetAdd(preset, ctx, assetId);
          else if (mode === 'replace') applyPresetReplace(preset, ctx, assetId, loaded);
        } catch (err) {
          ui.toast('预置素材应用失败：' + err.message, 'error');
        }
      }
    
      function addPresetImage(set, preset, assetId, mode) {
        let image = (set.images || []).find(function (img) { return img.assetId === assetId; }) || null;
        if (!image) {
          let fit;
          if (preset.kind === 'overlay') fit = 'original';
          else if (mode === 'add' && (set.images || []).length > 0) fit = 'original';
          else fit = 'cover';
          image = model.createBackgroundImage(assetId, fit);
          image.opacity = preset.opacity == null ? 1 : preset.opacity;
          set.images.push(image);
        }
        return image;
      }
    
      function applyPresetWhole(preset, assetId) {
        const name = '预置 · ' + preset.name;
        let set = (state.project.backgrounds || []).find(function (item) { return item.name === name; }) || null;
        const isNew = !set;
        if (isNew) {
          set = model.createBackgroundSet(name);
          set.color = preset.color || '#ffffff';
          state.project.backgrounds.push(set);
        }
        const image = addPresetImage(set, preset, assetId, 'whole');
        if (state.project.unifiedBackground) {
          state.project.unifiedBackgroundId = set.id;
        } else {
          const page = actions.currentPage();
          if (page) page.backgroundId = set.id;
        }
        state.selection = { type: 'backgroundImage', setId: set.id, imageId: image.id };
        ui.renderAll();
        ui.toast(isNew ? '已创建背景“' + name + '”并应用到当前页。' : '已应用背景“' + name + '”。');
        notifyDarkPreset(preset);
      }
    
      function applyPresetAdd(preset, ctx, assetId) {
        const set = model.findBackground(state.project, ctx.setId) ||
          model.effectiveBackground(state.project, actions.currentPage());
        if (!set) {
          ui.toast('没有可添加图片的背景。', 'error');
          return;
        }
        const image = addPresetImage(set, preset, assetId, 'add');
        state.selection = { type: 'backgroundImage', setId: set.id, imageId: image.id };
        ui.renderAll();
        ui.toast('已添加预置图片“' + preset.name + '”。');
        notifyDarkPreset(preset);
      }
    
      function applyPresetReplace(preset, ctx, assetId, loaded) {
        const set = model.findBackground(state.project, ctx.setId);
        const target = set && (set.images || []).find(function (img) { return img.id === ctx.imageId; }) || null;
        if (!set || !target) {
          ui.toast('找不到要替换的背景图片。', 'error');
          return;
        }
        const oldAssetId = target.assetId;
        target.assetId = assetId;
        if (target.fit === 'none' && loaded) {
          const rect = renderer.backgroundImageRect(state.project.pageSize, target, loaded);
          target.width = target.width > 0 ? target.width : rect.width;
          target.height = target.height > 0 ? target.height : rect.height;
        }
        if (oldAssetId && oldAssetId !== assetId) actions.releaseUnusedAsset(oldAssetId);
        state.selection = { type: 'backgroundImage', setId: set.id, imageId: target.id };
        ui.renderAll();
        ui.toast('已替换为“' + preset.name + '”。');
        notifyDarkPreset(preset);
      }
    
      function relativeLuminance(hex) {
        const match = /^#?([0-9a-fA-F]{6})$/.exec(String(hex == null ? '' : hex).trim());
        if (!match) return 1;
        const value = parseInt(match[1], 16);
        const channels = [
          (value >> 16) & 255,
          (value >> 8) & 255,
          value & 255
        ].map(function (channel) {
          channel /= 255;
          return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
      }
    
      function notifyDarkPreset(preset) {
        if (relativeLuminance(preset.color) < 0.35) {
          ui.toast('当前预置偏暗，建议调亮歌名文字颜色以保证可读性。');
        }
      }

      return {
        applyPreset, addPresetImage, applyPresetWhole, applyPresetAdd, applyPresetReplace, relativeLuminance, notifyDarkPreset
      };
    }
  };
})();
