const STORAGE_KEY = "oxygen-project-dashboard-local-edits";
const LEGACY_STORAGE_KEYS = [
  "oxygen-project-dashboard-v21",
  "oxygen-project-dashboard-v20",
  "oxygen-project-dashboard-v19",
  "oxygen-project-dashboard-v18",
  "oxygen-project-dashboard-v17",
  "oxygen-project-dashboard-v16",
  "oxygen-project-dashboard-v15"
];
const FEISHU_SYNC_API = window.FEISHU_SYNC_API || localStorage.getItem("FEISHU_SYNC_API") || "";
const syncMeta = window.FEISHU_SYNC_META || {};
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
let lockedScrollY = 0;

const els = {
  board: document.querySelector("#projectBoard"),
  totalProjects: document.querySelector("#totalProjects"),
  avgProgress: document.querySelector("#avgProgress"),
  invoiceDue: document.querySelector("#invoiceDue"),
  statusTabs: document.querySelector("#statusTabs"),
  searchInput: document.querySelector("#searchInput"),
  controlTitle: document.querySelector("#controlTitle"),
  controlMeta: document.querySelector("#controlMeta"),
  publishRequirementsBtn: document.querySelector("#publishRequirementsBtn"),
  publishRequirementsDialog: document.querySelector("#publishRequirementsDialog"),
  publishRequirementsClose: document.querySelector("#publishRequirementsClose"),
  publishRequirementsPanel: document.querySelector("#publishRequirementsPanel"),
  publishRequirementsMeta: document.querySelector("#publishRequirementsMeta"),
  invoiceOnlyBtn: document.querySelector("#invoiceOnlyBtn"),
  densityBtn: document.querySelector("#densityBtn"),
  pageTitle: document.querySelector("#pageTitle"),
  pageMeta: document.querySelector("#pageMeta"),
  exportBtn: document.querySelector("#exportBtn")
};

const peopleOptions = buildPeopleOptions(seedProjects);

initIridescenceBackground();

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
  "briefLinks",
  "optimizationSuggestion",
  "notes"
];

const feishuSyncedFields = [
  "source",
  "name",
  "status",
  "startDate",
  "cycleDays",
  "progressPercent",
  "kpi",
  "platform",
  "notes",
  "manager",
  "writer",
  "publisher",
  "monitor",
  "invoiceStatus",
  "publishLinks",
  "monitorLinks",
  "reportLinks",
  "briefLinks",
  "kpiStatus",
  "currentData",
  "optimizationSuggestion"
];

function loadProjects() {
  const saved = localStorage.getItem(STORAGE_KEY) || LEGACY_STORAGE_KEYS.map(key => localStorage.getItem(key)).find(Boolean);
  if (!saved) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seedProjects));
    return seedProjects;
  }
  try {
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return seedProjects;
    const savedById = new Map(parsed.map(project => [project.id, project]));
    const savedByName = new Map(parsed.map(project => [project.name, project]));
    const merged = seedProjects.map(project => {
      const savedProject = savedById.get(project.id) || savedByName.get(project.name) || {};
      const mergedProject = {
        ...project,
        ...savedProject
      };
      feishuSyncedFields.forEach(field => {
        mergedProject[field] = Object.prototype.hasOwnProperty.call(project, field)
          ? project[field]
          : (Array.isArray(mergedProject[field]) ? [] : "");
      });
      return mergedProject;
    });
    const seedIds = new Set(seedProjects.map(project => project.id));
    const seedNames = new Set(seedProjects.map(project => project.name));
    parsed.forEach(project => {
      if (!seedIds.has(project.id) && !seedNames.has(project.name)) merged.unshift(project);
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    return merged;
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

function endDateFor(project) {
  if (!project.startDate || !project.cycleDays) return "";
  return addDays(dateFrom(project.startDate), Number(project.cycleDays)).toISOString().slice(0, 10);
}

function projectSyncPayload(project) {
  return {
    recordId: project.id,
    fields: {
      status: project.status,
      name: project.name,
      startDate: project.startDate,
      endDate: endDateFor(project),
      kpi: project.kpi,
      platform: project.platform,
      notes: project.notes,
      invoiceStatus: project.invoiceStatus,
      publishLinks: normalizeLinks(project.publishLinks).map(item => item.url).filter(Boolean).join("\n"),
      monitorLinks: normalizeLinks(project.monitorLinks).map(item => item.url).filter(Boolean).join("\n"),
      briefLinks: normalizeLinks(project.briefLinks).map(item => item.url).filter(Boolean).join("\n"),
      optimizationSuggestion: project.optimizationSuggestion
    }
  };
}

async function syncProjectToFeishu(project) {
  if (!FEISHU_SYNC_API || !project?.id?.startsWith("rec")) return;
  try {
    const response = await fetch(FEISHU_SYNC_API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(projectSyncPayload(project))
    });
    if (!response.ok) throw new Error(await response.text());
    console.info("已同步飞书", project.name);
  } catch (error) {
    console.warn("飞书同步失败，已保存在网页本地", error);
  }
}

function initIridescenceBackground() {
  const container = document.querySelector("#iridescenceBg");
  if (!container) return;
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
  if (!gl) {
    container.classList.add("iridescence-fallback");
    return;
  }

  const vertexShader = `
    attribute vec2 position;
    varying vec2 vUv;
    void main() {
      vUv = position * 0.5 + 0.5;
      gl_Position = vec4(position, 0.0, 1.0);
    }
  `;
  const fragmentShader = `
    precision highp float;
    uniform float uTime;
    uniform vec3 uColor;
    uniform vec3 uResolution;
    uniform vec2 uMouse;
    uniform float uAmplitude;
    uniform float uSpeed;
    varying vec2 vUv;

    void main() {
      float mr = min(uResolution.x, uResolution.y);
      vec2 uv = (vUv.xy * 2.0 - 1.0) * uResolution.xy / mr;
      uv += (uMouse - vec2(0.5)) * uAmplitude;

      float d = -uTime * 0.5 * uSpeed;
      float a = 0.0;
      for (float i = 0.0; i < 8.0; ++i) {
        a += cos(i - d - a * uv.x);
        d += sin(uv.y * i + a);
      }
      d += uTime * 0.5 * uSpeed;
      vec3 col = vec3(cos(uv * vec2(d, a)) * 0.6 + 0.4, cos(a + d) * 0.5 + 0.5);
      col = cos(col * cos(vec3(d, a, 2.5)) * 0.5 + 0.5) * uColor;
      col = mix(vec3(0.91, 0.96, 0.98), col, 0.42);
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  const program = createShaderProgram(gl, vertexShader, fragmentShader);
  if (!program) {
    container.classList.add("iridescence-fallback");
    return;
  }

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const uniforms = {
    time: gl.getUniformLocation(program, "uTime"),
    color: gl.getUniformLocation(program, "uColor"),
    resolution: gl.getUniformLocation(program, "uResolution"),
    mouse: gl.getUniformLocation(program, "uMouse"),
    amplitude: gl.getUniformLocation(program, "uAmplitude"),
    speed: gl.getUniformLocation(program, "uSpeed")
  };
  const mouse = { x: 0.52, y: 0.48 };
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let frameId = 0;

  container.appendChild(canvas);
  gl.useProgram(program);
  gl.uniform3f(uniforms.color, 0.86, 0.91, 0.94);
  gl.uniform1f(uniforms.amplitude, 0.035);
  gl.uniform1f(uniforms.speed, reduceMotion ? 0.1 : 0.42);

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.75);
    const width = Math.max(1, Math.floor(container.offsetWidth * ratio));
    const height = Math.max(1, Math.floor(container.offsetHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
    gl.uniform3f(uniforms.resolution, width, height, width / height);
  }

  function update(time) {
    resize();
    gl.uniform1f(uniforms.time, time * 0.001);
    gl.uniform2f(uniforms.mouse, mouse.x, mouse.y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    frameId = requestAnimationFrame(update);
  }

  window.addEventListener("resize", resize);
  window.addEventListener("mousemove", event => {
    mouse.x = event.clientX / Math.max(1, window.innerWidth);
    mouse.y = 1 - event.clientY / Math.max(1, window.innerHeight);
  }, { passive: true });
  frameId = requestAnimationFrame(update);
  window.addEventListener("pagehide", () => cancelAnimationFrame(frameId), { once: true });
}

function createShaderProgram(gl, vertexSource, fragmentSource) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null;
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
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
  renderPublishRequirements();
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
          <div class="section-title-row">
            <span>当前数据</span>
            <small>${escapeHtml(lastUpdateLabel())}</small>
          </div>
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
          <div class="sketch-folder sketch-brief-folder">
            ${renderResourceFolder("Brief", "项目简报 / 需求说明", "brief", "◫", [
              ["Brief", project.briefLinks]
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

      </article>
    `;
  }).join("");
}

function lastUpdateLabel() {
  const value = syncMeta.progressUpdatedAt || syncMeta.syncedAt;
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "numeric",
    day: "numeric"
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `last update ${map.year}.${map.month}.${map.day}`;
}

function publishRequirementFor(project) {
  const text = String(project.kpi || "");
  if (project.name === "华硕") return "华硕主板 150 篇；华硕商城 150 篇";
  if (/暂未要求稿件数据|暂未要求固定/.test(text)) return "暂未要求固定数量";
  const matches = [...text.matchAll(/(?:发稿|稿件|投放|优化稿件)[^。；\n，,]*?(?:>=|≥|大于|不少于|需要|目标是|目标)?\s*(\d+)\s*篇/g)];
  if (!matches.length) return "KPI 未写明发稿数量";
  const values = [...new Set(matches.map(match => Number(match[1])).filter(Boolean))];
  if (!values.length) return "KPI 未写明发稿数量";
  const prefix = /不少于|>=|≥|大于/.test(text) ? "不少于 " : "";
  return `${prefix}${values.join(" / ")} 篇`;
}

function currentPublishCountFor(project) {
  const text = String(project.currentData || "");
  if (!text.trim()) return "待统计";
  if (project.name === "华硕") {
    const motherboard = text.match(/华硕主板\s*(\d+)\s*\/\s*150/);
    const mall = text.match(/华硕商城\s*(\d+)\s*\/\s*150/);
    if (motherboard || mall) {
      return [
        motherboard ? `主板 ${motherboard[1]} 篇` : "",
        mall ? `商城 ${mall[1]} 篇` : ""
      ].filter(Boolean).join("；");
    }
  }
  if (project.name.includes("一丰")) {
    const total = text.match(/有效发布链接\s*(\d+)\s*条/);
    const rav4 = text.match(/荣放\s*(\d+)\s*条/);
    const avalon = text.match(/亚洲龙\s*(\d+)\s*条/);
    if (total) {
      const detail = [rav4 ? `荣放 ${rav4[1]}` : "", avalon ? `亚洲龙 ${avalon[1]}` : ""].filter(Boolean).join(" / ");
      return detail ? `${total[1]} 篇（${detail}）` : `${total[1]} 篇`;
    }
  }
  const patterns = [
    /发稿(?:\s*KPI)?[:：]?\s*(\d+)\s*\/\s*\d+\s*篇/,
    /发稿数量目前\s*(\d+)\s*\/\s*\d+/,
    /有效发布链接\s*(\d+)\s*条/,
    /有效发布链接\s*(\d+)\s*个/,
    /发稿表[^。\n]*?(\d+)\s*条/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return `${match[1]} 篇`;
  }
  return /尚未关联发稿|暂无法统计发布数量|待补充发稿/.test(text) ? "待统计" : "待核对";
}

function renderPublishRequirements() {
  if (!els.publishRequirementsPanel) return;
  const ongoing = projects.filter(project => project.status === "进行中");
  if (!ongoing.length) {
    els.publishRequirementsPanel.innerHTML = `<div class="publish-requirement-empty">当前没有进行中的项目</div>`;
    if (els.publishRequirementsMeta) {
      els.publishRequirementsMeta.textContent = lastUpdateLabel();
    }
    return;
  }
  els.publishRequirementsPanel.innerHTML = `
    <div class="publish-requirement-head" aria-hidden="true">
      <span>项目</span>
      <span>需求</span>
      <span>现发稿量</span>
    </div>
    ${ongoing.map(project => `
    <div class="publish-requirement-item">
      <strong>${escapeHtml(project.name)}</strong>
      <span>${escapeHtml(publishRequirementFor(project))}</span>
      <b>${escapeHtml(currentPublishCountFor(project))}</b>
    </div>
    `).join("")}
  `;
  if (els.publishRequirementsMeta) {
    els.publishRequirementsMeta.textContent = lastUpdateLabel();
  }
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
  const briefCount = normalizeLinks(project.briefLinks).length;
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
  if (briefCount) data.push(`已关联 ${briefCount} 个 Brief 文件。`);
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
    if (["publishLinks", "monitorLinks", "reportLinks", "briefLinks"].includes(id)) {
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
      <span class="people-chip" title="${escapeHtml(name)}">
        <span class="avatar mini">${escapeHtml(name.slice(0, 1))}</span>
        <span>${escapeHtml(name)}</span>
        <button
          class="chip-remove"
          data-remove-person="${escapeHtml(name)}"
          data-remove-field="${id}"
          type="button"
          aria-label="移除 ${escapeHtml(name)}"
        >×</button>
      </span>
    `).join("")
    : `<span class="empty-chip">未选择</span>`;
  const trigger = document.querySelector(`.people-picker[data-field="${id}"] .picker-trigger`);
  if (trigger) trigger.textContent = selected.size ? "更改" : "选择";
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
    briefLinks: parseLinks(document.querySelector("#briefLinks")?.value),
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

function lockPageScroll() {
  lockedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
  document.body.style.top = `-${lockedScrollY}px`;
  document.body.classList.add("modal-locked");
}

function unlockPageScroll() {
  document.body.classList.remove("modal-locked");
  document.body.style.top = "";
  window.scrollTo(0, lockedScrollY);
}

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

els.publishRequirementsBtn?.addEventListener("click", () => {
  renderPublishRequirements();
  els.publishRequirementsBtn.classList.add("active");
  lockPageScroll();
  els.publishRequirementsDialog?.showModal();
});

els.publishRequirementsClose?.addEventListener("click", () => {
  els.publishRequirementsDialog?.close();
});

els.publishRequirementsDialog?.addEventListener("click", event => {
  if (event.target === els.publishRequirementsDialog) {
    els.publishRequirementsDialog.close();
  }
});

els.publishRequirementsDialog?.addEventListener("close", () => {
  els.publishRequirementsBtn?.classList.remove("active");
  unlockPageScroll();
});

els.board.addEventListener("change", event => {
  const select = event.target.closest("select[data-action='status']");
  if (!select) return;
  const project = projects.find(item => item.id === select.dataset.id);
  if (!project) return;
  project.status = select.value;
  persist();
  syncProjectToFeishu(project);
  render();
});

els.board.addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const project = projects.find(item => item.id === button.dataset.id);
  if (button.dataset.action === "invoice" && project) {
    project.invoiceStatus = button.dataset.value;
    persist();
    syncProjectToFeishu(project);
    render();
    return;
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
