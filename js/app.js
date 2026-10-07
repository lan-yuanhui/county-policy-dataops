/* ==========================================================================
   app.js — 县域政策数据运营平台 应用外壳
   Vue3 根实例 + 自研 hash 路由 + 路由进度条 + 启动加载页
   依赖: views.js(window.Views) + data.js(window.DASHBOARD_DATA)
   ========================================================================== */
(function () {
  var D = window.DASHBOARD_DATA || {};
  var Views = window.Views;

  /* ---------- 菜单 ---------- */
  var MENUS = [
    { key: "overview", label: "数据总览",
      ico: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="1.6"/><rect x="13.5" y="3" width="7.5" height="5" rx="1.6"/><rect x="13.5" y="10.5" width="7.5" height="10.5" rx="1.6"/><rect x="3" y="13.5" width="8" height="7.5" rx="1.6"/></svg>' },
    { key: "policy", label: "政策分析",
      ico: '<svg viewBox="0 0 24 24"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5"/><path d="M9 13h6M9 17h6"/></svg>' },
    { key: "county", label: "县域维度",
      ico: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-5.2-7-11a7 7 0 0 1 14 0c0 5.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>' },
    { key: "project", label: "招商项目",
      ico: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 13h18"/></svg>' },
    { key: "about", label: "数据口径",
      ico: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M12 12v4"/></svg>' }
  ];

  /* ---------- hash 路由 ---------- */
  function parseRoute() {
    var key = (location.hash || "").replace(/^#\/?/, "").split("?")[0];
    for (var i = 0; i < MENUS.length; i++) if (MENUS[i].key === key) return key;
    return "overview";
  }

  /* ---------- 顶部进度条 ---------- */
  var progEl = null, progBar = null;
  function startProgress() {
    if (!progEl) {
      progEl = document.getElementById("top-progress");
      progBar = progEl ? progEl.querySelector("i") : null;
    }
    if (!progEl) return;
    progEl.classList.add("on");
    progBar.style.width = "0%";
    requestAnimationFrame(function () { progBar.style.width = "72%"; });
    Vue.nextTick(function () {
      setTimeout(function () {
        progBar.style.width = "100%";
        setTimeout(function () { progEl.classList.remove("on"); progBar.style.width = "0%"; }, 400);
      }, 160);
    });
  }

  /* ---------- 根组件 ---------- */
  var App = {
    data: function () {
      return { route: parseRoute(), D: D, menus: MENUS, menuOpen: false };
    },
    computed: {
      currentLabel: function () {
        for (var i = 0; i < MENUS.length; i++) if (MENUS[i].key === this.route) return MENUS[i].label;
        return "数据总览";
      }
    },
    mounted: function () {
      var self = this;
      window.addEventListener("hashchange", function () {
        var key = parseRoute();
        if (key !== self.route) {
          self.route = key;
          self.menuOpen = false;
          window.scrollTo(0, 0);
          startProgress();
        }
      });
      startProgress();
    },
    template:
      '<div class="sidebar">' +
      '  <div class="brand">' +
      '    <div class="brand-mark">县</div>' +
      '    <div class="brand-txt"><b>县域政策</b><span>DATA OPERATIONS</span></div>' +
      '  </div>' +
      '  <nav class="nav">' +
      '    <div class="nav-group">数据应用</div>' +
      '    <a v-for="m in menus" :key="m.key" :href="\'#/\' + m.key" :class="{active: route===m.key}">' +
      '      <span class="nav-ico" v-html="m.ico"></span><span>{{ m.label }}</span>' +
      '    </a>' +
      '  </nav>' +
      '  <div class="side-foot">v2.1 · Vue3 + ECharts5 · 本地零 CDN</div>' +
      '</div>' +
      '<div class="main">' +
      '  <header class="topbar">' +
      '    <button class="nav-toggle" @click="menuOpen=!menuOpen" aria-label="切换菜单" aria-expanded="{{ menuOpen }}">☰</button>' +
      '    <div class="crumb"><a href="#/overview">数据运营</a><span style="margin:0 8px;color:#C3CCDB;">/</span><em>{{ currentLabel }}</em></div>' +
      '    <div class="top-right">' +
      '      <span class="meta"><i class="dot"></i>数据更新 {{ D.updated_at }} · {{ D.total_policy }} 政策 / {{ D.total_project }} 项目 / {{ D.counties.length }} 县域</span>' +
      '    </div>' +
      '  </header>' +
      '  <main class="content">' +
      '    <transition name="view-fade" mode="out-in">' +
      '      <div :key="route">' +
      '        <overview-view v-if="route===\'overview\'"></overview-view>' +
      '        <policy-view v-else-if="route===\'policy\'"></policy-view>' +
      '        <county-view v-else-if="route===\'county\'"></county-view>' +
      '        <project-view v-else-if="route===\'project\'"></project-view>' +
      '        <about-view v-else-if="route===\'about\'"></about-view>' +
      '      </div>' +
      '    </transition>' +
      '    <div class="mobile-nav" :class="{open: menuOpen}">' +
      '      <a v-for="m in menus" :key="\'m\' + m.key" :href="\'#/\' + m.key" :class="{active: route===m.key}" @click="menuOpen=false"><span class="nav-ico" v-html="m.ico"></span><span>{{ m.label }}</span></a>' +
      '    </div>' +
      '    <div class="footnote">县域政策数据运营平台 · 数据采集自政府公开门户（{{ D.updated_at }}）· 政策类型为规则初标待人工复核 · 仅供学习演示与求职作品展示</div>' +
      '  </main>' +
      '</div>'
  };

  /* ---------- 启动 ---------- */
  var app = Vue.createApp(App);
  app.component("overview-view", Views.Overview);
  app.component("policy-view", Views.PolicyView);
  app.component("county-view", Views.CountyView);
  app.component("project-view", Views.ProjectView);
  app.component("about-view", Views.AboutView);
  var vm = app.mount("#app");
  window.__app = vm;

  window.addEventListener("load", function () {
    setTimeout(function () {
      var sp = document.getElementById("boot-splash");
      if (sp) sp.classList.add("done");
    }, 650);
  });
  setTimeout(function () {
    var sp = document.getElementById("boot-splash");
    if (sp) sp.classList.add("done");
  }, 3000);
})();
