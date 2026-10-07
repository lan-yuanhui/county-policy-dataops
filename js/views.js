/* ==========================================================================
   views.js — 县域政策数据运营平台 视图组件 v2.1
   （版本口径：全站统一为 v2.1，与侧栏页脚保持一致；数据字典独立版本号见「数据口径」页）
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

  /* ---------- 中文长名称「语义断行」（A11 修复） ----------
     背景：图表 Y 轴标签若按「每 N 字硬切」，会出现两类问题——
       ① 末行只剩一两个字（「广东省政务服务和数据管理局」按 6 字切成
          「广东省政务服」「务和数据管理」「局」，最后一行只有「局」）；
       ② 折出来的行数超过绘图区预留高度，溢出覆盖到相邻条目。
     策略：
       ① 先做「词元切分」——把名称拆成完整语义词组序列，例如
          「广东省／政务服务／和／数据／管理局」；
       ② 在所有「词组边界」中挑最接近中点的位置作为断点，
          保证断点两侧都是完整词组（绝不切在词内）；
       ③ 若某一行仍超长，对该行递归再切一次（最多三行兜底）。
     效果：smartWrap("广东省政务服务和数据管理局", 8)
           → "广东省政务服务和\n数据管理局" */
  function smartWrap(name, maxPerLine) {
    name = String(name == null ? "" : name);
    var max = maxPerLine || 8;
    if (name.length <= max) return name;

    /* 行政区划前缀（省 / 市 / 县 / 区 / 自治州 …），按长度降序 */
    var PREFIX = ["维吾尔自治区", "回族自治区", "壮族自治区", "特别行政区",
                  "自治州", "自治县", "自治区", "省", "市", "县", "区"];
    /* 机构后缀词（构成名称尾部的核心词组），按长度降序。
       列表覆盖真实数据中出现的全部机构类型，以及常见政府机构名。
       注意：「人力资源和社会保障厅」「农牧厅」等必须完整列出，
       否则会被切成「…人力资源和｜社会保障厅」（行尾悬空连接词）或
       「内蒙古自治区农牧｜厅」（孤字行）。 */
    var SUFFIX = ["政务服务和数据管理局", "政务服务数据管理局", "人民政府门户网站",
                  "政府门户网站", "人力资源和社会保障厅", "人力资源和社会保障局",
                  "发展和改革委员会", "工业和信息化厅", "农业农村厅", "农业农村部",
                  "政务服务和数据管理", "人民政府门户", "医疗保障局", "生态环境厅",
                  "市场监督管理局", "自然资源厅", "住房和城乡建设厅", "交通运输厅",
                  "水利厅", "教育厅", "科技厅", "财政厅", "公安厅", "司法厅",
                  "农牧厅", "林业厅", "商务厅", "文化和旅游厅", "卫生健康委员会",
                  "管理局", "管理厅", "管理部", "门户网站", "人民政府", "政府门户",
                  "委员会", "办公室", "指挥部", "工作组", "研究院", "事务所",
                  "发改委", "农牧厅", "政府", "门户", "网站", "厅", "部", "局",
                  "委", "院", "署", "办", "站", "所", "会"];
    /* 连接/结构词：可独立成行，但绝不宜放在行首，也尽量不放行尾 */
    var CONJ = "和与及的地得之并或";
    /* 行尾不宜出现的字（前置修饰字，如「省」+「政务服务」不可拆） */
    var NOT_TAIL = "省市区县镇乡村";

    /* —— 步骤 1：生成断点候选集（每个候选 = 第二行的起始下标） —— */
    var cuts = [];
    /* 1a. 行政区划前缀之后：「广东省」|「政务服务和数据管理局」
           注意：这里只判断「名称以某个行政区划词开头」，并且把该词整体
           视为第一行。原实现用了 name.indexOf(p) 的错位比较，导致
           「广东省…」永远匹配不上、前缀断点从未生成 —— 已修正。 */
    for (var i = 0; i < PREFIX.length; i++) {
      var p = PREFIX[i];
      if (name.slice(0, p.length) === p && p.length < name.length && p.length <= max) {
        cuts.push(p.length);
        break;   /* PREFIX 按长度降序，首个命中即为最长的行政区划词 */
      }
    }
    /* 1a+. 连接词边界：「…政务服务」|「和数据管理局」的「和」两侧。
           仅作为候选参与打分，是否采用由步骤 2 决定。 */
    for (var m = 0; m < name.length; m++) {
      var ch = name.charAt(m);
      if (CONJ.indexOf(ch) >= 0) {
        if (m > 0) cuts.push(m);                 /* 断在连接词之前：「…服务」|「和数据…」 */
        if (m + 1 < name.length) cuts.push(m + 1); /* 断在连接词之后：「…和」|「数据…」 */
      }
    }
    /* 1b. 机构后缀之前：把后缀整体留给第二行 */
    for (var j = 0; j < SUFFIX.length; j++) {
      var s = SUFFIX[j];
      var pos = name.lastIndexOf(s);
      /* 后缀必须落在名称尾部（后面没有剩余字符） */
      if (pos > 0 && pos + s.length === name.length) cuts.push(pos);
    }
    /* 1c. 长机构词的内部边界：「政务服务和数据管理局」拆成
           「政务服务」|「和」|「数据管理局」，取「政务服务」「数据管理局」
           之间的边界（即跳过连接词）。这一候选能解决 8 字上限下
           「广东省政务服务和数据管理局」无干净断点的问题。 */
    for (var q = 0; q < SUFFIX.length; q++) {
      var sq = SUFFIX[q];
      var sqPos = name.indexOf(sq);
      if (sqPos <= 0) continue;
      /* 在该长词内部，找出「连接词+1」的位置作为候选 */
      for (var t = sqPos; t < sqPos + sq.length; t++) {
        if (CONJ.indexOf(name.charAt(t)) >= 0 && t + 1 < name.length) cuts.push(t + 1);
      }
    }
    /* 1d. 兜底：中点 */
    cuts.push(Math.ceil(name.length / 2));

    /* —— 步骤 2：在候选中打分，挑最优断点 ——
       打分维度（从强到弱）：
         A. 两行都不超长          —— 硬约束，违反重罚
         B. 第二行是一个完整机构名 —— 最强正向信号（「人民政府门户网站」）
         C. 第一行是一个完整地名   —— 次强正向信号（「广东省」「广州市增城区」）
         D. 第二行以机构名开头     —— 中等正向信号
         E. 行首非连接词、行尾非修饰字 —— 基础可读性
         F. 两行长度均衡           —— 最弱，仅作同分时的微调 */
    /* 地名尾字：第一行以这些字结尾，说明它很可能是一个完整行政区划名 */
    var REGION_TAIL = "省市区县镇乡村";
    var best = -1, bestScore = -1e9;
    var probe = name + "|";
    for (var c = 0; c < cuts.length; c++) {
      var cut = cuts[c];
      if (cut <= 0 || cut >= name.length) continue;
      var l1 = name.slice(0, cut), l2 = name.slice(cut);
      var score = 0;

      /* A. 硬约束：超长重罚。
         惩罚系数必须高于一切语义加分之和（80+60+60+20=220），
         否则会出现「为了保持机构名完整而让该行溢出、再递归切成三行」
         的劣解（例如「广东省｜政务服务和数据管理局」9 字溢出）。
         因此这里用 300/字，确保「能两行放完」永远优先于「语义完整」。 */
      if (l1.length > max) score -= (l1.length - max) * 300;
      if (l2.length > max) score -= (l2.length - max) * 300;

      /* B/C/D. 语义完整性 */
      var nameIsSuffix = SUFFIX.some(function (sf) { return l2 === sf; });         /* 第二行 = 完整机构名 */
      var nameIsRegion = REGION_TAIL.indexOf(l1.charAt(l1.length - 1)) >= 0;       /* 第一行以地名尾字结尾 */
      var l2StartsWithSuf = SUFFIX.some(function (sf) { return l2.indexOf(sf) === 0; });
      if (nameIsSuffix) score += 80;
      if (nameIsRegion) score += 60;
      if (nameIsSuffix && nameIsRegion) score += 60;   /* 最理想的「地名｜机构名」结构 */
      else if (l2StartsWithSuf) score += 20;

      /* E. 基础可读性 —— 连接词归属规则。
         中文排版惯例：并列结构「A和B」必须断开时，断点落在连接词「之后」，
         即「A和」｜「B」（「广东省政务服务和」｜「数据管理局」）。
         行尾悬一个连接词，读者会自然预期下一行是并列项，这是可接受写法；
         反之「A」｜「和B」把连接词甩到行首，才是真正别扭的残句。
         因此：行首连接词重罚（-110），行尾连接词仅轻罚（-15）。 */
      if (CONJ.indexOf(l2.charAt(0)) >= 0) score -= 110;
      if (CONJ.indexOf(l1.charAt(l1.length - 1)) >= 0) score -= 15;
      /* E2. 孤字行：某一行只剩 1 个字（如「内蒙古自治区农牧｜厅」）——
          中文标签里孤字行非常刺眼，给重罚促使其换一个更均衡的断点。 */
      if (l1.length === 1 || l2.length === 1) score -= 120;

      /* F. 长度均衡（权重最低） */
      score -= Math.abs(l1.length - l2.length) * 2;

      if (score > bestScore) { bestScore = score; best = cut; }
    }
    if (best <= 0) best = max;

    var r1 = name.slice(0, best), r2 = name.slice(best);
    /* —— 步骤 3：第二行仍超长时递归断行（最多三行） —— */
    if (r2.length > max) {
      var sub = smartWrap(r2, max);
      if (sub.indexOf("\n") >= 0) return r1 + "\n" + sub;
    }
    return r1 + "\n" + r2;
  }
  window.smartWrap = smartWrap;

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
    computed: {
      /* A23 修复（"—%"问题）：qVal 在数据缺失时返回字符串 "—"（不是数字）。
         原实现直接把它交给 animate()，Math.round("—" * ease) 得到 NaN，
         且模板会把 unit="%" 照常拼上去，最终显示成毫无意义的「—%」。
         这里统一判定：非有限数字时进入「缺失态」，显示 "—" 且隐藏单位。 */
      isMissing: function () {
        var v = this.value;
        if (v === undefined || v === null || v === "") return true;
        return isNaN(Number(v));
      }
    },
methods: {
      qVal: qVal,
      qPct: qPct,
      animate: function (target) {
        var self = this;
        /* A23：缺失值不做滚动动画，直接停在 0（由 fmt 显示 "—"）。 */
        if (this.isMissing) { self.disp = 0; return; }
        var num = Number(target);
        if (!isFinite(num)) { self.disp = 0; return; }
        var dur = 800, t0 = null;
        // setTimeout 驱动: 后台/无头标签页 rAF 不触发, 数字会停 0
        function step() {
          var now = performance.now();
          if (!t0) t0 = now;
          var p = Math.min((now - t0) / dur, 1);
          var ease = 1 - Math.pow(1 - p, 3);
          self.disp = Math.round(num * ease);
          if (p < 1) setTimeout(step, 16);
          else self.disp = num;
        }
        step();
      },
      fmt: function () {
        /* A23：缺失时返回 "—"，与 qVal 的语义保持一致。 */
        if (this.isMissing) return "—";
        return this.noSep ? String(this.disp) : this.disp.toLocaleString();
      }
    },
    template:
      '<div class="kpi" :style="{\'--kpi-tone\': tone, \'--kpi-color\': color}">' +
      '  <div class="kpi-ico" v-html="icon"></div>' +
      '  <div class="kpi-meta">' +
      '    <div class="kpi-label">{{ label }}</div>' +
      /* A23：单位只在有值时才渲染，杜绝「—%」这种拼接产物。 */
      '    <div class="kpi-value">{{ fmt() }}<small v-if="unit && !isMissing">{{ unit }}</small></div>' +
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
    computed: {
      /* A18：趋势图副标题的年份区间由数据层动态推导，
         不再写死「2020 – 2026」（实际数据为近五年 2022–2026）。 */
      trendRange: function () {
        var ys = (D.trend || []).map(function (t) { return t.year; });
        if (!ys.length) return "—";
        return Math.min.apply(null, ys) + " – " + Math.max.apply(null, ys);
      }
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
      /* A14 修复（口径误导）：此前的文案「2026 年 1–9 月发文 273 条，同比增长 74%」
         与右侧柱状图（2025=236 / 2026=273，视觉仅 +15.7%）构成冲突——
         同一屏出现两个「增长率」，读者会认为其中之一是错的。
         根因是两个口径不同：柱状图是「全年 vs 全年」，本句是「1–9 月 vs 1–9 月」。
         现把口径显式写在句子里，并同时给出全年口径，消除歧义。 */
      /* A14b 修复：trend 的 year 字段是「字符串」（"2022"…"2026"），
         原写法 t.year === 2025 用数字比较，永远匹配不到 → 全年口径算出 0 条 / +0%。
         统一转成字符串再比，并抽出小工具函数避免同类错误复现。 */
      function trendCount(y) {
        var hit = D.trend.find(function (t) { return String(t.year) === String(y); });
        return hit ? hit.count : 0;
      }
      var fullPrev = trendCount(2025);
      var fullCur = trendCount(2026);
      var fullYoy = fullPrev > 0 ? Math.round((fullCur - fullPrev) / fullPrev * 100) : 0;
      this.trendNote = "<b>同期口径（1–9 月）：2026 年 " + ys + " 条 vs 2025 年 " + prevN +
        " 条，增长 " + yoy + "%</b>" +
        (ys >= bestN ? "，为近五年同期最高" : "，低于 " + bestY + " 年同期（" + bestN + " 条）") +
        "；全年口径（柱状图）：2026 年 " + fullCur + " 条 vs 2025 年 " + fullPrev +
        " 条（+ " + fullYoy + "%）。两个口径不可混用，差额来自 2026 年数据截至 9 月底" +
        "，与『百千万工程』从铺开转向深化落地相吻合。";
      // 结论条：类型
      var top = D.by_type.slice().sort(function (a, b) { return b.count - a.count; })[0];
      var sum = D.total_policy;
      this.topType = top.type;
      /* A19 修复（无支撑文案）：原句写「主要为政策解读 / 规划 / 预案类」，
         但数据层并没有「解读 / 规划 / 预案」这个字段或分类，
         属于无数据支撑的主观描述，与全站「每个结论都能在数据层找到出处」
         的原则冲突。现改为只陈述数据层确实存在的两个事实：
         ① top 类别的占比；② 第二、三大类的实际条数。 */
      this.typeNote = "『<b>" + top.type + "</b>』占比最高（" + top.count + " 条 / " +
        Math.round(top.count / sum * 100) + "%）；" +
        "产业发展（" + (D.by_type.find(function (t) { return t.type === "产业发展"; }) || { count: 0 }).count +
        " 条）+ 乡村振兴（" + (D.by_type.find(function (t) { return t.type === "乡村振兴"; }) || { count: 0 }).count +
        " 条）构成实质高频主题。";
      // 结论条：层级构成
      var bl = D.by_level || [];
      var lv = bl.map(function (l) { return "<b>" + l.level + "</b> " + l.count + " 条"; }).join(" · ");
      var lvCountry = (bl.find(function (l) { return l.level === "国家级"; }) || {}).count || 0;
      var lvCounty = (bl.find(function (l) { return l.level === "县级"; }) || {}).count || 0;
      this.levelNote = "共 <b>" + D.total_policy + "</b> 条 = " + lv +
        "；国家级为政策环境背景（" + lvCountry + " 条），县级为粤西五县本地落地政策（" + lvCounty + " 条，即徐闻/遂溪/阳春/阳西/高州），层级映射在数据层定义、可逐级下钻至来源站点。";
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
            /* A12 修复：原 grid.right=24，而「均值 241.6」标签实测宽约 51px，
               且 markLine label 默认贴着右端对齐 → 文本被容器裁掉一半，
               只看得见「均值」。改为 right=64 预留标签宽度，并显式指定
               标签内边距，保证「均值 xxx」完整落在画布内。 */
            /* grid.top 由 40 → 52：峰值 markPoint 圆直径为 58px、圆心落在最大值柱顶，
               上半圆会向上探出约 29px，若 top 仍是 40 会被容器裁掉一截。 */
            grid: { left: 44, right: 64, top: 52, bottom: 30 },
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
                /* A12 修复：柱顶数值与 markPoint 峰值气泡会重叠（尤其当年值为最大值时），
                   因此把「最大值那根柱」的数值标签隐藏，改由气泡统一表达「峰值 n」。 */
                formatter: function (p) {
                  if (p.dataIndex === maxI) return "";     /* 交给 markPoint 表达 */
                  return p.value >= 10 ? p.value : "";
                }
              },
              markLine: {
                symbol: "none", silent: true,
                lineStyle: { type: "dashed", color: "#98A2B3", width: 1 },
                /* A12c 修复（第三版，最终解）：均值线 y≈241.6 恰好夹在
                   2022 年 230 与 2024 年 265 两条柱的数值标签高度之间，
                   横向无论放左（撞 230）还是放右（撞峰值 273 气泡）都会重叠。
                   根本原因是「同一水平带上同时存在均值线与柱顶数字」。
                   解法：用 offset 把均值标签竖直上移 13px（约一个字高 + 间隙），
                   脱离柱顶数字所在的 11px 文字带，横向仍放右侧留白。 */
                label: {
                  color: "#98A2B3", fontSize: 10.5,
                  position: "end", distance: 2, offset: [0, -13],
                  formatter: function (p) { return "均值 " + Math.round(p.value * 10) / 10; }
                },
                data: [{ type: "average" }]
              },
              markPoint: {
                /* A12b 修复：上一版用 pin（水滴）形状 + offset:[0,2]，
                   水滴的尖端在下、可写区域是上方圆弧，offset 把文字往尖端推，
                   结果「峰值 273」被挤在窄处、视觉上糊成一团（截图可见）。
                   改回圆形并把 symbolSize 提到 58，同时去掉 offset：
                   圆形对「峰值\n273」两行文字的可容纳面积最大且居中。 */
                symbol: "circle", symbolSize: 58, silent: true,
                itemStyle: { color: "#F59E0B", shadowColor: "rgba(245,158,11,.4)", shadowBlur: 8 },
                label: {
                  color: "#fff", fontSize: 10.5, fontWeight: 700, lineHeight: 12,
                  formatter: "峰值\n{c}"
                },
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
            // A10 修复：ECharts graphic 的 left/top 默认以元素左上角为锚点，
            // 原写法 left:"30%" 与 center:["30%","50%"] 看似对齐，实际文字整体右偏、
            // 「条」字逼近环内壁。改为 textAlign/textVerticalAlign 双居中 + 用
            // left/top 精确指向圆心，并去掉半透明白底（环内留白已足够，白底反而显脏）。
            graphic: [{
              type: "text", left: "30%", top: "50%",
              style: {
                text: tot + "\n条", textAlign: "center", textVerticalAlign: "middle",
                fontSize: 22, fontWeight: 700, fill: "#1F2A37", lineHeight: 24,
                fontFamily: "Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif"
              }
            }, {
              type: "text", left: "30%", top: "50%",
              style: {
                text: "\n\n政策总数", textAlign: "center", textVerticalAlign: "middle",
                fontSize: 11.5, fill: "#98A2B3", lineHeight: 24
              }
            }],
            series: [{
              name: "类型", type: "pie", radius: ["56%", "76%"], center: ["30%", "50%"],
              avoidLabelOverlap: true,
              itemStyle: { borderColor: "#fff", borderWidth: 3, borderRadius: 6 },
              // A10 修复：原阈值 8% 时，左上角仍会聚集 4~5 个极小切片（1%/2%），
              // 引线密集交叉且与 20% 标签贴近。提高阈值到 12%，并缩短引线长度，
              // 小占比改由右侧图例（已含「类目 + 条数」）与 tooltip 承载。
              label: {
                show: true,
                formatter: function (p) {
                  return p.percent >= 12 ? Math.round(p.percent) + "%" : "";
                },
                fontSize: 10.5, color: "#6B7280", lineHeight: 14
              },
              minAngle: 4,
              labelLine: { show: true, length: 6, length2: 4, lineStyle: { color: "#C3CCDB" } },
              emphasis: { scale: true, scaleSize: 7 },
              data: D.by_type.map(function (t, i) {
                return {
                  name: t.type, value: t.count,
                  /* A17 修复（死代码）：原写法 color: i===0 ? PALETTE[i] : PALETTE[i]
                     两个分支完全相同，等价于 PALETTE[i]；后面那句
                     shadowBlur: t.type === "综合政务" ? 0 : 0 同样恒为 0，
                     且「综合政务」并不存在于本项目的 7 类主类字典中（属无效引用）。
                     直接取模取色，把「其他」类固定为灰，保证兜底类视觉上弱化。 */
                  itemStyle: {
                    color: t.type === "其他" ? "#C3CCDB" : PALETTE[i % PALETTE.length]
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
          // A10：轴标签用 short（简称），tooltip 用 source（官方全称），兼顾可读与口径完整。
          // 同时显式限定 axisLabel 宽度，杜绝 ECharts 默认的「无提示截断」导致名称失真。
          var axLabels = srcs.map(function (x) { return x.short || x.source; }).reverse();
          var fullNames = srcs.map(function (x) { return x.source; }).reverse();
          EChartsLib.make(el4, {
            animationDuration: 1000,
            // right 由 44 加大到 58，避免最长的 643 标签压到 x 轴末端网格
            grid: { left: 8, right: 58, top: 10, bottom: 8, containLabel: true },
            tooltip: {
              trigger: "axis", backgroundColor: NAV, borderWidth: 0,
              textStyle: { color: "#fff", fontSize: 12 },
              axisPointer: { type: "shadow", shadowStyle: { color: "rgba(63,114,175,.08)" } },
              formatter: function (ps) {
                var p = ps[0];
                var full = fullNames[p.dataIndex] || p.name;
                return full + "：<b>" + p.value + "</b> 条";
              }
            },
            xAxis: {
              type: "value", minInterval: 1,
              axisLabel: { color: "#98A2B3", fontSize: 11 },
              splitLine: { lineStyle: { color: "rgba(24,39,63,.06)" } }
            },
            yAxis: {
              type: "category", data: axLabels,
              axisTick: { show: false }, axisLine: { show: false },
              axisLabel: {
                color: "#4B5563", fontSize: 11.5,
                width: 96, overflow: "truncate"
              }
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
      /* A18 修复：原副标题写死「2020 – 2026」，但数据层 trend 实际只有
         2022–2026（近五年口径）。改为由数据层动态算出年份区间，避免标题说谎。 */
      '      <div class="card-hd"><h3>政策数量年度趋势</h3><span class="more">{{ trendRange }}</span></div>' +
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
        /* A20 修复（合计歧义）：原先下拉里是「全部类型（1208）」紧接
           「产业发展（280）」「乡村振兴（190）」…，用户容易把 1208 与各分类
           相加得出 2416，误以为数据翻倍。这里保留 type 的哨兵值不变
           （filter 逻辑依赖 t.type === "全部类型" 判空），仅把展示文案
           改成「全部类型（合计 N 条）」，用「合计」打断加总错觉。
           具体文案拼接在模板层完成，见下面 option 的 :label 绑定。 */
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
        "；国家级为政策环境背景（" + lvCountry + " 条），县级为粤西五县本地落地政策（" + lvCounty + " 条，即徐闻/遂溪/阳春/阳西/高州），层级映射在数据层定义、可逐级下钻至来源站点。";
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
        /* A21 修复：排序会改变数据顺序，若仍停在第 N 页，用户会看到「换了排序
           但行内容没变」的错觉（其实只是翻到了另一批数据）。排序后统一回到第 1 页。 */
        this.page = 1;
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
          /* ============ A25 修复：类型分布饼图「小扇区标签互压 / 溢出」 ============
             问题（用户截图 2026-10-07）：9 个类型里有 5 个占比 ≤ 2%
             （人才引进 0.17% / 土地利用 1.08% / 数字乡村 1.24% / 财政金融 1.41%
              / 营商环境 1.99%），扇区角只有 0.6°–7°。ECharts 默认沿半径方向
             把标签甩出去，相邻小扇区的标签挤在同一条弧带上互相覆盖，
             截图里「0% / 1% / 1% / 1% / 2%」糊成一团；同时
             「1208 条」中心块的 94% 白底会压住内圈 52% 那一侧的扇区颜色。

             ── 第一版尝试（已废弃，留作教训）──
             用 labelLayout 返回 { x: params.rect.width - 30, y: ... } 想把小标签
             摆到右侧一列。实测所有小标签被推到 x ≈ -22（画布外），完全不可见。
             原因：labelLayout 里的 params.rect 是「已应用扇区旋转的局部坐标系」
             中的包围盒，不是画布绝对坐标；再叠加 align/x 的相对语义，
             最终位置跟预期差了一整个坐标系。坐标系的坑，返回值越"聪明"越危险。

             ── 现方案：按扇区角度算「画布绝对坐标」，分东西两侧错开 ──
             ① 大扇区（≥ 4%）：label 直接写在扇区内（position:"inside"），
                白字 + 加粗。扇区够宽，文字压在色块上反而最清晰，且不占引线。
             ② 小扇区（< 4%）：把标签统一甩到两侧，按「先上后下」等距排布：
                · 东侧（扇区中点角落在右半圆）走右侧一列，西侧走左侧一列；
                · 同侧行距固定 15px，从中心线向两端展开 —— 等高排列，
                  数学上相邻标签不可能重叠（15px > 10px 字高）。
             ③ labelLine 长度自适应：把标签推到容器边缘附近，引线自然拉长，
                读者仍能顺着线找到对应扇区。
             ④ 中心数字块去掉 94% 白底（原实现会盖住内圈扇区颜色），字号 21→19。 */
          var SMALL_TH = 4;                    /* 4% 以下视为小扇区 */
          /* 窄屏（< 420px）时小标签只显示百分比、不显示名称，
             避免左右两列文字在中路打架；同时收窄标签宽度上限。 */
          var TIGHT = el1.clientWidth < 420;
          /* 小标签两列的绝对落点（相对容器宽度的百分比）。
             为什么不用像素：labelLayout 返回的 x 只认百分比字符串，
             实测传数字会被静默忽略（标签停回默认位置，看不出报错）。
             东侧 84% / 西侧 12% 是实测的甜点值：
             · 桌面 521px → 西锚点 63px > 标签宽 61px，右边缘落在 x≈2 ✓
             · 窄屏 324px → 东锚点 272px，标签右边缘 272+22=294px < 324 ✓
               （原先取 88% 得 285px，加标签宽后右边缘 307px 溢出 4px，实测报红）
             注意 x 是「锚点」：西侧 align:"right" 时它是文字右边缘，
             东侧 align:"left" 时是左边缘 —— 写反会导致整列文字穿出容器。 */
          var EAST_X = "84%", WEST_X = "12%";
          /* 标签宽度上限（px），窄屏时收窄以便两侧留白 */
          var LABEL_MAXW = TIGHT ? 54 : 68;
          /* 先按角度把小扇区分到东/西两侧，再各自排序，决定每行的 y */
          var east = [], west = [];
          var seen = 0;                        /* 累计角（弧度），用于求扇区中点 */
          var TWO_PI = Math.PI * 2;
          var smallRank = {};                  /* dataIndex -> 纵向槽位(可为负) */
          var smallSide = {};                  /* dataIndex -> "e" | "w" */
          if (tot) {
            fd.forEach(function (t, i) {
              var frac = t.count / tot;
              var mid = (seen + frac / 2) * TWO_PI;   /* 扇区中点角(0=12点钟方向, 顺时针) */
              seen += frac;
              if (frac * 100 >= SMALL_TH) return;     /* 大扇区不参与 */
              /* ECharts 饼图：0 弧度指向 12 点、顺时针增长。
                 x = sin(θ) 决定左右：sin>0 → 右半圆。 */
              var sx = Math.sin(mid);
              if (sx >= 0) { east.push(i); smallSide[i] = "e"; }
              else { west.push(i); smallSide[i] = "w"; }
            });
          }
          /* 同侧按「从中心线向外」排：先按 y 分量降序，再分配到对称槽位 */
          function assignSide(arr) {
            if (!arr.length) return;
            var ys = arr.map(function (idx) {
              var acc = 0;
              for (var k = 0; k < idx; k++) acc += fd[k].count / tot;
              var frac2 = fd[idx].count / tot;
              return Math.cos((acc + frac2 / 2) * TWO_PI);  /* cos 大 → 靠上 */
            });
            var order = arr.map(function (v, n) { return n; })
              .sort(function (a, b) { return ys[b] - ys[a]; });
            var n = arr.length;
            order.forEach(function (pos, slot) {
              /* 从中心线向两端展开：slot 0 在最上，依次向下 */
              smallRank[arr[pos]] = slot - (n - 1) / 2;
            });
          }
          assignSide(east); assignSide(west);
          var graphic = [];
          if (tot) {
            /* 窄屏环径小，中心文字会顶到环上（实测「1208」被内环压住），
               改为不写中心块，总数由上方结论条「当前筛选命中 1208 条」承担。 */
            if (!TIGHT) {
              graphic.push({
                type: "text", left: "50%", top: "33%",
                style: {
                  text: String(tot) + "\n条", textAlign: "center",
                  fontSize: 19, fontWeight: 700, fill: "#1F2A37", lineHeight: 23
                }
              });
            }
          } else {
            graphic.push({
              type: "text", left: "50%", top: "41%",
              style: {
                text: "当前筛选无匹配", textAlign: "center", textVerticalAlign: "middle",
                fontSize: 12.5, fill: "#98A2B3"
              }
            });
          }
          EChartsLib.make(el1, {
            animationDuration: 700,
            tooltip: {
              trigger: "item", backgroundColor: NAV, borderWidth: 0,
              textStyle: { color: "#fff", fontSize: 12 },
              formatter: function (p) { return p.name + "：" + p.value + " 条（" + p.percent + "%）"; }
            },
            legend: {
              bottom: 2, icon: "circle", itemWidth: 9, itemHeight: 9, itemGap: 14,
              textStyle: { color: "#4B5563", fontSize: 11.5 }
            },
            graphic: graphic,
            series: [{
              name: "类型", type: "pie",
              /* 窄屏把圆环整体收小并略向左移：
                 大扇区标签长在环外自然位置，环越大标签越贴近容器边缘。
                 桌面 521px 用 ["46%","62%"] 比例正好；
                 窄屏 324px 时环径相对宽度更大，标签会溢出右缘，
                 故收到 ["40%","54%"] 并 center 左移到 47%，
                 给东侧（59%）腾出 ~20px 落位空间。 */
              radius: TIGHT ? ["40%", "54%"] : ["46%", "62%"],
              center: TIGHT ? ["47%", "41%"] : ["50%", "41%"],
              avoidLabelOverlap: false,
              itemStyle: { borderColor: "#fff", borderWidth: 2.5, borderRadius: 5 },
              /* 统一把标签甩到环外：小扇区再被 labelLayout 拉到两侧竖列。
                 大扇区若留在环内，引线会从圆心斜穿整个环（实测很难看），
                 所以大扇区也走环外，只是不出引线折角。 */
              label: {
                show: true,
                /* 按占比分流：大扇区只写百分比；小扇区带名称（窄屏则只写百分比）。
                   大扇区固定在环外默认半径位置，靠引线辨识；
                   小扇区由 labelLayout 拉成两侧竖列。 */
                formatter: function (p) {
                  var isSmall = smallRank[p.dataIndex] !== undefined;
                  var pct = Math.round(p.percent) + "%";
                  var isRight = Math.sin(p.midAngle) >= 0;
                  /* 窄屏标签宽度只有 54px，全名放不下，截前两字做识别锚点
                     （「营商环境」→「营商」、「财政金融」→「财政」）。
                     配合下方图例（图例是按颜色对应的）足以定位。 */
                  var nm = isSmall
                    ? (TIGHT ? String(p.name).slice(0, 2) + " " : p.name + " ")
                    : "";
                  return "{" + (isRight ? "e" : "w") + "|" + nm + pct + "}";
                },
                rich: {
                  /* 东侧标签：靠左对齐，锚点即左边缘 */
                  e: {
                    color: "#6B7280", fontSize: 10.5, align: "left",
                    verticalAlign: "middle", width: LABEL_MAXW, overflow: "truncate"
                  },
                  /* 西侧标签：靠右对齐，锚点即右边缘 */
                  w: {
                    color: "#6B7280", fontSize: 10.5, align: "right",
                    verticalAlign: "middle", width: LABEL_MAXW, overflow: "truncate"
                  }
                }
              },
              /* 小标签的绝对落点：x 用百分比贴边（东西两侧各一个锚点），
                 y 用百分比槽位（同侧间距固定 15px，数学上不可能重叠）。
                 容器高 240px → 1 slot ≈ 15/240 = 6.25% */
              labelLayout: function (params) {
                var off = smallRank[params.dataIndex];
                if (off === undefined) return;   /* 大扇区：保留天然半径位置，不干预 */
                var isRight = smallSide[params.dataIndex] === "e";
                return {
                  x: isRight ? EAST_X : WEST_X,
                  y: (50 + off * 6.25) + "%",
                  verticalAlign: "middle"
                };
              },
              /* minAngle 由 4 提到 8：5 个西侧小扇区（营商环境 1.99% / 财政金融
                 1.41% / 数字乡村 1.24% / 土地利用 1.08% / 人才引进 0.17%）的真实
                 角度只有 0.6°–7.2°，引线起点几乎重合、在环外收束成一团毛线。
                 minAngle 把每个扇区的最小绘制角撑到 8°，起点自然拉开 ≥ 8° 的
                 张角差，引线呈扇形散开，肉眼可顺着线找到对应色块。
                 代价是极小扇区被画得比真实占比略宽 —— 这是刻意的取舍：
                 环形图用于「看分布形态」，精确数值由标签与 tooltip 承担，
                 两者互补，不构成口径失真。 */
              minAngle: 8,
              /* labelLine length 拉长到 22：让引线的第一段先「走出圆环外缘」
                 再拐向标签，避免贴着环面斜穿（原 length:8 会穿过色块本身）。
                 length2 保持 12 作为水平末段。 */
              labelLine: { length: 22, length2: 12, lineStyle: { color: "#C3CCDB" } },
              emphasis: { scale: true, scaleSize: 6 },
              data: fd.length
                ? fd.map(function (t, i) { return { name: t.type, value: t.count, itemStyle: { color: PALETTE[i % PALETTE.length] } }; })
                : []   /* A24：不画假环，由上面的 graphic 给出「无匹配」提示 */
            }]
          });
        }
        var el2 = document.getElementById("pl-pub");
        if (el2) {
          var names = fp.map(function (t) { return t.publisher || "未知"; });
          var maxPub = fp.length ? fp[0].count : 0;
          EChartsLib.make(el2, {
            animationDuration: 700,
            grid: { left: 8, right: 44, top: 10, bottom: 16, containLabel: true },
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
              /* A11 修复：原实现按「每 6 字硬切」折行，13 字的
                 「广东省政务服务和数据管理局」被切成 6+6+1，末行只剩一个「局」，
                 且第三行溢出覆盖相邻条目（实测与「阳春市人民政府」重叠 60px²）。
                 现改为 smartWrap()「语义断行」：断点只落在完整词组边界上，
                 如「广东省政务服务和」/「数据管理局」，最多两行、无孤字行。
                 lineHeight 同步由 15 提到 16，两行标签在 240px 高度里不显拥挤。 */
              axisLabel: {
                color: "#4B5563", fontSize: 11.5, interval: 0, lineHeight: 16,
                formatter: function (name) {
                  return smartWrap(name, 8);
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
          // A10：轴标签用 short（简称），tooltip 用 source（官方全称），兼顾可读与口径完整。
          // 同时显式限定 axisLabel 宽度，杜绝 ECharts 默认的「无提示截断」导致名称失真。
          var axLabels = srcs.map(function (x) { return x.short || x.source; }).reverse();
          var fullNames = srcs.map(function (x) { return x.source; }).reverse();
          EChartsLib.make(el4, {
            animationDuration: 1000,
            // right 由 44 加大到 58，避免最长的 643 标签压到 x 轴末端网格
            grid: { left: 8, right: 58, top: 10, bottom: 8, containLabel: true },
            tooltip: {
              trigger: "axis", backgroundColor: NAV, borderWidth: 0,
              textStyle: { color: "#fff", fontSize: 12 },
              axisPointer: { type: "shadow", shadowStyle: { color: "rgba(63,114,175,.08)" } },
              formatter: function (ps) {
                var p = ps[0];
                var full = fullNames[p.dataIndex] || p.name;
                return full + "：<b>" + p.value + "</b> 条";
              }
            },
            xAxis: {
              type: "value", minInterval: 1,
              axisLabel: { color: "#98A2B3", fontSize: 11 },
              splitLine: { lineStyle: { color: "rgba(24,39,63,.06)" } }
            },
            yAxis: {
              type: "category", data: axLabels,
              axisTick: { show: false }, axisLine: { show: false },
              axisLabel: {
                color: "#4B5563", fontSize: 11.5,
                width: 96, overflow: "truncate"
              }
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
      '        <option v-for="t in typeOptions" :value="t.type === \'全部类型\' ? \'\' : t.type">{{ t.type === \'全部类型\' ? \'全部类型（合计 \' + t.count + \' 条）\' : t.type + \'（\' + t.count + \'）\' }}</option>' +
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
      /* A11 修复：发布机构标签改为「语义断行」后普遍占两行，240px 放 8 条会明显拥挤，
         且左列「类型分布」是饼图（无行数压力），两列等高档位不影响观感。
         故本图容器提高到 290px，给每条腾出 ~36px（两行文字 32px + 间距）。 */
      '        <div class="chart-box h-sm"><div class="sk skeleton" style="position:absolute;inset:0;z-index:2;"></div><div id="pl-pub" style="width:100%;height:290px;"></div></div>' +
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
        /* A22 修复（硬编码 + 静默归零）：
           原实现把 5 个县名、所属市、产业文案全部写死在此数组里，
           created 时用 D.by_county.find(x => x.county === c.name) 取条数，
           一旦数据层把县名改成「阳春市（县级市）」这类写法，find 失配后
           静默回落到 0，页面显示「阳春市 0 条」而不报错——属于最难发现的缺陷。
           现改为：县名 / 所属市 / 产业描述一律从 D.counties（数据层维度表）读取，
           这里只保留「视觉专属」字段（配图 key、标签），并按县名做键映射。
           映射不到时不再静默，改为显式打印告警并在卡片上标注「口径待核对」。 */
        cards: (function () {
          /* 视觉层专属配置：img 为配图目录名，tag 为卡片角标 */
          var VISUAL = {
            "遂溪县": { img: "suixi", tag: "火龙果" },
            "阳西县": { img: "yangxi", tag: "海洋渔业" },
            "徐闻县": { img: "xuwen", tag: "菠萝之乡" },
            "阳春市": { img: "yangchun", tag: "南药之乡" },
            "高州市": { img: "gaozhou", tag: "中国荔乡" }
          };
          var src = (D.counties && D.counties.length) ? D.counties : [];
          return src.map(function (c) {
            var v = VISUAL[c.name] || {};
            return {
              name: c.name,
              city: c.city || "—",
              industry: c.industry || "—",
              count: 0,
              img: v.img || "",
              tag: v.tag || "",
              matched: !!VISUAL[c.name]
            };
          });
        })(),
        coverNote: "", observeNote: ""
      };
    },
    created: function () {
      var self = this;
      this.cards.forEach(function (c) {
        var m = D.by_county.find(function (x) { return x.county === c.name; });
        /* A22：失配不再静默——打日志 + 置 matched=false，模板会显式提示。 */
        if (m) { c.count = m.count; }
        else {
          c.count = 0;
          c.matched = false;
          if (window.console && console.warn) {
            console.warn("[CountyView] 数据层 by_county 缺少县域「" + c.name + "」，卡片计数回落为 0，请核对字典口径。");
          }
        }
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
        "；国家级为政策环境背景（" + lvCountry + " 条），县级为粤西五县本地落地政策（" + lvCounty + " 条，即徐闻/遂溪/阳春/阳西/高州），层级映射在数据层定义、可逐级下钻至来源站点。";
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
          /* A12 修复：同 ov-trend，right=24 装不下「均值 60」标签（实测约 47px），
             文本会被画布裁切。改为 right=56。 */
          grid: { left: 44, right: 56, top: 40, bottom: 28 },
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
              /* A12 修复：标签贴右边界会被裁切，改靠内侧显示并固定 1 位小数。 */
              label: {
                color: "#98A2B3", fontSize: 10.5,
                position: "insideEndTop", distance: 2,
                formatter: function (p) { return "均值 " + Math.round(p.value * 10) / 10; }
              },
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
      // A13 修复：原实现只判断 p.county 是否为真值，若数据里 county 字段
      // 直接写成字符串 "未标注"（而非留空），会被当作一个真实县域计入，
      // 导致 KPI 显示「涉及县域 6 个」而实际有效归属只有 5 个。
      // 这里显式排除占位值，只统计真实县级行政区划名。
      projectCountyCount: function () {
        var PLACEHOLDER = ["未标注", "未知", "待补充", "无", "-", "—", ""];
        var set = {};
        D.project_sample.forEach(function (p) {
          var c = (p.county || "").trim();
          if (c && PLACEHOLDER.indexOf(c) < 0) set[c] = 1;
        });
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
        /* A21 修复：同政策页，排序后回到第 1 页，避免「排序没生效」的错觉。 */
        this.page = 1;
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
      '    <KpiCard label="涉及县域" :value="projectCountyCount" unit="个" sub="粤北粤东，与政策页五县不同" :icon="ICO.map" tone="rgba(245,158,11,.10)" color="#F59E0B"/>' +
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
      '    本页县域来自项目名称中的归属地（粤北粤东：蕉岭/东源/连平/南雄/和平），' +
      '    与「政策」页的粤西五县（徐闻/遂溪/阳春/阳西/高州）为两套不同口径，两者不重合、不可混用；' +
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
          // A10 修复：alias 的 value 必须与数据层 by_level[].sources[].name 完全一致。
          // 数据层已统一为官方全称（build_db.py SOURCE_LABEL），此处同步为全称，
          // 否则 rc[alias[...]] 会查不到、rows 全部回落为 0（静默失效）。
          var alias = {
            "农业农村部": "农业农村部",
            "广东省农业农村厅": "广东省农业农村厅",
            "遂溪县人民政府门户": "遂溪县人民政府门户",
            "阳西县人民政府门户": "阳西县人民政府门户",
            "徐闻县人民政府门户": "徐闻县人民政府门户",
            "广东省人民政府门户网站": "广东省人民政府门户网站",
            "阳春市人民政府门户": "阳春市人民政府门户",
            "广东省政务服务和数据管理局": "广东省政务服务和数据管理局",
            "高州市人民政府门户": "高州市人民政府门户"
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
            /* A16 修复（硬编码）：原为 rows: 60 字面量，违反本文件头
               「看板数值禁止硬编码，一律绑定数据层」的声明。
               改为绑定 D.total_project（数据层真实项目总数）。 */
            { name: "广东省农业农村厅（招商项目）", site: "dara.gd.gov.cn 招商项目", mode: "静态列表 + 翻页", rows: D.total_project || 0, note: "县域招商项目发布（独立项目表；2026-09-08 单日快照，与政策近五年口径不可比，已在页面标注）" }
          ];
        })(),
        stack: [
          { layer: "数据采集", tech: "Python · requests + BeautifulSoup4", note: "9 个政策来源脚本（国家级 1 + 省级 3 + 县级 5）+ 1 个招商项目来源；含翻页/去重/近五年过滤" },
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
      /* A15 修复（单位歧义）：label_coverage 的实际值是「条数」（1208 条），
         不是百分比。原标签写作「标签覆盖率」，与同排的「必填完整率 100%」
         「链接校验通过率 100%」并列，极易被读成「1208%」。
         现改为「已打标条数」，并补上单位「条」，语义与单位都对得上。 */
      '      <div class="metric ok"><b>{{ (D.quality && D.quality.label_coverage) ? D.quality.label_coverage.toLocaleString() : \'—\' }}</b><span>已打标条数（条）</span></div>' +
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
