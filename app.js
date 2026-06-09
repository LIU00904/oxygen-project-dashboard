const STORAGE_KEY = "oxygen-project-dashboard-v4";
const today = startOfToday();

const statusColors = {
  "已完成": "#21c27a",
  "进行中": "#0a84ff",
  "待开始": "#ffb020",
  "停滞": "#ff5a68"
};

const invoiceOptions = ["待确认", "待开票", "已开票", "无需开票"];

const seedProjects = window.FEISHU_PROJECTS || [
  {
    id: crypto.randomUUID(),
    name: "示例项目：品牌 SEO 提升",
    status: "进行中",
    startDate: "2026-06-01",
    cycleDays: 45,
    kpi: "核心词排名进入首页，月曝光提升 30%",
    platform: "百度 / 小红书",
    notes: "等待飞书 API 权限后替换为真实项目数据。",
    manager: "待补充",
    writer: "待补充",
    publisher: "待补充",
    monitor: "待补充",
    reportStatus: "待更新",
    invoiceStatus: "待确认"
  }
];

let projects = loadProjects();
let currentFilter = "all";
let currentSort = "progress";
let invoiceOnly = false;
let compactMode = false;

const els = {
  board: document.querySelector("#projectBoard"),
  totalProjects: document.querySelector("#totalProjects"),
  avgProgress: document.querySelector("#avgProgress"),
  invoiceDue: document.querySelector("#invoiceDue"),
  statusTabs: document.querySelector("#statusTabs"),
  searchInput: document.querySelector("#searchInput"),
  controlTitle: document.querySelector("#controlTitle"),
  controlMeta: document.querySelector("#controlMeta"),
  invoiceOnlyBtn: document.querySelector("#invoiceOnlyBtn"),
  densityBtn: document.querySelector("#densityBtn"),
  pageTitle: document.querySelector("#pageTitle"),
  pageMeta: document.querySelector("#pageMeta"),
  dialog: document.querySelector("#projectDialog"),
  openFormBtn: document.querySelector("#openFormBtn"),
  saveProjectBtn: document.querySelector("#saveProjectBtn"),
  exportBtn: document.querySelector("#exportBtn")
};

const fields = [
  "projectId",
  "name",
  "status",
  "startDate",
  "cycleDays",
  "kpi",
  "platform",
  "manager",
  "writer",
  "publisher",
  "monitor",
  "invoiceStatus",
  "publishLinks",
  "monitorLinks",
  "optimizationSuggestion",
  "notes"
];

function loadProjects() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return seedProjects;
  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : seedProjects;
  } catch {
    return seedProjects;
  }
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

function dateFrom(value) {
  return new Date(`${value}T00:00:00+08:00`);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + Number(days));
  return next;
}

function formatDate(date) {
  return date.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function calculate(project) {
  const start = dateFrom(project.startDate);
  const deadline = addDays(start, Number(project.cycleDays || 1));
  const elapsed = Math.max(0, Math.ceil((today - start) / 86400000));
  const feishuProgress = Number(project.progressPercent);
  const progress = Number.isFinite(feishuProgress)
    ? Math.min(100, Math.max(0, Math.round(feishuProgress)))
    : project.status === "已完成"
    ? 100
    : project.status === "待开始"
      ? 0
      : Math.min(100, Math.max(0, Math.round((elapsed / Number(project.cycleDays || 1)) * 100)));
  const remaining = Math.ceil((deadline - today) / 86400000);
  return { start, deadline, progress, remaining };
}

function statusLabel(project, remaining) {
  if (project.status === "已完成") return "已完成";
  if (project.status === "停滞") return "停滞";
  if (remaining < 0) return `逾期 ${Math.abs(remaining)} 天`;
  if (remaining === 0) return "今日截止";
  return `剩余 ${remaining} 天`;
}

function filteredProjects() {
  const query = els.searchInput.value.trim().toLowerCase();
  return projects.filter(project => {
    const statusOk = currentFilter === "all" || project.status === currentFilter;
    const text = Object.values(project).join(" ").toLowerCase();
    const invoiceOk = !invoiceOnly || ["待确认", "待开票"].includes(project.invoiceStatus);
    return statusOk && invoiceOk && (!query || text.includes(query));
  }).sort((a, b) => {
    const calcA = calculate(a);
    const calcB = calculate(b);
    if (currentSort === "deadline") return calcA.deadline - calcB.deadline;
    return calcB.progress - calcA.progress;
  });
}

function render() {
  renderMetrics();
  renderStatusCounts();
  const items = filteredProjects();
  els.pageTitle.textContent = currentFilter === "all" ? "全部项目" : currentFilter;
  els.pageMeta.textContent = `${items.length} 个项目`;
  els.controlTitle.textContent = currentFilter === "all" ? "全部项目" : `${currentFilter}项目`;
  els.controlMeta.textContent = `${items.length} 个项目 · ${currentSort === "deadline" ? "按截止时间排序" : "按进度排序"}${invoiceOnly ? " · 仅待开票" : ""}`;
  document.body.classList.toggle("compact-mode", compactMode);

  if (!items.length) {
    els.board.innerHTML = `<div class="empty glass"><h2>暂无匹配项目</h2><p class="subline">换一个状态或搜索词试试。</p></div>`;
    return;
  }

  els.board.innerHTML = items.map(project => {
    const timing = calculate(project);
    const color = statusColors[project.status] || statusColors["进行中"];
    return `
      <article class="project-row glass" style="--status-color:${color};--progress:${timing.progress}%">
        <div class="row-main">
          <div class="project-identity">
            <h3 class="project-title">${escapeHtml(project.name)}</h3>
            <div class="chips">
              <span class="chip">${escapeHtml(project.platform || "未填平台")}</span>
              <span class="chip">${statusLabel(project, timing.remaining)}</span>
            </div>
          </div>
          <div class="resource-links top-links">
            ${renderResourceLink("发稿链接", project.publishLinks)}
            ${renderResourceLink("监测表", project.monitorLinks)}
          </div>
          <select class="status-select" data-action="status" data-id="${project.id}">
            ${Object.keys(statusColors).map(status => `<option ${project.status === status ? "selected" : ""}>${status}</option>`).join("")}
          </select>
        </div>

        <div class="assessment-strip">
          <div class="kpi-verdict ${getVerdictClass(project)}">
            <span>KPI评估</span>
            <strong>${escapeHtml(project.kpiStatus || "待评估")}</strong>
          </div>
          <div class="data-summary">
            <span>当前数据</span>
            ${renderCurrentData(project, timing)}
          </div>
          <div class="suggestion-box">
            <span>优化建议</span>
            <p>${escapeHtml(project.optimizationSuggestion || "补充监测数据后生成优化建议。")}</p>
          </div>
        </div>

        <div class="row-content">
          <div class="progress-panel">
            <div class="progress-line">
              <span>${formatDate(timing.start)} → ${formatDate(timing.deadline)}</span>
              <strong>${timing.progress}%</strong>
            </div>
            <div class="progress-track"><div class="progress-fill"></div></div>
            <div class="cycle-line">周期 ${Number(project.cycleDays || 0)} 天</div>
          </div>
          <div class="kpi-panel">
            <span>项目 KPI</span>
            ${renderKpi(project.kpi)}
          </div>
          <div class="people-panel">
            <span>项目人员</span>
            ${renderPeople(project)}
          </div>
          <div class="invoice-panel">
            <span>开票信息</span>
            ${renderInvoiceToggle(project)}
          </div>
        </div>

        <div class="card-actions">
          <button class="ghost-btn" data-action="edit" data-id="${project.id}">编辑</button>
          <button class="ghost-btn" data-action="delete" data-id="${project.id}">删除</button>
        </div>
      </article>
    `;
  }).join("");
}

function getVerdictClass(project) {
  const status = project.kpiStatus || "";
  if (status.includes("已达标")) return "good";
  if (status.includes("停滞") || status.includes("未达标")) return "bad";
  if (status.includes("推进")) return "working";
  return "neutral";
}

function renderResourceLink(label, links) {
  const items = normalizeLinks(links);
  if (!items.length) {
    return `<button class="resource-btn pending-link" type="button">${label} · 待补充</button>`;
  }
  return items.map((item, index) => `
    <a class="resource-btn" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
      ${escapeHtml(label)}${items.length > 1 ? ` ${index + 1}` : ""}
    </a>
  `).join("");
}

function normalizeLinks(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map(item => {
    if (typeof item === "string") return { label: item, url: item };
    return item;
  }).filter(item => item && item.url);
}

function renderCurrentData(project, timing) {
  const progress = Number(timing.progress || 0);
  const gap = Math.max(0, 100 - progress);
  const data = [
    project.currentData || `当前完成度 ${progress}%`,
    progress >= 100 ? "完成度已达到 100%" : `距离 100% 还差 ${gap}%`,
    project.status === "待开始" ? "待补充启动数据" : "",
    project.status === "停滞" ? "需要更新停滞原因" : ""
  ].filter(Boolean);
  return `<ul class="data-list">${data.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderMetrics() {
  const timings = projects.map(calculate);
  const avg = timings.length ? Math.round(timings.reduce((sum, item) => sum + item.progress, 0) / timings.length) : 0;
  els.totalProjects.textContent = projects.length;
  els.avgProgress.textContent = `${avg}%`;
  els.invoiceDue.textContent = projects.filter(item => ["待确认", "待开票"].includes(item.invoiceStatus)).length;
}

function renderStatusCounts() {
  const counts = projects.reduce((acc, project) => {
    acc[project.status] = (acc[project.status] || 0) + 1;
    return acc;
  }, { all: projects.length });
  document.querySelectorAll("[data-count]").forEach(item => {
    item.textContent = counts[item.dataset.count] || 0;
  });
}

function renderInvoiceToggle(project) {
  const current = project.invoiceStatus || "待确认";
  return `
    <div class="invoice-toggle" role="group" aria-label="开票状态">
      ${invoiceOptions.map(option => `
        <button
          class="${current === option ? "active" : ""}"
          data-action="invoice"
          data-id="${project.id}"
          data-value="${option}"
          type="button"
        >${option}</button>
      `).join("")}
    </div>
  `;
}

function renderKpi(kpi) {
  const parts = splitKpi(kpi);
  if (!parts.length) return `<p class="muted-text">待补充</p>`;
  if (parts.length === 1) return `<p>${escapeHtml(parts[0])}</p>`;
  return `<ol class="kpi-list">${parts.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ol>`;
}

function splitKpi(kpi) {
  const text = String(kpi || "").trim();
  if (!text) return [];
  const normalized = text
    .replace(/\s*([1-9][0-9]*[.、）)])\s*/g, "\n$1 ")
    .replace(/\s*([一二三四五六七八九十]+[、）)])\s*/g, "\n$1 ");
  const parts = normalized
    .split(/\n+/)
    .map(item => item.replace(/^([1-9][0-9]*|[一二三四五六七八九十]+)[.、）)]\s*/, "").trim())
    .filter(Boolean);
  if (parts.length > 1) return parts;
  return text.split(/；|;(?=\s*)/).map(item => item.trim()).filter(Boolean);
}

function renderPeople(project) {
  const roles = [
    ["项目经理", project.manager],
    ["写稿", project.writer],
    ["发稿", project.publisher],
    ["监测", project.monitor]
  ];
  return `<div class="person-list">${roles.map(([role, value]) => renderPerson(role, value)).join("")}</div>`;
}

function renderPerson(role, value) {
  const names = String(value || "待补充").split(/、|,|，|\//).map(item => item.trim()).filter(Boolean);
  return `
    <div class="person-role">
      <small>${role}</small>
      <div class="person-names">
        ${names.map(name => `
          <div class="person-line">
            <span class="avatar">${escapeHtml(name.slice(0, 1))}</span>
            <strong>${escapeHtml(name)}</strong>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function openForm(project) {
  fields.forEach(id => {
    const el = document.querySelector(`#${id}`);
    if (!el) return;
    const key = id === "projectId" ? "id" : id;
    if (["publishLinks", "monitorLinks"].includes(id)) {
      el.value = normalizeLinks(project?.[key]).map(item => item.url).join("\n");
      return;
    }
    el.value = project?.[key] ?? "";
  });
  if (!project) {
    document.querySelector("#status").value = "进行中";
    document.querySelector("#startDate").value = "2026-06-08";
    document.querySelector("#cycleDays").value = 30;
    document.querySelector("#invoiceStatus").value = "待确认";
  }
  els.dialog.showModal();
}

function collectForm() {
  return {
    id: document.querySelector("#projectId").value || crypto.randomUUID(),
    name: document.querySelector("#name").value.trim(),
    status: document.querySelector("#status").value,
    startDate: document.querySelector("#startDate").value,
    cycleDays: Number(document.querySelector("#cycleDays").value),
    kpi: document.querySelector("#kpi").value.trim(),
    platform: document.querySelector("#platform").value.trim(),
    manager: document.querySelector("#manager").value.trim(),
    writer: document.querySelector("#writer").value.trim(),
    publisher: document.querySelector("#publisher").value.trim(),
    monitor: document.querySelector("#monitor").value.trim(),
    invoiceStatus: document.querySelector("#invoiceStatus").value,
    publishLinks: parseLinks(document.querySelector("#publishLinks")?.value),
    monitorLinks: parseLinks(document.querySelector("#monitorLinks")?.value),
    optimizationSuggestion: document.querySelector("#optimizationSuggestion")?.value.trim() || "",
    notes: document.querySelector("#notes").value.trim()
  };
}

function parseLinks(value = "") {
  return value.split(/\n|,|，/)
    .map(item => item.trim())
    .filter(Boolean)
    .map(url => ({ url }));
}

els.openFormBtn.addEventListener("click", () => openForm());

els.saveProjectBtn.addEventListener("click", event => {
  event.preventDefault();
  const project = collectForm();
  if (!project.name || !project.startDate || !project.cycleDays) return;
  const index = projects.findIndex(item => item.id === project.id);
  if (index >= 0) projects[index] = project;
  else projects.unshift(project);
  persist();
  els.dialog.close();
  render();
});

els.statusTabs.addEventListener("click", event => {
  const button = event.target.closest("button[data-filter]");
  if (!button) return;
  currentFilter = button.dataset.filter;
  els.statusTabs.querySelectorAll("button").forEach(item => item.classList.toggle("active", item === button));
  render();
});

els.searchInput.addEventListener("input", render);

document.querySelectorAll("[data-sort]").forEach(button => {
  button.addEventListener("click", () => {
    currentSort = button.dataset.sort;
    document.querySelectorAll("[data-sort]").forEach(item => item.classList.toggle("active", item === button));
    render();
  });
});

els.invoiceOnlyBtn.addEventListener("click", () => {
  invoiceOnly = !invoiceOnly;
  els.invoiceOnlyBtn.classList.toggle("active", invoiceOnly);
  render();
});

els.densityBtn.addEventListener("click", () => {
  compactMode = !compactMode;
  els.densityBtn.classList.toggle("active", compactMode);
  render();
});

els.board.addEventListener("change", event => {
  const select = event.target.closest("select[data-action='status']");
  if (!select) return;
  const project = projects.find(item => item.id === select.dataset.id);
  if (!project) return;
  project.status = select.value;
  persist();
  render();
});

els.board.addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const project = projects.find(item => item.id === button.dataset.id);
  if (button.dataset.action === "invoice" && project) {
    project.invoiceStatus = button.dataset.value;
    persist();
    render();
    return;
  }
  if (button.dataset.action === "edit" && project) openForm(project);
  if (button.dataset.action === "delete") {
    projects = projects.filter(item => item.id !== button.dataset.id);
    persist();
    render();
  }
});

els.exportBtn.addEventListener("click", async () => {
  const payload = JSON.stringify(projects, null, 2);
  await navigator.clipboard.writeText(payload);
  els.exportBtn.textContent = "✓";
  setTimeout(() => {
    els.exportBtn.textContent = "↓";
  }, 1200);
});

render();
