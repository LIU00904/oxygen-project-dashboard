(() => {
  const app = document.querySelector('#app');
  const S = ['进行中', '待开始', '已完成', '停滞'];
  const M = { '进行中':['blue','进行中'], '待开始':['amber','待开始'], '已完成':['green','已完成'], '停滞':['red','停滞'] };
  const state = { q:'' };
  // 静态数据只用于首次打开和离线兜底；企业登录后始终以飞书项目表为准。
  let projects = (window.FEISHU_PROJECTS || []).map(p => ({...p, id:p.id || p.recordId || p.name}));
  const activity = window.OXYGEN_PROJECT_ACTIVITY || {}, pubs = window.OXYGEN_PUBLICATION_SUMMARIES || {};
  const publicationSnapshot = window.OXYGEN_PUBLICATION_SNAPSHOT || {projects:{}, aliases:{}, specialPeriods:{}};
  // 部分飞书项目名在实时返回时会含有不可见字符或历史别名。这里保留
  // 已核验订单快照的项目级兜底，避免已归集的数据被错误显示为空白。
  const publicationFallbacks = {
    '可孚制氧机': {
      sourceName:'可孚', total:225, updatedAt:'2026-11-01',
      months:[
        {month:'2026-09',count:72},
        {month:'2026-10',count:151},
        {month:'2026-11',count:2}
      ]
    }
  };
  // 仅收录已交付月报中可核验的结论；不以发稿订单或模板内容替代月报分析。
  const reportInsights = {
    '太太乐松茸鲜': {
      label:'10 月月报洞察',
      title:'整体推荐表现上行，比较型场景仍需补强',
      text:'10 月整体 Top3 提及率为 93.1%，较 9 月提升 6.3 个百分点；松茸鲜与松茸调料 Top3 分别为 100% 和 98.9%。替代味精场景首推为 40.9%，后续需加强具体产品对应与比较型选择理由。'
    },
    '华硕 新': {
      label:'首月月报 · 9/28–10/27',
      title:'AI 推荐覆盖已形成基础，外设长尾是下一阶段重点',
      text:'10 个关键词、80 个长尾词覆盖 5 个 AI 平台；整体提及率 88.3%，Top1 提及率 37.5%，Top3 提及率 65.4%。主板、外设套装与机箱排名靠前，键盘、耳机、鼠标仍需重点补强。'
    }
  };
  const work = window.OXYGEN_WORK_SUMMARIES || {};
  const avatars = window.OXYGEN_MEMBER_AVATARS || {};
  // Checklist 是全员协作的执行面，只开放当前实际需要分配待办的六位成员。
  // 历史项目成员仍在项目成员区展示，但不会出现在待办分配器中。
  const CHECKLIST_MEMBERS = [
    {name:'刘依晨', avatar:avatars['刘依晨']},
    {name:'辛味加', avatar:avatars['辛味加'] || avatars['辛味珈']},
    {name:'徐奕畅', avatar:avatars['徐奕畅'] || avatars['徐奕旸']},
    {name:'韩文静', avatar:avatars['韩文静']},
    {name:'李正浩', avatar:avatars['李正浩']},
    {name:'彭安迪', avatar:avatars['彭安迪']}
  ];
  const CHECKLIST_MEMBER_MAP = Object.fromEntries(CHECKLIST_MEMBERS.map(member=>[member.name,member]));
  const people = ((window.OXYGEN_MEMBER_WORKLOAD || {}).people || []).map(([name,total,working,last]) => ({name,total,working,last}));
  const SYNC_API = window.FEISHU_SYNC_API || 'https://oxygen-feishu-sync.liuyichen021231.workers.dev';
  const TODO_KEY = 'oxygen-dashboard-local-todos-v1';
  const AUTH_KEY = 'oxygen-dashboard-feishu-session-v1';
  const USER_KEY = 'oxygen-dashboard-feishu-user-v1';
  let sharedTodos = null;
  let todoSyncPromise = null;
  let todoPoll = null;
  let todoSyncState = 'connecting';
  let todoMutationInFlight = false;
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
  // 仅供本机视觉验收使用；线上站点仍必须持有飞书会话。
  const localPreview=location.hostname==='127.0.0.1';
  function signedIn(){return Boolean(session())||localPreview}
  const normalizeProjects = list => (Array.isArray(list)?list:[]).map(p=>{
    const patch = typeof window.OXYGEN_PATCH_PROJECT === 'function' ? window.OXYGEN_PATCH_PROJECT(p) : p;
    return {...patch,id:patch.id || patch.recordId || patch.name};
  });
  let refreshProjectsPromise = null;
  async function refreshProjectsFromFeishu(){
    if(!session() || refreshProjectsPromise) return refreshProjectsPromise;
    refreshProjectsPromise=(async()=>{
      try{
        const response=await fetch(`${SYNC_API}/projects?refresh=1`,{headers:{Authorization:`Bearer ${session()}`}});
        if(!response.ok) return;
        const payload=await response.json();
        const incoming=normalizeProjects(payload.projects);
        if(!incoming.length) return;
        projects=incoming;
        window.FEISHU_PROJECTS=incoming;
        localStorage.setItem('oxygen-dashboard-project-cache-v2',JSON.stringify({updatedAt:Date.now(),projects:incoming}));
        // 不在填写 Checklist 时整页重绘；否则飞书字段刷新会把弹窗和草稿直接关掉。
        if(!document.querySelector('dialog[open]')) render();
      }catch(error){
        // 网络或授权短暂失效时保留本地兜底，不把页面变成空白。
        console.warn('Unable to refresh project fields from Feishu',error);
      }finally{refreshProjectsPromise=null;}
    })();
    return refreshProjectsPromise;
  }
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
  function scheduleProgress(p){
    if(p.status==='已完成') return 100;
    const explicit=Number(p.progressPercent);
    if(Number.isFinite(explicit) && explicit>0) return Math.max(0,Math.min(100,Math.round(explicit)));
    if(p.status!=='进行中' || !p.startDate) return 0;
    const start=new Date(`${p.startDate}T00:00:00`);
    let end=p.endDate ? new Date(`${p.endDate}T00:00:00`) : null;
    if(!end && Number(p.cycleDays)>0){end=new Date(start);end.setDate(end.getDate()+Number(p.cycleDays));}
    if(Number.isNaN(start.getTime()) || !end || Number.isNaN(end.getTime()) || end<=start) return 0;
    const now=new Date();now.setHours(0,0,0,0);
    return Math.max(0,Math.min(100,Math.round((now-start)/(end-start)*100)));
  }
  const progress = p => scheduleProgress(p);
  const av = (name,c='') => url(avatars[name]) ? `<img class="avatar ${c}" src="${e(avatars[name])}" alt="${e(name)}" referrerpolicy="no-referrer">` : `<span class="avatar fallback ${c}">${e((name||'待').slice(0,1))}</span>`;
  const checklistAvatar = (name,c='') => {
    const member=CHECKLIST_MEMBER_MAP[name];
    return url(member?.avatar) ? `<img class="avatar ${c}" src="${e(member.avatar)}" alt="${e(name)}" referrerpolicy="no-referrer">` : av(name,c);
  };
  const badge = s => {const [tone,label]=M[s]||M['进行中'];return `<span class="status ${tone}"><i></i>${e(label)}</span>`};
  const dt = x => x ? new Date(`${x}T00:00:00`).toLocaleDateString('zh-CN',{month:'short',day:'numeric'}) : '—';
  const projectTime = p => {
    if (!p.startDate) return '未设置周期';
    const start = new Date(`${p.startDate}T00:00:00`);
    let end = p.endDate ? new Date(`${p.endDate}T00:00:00`) : null;
    if (!end && Number(p.cycleDays) > 0) { end = new Date(start); end.setDate(end.getDate() + Number(p.cycleDays)); }
    return end && !Number.isNaN(end.getTime()) && end >= start ? `${dt(p.startDate)} — ${dt(end.toISOString().slice(0, 10))}` : `${dt(p.startDate)} 起`;
  };
  // 项目表中的字段优先作为项目说明。空字段不能被误写成“待补充”，否则会让
  // 已在飞书维护的项目看起来像没有配置。
  const compactProjectCopy = (value, limit=42) => {
    const text=String(value||'').replace(/\s+/g,' ').trim();
    return text.length>limit ? `${text.slice(0,limit)}…` : text;
  };
  function projectCaption(p){
    const candidates=[p.platform,p.kpi,p.currentData,p.notes]
      .map(value=>compactProjectCopy(value))
      .filter(value=>value && !/(待补充|待配置|项目已从飞书读取)/.test(value));
    return candidates[0] || '已同步飞书项目表';
  }
  const fileLinks = x => (Array.isArray(x)?x:x?[x]:[]).map((v,i)=>{
    if(typeof v==='string') return {label:`飞书资料 ${i+1}`,url:v,sourceUrl:v,fileType:''};
    const raw=v.label||v.name||v.fileName||'';
    const label=raw && !/^(飞书文件|文件|链接)(\s*\d+)?$/.test(raw) ? raw : `飞书资料 ${i+1}`;
    // 文件不再走 Worker 下载或网页预览。保留飞书原链接，确保权限与版本以飞书为准。
    return {label,url:v.url||v.link||'',sourceUrl:v.url||v.link||'',fileType:v.fileType||v.mimeType||v.type||''};
  });
  const compactName = value => String(value||'').replace(/[\s·・_－-]+/g,'').toLowerCase();
  function publicationSourceName(projectName){
    const aliases=publicationSnapshot.aliases||{};
    const direct=aliases[projectName] || projectName;
    if(Object.prototype.hasOwnProperty.call(publicationSnapshot.projects||{},direct)) return direct;
    const compact=compactName(projectName);
    const aliasMatch=Object.entries(aliases).find(([name])=>compactName(name)===compact);
    if(aliasMatch && Object.prototype.hasOwnProperty.call(publicationSnapshot.projects||{},aliasMatch[1])) return aliasMatch[1];
    return Object.keys(publicationSnapshot.projects||{}).find(name=>compactName(name)===compact) || direct;
  }
  function publicationFor(p){
    const sourceName=publicationSourceName(p.name);
    const fallback=publicationFallbacks[compactName(p.name)==='可孚制氧机'?'可孚制氧机':p.name];
    const total=publicationSnapshot.projects?.[sourceName] ?? fallback?.total;
    const legacy=pubs[p.name]||{};
    const monthly=publicationSnapshot.monthly?.[sourceName]||fallback?.months||[];
    return {
      total:Number.isFinite(total) ? total : (legacy.total ?? fileLinks(p.publishLinks).length),
      periods:legacy.periods||[], weeks:legacy.weeks||[],
      months:monthly.map(x=>({label:String(x.month||'').slice(5)+'月',month:x.month,value:Number(x.count)||0})),
      source:Number.isFinite(total) ? `${publicationSnapshot.source||'完整订单导出'} · ${publicationSnapshot.updatedAt||fallback?.updatedAt||''}` : (legacy.source||'项目发稿链接'),
      updatedAt:publicationSnapshot.updatedAt||fallback?.updatedAt||'',
      special:publicationSnapshot.specialPeriods?.[sourceName]||null,
      isWeeklySnapshot:Number.isFinite(total)
    };
  }

  function sidebar(cur) {
    const branches = S.map(s=>`<a class="branch ${cur.page==='status'&&cur.key===s?'active':''}" href="#/status/${encodeURIComponent(s)}"><i class="${M[s][0]}"></i><span>${s}</span><b>${count(s)}</b></a>`).join('');
    return `<aside class="sidebar"><a href="#/overview" class="brand"><b>O</b><span><strong>氧气科技</strong><small>PROJECT OPERATIONS</small></span></a><nav>
      <a class="nav ${cur.page==='overview'?'active':''}" href="#/overview">${icon('grid')}<span>Dashboard</span></a>
      <section class="project-tree"><button class="nav tree-toggle">${icon('folder')}<span>项目</span>${icon('chev',15)}</button><div class="tree"><a class="branch ${cur.page==='status'&&cur.key==='全部'?'active':''}" href="#/status/%E5%85%A8%E9%83%A8"><i class="violet"></i><span>全部项目</span><b>${projects.length}</b></a>${branches}</div></section>
      <a class="nav ${cur.page==='workload'?'active':''}" href="#/workload">${icon('users')}<span>成员任务</span></a>
    </nav><div class="side-footer"><a href="https://jcnquengglen.feishu.cn/base/SRjgbQqBMa6L1isu8CFcuUAAnEb?table=tbl8o6BzxfDpqxMX&view=vew234Y6ro" target="_blank" rel="noopener">在飞书中打开 ${icon('arrow',14)}</a><small>已通过飞书企业登录</small></div></aside>`;
  }
  function shell(body) {return `<style>.metric.blue,.metric.green,.metric.violet,.status.blue,.status.green,.status.amber,.status.red{background:transparent!important}.member-zone{border-top:1px solid var(--line);padding-top:25px;margin-top:30px}.member-zone-title{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:17px}.member-zone-title h2{font-size:17px;margin:0}.member-zone-title p{font-size:11px;color:#8190a7;margin:0}.member-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.person-card{min-height:132px;border:1px solid var(--line);background:#ffffffa8;border-radius:14px;padding:14px;text-align:left;color:var(--ink);transition:.18s}.person-card:hover,.person-card.expanded{border-color:#a9c8ff;box-shadow:0 12px 30px #2a6ce414}.person-card-top{display:flex;align-items:center;gap:10px}.person-card .avatar{width:38px;height:38px}.person-card-top span{min-width:0;flex:1}.person-card-top b,.person-card-top small{display:block}.person-card-top b{font-size:13px}.person-card-top small{font-size:10px;color:#8391a6;margin-top:3px}.person-card-top em{width:22px;height:22px;display:grid;place-items:center;border-radius:50%;font-style:normal;background:#eef4ff;color:var(--blue);font-size:16px}.person-card-stats{display:flex;gap:17px;margin:13px 0 0 48px}.person-card-stats span{display:grid;gap:2px}.person-card-stats b{font-size:16px;color:var(--blue)}.person-card-stats small{font-size:9px;color:#8997aa}.person-focus{display:none;margin-top:15px;padding-top:12px;border-top:1px solid #e7eef8}.person-card.expanded .person-focus{display:block}.person-focus>span{display:block;font-size:10px;color:#74839b;margin-bottom:8px}.focus-projects{display:flex;flex-wrap:wrap;gap:5px}.focus-projects a{font-size:10px;text-decoration:none;color:#3169c9;background:#edf4ff;border-radius:5px;padding:5px 7px}.inactive-zone{opacity:.84}.inactive-zone .person-card{background:#fbfcfd;border-style:dashed}@media(max-width:1050px){.member-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.member-cards{grid-template-columns:1fr}.person-card{min-height:120px}}</style><div class="aurora"></div><div class="app-shell">${sidebar(r())}<main class="workspace">${body}</main></div>`;}
  function authPage(){return `<main class="auth-gate"><section><a class="brand" href="#/overview"><b>O</b><span><strong>氧气科技</strong><small>PROJECT OPERATIONS</small></span></a><div><h1>用飞书企业账号进入</h1><p>项目、报告和发稿数据仅对已授权的公司成员开放。</p><button class="primary-action" data-feishu-login>飞书登录 ${icon('arrow',16)}</button><small>登录后会按飞书权限进入对应项目、发稿汇总表和监测表。</small></div></section></main>`}
  function header(title,sub,actions='') {return `<header class="page-head"><div><p>项目运营 / ${e(title)}</p><h1>${e(title)}</h1><small>${e(sub||'')}</small></div><div class="head-actions"><button class="bell" data-bell aria-label="待办提醒">${icon('bell')}<i></i></button>${actions}</div></header>`;}
  function metric(name,value,note,tone='') {return `<article class="metric ${tone}"><span>${e(name)}</span><strong>${e(value)}</strong><small>${e(note)}</small></article>`;}
  function bars(rows,kind='') {const max=Math.max(...rows.map(x=>x.value),1);return `<div class="bars ${kind}">${rows.map(x=>`<button type="button"><span>${e(x.name||x.label)}</span><i><b style="width:${Math.max(2,Math.round(x.value/max*100))}%"></b></i><strong>${x.value}</strong><em>${e(x.detail||'')}</em></button>`).join('')}</div>`;}
  function projectTable(list) {
    return `<div class="data-table"><div class="table-header"><span>项目</span><span>项目时间</span><span>进度</span><span>负责人</span><span>状态</span></div>${list.map(p=>{
      const names=[p.manager,p.writer,p.publisher,p.monitor].filter(Boolean).map(x=>String(x).split(/[、,，\/]/)[0]).filter((x,i,a)=>a.indexOf(x)===i).slice(0,2);
      return `<a href="#/project/${encodeURIComponent(p.id)}" class="project-row"><span><b>${e(p.name)}</b><small>${e(projectCaption(p))}</small></span><span class="project-time">${e(projectTime(p))}</span><span class="progress"><i><b style="width:${progress(p)}%"></b></i><em>${progress(p)}%</em></span><span class="avatar-stack">${names.length?names.map(x=>av(x)).join(''):'<i>待</i>'}</span><span>${badge(p.status)}</span></a>`;
    }).join('')}</div>`;
  }
  function overview() {
    const active=projects.filter(p=>p.status==='进行中'),done=projects.filter(p=>p.status==='已完成');
    const syncedPublications=Object.values(publicationSnapshot.projects||{}).reduce((sum,value)=>sum+(Number(value)||0),0);
    const mappedProjectCount=Object.keys(publicationSnapshot.projects||{}).filter(name=>name!=='待归属').length;
    const unassignedPublications=Number(publicationSnapshot.projects?.['待归属'])||0;
    const focus=Object.entries(activity).map(([name,x])=>({name,value:x.main.value,detail:x.main.label})).sort((a,b)=>b.value-a.value).slice(0,5);
    const avg=active.length?Math.round(active.reduce((n,p)=>n+progress(p),0)/active.length):0;
    const upcoming=todos().filter(item=>item.status!=='done').sort((a,b)=>String(a.date).localeCompare(String(b.date))).slice(0,3);
    return shell(`${header('项目总览','用一张运营工作台看清交付重心、项目节奏和需要管理动作的地方。','<div class="period"><button class="active">本周</button><button>本月</button><button>本季度</button></div>')}
      <section class="metrics">${metric('在管项目',projects.length,'全量项目池')}${metric('正在推进',active.length,`平均进度 ${avg}%`,'blue')}${metric('已完成',done.length,'进入归档或复盘','green')}${metric('有效发稿',syncedPublications.toLocaleString(),`${publicationSnapshot.updatedAt||'—'} 更新 · ${mappedProjectCount} 个项目`,'violet')}</section>
      <section class="spectrum-command-grid"><article class="project-health-panel"><div class="panel-title"><div><h2>项目健康度</h2><p>正在推进的项目，按项目时间、进度与负责人查看。</p></div><a class="mini-link" href="#/status/%E8%BF%9B%E8%A1%8C%E4%B8%AD">查看全部 →</a></div>${projectTable(active.slice(0,7))}</article><aside class="decision-panel"><div class="panel-title"><div><h2>本周待办</h2><p>来自各项目的 Checklist</p></div></div><div class="decision-list">${upcoming.length?upcoming.map((item,i)=>`<a href="#/project/${encodeURIComponent(projects.find(p=>p.name===item.project)?.id||item.project)}"><i>${String(i+1).padStart(2,'0')}</i><span><b>${e(item.title)}</b><small>${e(item.project||'未关联项目')} · ${e(item.owner||'待分配')}</small></span><em>${e(item.date||'待定')}</em></a>`).join(''):'<p class="decision-empty">暂无待处理事项</p>'}</div></aside></section>
      <section class="overview-grid"><article class="focus-panel"><div class="panel-title"><div><h2>本期工作重心</h2><p>近两周工作记录中，哪些项目与任务量最集中</p></div><button class="text-button">按项目 ${icon('chev',14)}</button></div>${bars(focus,'focus')}</article>
      <article class="status-panel"><div class="panel-title"><div><h2>项目分布</h2><p>按当前项目状态</p></div><button class="round-button">${icon('more')}</button></div><div class="donut-layout"><div class="donut" style="--a:${Math.round(count('进行中')/projects.length*360)}deg;--b:${Math.round((count('进行中')+count('已完成'))/projects.length*360)}deg;--c:${Math.round((count('进行中')+count('已完成')+count('待开始'))/projects.length*360)}deg"><strong>${projects.length}</strong><small>项目总数</small></div><div class="legend">${S.map(x=>`<a href="#/status/${encodeURIComponent(x)}"><i class="${M[x][0]}"></i><span>${x}</span><b>${count(x)}</b></a>`).join('')}</div></div></article></section>
      <section class="analytics-grid investment-grid"><article class="analytics-card"><div class="panel-title"><div><h2>本期工作重心</h2><p>近两周已记录的工作量。数字代表任务记录，不把它误当成“交付进度”。</p></div></div><div class="investment-list">${focus.map((x,i)=>`<a href="#/project/${encodeURIComponent(projects.find(p=>p.name===x.name)?.id||x.name)}"><span><i style="--tone:${['#296cf3','#7b61e8','#20b982','#f09a37','#ef6672'][i]}"></i><b>${e(x.name)}</b><small>${e(x.detail)}</small></span><strong>${x.value}<em>条</em></strong><div><i style="width:${Math.max(8,Math.round(x.value/Math.max(...focus.map(y=>y.value))*100))}%"></i></div></a>`).join('')}</div></article><article class="analytics-card attention-card"><div class="panel-title"><div><h2>管理动作</h2><p>适合本周例会直接带走的三件事</p></div></div><ol><li><i>01</i><span><b>推进进行中项目</b><small>${active.length} 个项目正在交付，优先补齐 KPI、成员和项目时间。</small></span></li><li><i>02</i><span><b>查看月度发布</b><small>每个项目均可进入月度发布图，查看更新日期与订单总量。</small></span></li></ol></article></section>`);
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
  function todoFingerprint(items){return JSON.stringify((items||[]).map(item=>[item.id,item.status,item.updatedAt,item.revision]));}
  async function cloudTodos(method='GET',id='',body){
    const response=await fetch(`${SYNC_API}/todos${id?`/${encodeURIComponent(id)}`:''}`,{method,headers:{Authorization:`Bearer ${session()}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(payload.error||'待办同步失败');
    return payload;
  }
  async function refreshTodosFromCloud({rerender=false}={}){
    if(!session()||todoSyncPromise)return todoSyncPromise;
    todoSyncPromise=(async()=>{
      try{
        const payload=await cloudTodos();
        const changed=todoFingerprint(sharedTodos)!==todoFingerprint(payload.todos);
        sharedTodos=Array.isArray(payload.todos)?payload.todos:[];
        writeTodos(sharedTodos);
        const stateChanged=todoSyncState!=='ready';todoSyncState='ready';
        if(rerender&&(changed||stateChanged)&&!document.querySelector('dialog[open]'))render();
      }catch(error){const stateChanged=todoSyncState!=='unavailable';todoSyncState='unavailable';console.warn('Unable to refresh shared todos',error);if(rerender&&stateChanged&&!document.querySelector('dialog[open]'))render();}
      finally{todoSyncPromise=null;}
    })();
    return todoSyncPromise;
  }
  function startTodoPolling(){
    if(todoPoll||!session())return;
    todoPoll=setInterval(()=>refreshTodosFromCloud({rerender:true}),15000);
    addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshTodosFromCloud({rerender:true});});
  }
  async function createTodo(item){
    try{
      const payload=await cloudTodos('POST','',item);
      sharedTodos=[...(sharedTodos||[]),payload.todo];writeTodos(sharedTodos);return true;
    }catch(error){alert(`待办未同步：${error.message}`);return false;}
  }
  async function updateTodo(id, changes){
    try{
      const payload=await cloudTodos('PATCH',id,changes);
      sharedTodos=(sharedTodos||todos()).map(item=>item.id===id?payload.todo:item);writeTodos(sharedTodos);return true;
    }catch(error){alert(`待办状态未同步：${error.message}`);return false;}
  }
  async function deleteTodo(id){
    try{
      await cloudTodos('DELETE',id);
      sharedTodos=(sharedTodos||todos()).filter(item=>item.id!==id);writeTodos(sharedTodos);return true;
    }catch(error){alert(`待办未删除：${error.message}`);return false;}
  }
  function isoOffset(days){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+days);return d.toISOString().slice(0,10);}
  // 项目待办只显示用户创建的事项；不再把旧工作记录或模板节点误写给某个成员。
  function todos(){return Array.isArray(sharedTodos)?sharedTodos:readTodos();}
  function todoSyncNote(){
    if(todoSyncState==='ready')return {title:'全员 Checklist 已同步',copy:'待办保存在受飞书企业登录保护的共享库中，其他成员约 15 秒内即可看到新增或勾选状态。',action:'重新登录'};
    if(todoSyncState==='unavailable')return {title:'同步服务连接中',copy:'共享待办服务暂未就绪；当前页面不会把本机修改当作全员数据。请稍后刷新或重新登录飞书。',action:'重新登录'};
    return {title:'正在连接全员 Checklist',copy:'正在读取受飞书企业登录保护的共享待办；读取完成后会自动显示所有成员的新增与勾选状态。',action:'重新登录'};
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
  function ownersFor(p){
    return [...new Set([p.manager,p.writer,p.publisher,p.monitor].filter(Boolean).flatMap(value=>String(value).split(/[、,，\/]/).map(name=>name.trim()).filter(Boolean)))];
  }
  function memberOptions(){return CHECKLIST_MEMBERS;}
  function memberRows(p){
    const slots=[['项目负责人',p.manager],['写稿',p.writer],['发布',p.publisher],['监测',p.monitor]];
    const seen=new Set();
    return slots.flatMap(([role,value])=>String(value||'').split(/[、,，\/]/).map(name=>name.trim()).filter(Boolean).filter(name=>{
      const key=`${name}-${role}`; if(seen.has(key)) return false; seen.add(key); return true;
    }).map(name=>({name,role})));
  }
  function controlFor(p){
    if(p.name!=='太太乐松茸鲜') return null;
    const start=new Date('2026-04-14T00:00:00');const today=new Date();today.setHours(0,0,0,0);
    const week=Math.floor((today-start)/604800000)+1;
    const monday=new Date(today);monday.setDate(today.getDate()-(today.getDay()+6)%7);
    const sunday=new Date(monday);sunday.setDate(monday.getDate()+6);
    const nextReport=nextWeekday(3);
    const publication=publicationFor(p);
    const special=publication.special;
    const kpiPeriod=special?.periods?.find(x=>String(x.label).includes('4 月起'));
    const owners=ownersFor(p), lead=owners[0]||'待飞书更新负责人';
    const roles=['项目统筹','内容发布','数据回填','监测复核'];
    return {target:500, verified:true, achieved:Number.isFinite(kpiPeriod?.count)?kpiPeriod.count:publication.total, total:publication.total, special, updatedAt:publication.updatedAt, source:publication.source, week,weekRange:`${shortDate(monday)} — ${shortDate(sunday)}`,start,
      milestones:[
        {kind:'周报',title:'上传周报',date:nextReport,owner:lead,note:'提交本周内容发布周报及数据明细'},
        {kind:'发稿',title:'上传稿件',date:weekdayAfter(nextReport,5),owner:owners[1]||lead,note:'提交当周直出稿件与发布链接'},
        {kind:'月报',title:'提交月报',date:nextMonthDay(10),owner:owners[2]||lead,note:'提交月度复盘与下月计划'}
      ],
      months:publication.periods||[],
      members:owners.map((name,index)=>[name,0,roles[index]||'项目协作'])
    };
  }
  function controlSyncPage(p,c){
    const schedule=c.milestones.map((item,i)=>`<article class="cadence-event ${i===0?'next':''}"><span class="cadence-number">${i+1}</span><div><small>${dayLabel(item.date)}</small><b>${e(item.title)}</b><p>${e(item.note)}</p></div><em>${Math.max(0,Math.ceil((item.date-new Date())/86400000))} 天后</em></article>`).join('');
    return shell(`${header(p.name,'项目看板 · 发稿数据以源表的有效链接为准。',`<a class="back-link" href="#/status/${encodeURIComponent(p.status)}">${icon('chev',15)} 返回列表</a>`)}
      <nav class="command-tabs"><button class="active" data-scroll="command-kpi">项目概览</button><button data-scroll="command-cadence">工作计划</button><button data-scroll="command-files">文件资料</button></nav>
      <section class="kpi-command" id="command-kpi"><div class="week-readout"><span>当前周次</span><strong>第 ${c.week} 周</strong><small>${e(c.weekRange)}</small><b>下一个节点：${dayLabel(c.milestones[0].date)} · ${e(c.milestones[0].title)}</b></div><div class="kpi-core sync-kpi"><div><span>实时有效发稿</span><strong>—<i> 篇</i></strong><small>旧页面中的历史快照已撤下；正在从太太乐发稿表逐条核验链接。</small></div><aside><span>项目目标</span><strong><b>${c.target}</b> 篇</strong><small>仅计有发布链接的有效稿；拒稿、待发布不计入。</small></aside></div><div class="kpi-next"><span>数据状态</span><b>正在读取 4.2、5–10 月各分表</b><small>核验完成后才显示分月、总量、缺口及同步时间。</small></div></section>
      <section class="cadence-board" id="command-cadence"><div class="command-section-title"><div><h2>工作节奏</h2><p>按固定交付节点提醒，不再用模糊的通用阶段条。</p></div><a href="#/calendar?project=${encodeURIComponent(p.name)}">查看完整日历 ${icon('arrow',14)}</a></div><div class="cadence-line"><div class="today-mark"><b>今天</b><small>${dt(ymd(new Date()))}</small></div>${schedule}</div></section>
      ${dataSources(p)}<section class="command-files" id="command-files"><div class="command-section-title"><div><h2>文件与报告</h2><p>点击后在飞书打开源文件，权限、版本与协作均以飞书为准。</p></div></div><div class="command-file-grid">${files('周报 / 月报 / 监测报告',fileLinks(p.reportLinks),'calendar')}${files('Brief 与项目资料',fileLinks(p.briefLinks),'folder')}</div></section>`);
  }
  function files(title, list, type) {return `<section class="file-block"><div class="file-label">${icon(type)}<div><h3>${e(title)}</h3><p>${list.length?`${list.length} 个文件或链接`:'暂未归档'}</p></div></div>${list.length?'<div class="files">'+list.map((x,i)=>{const target=url(x.sourceUrl)||url(x.url);return target?`<a class="file-read" href="${e(target)}" target="_blank" rel="noopener" title="在飞书中打开：${e(x.label||'文件 '+(i+1))}"><span>${icon('folder',16)}</span><b>${e(x.label||'文件 '+(i+1))}</b>${icon('arrow',14)}</a>`:`<span class="file-read is-unavailable"><span>${icon('folder',16)}</span><b>${e(x.label||'文件 '+(i+1))}</b></span>`;}).join('')+'</div>':'<p class="empty-copy">飞书项目表暂未补充该资料。</p>'}</section>`;}
  function dataSources(p){
    const sourceList=(items,type)=>items.length?`<div class="source-link-list">${items.map((item,index)=>{
      const target=url(item.sourceUrl)||url(item.url);
      const raw=String(item.label||'').trim();
      const isGeneric=!raw || /^(飞书资料|飞书文件|文件|链接)(\s*\d+)?$/i.test(raw);
      const kindName=type==='publish'?'发稿汇总表':'关键词监测表';
      // 飞书字段只有 URL 时，仍给出可识别的业务名称；不要再显示“飞书资料 1”。
      const fallback=`${p.name}${kindName}${items.length>1?` ${index+1}`:''}`;
      const label=isGeneric?fallback:raw;
      return target?`<a href="${e(target)}" target="_blank" rel="noopener" title="在飞书中打开：${e(label)}"><b>${e(label)}</b><small>飞书源表</small>${icon('arrow',14)}</a>`:`<span><b>${e(label)}</b></span>`;
    }).join('')}</div>`:`<p class="source-empty">飞书项目表暂未填写该链接。</p>`;
    const publish=fileLinks(p.publishLinks), monitor=fileLinks(p.monitorLinks);
    const sourceCard=(items,kind,title,description)=>{
      const first=items.find(item=>url(item.sourceUrl)||url(item.url));
      const target=first&&(url(first.sourceUrl)||url(first.url));
      return `<article class="source-card ${kind}"><header><span>${icon(kind==='publish-source'?'arrow':'pulse',17)}</span><div><small>${kind==='publish-source'?'PUBLICATION':'MONITORING'}</small><h3>${title}</h3><p>${description}</p></div>${target?`<a class="source-open" href="${e(target)}" target="_blank" rel="noopener">打开源表 ${icon('arrow',14)}</a>`:'<em class="source-tag">暂无链接</em>'}</header>${sourceList(items,kind==='publish-source'?'publish':'monitor')}</article>`;
    };
    return `<section class="data-sources" id="project-sources"><div class="data-source-heading"><span>${icon('grid',18)}</span><div><h2>项目数据入口</h2><p>发稿与监测源表单独列出；文件资料不会混在这里。</p></div></div><div class="data-source-grid">${sourceCard(publish,'publish-source','发稿链接','发布明细、分月链接与汇总表')}${sourceCard(monitor,'monitor-source','监测链接','关键词、排名与效果监测表')}</div></section>`;
  }
  function controlProjectPage(p,c){
    const reports=fileLinks(p.reportLinks), brief=fileLinks(p.briefLinks);
    const hasKpiCount=Number.isFinite(c.achieved), pct=hasKpiCount?Math.round(c.achieved/c.target*100):0, gap=hasKpiCount?Math.max(0,c.target-c.achieved):0;
    const periods=c.special?.periods||[];
    const max=Math.max(...periods.map(x=>Number(x.count)||0),1);
    const schedule=c.milestones.map((item,i)=>`<a class="milestone-row ${i===0?'is-next':''}" href="#/calendar?project=${encodeURIComponent(p.name)}"><i>${String(i+1).padStart(2,'0')}</i><span><small>${dayLabel(item.date)} · ${e(item.owner)}</small><b>${e(item.title)}</b><em>${e(item.note)}</em></span><strong>${Math.max(0,Math.ceil((item.date-new Date())/86400000))} 天</strong></a>`).join('');
    return shell(`${header(p.name,'发布 KPI、交付节奏和源数据在一个工作台中呈现。',`<a class="back-link" href="#/status/${encodeURIComponent(p.status)}">${icon('chev',15)} 返回列表</a>`)}
      <nav class="command-tabs"><button class="active" data-scroll="command-kpi">项目概览</button><button data-scroll="command-plan">交付计划</button><button data-scroll="command-data">数据分析</button><button data-scroll="command-files">资料入口</button></nav>
      <section class="project-command" id="command-kpi"><div class="command-eyebrow"><span>LIVE PROJECT CONTROL</span><b>第 ${c.week} 周 · ${e(c.weekRange)}</b></div><div class="project-command-main"><article class="publication-kpi"><small>累计有效发稿</small><strong>${c.total}<em> 篇</em></strong><p>完整订单导出 · 仅统计带有效发布链接的订单</p><span>数据更新：${e(c.updatedAt||'—')}</span></article><article class="target-kpi"><div><small>4 月起 KPI</small><strong>${c.achieved} <em>/ ${c.target}</em></strong></div><div class="kpi-track"><i style="width:${Math.min(100,pct)}%"></i></div><p>${pct}% 已达成 · ${gap?`尚差 ${gap} 篇`:'已完成目标'}</p></article><article class="next-kpi"><small>下一关键节点</small><b>${dayLabel(c.milestones[0].date)}</b><strong>${e(c.milestones[0].title)}</strong><span>${e(c.milestones[0].owner)} · ${Math.max(0,Math.ceil((c.milestones[0].date-new Date())/86400000))} 天后</span></article></div></section>
      <section class="delivery-grid" id="command-plan"><article class="delivery-visual"><div class="command-section-title"><div><h2>发布达成</h2><p>太太乐按项目要求分开核对 4 月前和 4 月起的订单，不混算。</p></div><a href="#/calendar?project=${encodeURIComponent(p.name)}">项目待办 ${icon('arrow',14)}</a></div><div class="publication-bars">${periods.map((item,i)=>`<div><span><i style="height:${Math.max(14,Math.round((Number(item.count)||0)/max*118))}px"></i></span><strong>${Number(item.count||0).toLocaleString()}</strong><small>${e(item.label)}</small></div>`).join('')}</div><p class="source-note-line">${e(c.special?.note||'以订单中的发布链接与发布节点作为统计口径。')}</p></article><aside class="milestone-panel"><div class="command-section-title"><div><h2>交付节点</h2><p>点击任一节点进入日历待办</p></div></div><div class="milestone-list">${schedule}</div></aside></section>
      <section class="team-and-data" id="command-data"><article class="live-team"><div class="command-section-title"><div><h2>当前负责人</h2><p>以下字段在登录后由飞书项目表实时刷新。</p></div><a href="#/workload">成员视图 ${icon('arrow',14)}</a></div><div class="owner-chip-list">${c.members.length?c.members.map(([name,,job])=>`<a href="#/workload?member=${encodeURIComponent(name)}">${av(name)}<span><b>${e(name)}</b><small>${e(job)}</small></span></a>`).join(''):'<p class="chart-empty">飞书尚未填写项目负责人</p>'}</div></article><article class="data-explainer"><span>${icon('pulse',22)}</span><div><h2>数据口径</h2><p>本项目 KPI 使用每周同步的完整订单；拒稿、待发布和无链接订单均不进入有效发稿。</p><small>${e(c.source)} · 更新于 ${e(c.updatedAt||'—')}</small></div></article></section>
      ${dataSources(p)}<section class="command-files" id="command-files"><div class="command-section-title"><div><h2>资料入口</h2><p>文件不在网页内复制或预览，统一在飞书打开，保证权限、版本和协作一致。</p></div><span>${reports.length+brief.length} 份</span></div><div class="command-file-grid">${files('周报 / 月报 / 监测报告',reports,'calendar')}${files('Brief 与项目资料',brief,'folder')}</div></section>`);
  }
  function kpiTarget(p){
    const matched=[...String(p.kpi||'').matchAll(/(\d{1,5})\s*篇/g)].map(x=>Number(x[1]));
    return matched.length ? Math.max(...matched) : null;
  }
  function monthlyChart(p,pub){
    const chartId=`month-${String(p.id).replace(/[^a-zA-Z0-9_-]/g,'')}`;
    const rows=pub.months||[];
    if(!rows.length)return `<div class="monthly-empty"><span>${icon('pulse',22)}</span><b>暂无可按月归集的发布订单</b><p>订单中补充发布时间后，这里会自动生成月度发布量。</p></div>`;
    const max=Math.max(...rows.map(x=>x.value),1), latest=rows[rows.length-1];
    return `<div class="monthly-chart" data-month-chart="${chartId}"><div class="chart-controls"><div><button type="button" class="active" data-month-range="all" data-chart="${chartId}">全部</button><button type="button" data-month-range="6" data-chart="${chartId}">近 6 月</button><button type="button" data-month-range="3" data-chart="${chartId}">近 3 月</button></div><span>last update · ${e(pub.updatedAt||'—')}</span></div><div class="monthly-bars">${rows.map((item,index)=>`<button type="button" class="${index===rows.length-1?'is-selected':''}" data-month-bar data-chart="${chartId}" data-month="${e(item.month)}" data-label="${e(item.label)}" data-value="${item.value}" style="--bar:${Math.max(8,Math.round(item.value/max*100))}%"><i></i><b>${item.value}</b><small>${e(item.label)}</small></button>`).join('')}</div><div class="month-chart-detail" data-month-detail="${chartId}"><b>${e(latest.label)}</b><span>${latest.value} 篇有效发布</span></div></div>`;
  }
  function checklist(p){
    const items=todos().filter(item=>item.project===p.name).sort((a,b)=>Number(a.status==='done')-Number(b.status==='done')||String(a.date).localeCompare(String(b.date)));
    return `<section class="project-checklist"><div class="section-head"><div><h2>项目 Checklist</h2><p>重点待办、负责人、DDL 与优先级统一同步给项目成员。</p></div><button type="button" class="add-todo" data-add-project-todo="${e(p.name)}">+ 新建待办</button></div><div class="checklist-head"><span>事项</span><span>优先级</span><span>DDL</span><span>负责人</span><span></span></div><div class="checklist-list">${items.length?items.map(item=>`<article class="check-row ${item.status==='done'?'is-done':''}"><label class="todo-check"><input type="checkbox" data-todo-toggle="${e(item.id)}" ${item.status==='done'?'checked':''} aria-label="完成 ${e(item.title)}"><span><b>${e(item.title)}</b>${item.description?`<small>${e(item.description)}</small>`:''}</span></label><em class="priority ${e(item.priority||'P2').toLowerCase()}">${e(item.priority||'P2')}</em><time>${dt(item.date)}</time><span class="check-owner">${item.owner?checklistAvatar(item.owner):''}<b>${e(item.owner||'待选择')}</b></span><button type="button" class="todo-edit" data-todo-edit="${e(item.id)}" aria-label="编辑 ${e(item.title)}">${icon('more',17)}</button></article>`).join(''):'<div class="checklist-empty"><span>◌</span><b>还没有重点待办</b><p>点击右上角新建，指定项目成员、DDL 和优先级。</p></div>'}</div></section>`;
  }
  function checklistMemberPicker(selected=''){
    return `<div class="member-picker" role="group" aria-label="选择负责人"><input type="hidden" name="owner" value="${e(selected)}">${memberOptions().map(member=>`<button type="button" class="member-option ${member.name===selected?'selected':''}" data-owner-option="${e(member.name)}" aria-pressed="${member.name===selected?'true':'false'}">${checklistAvatar(member.name)}<span>${e(member.name)}</span></button>`).join('')}</div>`;
  }
  function todoDialog(p){
    return `<dialog class="todo-dialog" id="project-todo-dialog"><form id="project-todo-form"><header><div><span class="dialog-kicker">PROJECT CHECKLIST</span><h2 data-todo-dialog-title>新建项目待办</h2><p>${e(p.name)}</p></div><button type="button" data-todo-close aria-label="关闭">×</button></header><label>待办事项<input required name="title" placeholder="例如：确认本周发稿链接"></label><label>补充说明<textarea name="description" placeholder="可选，写清交付要求"></textarea></label><div class="form-two"><label>优先级<select name="priority"><option value="P0">P0 · 紧急</option><option value="P1" selected>P1 · 重要</option><option value="P2">P2 · 常规</option></select></label><label>DDL<input required type="date" name="date" value="${isoOffset(1)}"></label></div><div class="member-picker-field"><span>负责人</span>${checklistMemberPicker()}</div><input type="hidden" name="project" value="${e(p.name)}"><input type="hidden" name="todoId" value=""><footer><button type="button" data-todo-delete class="delete-action" hidden>删除待办</button><span></span><button type="button" data-todo-close class="ghost-action">取消</button><button type="submit" class="primary-action" data-todo-submit>创建待办</button></footer></form></dialog>`;
  }
  function projectRecentDynamics(p,pub){
    const signal=activity[p.name];
    const report=reportInsights[p.name];
    const latest=(pub.months||[]).slice(-1)[0];
    const previous=(pub.months||[]).slice(-2,-1)[0];
    let items=[];
    if(signal){
      const composition=(signal.types||[]).map(([type,value])=>`${type} ${value}`).join(' · ');
      items=[
        ...(report?[report]:[]),
        {label:signal.period||'近期工作记录',title:`${signal.main?.label||'项目'}推进`,text:`${signal.main?.detail||'已同步近期项目工作记录。'}${composition?` 本期任务构成：${composition}。`:''}`},
        ...(signal.next?.length?[{label:'下一步',title:'待推进事项',text:signal.next.join('、')}]:[])
      ];
    }else if(latest){
      const compared=previous ? `，较 ${previous.label} ${previous.value} 篇` : '';
      items=[
        ...(report?[report]:[]),
        {label:`${latest.label} 发布订单`,title:'月度发布已更新',text:`已归集 ${latest.value.toLocaleString()} 篇有效发布${compared}；当前累计 ${pub.total.toLocaleString()} 篇。`},
        {label:`数据更新 ${pub.updatedAt||'—'}`,title:'等待周报任务同步',text:'该项目暂未匹配到可核验的飞书周报工作记录；周报同步后将自动补充人员与具体任务。'}
      ];
    }else{
      items=[...(report?[report]:[]),{label:'近期工作记录',title:'等待飞书周报同步',text:'暂未匹配到该项目的有效发布订单或周报工作记录；不会以模板内容代替真实动态。'}];
    }
    return `<section class="project-dynamics" id="project-dynamics"><div class="section-head"><div><h2>近期动态</h2><p>优先展示飞书周报工作记录；没有周报时展示最近订单发布变化。</p></div><small>last update · ${e(pub.updatedAt||'—')}</small></div><div class="dynamics-rail">${items.map((item,index)=>`<article class="dynamic-item ${index===0?'is-current':''}"><i>${String(index+1).padStart(2,'0')}</i><div><small>${e(item.label)}</small><b>${e(item.title)}</b><p>${e(item.text)}</p></div></article>`).join('')}</div></section>`;
  }
  function projectPage(id) {
    const p=one(id); if(!p)return shell(`${header('项目未找到','该项目可能已被移动或删除。')}<a class="back-link" href="#/overview">返回项目总览</a>`);
    const pub=publicationFor(p), target=kpiTarget(p), achieved=pub.total, ratio=target?Math.round(achieved/target*100):null;
    const members=memberRows(p), reports=fileLinks(p.reportLinks), briefs=fileLinks(p.briefLinks), materials=fileLinks(p.tableUrl?[{label:'飞书项目记录',url:p.tableUrl}]:[]);
    const sourceFiles=[...reports,...briefs,...materials];
    const kpiText=String(p.kpi||'飞书项目表暂未填写 KPI。').split(/\n+/).filter(Boolean);
    return shell(`${header(p.name,`${p.status} · ${projectCaption(p)}`,`<a class="back-link" href="#/status/${encodeURIComponent(p.status)}">${icon('chev',15)} 返回列表</a>`)}
      <nav class="command-tabs"><button class="active" data-scroll="project-summary">项目概览</button><button data-scroll="project-publication">发布数据</button><button data-scroll="project-checklist">Checklist</button><button data-scroll="project-files">文件资料</button></nav>
      <section class="project-command project-command-unified" id="project-summary"><div class="project-orbit orbit-one"></div><div class="project-orbit orbit-two"></div><div class="command-eyebrow"><span>${badge(p.status)}</span><b>${e(projectTime(p))}</b></div><div class="project-command-main"><article class="publication-kpi"><small>累计有效发布</small><strong>${achieved.toLocaleString()}<em> 篇</em></strong><p>按完整订单中的有效发布链接统计</p></article><article class="target-kpi"><div><small>发布 KPI</small><strong>${target?`${achieved.toLocaleString()} / ${target.toLocaleString()}`:'以飞书项目表为准'}</strong></div>${target?`<div class="kpi-track"><i style="width:${Math.min(100,ratio)}%"></i></div><p>${ratio}% · ${achieved>=target?'已完成目标':`还差 ${(target-achieved).toLocaleString()} 篇`}</p>`:`<p>项目表未提供“篇数”型目标，完整 KPI 列在下方。</p>`}</article><article class="project-status-readout"><small>项目进度</small><strong>${progress(p)}%</strong><i><b style="width:${progress(p)}%"></b></i><span>${e(p.kpiStatus||p.status)}</span></article></div></section>
      <section class="project-kpi-list"><div><h2>项目 KPI</h2><p>完整引用飞书项目表，不再只截取其中一条。</p></div><ol>${kpiText.map(item=>`<li>${e(item)}</li>`).join('')}</ol></section>
      ${projectRecentDynamics(p,pub)}
      <section class="project-main-grid"><article class="publication-card" id="project-publication"><div class="section-head"><div><h2>月度发布情况</h2><p>每根柱代表当月有效发布订单。点击柱形查看数值。</p></div><strong>${achieved.toLocaleString()}<small> 篇</small></strong></div>${monthlyChart(p,pub)}</article>${checklist(p)}</section>
      <section class="project-members" id="project-members"><div class="section-head"><div><h2>项目成员</h2><p>只读取飞书项目表当前填写的成员，不再从模板分配角色。</p></div></div><div class="member-rail">${members.length?members.map(member=>`<div>${av(member.name)}<span><b>${e(member.name)}</b><small>${e(member.role)}</small></span></div>`).join(''):'<p class="chart-empty">飞书项目表尚未填写项目成员。</p>'}</div></section>
      ${dataSources(p)}<section class="command-files" id="project-files"><div class="command-section-title"><div><h2>文件资料</h2><p>文件名保留飞书原始名称，点击整行进入对应飞书文件或源表。</p></div><span>${sourceFiles.length} 份</span></div><div class="command-file-grid">${files('周报 / 月报 / 监测报告',reports,'calendar')}${files('Brief 与项目资料',[...briefs,...materials],'folder')}</div></section>${todoDialog(p)}`);
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
    const syncNote=todoSyncNote();
    return shell(`${header('日历待办','按人物、日期和项目集中看本周的动作。',`<button class="primary-action" data-add-todo>+ 新建待办</button>`)}
      <section class="calendar-toolbar"><div><h2>${project?e(project)+' · 待办':'本周待办'}</h2><p>已登录成员共用同一份待办；新增、编辑和勾选完成会自动同步。</p></div><div>${filters}${modes}</div></section>
      ${mode==='week'?week:kanban}
      <section class="calendar-sync-note"><div>${icon('pulse',20)}<span><b>${e(syncNote.title)}</b><small>${e(syncNote.copy)}</small></span></div><a href="${SYNC_API}/auth/start?return_to=${encodeURIComponent(location.href)}" target="_blank" rel="noopener">${e(syncNote.action)} ${icon('arrow',14)}</a></section>
      <dialog class="todo-dialog" id="todo-dialog"><form method="dialog" id="todo-form"><header><div><small>PROJECT TODO</small><h2>新建待办</h2></div><button type="button" data-todo-close aria-label="关闭">×</button></header><label>事项<input required name="title" placeholder="例如：确认发稿排期"></label><label>说明<textarea name="description" placeholder="补充交付要求或上下文"></textarea></label><div class="form-two"><label>截止日期<input required type="date" name="date" value="${isoOffset(1)}"></label><label>负责人<input name="owner" placeholder="输入成员姓名"></label></div><label>项目<select name="project"><option value="">未归属项目</option>${projects.map(p=>`<option value="${e(p.name)}" ${p.name===project?'selected':''}>${e(p.name)}</option>`).join('')}</select></label><p class="upload-hint">附件上传将在存储服务接入后同步到飞书云文档；当前不会把文件留在浏览器里。</p><footer><button type="button" data-todo-close class="ghost-action">取消</button><button type="submit" class="primary-action">创建待办</button></footer></form></dialog>`);
  }
  function setTodoDialogBusy(dialog,busy){
    dialog?.querySelectorAll('button,input,textarea,select').forEach(node=>node.disabled=busy);
    const submit=dialog?.querySelector('[data-todo-submit]');
    if(submit) submit.textContent=busy?'正在保存…':(dialog.querySelector('[name="todoId"]')?.value?'保存修改':'创建待办');
  }
  function selectTodoOwner(dialog,name){
    const input=dialog?.querySelector('[name="owner"]'); if(!input)return;
    input.value=name||'';
    dialog.querySelectorAll('[data-owner-option]').forEach(button=>{
      const selected=button.dataset.ownerOption===name;
      button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));
    });
  }
  function openProjectTodoDialog(dialog,item){
    if(!dialog)return;
    const form=dialog.querySelector('#project-todo-form'); if(!form)return;
    form.reset();
    const editing=Boolean(item);
    form.elements.todoId.value=item?.id||'';
    form.elements.title.value=item?.title||'';
    form.elements.description.value=item?.description||'';
    form.elements.priority.value=item?.priority||'P1';
    form.elements.date.value=item?.date||isoOffset(1);
    selectTodoOwner(dialog,item?.owner||'');
    dialog.querySelector('[data-todo-dialog-title]').textContent=editing?'编辑项目待办':'新建项目待办';
    dialog.querySelector('[data-todo-delete]').hidden=!editing;
    dialog.querySelector('[data-todo-submit]').textContent=editing?'保存修改':'创建待办';
    if(!dialog.open) dialog.showModal();
    form.elements.title.focus();
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
    document.querySelectorAll('[data-todo-toggle]').forEach(input=>input.addEventListener('change',async()=>{
      if(todoMutationInFlight)return;
      todoMutationInFlight=true;input.disabled=true;
      await updateTodo(input.dataset.todoToggle,{status:input.checked?'done':'todo'});
      todoMutationInFlight=false;render();
    }));
    document.querySelectorAll('[data-month-range]').forEach(button=>button.addEventListener('click',()=>{
      const id=button.dataset.chart, limit=button.dataset.monthRange;
      document.querySelectorAll(`[data-month-range][data-chart="${id}"]`).forEach(x=>x.classList.toggle('active',x===button));
      const bars=[...document.querySelectorAll(`[data-month-bar][data-chart="${id}"]`)];
      bars.forEach((bar,index)=>bar.classList.toggle('is-muted',limit!=='all' && index<bars.length-Number(limit)));
    }));
    document.querySelectorAll('[data-month-bar]').forEach(button=>button.addEventListener('click',()=>{
      const id=button.dataset.chart;
      document.querySelectorAll(`[data-month-bar][data-chart="${id}"]`).forEach(x=>x.classList.toggle('is-selected',x===button));
      const detail=document.querySelector(`[data-month-detail="${id}"]`);
      if(detail) detail.innerHTML=`<b>${e(button.dataset.label||'')}</b><span>${e(button.dataset.value||'0')} 篇有效发布</span>`;
    }));
    document.querySelectorAll('[data-todo-menu]').forEach(button=>button.addEventListener('click',()=>openProjectTodoDialog(document.querySelector('#project-todo-dialog'),todos().find(item=>item.id===button.dataset.todoMenu))));
    document.querySelector('[data-calendar-project]')?.addEventListener('change',event=>{const project=event.target.value;const mode=r().query.get('mode');location.hash=`#/calendar${mode==='kanban'?'?mode=kanban':''}${project?`${mode==='kanban'?'&':'?'}project=${encodeURIComponent(project)}`:''}`;});
    const todoDialog=document.querySelector('#todo-dialog');
    document.querySelector('[data-add-todo]')?.addEventListener('click',()=>todoDialog?.showModal());
    document.querySelectorAll('#todo-dialog [data-todo-close]').forEach(button=>button.addEventListener('click',()=>todoDialog?.close()));
    document.querySelector('#todo-form')?.addEventListener('submit',async event=>{event.preventDefault();const data=new FormData(event.currentTarget);const item={title:String(data.get('title')||'未命名待办'),description:String(data.get('description')||''),date:String(data.get('date')||isoOffset(1)),owner:String(data.get('owner')||'待分配'),project:String(data.get('project')||'未归属项目'),priority:'P2',status:'todo'};if(await createTodo(item)){todoDialog.close();render();}});
    const projectTodoDialog=document.querySelector('#project-todo-dialog');
    document.querySelectorAll('[data-add-project-todo]').forEach(button=>button.addEventListener('click',()=>openProjectTodoDialog(projectTodoDialog)));
    document.querySelectorAll('[data-todo-edit]').forEach(button=>button.addEventListener('click',()=>openProjectTodoDialog(projectTodoDialog,todos().find(item=>item.id===button.dataset.todoEdit))));
    document.querySelectorAll('#project-todo-dialog [data-todo-close]').forEach(button=>button.addEventListener('click',()=>projectTodoDialog?.close()));
    document.querySelectorAll('#project-todo-dialog [data-owner-option]').forEach(button=>button.addEventListener('click',()=>selectTodoOwner(projectTodoDialog,button.dataset.ownerOption)));
    document.querySelector('#project-todo-form')?.addEventListener('submit',async event=>{
      event.preventDefault(); if(todoMutationInFlight)return;
      const form=event.currentTarget,data=new FormData(form),id=String(data.get('todoId')||'');
      const current=todos().find(item=>item.id===id);
      const item={title:String(data.get('title')||'未命名待办'),description:String(data.get('description')||''),date:String(data.get('date')||isoOffset(1)),owner:String(data.get('owner')||''),project:String(data.get('project')||'未归属项目'),priority:String(data.get('priority')||'P2'),status:current?.status||'todo'};
      todoMutationInFlight=true;setTodoDialogBusy(projectTodoDialog,true);
      const saved=id?await updateTodo(id,item):await createTodo(item);
      todoMutationInFlight=false;setTodoDialogBusy(projectTodoDialog,false);
      if(saved){projectTodoDialog?.close();render();}
    });
    document.querySelector('#project-todo-dialog [data-todo-delete]')?.addEventListener('click',async()=>{
      const id=projectTodoDialog?.querySelector('[name="todoId"]')?.value||'';
      const title=projectTodoDialog?.querySelector('[name="title"]')?.value||'这条待办';
      if(!id||!confirm(`确定删除“${title}”吗？此操作会同步给所有成员。`))return;
      todoMutationInFlight=true;setTodoDialogBusy(projectTodoDialog,true);
      const deleted=await deleteTodo(id);
      todoMutationInFlight=false;setTodoDialogBusy(projectTodoDialog,false);
      if(deleted){projectTodoDialog?.close();render();}
    });
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
  function readerMessage(mount, headline, copy, sourceUrl, relogin=false){
    mount.innerHTML=`<div class="preview-message"><span>${icon('folder',24)}</span><strong>${e(headline)}</strong><p>${e(copy)}</p>${relogin?'<button type="button" class="reader-login" data-reader-login>重新登录飞书</button>':''}${sourceUrl?`<a href="${e(url(sourceUrl))}" target="_blank" rel="noopener">在飞书中打开 ${icon('arrow',14)}</a>`:''}</div>`;
    mount.querySelector('[data-reader-login]')?.addEventListener('click',startFeishuLogin);
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
    try{const response=await fetch(readerUrl);if(!response.ok){const body=await response.json().catch(()=>null);const error=new Error(body?.hint||`HTTP ${response.status}`);error.relogin=Boolean(body?.relogin);throw error;}const blob=await response.blob();
      if(kind==='pdf'||kind==='image'){const objectUrl=URL.createObjectURL(blob);mount.innerHTML=`<iframe class="native-preview" src="${objectUrl}" title="${e(title)}"></iframe>`;return;}
      const buffer=await blob.arrayBuffer();if(kind==='sheet')await previewSheet(buffer,mount);else if(kind==='doc')await previewDoc(buffer,mount);else if(kind==='slides')await previewSlides(buffer,mount);else readerMessage(mount,'暂不支持此文件格式','请在飞书中打开原文件。',sourceUrl);
    }catch(error){readerMessage(mount,'文件权限需要重新验证',error?.message||'请确认你拥有该飞书文件的访问权限，然后重试。',sourceUrl||readerUrl,Boolean(error?.relogin));}
  }
  function openReader(readerUrl, title, sourceUrl, fileType){
    const reader=document.querySelector('#reader'), empty=document.querySelector('#reader-empty'), opener=document.querySelector('#reader-open');
    if(!signedIn()){startFeishuLogin();return;}
    if(!readerUrl){return;}
    document.querySelector('#reader-title').textContent=title||'文件阅读'; opener.href=sourceUrl||readerUrl; empty.classList.add('hidden'); reader.classList.add('open'); reader.setAttribute('aria-hidden','false'); document.body.classList.add('reader-active');renderPreview(readerUrl,title,sourceUrl,fileType);
  }
  function closeReader(){const reader=document.querySelector('#reader');reader?.classList.remove('open');reader?.setAttribute('aria-hidden','true');document.body.classList.remove('reader-active');const preview=document.querySelector('#reader-preview');if(preview)preview.innerHTML='';}
  function render(){
    acceptFeishuCallback();
    if(!signedIn()){app.innerHTML=authPage();bind();return;}
    const x=r();
    if(x.page==='calendar'){location.hash='#/overview';return;}
    app.innerHTML=x.page==='status'?statusPage(x.key||'全部'):x.page==='project'?projectPage(x.key):x.page==='workload'?workloadPage():overview();
    bind();
    // 每一次进入工作台后都向飞书拉取当前项目字段；失败时仅保留静态兜底。
    refreshProjectsFromFeishu();
    // Checklist 以共享库为准：首次进入和回到前台都会拉取，随后每 15 秒轻量同步一次。
    refreshTodosFromCloud({rerender:true});
    startTodoPolling();
  }
  addEventListener('hashchange',render);render();
})();
