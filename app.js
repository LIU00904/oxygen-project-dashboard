const STORAGE_KEY = "oxygen-project-dashboard-v18";
const today = startOfToday();

const statusColors = {
  "已完成": "#21c27a",
  "进行中": "#0a84ff",
  "待开始": "#ffb020",
  "停滞": "#ff5a68"
};

const invoiceOptions = ["待确认", "待开票", "已开票", "无需开票"];
const statusPriority = {
  "进行中": 0,
  "待开始": 1,
  "已完成": 2,
  "停滞": 3
};

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
let pickerState = {};

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

const peopleOptions = buildPeopleOptions(seedProjects);

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
  "reportLinks",
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
  if (project.status === "待开始") {
    return { start: null, deadline: null, progress: 0, remaining: null };
  }
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
  if (project.status === "待开始") return "待开始";
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
    const statusDiff = (statusPriority[a.status] ?? 9) - (statusPriority[b.status] ?? 9);
    if (currentFilter === "all" && statusDiff !== 0) return statusDiff;
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
    const pendingStart = project.status === "待开始";
    return `
      <article class="project-row sketch-card glass" style="--status-color:${color};--progress:${timing.progress}%">
        <section class="sketch-left">
          <div class="sketch-name">
            <span>项目名</span>
            <h3 class="project-title">${escapeHtml(project.name)}</h3>
          </div>
          <div class="sketch-platform">
            <span>优化平台</span>
            <strong>${escapeHtml(project.platform || "未填平台")}</strong>
          </div>
        </section>

        <section class="sketch-progress">
          <div class="progress-dates">
            <strong>${pendingStart ? "" : `${formatDate(timing.start)} → ${formatDate(timing.deadline)}`}</strong>
            <span>${timing.progress}%</span>
          </div>
          <div class="progress-track"><div class="progress-fill"></div></div>
          <div class="progress-meta">
            <span>${pendingStart ? "" : `周期 ${Number(project.cycleDays || 0)} 天`}</span>
            <strong>${pendingStart ? "" : statusLabel(project, timing.remaining)}</strong>
          </div>
        </section>

        <section class="sketch-right">
          <select class="status-select" data-action="status" data-id="${project.id}">
            ${Object.keys(statusColors).map(status => `<option ${project.status === status ? "selected" : ""}>${status}</option>`).join("")}
          </select>
        </section>

        <section class="sketch-kpi">
          <span>KPI</span>
          ${renderKpi(project.kpi)}
        </section>

        <section class="sketch-data">
          <span>当前数据</span>
          ${renderCurrentData(project, timing)}
        </section>

        <section class="sketch-suggestion">
          <span>优化建议</span>
          <p>${escapeHtml(project.optimizationSuggestion || "补充监测数据后生成优化建议。")}</p>
        </section>

        <section class="sketch-folders">
          <div class="sketch-folder sketch-material-folder">
            ${renderResourceFolder("项目资料", "发稿链接 / 监测表", "blue", "▣", [
              ["发稿链接", project.publishLinks],
              ["监测表", project.monitorLinks]
            ])}
          </div>
          <div class="sketch-folder sketch-report-folder">
            ${renderResourceFolder("报告文件", "周报 / 月报 / 结案报告", "purple", "▤", [
              ["报告", project.reportLinks]
            ])}
          </div>
        </section>

        <section class="sketch-invoice">
          <span>开票信息</span>
          ${renderInvoiceToggle(project)}
        </section>

        <section class="sketch-people">
          <span>项目人员</span>
          ${renderPeople(project)}
        </section>

        <button class="ghost-btn sketch-edit" data-action="edit" data-id="${project.id}">编辑</button>
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
    const pending = label === "报告" ? "待上传至飞书" : "待补充";
    return `<button class="resource-btn pending-link" type="button">${label} · ${pending}</button>`;
  }
  return items.map((item, index) => `
    <a class="resource-btn" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
      ${escapeHtml(label)}${items.length > 1 ? ` ${index + 1}` : ""}
    </a>
  `).join("");
}

function renderResourceFolder(title, subtitle, color, icon, groups) {
  const links = groups.flatMap(([label, value]) =>
    normalizeLinks(value).map((item, index, group) => ({
      label: item.label || `${label}${group.length > 1 ? ` ${index + 1}` : ""}`,
      url: item.url
    }))
  );
  const countLabel = links.length ? `${links.length} 个文件` : "0 个文件";
  const linkHtml = links.length
    ? links.map(item => `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.label)}</a>`).join("")
    : `<span class="folder-empty">待上传至飞书</span>`;
  return `
    <details class="folder-details">
      <summary>
        <div class="glass-icon-btn folder-${color}">
          <span class="icon-btn__back"></span>
          <span class="icon-btn__front"><span class="icon-btn__icon">${icon}</span></span>
        </div>
        <div class="folder-copy">
          <strong>${escapeHtml(title)}</strong>
          <p>${escapeHtml(subtitle)}</p>
          <span class="folder-count">${countLabel}</span>
        </div>
      </summary>
      <div class="folder-links">${linkHtml}</div>
    </details>
  `;
}

function normalizeLinks(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map(item => {
    if (typeof item === "string") return { label: item, url: item };
    return item;
  }).filter(item => item && (item.url || item.label));
}

function renderCurrentData(project, timing) {
  if (project.currentData && project.currentData.trim()) {
    const data = project.currentData
      .split(/\n|；|。/)
      .map(item => item.trim())
      .filter(Boolean);
    return `<ul class="data-list">${data.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
  }
  const progress = Number(timing.progress || 0);
  const gap = Math.max(0, 100 - progress);
  const publishCount = normalizeLinks(project.publishLinks).length;
  const monitorCount = normalizeLinks(project.monitorLinks).length;
  const reportCount = normalizeLinks(project.reportLinks).length;
  const data = [];
  if (project.status === "进行中") {
    data.push(progress >= 100 ? "当前进度已到 100%，建议核对是否可转为已完成。" : `当前进度 ${progress}%，距离阶段目标还差 ${gap}%。`);
  } else if (project.status === "已完成") {
    data.push("项目已完成，重点检查发稿、监测和报告是否归档齐全。");
  } else if (project.status === "待开始") {
    data.push("项目待开始，需要补齐启动时间、KPI、人员与资料入口。");
  } else if (project.status === "停滞") {
    data.push("项目处于停滞状态，需要补充停滞原因和下一步处理口径。");
  }
  data.push(publishCount ? `已关联 ${publishCount} 个发稿资料入口。` : "尚未关联发稿资料。");
  data.push(monitorCount ? `已关联 ${monitorCount} 个监测表入口，可继续汇总近一周/近一月趋势。` : "尚未关联监测表，暂无法分析排名与收录趋势。");
  if (!reportCount) data.push("报告文件待上传到飞书“项目报告文件”字段。");
  else data.push(`已关联 ${reportCount} 个报告入口。`);
  return `<ul class="data-list">${data.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderMetrics() {
  const activeProjects = projects.filter(item => item.status === "进行中");
  const timings = activeProjects.map(calculate);
  const avg = timings.length ? Math.round(timings.reduce((sum, item) => sum + item.progress, 0) / timings.length) : 0;
  els.totalProjects.textContent = projects.length;
  els.avgProgress.textContent = `${avg}%`;
  els.invoiceDue.textContent = projects.filter(item => ["待确认", "待开票"].includes(item.invoiceStatus)).length;
}

function buildPeopleOptions(source) {
  const names = new Set();
  source.forEach(project => {
    [project.manager, project.writer, project.publisher, project.monitor].forEach(value => {
      String(value || "").split(/、|,|，|\//).map(item => item.trim()).filter(Boolean).forEach(name => names.add(name));
    });
  });
  return [...names].sort((a, b) => a.localeCompare(b, "zh-CN"));
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
    if (["publishLinks", "monitorLinks", "reportLinks"].includes(id)) {
      el.value = normalizeLinks(project?.[key]).map(item => item.url).join("\n");
      return;
    }
    el.value = project?.[key] ?? "";
  });
  populatePeoplePickers(project);
  if (!project) {
    document.querySelector("#status").value = "进行中";
    document.querySelector("#startDate").value = "2026-06-08";
    document.querySelector("#cycleDays").value = 30;
    document.querySelector("#invoiceStatus").value = "待确认";
  }
  els.dialog.showModal();
}

function populatePeoplePickers(project = {}) {
  pickerState = {};
  ["manager", "writer", "publisher", "monitor"].forEach(id => {
    pickerState[id] = splitPeople(project[id]);
    renderPeoplePicker(id);
  });
}

function selectedPeople(id) {
  return (pickerState[id] || []).join("、");
}

function splitPeople(value) {
  return String(value || "")
    .split(/、|,|，|\//)
    .map(item => item.trim())
    .filter(Boolean);
}

function renderPeoplePicker(id) {
  const selectedWrap = document.querySelector(`[data-selected="${id}"]`);
  const optionsWrap = document.querySelector(`[data-options="${id}"]`);
  if (!selectedWrap || !optionsWrap) return;
  const selected = new Set(pickerState[id] || []);
  selectedWrap.innerHTML = selected.size
    ? [...selected].map(name => `
      <span class="people-chip">
        <span class="avatar mini">${escapeHtml(name.slice(0, 1))}</span>
        ${escapeHtml(name)}
      </span>
    `).join("")
    : `<span class="empty-chip">未选择</span>`;
  optionsWrap.innerHTML = peopleOptions.map(name => `
    <label class="picker-option ${selected.has(name) ? "checked" : ""}">
      <input type="checkbox" data-people-field="${id}" value="${escapeHtml(name)}" ${selected.has(name) ? "checked" : ""} />
      <span class="avatar mini">${escapeHtml(name.slice(0, 1))}</span>
      <strong>${escapeHtml(name)}</strong>
    </label>
  `).join("");
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
    manager: selectedPeople("manager"),
    writer: selectedPeople("writer"),
    publisher: selectedPeople("publisher"),
    monitor: selectedPeople("monitor"),
    invoiceStatus: document.querySelector("#invoiceStatus").value,
    publishLinks: parseLinks(document.querySelector("#publishLinks")?.value),
    monitorLinks: parseLinks(document.querySelector("#monitorLinks")?.value),
    reportLinks: parseLinks(document.querySelector("#reportLinks")?.value),
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

els.dialog.addEventListener("click", event => {
  const trigger = event.target.closest(".picker-trigger");
  if (!trigger) return;
  const picker = trigger.closest(".people-picker");
  document.querySelectorAll(".people-picker.open").forEach(item => {
    if (item !== picker) item.classList.remove("open");
  });
  picker.classList.toggle("open");
});

els.dialog.addEventListener("change", event => {
  const input = event.target.closest("input[data-people-field]");
  if (!input) return;
  const field = input.dataset.peopleField;
  const selected = new Set(pickerState[field] || []);
  if (input.checked) selected.add(input.value);
  else selected.delete(input.value);
  pickerState[field] = [...selected];
  renderPeoplePicker(field);
  document.querySelector(`.people-picker[data-field="${field}"]`)?.classList.add("open");
});

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
