(() => {
  const TABLE_URL = "https://jcnquengglen.feishu.cn/base/SRjgbQqBMa6L1isu8CFcuUAAnEb?table=tbl8o6BzxfDpqxMX&view=vew234Y6ro";
  const completed = new Set([
    "北京大学深圳研究生院",
    "格力高",
    "格力高 百奇",
    "咪咕体育",
    "一丰",
    "一丰 荣放 亚洲龙",
    "赏·会所",
    "深演",
    "骨科医生"
  ]);
  const ongoing = new Set([
    "国泰海通",
    "数贸会",
    "太太乐松茸鲜",
    "万豪",
    "万事达银联",
    "西门子",
    "哲库林 润喉糖",
    "TMA"
  ]);
  const stalled = new Set(["西昊", "西昊2", "mac", "海蓝之谜"]);
  const additions = [
    {
      id: "recvsw9Tyi4rjD",
      recordId: "recvsw9Tyi4rjD",
      name: "伊利金领冠",
      status: "待开始",
      kpi: "本月内容分发总量要求：文章发布 500 篇；AI 推荐与信源露出按飞书表执行。",
      platform: "豆包 PC 端 + 移动端，覆盖快速回答与深度回答等。",
      currentData: "项目已从飞书读取，待补充启动日期、发稿与监测分析。",
      optimizationSuggestion: "补齐启动日期、发稿链接和监测表后更新分析。"
    },
    { id: "recv-gili-20260907", name: "吉利", status: "待开始" },
    { id: "recv-toudaotang-20260907", name: "头道汤", status: "待开始" },
    { id: "recv-ifeng-20260907", name: "凤凰网", status: "待开始" },
    { id: "recv-tianma-20260907", name: "天马", status: "待开始" },
    { id: "recv-weiwo-20260907", name: "帷幄", status: "待开始" },
    { id: "recv-tianhushi-20260907", name: "恬护士", status: "待开始" }
  ];

  function normalizeName(name) {
    const normalized = String(name || "").replace(/\s+/g, " ").trim();
    if (normalized === "咪咕") return "咪咕体育";
    if (normalized === "一丰") return "一丰 荣放 亚洲龙";
    return normalized;
  }

  function cycleDays(startDate, endDate) {
    if (!startDate || !endDate) return 0;
    const start = new Date(`${startDate}T00:00:00+08:00`);
    const end = new Date(`${endDate}T00:00:00+08:00`);
    return Math.max(0, Math.round((end - start) / 86400000));
  }

  function endDate(project) {
    if (!project.startDate || !project.cycleDays) return "";
    const date = new Date(`${project.startDate}T00:00:00+08:00`);
    date.setDate(date.getDate() + Number(project.cycleDays));
    return date.toISOString().slice(0, 10);
  }

  function progressFor(project) {
    if (project.status === "已完成") return 100;
    if (project.status !== "进行中" || !project.startDate || !project.cycleDays) return 0;
    const start = new Date(`${project.startDate}T00:00:00+08:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const elapsed = Math.max(0, Math.round((today - start) / 86400000));
    return Math.max(0, Math.min(100, Math.round((elapsed / Number(project.cycleDays)) * 100)));
  }

  function patchProject(project) {
    const key = normalizeName(project.name);
    const next = { ...project, tableUrl: project.tableUrl || TABLE_URL };
    if (completed.has(key)) next.status = "已完成";
    else if (ongoing.has(key)) next.status = "进行中";
    else if (stalled.has(key)) next.status = "停滞";
    if (!next.cycleDays && next.startDate && next.endDate) next.cycleDays = cycleDays(next.startDate, next.endDate);
    if (!next.endDate) next.endDate = endDate(next);
    next.progressPercent = progressFor(next);
    return next;
  }

  function defaultProject(project) {
    return {
      source: "feishu",
      recordId: project.recordId || project.id,
      startDate: "",
      cycleDays: 0,
      progressPercent: 0,
      kpi: "",
      platform: "",
      notes: "",
      manager: "",
      writer: "",
      publisher: "",
      monitor: "",
      invoiceStatus: "待确认",
      publishLinks: [],
      monitorLinks: [],
      briefLinks: [],
      reportLinks: [],
      tableUrl: TABLE_URL,
      kpiStatus: "待补充",
      currentData: "项目已从飞书读取，待补充发稿/监测分析。",
      optimizationSuggestion: "补齐发稿链接与监测表后更新优化建议。",
      ...project
    };
  }

  const projects = Array.isArray(window.FEISHU_PROJECTS) ? window.FEISHU_PROJECTS.map(patchProject) : [];
  const byKey = new Map(projects.map(project => [normalizeName(project.name), project]));
  additions.forEach(project => {
    const key = normalizeName(project.name);
    if (!byKey.has(key)) byKey.set(key, patchProject(defaultProject(project)));
  });
  const order = { "进行中": 0, "待开始": 1, "已完成": 2, "停滞": 3 };
  window.FEISHU_PROJECTS = Array.from(byKey.values()).sort((a, b) => {
    const statusDiff = (order[a.status] ?? 9) - (order[b.status] ?? 9);
    return statusDiff || String(a.name).localeCompare(String(b.name), "zh-Hans-CN");
  });
  window.FEISHU_SYNC_META = {
    ...(window.FEISHU_SYNC_META || {}),
    syncedAt: new Date().toISOString(),
    hotfixUpdatedAt: new Date().toISOString(),
    statusSource: "status-overrides-20260907",
    recordCount: window.FEISHU_PROJECTS.length
  };
  localStorage.removeItem("oxygen-project-dashboard-protected-cache-v16-20260828");
})();
