(() => {
  const projects = window.FEISHU_PROJECTS || [];
  const project = projects.find(item => item.name === "一丰 荣放 亚洲龙");
  if (!project) return;

  project.currentData = [
    "【发稿数据】",
    "已按当前飞书发稿表筛选结果核对：状态为“已发稿”的有效发布链接共 139 篇。",
    "发稿 KPI：139/100 篇，已达标，超出 39 篇。",
    "【监测数据】",
    "尚未关联监测表，暂无法判断近一周/近一月趋势。"
  ].join("\n");
  project.optimizationSuggestion = "发稿数量已达标；下一步建议补齐监测表入口，用于持续判断荣放与亚洲龙的 SOV、Top3、Top10 趋势。";

  window.FEISHU_SYNC_META = {
    ...(window.FEISHU_SYNC_META || {}),
    analysisUpdatedAt: "2026-07-01T00:00:00.000Z",
    yifengPublishUpdatedAt: "2026-07-01T00:00:00.000Z"
  };
})();
