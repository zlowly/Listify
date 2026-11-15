(function () {
  'use strict';

  const L = window.Listify = window.Listify || {};
  const ui = L.ui = L.ui || {};

  const esc = ui.esc;
  const helpTip = ui.helpTip;

  /* ---------- playlist editor ---------- */
  ui.playlistEditor = {
    open: function (options) {
      const opts = options || {};
      const project = L.app.state.project;
      const source = opts.categories || project.playlist.categories;
      const working = {
        categories: source.map(function (category) {
          return {
            originalName: category.name,
            name: category.name,
            originalSongs: category.songs.slice(),
            songs: category.songs.slice()
          };
        }),
        activeIndex: 0
      };

      if (opts.defaultCategoryName) {
        for (let i = 0; i < working.categories.length; i += 1) {
          if (working.categories[i].originalName === opts.defaultCategoryName) {
            working.activeIndex = i;
            break;
          }
        }
      }

      const snapshot = JSON.stringify(working.categories.map(function (category) {
        return { name: category.name, songs: category.songs };
      }));

      let activeIndex = working.activeIndex;
      let errors = {};
      let dragPayload = null;
      let gridRenderToken = 0;
      let modal = null;

      function currentCategory() {
        return working.categories[activeIndex];
      }

      function isDirty() {
        return JSON.stringify(working.categories.map(function (category) {
          return { name: category.name, songs: category.songs };
        })) !== snapshot;
      }

      function validate() {
        const issues = {};
        const categoryNames = new Map();

        working.categories.forEach(function (category, categoryIndex) {
          const name = category.name.trim();
          if (!name) {
            issues['cat:' + categoryIndex] = '分类名不能为空';
            return;
          }
          if (categoryNames.has(name)) {
            const first = categoryNames.get(name);
            issues['cat:' + categoryIndex] = '分类名与另一个分类重复';
            issues['cat:' + first] = '分类名与另一个分类重复';
          } else {
            categoryNames.set(name, categoryIndex);
          }
        });

        const songPositions = new Map();
        working.categories.forEach(function (category, categoryIndex) {
          category.songs.forEach(function (song, songIndex) {
            const key = 'song:' + categoryIndex + ':' + songIndex;
            const value = song.trim();
            if (!value) {
              issues[key] = '歌名不能为空';
              return;
            }
            if (value.charAt(0) === '#') {
              issues[key] = '歌名不能以 # 开头';
              return;
            }
            if (!songPositions.has(value)) songPositions.set(value, []);
            songPositions.get(value).push(key);
          });
        });

        songPositions.forEach(function (keys) {
          if (keys.length > 1) {
            keys.forEach(function (key) { issues[key] = '歌名与另一首歌重复'; });
          }
        });

        return issues;
      }

      const body = document.createElement('div');
      body.className = 'playlist-editor';
      body.innerHTML =
        '<div class="playlist-editor-rail">' +
          '<div class="playlist-editor-rail-title">分类</div>' +
          '<div class="playlist-editor-category-list" role="tablist" aria-label="歌单分类"></div>' +
        '</div>' +
        '<div class="playlist-editor-main">' +
          '<div class="playlist-editor-head">' +
            '<label class="playlist-editor-head-label" for="playlist-editor-category-name">分类名</label>' +
            '<input id="playlist-editor-category-name" class="input playlist-editor-name-input" type="text"' +
              ' autocomplete="off" spellcheck="false" aria-label="当前分类名">' +
            '<span class="playlist-editor-songcount hint"></span>' +
            '<button type="button" class="btn btn-sm playlist-editor-sort"' +
              ' title="按虚拟字数升序排列当前分类，结果与画布顺序一致">按字数排序</button>' +
            helpTip('Enter 下一格  Esc 还原  Delete 删除当前格（空格需先清空）') +
          '</div>' +
          '<div class="playlist-editor-grid" role="group" aria-label="歌名列表"></div>' +
        '</div>' +
        '<div class="playlist-editor-discard" hidden>' +
          '<span class="playlist-editor-discard-text">有未应用的修改，确定放弃？</span>' +
          '<button type="button" class="btn btn-sm" data-discard-cancel>继续编辑</button>' +
          '<button type="button" class="btn btn-sm btn-danger" data-discard-confirm>放弃修改</button>' +
        '</div>';

      const railList = body.querySelector('.playlist-editor-category-list');
      const nameInput = body.querySelector('#playlist-editor-category-name');
      const grid = body.querySelector('.playlist-editor-grid');
      const countEl = body.querySelector('.playlist-editor-songcount');
      const sortButton = body.querySelector('.playlist-editor-sort');
      const discardBar = body.querySelector('.playlist-editor-discard');

      modal = ui.modal.open({
        title: '编辑歌单',
        width: 'min(960px, 92vw)',
        body: body,
        beforeClose: function () {
          if (!isDirty()) return true;
          discardBar.hidden = false;
          return false;
        },
        onClose: function () {
          discardBar.hidden = true;
        },
        actions: [
          { label: '取消', onClick: function (close) { close(); } },
          {
            label: '应用',
            className: 'btn-primary',
            onClick: function () {
              commitActiveElement();
              working.categories.forEach(function (category) {
                category.name = category.name.trim();
                category.songs = category.songs.map(function (song) { return song.trim(); });
              });
              errors = validate();
              updateValidation();
              if (Object.keys(errors).length) {
                ui.toast('还有 ' + Object.keys(errors).length + ' 处待修正。', 'error');
                return;
              }
              if (opts.onApply) {
                opts.onApply(working.categories.map(function (category) {
                  return {
                    originalName: category.originalName,
                    name: category.name,
                    originalSongs: category.originalSongs.slice(),
                    songs: category.songs.slice(),
                    sorted: !!category.sorted
                  };
                }));
              }
              modal.close(true);
            }
          }
        ]
      });

      const modalEl = modal.root.querySelector('.modal');
      if (modalEl) modalEl.classList.add('playlist-editor-modal');

      const status = document.createElement('span');
      status.className = 'playlist-editor-status';
      status.setAttribute('aria-live', 'polite');
      modal.footer.insertBefore(status, modal.footer.firstChild);

      const actionButtons = modal.footer.querySelectorAll('button.btn');
      const applyButton = actionButtons[actionButtons.length - 1];

      discardBar.querySelector('[data-discard-cancel]').addEventListener('click', function () {
        discardBar.hidden = true;
      });
      discardBar.querySelector('[data-discard-confirm]').addEventListener('click', function () {
        modal.close(true);
      });

      sortButton.addEventListener('click', function () {
        sortCurrentCategory();
      });

      function categoryHasError(categoryIndex) {
        return Object.keys(errors).some(function (key) {
          return key === 'cat:' + categoryIndex ||
            key.indexOf('song:' + categoryIndex + ':') === 0;
        });
      }

      function renderRail() {
        errors = validate();
        railList.innerHTML = working.categories.map(function (category, index) {
          const name = category.name.trim();
          const hasError = categoryHasError(index);
          const active = index === activeIndex;
          return '<button type="button" role="tab" class="playlist-editor-rail-row' +
            (active ? ' active' : '') + (hasError ? ' has-error' : '') +
            '" data-cat-index="' + index + '" aria-selected="' + (active ? 'true' : 'false') + '"' +
            (hasError ? ' aria-invalid="true"' : '') + ' title="' + esc(name || '未命名') + '">' +
            '<span class="playlist-editor-rail-name' + (name ? '' : ' is-empty') + '">' +
              esc(name || '未命名') + '</span>' +
            '<span class="playlist-editor-rail-count">' + category.songs.length + '</span>' +
            '</button>';
        }).join('');
        railList.querySelectorAll('[data-cat-index]').forEach(function (button) {
          const index = Number(button.getAttribute('data-cat-index'));
          button.addEventListener('click', function () {
            selectCategory(index);
          });
          button.addEventListener('dragenter', function (event) {
            if (!dragPayload) return;
            event.preventDefault();
          });
          button.addEventListener('dragover', function (event) {
            if (!dragPayload) return;
            event.preventDefault();
            if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
            railList.querySelectorAll('[data-cat-index]').forEach(function (row) {
              row.classList.toggle('drop-target', row === button && index !== dragPayload.categoryIndex);
            });
          });
          button.addEventListener('dragleave', function (event) {
            if (event.relatedTarget && button.contains(event.relatedTarget)) return;
            button.classList.remove('drop-target');
          });
          button.addEventListener('drop', function (event) {
            event.preventDefault();
            moveSongToTarget(index);
          });
        });
      }

      function renderGrid() {
        const category = currentCategory();
        // 每次重建网格都递增令牌：旧节点被移除时触发的 blur 不再回写数据。
        gridRenderToken += 1;
        grid.innerHTML = category.songs.map(function (song, index) {
          return '<div class="playlist-editor-cell" data-song-index="' + index + '">' +
            '<button type="button" class="playlist-editor-drag" draggable="true" tabindex="-1"' +
              ' aria-label="拖动歌名 ' + esc(song) + '" title="拖动到其他分类">⠿</button>' +
            '<input class="input playlist-editor-input" type="text" value="' + esc(song) + '"' +
              ' autocomplete="off" spellcheck="false"' +
              ' aria-label="第 ' + (index + 1) + ' 首歌名" title="' + esc(song) + '">' +
            '<button type="button" class="playlist-editor-delete" tabindex="-1"' +
              ' aria-label="删除歌名 ' + esc(song) + '" title="删除">×</button>' +
            '</div>';
        }).join('') +
          '<div class="playlist-editor-cell playlist-editor-add-cell">' +
            '<input class="input playlist-editor-input playlist-editor-add-input" type="text"' +
              ' placeholder="添加歌名…" autocomplete="off" spellcheck="false" aria-label="添加歌名">' +
          '</div>';

        grid.querySelectorAll('[data-song-index]').forEach(function (cell) {
          const index = Number(cell.getAttribute('data-song-index'));
          const input = cell.querySelector('input');
          bindCellInput(input, index);
          const dragHandle = cell.querySelector('.playlist-editor-drag');
          dragHandle.addEventListener('dragstart', function (event) {
            commitActiveElement();
            const song = currentCategory().songs[index];
            dragPayload = { categoryIndex: activeIndex, songIndex: index, song: song };
            if (event.dataTransfer) {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', song);
            }
          });
          dragHandle.addEventListener('dragend', function () {
            dragPayload = null;
            clearDropTarget();
          });
          const deleteButton = cell.querySelector('.playlist-editor-delete');
          deleteButton.addEventListener('click', function () {
            const categoryNow = currentCategory();
            if (!categoryNow.songs[index] && categoryNow.songs[index] !== '') return;
            categoryNow.songs.splice(index, 1);
            refreshAfterStructureChange();
            focusCell(index < categoryNow.songs.length ? index : categoryNow.songs.length);
          });
        });

        bindAddInput(grid.querySelector('.playlist-editor-add-input'));
      }

      function bindCellInput(input, index) {
        // 记录绑定时的分类与渲染轮次；切换分类或重新渲染会移除旧格并触发 blur，
        // 此时不能把旧格的值写回可能已重排的歌名数组。
        const categoryAtBind = activeIndex;
        const renderTokenAtBind = gridRenderToken;
        input.addEventListener('focus', function () {
          input.__initialValue = input.value;
        });
        input.addEventListener('input', function () {
          currentCategory().songs[index] = input.value;
          updateValidation();
        });
        input.addEventListener('blur', function () {
          // 重新渲染会移除聚焦格并触发 blur，此时节点可能仍报告已连接，
          // 用渲染轮次判断：旧轮次的输入框一律不回写。
          if (renderTokenAtBind !== gridRenderToken) return;
          if (!input.isConnected) return;
          if (activeIndex !== categoryAtBind) return;
          commitCell(input, index);
        });
        input.addEventListener('keydown', function (event) {
          if (ui.isComposingEvent(event)) return;
          if (event.key === 'Enter') {
            event.preventDefault();
            commitCell(input, index);
            focusCell(index + 1);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            const initial = input.__initialValue != null ? input.__initialValue : input.value;
            input.value = initial;
            currentCategory().songs[index] = initial;
            updateValidation();
          } else if (event.key === 'Delete' || (event.key === 'Backspace' && input.value === '')) {
            event.preventDefault();
            const categoryNow = currentCategory();
            if (categoryNow.songs[index] == null) return;
            categoryNow.songs.splice(index, 1);
            refreshAfterStructureChange();
            focusCell(index < categoryNow.songs.length ? index : categoryNow.songs.length);
          }
        });
      }

      function bindAddInput(addInput) {
        addInput.addEventListener('keydown', function (event) {
          if (ui.isComposingEvent(event)) return;
          if (event.key === 'Enter') {
            event.preventDefault();
            addSingleSong(addInput);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            addInput.value = '';
          }
        });
        addInput.addEventListener('paste', function (event) {
          const clipboard = event.clipboardData || window.clipboardData;
          if (!clipboard) return;
          const text = clipboard.getData('text');
          if (!text) return;
          event.preventDefault();
          const lines = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
          appendSongs(lines, true);
          focusAdd();
        });
      }

      function commitCell(input, index) {
        const category = currentCategory();
        if (!category || !category.songs[index] && category.songs[index] !== '') return;
        const trimmed = input.value.trim();
        input.value = trimmed;
        category.songs[index] = trimmed;
        input.title = trimmed;
        input.__initialValue = trimmed;
        updateValidation();
      }

      function commitActiveElement() {
        const active = document.activeElement;
        if (!active || !active.classList || !active.classList.contains('playlist-editor-input')) return;
        const cell = active.closest('[data-song-index]');
        if (cell) commitCell(active, Number(cell.getAttribute('data-song-index')));
      }

      function songOrderChanged(before, after) {
        if (before.length !== after.length) return false;
        for (let i = 0; i < before.length; i += 1) {
          if (before[i] !== after[i]) return true;
        }
        return false;
      }

      function announce(message) {
        if (Object.keys(errors).length) ui.toast(message);
        else status.textContent = message;
      }

      function sortCurrentCategory() {
        commitActiveElement();
        const category = currentCategory();
        const before = category.songs.slice();
        const sorted = L.layout.sortSongs(before);
        if (!songOrderChanged(before, sorted)) {
          announce('当前分类已是按字数排序后的顺序。');
          sortButton.focus();
          return;
        }
        let moved = 0;
        before.forEach(function (song, index) {
          if (song !== sorted[index]) moved += 1;
        });
        category.songs = sorted;
        category.sorted = true;
        refreshAfterStructureChange();
        announce('已按字数排序，' + moved + ' 首位置变化。');
        sortButton.focus();
      }

      function focusCell(index) {
        const inputs = grid.querySelectorAll('[data-song-index] .playlist-editor-input');
        if (index >= 0 && index < inputs.length) {
          inputs[index].focus();
          return;
        }
        focusAdd();
      }

      function focusAdd() {
        const add = grid.querySelector('.playlist-editor-add-input');
        if (add) add.focus();
      }

      function addSingleSong(addInput) {
        const value = addInput.value.trim();
        if (!value) return;
        if (value.charAt(0) === '#') {
          ui.toast('歌名不能以 # 开头。', 'error');
          return;
        }
        const category = currentCategory();
        const exists = working.categories.some(function (item) {
          return item.songs.some(function (song) { return song.trim() === value; });
        });
        if (exists) {
          ui.toast('歌名已存在。', 'error');
          return;
        }
        category.songs.push(value);
        addInput.value = '';
        refreshAfterStructureChange();
        focusAdd();
      }

      function appendSongs(lines, announce) {
        const category = currentCategory();
        const existing = new Set();
        working.categories.forEach(function (item) {
          item.songs.forEach(function (song) { existing.add(song.trim()); });
        });
        let added = 0;
        let skipped = 0;
        lines.forEach(function (line) {
          const value = String(line).trim();
          if (!value || value.charAt(0) === '#' || existing.has(value)) {
            skipped += 1;
            return;
          }
          existing.add(value);
          category.songs.push(value);
          added += 1;
        });
        refreshAfterStructureChange();
        if (announce) {
          ui.toast('已添加 ' + added + ' 首，跳过 ' + skipped + ' 行。', added ? 'success' : '');
        }
      }

      function selectCategory(index) {
        if (index < 0 || index >= working.categories.length) return;
        // 切换分类前先提交当前格，避免聚焦格仍属于旧分类时写错分类
        if (index !== activeIndex) commitActiveElement();
        activeIndex = index;
        working.activeIndex = index;
        renderActive();
      }

      function clearDropTarget() {
        railList.querySelectorAll('.drop-target').forEach(function (row) {
          row.classList.remove('drop-target');
        });
      }

      function moveSongToTarget(targetIndex) {
        const payload = dragPayload;
        dragPayload = null;
        clearDropTarget();
        if (!payload || targetIndex === payload.categoryIndex) return;
        const source = working.categories[payload.categoryIndex];
        const target = working.categories[targetIndex];
        if (!source || !target) return;
        if (source.songs[payload.songIndex] !== payload.song) return;
        source.songs.splice(payload.songIndex, 1);
        target.songs.push(payload.song);
        refreshAfterStructureChange();
        const remaining = source.songs.length;
        focusCell(payload.songIndex < remaining ? payload.songIndex : remaining);
      }

      function refreshAfterStructureChange() {
        countEl.textContent = currentCategory().songs.length + ' 首';
        renderGrid();
        renderRail();
        updateValidation();
      }

      function renderActive() {
        const category = currentCategory();
        nameInput.value = category.name;
        countEl.textContent = category.songs.length + ' 首';
        renderGrid();
        renderRail();
        updateValidation();
      }

      function updateValidation() {
        errors = validate();
        const category = currentCategory();
        const categoryKey = 'cat:' + activeIndex;
        const categoryInvalid = !!errors[categoryKey];
        nameInput.classList.toggle('is-invalid', categoryInvalid);
        nameInput.title = categoryInvalid ? errors[categoryKey] : '';

        grid.querySelectorAll('[data-song-index]').forEach(function (cell) {
          const index = Number(cell.getAttribute('data-song-index'));
          const input = cell.querySelector('.playlist-editor-input');
          const key = 'song:' + activeIndex + ':' + index;
          const invalid = !!errors[key];
          input.classList.toggle('is-invalid', invalid);
          cell.classList.toggle('has-error', invalid);
          input.title = invalid ? errors[key] + '：' + input.value : input.value;
        });

        railList.querySelectorAll('[data-cat-index]').forEach(function (button) {
          const index = Number(button.getAttribute('data-cat-index'));
          const hasError = categoryHasError(index);
          button.classList.toggle('has-error', hasError);
          if (hasError) button.setAttribute('aria-invalid', 'true');
          else button.removeAttribute('aria-invalid');
        });

        const count = Object.keys(errors).length;
        status.textContent = count ? count + ' 处待修正' : '';
        status.classList.toggle('has-errors', count > 0);
        if (applyButton) applyButton.disabled = count > 0;
        if (sortButton) sortButton.disabled = currentCategory().songs.length < 2;

        // keep the rail label in sync with the text being typed
        const activeRow = railList.querySelector('[data-cat-index="' + activeIndex + '"]');
        if (activeRow) {
          const label = activeRow.querySelector('.playlist-editor-rail-name');
          if (label) {
            const trimmed = category.name.trim();
            label.textContent = trimmed || '未命名';
            label.classList.toggle('is-empty', !trimmed);
            activeRow.title = trimmed || '未命名';
          }
          const railCount = activeRow.querySelector('.playlist-editor-rail-count');
          if (railCount) railCount.textContent = category.songs.length;
        }
      }

      nameInput.addEventListener('input', function () {
        currentCategory().name = nameInput.value;
        renderRail();
        updateValidation();
      });

      renderActive();
      nameInput.focus();
      nameInput.select();
    }
  };
})();
