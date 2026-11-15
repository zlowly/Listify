(function () {
  'use strict';

  const L = window.Listify = window.Listify || {};
  const model = L.model;
  const layout = L.layout;
  const renderer = L.render;
  const ui = L.ui;
  const clamp = model.clamp;
  const escapeHtml = ui.esc;

  L.appDraft = {
    create: function (appCtx) {
      const state = appCtx.state;
      const viewport = appCtx.viewport;
      const surface = appCtx.surface;
      const actions = appCtx.actions;

      const draft = {
        enabled: false,
        restoring: true,
        timer: 0,
        lastKey: '',
        lastSavedAt: 0,
        status: 'idle',
        lastError: '',
        saving: false,
        queued: false,
        memoryOnly: false
      };

      function formatDraftTime(timestamp) {
        const date = new Date(timestamp || Date.now());
        return String(date.getHours()).padStart(2, '0') + ':' +
          String(date.getMinutes()).padStart(2, '0');
      }
    
      function draftSnapshotKey(envelope) {
        return JSON.stringify({ ui: envelope.ui, project: envelope.project });
      }
    
      function setDraftStatus(status, error, title) {
        appCtx.draft.status = status;
        appCtx.draft.lastError = error || '';
        const el = document.getElementById('draft-status');
        if (!el) return;
        let text = '草稿未保存';
        if (status === 'saved') {
          text = '草稿已自动保存 ' + formatDraftTime(appCtx.draft.lastSavedAt);
        } else if (status === 'unavailable') {
          text = '草稿不可用';
        } else if (status === 'idle') {
          text = '自动保存已开启';
        }
        el.textContent = text;
        el.setAttribute('data-state', status);
        let tip = title || '';
        if (!tip) {
          if (status === 'saved') {
            tip = '草稿保存在本机浏览器中；导出项目可长期备份。';
          } else if (status === 'idle') {
            tip = '草稿会自动保存在本机浏览器中；导出项目可长期备份。';
          } else if (error) {
            tip = '原因：' + error;
          } else {
            tip = '尚未自动保存。';
          }
        }
        el.title = tip;
      }
    
      function reportDraftError(err) {
        const message = err && err.message ? err.message : '本地存储写入失败';
        const previous = appCtx.draft.lastError;
        const fatal = err && (err.name === 'SecurityError' || err.name === 'NotSupportedError');
        if (fatal) {
          appCtx.draft.enabled = false;
          appCtx.draft.memoryOnly = true;
          setDraftStatus('unavailable', message);
        } else {
          setDraftStatus('unsaved', message);
        }
        if (previous !== message) {
          ui.toast('草稿自动保存失败：' + message, 'error');
        }
      }
    
      function scheduleDraftSave() {
        if (!appCtx.draft.enabled || appCtx.draft.restoring) return;
        if (appCtx.draft.timer) clearTimeout(appCtx.draft.timer);
        appCtx.draft.timer = setTimeout(function () {
          appCtx.draft.timer = 0;
          saveDraftNow();
        }, 300);
      }
    
      async function saveDraftNow(options) {
        if (!appCtx.draft.enabled || appCtx.draft.restoring) return;
        const force = !!(options && options.force);
        const initialEnvelope = L.io.createDraftEnvelope(state.project, state.currentPageId);
        if (!force && draftSnapshotKey(initialEnvelope) === appCtx.draft.lastKey) return;
        if (appCtx.draft.saving) {
          appCtx.draft.queued = true;
          return;
        }
        appCtx.draft.saving = true;
        try {
          try {
            await L.io.ensureDraftAssets(state.project);
          } catch (err) {
            // 图片资产没落盘时不要写结构，避免恢复时把图片当作缺失资产删掉。
            reportDraftError(err);
            return;
          }
          if (!appCtx.draft.enabled || appCtx.draft.restoring) return;
          // 等待资产写入期间可能又有编辑；总是落盘当前状态，避免旧结构覆盖新编辑。
          const envelope = L.io.createDraftEnvelope(state.project, state.currentPageId);
          const key = draftSnapshotKey(envelope);
          if (!force && key === appCtx.draft.lastKey) return;
          const savedAt = L.io.writeDraftEnvelope(envelope);
          appCtx.draft.lastKey = key;
          appCtx.draft.lastSavedAt = savedAt;
          setDraftStatus('saved');
          try {
            await L.io.pruneDraftAssets(state.project);
          } catch (err) {
            /* 未引用资产残留不影响草稿；下次保存会再清理。 */
          }
        } catch (err) {
          reportDraftError(err);
        } finally {
          appCtx.draft.saving = false;
          if (appCtx.draft.queued) {
            appCtx.draft.queued = false;
            scheduleDraftSave();
          }
        }
      }
    
      function flushDraftSync() {
        if (!appCtx.draft.enabled || appCtx.draft.restoring) return;
        const envelope = L.io.createDraftEnvelope(state.project, state.currentPageId);
        const key = draftSnapshotKey(envelope);
        if (key === appCtx.draft.lastKey) return;
        try {
          const savedAt = L.io.writeDraftEnvelope(envelope);
          appCtx.draft.lastKey = key;
          appCtx.draft.lastSavedAt = savedAt;
          setDraftStatus('saved');
        } catch (err) {
          reportDraftError(err);
        }
      }
    
      async function persistDraftAssetQuietly(assetId) {
        if (!appCtx.draft.enabled || !assetId) return;
        try {
          await L.io.persistDraftAsset(assetId, state.project);
        } catch (err) {
          reportDraftError(err);
        }
      }
    
      async function restoreDraftOnStartup() {
        appCtx.draft.restoring = true;
        appCtx.draft.enabled = false;
        let result;
        try {
          result = await L.io.restoreDraft();
        } catch (err) {
          appCtx.draft.memoryOnly = true;
          return { ok: false, reason: 'unavailable', error: err.message };
        }
        if (result && result.ok && result.project) {
          L.io.installAssets(result.assets);
          state.project = result.project;
          const savedPageId = result.ui && result.ui.currentPageId;
          state.currentPageId = model.getPage(state.project, savedPageId)
            ? savedPageId
            : state.project.pages[0].id;
          state.selection = { type: 'page' };
          appCtx.draft.lastKey = draftSnapshotKey(
            L.io.createDraftEnvelope(state.project, state.currentPageId)
          );
          appCtx.draft.lastSavedAt = result.savedAt || Date.now();
          appCtx.draft.status = 'saved';
          return { ok: true, restored: true, missingCount: result.missingCount || 0 };
        }
        if (result && result.ok && result.empty) {
          appCtx.draft.lastKey = '';
          appCtx.draft.lastSavedAt = 0;
          return { ok: true, restored: false };
        }
        if (result && result.reason === 'unavailable') appCtx.draft.memoryOnly = true;
        return {
          ok: false,
          reason: (result && result.reason) || 'corrupt',
          error: result && result.error,
          errors: result && result.errors
        };
      }
    
      function notifyDraftRecovery(startup) {
        if (!startup || startup.ok) {
          if (startup && startup.missingCount) {
            ui.toast('草稿已恢复，但 ' + startup.missingCount +
              ' 张图片缺失，相关图片已移除。', 'error');
          }
          return;
        }
        if (startup.reason === 'unavailable') {
          setDraftStatus('unavailable', startup.error || '浏览器本地存储不可用');
          ui.modal.alert('草稿不可用',
            '浏览器本地存储不可用，草稿不会自动保存；仍可编辑并导出项目。');
          return;
        }
        const message = startup.reason === 'version'
          ? '草稿版本高于当前支持的版本，已打开空白项目。原始草稿已保留在 listify.draft.corrupt。'
          : '草稿无法恢复，已打开空白项目。原始草稿已保留在 listify.draft.corrupt。';
        ui.modal.alert('草稿无法恢复', message);
      }

      return {
        ...Object.assign(draft, {
          formatDraftTime, draftSnapshotKey, setDraftStatus, reportDraftError, scheduleDraftSave, saveDraftNow, flushDraftSync, persistDraftAssetQuietly, restoreDraftOnStartup, notifyDraftRecovery
        })
      };
    }
  };
})();
