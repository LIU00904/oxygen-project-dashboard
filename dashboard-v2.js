(() => {
  const app = document.querySelector('#app');
  const S = ['进行中', '待开始', '已完成', '停滞'];
  const M = { '进行中':['blue','进行中'], '待开始':['amber','待开始'], '已完成':['green','已完成'], '停滞':['red','停滞'] };
  const state = { q:'' };
  const projects = (window.FEISHU_PROJECTS || []).map(p => ({...p, id:p.id || p.recordId || p.name}));
  const activity = window.OXYGEN_PROJECT_ACTIVITY || {}, pubs = window.OXYGEN_PUBLICATION_SUMMARIES || {};
  const work = window.OXYGEN_WORK_SUMMARIES || {};
  const avatars = window.OXYGEN_MEMBER_AVATARS || {};
  const people = ((window.OXYGEN_MEMBER_WORKLOAD || {}).people || []).map(([name,total,working,last]) => ({name,total,working,last}));
  const SYNC_API = window.FEISHU_SYNC_API || 'https://oxygen-feishu-sync.liuyichen021231.workers.dev';
  const TODO_KEY = 'oxygen-dashboard-local-todos-v1';
  const AUTH_KEY = 'oxygen-dashboard-feishu-session-v1';
  const USER_KEY = 'oxygen-dashboard-feishu-user-v1';
  const e = x => String(x == null ? '' : x).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const url = x => /^(https?:|mailto:)/i.test(String(x||'')) ? String(x) : '';
  function decodeUser(value){try{return JSON.parse(decodeURIComponent(escape(atob(value))))}catch{return null}}
  function acceptFeishuCallback(){
    const current=new URL(location.href), session=current.searchParams.get('feishu_session'), encodedUser=current.searchParams.get('feishu_user');
    if(!session)return;
    localStorage.setItem(AUTH_KEY,session);
    const user=decodeUser(encodedUser||''); if(user)localStorage.setItem(USER_KEY,JSON.stringify(user));
    current.searchParams.delete('feishu_session'); current.searchParams.delete('feishu_user');
    history.replaceState({},'',`${current.pathname}${current.search}${current.hash}`);
  }
  function session(){return localStorage.getItem(AUTH_KEY)||''}
  function signedIn(){return Boolean(session())}
  function startFeishuLogin(){location.assign(`${SYNC_API}/auth/start?return_to=${encodeURIComponent(location.href)}`)}
  const icon = (x, n=18) => {
    const p = {
      grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
      folder:'<path d="M3 6.5h6l2 2h10v10.5A2 2 0 0 1 19 21H5a2 2 0 0 1-2-2z"/><path d="M3 8.5h18"/>',
      users:'<circle cx="9" cy="8" r="3"/><path d="M3.5 20c.4-3.3 2.4-5 5.5-5s5.1 1.7 5.5 5M17 11c2.2.1 3.8 1.5 4.2 3.8M16.2 5.5a2.7 2.7 0 0 1 0 5.1"/>',
      calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
      pulse:'<path d="M3 12h4l2.2-6 4.1 12 2.5-6H21"/>',
      search:'<circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4.5 4.5"/>',
      bell:'<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 22h4"/>',
      arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
      chev:'<path d="m9 18 6-6-6-6"/>',
      more:'<circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/>'
    };
    return `<svg width="${n}" height="${n}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p[x]||p.grid}</svg>`;
  };
  const r = () => {const [path,query='']=(location.hash.replace(/^#/,'')||'/overview').split('?'),a=path.split('/').filter(Boolean).map(decodeURIComponent);return{page:a[0]||'overview',key:a[1]||'',query:new URLSearchParams(query)}};
  const one = id => projects.find(p=>String(p.id)===String(id)) || projects.find(p=>p.name===id);
  const count = s => s==='全部'?projects.length:projects.filter(p=>p.status===s).length;
  const progress = p => p.status==='已完成'?100:Math.max(0,Math.min(100,Number(p.progressPercent)||0));
  const av = (name,c='') => url(avatars[name]) ? `<img class="avatar ${c}" src="${e(avatars[name])}" alt="${e(name)}" referrerpolicy="no-referrer">` : `<span class="avatar fallback ${c}">${e((name||'待').slice(0,1))}</span>`;
  const badge = s => {const [tone,label]=M[s]||M['进行中'];return `<span class="status ${tone}"><i></i>${e(label)}</span>`};
  const dt = x => x ? new Date(`${x}T00:00:00`).toLocaleDateString('zh-CN',{month:'short',day:'numeric'}) : '—';
  const projectTime = p => {
    if (!p.startDate) return '未设置周期';
    const start = new Date(`${p.startDate}T00:00:00`);
    let end = p.endDate ? new Date(`${p.endDate}T00:00:00`) : null;
    if (!end && Number(p.cycleDays) > 0) { end = new Date(start); end.setDate(end.getDate() + Number(p.cycleDays)); }
    return end && !Number.isNaN(end.getTime()) ? `${dt(p.startDate)} — ${dt(end.toISOString().slice(0, 10))}` : `${dt(p.startDate)} 起`;
  };
  const fileLinks = x => (Array.isArray(x)?x:x?[x]:[]).map((v,i)=>{
    if(typeof v==='string') return {label:`链接 ${i+1}`,url:v,sourceUrl:v,fileType:''};
    const fileToken=v.fileToken||v.file_token||v.token||'';
    const label=v.label||v.name||`文件 ${i+1}`;
    const ticket=session();
    const proxy=fileToken ? `${SYNC_API}/download?file_token=${encodeURIComponent(fileToken)}&name=${encodeURIComponent(label)}${ticket?`&session=${encodeURIComponent(ticket)}`:''}` : '';
    return {label,url:proxy||v.url||v.link||'',fileToken,sourceUrl:v.url||v.link||'',fileType:v.fileType||v.mimeType||v.type||''};
  });

  function sidebar(cur) {
    const branches = S.map(s=>`<a class="branch ${cur.page==='status'&&cur.key===s?'active':''}" href="#/status/${encodeURIComponent(s)}"><i class="${M[s][0]}"></i><span>${s}</span><b>${count(s)}</b></a>`).join('');
    return `<aside class="sidebar"><a href="#/overview" class="brand"><b>O</b><span><strong>氧气科技</strong><small>PROJECT OPERATIONS</small></span></a><nav>
      <a class="nav ${cur.page==='overview'?'active':''}" href="#/overview">${icon('grid')}<span>Dashboard</span></a>
      <section class="project-tree"><button class="nav tree-toggle">${icon('folder')}<span>项目</span>${icon('chev',15)}</button><div class="tree"><a class="branch ${cur.page==='status'&&cur.key==='全部'?'active':''}" href="#/status/%E5%85%A8%E9%83%A8"><i class="violet"></i><span>全部项目</span><b>${projects.length}</b></a>${branches}</div></section>
      <a class="nav ${cur.page==='workload'?'active':''}" href="#/workload">${icon('users')}<span>成员任务</span></a>
      <a class="nav ${cur.page==='calendar'?'active':''}" href="#/calendar">${icon('calendar')}<span>日历待办</span><em>Beta</em></a>
    </nav><div class="side-footer"><a href="https://jcnquengglen.feishu.cn/base/SRjgbQqBMa6L1isu8CFcuUAAnEb?table=tbl8o6BzxfDpqxMX&view=vew234Y6ro" target="_blank" rel="noopener">在飞书中打开 ${icon('arrow',14)}</a><small>已通过飞书企业登录</small></div></aside>`;
  }
  function shell(body) {return `<style>.metric.blue,.metric.green,.metric.violet,.status.blue,.status.green,.status.amber,.status.red{background:transparent!important}.member-zone{border-top:1px solid var(--line);padding-top:25px;margin-top:30px}.member-zone-title{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:17px}.member-zone-title h2{font-size:17px;margin:0}.member-zone-title p{font-size:11px;color:#8190a7;margin:0}.member-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.person-card{min-height:132px;border:1px solid var(--line);background:#ffffffa8;border-radius:14px;padding:14px;text-align:left;color:var(--ink);transition:.18s}.person-card:hover,.person-card.expanded{border-color:#a9c8ff;box-shadow:0 12px 30px #2a6ce414}.person-card-top{display:flex;align-items:center;gap:10px}.person-card .avatar{width:38px;height:38px}.person-card-top span{min-width:0;flex:1}.person-card-top b,.person-card-top small{display:block}.person-card-top b{font-size:13px}.person-card-top small{font-size:10px;color:#8391a6;margin-top:3px}.person-card-top em{width:22px;height:22px;display:grid;place-items:center;border-radius:50%;font-style:normal;background:#eef4ff;color:var(--blue);font-size:16px}.person-card-stats{display:flex;gap:17px;margin:13px 0 0 48px}.person-card-stats span{display:grid;gap:2px}.person-card-stats b{font-size:16px;color:var(--blue)}.person-card-stats small{font-size:9px;color:#8997aa}.person-focus{display:none;margin-top:15px;padding-top:12px;border-top:1px solid #e7eef8}.person-card.expanded .person-focus{display:block}.person-focus>span{display:block;font-size:10px;color:#74839b;margin-bottom:8px}.focus-projects{display:flex;flex-wrap:wrap;gap:5px}.focus-projects a{font-size:10px;text-decoration:none;color:#3169c9;background:#edf4ff;border-radius:5px;padding:5px 7px}.inactive-zone{opacity:.84}.inactive-zone .person-card{background:#fbfcfd;border-style:dashed}@media(max-width:1050px){.member-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.member-cards{grid-template-columns:1fr}.person-card{min-height:120px}}</style><div class="aurora"></div><div class="app-shell">${sidebar(r())}<main class="workspace">${body}</main></div><aside class="reader" id="reader" aria-hidden="true"><header><div><span>文件阅读</span><b id="reader-title">未选择文件</b></div><div><a id="reader-open" href="#" target="_blank" rel="noopener">在飞书打开 ${icon('arrow',14)}</a><button type="button" data-reader-close aria-label="关闭阅读器">×</button></div></header><div class="reader-frame"><div id="reader-preview" aria-live="polite"></div><div id="reader-empty"><strong>选择一个文档开始阅读</strong><span>PDF、Excel、Word 与 PPT 会在浏览器本地解析，不会上传到第三方。</span></div></div></aside><div class="reader-scrim" data-reader-close></div>`;}
  function authPage(){return `<main class="auth-gate"><section><a class="brand" href="#/overview"><b>O</b><span><strong>氧气科技</strong><small>PROJECT OPERATIONS</small></span></a><div><h1>用飞书企业账号进入</h1><p>项目、报告和发稿数据仅对已授权的公司成员开放。</p><button class="primary-action" data-feishu-login>飞书登录 ${icon('arrow',16)}</button><small>登录后可直接阅读已授权文件，或跳转至对应的发稿汇总表与监测表。</small></div></section></main>`}
  function header(title,sub,actions='') {return `<header class="page-head"><div><p>项目运营 / ${e(title)}</p><h1>${e(title)}</h1><small>${e(sub||'')}</small></div><div class="head-actions"><button class="bell" data-bell aria-label="待办提醒">${icon('bell')}<i></i></button>${actions}</div></header>`;}
  function metric(name,value,note,tone='') {return `<article class="metric ${tone}"><span>${e(name)}</span><strong>${e(value)}</strong><small>${e(note)}</small></article>`;}
  function bars(rows,kind='') {const max=Math.max(...rows.map(x=>x.value),1);return `<div class="bars ${kind}">${rows.map(x=>`<button type="button"><span>${e(x.name||x.label)}</span><i><b style="width:${Math.max(2,Math.round(x.value/max*100))}%"></b></i><strong>${x.value}</strong><em>${e(x.detail||'')}</em></button>`).join('')}</div>`;}
  function projectTable(list) {
    return `<div class="data-table"><div class="table-header"><span>项目</span><span>项目时间</span><span>进度</span><span>负责人</span><span>状态</span></div>${list.map(p=>{
      const names=[p.manager,p.writer,p.publisher,p.monitor].filter(Boolean).map(x=>String(x).split(/[、,，/]/)[0]).filter((x,i,a)=>a.indexOf(x)===i).slice(0,2);
      return `<a href="#/project/${encodeURIComponent(p.id)}" class="project-row"><span><b>${e(p.name)}</b><small>${e(p.platform||'项目资料待补充')}</small></span><span class="project-time">${e(projectTime(p))}</span><span class="progress"><i><b style="width:${progress(p)}%"></b></i><em>${progress(p)}%</em></span><span class="avatar-stack">${names.length?names.map(x=>av(x)).join(''):'<i>待</i>'}</span><span>${badge(p.status)}</span></a>`;
    }).join('')}</div>`;
  }
  function overview() {
    const active=projects.filter(p=>p.status==='进行中'),done=projects.filter(p=>p.status==='已完成');
    const focus=Object.entries(activity).map(([name,x])=>({name,value:x.main.value,detail:x.main.label})).sort((a,b)=>b.value-a.value).slice(0,5);
    const busy=people.filter(x=>x.working).sort((a,b)=>b.working-a.working).slice(0,7);
    const avg=active.length?Math.round(active.reduce((n,p)=>n+progress(p),0)/active.length):0;
    return shell(`${header('项目总览','用一张运营工作台看清交付重心、项目节奏和需要管理动作的地方。','<div class="period"><button class="active">本周</button><button>本月</button><button>本季度</button></div>')}
      <section class="metrics">${metric('在管项目',projects.length,'全量项目池')}${metric('正在推进',active.length,`平均进度 ${avg}%`,'blue')}${metric('已完成',done.length,'进入归档或复盘','green')}${metric('任务表记录','4,416','完整飞书任务表','violet')}</section>
      <section class="overview-grid"><article class="focus-panel"><div class="panel-title"><div><h2>本期工作重心</h2><p>近两周工作记录中，哪些项目与任务量最集中</p></div><button class="text-button">按项目 ${icon('chev',14)}</button></div>${bars(focus,'focus')}</article>
      <article class="status-panel"><div class="panel-title"><div><h2>项目分布</h2><p>按当前项目状态</p></div><button class="round-button">${icon('more')}</button></div><div class="donut-layout"><div class="donut" style="--a:${Math.round(count('进行中')/projects.length*360)}deg;--b:${Math.round((count('进行中')+count('已完成'))/projects.length*360)}deg;--c:${Math.round((count('进行中')+count('已完成')+count('待开始'))/projects.length*360)}deg"><strong>${projects.length}</strong><small>项目总数</small></div><div class="legend">${S.map(x=>`<a href="#/status/${encodeURIComponent(x)}"><i class="${M[x][0]}"></i><span>${x}</span><b>${count(x)}</b></a>`).join('')}</div></div></article></section>
      <section class="analytics-grid investment-grid"><article class="analytics-card"><div class="panel-title"><div><h2>本期项目投入</h2><p>近两周已记录的工作量。数字代表任务记录，不把它误当成“交付进度”。</p></div><a class="mini-link" href="#/calendar">查看待办 →</a></div><div class="investment-list">${focus.map((x,i)=>`<a href="#/project/${encodeURIComponent(projects.find(p=>p.name===x.name)?.id||x.name)}"><span><i style="--tone:${['#296cf3','#7b61e8','#20b982','#f09a37','#ef6672'][i]}"></i><b>${e(x.name)}</b><small>${e(x.detail)}</small></span><strong>${x.value}<em>条</em></strong><div><i style="width:${Math.max(8,Math.round(x.value/Math.max(...focus.map(y=>y.value))*100))}%"></i></div></a>`).join('')}</div></article><article class="analytics-card attention-card"><div class="panel-title"><div><h2>管理动作</h2><p>适合本周例会直接带走的三件事</p></div></div><ol><li><i>01</i><span><b>推进进行中项目</b><small>${active.length} 个项目正在交付，先从项目工作台看下一步。</small></span></li><li><i>02</i><span><b>区分发布与监测</b><small>链接总量不等于效果，监测数据按新鲜度单独复核。</small></span></li><li><i>03</i><span><b>处理高负荷成员</b><small>当前 ${busy[0] ? e(busy[0].name) : '—'} 的进行中任务最多。</small></span></li></ol></article></section>
      <section class="band"><div class="section-title"><div><h2>重点推进</h2><p>不是所有项目都要同时盯，先处理正在交付的工作。</p></div><a href="#/status/%E8%BF%9B%E8%A1%8C%E4%B8%AD">查看全部 ${icon('arrow',15)}</a></div>${projectTable(active.slice(0,6))}</section>
      <section class="workforce"><div class="section-title"><div><h2>团队负荷</h2><p>完整任务表 · 先看有进行中事项的成员</p></div><a href="#/workload">查看成员任务 ${icon('arrow',15)}</a></div><div class="people-rail">${busy.map(x=>`<a href="#/workload?member=${encodeURIComponent(x.name)}" class="person-chip">${av(x.name)}<span><b>${e(x.name)}</b><small>${x.working} 项进行中</small></span><i style="--load:${Math.min(100,x.working/31*100)}%"></i></a>`).join('')}</div></section>`);
  }
  function statusPage(status) {
    const items=(status==='全部'?projects:projects.filter(p=>p.status===status)).filter(p=>!state.q||Object.values(p).join(' ').toLowerCase().includes(state.q.toLowerCase()));
    return shell(`${header(status==='全部'?'全部项目':status+'项目',`${items.length} 个项目。点开任意项目查看专属数据与资料。`,`<label class="search-box">${icon('search',16)}<input id="search" value="${e(state.q)}" placeholder="搜索项目、平台或负责人"></label>`)}
      <section class="status-summary">${S.map(x=>`<a href="#/status/${encodeURIComponent(x)}" class="${status===x?'selected':''}"><i class="${M[x][0]}"></i><span>${x}</span><strong>${count(x)}</strong></a>`).join('')}</section><section class="band project-list">${projectTable(items)}</section>`);
  }
  function tiny(a,b,c){return `<article class="tiny-stat"><span>${e(a)}</span><strong>${e(b)}</strong><small>${e(c)}</small></article>`;}
  function column(data, empty) {if(!data.length)return `<p class="chart-empty">${e(empty)}</p>`;const max=Math.max(...data.map(x=>x.value));return `<div class="column-chart">${data.map(x=>`<div><strong>${x.value}</strong><i style="height:${Math.max(8,Math.round(x.value/max*112))}px"></i><span>${e(x.label)}</span></div>`).join('')}</div>`;}
  function stageFor(p){
    const steps=['需求确认','策略与关键词','内容生产','发布执行','监测复盘'];
    const index=p.status==='待开始'?0:p.status==='已完成'?4:p.status==='停滞'?Math.min(3,Math.max(0,Math.round(progress(p)/25)-1)):Math.min(4,Math.max(1,Math.floor(progress(p)/25)));
    return {steps,index};
  }
  function readTodos(){try{return JSON.parse(localStorage.getItem(TODO_KEY)||'[]')}catch{return []}}
  function writeTodos(items){localStorage.setItem(TODO_KEY,JSON.stringify(items));}
  function updateTodo(id, changes){
    const saved=readTodos(), all=todos(), base=all.find(item=>item.id===id);
    const next={...(saved.find(item=>item.id===id)||base||{id}),...changes};
    const index=saved.findIndex(item=>item.id===id);
    if(index<0) saved.push(next); else saved[index]=next;
    writeTodos(saved);
  }
  function isoOffset(days){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+days);return d.toISOString().slice(0,10);}
  function projectTodos(p,a,offset){return (a.next||[]).slice(0,2).map((title,i)=>({id:`seed-${p.id}-${i}`,title,project:p.name,owner:(a.people?.[0]?.[0]||p.manager||'待分配'),date:isoOffset(offset+i*2),status:i?'doing':'todo',seed:true}));}
  function todos(){
    const seeded=projects.filter(p=>p.status==='进行中'||p.status==='待开始').slice(0,8).flatMap((p,i)=>projectTodos(p,activity[p.name]||{next:['补齐项目任务']},i));
    const local=readTodos(); const byId=new Map(seeded.map(x=>[x.id,x])); local.forEach(x=>byId.set(x.id,x)); return [...byId.values()];
  }
  function todoStatusLabel(s){return ({todo:'待处理',doing:'进行中',done:'已完成'})[s]||'待处理'}
  function ymd(d){return d.toISOString().slice(0,10)}
  function nextWeekday(weekday){
    const today=new Date();today.setHours(0,0,0,0);const d=new Date(today);
    let delta=(weekday-d.getDay()+7)%7;if(delta===0) delta=7;d.setDate(d.getDate()+delta);return d;
  }
  function weekdayAfter(base, weekday){const d=new Date(base);d.setHours(0,0,0,0);let delta=(weekday-d.getDay()+7)%7;if(delta===0)delta=7;d.setDate(d.getDate()+delta);return d}
  function nextMonthDay(day){const today=new Date();today.setHours(0,0,0,0);let d=new Date(today.getFullYear(),today.getMonth(),day);if(d<=today)d=new Date(today.getFullYear(),today.getMonth()+1,day);return d}
  function dayLabel(d){return d.toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'short'}).replace('周','周')}
  function shortDate(d){return `${d.getMonth()+1}月${d.getDate()}日`}
  function controlFor(p){
    if(p.name!=='太太乐松茸鲜') return null;
    const start=new Date('2026-04-14T00:00:00');const today=new Date();today.setHours(0,0,0,0);
    const week=Math.floor((today-start)/604800000)+1;
    const monday=new Date(today);monday.setDate(today.getDate()-(today.getDay()+6)%7);
    const sunday=new Date(monday);sunday.setDate(monday.getDate()+6);
    const nextReport=nextWeekday(3);
    const live=(window.OXYGEN_LIVE_PUBLICATION_DATA||{})[p.name];
    const verified=Boolean(live&&Number.isFinite(live.validCount)&&live.updatedAt);
    return {target:500,verified,achieved:verified?live.validCount:null,updatedAt:verified?live.updatedAt:null,week,weekRange:`${shortDate(monday)} — ${shortDate(sunday)}`,start,
      milestones:[
        {kind:'周报',title:'上传周报',date:nextReport,owner:'刘依晨',note:'提交本周内容发布周报及数据明细'},
        {kind:'发稿',title:'上传稿件',date:weekdayAfter(nextReport,5),owner:'彭安迪',note:'提交当周直出稿件与发布链接'},
        {kind:'月报',title:'提交月报',date:nextMonthDay(10),owner:'徐奕旸',note:'提交月度复盘与下月计划'}
      ],
      months:verified&&Array.isArray(live.months)?live.months:[],
      members:[['刘依晨',84,'发布、写稿与数据'],['彭安迪',3,'手动与信源监测'],['徐奕旸',3,'周报与链接回填'],['徐怡飞',1,'信源监测']]
    };
  }
  function controlSyncPage(p,c){
    const schedule=c.milestones.map((item,i)=>`<article class="cadence-event ${i===0?'next':''}"><span class="cadence-number">${i+1}</span><div><small>${dayLabel(item.date)}</small><b>${e(item.title)}</b><p>${e(item.note)}</p></div><em>${Math.max(0,Math.ceil((item.date-new Date())/86400000))} 天后</em></article>`).join('');
    return shell(`${header(p.name,'项目看板 · 发稿数据以源表的有效链接为准。',`<a class="back-link" href="#/status/${encodeURIComponent(p.status)}">${icon('chev',15)} 返回列表</a>`)}
      <nav class="command-tabs"><button class="active" data-scroll="command-kpi">项目概览</button><button data-scroll="command-cadence">工作计划</button><button data-scroll="command-files">文件资料</button></nav>
      <section class="kpi-command" id="command-kpi"><div class="week-readout"><span>当前周次</span><strong>第 ${c.week} 周</strong><small>${e(c.weekRange)}</small><b>下一个节点：${dayLabel(c.milestones[0].date)} · ${e(c.milestones[0].title)}</b></div><div class="kpi-core sync-kpi"><div><span>实时有效发稿</span><strong>—<i> 篇</i></strong><small>旧页面中的历史快照已撤下；正在从太太乐发稿表逐条核验链接。</small></div><aside><span>项目目标</span><strong><b>${c.target}</b> 篇</strong><small>仅计有发布链接的有效稿；拒稿、待发布不计入。</small></aside></div><div class="kpi-next"><span>数据状态</span><b>正在读取 4.2、5–10 月各分表</b><small>核验完成后才显示分月、总量、缺口及同步时间。</small></div></section>
      <section class="cadence-board" id="command-cadence"><div class="command-section-title"><div><h2>工作节奏</h2><p>按固定交付节点提醒，不再用模糊的通用阶段条。</p></div><a href="#/calendar?project=${encodeURIComponent(p.name)}">查看完整日历 ${icon('arrow',14)}</a></div><div class="cadence-line"><div class="today-mark"><b>今天</b><small>${dt(ymd(new Date()))}</small></div>${schedule}</div></section>
      ${dataSources(p)}<section class="command-files" id="command-files"><div class="command-section-title"><div><h2>文件与报告</h2><p>周报、月报和监测资料在此统一查看；完成飞书授权后可直接阅读。</p></div></div><div class="command-file-grid">${files('周报 / 月报 / 监测报告',fileLinks(p.reportLinks),'calendar')}${files('Brief 与项目资料',fileLinks(p.briefLinks),'folder')}</div></section>`);
  }
  function files(title, list, type) {return `<section class="file-block"><div class="file-label">${icon(type)}<div><h3>${e(title)}</h3><p>${list.length?`${list.length} 个文件或链接`:'暂未归档'}</p></div></div>${list.length?'<div class="files">'+list.map((x,i)=>`<button type="button" class="file-read" data-reader-url="${e(url(x.url))}" data-reader-source="${e(url(x.sourceUrl)||url(x.url))}" data-reader-title="${e(x.label||'文件 '+(i+1))}" data-reader-type="${e(x.fileType||'')}"><span>${icon('folder',16)}</span><b>${e(x.label||'文件 '+(i+1))}</b><small>在线阅读</small>${icon('arrow',14)}</button>`).join('')+'</div>':'<p class="empty-copy">飞书项目表暂未补充该资料。</p>'}</section>`;}
  function dataSources(p){
    const sources=[...fileLinks(p.publishLinks).map(x=>({label:'发稿汇总表',detail:'查看全部发布链接与分月明细',url:x.sourceUrl||x.url})),...fileLinks(p.monitorLinks).map(x=>({label:'监测表',detail:'查看关键词与排名监测数据',url:x.sourceUrl||x.url}))];
    return sources.length?`<section class="data-sources"><div><h2>项目数据入口</h2><p>登录飞书后，可直接打开项目对应的源表。</p></div><div>${sources.map(x=>`<a href="${e(url(x.url))}" target="_blank" rel="noopener"><span>${icon('grid',17)}</span><b>${e(x.label)}</b><small>${e(x.detail)}</small>${icon('arrow',15)}</a>`).join('')}</div></section>`:'';
  }
  function controlProjectPage(p,c){
    if(!c.verified)return controlSyncPage(p,c);
    const reports=fileLinks(p.reportLinks), brief=fileLinks(p.briefLinks), pct=Math.round(c.achieved/c.target*100), gap=c.target-c.achieved;
    const max=Math.max(...c.months.map(x=>x[1]));
    const schedule=c.milestones.map((item,i)=>`<article class="cadence-event ${i===0?'next':''}"><span class="cadence-number">${i+1}</span><div><small>${dayLabel(item.date)}</small><b>${e(item.title)}</b><p>${e(item.note)}</p></div><em>${Math.ceil((item.date-new Date())/86400000)} 天后</em></article>`).join('');
    return shell(`${header(p.name,'项目看板 · 以 KPI、节奏和下一节点驱动交付。',`<a class="back-link" href="#/status/${encodeURIComponent(p.status)}">${icon('chev',15)} 返回列表</a>`)}
      <nav class="command-tabs"><button class="active" data-scroll="command-kpi">项目概览</button><button data-scroll="command-cadence">工作计划</button><button data-scroll="command-data">数据分析</button><button data-scroll="command-files">文件资料</button></nav>
      <section class="kpi-command" id="command-kpi"><div class="week-readout"><span>当前周次</span><strong>第 ${c.week} 周</strong><small>${e(c.weekRange)}</small><b>本周还有 ${(new Date(c.milestones[0].date)-new Date())>0?Math.ceil((new Date(c.milestones[0].date)-new Date())/86400000):0} 天进入周报节点</b></div><div class="kpi-core"><div><span>实时有效发稿</span><strong>${c.achieved}<i>/ ${c.target} 篇</i></strong><progress max="${c.target}" value="${c.achieved}"></progress><small>已完成 ${pct}% · 同步于 ${dt(c.updatedAt)}</small></div><aside><span>距离 KPI</span><strong>还差 <b>${gap}</b> 篇</strong><small>口径：仅统计有发布链接的有效稿</small></aside></div><div class="kpi-next"><span>下一个关键节点</span><b>${dayLabel(c.milestones[0].date)} · ${e(c.milestones[0].title)}</b><small>${e(c.milestones[0].owner)}负责</small></div></section>
      <section class="cadence-board" id="command-cadence"><div class="command-section-title"><div><h2>工作节奏</h2><p>按固定交付节点提醒，不再用模糊的通用阶段条。</p></div><a href="#/calendar?project=${encodeURIComponent(p.name)}">查看完整日历 ${icon('arrow',14)}</a></div><div class="cadence-line"><div class="today-mark"><b>今天</b><small>${dt(ymd(new Date()))}</small></div>${schedule}</div></section>
      <section class="command-lower" id="command-data"><article class="publication-panel"><div class="command-section-title"><div><h2>发布完成情况</h2><p>实时有效链接计数 · 更新于 ${dt(c.updatedAt)}</p></div><b>${c.achieved} 篇</b></div><div class="month-bars">${c.months.map(([label,value])=>`<div><strong>${value}</strong><i style="height:${Math.max(14,Math.round(value/max*128))}px"></i><span>${e(label)}</span></div>`).join('')}</div><div class="kpi-footnote"><b>数据口径</b><span>仅统计有发布链接的有效稿；拒稿与待发布不计入。当前距目标 ${gap} 篇。</span></div></article><article class="owner-panel"><div class="command-section-title"><div><h2>团队分工</h2><p>本期工作记录中的主力参与者。</p></div><a href="#/workload">查看成员 ${icon('arrow',14)}</a></div><div class="command-owners">${c.members.map(([name,value,job])=>`<a href="#/workload?member=${encodeURIComponent(name)}">${av(name)}<span><b>${e(name)}</b><small>${e(job)}</small></span><strong>${value}</strong></a>`).join('')}</div></article></section>
      ${dataSources(p)}<section class="command-files" id="command-files"><div class="command-section-title"><div><h2>文件与报告</h2><p>周报、月报和监测资料在此统一查看；完成飞书授权后可直接阅读。</p></div><span>${reports.length+brief.length} 份</span></div><div class="command-file-grid">${files('周报 / 月报 / 监测报告',reports,'calendar')}${files('Brief 与项目资料',brief,'folder')}</div></section>`);
  }
  function projectPage(id) {
    const p=one(id); if(!p)return shell(`${header('项目未找到','该项目可能已被移动或删除。')}<a class="back-link" href="#/overview">返回项目总览</a>`);
    const control=controlFor(p); if(control)return controlProjectPage(p,control);
    const a=activity[p.name]||{period:'当前项目周期',main:{label:'待补充工作记录',value:0,detail:'暂无标准化任务分布'},next:['补齐近期任务','更新项目数据'],types:[],people:[]};
    const pub=pubs[p.name]||{total:fileLinks(p.publishLinks).length,periods:[],weeks:[],source:'项目发稿链接'};
    const docs=[['项目资料',fileLinks(p.tableUrl?[{label:'飞书项目记录',url:p.tableUrl}]:[]),'folder'],['Brief',fileLinks(p.briefLinks),'pulse']];
    const reports=fileLinks(p.reportLinks);
    const taskBars=(a.types||[]).map(([label,value])=>({label,value}));
    const stage=stageFor(p);
    const projectTodo=todos().filter(item=>item.project===p.name).slice(0,5);
    return shell(`${header(p.name,`${p.status} · ${p.platform||'项目平台待补充'}`,`<a class="back-link" href="#/status/${encodeURIComponent(p.status)}">${icon('chev',15)} 返回列表</a>`)}
      <section class="project-hero"><div><div class="hero-status">${badge(p.status)}<span>${e(a.period)}</span></div><h2>${e(a.main.label)}</h2><p>${e(a.main.detail)}</p><div class="next"><b>未来两周主线</b>${a.next.map(x=>`<span>${e(x)}</span>`).join('')}</div></div><div class="hero-progress"><span>项目进度</span><strong>${progress(p)}%</strong><i><b style="width:${progress(p)}%"></b></i><small>${p.startDate?`启动于 ${dt(p.startDate)}`:'尚未设置启动时间'}</small></div></section>
      <section class="project-stats">${tiny('有效发布链接',pub.total,pub.source||'尚未验证链接')}${tiny('本期工作量',a.main.value||0,`${a.main.label} · ${a.period}`)}${tiny('项目状态',p.status,p.invoiceStatus||'开票状态待确认')}${tiny('可直接阅读',docs.reduce((n,[,x])=>n+x.length,0)+reports.length,'资料与报告文件')}</section>
      <section class="project-workbench"><div class="workbench-top"><div><span>PROJECT WORKBENCH</span><h2>项目工作台</h2><p>把当前阶段、下一步和资料放在同一个工作面上。</p></div><a href="#/calendar?project=${encodeURIComponent(p.name)}">查看项目待办 ${icon('arrow',14)}</a></div><div class="workbench-grid"><article class="stage-board"><div class="stage-heading"><b>项目阶段</b><small>${e(stage.steps[stage.index])} · 当前节点</small></div><div class="stage-line">${stage.steps.map((step,i)=>`<div class="${i<stage.index?'done':i===stage.index?'current':''}"><i>${i<stage.index?'✓':i+1}</i><span>${e(step)}</span></div>`).join('')}</div><div class="stage-detail"><b>${e(stage.steps[stage.index])}</b><p>${p.status==='待开始'?'项目尚未启动，建议先明确负责人、项目时间和 Brief。':e(a.main.detail)}</p></div></article><aside class="next-board"><div><b>下一步计划</b><a href="#/calendar?project=${encodeURIComponent(p.name)}">添加待办 +</a></div>${projectTodo.length?projectTodo.map(item=>`<label class="todo-line"><input type="checkbox" data-todo-toggle="${e(item.id)}" ${item.status==='done'?'checked':''}><span><b>${e(item.title)}</b><small>${e(item.owner)} · ${dt(item.date)}</small></span></label>`).join(''):`<p>暂未安排明确待办，可从日历待办中补充。</p>`}</aside></div><nav class="workbench-tabs"><button type="button" data-scroll="project-data">数据</button><button type="button" data-scroll="project-people">协作成员</button><button type="button" data-scroll="project-files">文件资料</button><button type="button" data-scroll="project-reports">报告中心</button></nav></section>
      <section class="detail-grid" id="project-data"><article class="chart-card"><div class="panel-title"><div><h2>当前数据</h2><p>有效发布链接与近三周工作量分开计数</p></div></div><div class="chart-tabs"><button class="active" data-tab="m">发布分布</button><button data-tab="w">近三周</button></div><div data-view="m">${column((pub.periods||[]).map(([label,value])=>({label,value})), '当前发稿表未提供可按日期统计的数据')}</div><div data-view="w" class="hidden">${column((pub.weeks||[]).map(([label,value])=>({label,value})), '发稿表未提供逐条发布日期，无法虚构近三周数据。')}</div></article>
      <article class="chart-card" id="project-people"><div class="panel-title"><div><h2>人物与任务</h2><p>本期工作记录中的具体任务分布</p></div></div>${taskBars.length?`<div class="task-keys">${taskBars.map(x=>`<span><i></i>${e(x.label)} <b>${x.value}</b></span>`).join('')}</div>`:''}<div class="people-list">${a.people.length?a.people.map(([n,num,work])=>`<a href="#/workload?member=${encodeURIComponent(n)}">${av(n)}<span><b>${e(n)}</b><small>${e(work)}</small></span><strong>${num}</strong></a>`).join(''):'<p class="chart-empty">等待同步可归属的项目任务。</p>'}</div></article></section>
      <section class="data-note">${icon('pulse')}<div><h3>数据说明</h3><p>${e(p.currentData||'暂无结构化当前数据。请从飞书项目表中的发稿链接、监测表与周报分别补充。')}</p></div></section>
      <section class="report-center" id="project-reports"><div class="section-title"><div><h2>报告中心</h2><p>周报、月报、监测报告独立归档；完成飞书授权后，PDF 与图片会优先在此直接阅读。</p></div><span>${reports.length} 份报告</span></div>${files('报告文件',reports,'calendar')}</section>
      <section class="materials" id="project-files"><div class="section-title"><div><h2>项目资料</h2><p>Brief 和项目源数据可在右侧阅读器中直接打开。</p></div></div>${docs.map(x=>files(...x)).join('')}</section>`);
  }
  function memberProjects(name){
    const current = Object.entries(activity).filter(([,x])=>(x.people||[]).some(([n])=>n===name)).map(([n])=>n);
    const historical = Object.entries(work).map(([project,summary])=>{
      const record=(summary.members||[]).find(([member])=>member===name);
      return record ? { project, total:record[1]||0 } : null;
    }).filter(Boolean).sort((a,b)=>b.total-a.total).map(item=>item.project);
    return [...new Set([...current,...historical])].slice(0,4);
  }
  function workloadPage(){
    const selected=r().query.get('member')||'', cutoff='2026-09-28';
    const rows=[...people].sort((a,b)=>b.working-a.working||b.last.localeCompare(a.last)||b.total-a.total);
    const active=rows.filter(person=>person.last>=cutoff), inactive=rows.filter(person=>person.last<cutoff), currentTotal=rows.reduce((n,x)=>n+x.working,0);
    const card=person=>{const focus=memberProjects(person.name);return `<button type="button" class="person-card ${selected===person.name?'expanded':''}" data-member-card="${e(person.name)}" aria-expanded="${selected===person.name}"><div class="person-card-top">${av(person.name)}<span><b>${e(person.name)}</b><small>最近更新 ${dt(person.last)}</small></span><em>+</em></div><div class="person-card-stats"><span><b>${person.working}</b><small>进行中</small></span><span><b>${person.total.toLocaleString()}</b><small>累计记录</small></span></div><div class="person-focus"><span>主要关注项目</span><div class="focus-projects">${focus.length?focus.map(project=>{const target=projects.find(p=>p.name===project);return `<a href="#/project/${encodeURIComponent(target?.id||project)}">${e(project)}</a>`;}).join(''):'<small>项目归属待从飞书工作记录补齐</small>'}</div></div></button>`;};
    return shell(`${header('成员任务','以近期活跃成员为主；点开名片查看其主要关注的项目。')}
      <section class="team-metrics">${metric('完整任务记录','4,416','已核对飞书图表')}${metric('当前进行中',currentTotal,'按任务状态进行中','blue')}${metric('近一个月活跃',active.length,'有新增任务记录','green')}<article class="source-note">${icon('pulse')}<span>按最近任务更新日排序，不再用项目摘要推算个人数据</span></article></section>
      <section class="member-zone"><div class="member-zone-title"><div><h2>近期活跃成员</h2><p>近一个月有任务更新 · 优先展示</p></div><b>${active.length} 人</b></div><div class="member-cards">${active.map(card).join('')}</div></section>
      <section class="member-zone inactive-zone"><div class="member-zone-title"><div><h2>不活跃成员</h2><p>近一个月未新增任务记录，历史数据仍保留</p></div><b>${inactive.length} 人</b></div><div class="member-cards">${inactive.map(card).join('')}</div></section>`);
  }
  function calendarPage(){
    const query=r().query, mode=query.get('mode')==='kanban'?'kanban':'week', project=query.get('project')||'';
    const items=todos().filter(x=>!project||x.project===project).sort((a,b)=>a.date.localeCompare(b.date));
    const today=new Date(); today.setHours(0,0,0,0); const monday=new Date(today); monday.setDate(today.getDate()-(today.getDay()+6)%7);
    const days=Array.from({length:7},(_,i)=>{const d=new Date(monday);d.setDate(monday.getDate()+i);return {date:d.toISOString().slice(0,10),label:d.toLocaleDateString('zh-CN',{weekday:'short'}),num:d.getDate(),today:d.toDateString()===today.toDateString()};});
    const taskCard=item=>`<article class="calendar-task ${item.status==='done'?'is-done':''}"><label><input type="checkbox" data-todo-toggle="${e(item.id)}" ${item.status==='done'?'checked':''}><span></span></label><div><b>${e(item.title)}</b><small>${e(item.project)} · ${e(item.owner)}</small></div><button type="button" data-todo-menu="${e(item.id)}">···</button></article>`;
    const modes=`<div class="calendar-switch"><a class="${mode==='week'?'active':''}" href="#/calendar${project?`?project=${encodeURIComponent(project)}`:''}">周视图</a><a class="${mode==='kanban'?'active':''}" href="#/calendar?mode=kanban${project?`&project=${encodeURIComponent(project)}`:''}">看板视图</a></div>`;
    const filters=`<select class="calendar-project-filter" data-calendar-project><option value="">全部项目</option>${projects.filter(p=>p.status!=='已完成').map(p=>`<option value="${e(p.name)}" ${p.name===project?'selected':''}>${e(p.name)}</option>`).join('')}</select>`;
    const week=`<section class="calendar-week"><div class="week-head">${days.map(day=>`<div class="${day.today?'today':''}"><small>${day.label}</small><b>${day.num}</b></div>`).join('')}</div><div class="week-grid">${days.map(day=>`<div class="day-column ${day.today?'today':''}">${items.filter(item=>item.date===day.date).map(taskCard).join('')||'<span class="empty-day">—</span>'}</div>`).join('')}</div></section>`;
    const kanban=`<section class="todo-kanban">${['todo','doing','done'].map(status=>`<div class="todo-column"><header><span>${status==='todo'?'○':status==='doing'?'◉':'✓'}</span><b>${todoStatusLabel(status)}</b><small>${items.filter(x=>x.status===status).length}</small></header><div>${items.filter(x=>x.status===status).map(taskCard).join('')||'<p>暂无待办</p>'}</div></div>`).join('')}</section>`;
    return shell(`${header('日历待办','按人物、日期和项目集中看本周的动作。',`<button class="primary-action" data-add-todo>+ 新建待办</button>`)}
      <section class="calendar-toolbar"><div><h2>${project?e(project)+' · 待办':'本周待办'}</h2><p>勾选后会先保存在当前工作台；完成飞书授权后可同步回飞书。</p></div><div>${filters}${modes}</div></section>
      ${mode==='week'?week:kanban}
      <section class="calendar-sync-note"><div>${icon('pulse',20)}<span><b>飞书同步准备就绪</b><small>网页内的待办可先创建和勾选；连接飞书后，日历与待办会由服务端安全同步。</small></span></div><a href="${SYNC_API}/auth/start?return_to=${encodeURIComponent(location.href)}" target="_blank" rel="noopener">连接飞书 ${icon('arrow',14)}</a></section>
      <dialog class="todo-dialog" id="todo-dialog"><form method="dialog" id="todo-form"><header><div><small>PROJECT TODO</small><h2>新建待办</h2></div><button type="button" data-todo-close aria-label="关闭">×</button></header><label>事项<input required name="title" placeholder="例如：确认发稿排期"></label><label>说明<textarea name="description" placeholder="补充交付要求或上下文"></textarea></label><div class="form-two"><label>截止日期<input required type="date" name="date" value="${isoOffset(1)}"></label><label>负责人<input name="owner" placeholder="输入成员姓名"></label></div><label>项目<select name="project"><option value="">未归属项目</option>${projects.map(p=>`<option value="${e(p.name)}" ${p.name===project?'selected':''}>${e(p.name)}</option>`).join('')}</select></label><p class="upload-hint">附件上传将在存储服务接入后同步到飞书云文档；当前不会把文件留在浏览器里。</p><footer><button type="button" data-todo-close class="ghost-action">取消</button><button type="submit" class="primary-action">创建待办</button></footer></form></dialog>`);
  }
  function bind(){
    document.querySelector('[data-feishu-login]')?.addEventListener('click',startFeishuLogin);
    document.querySelector('.tree-toggle')?.addEventListener('click',()=>document.querySelector('.project-tree')?.classList.toggle('closed'));
    document.querySelector('#search')?.addEventListener('input',ev=>{state.q=ev.target.value;const x=r();document.querySelector('.project-list').innerHTML=projectTable((x.key==='全部'?projects:projects.filter(p=>p.status===x.key)).filter(p=>!state.q||Object.values(p).join(' ').toLowerCase().includes(state.q.toLowerCase())));});
    document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('hidden',x.dataset.view!==b.dataset.tab));}));
    document.querySelectorAll('[data-scroll]').forEach(button=>button.addEventListener('click',()=>document.getElementById(button.dataset.scroll)?.scrollIntoView({behavior:'smooth',block:'start'})));
    document.querySelectorAll('[data-overview-chart]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-overview-chart]').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('[data-rhythm]').forEach(x=>x.classList.toggle('hidden',x.dataset.rhythm!==b.dataset.overviewChart));}));
    document.querySelector('[data-bell]')?.addEventListener('click',ev=>ev.currentTarget.classList.toggle('ring'));
    document.querySelectorAll('.period button').forEach(b=>b.addEventListener('click',()=>document.querySelectorAll('.period button').forEach(x=>x.classList.toggle('active',x===b))));
    document.querySelectorAll('.file-read').forEach(button=>button.addEventListener('click',()=>openReader(button.dataset.readerUrl,button.dataset.readerTitle,button.dataset.readerSource,button.dataset.readerType)));
    document.querySelectorAll('[data-reader-close]').forEach(button=>button.addEventListener('click',closeReader));
    document.querySelectorAll('[data-todo-toggle]').forEach(input=>input.addEventListener('change',()=>{updateTodo(input.dataset.todoToggle,{status:input.checked?'done':'todo'});render();}));
    document.querySelectorAll('[data-todo-menu]').forEach(button=>button.addEventListener('click',()=>{const current=todos().find(item=>item.id===button.dataset.todoMenu);const next=current?.status==='todo'?'doing':current?.status==='doing'?'done':'todo';updateTodo(button.dataset.todoMenu,{status:next});render();}));
    document.querySelector('[data-calendar-project]')?.addEventListener('change',event=>{const project=event.target.value;const mode=r().query.get('mode');location.hash=`#/calendar${mode==='kanban'?'?mode=kanban':''}${project?`${mode==='kanban'?'&':'?'}project=${encodeURIComponent(project)}`:''}`;});
    const todoDialog=document.querySelector('#todo-dialog');
    document.querySelector('[data-add-todo]')?.addEventListener('click',()=>todoDialog?.showModal());
    document.querySelectorAll('[data-todo-close]').forEach(button=>button.addEventListener('click',()=>todoDialog?.close()));
    document.querySelector('#todo-form')?.addEventListener('submit',event=>{event.preventDefault();const data=new FormData(event.currentTarget);const item={id:`local-${Date.now()}`,title:String(data.get('title')||'未命名待办'),description:String(data.get('description')||''),date:String(data.get('date')||isoOffset(1)),owner:String(data.get('owner')||'待分配'),project:String(data.get('project')||'未归属项目'),status:'todo'};writeTodos([...readTodos(),item]);todoDialog.close();render();});
    document.querySelectorAll('[data-member-card]').forEach(card=>card.addEventListener('click',event=>{
      if (event.target.closest('a')) return;
      const expanded=card.classList.toggle('expanded'); card.setAttribute('aria-expanded',String(expanded));
    }));
  }
  function readerType(title,type=''){
    const value=`${type} ${title}`.toLowerCase();
    if(/pdf/.test(value)) return 'pdf';
    if(/xlsx|xls|csv|spreadsheet/.test(value)) return 'sheet';
    if(/docx|\.doc\b|word/.test(value)) return 'doc';
    if(/pptx|\.ppt\b|powerpoint|presentation/.test(value)) return 'slides';
    if(/png|jpe?g|gif|webp|image/.test(value)) return 'image';
    return 'link';
  }
  function readerMessage(mount, headline, copy, sourceUrl){
    mount.innerHTML=`<div class="preview-message"><span>${icon('folder',24)}</span><strong>${e(headline)}</strong><p>${e(copy)}</p>${sourceUrl?`<a href="${e(url(sourceUrl))}" target="_blank" rel="noopener">在飞书中打开 ${icon('arrow',14)}</a>`:''}</div>`;
  }
  function loadingPreview(mount){mount.innerHTML='<div class="preview-loading"><i></i><span>正在安全读取文件…</span></div>';}
  function loadLibrary(name){
    if(window[name]) return Promise.resolve(window[name]);
    return new Promise((resolve,reject)=>{
      const started=Date.now();
      const timer=setInterval(()=>{if(window[name]){clearInterval(timer);resolve(window[name]);}else if(Date.now()-started>7000){clearInterval(timer);reject(new Error('library unavailable'));}},80);
    });
  }
  async function previewSheet(buffer,mount){
    const XLSX=await loadLibrary('XLSX'); const workbook=XLSX.read(buffer,{type:'array'}); const sheet=workbook.Sheets[workbook.SheetNames[0]];
    const rows=XLSX.utils.sheet_to_json(sheet,{header:1,blankrows:false}).slice(0,28).map(row=>row.slice(0,9));
    if(!rows.length){readerMessage(mount,'该表格没有可读数据','可以在飞书中查看原始工作表。');return;}
    mount.innerHTML=`<div class="sheet-preview"><div class="preview-label"><b>${e(workbook.SheetNames[0])}</b><span>展示前 ${rows.length} 行 · ${workbook.SheetNames.length} 个工作表</span></div><div class="sheet-scroll"><table>${rows.map((row,i)=>`<tr>${row.map(cell=>`<${i===0?'th':'td'}>${e(cell==null?'':cell)}</${i===0?'th':'td'}>`).join('')}</tr>`).join('')}</table></div></div>`;
  }
  async function previewDoc(buffer,mount){
    const mammoth=await loadLibrary('mammoth'); const result=await mammoth.convertToHtml({arrayBuffer:buffer});
    mount.innerHTML=`<article class="doc-preview">${result.value||'<p>该 Word 文档没有可读文字。</p>'}</article>`;
  }
  async function previewSlides(buffer,mount){
    const JSZip=await loadLibrary('JSZip'); const zip=await JSZip.loadAsync(buffer);
    const slides=Object.keys(zip.files).filter(key=>/^ppt\/slides\/slide\d+\.xml$/.test(key)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));
    if(!slides.length){readerMessage(mount,'无法读取演示文稿','这个文件不是标准的 PowerPoint 文件，请在飞书中查看。');return;}
    let current=0;
    const renderSlide=async()=>{const xml=await zip.file(slides[current]).async('string');const doc=new DOMParser().parseFromString(xml,'application/xml');const lines=[...doc.getElementsByTagNameNS('*','t')].map(x=>x.textContent.trim()).filter(Boolean);
      mount.innerHTML=`<div class="slide-preview"><div class="slide-toolbar"><button ${current===0?'disabled':''} data-slide-prev>←</button><span>第 ${current+1} / ${slides.length} 页 · 文字提纲预览</span><button ${current===slides.length-1?'disabled':''} data-slide-next>→</button></div><div class="slide-paper">${lines.length?lines.map((line,i)=>`<p class="${i===0?'slide-title':''}">${e(line)}</p>`).join(''):'<p>本页未找到可读文字。</p>'}</div></div>`;
      mount.querySelector('[data-slide-prev]')?.addEventListener('click',()=>{current--;renderSlide();});mount.querySelector('[data-slide-next]')?.addEventListener('click',()=>{current++;renderSlide();});
    };await renderSlide();
  }
  async function renderPreview(readerUrl,title,sourceUrl,fileType){
    const mount=document.querySelector('#reader-preview');if(!mount)return;const kind=readerType(title,fileType);
    if(!readerUrl){readerMessage(mount,'没有可预览的文件','此条资料没有附带可读取的文件。',sourceUrl);return;}
    if(kind==='link'){readerMessage(mount,'这是飞书源表入口','发稿汇总表和监测表需要保留在飞书中交互查看。',sourceUrl||readerUrl);return;}
    loadingPreview(mount);
    try{const response=await fetch(readerUrl);if(!response.ok)throw new Error(`HTTP ${response.status}`);const blob=await response.blob();
      if(kind==='pdf'||kind==='image'){const objectUrl=URL.createObjectURL(blob);mount.innerHTML=`<iframe class="native-preview" src="${objectUrl}" title="${e(title)}"></iframe>`;return;}
      const buffer=await blob.arrayBuffer();if(kind==='sheet')await previewSheet(buffer,mount);else if(kind==='doc')await previewDoc(buffer,mount);else if(kind==='slides')await previewSlides(buffer,mount);else readerMessage(mount,'暂不支持此文件格式','请在飞书中打开原文件。',sourceUrl);
    }catch(error){readerMessage(mount,'暂时无法读取该文件','请确认你已登录飞书且拥有文件访问权限，然后重试。',sourceUrl||readerUrl);}
  }
  function openReader(readerUrl, title, sourceUrl, fileType){
    const reader=document.querySelector('#reader'), empty=document.querySelector('#reader-empty'), opener=document.querySelector('#reader-open');
    if(!signedIn()){startFeishuLogin();return;}
    if(!readerUrl){return;}
    document.querySelector('#reader-title').textContent=title||'文件阅读'; opener.href=sourceUrl||readerUrl; empty.classList.add('hidden'); reader.classList.add('open'); reader.setAttribute('aria-hidden','false'); document.body.classList.add('reader-active');renderPreview(readerUrl,title,sourceUrl,fileType);
  }
  function closeReader(){const reader=document.querySelector('#reader');reader?.classList.remove('open');reader?.setAttribute('aria-hidden','true');document.body.classList.remove('reader-active');const preview=document.querySelector('#reader-preview');if(preview)preview.innerHTML='';}
  function render(){acceptFeishuCallback();if(!signedIn()){app.innerHTML=authPage();bind();return;}const x=r();app.innerHTML=x.page==='status'?statusPage(x.key||'全部'):x.page==='project'?projectPage(x.key):x.page==='workload'?workloadPage():x.page==='calendar'?calendarPage():overview();bind();}
  addEventListener('hashchange',render);render();
})();
