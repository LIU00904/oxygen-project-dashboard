(() => {
  const app = document.querySelector('#app');
  const STATUS_ORDER = ['进行中', '待开始', '已完成', '停滞'];
  const STATUS_META = {
    '进行中': { color: 'blue', label: '进行中' },
    '待开始': { color: 'amber', label: '待开始' },
    '已完成': { color: 'green', label: '已完成' },
    '停滞': { color: 'red', label: '停滞' }
  };
  const state = { search: '' };
  const projects = (Array.isArray(window.FEISHU_PROJECTS) ? window.FEISHU_PROJECTS : [])
    .map(project => ({ ...project, id: project.id || project.recordId || project.name }))
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.name.localeCompare(b.name, 'zh-CN'));

  function esc(value = '') {
    return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  }

  function route() {
    const raw = location.hash.replace(/^#/, '') || '/overview';
    const [path, query = ''] = raw.split('?');
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
    return { name: parts[0] || 'overview', value: parts[1] || '', query: new URLSearchParams(query) };
  }

  function go(path) {
    location.hash = path;
  }

  function getProject(id) {
    return projects.find(project => String(project.id) === id) || projects.find(project => project.name === id);
  }

  function links(value) {
    const source = Array.isArray(value) ? value : value ? [value] : [];
    return source.map((item, index) => {
      if (typeof item === 'string') return { label: `链接 ${index + 1}`, url: item };
      return { label: item.label || item.name || item.title || `文件 ${index + 1}`, url: item.url || item.link || '', date: item.date || item.publishDate || item.publishedAt || '' };
    }).filter(item => item.label || item.url);
  }

  function safeUrl(value) {
    const text = String(value || '').trim();
    return /^(https?:|mailto:)/i.test(text) ? text : '';
  }

  function projectProgress(project) {
    if (project.status === '已完成') return 100;
    const direct = Number(project.progressPercent);
    if (Number.isFinite(direct) && direct > 0) return Math.min(100, Math.round(direct));
    if (project.status !== '进行中' || !project.startDate || !project.cycleDays) return 0;
    const start = new Date(`${project.startDate}T00:00:00+08:00`);
    return Math.max(0, Math.min(100, Math.round((Date.now() - start.getTime()) / (Number(project.cycleDays) * 86400000) * 100)));
  }

  function dateRange(project) {
    if (!project.startDate) return '未设置周期';
    const start = project.startDate.replaceAll('-', '/');
    if (!project.cycleDays) return `${start} 开始`;
    const end = new Date(`${project.startDate}T00:00:00+08:00`);
    end.setDate(end.getDate() + Number(project.cycleDays));
    return `${start} — ${end.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }).replace('/', '/')}`;
  }

  function team(project, compact = false) {
    const roles = [['项目经理', project.manager], ['写稿', project.writer], ['发稿', project.publisher], ['监测', project.monitor]];
    const people = roles.map(([role, value]) => {
      const name = Array.isArray(value) ? value[0] : String(value || '').split(/[、,，/]/)[0];
      return { role, name: name || '待补充' };
    });
    if (compact) return `<div class="team-avatars" aria-label="项目成员">${people.map(person => `<span title="${esc(person.role)}：${esc(person.name)}">${esc(person.name.slice(0, 1))}</span>`).join('')}</div>`;
    return `<div class="team-detail">${people.map(person => `<div><span>${esc(person.role)}</span><strong>${esc(person.name)}</strong></div>`).join('')}</div>`;
  }

  function statusChip(status) {
    const meta = STATUS_META[status] || STATUS_META['进行中'];
    return `<span class="status-chip ${meta.color}"><i></i>${esc(meta.label)}</span>`;
  }

  function invoice(project) {
    const value = project.invoiceStatus || '待确认';
    const className = value === '已开票' || value === '无需开票' ? 'settled' : value === '待开票' ? 'due' : '';
    return `<span class="invoice ${className}">${esc(value)}</span>`;
  }

  function projectRow(project) {
    const progress = projectProgress(project);
    const path = `/project/${encodeURIComponent(project.id)}`;
    return `
      <tr data-project-row="${esc(project.id)}" tabindex="0" role="link" aria-label="查看${esc(project.name)}项目详情">
        <td class="project-cell"><strong>${esc(project.name)}</strong><span>${esc(project.platform || '未填写平台')}</span></td>
        <td class="date-cell">${esc(dateRange(project))}</td>
        <td class="table-progress"><div><i style="width:${progress}%"></i></div><span>${progress}%</span></td>
        <td>${statusChip(project.status)}</td>
        <td>${invoice(project)}</td>
        <td>${team(project, true)}</td>
        <td><a class="row-link" href="#${path}" aria-label="进入${esc(project.name)}">→</a></td>
      </tr>`;
  }

  function projectTable(items) {
    if (!items.length) return `<div class="empty-state">没有匹配的项目</div>`;
    return `<div class="table-shell"><table class="project-table"><thead><tr><th>项目 / 平台</th><th>周期</th><th>进度</th><th>状态</th><th>开票</th><th>项目成员</th><th></th></tr></thead><tbody>${items.map(projectRow).join('')}</tbody></table></div>`;
  }

  function sidebar(current) {
    const count = status => status === 'all' ? projects.length : projects.filter(project => project.status === status).length;
    const nav = [['all', '全部项目'], ...STATUS_ORDER.map(status => [status, status])];
    return `<aside class="sidebar">
      <a class="brand" href="#/overview"><span class="brand-mark">O</span><span><b>氧气科技</b><small>项目管理</small></span></a>
      <nav class="side-nav" aria-label="项目状态">
        <p>项目状态</p>
        ${nav.map(([key, label]) => `<a class="${(current.name === 'status' && current.value === key) || (current.name === 'overview' && key === 'all') ? 'active' : ''}" href="#${key === 'all' ? '/overview' : `/status/${encodeURIComponent(key)}`}" data-route><i class="dot ${key === 'all' ? 'all' : STATUS_META[key]?.color}"></i><span>${esc(label)}</span><b>${count(key)}</b></a>`).join('')}
      </nav>
      <div class="sidebar-bottom"><a href="https://jcnquengglen.feishu.cn/base/SRjgbQqBMa6L1isu8CFcuUAAnEb?table=tbl8o6BzxfDpqxMX&view=vew234Y6ro" target="_blank" rel="noopener">在飞书中打开 ↗</a></div>
    </aside>`;
  }

  function topbar(heading, support = '') {
    return `<header class="topbar"><div><p class="greeting">氧气科技 · 项目驾驶舱</p><h1>${esc(heading)}</h1>${support ? `<p class="support">${esc(support)}</p>` : ''}</div><label class="search"><span>⌕</span><input id="projectSearch" value="${esc(state.search)}" placeholder="搜索项目、平台、成员或 KPI" /></label></header>`;
  }

  function metric(label, value, detail, tone = '') {
    return `<article class="metric ${tone}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(detail)}</small></article>`;
  }

  function overview() {
    const ongoing = projects.filter(project => project.status === '进行中');
    const finished = projects.filter(project => project.status === '已完成');
    const average = ongoing.length ? Math.round(ongoing.reduce((sum, project) => sum + projectProgress(project), 0) / ongoing.length) : 0;
    const awaitingInvoice = projects.filter(project => ['待确认', '待开票'].includes(project.invoiceStatus)).length;
    const preview = ongoing.slice(0, 6);
    return `${topbar('项目总览', '一眼看清项目状态、进度与资料沉淀。')}
      <section class="metric-grid">
        ${metric('项目总数', `${projects.length}`, '所有在管项目')}
        ${metric('进行中', `${ongoing.length}`, `平均进度 ${average}%`, 'blue')}
        ${metric('已完成', `${finished.length}`, '已进入归档阶段', 'green')}
        ${metric('待开票', `${awaitingInvoice}`, '需要确认开票信息', 'amber')}
      </section>
      <section class="overview-section project-status-band">
        <div class="section-heading"><div><h2>项目状态</h2><p>按状态进入对应项目页</p></div></div>
        <div class="status-overview">${STATUS_ORDER.map(status => {
          const items = projects.filter(project => project.status === status);
          const meta = STATUS_META[status];
          return `<a href="#/status/${encodeURIComponent(status)}" class="status-panel ${meta.color}"><span>${esc(status)}</span><strong>${items.length}</strong><em>查看 →</em></a>`;
        }).join('')}</div>
      </section>
      <section class="overview-section">
        <div class="section-heading"><div><h2>重点推进</h2><p>进行中的项目，点击进入专属页面</p></div><a href="#/status/${encodeURIComponent('进行中')}" class="text-link">查看全部</a></div>
        ${projectTable(preview.length ? preview : projects.slice(0, 6))}
      </section>`;
  }

  function statusPage(status) {
    const filtered = projects.filter(project => project.status === status).filter(matchesSearch);
    return `${topbar(`${status}项目`, `${filtered.length} 个项目 · 仅保留关键进度信息，点击卡片进入详情。`)}
      <section class="list-toolbar"><div>${statusChip(status)}<span>${filtered.length} 个项目</span></div><span>项目、平台、进度、状态、开票与项目人员</span></section>
      ${projectTable(filtered)}`;
  }

  function matchesSearch(project) {
    const query = state.search.trim().toLowerCase();
    return !query || Object.values(project).join(' ').toLowerCase().includes(query);
  }

  function parseKpi(value) {
    const rows = String(value || '').split(/\n|(?<=。)/).map(row => row.trim()).filter(Boolean);
    return rows.length ? rows.slice(0, 6) : ['暂未补充 KPI，建议在飞书表内新增本月目标与验收口径。'];
  }

  function extractDate(item) {
    const source = `${item.date || ''} ${item.label || ''} ${item.url || ''}`;
    const match = source.match(/(20\d{2})[./年-](\d{1,2})[./月-](\d{1,2})/);
    return match ? new Date(`${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}T00:00:00`) : null;
  }

  function publicationStats(project) {
    const items = links(project.publishLinks);
    const dated = items.map(item => ({ ...item, at: extractDate(item) })).filter(item => item.at && !Number.isNaN(item.at.getTime()));
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      return { key, label: `${date.getMonth() + 1}月`, value: dated.filter(item => item.at.toISOString().slice(0, 7) === key).length };
    });
    const weeks = Array.from({ length: 3 }, (_, index) => {
      const end = new Date(now); end.setHours(23, 59, 59, 999); end.setDate(end.getDate() - (2 - index) * 7);
      const start = new Date(end); start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0);
      return { label: `${start.getMonth() + 1}/${start.getDate()}`, value: dated.filter(item => item.at >= start && item.at <= end).length };
    });
    return { total: items.length, dated: dated.length, months, weeks };
  }

  function bars(items, type) {
    const max = Math.max(1, ...items.map(item => item.value));
    return `<div class="chart ${type}">${items.map(item => `<div class="bar-wrap"><strong>${item.value}</strong><i style="height:${Math.max(item.value ? 14 : 4, Math.round(item.value / max * 100))}%"></i><span>${esc(item.label)}</span></div>`).join('')}</div>`;
  }

  function kpiPane(project) {
    return `<section class="detail-pane kpi-pane"><div class="pane-heading"><div><h2>KPI</h2><p>本周期的重点目标与验收口径</p></div><span>${projectProgress(project)}% 进度</span></div><div class="kpi-rows">${parseKpi(project.kpi).map((row, index) => `<article><b>${index + 1}</b><p>${esc(row)}</p></article>`).join('')}</div></section>`;
  }

  function dataPane(project) {
    const stats = publicationStats(project);
    const description = project.currentData || '尚未补充当前数据。项目资料接入后会在这里汇总发稿、监测和关键进展。';
    return `<section class="detail-pane"><div class="pane-heading"><div><h2>当前数据</h2><p>已关联 ${stats.total} 条发稿链接${stats.dated < stats.total ? `，其中 ${stats.total - stats.dated} 条待补录发布日期` : ''}</p></div><span>近况更新</span></div>
      <div class="data-summary"><p>${esc(description)}</p></div>
      <div class="chart-grid"><article class="chart-card"><h3>每月发稿量</h3><p>按发稿链接中的发布日期自动统计</p>${bars(stats.months, 'month')}</article><article class="chart-card"><h3>近 3 周发稿量</h3><p>滚动三周，按发布日期统计</p>${bars(stats.weeks, 'week')}</article></div>
      ${stats.total && !stats.dated ? `<p class="data-hint">提示：链接标题或日期字段写成“2026-10-27”，图表即可自动归档到对应月份和周次。</p>` : ''}</section>`;
  }

  function fileItem(item, fallback) {
    const url = safeUrl(item.url);
    const label = item.label && !/^链接\s\d+$/.test(item.label) ? item.label : fallback;
    return url ? `<a class="file-row" href="${esc(url)}" target="_blank" rel="noopener"><span class="file-icon">↗</span><span>${esc(label)}</span><b>打开</b></a>` : `<span class="file-row empty-file"><span class="file-icon">·</span><span>${esc(label)}</span><b>待补充</b></span>`;
  }

  function folder(title, subtitle, icon, items, fallback) {
    return `<details class="folder" open><summary><span class="folder-icon">${icon}</span><span><strong>${esc(title)}</strong><small>${esc(subtitle)} · ${items.length} 个文件</small></span><i>⌄</i></summary><div class="folder-files">${items.length ? items.map(item => fileItem(item, fallback)).join('') : `<span class="empty-file">暂未关联文件</span>`}</div></details>`;
  }

  function materialsPane(project) {
    return `<section class="detail-pane"><div class="pane-heading"><div><h2>项目资料</h2><p>点击文件夹展开并打开原始链接</p></div></div><div class="folder-grid">${folder('发稿资料', '文章链接 / 发布记录', '▣', links(project.publishLinks), '发稿链接')}${folder('监测资料', '监测表 / 数据复盘', '◫', links(project.monitorLinks), '监测表')}${folder('其他资料', '附件 / 项目过程文件', '◇', links(project.materialLinks || project.projectFiles), '项目资料')}</div></section>`;
  }

  function briefPane(project) {
    const items = links(project.briefLinks);
    return `<section class="detail-pane"><div class="pane-heading"><div><h2>Brief</h2><p>项目需求、背景与关键信息</p></div></div><div class="brief-file">${items.length ? items.map(item => fileItem(item, '项目 Brief')).join('') : `<div><span class="document-mark">▤</span><h3>暂未关联 Brief</h3><p>在飞书项目表中添加 Brief 文件后，会直接展示在这里。</p></div>`}</div></section>`;
  }

  function reportsPane(project) {
    const all = links(project.reportLinks);
    const weekly = all.filter(item => /周报|week/i.test(item.label));
    const monthly = all.filter(item => /月报|month/i.test(item.label));
    const closing = all.filter(item => /结案|总结|复盘/i.test(item.label));
    const other = all.filter(item => !weekly.includes(item) && !monthly.includes(item) && !closing.includes(item));
    return `<section class="detail-pane"><div class="pane-heading"><div><h2>报告文件</h2><p>周报、月报与结案文件按类型沉淀</p></div></div><div class="folder-grid report-grid">${folder('周报', '项目推进与本周复盘', '▣', weekly, '周报')}${folder('月报', '月度数据与工作回顾', '◫', monthly, '月报')}${folder('结案 / 复盘', '阶段总结与结案报告', '◇', [...closing, ...other], '报告文件')}</div></section>`;
  }

  function projectPage(project, active) {
    const progress = projectProgress(project);
    const tabs = [['kpi', 'KPI'], ['data', '当前数据'], ['materials', '项目资料'], ['brief', 'Brief'], ['reports', '报告文件']];
    const panes = { kpi: kpiPane, data: dataPane, materials: materialsPane, brief: briefPane, reports: reportsPane };
    return `<header class="project-top"><a href="#/status/${encodeURIComponent(project.status)}" class="back-link">← 返回${esc(project.status)}项目</a><div class="project-title-row"><div><p class="field-label">项目专属页面</p><h1>${esc(project.name)}</h1><p>${esc(project.platform || '未填写平台')} · ${esc(dateRange(project))}</p></div><div class="project-state">${statusChip(project.status)}${invoice(project)}</div></div><div class="project-progress"><div><strong>${progress}%</strong><span>项目进度</span></div><div class="progress-track"><i style="width:${progress}%"></i></div>${team(project)}</div></header>
      <nav class="project-tabs" aria-label="项目模块">${tabs.map(([key, label]) => `<a href="#/project/${encodeURIComponent(project.id)}?tab=${key}" class="${active === key ? 'active' : ''}">${label}</a>`).join('')}</nav>${(panes[active] || panes.kpi)(project)}`;
  }

  function render() {
    const current = route();
    let content = '';
    if (current.name === 'project') {
      const project = getProject(current.value);
      content = project ? projectPage(project, current.query.get('tab') || 'kpi') : `<div class="not-found"><h1>未找到项目</h1><a href="#/overview">回到项目总览</a></div>`;
    } else if (current.name === 'status' && STATUS_ORDER.includes(current.value)) content = statusPage(current.value);
    else content = overview();
    app.innerHTML = `<div class="dashboard-shell">${sidebar(current)}<main class="content">${content}</main></div>`;
  }

  app.addEventListener('input', event => {
    if (event.target.id !== 'projectSearch') return;
    state.search = event.target.value;
    const current = route();
    if (current.name === 'status') render();
  });
  app.addEventListener('click', event => {
    const row = event.target.closest('[data-project-row]');
    if (row && !event.target.closest('a,button,input,select')) go(`/project/${encodeURIComponent(row.dataset.projectRow)}`);
  });
  app.addEventListener('keydown', event => {
    const row = event.target.closest('[data-project-row]');
    if (row && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); go(`/project/${encodeURIComponent(row.dataset.projectRow)}`); }
  });
  window.addEventListener('hashchange', render);
  if (!location.hash) location.hash = '/overview';
  else render();
})();
