(function () {
  'use strict';

  const L = window.Listify = window.Listify || {};

  /*
   * 兼容壳（compatibility shim）。
   *
   * io.js 已拆成三个模块：L.projectSchema / L.projectIo / L.draftStore。
   * 这里只把它们合并回原来的 L.io 表面，保证 app.js 与回归检查中的既有调用点
   * 无需改动；新代码应直接引用对应的单一职责模块。
   */
  Object.assign(L.io = {}, L.projectSchema, L.projectIo, L.draftStore);
})();
