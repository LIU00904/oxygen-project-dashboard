Warning: truncated output (original token count: 19417)
Total output lines: 669

(() => {
  const app = document.querySelector('#app');
  const S = ['进行中', '待开始', '已完成', '停滞'];
  const M = { '进行中':['blue','进行中'], '待开始':['amber','待开始'], '已完成':['green','已完成'], '停滞':['red','停滞'] };
  const state = { q:'' };
  // 静态数据只用于首次打开和离线兜底。成员字段绝不能使用静态角色：
  // 它们会随项目变更，很容易把历史人员误显示为当前负责人。
  // 在飞书实时项目表返回前，成员区域保持待核对状态。
  const MEMBER_FIELDS=['manager','writer','publisher','monitor'];
  let projects = (window.FEISHU_PROJECTS || []).map(p => {
    const project={...p, id:p.id || p.recordId || p.name, _memberSource:'pending'};
    MEMBER_FIELDS.forEach(field=>{project[field]='';});
    return project;
  });
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
  const url = x => /^(https?:|mailto:)/i.test(String(x||'')) ? String(x) : ''…17417 tokens truncated…t]).async('string');const doc=new DOMParser().parseFromString(xml,'application/xml');const lines=[...doc.getElementsByTagNameNS('*','t')].map(x=>x.textContent.trim()).filter(Boolean);
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

