/* ==========================================================================
   views.js — 县域政策数据运营平台 视图组件 v2.1
   图表引擎升级：Apache ECharts 5（本地化，结论导向设计——每图配一句结论）
   注册 window.Views（Overview / PolicyView / CountyView / ProjectView / AboutView）
   ========================================================================== */
(function () {
  var D = window.DASHBOARD_DATA || {};

  /* ---------- 质量指标辅助（全部绑定 build_db 输出的 quality 段） ----------
     设计原则：看板上的每个百分比都必须能在 quality_report.json 找到出处，
     禁止硬编码。缺失时显示 "—" 而非伪造 100%。 */
  function qVal(rate) {
    if (rate === undefined || rate === null || isNaN(rate)) return "—";
    return Math.round(rate * 100);
  }
  function qPct(rate) {
    if (rate === undefined || rate === null || isNaN(rate)) return "—";
    return Math.round(rate * 100) + "%";
  }
  window.qVal = qVal;
  window.qPct = qPct;

  var PALETTE = ["#3F72AF", "#5B8FD4", "#7FB2E5", "#10B981",
                 "#F59E0B", "#8B5CF6", "#EC4899", "#14B8A6"];
  var NAV = "rgba(24,39,63,.92)";

  /* ---------- ECharts 生命周期管理 ---------- */
  var EChartsLib = {
    list: [],
    make: function (el, option) {
      var c = echarts.init(el);
      c.setOption(option);
      this.list.push(c);
      var sk = el.parentNode ? el.parentNode.querySelector(".sk") : null;
      if (sk) sk.style.display = "none";
      return c;
    },
    destroy: function () {
      this.list.forEach(function (c) { try { c.dispose(); } catch (e) {} });
      this.list = [];
    },
    resizeAll: function () {
      this.list.forEach(function (c) { try { c.resize(); } catch (e) {} });
    }
  };
  window.EChartsLib = EChartsLib;
  if (window.addEventListener) {
    window.addEventListener("resize", function () { EChartsLib.resizeAll(); });
  }

  function destroyCharts() { EChartsLib.destroy(); }
  /* 柱状渐变 */
  function vGrad(el, c0, c1) {
    return new echarts.graphic.LinearGradient(0, 0, 0, 1, [
      { offset: 0, color: c0 }, { offset: 1, color: c1 }
    ]);
  }
  function hGrad(el, c0, c1) {
    return new echarts.graphic.LinearGradient(0, 0, 1, 0, [
      { offset: 0, color: c0 }, { offset: 1, color: c1 }
    ]);
  }

  /* ---------- 图标 ---------- */
  var ICO = {
    doc: '<svg viewBox="0 0 24 24"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5"/><path d="M9 13h6M9 17h6"/></svg>',
    project: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 13h18"/></svg>',
    map: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-5.2-7-11a7 7 0 0 1 14 0c0 5.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>',
    shield: '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
  };
  window.ICO = ICO;

  /* ---------- KPI 卡（数字滚动） ---------- */
  var KpiCard = {
    props: ["label", "value", "unit", "sub", "icon", "tone", "color", "noSep"],
    data: function () { return { disp: 0 }; },
    watch: {
      value: function (n) { this.animate(n); }
    },
    mounted: function () { this.animate(this.value); },
methods: {
      qVal: qVal,
      qPct: qPct,
      animate: function (target) {
        var self = this;
        var dur = 800, t0 = null;
        // setTimeout 驱动: 后台/无头标签页 rAF 不触发, 数字会停 0
        function step() {
          var now = performance.now();
          if (!t0) t0 = now;
          var p = Math.min((now - t0) / dur, 1);
          var ease = 1 - Math.pow(1 - p, 3);
          self.disp = Math.round(target * ease);
          if (p < 1) setTimeout(step, 16);
          else self.disp = target;
        }
        step();
      },
      fmt: function () {
        return this.noSep ? String(this.disp) : this.disp.toLocaleString();
      }
    },
    template:
      '<div class="kpi" :style="{\'--kpi-tone\': tone, \'--kpi-color\': color}">' +
      '  <div class="kpi-ico" v-html="icon"></div>' +
      '  <div class="kpi-meta">' +
      '    <div class="kpi-label">{{ label }}</div>' +
      '    <div class="kpi-value">{{ fmt() }}<small v-if="unit">{{ unit }}</small></div>' +
      '    <div class="kpi-sub" v-if="sub" v-html="sub"></div>' +
      '  </div>' +
      '</div>'
  };

  /* ================= 1. 数据总览 ================= */
  var Overview = {
    components: { KpiCard: KpiCard },
    data: function () {
      return {
        D: D, ICO: ICO, latest: [],
        trendNote: "", typeNote: "", topType: "",
        levelNote: "", sourceNote: ""
      };
    },
    mounted: function () {
      var self = this;
      this.latest = D.policies.slice().sort(function (a, b) {
        return (b.publish_date || "").localeCompare(a.publish_date || "");
      }).slice(0, 6);
      // 结论条：趋势（同期可比口径，数据截至 2026-09）
      var curM = "09";
      function samePeriod(y) {
        return D.policies.filter(function (p) {
          var d = p.publish_date || "";
          return d.slice(0, 4) === String(y) && d.slice(5, 7) <= curM;
        }).length;
      }
      var ys = samePeriod(2026), prevN = samePeriod(2025), yoy = prevN > 0 ? Math.round((ys - prevN) / prevN * 100) : 0;
      var bestY = 2022, bestN = -1;
      [2022, 2023, 2024, 2025].forEach(function (y) {
        var n = samePeriod(y);
        if (n > bestN) { bestN = n; bestY = y; }
      });
      this.trendNote = "<b>2026 年 1–9 月发文 " + ys + " 条，同比 2025 年同期（" + prevN + " 条）增长 " + yoy + "%</b>" +
        (ys >= bestN ? "，为近五年同期最高" : "，低于 " + bestY + " 年同期（" + bestN + " 条）") +
        "；年度数据截至 9 月底，与『百千万工程』从铺开转向深化落地相吻合。";
      // 结论条：类型
      var top = D.by_type.slice().sort(function (a, b) { return b.count - a.count; })[0];
      var sum = D.total_policy;
      this.topType = top.type;
      this.typeNote = "『<b>" + top.type + "</b>』占比最高（" + top.count + " 条 / " +
        Math.round(top.count / sum * 100) + "%），主要为政策解读 / 规划 / 预案类；" +
        "产业发展（" + (D.by_type.find(function (t) { return t.type === "产业发展"; }) || { count: 0 }).count +
        "）+ 乡村振兴（" + (D.by_type.find(function (t) { return t.type === "乡村振兴"; }) || { count: 0 }).count +
        "）是实质高频主题。";
      // 结论条：层级构成
      var bl = D.by_level || [];
      var lv = bl.map(function (l) { return "<b>" + l.level + "</b> " + l.count + " 条"; }).join(" · ");
      var lvCountry = (bl.find(function (l) { return l.level === "国家级"; }) || {}).count || 0;
      var lvCounty = (bl.find(function (l) { return l.level === "县级"; }) || {}).count || 0;
      this.levelNote = "共 <b>" + D.total_policy + "</b> 条 = " + lv +
        "；国家级为政策环境背景（" + lvCountry + " 条），县级为五县本地落地政策（" + lvCounty + " 条），层级映射在数据层定义、可逐级下钻至来源站点。";
      // 结论条：来源构成
      var bs = D.by_source.slice().sort(function (a, b) { return b.count - a.count; });
      var topSrc = bs[0], ctySum = (bl.find(function (l) { return l.level === "县级"; }) || { count: 0 }).count;
      this.sourceNote = "『<b>" + topSrc.source + "</b>』收录最多（" + topSrc.count + " 条），占 " +
        Math.round(topSrc.count / D.total_policy * 100) + "%；县级 5 站合计 <b>" + ctySum +
        "</b> 条，与「县域维度」页一一对应。";
      this.$nextTick(function () { self.drawCharts(); });
    },
    beforeUnmount: function () { destroyCharts(); },
methods: {
      qVal: qVal,
      qPct: qPct,
      drawCharts: function () {
        destroyCharts();
        var el1 = document.getElementById("ov-trend");
        if (el1) {
          var years = D.trend.map(function (t) { return t.year; });
          var counts = D.trend.map(function (t) { return t.count; });
          var maxI = counts.indexOf(Math.max.apply(null, counts));
          EChartsLib.make(el1, {
            animationDuration: 900, animationEasing: "cubicOut",
            grid: { left: 44, right: 24, top: 40, bottom: 30 },
            tooltip: {
              trigger: "axis", backgroundColor: NAV, borderWidth: 0,
              textStyle: { color: "#fff", fontSize: 12 },
              axisPointer: { type: "shadow", shadowStyle: { color: "rgba(63,114,175,.08)" } },
              formatter: function (ps) {
                var p = ps[0];
                return p.axisValue + " 年<br/>政策 <b>" + p.value + "</b> 条";
              }
            },
            xAxis: {
              type: "category", data: years, boundaryGap: true,
              axisTick: { show: false }, axisLine: { lineStyle: { color: "#D5DCE8" } },
              axisLabel: { color: "#6B7280", fontSize: 11.5, margin: 12 }
            },
            yAxis: {
              type: "value", minInterval: 1,
              axisLabel: { color: "#98A2B3", fontSize: 11 },
              splitLine: { lineStyle: { color: "rgba(24,39,63,.06)" } }
            },
            series: [{
              name: "政策", type: "bar", barMaxWidth: 46,
              data: counts.map(function (v, i) {
                return {
                  value: v,
                  itemStyle: i === maxI
                    ? { color: "#F59E0B", borderRadius: [8, 8, 0, 0], shadowColor: "rgba(245,158,11,.35)", shadowBlur: 8 }
                    : { color: vGrad(el1, "rgba(91,143,212,.95)", "rgba(63,114,175,.45)"), borderRadius: [8, 8, 0, 0] }
                };
              }),
              label: {
                show: true, position: "top", color: "#6B7280", fontSize: 11, fontWeight: 600,
                formatter: function (p) { return p.value >= 10 ? p.value : ""; }
              },
              markLine: {
                symbol: "none", silent: true,
                lineStyle: { type: "dashed", color: "#98A2B3", width: 1 },
                label: { color: "#98A2B3", fontSize: 10.5, formatter: "均值 {c}" },
                data: [{ type: "average" }]
              },
              markPoint: {
                symbol: "circle", symbolSize: 54, silent: true,
                itemStyle: { color: "#F59E0B" },
                label: { color: "#fff", fontSize: 10.5, fontWeight: 700, formatter: "峰值\n{c}" },
                data: [{ type: "max" }]
              }
            }]
          });
        }
        var el2 = document.getElementById("ov-type");
        if (el2) {
          var tot = D.total_policy;
          EChartsLib.make(el2, {
            animationDuration: 1000,
            tooltip: {
              trigger: "item", backgroundColor: NAV, borderWidth: 0,
              textStyle: { color: "#fff", fontSize: 12 },
              formatter: function (p) { return p.name + "：<b>" + p.value + "</b> 条（" + p.percent + "%）"; }
            },
            legend: {
              orient: "vertical", right: 16, top: "middle",
              icon: "circle", itemWidth: 9, itemHeight: 9, itemGap: 13,
              textStyle: { color: "#4B5563", fontSize: 12 },
              formatter: function (name) {
                var item = D.by_type.find(function (t) { return t.type === name; });
                return name + "  " + (item ? item.count : "");
              }
            },
            graphic: [{
              type: "text", left: "30%", top: "39%",
              style: {
                text: tot + "\n条", textAlign: "center",
                fontSize: 21, fontWeight: 700, fill: "#1F2A37", lineHeight: 25,
                backgroundColor: "rgba(255,255,255,.94)",
                padding: [8, 16], borderRadius: 10
              }
            }, {
              type: "text", left: "30%", top: "62%",
              style: { text: "政策总数", textAlign: "center", fontSize: 11.5, fill: "#98A2B3" }
            }],
            series: [{
              name: "类型", type: "pie", radius: ["56%", "76%"], center: ["30%", "50%"],
              avoidLabelOverlap: true,
              itemStyle: { borderColor: "#fff", borderWidth: 3, borderRadius: 6 },
              // C8 修复：小占比扇区的外部「%」标签会与大扇区碰撞（20% 与 59% 叠字）。
              // 右侧图例已完整给出「类目 + 条数」，此处扇区标签仅在切片足够大时显示，
              // 小于 8% 的切片不再外挂标签，改用 tooltip 查看占比，避免视觉噪声。
              label: {
                show: true,
                formatter: function (p) {
                  return p.percent >= 8 ? Math.round(p.percent) + "%" : "";
                },
                fontSize: 10.5, color: "#6B7280", lineHeight: 14
              },
              minAngle: 4,
              labelLine: { show: true, length: 10, length2: 6, lineStyle: { color: "#C3CCDB" } },
              emphasis: { scale: true, scaleSize: 7 },
              data: D.by_type.map(function (t, i) {
                return {
                  name: t.type, value: t.count,
                  itemStyle: {
                    color: i === 0 ? PALETTE[i] : PALETTE[i],
                    shadowBlur: t.type === "综合政务" ? 0 : 0
                  }
                };
              })
            }]
          });
        }
        // 政策层级构成（donut，tooltip 下钻来源）
        var el3 = document.getElementById("ov-level");
        if (el3 && D.by_level && D.by_level.length) {
          var lvTot = D.by_level.reduce(function (a, l) { return a + l.count; }, 0);
          var LV_COLORS = { "国家级": "#3F72AF", "省级": "#10B981", "县级": "#F59E0B" };
          EChartsLib.make(el3, {
            animationDuration: 1000,
            tooltip: {
              trigger: "item", backgroundColor: NAV, borderWidth: 0,
              textStyle: { color: "#fff", fontSize: 12 },
              formatter: function (p) {
                var l = D.by_level.find(function (x) { return x.level === p.name; });
                var det = l ? l.sources.map(function (sx) { return sx.name + " " + sx.count; }).join(" + ") : "";
                return p.name + "：<b>" + p.value + "</b> 条（" + p.percent + "%）<br/><span style=\"font-size:11px;opacity:.8;\">" + det + "</span>";
              }
            },
            legend: {
              orient: "vertical", right: 14, top: "middle",
              icon: "circle", itemWidth: 9, itemHeight: 9, itemGap: 14,
              textStyle: { color: "#4B5563", fontSize: 12 },
              formatter: function (name) {
                var l = D.by_level.find(function (x) { return x.level === name; });
                return name + "  " + (l ? l.count : "");
              }
            },
            graphic: [{
              type: "text", left: "26%", top: "36%",
              style: {
                text: lvTot + "\n条", textAlign: "center",
                fontSize: 21, fontWeight: 700, fill: "#1F2A37", lineHeight: 25,
                backgroundColor: "rgba(255,255,255,.94)",
                padding: [8, 16], borderRadius: 10
              }
            }, {
              type: "text", left: "26%", top: "60%",
              style: { text: "政策总数", textAlign: "center", fontSize: 11.5, fill: "#98A2B3" }
            }],
            series: [{
              name: "层级", type: "pie", radius: ["54%", "74%"], center: ["26%", "50%"],
              avoidLabelOverlap: true,
              itemStyle: { borderColor: "#fff", borderWidth: 3, borderRadius: 6 },
              label: {
                show: true,
                formatter: function (p) { return Math.round(p.percent) + "%"; },
                fontSize: 10.5, color: "#6B7280", lineHeight: 14
              },
              labelLine: { length: 12, length2: 8, lineStyle: { color: "#C3CCDB" } },
              emphasis: { scale: true, scaleSize: 7 },
              data: D.by_level.map(function (l) {
                return {
                  name: l.level, value: l.count,
                  itemStyle: { color: LV_COLORS[l.level] || "#8B5CF6" }
                };
              })
            }]
          });
        }
        // 政策来源构成（横向条形，top 9）
        var el4 = document.getElementById("ov-source");
        if (el4 && D.by_source && D.by_source.length) {
          var srcs = D.by_source.slice().sort(function (a, b) { return b.count - a.count; }).slice(0, 9);
          EChartsLib.make(el4, {
            animationDuration: 1000,
            grid: { left: 8, right: 44, top: 10, bottom: 8, containLabel: true },
            tooltip: {
              trigger: "axis", backgroundColor: NAV, borderWidth: 0,
              textStyle: { color: "#fff", fontSize: 12 },
              axisPointer: { type: "shadow", shadowStyle: { color: "rgba(63,114,175,.08)" } },
              formatter: function (ps) {
                var p = ps[0];
                return p.name + "：<b>" + p.value + "</b> 条";
              }
            },
            xAxis: {
              type: "value", minInterval: 1,
              axisLabel: { color: "#98A2B3", fontSize: 11 },
              splitLine: { lineStyle: { color: "rgba(24,39,63,.06)" } }
            },
            yAxis: {
              type: "category", data: srcs.map(function (x) { return x.source; }).reverse(),
              axisTick: { show: false }, axisLine: { show: false },
              axisLabel: { color: "#4B5563", fontSize: 11.5 }
            },
            series: [{
              name: "政策", type: "bar", barMaxWidth: 16,
              label: {
                show: true, position: "right", color: "#6B7280", fontSize: 10.5, fontWeight: 600,
                formatter: function (p) { return p.value; }
              },
              itemStyle: { color: hGrad(el4, "rgba(91,143,212,.95)", "rgba(63,114,175,.45)"), borderRadius: [0, 7, 7, 0] },
              data: srcs.map(function (x) { return x.count; }).reverse()
            }]
          });
        }
      }
    },
    template:
      '<div>' +
      '  <div class="grid grid-4">' +
      '    <KpiCard label="政策记录" :value="D.total_policy" unit="条" :sub="\'国家/省/县三级口径 · 原文链接 <b>\' + qPct(D.quality && D.quality.link_checked_rate) + \'</b> 可追溯\'" :icon="ICO.doc" tone="rgba(63,114,175,.10)" color="#3F72AF"/>' +
      '    <KpiCard label="招商项目" :value="D.total_project" unit="个" sub="省农业农村厅「招商项目」栏目" :icon="ICO.project" tone="rgba(16,185,129,.10)" color="#10B981"/>' +
      '    <KpiCard label="覆盖县域" :value="D.counties.length" unit="个" sub="徐闻 · 阳西 · 高州 · 遂溪 · 阳春" :icon="ICO.map" tone="rgba(139,92,246,.10)" color="#8B5CF6"/>' +
      '    <KpiCard label="数据质量" :value="qVal(D.quality && D.quality.required_fill_rate)" unit="%" :sub="\'必填缺失 <b>\' + ((D.quality && D.quality.missing_required) || 0) + \'</b> · 类型覆盖 \' + ((D.quality && D.quality.type_main_covered) || \'—\')" :icon="ICO.shield" tone="rgba(245,158,11,.10)" color="#F59E0B"/>' +
      '  </div>' +
      '  <div class="grid grid-2" style="margin-top:18px;">' +
      '    <div class="card">' +
      '      <div class="card-hd"><h3>政策数量年度趋势</h3><span class="more">2020 – 2026</span></div>' +
      '      <div class="card-bd">' +
      '        <div class="chart-note" v-html="trendNote"></div>' +
      '        <div class="chart-box"><div class="sk skeleton" style="position:absolute;inset:0;z-index:2;"></div><div id="ov-trend" style="width:100%;height:300px;"></div></div>' +
      '      </div>' +
      '    </div>' +
      '    <div class="card">' +
      '      <div class="card-hd"><h3>政策类型分布</h3><span class="more">关键词规则初标 · 人工复核中</span></div>' +
      '      <div class="card-bd">' +
      '        <div class="chart-note" v-html="typeNote"></div>' +
      '        <div class="chart-box"><div class="sk skeleton" style="position:absolute;inset:0;z-index:2;"></div><div id="ov-type" style="width:100%;height:300px;"></div></div>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      '  <div class="grid grid-2" style="margin-top:18px;">' +
      '    <div class="card">' +
      '      <div class="card-hd"><h3>政策层级构成</h3><span class="more">国家 / 省 / 县 三级</span></div>' +
      '      <div class="card-bd">' +
      '        <div class="chart-note" v-html="levelNote"></div>' +
      '        <div class="chart-box"><div class="sk skeleton" style="position:absolute;inset:0;z-index:2;"></div><div id="ov-level" style="width:100%;height:270px;"></div></div>' +
      '      </div>' +
      '    </div>' +
      '    <div class="card">' +
      '      <div class="card-hd"><h3>政策来源构成</h3><span class="more">top 9 来源站点</span></div>' +
      '      <div class="card-bd">' +
      '        <div class="chart-note" v-html="sourceNote"></div>' +
      '        <div class="chart-box"><div class="sk skeleton" style="position:absolute;inset:0;z-index:2;"></div><div id="ov-source" style="width:100%;height:270px;"></div></div>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      '  <div class="grid" style="margin-top:18px;">' +
      '    <div class="card">' +
      '      <div class="card-hd"><h3>最新政策</h3><a class="more" href="#/policy">进入政策分析 →</a></div>' +
      '      <div class="card-bd"><ul class="mini-list">' +
      '        <li v-for="p in latest" :key="p.source_url">' +
      '          <span class="dt">{{ (p.publish_date || "").slice(0,10) }}</span>' +
      '          <span class="tt"><a :href="p.source_url" target="_blank" rel="noopener">{{ p.title }}</a></span>' +
      '          <span class="badge type" style="flex-shrink:0;">{{ p.policy_type_main }}</span>' +
      '        </li>' +
      '      </ul></div>' +
      '    </div>' +
      '  </div>' +
      '</div>'
  };

  /* ================= 2. 政策分析 ================= */
  var PolicyView = {
    data: function () {
      return {
        D: D,
        kw: "", type: "", year: "",
        page: 1, size: 10,
        sortKey: "publish_date", sortDir: -1
      };
    },
    computed: {
      typeOptions: function () {
        var s = [{ type: "全部类型", count: D.total_policy }];
        return s.concat(D.by_type.slice());
      },
      yearOptions: function () {
        return D.trend.slice().reverse();
      },
      filtered: function () {
        var self = this;
        var kw = this.kw.trim().toLowerCase();
        return D.policies.filter(function (p) {
          if (self.type && p.policy_type_main !== self.type) return false;
          if (self.year && (p.publish_date || "").slice(0, 4) !== self.year) return false;
          if (kw) {
            var hay = ((p.title || "") + " " + (p.summary || "") + " " + (p.publisher || "")).toLowerCase();
            if (hay.indexOf(kw) < 0) return false;
          }
          return true;
        });
      },
      sorted: function () {
        var self = this;
        var arr = this.filtered.slice();
        arr.sort(function (a, b) {
          var va = a[self.sortKey] || "", vb = b[self.sortKey] || "";
          return String(va).localeCompare(String(vb), "zh-Hans-CN") * self.sortDir;
        });
        return arr;
      },
      paged: function () {
        var start = (this.page - 1) * this.size;
        return this.sorted.slice(start, start + this.size);
      },
      totalPages: function () {
        return Math.max(1, Math.ceil(this.sorted.length / this.size));
      },
      filteredByType: function () {
        var m = {};
        this.filtered.forEach(function (p) {
          var t = p.policy_type_main || "未分类";
          m[t] = (m[t] || 0) + 1;
        });
        return Object.keys(m).map(function (k) { return { type: k, count: m[k] }; })
          .sort(function (a, b) { return b.count - a.count; });
      },
      filteredByPub: function () {
        var m = {};
        this.filtered.forEach(function (p) {
          var t = p.publisher || "未知";
          m[t] = (m[t] || 0) + 1;
        });
        return Object.keys(m).map(function (k) { return { publisher: k, count: m[k] }; })
          .sort(function (a, b) { return b.count - a.count; }).slice(0, 8);
      },
      typeNote: function () {
        var fd = this.filteredByType;
        if (!fd.length) return "当前筛选无命中。";
        var top = fd[0];
        var pct = Math.round(top.count / this.filtered.length * 100);
        return "当前筛选命中 <b>" + this.filtered.length + "</b> 条 · 『<b>" + top.type +
          "</b>』占比最高（" + top.count + " 条 / " + pct + "%）";
      },
      pubNote: function () {
        var fp = this.filteredByPub;
        if (!fp.length) return "";
        return "『<b>" + fp[0].publisher + "</b>』发文最多（" + fp[0].count + " 条）" +
          (fp[1] ? "，其次 " + fp[1].publisher + "（" + fp[1].count + " 条）" : "");
      }
    },
    watch: {
      kw: function () { this.page = 1; this.scheduleRedraw(); },
      type: function () { this.page = 1; this.scheduleRedraw(); },
      year: function () { this.page = 1; this.scheduleRedraw(); }
    },
    mounted: function () {
      var self = this;
      // 结论条：层级构成
      var bl = D.by_level || [];
      var lv = bl.map(function (l) { return "<b>" + l.level + "</b> " + l.count + " 条"; }).join(" · ");
      var lvCountry = (bl.find(function (l) { return l.level === "国家级"; }) || {}).count || 0;
      var lvCounty = (bl.find(function (l) { return l.level === "县级"; }) || {}).count || 0;
      this.levelNote = "共 <b>" + D.total_policy + "</b> 条 = " + lv +
        "；国家级为政策环境背景（" + lvCountry + " 条），县级为五县本地落地政策（" + lvCounty + " 条），层级映射在数据层定义、可逐级下钻至来源站点。";
      // 结论条：来源构成
      var bs = D.by_source.slice().sort(function (a, b) { return b.count - a.count; });
      var topSrc = bs[0], ctySum = (bl.find(function (l) { return l.level === "县级"; }) || { count: 0 }).count;
      this.sourceNote = "『<b>" + topSrc.source + "</b>』收录最多（" + topSrc.count + " 条），占 " +
        Math.round(topSrc.count / D.total_policy * 100) + "%；县级 5 站合计 <b>" + ctySum +
        "</b> 条，与「县域维度」页一一对应。";
      this.$nextTick(function () { self.drawCharts(); });
    },
    beforeUnmount: function () { destroyCharts(); },
methods: {
      qVal: qVal,
      qPct: qPct,
      sortBy: function (key) {
        if (this.sortKey === key) { this.sortDir = -this.sortDir; }
        else { this.sortKey = key; this.sortDir = -1; }
      },
      sortIcon: function (key) {
        if (this.sortKey !== key) return "";
        return this.sortDir < 0 ? "↓" : "↑";
      },
      goPage: function (p) {
        if (p < 1 || p > this.totalPages) return;
        this.page = p;
      },
      pageNums: function () {
        var total = this.totalPages, cur = this.page, arr = [];
        var s = Math.max(1, cur - 2), e = Math.min(total, cur + 2);
        for (var i = s; i <= e; i++) arr.push(i);
        return arr;
      },
      _timer: null,
      scheduleRedraw: function () {
        var self = this;
        if (this._timer) clearTimeout(this._timer);
        this._timer = setTimeout(function () { self.drawCharts(); }, 120);
      },
      drawCharts: function () {
        destroyCharts();
        var fd = this.filteredByType, fp = this.filteredByPub;
        var el1 = document.getElementById("pl-type");
        if (el1) {
          var tot = this.filtered.length;
          EChartsLib.make(el1, {
            animationDuration: 700,
            tooltip: {
              trigger: "item", backgroundColor: NAV, borderWidth: 0,
              textStyle: { color: "#fff", fontSize: 12 },
              formatter: function (p) { return p.name + "：<b>" + p.value + "</b> 条（" + p.percent + "%）"; }
            },
            legend: {
              bottom: 2, icon: "circle", itemWidth: 9, itemHeight: 9, itemGap: 14,
              textStyle: { color: "#4B5563", fontSize: 11.5 }
            },
            graphic: tot ? [{
              type: "text", left: "50%", top: "36%",
              style: {
                text: String(tot) + "\n条", textAlign: "center",
                fontSize: 21, fontWeight: 700, fill: "#1F2A37", lineHeight: 25,
                backgroundColor: "rgba(255,255,255,.94)",
                padding: [8, 16], borderRadius: 10
              }
            }] : [],
            series: [{
              name: "类型", type: "pie", radius: ["52%", "70%"], center: ["50%", "44%"],
              itemStyle: { borderColor: "#fff", borderWidth: 2.5, borderRadius: 5 },
              label: {
                show: true,
                formatter: function (p) { return Math.round(p.percent) + "%"; },
                fontSize: 10, color: "#6B7280"
              },
              minAngle: 4,
              labelLine: { length: 10, length2: 6, lineStyle: { color: "#C3CCDB" } },
              emphasis: { scale: true, scaleSize: 6 },
              data: fd.length
                ? fd.map(function (t, i) { return { name: t.type, value: t.count, itemStyle: { color: PALETTE[i % PALETTE.length] } }; })
                : [{ name: "无数据", value: 1, itemStyle: { color: "#E5E9F0" } }]
            }]
          });
        }
        var el2 = document.getElementById("pl-pub");
        if (el2) {
          var names = fp.map(function (t) { return t.publisher || "未知"; });
          var maxPub = fp.length ? fp[0].count : 0;
          EChartsLib.make(el2, {
            animationDuration: 700,
            grid: { left: 8, right: 40, top: 10, bottom: 16, containLabel: true },
            tooltip: {
              trigger: "axis", backgroundColor: NAV, borderWidth: 0,
              textStyle: { color: "#fff", fontSize: 12 },
              axisPointer: { type: "shadow" },
              formatter: function (ps) {
                var p = ps[0];
                return p.name + "：<b>" + p.value + "</b> 条";
              }
            },
            xAxis: {
              type: "value", minInterval: 1,
              axisLabel: { color: "#98A2B3", fontSize: 10.5 },
              splitLine: { lineStyle: { color: "rgba(24,39,63,.06)" } }
            },
            yAxis: {
              type: "category", data: names,
              axisTick: { show: false }, axisLine: { show: false },
              axisLabel: {
                color: "#4B5563", fontSize: 12, interval: 0,
                formatter: function (name) {
                  if (name.length <= 6) return name;
                  var out = [];
                  for (var i = 0; i < name.length; i += 6) out.push(name.slice(i, i + 6));
                  return out.join("\n");
                }
              }
            },
            series: [{
              name: "政策数", type: "bar", barMaxWidth: 20,
              label: {
                show: true, position: "right", fontWeight: 600, fontSize: 11.5,
                color: "#3F72AF",
                formatter: function (p) { return p.value; }
              },
              data: fp.map(function (t) {
                return {
                  value: t.count,
                  itemStyle: t.count === maxPub
                    ? { color: "#F59E0B", borderRadius: [0, 5, 5, 0] }
                    : { color: hGrad(el2, "rgba(63,114,175,.95)", "rgba(91,143,212,.55)"), borderRadius: [0, 5, 5, 0] }
                };
              })
            }]
          });
        }
        // 政策层级构成（donut，tooltip 下钻来源）
        var el3 = document.getElementById("ov-level");
        if (el3 && D.by_level && D.by_level.length) {
          var lvTot = D.by_level.reduce(function (a, l) { return a + l.count; }, 0);
          var LV_COLORS = { "国家级": "#3F72AF", "省级": "#10B981", "县级": "#F59E0B" };
          EChartsLib.make(el3, {
            animationDuration: 1000,
            tooltip: {
              trigger: "item", backgroundColor: NAV, borderWidth: 0,
              textStyle: { color: "#fff", fontSize: 12 },
              formatter: function (p) {
                var l = D.by_level.find(function (x) { return x.level === p.name; });
                var det = l ? l.sources.map(function (sx) { return sx.name + " " + sx.count; }).join(" + ") : "";
                return p.name + "：<b>" + p.value + "</b> 条（" + p.percent + "%）<br/><span style=\"font-size:11px;opacity:.8;\">" + det + "</span>";
              }
            },
            legend: {
              orient: "vertical", right: 14, top: "middle",
              icon: "circle", itemWidth: 9, itemHeight: 9, itemGap: 14,
              textStyle: { color: "#4B5563", fontSize: 12 },
              formatter: function (name) {
                var l = D.by_level.find(function (x) { return x.level === name; });
                return name + "  " + (l ? l.count : "");
              }
            },
            graphic: [{
              type: "text", left: "26%", top: "36%",
              style: {
                text: lvTot + "\n条", textAlign: "center",
                fontSize: 21, fontWeight: 700, fill: "#1F2A37", lineHeight: 25,
                backgroundColor: "rgba(255,255,255,.94)",
                padding: [8, 16], borderRadius: 10
              }
            }, {
              type: "text", left: "26%", top: "60%",
              style: { text: "政策总数", textAlign: "center", fontSize: 11.5, fill: "#98A2B3" }
            }],
            series: [{
              name: "层级", type: "pie", radius: ["54%", "74%"], center: ["26%", "50%"],
              avoidLabelOverlap: true,
              itemStyle: { borderColor: "#fff", borderWidth: 3, borderRadius: 6 },
              label: {
                show: true,
                formatter: function (p) { return Math.round(p.percent) + "%"; },
                fontSize: 10.5, color: "#6B7280", lineHeight: 14
              },
              labelLine: { length: 12, length2: 8, lineStyle: { color: "#C3CCDB" } },
              emphasis: { scale: true, scaleSize: 7 },
              data: D.by_level.map(function (l) {
                return {
                  name: l.level, value: l.count,
                  itemStyle: { color: LV_COLORS[l.level] || "#8B5CF6" }
                };
              })
            }]
          });
        }
        // 政策来源构成（横向条形，top 9）
        var el4 = document.getElementById("ov-source");
        if (el4 && D.by_source && D.by_source.length) {
          var srcs = D.by_source.slice().sort(function (a, b) { return b.count - a.count; }).slice(0, 9);
          EChartsLib.make(el4, {
            animationDuration: 1000,
            grid: { left: 8, right: 44, top: 10, bottom: 8, containLabel: true },
            tooltip: {
              trigger: "axis", backgroundColor: NAV, borderWidth: 0,
              textStyle: { color: "#fff", fontSize: 12 },
              axisPointer: { type: "shadow", shadowStyle: { color: "rgba(63,114,175,.08)" } },
              formatter: function (ps) {
                var p = ps[0];
                return p.name + "：<b>" + p.value + "</b> 条";
              }
            },
            xAxis: {
              type: "value", minInterval: 1,
              axisLabel: { color: "#98A2B3", fontSize: 11 },
              splitLine: { lineStyle: { color: "rgba(24,39,63,.06)" } }
            },
            yAxis: {
              type: "category", data: srcs.map(function (x) { return x.source; }).reverse(),
              axisTick: { show: false }, axisLine: { show: false },
              axisLabel: { color: "#4B5563", fontSize: 11.5 }
            },
            series: [{
              name: "政策", type: "bar", barMaxWidth: 16,
              label: {
                show: true, position: "right", color: "#6B7280", fontSize: 10.5, fontWeight: 600,
                formatter: function (p) { return p.value; }
              },
              itemStyle: { color: hGrad(el4, "rgba(91,143,212,.95)", "rgba(63,114,175,.45)"), borderRadius: [0, 7, 7, 0] },
              data: srcs.map(function (x) { return x.count; }).reverse()
            }]
          });
        }
      }
    },
    template:
      '<div>' +
      '  <div class="filter-bar">' +
      '    <div class="f-item"><label>类型</label>' +
      '      <select v-model="type">' +
      '        <option v-for="t in typeOptions" :value="t.type === \'全部类型\' ? \'\' : t.type">{{ t.type }}（{{ t.count }}）</option>' +
      '      </select></div>' +
      '    <div class="f-item"><label>年份</label>' +
      '      <select v-model="year">' +
      '        <option value="">全部年份</option>' +
      '        <option v-for="y in yearOptions" :value="y.year">{{ y.year }} 年（{{ y.count }}）</option>' +
      '      </select></div>' +
      '    <div class="f-item"><label>关键词</label>' +
      '      <input v-model="kw" placeholder="标题 / 摘要 / 机构 检索…" /></div>' +
      '    <div class="f-item" style="margin-left:auto;color:#6B7280;font-size:12.5px;">当前命中 <b style="color:#3F72AF;">{{ filtered.length }}</b> 条</div>' +
      '  </div>' +
      '  <div class="grid grid-2">' +
      '    <div class="card">' +
      '      <div class="card-hd"><h3>类型分布（当前筛选）</h3></div>' +
      '      <div class="card-bd">' +
      '        <div class="chart-note" v-html="typeNote"></div>' +
      '        <div class="chart-box h-sm"><div class="sk skeleton" style="position:absolute;inset:0;z-index:2;"></div><div id="pl-type" style="width:100%;height:240px;"></div></div>' +
      '      </div>' +
      '    </div>' +
      '    <div class="card">' +
      '      <div class="card-hd"><h3>发布机构 TOP（当前筛选）</h3></div>' +
      '      <div class="card-bd">' +
      '        <div class="chart-note" v-html="pubNote"></div>' +
      '        <div class="chart-box h-sm"><div class="sk skeleton" style="position:absolute;inset:0;z-index:2;"></div><div id="pl-pub" style="width:100%;height:240px;"></div></div>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      '  <div class="card" style="margin-top:18px;">' +
      '    <div class="card-hd"><h3>政策明细（{{ sorted.length }} 条）</h3><span class="more">点击表头排序 · 分页浏览</span></div>' +
      '    <div class="card-bd" style="padding:8px 8px 12px;">' +
      '      <div class="table-wrap"><table class="dtable">' +
      '        <thead><tr>' +
      '          <th style="width:40px;">#</th>' +
      '          <th @click="sortBy(\'title\')">标题 <span class="arr">{{ sortIcon("title") }}</span></th>' +
      '          <th @click="sortBy(\'policy_type_main\')">类型 <span class="arr">{{ sortIcon("policy_type_main") }}</span></th>' +
      '          <th @click="sortBy(\'publisher\')">发布机构 <span class="arr">{{ sortIcon("publisher") }}</span></th>' +
      '          <th @click="sortBy(\'publish_date\')">发布日期 <span class="arr">{{ sortIcon("publish_date") }}</span></th>' +
      '          <th>县域指向</th>' +
      '        </tr></thead>' +
      '        <tbody>' +
      '          <tr v-for="(p, i) in paged" :key="p.source_url">' +
      '            <td style="color:#98A2B3;">{{ (page-1)*size + i + 1 }}</td>' +
      '            <td><span class="t-trunc" style="max-width:420px;"><a class="t-link" :href="p.source_url" target="_blank" rel="noopener" :title="p.title">{{ p.title }}</a></span></td>' +
      '            <td><span class="badge type">{{ p.policy_type_main || "未分类" }}</span></td>' +
      '            <td style="color:#6B7280;">{{ p.publisher || "—" }}</td>' +
      '            <td><span class="badge date">{{ (p.publish_date || "—").slice(0,10) }}</span></td>' +
      '            <td><span class="badge county">{{ p.related_counties || "—" }}</span></td>' +
      '          </tr>' +
      '        </tbody>' +
      '      </table></div>' +
      '      <div class="empty" v-if="!paged.length">未命中任何政策，请调整筛选条件。</div>' +
      '      <div class="pager" v-if="sorted.length">' +
      '        <span>共 {{ sorted.length }} 条 · 第 {{ page }}/{{ totalPages }} 页</span>' +
      '        <div class="pg">' +
      '          <button :disabled="page<=1" @click="goPage(page-1)">上一页</button>' +
      '          <button v-for="n in pageNums()" :key="n" :class="{on: n===page}" @click="goPage(n)">{{ n }}</button>' +
      '          <button :disabled="page>=totalPages" @click="goPage(page+1)">下一页</button>' +
      '        </div>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      '</div>'
  };

  /* ================= 3. 县域维度 ================= */
  var CountyView = {
    data: function () {
      return {
        D: D,
        cards: [
          { name: "遂溪县", city: "湛江市", industry: "火龙果 · 北运菜产业", count: 0, img: "suixi", tag: "火龙果" },
          { name: "阳西县", city: "阳江市", industry: "海洋渔业 · 调味品产业", count: 0, img: "yangxi", tag: "海洋渔业" },
          { name: "徐闻县", city: "湛江市", industry: "菠萝产业 · 中国菠萝之乡", count: 0, img: "xuwen", tag: "菠萝之乡" },
          { name: "阳春市", city: "阳江市", industry: "春砂仁南药 · 鳜鱼产业", count: 0, img: "yangchun", tag: "南药之乡" },
          { name: "高州市", city: "茂名市", industry: "荔枝龙眼产业 · 中国荔乡", count: 0, img: "gaozhou", tag: "中国荔乡" }
        ],
        coverNote: "", observeNote: ""
      };
    },
    created: function () {
      var self = this;
      this.cards.forEach(function (c) {
        var m = D.by_county.find(function (x) { return x.county === c.name; });
        c.count = m ? m.count : 0;
      });
    },
    mounted2: null,
    computed: {
      countyPolicies: function () {
        var self = this;
        return this.cards.map(function (c) {
          return {
            county: c.name,
            list: D.policies.filter(function (p) { return (p.related_counties || "").indexOf(c.name) >= 0; })
              .sort(function (a, b) { return (b.publish_date || "").localeCompare(a.publish_date || ""); })
              .slice(0, 4)
          };
        });
      }
    },
    mounted: function () {
      var self = this;
      // 结论条：层级构成
      var bl = D.by_level || [];
      var lv = bl.map(function (l) { return "<b>" + l.level + "</b> " + l.count + " 条"; }).join(" · ");
      var lvCountry = (bl.find(function (l) { return l.level === "国家级"; }) || {}).count || 0;
      var lvCounty = (bl.find(function (l) { return l.level === "县级"; }) || {}).count || 0;
      this.levelNote = "共 <b>" + D.total_policy + "</b> 条 = " + lv +
        "；国家级为政策环境背景（" + lvCountry + " 条），县级为五县本地落地政策（" + lvCounty + " 条），层级映射在数据层定义、可逐级下钻至来源站点。";
      // 结论条：来源构成
      var bs = D.by_source.slice().sort(function (a, b) { return b.count - a.count; });
      var topSrc = bs[0], ctySum = (bl.find(function (l) { return l.level === "县级"; }) || { count: 0 }).count;
      this.sourceNote = "『<b>" + topSrc.source + "</b>』收录最多（" + topSrc.count + " 条），占 " +
        Math.round(topSrc.count / D.total_policy * 100) + "%；县级 5 站合计 <b>" + ctySum +
        "</b> 条，与「县域维度」页一一对应。";
      // C7: 覆盖对比与县域观察动态文案
      var bc = D.by_county.slice().sort(function (a, b) { return b.count - a.count; });
      var t1 = bc[0], t2 = bc[1], last = bc[bc.length - 1];
      this.coverNote = "『<b>" + t1.county + "</b>』收录最多（" + t1.count + " 条）、<b>" + t2.county + "</b>（" + t2.count +
        " 条）次之；<b>" + last.county + " " + last.count + " 条</b>受政府门户栏目结构限制（仅首页列表可解析），已在采集口径中如实标注。";
      this.observeNote = t1.county + "、" + t2.county + "收录相对充分，可检索到<b style=\"color:#1F2A37;\">数字政府建设规划、菠萝产业、海洋牧场、乡村振兴金融</b>等主题政策，是「县域数字政务 + 农业数字化」叙事的核心素材。";
      this.$nextTick(function () { self.drawCharts(); });
    },
    beforeUnmount: function () { destroyCharts(); },
methods: {
      qVal: qVal,
      qPct: qPct,
      drawCharts: function () {
        destroyCharts();
        var el = document.getElementById("ct-bar");
        if (!el) return;
        var bc = D.by_county.slice().sort(function (a, b) { return b.count - a.count; });
        var names = bc.map(function (c) { return c.county; });
        EChartsLib.make(el, {
          animationDuration: 900,
          grid: { left: 44, right: 24, top: 40, bottom: 28 },
          tooltip: {
            trigger: "axis", backgroundColor: NAV, borderWidth: 0,
            textStyle: { color: "#fff", fontSize: 12 },
            axisPointer: { type: "shadow" },
            formatter: function (ps) {
              var p = ps[0];
              return p.name + "：<b>" + p.value + "</b> 条";
            }
          },
          xAxis: {
            type: "category", data: names,
            axisTick: { show: false }, axisLine: { lineStyle: { color: "#D5DCE8" } },
            axisLabel: { color: "#4B5563", fontSize: 12.5, margin: 12 }
          },
          yAxis: {
            type: "value", minInterval: 1,
            axisLabel: { color: "#98A2B3", fontSize: 11 },
            splitLine: { lineStyle: { color: "rgba(24,39,63,.06)" } }
          },
          series: [{
            name: "政策数", type: "bar", barMaxWidth: 64,
            label: {
              show: true, position: "top", fontWeight: 700, fontSize: 13,
              color: "#1F2A37",
              formatter: function (p) { return p.value; }
            },
            data: bc.map(function (c, i) {
              var low = c.count === Math.min.apply(null, bc.map(function (x) { return x.count; }));
              return {
                value: c.count,
                itemStyle: low
                  ? { color: "#C3CCDB", borderRadius: [8, 8, 0, 0] }
                  : { color: vGrad(el, "#5B8FD4", "#3F72AF"), borderRadius: [8, 8, 0, 0] }
              };
            }),
            markLine: {
              symbol: "none", silent: true,
              lineStyle: { type: "dashed", color: "#98A2B3", width: 1 },
              label: { color: "#98A2B3", fontSize: 10.5, formatter: "均值 {c}" },
              data: [{ type: "average" }]
            }
          }]
        });
      }
    },
    template:
      '<div>' +
      '  <div class="grid grid-3" style="grid-template-columns:repeat(auto-fit,minmax(210px,1fr));">' +
      '    <div class="county-card" v-for="c in cards" :key="c.name">' +
      '      <div class="county-cover" :style="{\'--bg\': \'url(assets/counties/\' + c.img + \'.jpg)\'}">' +
      '        <span class="cc-tag">{{ c.tag }}</span>' +
'        <div class="cc-title"><b>{{ c.name }}</b><span>{{ c.city }}</span></div>' +
      '      </div>' +
      '      <div class="county-body">' +
      '        <div class="row"><span class="k">特色产业</span><span class="v">{{ c.industry }}</span></div>' +
      '        <div class="row"><span class="k">收录政策</span><span class="v">{{ c.count }} 条</span></div>' +
      '        <div class="row"><span class="k">数据源</span><span class="v" style="font-weight:400;">政府门户政务公开栏目</span></div>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      '  <div class="grid grid-2" style="margin-top:18px;">' +
      '    <div class="card">' +
      '      <div class="card-hd"><h3>县域政策覆盖对比</h3><span class="more">按 related_counties 字段统计</span></div>' +
      '      <div class="card-bd">' +
      '        <div class="chart-note" v-html="coverNote"></div>' +
      '        <div class="chart-box h-sm"><div class="sk skeleton" style="position:absolute;inset:0;z-index:2;"></div><div id="ct-bar" style="width:100%;height:240px;"></div></div>' +
      '      </div>' +
      '    </div>' +
      '    <div class="card">' +
      '      <div class="card-hd"><h3>县域观察</h3></div>' +
      '      <div class="card-bd"><p style="font-size:13px;color:#6B7280;line-height:1.9;" v-html="observeNote"></p></div>' +
      '    </div>' +
      '  </div>' +
      '  <div class="grid" style="margin-top:18px;" v-for="cp in countyPolicies" :key="cp.county">' +
      '    <div class="card">' +
      '      <div class="card-hd"><h3>{{ cp.county }} · 重点政策</h3><a class="more" href="#/policy">查看全部 →</a></div>' +
      '      <div class="card-bd"><ul class="mini-list">' +
      '        <li v-for="p in cp.list" :key="p.source_url">' +
      '          <span class="dt">{{ (p.publish_date || "").slice(0,10) }}</span>' +
      '          <span class="tt"><a :href="p.source_url" target="_blank" rel="noopener">{{ p.title }}</a></span>' +
      '          <span class="badge type" style="flex-shrink:0;">{{ p.policy_type_main }}</span>' +
      '        </li>' +
      '        <li v-if="!cp.list.length"><span class="tt" style="color:#98A2B3;">该县暂无可展示政策</span></li>' +
      '      </ul></div>' +
      '    </div>' +
      '  </div>' +
      '</div>'
  };

  /* ================= 4. 招商项目 ================= */
  var ProjectView = {
    data: function () {
      return { D: D, ICO: ICO, kw: "", page: 1, size: 10, sortKey: "date", sortDir: -1 };
    },
    computed: {
      latestDate: function () {
        var ds = D.project_sample.map(function (p) { return p.date || ""; }).filter(Boolean).sort();
        return ds.length ? ds[ds.length - 1] : "—";
      },
      filtered: function () {
        var kw = this.kw.trim().toLowerCase();
        var arr = D.project_sample.filter(function (p) {
          if (!kw) return true;
          return ((p.name || "") + " " + (p.county || "") + " " + (p.industry || ""))
            .toLowerCase().indexOf(kw) >= 0;
        });
        var self = this;
        arr.sort(function (a, b) {
          var va = a[self.sortKey] || "", vb = b[self.sortKey] || "";
          return String(va).localeCompare(String(vb), "zh-Hans-CN") * self.sortDir;
        });
        return arr;
      },
      // 项目覆盖的县域数（字典 §4 county_name 打标结果）
      projectCountyCount: function () {
        var set = {};
        D.project_sample.forEach(function (p) { if (p.county) set[p.county] = 1; });
        return Object.keys(set).length;
      },
      // 县域分布（含「未标注」）：用于项目页底部明细，避免大屏下方留白
      countyDist: function () {
        var m = {}, order = [];
        D.project_sample.forEach(function (p) {
          var k = p.county || "未标注";
          if (!m[k]) { m[k] = 0; order.push(k); }
          m[k]++;
        });
        var total = D.project_sample.length || 1;
        return order
          .map(function (k) {
            var c = m[k];
            return {
              name: k, count: c,
              ratio: c / total,
              ratioText: (c / total * 100).toFixed(1) + "%",
              ratioCountText: c + " 个 · " + (c / total * 100).toFixed(1) + "%",
              unmarked: k === "未标注"
            };
          })
          .sort(function (a, b) {
            if (a.unmarked !== b.unmarked) return a.unmarked ? 1 : -1;
            return b.count - a.count;
          });
      },
      // 产业领域分布
      industryDist: function () {
        var m = {}, order = [];
        D.project_sample.forEach(function (p) {
          var k = p.industry || "未识别";
          if (!m[k]) { m[k] = 0; order.push(k); }
          m[k]++;
        });
        var total = D.project_sample.length || 1;
        return order
          .map(function (k) {
            var c = m[k];
            return {
              name: k, count: c,
              ratio: c / total,
              ratioText: (c / total * 100).toFixed(1) + "%",
              unmarked: k === "未识别"
            };
          })
          .sort(function (a, b) {
            if (a.unmarked !== b.unmarked) return a.unmarked ? 1 : -1;
            return b.count - a.count;
          });
      },
      // 所有计算在 computed 内完成（纯 JS 值），模板只做插值，不传对象进方法。
      paged: function () {
        var s = (this.page - 1) * this.size;
        return this.filtered.slice(s, s + this.size);
      },
      totalPages: function () { return Math.max(1, Math.ceil(this.filtered.length / this.size)); }
    },
    watch: {
      kw: function () { this.page = 1; }
    },
methods: {
      qVal: qVal,
      qPct: qPct,
      // 宽度样式：接收纯字符串（如 "23.4%"/"0px"），避免把响应式对象传进方法触发
      // "Cannot convert object to primitive value"。0 值回退 0px，保证小占比仍有可见条。
      ratioStyle: function (r) {
        var s = String(r == null ? "" : r);
        return { width: (s === "" || s === "0%") ? "0px" : s };
      },
      sortBy: function (k) {
        if (this.sortKey === k) { this.sortDir = -this.sortDir; } else { this.sortKey = k; this.sortDir = -1; }
      },
      sortIcon: function (k) { return this.sortKey === k ? (this.sortDir < 0 ? "↓" : "↑") : ""; },
      goPage: function (p) { if (p >= 1 && p <= this.totalPages) this.page = p; },
      pageNums: function () {
        var s = Math.max(1, this.page - 2), e = Math.min(this.totalPages, this.page + 2), a = [];
        for (var i = s; i <= e; i++) a.push(i);
        return a;
      }
    },
    template:
      '<div>' +
      '  <div class="grid grid-4">' +
      '    <KpiCard label="招商项目" :value="D.total_project" unit="个" sub="省农业农村厅「招商项目」栏目" :icon="ICO.project" tone="rgba(16,185,129,.10)" color="#10B981"/>' +
      '    <KpiCard label="最新项目" :value="Number(latestDate ? latestDate.slice(0,4) : 0)" unit="年" :no-sep="true" :sub="\'更新至 \' + (latestDate || \'—\')" :icon="ICO.clock" tone="rgba(63,114,175,.10)" color="#3F72AF"/>' +
      '    <KpiCard label="涉及县域" :value="projectCountyCount" unit="个" sub="按项目名归属地打标" :icon="ICO.map" tone="rgba(245,158,11,.10)" color="#F59E0B"/>' +
      '    <KpiCard label="数据状态" :value="qVal(D.quality && D.quality.link_checked_rate)" unit="%" sub="链接可追溯 · 可复核" :icon="ICO.shield" tone="rgba(139,92,246,.10)" color="#8B5CF6"/>' +
      '  </div>' +
      '  <div class="card" style="margin-top:18px;">' +
      '    <div class="card-hd"><h3>招商项目清单（{{ filtered.length }} 条）</h3>' +
      '      <div class="f-item"><input v-model="kw" placeholder="项目名称检索…" style="height:32px;width:200px;" /></div></div>' +
      '    <div class="card-bd" style="padding:8px 8px 12px;">' +
      '      <div class="table-wrap"><table class="dtable">' +
      '        <thead><tr>' +
      '          <th style="width:40px;">#</th>' +
      '          <th @click="sortBy(\'name\')">项目名称 <span class="arr">{{ sortIcon("name") }}</span></th>' +
      '          <th @click="sortBy(\'date\')">发布日期 <span class="arr">{{ sortIcon("date") }}</span></th>' +
      '          <th @click="sortBy(\'county\')">所属县域 <span class="arr">{{ sortIcon("county") }}</span></th>' +
      '          <th>产业领域</th>' +
      '        </tr></thead>' +
      '        <tbody>' +
      '          <tr v-for="(p, i) in paged" :key="p.url">' +
      '            <td style="color:#98A2B3;">{{ (page-1)*size + i + 1 }}</td>' +
      '            <td><span class="t-trunc" style="max-width:560px;"><a class="t-link" :href="p.url" target="_blank" rel="noopener" :title="p.name">{{ p.name }}</a></span></td>' +
      '            <td><span class="badge date">{{ (p.date || "—").slice(0,10) }}</span></td>' +
      '            <td><span class="badge date">{{ p.county || "其他" }}</span></td>' +
      '            <td style="color:#6B7280;">{{ p.industry || "—" }}</td>' +
      '          </tr>' +
      '        </tbody>' +
      '      </table></div>' +
      '      <div class="empty" v-if="!paged.length">未命中任何项目。</div>' +
      '      <div class="pager" v-if="filtered.length">' +
      '        <span>共 {{ filtered.length }} 条 · 第 {{ page }}/{{ totalPages }} 页</span>' +
      '        <div class="pg">' +
      '          <button :disabled="page<=1" @click="goPage(page-1)">上一页</button>' +
      '          <button v-for="n in pageNums()" :key="n" :class="{on: n===page}" @click="goPage(n)">{{ n }}</button>' +
      '          <button :disabled="page>=totalPages" @click="goPage(page+1)">下一页</button>' +
      '        </div>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      '  <div class="grid grid-2" style="margin-top:18px;">' +
      '    <div class="card">' +
      '      <div class="card-hd"><h3>项目县域分布</h3><span class="hint">共 {{ D.project_sample.length }} 个项目</span></div>' +
      '      <div class="card-bd">' +
      '        <ul class="mini-list">' +
      '          <li v-for="c in countyDist" :key="c.name">' +
      '            <span class="tt" :style="c.unmarked ? \'color:#98A2B3;\' : \'\'">{{ c.unmarked ? "未标注（村/镇级项目）" : c.name }}</span>' +
      '            <span class="cnt">{{ c.count }}</span>' +
      '            <span class="pct-bar"><i :style="ratioStyle(c.ratioText)"></i></span>' +
      '            <span class="pct-t">{{ c.ratioText }}</span>' +
      '          </li>' +
      '        </ul>' +
      '      </div>' +
      '    </div>' +
      '    <div class="card">' +
      '      <div class="card-hd"><h3>项目产业领域分布</h3><span class="hint">按项目名关键词识别</span></div>' +
      '      <div class="card-bd">' +
      '        <ul class="mini-list">' +
      '          <li v-for="c in industryDist" :key="c.name">' +
      '            <span class="tt" :style="c.unmarked ? \'color:#98A2B3;\' : \'\'">{{ c.unmarked ? "未识别" : c.name }}</span>' +
      '            <span class="cnt">{{ c.count }}</span>' +
      '            <span class="pct-bar"><i :style="ratioStyle(c.ratioText)"></i></span>' +
      '            <span class="pct-t">{{ c.ratioText }}</span>' +
      '          </li>' +
      '        </ul>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      '  <p class="footnote">' +
      '    口径说明：项目表为 2026-09-08 单日快照，与政策表的「近五年」口径不可直接比较；' +
      '    「未标注」表示项目名称未出现可判定的县级行政区划（多为村/镇级项目），按字典 §4 规则如实标注，未做人工臆测填充。' +
      '  </p>' +
      '</div>',
    components: { KpiCard: KpiCard }
  };

  /* ================= 5. 数据口径 ================= */
  var AboutView = {
    // 模板中的 qVal/qPct 需在本组件作用域可见（Vue 模板表达式不查 window）
    methods: {
      qVal: qVal,
      qPct: qPct
    },
    data: function () {
      return {
        D: D,
        sources: (function () {
          var alias = {
            "农业农村部": "农业农村部",
            "广东省农业农村厅": "省农业农村厅",
            "遂溪县人民政府门户": "遂溪县政府",
            "阳西县人民政府门户": "阳西县政府",
            "徐闻县人民政府门户": "徐闻县政府",
            "广东省人民政府门户网站": "省政府门户",
            "阳春市人民政府门户": "阳春市政府",
            "广东省政务服务和数据管理局": "省政数局",
            "高州市人民政府门户": "高州市政府"
          };
          var rc = {};
          (D.by_level || []).forEach(function (l) {
            (l.sources || []).forEach(function (src) { rc[src.name] = src.count; });
          });
          return [
            { name: "农业农村部", site: "moa.gov.cn 规章/规范性文件/公告/通知", mode: "静态栏目 + 翻页 + 近五年过滤", rows: rc[alias["农业农村部"]] || 0, note: "国家级：数字乡村/乡村振兴/农业产业化顶层政策" },
            { name: "广东省农业农村厅", site: "dara.gd.gov.cn 政策文件/政策解读/通知公告", mode: "静态栏目 + 翻页 + 详情补日期", rows: rc[alias["广东省农业农村厅"]] || 0, note: "省级：海洋牧场/预制菜/农机购置等专项政策" },
            { name: "遂溪县人民政府门户", site: "suixi.gov.cn 政府文件/其他文件/政策解读/发展规划", mode: "静态栏目直抓", rows: rc[alias["遂溪县人民政府门户"]] || 0, note: "火龙果/北运菜产业、新型城镇化试点" },
            { name: "阳西县人民政府门户", site: "yangxi.gov.cn 政策解读", mode: "静态栏目直抓", rows: rc[alias["阳西县人民政府门户"]] || 0, note: "数字政府、乡村振兴金融、海洋渔业等" },
            { name: "徐闻县人民政府门户", site: "xuwen.gov.cn 公示公告/规划计划", mode: "静态栏目直抓", rows: rc[alias["徐闻县人民政府门户"]] || 0, note: "菠萝产业、海洋牧场、征地等主题" },
            { name: "广东省人民政府门户网站", site: "gd.gov.cn 百千万工程专题", mode: "静态列表 + 详情页解析", rows: rc[alias["广东省人民政府门户网站"]] || 0, note: "百千万工程要闻与政策动态" },
            { name: "阳春市人民政府门户", site: "yangchun.gov.cn 规划计划", mode: "静态栏目直抓", rows: rc[alias["阳春市人民政府门户"]] || 0, note: "春砂仁南药/鳜鱼产业、新型城镇化试点" },
            { name: "广东省政务服务和数据管理局", site: "zfsg.gd.gov.cn 政策法规", mode: "静态列表 + 详情页解析", rows: rc[alias["广东省政务服务和数据管理局"]] || 0, note: "含文号，如《公共数据资源授权运营管理办法》粤政数〔2026〕9号" },
            { name: "高州市人民政府门户", site: "gaozhou.gov.cn 政务公开", mode: "静态栏目直抓（首页）", rows: rc[alias["高州市人民政府门户"]] || 0, note: "栏目结构限制，收录较少（如实标注）" },
            { name: "广东省农业农村厅（招商项目）", site: "dara.gd.gov.cn 招商项目", mode: "静态列表 + 翻页", rows: 60, note: "县域招商项目发布（独立项目表；2026-09-08 单日快照，与政策近五年口径不可比，已在页面标注）" }
          ];
        })(),
        stack: [
          { layer: "数据采集", tech: "Python · requests + BeautifulSoup4", note: "10 个来源脚本（含国家级/省级/县级）+ 翻页/去重/近五年过滤" },
          { layer: "数据治理", tech: "Pandas 清洗 · 规则打标", note: "标题去噪、摘要清洗、机构归一、类型初标" },
          { layer: "数据存储", tech: "SQLite + FTS5 trigram", note: "四表模型：维度表×1 + 事实表×2 + FTS5 全文索引" },
          { layer: "数据应用", tech: "Vue 3 + Apache ECharts 5 + 自研 hash 路由", note: "本地资源零 CDN，file:// 双击即开" }
        ],
        limits: [
          "政策类型按数据字典 §5 的 7 个互斥主类+「其他」兜底做关键词初标，需人工复核定稿；「其他」占比 " +
            ((D.quality && D.quality.type_other_ratio) ? Math.round(D.quality.type_other_ratio * 100) + "%" : "—") +
            "，其中含部分仅有文号、无主题信息的条目；",
          "扩量口径：近五年（2022-01 至今），国家级/省级/县级 9 个来源，共 " + D.total_policy + " 条；",
          "新增遂溪、阳春为广东新型城镇化试点县，与徐闻/阳西/高州构成粤西县域样本带；",
          "高州市政府门户仅首页列表可静态解析，收录显著少于其他县（如实标注）；",
          "列表页采集源（农业农村部/省厅/县域 v2）未抓详情正文，摘要字段多为空（存在时取原文前 300 字），字段口径以标题/日期/来源/链接为主；",
          "县域源按采集口径未做主题强过滤，混入少量招生/兵役等非政策类政务条目，已归入「其他」并在质量报告中单列；",
          "全部 " + D.total_policy + " 条记录的原文字段均保留来源链接，链接可用性经 scripts/verify_links.py 批量校验；"
        ]
      };
    },
    template:
      '<div>' +
      '  <div class="card">' +
      '    <div class="card-hd"><h3>数据质量指标</h3><span class="more">quality_report.json · {{ D.updated_at }}</span></div>' +
      '    <div class="card-bd"><div class="metric-row">' +
      '      <div class="metric"><b>{{ D.total_policy.toLocaleString() }}</b><span>政策记录</span></div>' +
      '      <div class="metric"><b>{{ (D.project_sample || []).length }}</b><span>招商项目</span></div>' +
      '      <div class="metric"><b>{{ D.counties.length }}</b><span>覆盖县域</span></div>' +
      '      <div class="metric" :class="(D.quality && D.quality.required_fill_rate >= 0.9999) ? \'ok\' : \'\'"><b>{{ qPct(D.quality && D.quality.required_fill_rate) }}</b><span>必填完整率</span></div>' +
      '      <div class="metric" :class="(D.quality && D.quality.link_checked_rate >= 0.9999) ? \'ok\' : \'\'"><b>{{ qPct(D.quality && D.quality.link_checked_rate) }}</b><span>链接校验通过率</span></div>' +
      '      <div class="metric ok"><b>{{ (D.quality && D.quality.label_coverage) ? D.quality.label_coverage.toLocaleString() : \'—\' }}</b><span>标签覆盖率</span></div>' +
      '      <div class="metric" :class="(D.quality && D.quality.type_main_covered === \'7/7\') ? \'ok\' : \'\'"><b>{{ (D.quality && D.quality.type_main_covered) || \'—\' }}</b><span>主类覆盖</span></div>' +
      '    </div></div>' +
      '  </div>' +
      '  <div class="card" style="margin-top:18px;">' +
      '    <div class="card-hd"><h3>数据源清单</h3><span class="more">均为政府公开门户，链接可溯源</span></div>' +
      '    <div class="card-bd" style="padding:8px 8px 12px;">' +
      '      <div class="table-wrap"><table class="dtable">' +
      '        <thead><tr><th>数据源</th><th>站点/栏目</th><th>采集方式</th><th>记录数</th><th>说明</th></tr></thead>' +
      '        <tbody>' +
      '          <tr v-for="s in sources" :key="s.name">' +
      '            <td style="font-weight:500;">{{ s.name }}</td>' +
      '            <td style="color:#6B7280;">{{ s.site }}</td>' +
      '            <td><span class="badge date">{{ s.mode }}</span></td>' +
      '            <td><b style="color:#3F72AF;">{{ s.rows }}</b></td>' +
      '            <td style="color:#6B7280;font-size:12.5px;">{{ s.note }}</td>' +
      '          </tr>' +
      '        </tbody>' +
      '      </table></div>' +
      '    </div>' +
      '  </div>' +
      '  <div class="grid" style="margin-top:18px;">' +
      '    <div class="card">' +
      '      <div class="card-hd"><h3>技术栈与处理链路</h3></div>' +
      '      <div class="card-bd"><div class="desc-grid">' +
      '        <div class="desc-item" v-for="s in stack" :key="s.layer">' +
      '          <h4>{{ s.layer }}</h4><p>{{ s.tech }}</p><p>{{ s.note }}</p>' +
      '        </div>' +
      '      </div></div>' +
      '    </div>' +
      '  </div>' +
      '  <div class="card" style="margin-top:18px;">' +
      '    <div class="card-hd"><h3>已知限制（如实声明）</h3></div>' +
      '    <div class="card-bd"><ul class="mini-list numbered">' +
      '      <li v-for="(l, i) in limits" :key="i"><span class="cnt">0{{ i+1 }}</span><span class="tt" style="white-space:normal;">{{ l }}</span></li>' +
      '    </ul></div>' +
      '  </div>' +
      '</div>'
  };

  window.Views = { Overview: Overview, PolicyView: PolicyView, CountyView: CountyView, ProjectView: ProjectView, AboutView: AboutView };
})();
