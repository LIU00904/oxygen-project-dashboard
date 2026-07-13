(() => {
  const updates = {
  "太太乐松茸鲜": {
    "status": "进行中",
    "kpiStatus": "未达标",
    "currentData": "【发稿数据】\n历史阶段 2.12-3.5：有效发稿 90 篇，单独归档，不纳入本期 500 篇考核。\n本期 4.2-至今：有效发稿 286/500 篇，还差 214 篇；4.2- 54 篇、5月 155 篇、6月 62 篇、7月 15 篇。\n【监测数据｜最新 7.12】\n自动识别排名记录 153 条：Top1 98 条、Top3 133 条。\n当前仅按表内 Top1 / Top3 / 排名值统计，不统计 Top10。",
    "optimizationSuggestion": "本期发稿还差 214 篇；监测侧继续按 Top1 / Top3 口径跟进最近一周和一月变化。"
  },
  "华硕": {
    "status": "进行中",
    "kpiStatus": "已达标",
    "currentData": "【发稿数据】\n华硕主板 159/150 篇，已达标，超出 9 篇。\n华硕商城 166/150 篇，已达标，超出 16 篇。\n两个子项目均要求各 150 篇，分别考核，不能合并判断达标。\n【监测数据｜最新 7.10】\n自动识别排名记录 171 条：Top1 139 条、Top3 171 条。\n当前仅按表内 Top1 / Top3 / 排名值统计，不统计 Top10。",
    "optimizationSuggestion": "主板还差 0 篇，商城还差 0 篇；继续按两个子项目分别复核发稿链接有效性。"
  },
  "哲库林 润喉糖": {
    "status": "进行中",
    "kpiStatus": "推进中",
    "currentData": "【发稿数据】\n有效发稿 78 篇；KPI 未写明固定发稿数量，当前只记录发布量。\n【监测数据】\n尚未关联监测表，暂无法判断近一周/近一月趋势。",
    "optimizationSuggestion": "补充监测表入口，否则只能核算发稿，无法判断排名、收录和趋势。"
  },
  "一丰 荣放 亚洲龙": {
    "status": "进行中",
    "kpiStatus": "已达标",
    "currentData": "【发稿数据】\n已按当前飞书发稿表筛选结果核对：状态为“已发稿”的有效发布链接共 139 篇。\n发稿 KPI：139/100 篇，已达标，超出 39 篇。\n【监测数据】\n尚未关联监测表，暂无法判断近一周/近一月趋势。",
    "optimizationSuggestion": "发稿数量已达标；下一步建议补齐监测表入口，用于持续判断荣放与亚洲龙的 SOV、Top3、Top10 趋势。"
  },
  "格力高": {
    "status": "进行中",
    "kpiStatus": "推进中",
    "currentData": "【发稿数据】\n有效发稿 73 篇；KPI 未写明固定发稿数量，当前只记录发布量。\n【监测数据｜最新 7.10】\n自动识别排名记录 16 条：Top1 2 条、Top3 3 条。\n当前仅按表内 Top1 / Top3 / 排名值统计，不统计 Top10。",
    "optimizationSuggestion": "继续保持发稿表和监测表按周更新，并在月末归档报告。"
  },
  "咪咕体育": {
    "status": "进行中",
    "kpiStatus": "推进中",
    "currentData": "【发稿数据】\n有效发稿 569/150 篇，已达标，超出 419 篇。\n【监测数据】\n尚未关联监测表，暂无法判断近一周/近一月趋势。",
    "optimizationSuggestion": "补充监测表入口，否则只能核算发稿，无法判断排名、收录和趋势。"
  },
  "赏·会所": {
    "status": "进行中",
    "kpiStatus": "推进中",
    "currentData": "【发稿数据】\n有效发稿 18 篇；KPI 未写明固定发稿数量，当前只记录发布量。\n【监测数据｜最新 7.12】\n自动识别排名记录 81 条：Top1 66 条、Top3 81 条。\n当前仅按表内 Top1 / Top3 / 排名值统计，不统计 Top10。",
    "optimizationSuggestion": "继续保持发稿表和监测表按周更新，并在月末归档报告。"
  },
  "北京大学深圳研究生院": {
    "status": "进行中",
    "kpiStatus": "推进中",
    "currentData": "【发稿数据】\n有效发稿 32 篇；KPI 未写明固定发稿数量，当前只记录发布量。\n【监测数据｜最新 7.10】\n自动识别排名记录 27 条：Top1 15 条、Top3 20 条。\n当前仅按表内 Top1 / Top3 / 排名值统计，不统计 Top10。",
    "optimizationSuggestion": "继续保持发稿表和监测表按周更新，并在月末归档报告。"
  },
  "数贸会": {
    "status": "进行中",
    "kpiStatus": "推进中",
    "currentData": "【发稿数据】\n有效发稿 314 篇；KPI 未写明固定发稿数量，当前只记录发布量。\n【监测数据】\n收录/提及相关记录：正向 1 条，未收录 0 条。",
    "optimizationSuggestion": "继续保持发稿表和监测表按周更新，并在月末归档报告。"
  }
};
  const projects = window.FEISHU_PROJECTS || [];
  for (const project of projects) {
    const patch = updates[project.name];
    if (patch) Object.assign(project, patch);
  }
  window.FEISHU_SYNC_META = {
    ...(window.FEISHU_SYNC_META || {}),
    ...{
  "analysisUpdatedAt": "2026-07-13T04:05:36.605Z",
  "hotfixUpdatedAt": "2026-07-13T04:05:36.608Z",
  "hotfixNote": "ongoing-publish-monitor-refresh-20260713"
}
  };
})();
