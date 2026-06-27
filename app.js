const STORAGE_KEY = "oxygen-project-dashboard-local-edits";
const COMMENTER_KEY = "oxygen-project-dashboard-commenter";
const FEISHU_USER_KEY = "oxygen-project-dashboard-feishu-user";
const FEISHU_SESSION_KEY = "oxygen-project-dashboard-feishu-session";
const FEISHU_LOGIN_DATE_KEY = "oxygen-project-dashboard-feishu-login-date";
const PROJECT_CACHE_KEY = "oxygen-project-dashboard-protected-cache-v4";
const AUTH_ATTEMPT_KEY = "oxygen-project-dashboard-auth-attempted";
const DIRTY_NOTES_KEY = "oxygen-project-dashboard-unsynced-notes";
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
let syncMeta = window.FEISHU_SYNC_META || {};
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

let seedProjects = window.FEISHU_PROJECTS || [];

let projects = [];
let currentFilter = "all";
let currentSort = "progress";
let invoiceOnly = false;
let compactMode = false;
let pickerState = {};
let lockedScrollY = 0;
let currentFeishuUser = readFeishuUserFromHash() || readFeishuUser();
if (currentFeishuUser) sessionStorage.removeItem(AUTH_ATTEMPT_KEY);

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
  dialog: document.querySelector("#projectDialog"),
  projectForm: document.querySelector("#projectForm"),
  openFormBtn: document.querySelector("#openFormBtn"),
  closeProjectDialog: document.querySelector("#closeProjectDialog"),
  cancelProjectBtn: document.querySelector("#cancelProjectBtn"),
  saveProjectBtn: document.querySelector("#saveProjectBtn"),
  projectFormState: document.querySelector("#projectFormState"),
  exportBtn: document.querySelector("#exportBtn")
};

let peopleOptions = [];

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

const locallyEditableFields = [
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
      const savedIsNewer = shouldKeepLocalProjectEdits(savedProject);
      const mergedProject = {
        ...project,
        ...savedProject
      };
      feishuSyncedFields.forEach(field => {
        mergedProject[field] = Object.prototype.hasOwnProperty.call(project, field)
          ? project[field]
          : (Array.isArray(mergedProject[field]) ? [] : "");
      });
      if (savedIsNewer) {
        locallyEditableFields.forEach(field => {
          if (Object.prototype.hasOwnProperty.call(savedProject, field)) mergedProject[field] = savedProject[field];
        });
        mergedProject._localEditedAt = savedProject._localEditedAt;
      }
      return mergedProject;
    });
    const seedIds = new Set(seedProjects.map(project => project.id));
    const seedNames = new Set(seedProjects.map(project => project.name));
    parsed.forEach(project => {
      const isUnsyncedLocalProject = !String(project.id || "").startsWith("rec");
      if (isUnsyncedLocalProject && !seedIds.has(project.id) && !seedNames.has(project.name)) {
        merged.unshift(project);
      }
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    return merged;
  } catch {
    return seedProjects;
  }
}

function shouldKeepLocalProjectEdits(project) {
  if (project?._preserveLocalEdit) return true;
  if (!project?._localEditedAt) return false;
  const savedAt = Date.parse(project._localEditedAt);
  const seedAt = Math.max(
    Date.parse(syncMeta.syncedAt || ""),
    Date.parse(syncMeta.progressUpdatedAt || ""),
    Date.parse(syncMeta.analysisUpdatedAt || "")
  );
  if (!Number.isFinite(savedAt)) return false;
  if (!Number.isFinite(seedAt)) return true;
  return savedAt > seedAt;
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function markProjectLocalEdit(project) {
  if (!project) return;
  project._localEditedAt = new Date().toISOString();
  project._preserveLocalEdit = true;
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

function readProjectCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(PROJECT_CACHE_KEY) || "null");
    return Array.isArray(cached?.projects) && cached.projects.length ? cached : null;
  } catch {
    return null;
  }
}

function saveProjectCache(nextProjects, meta) {
  localStorage.setItem(PROJECT_CACHE_KEY, JSON.stringify({
    projects: nextProjects,
    meta: meta || {},
    cachedAt: new Date().toISOString()
  }));
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
      notes: plainNotesForFeishu(project.notes),
      manager: project.manager,
      writer: project.writer,
      publisher: project.publisher,
      monitor: project.monitor,
      invoiceStatus: project.invoiceStatus,
      publishLinks: normalizeLinks(project.publishLinks).map(item => item.url).filter(Boolean).join("\n"),
      monitorLinks: normalizeLinks(project.monitorLinks).map(item => item.url).filter(Boolean).join("\n"),
      optimizationSuggestion: project.optimizationSuggestion
    }
  };
}

function syncErrorMessage(result, fallback = "飞书拒绝了本次写入") {
  const detail = result?.error?.error?.message
    || result?.error?.msg
    || result?.error?.message
    || result?.message
    || result?.error;
  return typeof detail === "string" && detail.trim() ? detail.trim() : fallback;
}

function projectNotesPayload(project, notesText) {
  return {
    recordId: project.id,
    fields: {
      notes: plainNotesForFeishu(notesText)
    }
  };
}

function projectPatchPayload(project, fieldsToSync) {
  return {
    recordId: project.id,
    fields: fieldsToSync
  };
}

function editableSyncFields(project) {
  return {
    status: project.status,
    name: project.name,
    startDate: project.startDate,
    endDate: endDateFor(project),
    kpi: project.kpi,
    platform: project.platform,
    notes: plainNotesForFeishu(project.notes),
    manager: project.manager,
    writer: project.writer,
    publisher: project.publisher,
    monitor: project.monitor,
    invoiceStatus: project.invoiceStatus,
    publishLinks: normalizeLinks(project.publishLinks).map(item => item.url).filter(Boolean).join("\n"),
    monitorLinks: normalizeLinks(project.monitorLinks).map(item => item.url).filter(Boolean).join("\n"),
    optimizationSuggestion: project.optimizationSuggestion
  };
}

function changedSyncFields(previousProject, nextProject) {
  const previous = editableSyncFields(previousProject || {});
  const next = editableSyncFields(nextProject);
  const changed = {};
  Object.keys(next).forEach(key => {
    if (String(previous[key] ?? "") !== String(next[key] ?? "")) changed[key] = next[key];
  });
  if ((changed.startDate || changed.endDate) && !changed.endDate) changed.endDate = next.endDate;
  return changed;
}

async function syncProjectFieldsToFeishu(project, fieldsToSync) {
  if (!FEISHU_SYNC_API || !project?.id?.startsWith("rec")) return { ok: false, skipped: true };
  if (!Object.keys(fieldsToSync || {}).length) return { ok: true, skipped: true };
  try {
    const response = await fetch(FEISHU_SYNC_API, {
      method: "POST",
      headers: authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(projectPatchPayload(project, fieldsToSync))
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) throw new Error(syncErrorMessage(result));
    if (result.version !== "20260617-project-write-v1") {
      throw new Error("Cloudflare Worker 需要更新到项目编辑版本");
    }
    console.info("字段已同步飞书", project.name, Object.keys(fieldsToSync));
    return { ok: true, recordId: result.recordId || project.id, result };
  } catch (error) {
    console.warn("字段同步失败", error);
    return { ok: false, error };
  }
}

function readDirtyNotes() {
  try {
    return JSON.parse(localStorage.getItem(DIRTY_NOTES_KEY) || "{}");
  } catch {
    return {};
  }
}

function isNoteDirty(projectId) {
  return Boolean(readDirtyNotes()[projectId]);
}

function markNoteDirty(projectId, dirty) {
  const dirtyNotes = readDirtyNotes();
  if (dirty) {
    dirtyNotes[projectId] = true;
  } else {
    delete dirtyNotes[projectId];
  }
  localStorage.setItem(DIRTY_NOTES_KEY, JSON.stringify(dirtyNotes));
}

function readFeishuUser() {
  try {
    const saved = localStorage.getItem(FEISHU_USER_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function readFeishuSession() {
  return localStorage.getItem(FEISHU_SESSION_KEY) || "";
}

function localDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function authHeaders(headers = {}) {
  const session = readFeishuSession();
  return session ? { ...headers, Authorization: `Bearer ${session}` } : headers;
}

function saveFeishuUser(user) {
  if (!user?.name) return;
  currentFeishuUser = user;
  localStorage.setItem(FEISHU_USER_KEY, JSON.stringify(user));
  localStorage.setItem(COMMENTER_KEY, user.name);
}

function readFeishuUserFromHash() {
  const hash = window.location.hash || "";
  const match = hash.match(/(?:^#|&)feishu_user=([^&]+)/);
  const tokenMatch = hash.match(/(?:^#|&)feishu_token=([^&]+)/);
  if (tokenMatch) {
    localStorage.setItem(FEISHU_SESSION_KEY, decodeURIComponent(tokenMatch[1]));
    localStorage.setItem(FEISHU_LOGIN_DATE_KEY, localDateKey());
  }
  if (!match) return null;
  try {
    const user = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(match[1])))));
    const cleanUrl = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState(null, "", cleanUrl);
    localStorage.setItem(FEISHU_USER_KEY, JSON.stringify(user));
    localStorage.setItem(COMMENTER_KEY, user.name || "飞书用户");
    return user;
  } catch {
    return null;
  }
}

function loginUrl() {
  if (!FEISHU_SYNC_API) return "#";
  const returnTo = window.location.protocol === "file:"
    ? "https://liu00904.github.io/oxygen-project-dashboard/"
    : window.location.href.split("#")[0];
  return `${FEISHU_SYNC_API}/auth/start?return_to=${encodeURIComponent(returnTo)}`;
}

function startAutoFeishuLogin() {
  if ((currentFeishuUser && readFeishuSession()) || !FEISHU_SYNC_API) return;
  const isProductionPage = window.location.protocol === "https:" && window.location.hostname === "liu00904.github.io";
  if (!isProductionPage) return;
  if (sessionStorage.getItem(AUTH_ATTEMPT_KEY) === "1") return;
  sessionStorage.setItem(AUTH_ATTEMPT_KEY, "1");
  window.location.assign(loginUrl());
}

async function loadProjectsFromWorker() {
  if (!FEISHU_SYNC_API) throw new Error("没有配置飞书同步服务");
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 60000);
  let response;
  try {
    response = await fetch(`${FEISHU_SYNC_API}/projects`, {
      method: "GET",
      headers: authHeaders(),
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("飞书数据服务连接超时，请稍后重试");
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
  const result = await response.json().catch(() => null);
  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem(FEISHU_SESSION_KEY);
    localStorage.removeItem(FEISHU_USER_KEY);
    currentFeishuUser = null;
    throw new Error("请先通过飞书登录");
  }
  if (!response.ok || !result?.ok) throw new Error(syncErrorMessage(result, "读取飞书项目失败"));
  seedProjects = Array.isArray(result.projects) ? result.projects : [];
  syncMeta = result.meta || {};
  saveProjectCache(seedProjects, syncMeta);
  if (result.user?.name) saveFeishuUser(result.user);
  peopleOptions = buildPeopleOptions(seedProjects);
  projects = loadProjects();
  persist();
}

async function syncProjectToFeishu(project) {
  if (!FEISHU_SYNC_API || !project) return { ok: false, skipped: true };
  try {
    const response = await fetch(FEISHU_SYNC_API, {
      method: "POST",
      headers: authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(projectSyncPayload(project))
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) throw new Error(syncErrorMessage(result));
    console.info("已同步飞书", project.name);
    return { ok: true, recordId: result.recordId || project.id, result };
  } catch (error) {
    console.warn("飞书同步失败", error);
    return { ok: false, error };
  }
}

async function syncProjectNotesToFeishu(project) {
  if (!FEISHU_SYNC_API || !project?.id?.startsWith("rec")) return { ok: false, skipped: true };
  try {
    const response = await fetch(FEISHU_SYNC_API, {
      method: "POST",
      headers: authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(projectNotesPayload(project, project.notes || ""))
    });
    if (!response.ok) throw new Error(await response.text());
    const result = await response.json();
    if (!result?.ok) throw new Error(JSON.stringify(result));
    markNoteDirty(project.id, false);
    console.info("备注已同步飞书", project.name);
    return { ok: true };
  } catch (error) {
    markNoteDirty(project.id, true);
    console.warn("备注同步失败，已保存在网页本地", error);
    return { ok: false, error };
  }
}

async function loadSharedNotesFromFeishu() {
  if (!FEISHU_SYNC_API) return;
  try {
    const response = await fetch(FEISHU_SYNC_API, { method: "GET", headers: authHeaders() });
    if (!response.ok) return;
    const result = await response.json();
    if (!result?.notes || typeof result.notes !== "object") return;
    let changed = false;
    projects = projects.map(project => {
      const sharedNote = result.notes[project.id];
      if (sharedNote === undefined || sharedNote === project.notes) return project;
      if (sharedNote === "" && !String(project.notes || "").trim().startsWith("[网页评论JSON]")) {
        markNoteDirty(project.id, false);
        changed = true;
        return { ...project, notes: "" };
      }
      if (sharedNote === "" && !isNoteDirty(project.id)) {
        changed = true;
        return { ...project, notes: "" };
      }
      if (isNoteDirty(project.id)) return project;
      changed = true;
      return { ...project, notes: sharedNote };
    });
    if (changed) {
      persist();
      render();
    }
  } catch (error) {
    console.info("共享备注读取暂不可用", error);
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

function showSyncNotice(message, type = "info") {
  let notice = document.querySelector(".sync-notice");
  if (!notice) {
    notice = document.createElement("div");
    notice.className = "sync-notice";
    document.body.appendChild(notice);
  }
  notice.textContent = message;
  notice.dataset.type = type;
  notice.classList.add("show");
  clearTimeout(showSyncNotice.timer);
  showSyncNotice.timer = setTimeout(() => {
    notice.classList.remove("show");
  }, 2600);
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

        <section class="sketch-suggestion sketch-comments">
          <div class="section-title-row">
            <span>备注</span>
            <small>同步到飞书备注列</small>
          </div>
          ${renderProjectComments(project)}
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

        <button class="ghost-btn sketch-edit" data-action="edit" data-id="${project.id}" type="button">编辑</button>

      </article>
    `;
  }).join("");
}

function renderLoading(message = "正在验证飞书账号并读取项目数据…") {
  renderMetrics();
  renderStatusCounts();
  els.pageTitle.textContent = "项目数据";
  els.pageMeta.textContent = "登录后可见";
  els.controlTitle.textContent = "受保护数据";
  els.controlMeta.textContent = "项目数据不再公开写入网页文件";
  els.board.innerHTML = `<div class="empty glass"><h2>${escapeHtml(message)}</h2><p class="subline">请稍候。</p></div>`;
}

function renderLoginPrompt(message = "项目数据需要登录后查看") {
  renderMetrics();
  renderStatusCounts();
  els.pageTitle.textContent = "项目数据";
  els.pageMeta.textContent = "登录后可见";
  els.controlTitle.textContent = "受保护数据";
  els.controlMeta.textContent = "项目数据不会写入公开网页文件";
  els.board.innerHTML = `
    <div class="empty glass">
      <h2>${escapeHtml(message)}</h2>
      <p class="subline">请使用企业飞书账号登录。</p>
      <button class="primary-btn protected-login-btn" data-action="feishu-login" type="button">飞书登录</button>
    </div>
  `;
}

function renderDataRetry(message = "飞书数据服务暂时没有响应") {
  renderMetrics();
  renderStatusCounts();
  els.pageTitle.textContent = "项目数据";
  els.pageMeta.textContent = currentFeishuUser?.name ? `${currentFeishuUser.name} 已登录` : "飞书已登录";
  els.controlTitle.textContent = "受保护数据";
  els.controlMeta.textContent = "登录状态已保留，无需重复登录";
  els.board.innerHTML = `
    <div class="empty glass">
      <h2>${escapeHtml(message)}</h2>
      <p class="subline">你的登录状态仍然有效，请稍后重新加载数据。</p>
      <button class="primary-btn protected-login-btn" data-action="retry-projects" type="button">重新加载数据</button>
    </div>
  `;
}

async function bootstrap() {
  if (!readFeishuSession()) {
    renderLoginPrompt();
    return;
  }
  const cached = readProjectCache();
  if (cached) {
    seedProjects = cached.projects;
    syncMeta = { ...cached.meta, cachedAt: cached.cachedAt };
    peopleOptions = buildPeopleOptions(seedProjects);
    projects = loadProjects();
    render();
    els.controlMeta.textContent = "正在后台检查飞书最新数据…";
  } else {
    renderLoading();
  }
  try {
    await loadProjectsFromWorker();
    render();
    loadSharedNotesFromFeishu().catch(error => {
      console.warn("备注后台更新失败", error);
    });
  } catch (error) {
    console.warn("项目数据读取失败", error);
    if (cached && readFeishuSession()) {
      els.controlMeta.textContent = "当前显示最近缓存，稍后可重新加载";
      return;
    }
    if (!readFeishuSession()) {
      renderLoginPrompt(error.message || "登录状态已过期");
    } else {
      renderDataRetry(error.message || "项目数据读取失败");
    }
  }
}

function lastUpdateLabel() {
  const value = syncMeta.analysisUpdatedAt || syncMeta.progressUpdatedAt || syncMeta.syncedAt;
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
  const matches = [...text.matchAll(/(?:发稿|稿件|投放|优化稿件|文章发布|发布)[^。；\n，,]*?(?:>=|≥|大于|不少于|需要|目标是|目标)?\s*(\d+)\s*篇/g)];
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
    const auditedTotal = text.match(/有效发稿条目\s*(\d+)\s*条/);
    if (auditedTotal) return `${auditedTotal[1]} 篇`;
    const total = text.match(/有效发布链接\s*(\d+)\s*条/);
    const rav4 = text.match(/荣放\s*(\d+)\s*条/);
    const avalon = text.match(/亚洲龙\s*(\d+)\s*条/);
    if (total) {
      const detail = [rav4 ? `荣放 ${rav4[1]}` : "", avalon ? `亚洲龙 ${avalon[1]}` : ""].filter(Boolean).join(" / ");
      return detail ? `${total[1]} 篇（${detail}）` : `${total[1]} 篇`;
    }
  }
  const patterns = [
    /(?:发稿|发布)(?:\s*KPI|数量)?[:：]?\s*(\d+)\s*\/\s*\d+\s*篇/,
    /当前发布数量\s*(\d+)\s*\/\s*\d+\s*篇/,
    /发稿数量目前\s*(\d+)\s*\/\s*\d+/,
    /有效发稿条目\s*(\d+)\s*条/,
    /有效发布条目\s*(\d+)\s*条/,
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

function publishCompletionFor(project) {
  const text = String(project.currentData || "");
  if (project.name === "华硕") {
    const motherboard = text.match(/华硕主板\s*(\d+)\s*\/\s*150/);
    const mall = text.match(/华硕商城\s*(\d+)\s*\/\s*150/);
    const gaps = [];
    if (motherboard) {
      const gap = 150 - Number(motherboard[1]);
      if (gap > 0) gaps.push(`主板差 ${gap} 篇`);
    }
    if (mall) {
      const gap = 150 - Number(mall[1]);
      if (gap > 0) gaps.push(`商城差 ${gap} 篇`);
    }
    return gaps.length
      ? { label: `未完成，${gaps.join("；")}`, className: "bad" }
      : { label: "已完成", className: "good" };
  }
  if (/暂未要求稿件数据|暂未要求固定|暂未要求固定数量/.test(`${project.kpi}\n${text}`)) {
    return { label: "无固定数量", className: "neutral" };
  }
  if (/尚未关联发稿|暂无法统计发布数量|待补充发稿|待统计/.test(text)) {
    return { label: "待统计", className: "neutral" };
  }
  const explicit = text.match(/(\d+)\s*\/\s*(\d+)\s*篇/);
  if (explicit) {
    const current = Number(explicit[1]);
    const target = Number(explicit[2]);
    const gap = target - current;
    if (gap > 0) return { label: `未完成，还差 ${gap} 篇`, className: "bad" };
    if (gap < 0) return { label: `已完成，超出 ${Math.abs(gap)} 篇`, className: "good" };
    return { label: "已完成，刚好达标", className: "good" };
  }
  const current = Number((currentPublishCountFor(project).match(/\d+/) || [])[0]);
  const target = Number((publishRequirementFor(project).match(/\d+/) || [])[0]);
  if (Number.isFinite(current) && Number.isFinite(target) && target > 0) {
    const gap = target - current;
    if (gap > 0) return { label: `未完成，还差 ${gap} 篇`, className: "bad" };
    if (gap < 0) return { label: `已完成，超出 ${Math.abs(gap)} 篇`, className: "good" };
    return { label: "已完成，刚好达标", className: "good" };
  }
  return { label: "KPI 未写明", className: "neutral" };
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
      <span>完成情况</span>
    </div>
    ${ongoing.map(project => {
      const completion = publishCompletionFor(project);
      return `
    <div class="publish-requirement-item">
      <strong>${escapeHtml(project.name)}</strong>
      <span>${escapeHtml(publishRequirementFor(project))}</span>
      <b>${escapeHtml(currentPublishCountFor(project))}</b>
      <em class="${escapeHtml(completion.className)}">${escapeHtml(completion.label)}</em>
    </div>
    `;
    }).join("")}
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
    normalizeLinks(value).map((item, index, group) => {
      const protectedItem = normalizeProtectedDownloadItem(item, label);
      return {
        label: protectedItem.label || `${label}${group.length > 1 ? ` ${index + 1}` : ""}`,
        url: protectedItem.url,
        authRequired: protectedItem.authRequired
      };
    })
  );
  const countLabel = links.length ? `${links.length} 个文件` : "0 个文件";
  const linkHtml = links.length
    ? links.map(item => {
      if (!item.url) {
        return `<span class="folder-empty">${escapeHtml(item.label || "文件暂不可打开")}</span>`;
      }
      const proxyAttrs = item.authRequired ? ` data-proxy-file="true" data-file-name="${escapeHtml(item.label || "飞书文件")}"` : "";
      return `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer"${proxyAttrs}>${escapeHtml(item.label)}</a>`;
    }).join("")
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
    if (typeof item === "string") {
      const url = normalizeHref(item);
      return { label: url.replace(/^https?:\/\//, "").slice(0, 48), url };
    }
    const url = normalizeHref(item.url || item.link || "");
    return { ...item, url };
  }).filter(item => item && (item.url || item.label));
}

function normalizeHref(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^(https?:|mailto:|tel:|blob:)/i.test(text)) return text;
  const embedded = text.match(/https?:\/\/[^\s，。；;,）)]+/i);
  if (embedded) return embedded[0];
  const naked = text.match(/(?:[\w-]+\.)+[a-z]{2,}\/[^\s，。；;,）)]*/i);
  if (naked) return `https://${naked[0]}`;
  if (/^[\w.-]+\.[a-z]{2,}$/i.test(text)) return `https://${text}`;
  return "";
}

function normalizeProtectedDownloadItem(item, fallbackLabel = "飞书文件") {
  if (!item?.url || item.authRequired) return item;
  const parsed = parseFeishuMediaDownload(item.url);
  if (!parsed || !FEISHU_SYNC_API) return item;
  const proxyUrl = new URL("/download", FEISHU_SYNC_API);
  proxyUrl.searchParams.set("file_token", parsed.fileToken);
  proxyUrl.searchParams.set("name", item.label || fallbackLabel || "飞书文件");
  if (parsed.extra) proxyUrl.searchParams.set("extra", parsed.extra);
  return {
    ...item,
    url: proxyUrl.toString(),
    authRequired: true
  };
}

function parseFeishuMediaDownload(value) {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/open-apis\/drive\/v1\/medias\/([^/]+)\/download/i);
    if (!match) return null;
    return {
      fileToken: decodeURIComponent(match[1]),
      extra: url.searchParams.get("extra") || ""
    };
  } catch {
    return null;
  }
}

async function openProtectedFile(link) {
  const url = link.getAttribute("href");
  if (!url) return;
  link.classList.add("is-loading");
  try {
    const response = await fetch(url, { headers: authHeaders() });
    if (!response.ok) throw new Error(await response.text());
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const download = document.createElement("a");
    download.href = objectUrl;
    download.download = link.dataset.fileName || link.textContent.trim() || "飞书文件";
    document.body.appendChild(download);
    download.click();
    download.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
  } catch (error) {
    console.warn("文件打开失败", error);
    alert("文件暂时打不开，请确认 Cloudflare Worker 已更新，并稍后重试。");
  } finally {
    link.classList.remove("is-loading");
  }
}

function renderCurrentData(project, timing) {
  if (project.currentData && project.currentData.trim()) {
    return renderDataSections(project.currentData);
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

function renderDataSections(value) {
  const lines = String(value)
    .split(/\n/)
    .flatMap(line => {
      const trimmed = line.trim();
      if (/^【.+】$/.test(trimmed)) return [trimmed];
      return trimmed.split(/(?<=。)/).map(item => item.trim()).filter(Boolean);
    })
    .filter(Boolean);

  let html = "";
  let list = [];

  function flushList() {
    if (!list.length) return;
    html += `<ul class="data-list">${list.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
    list = [];
  }

  lines.forEach(line => {
    const heading = line.match(/^【(.+)】$/);
    if (heading) {
      flushList();
      html += `<h4 class="data-subtitle">${escapeHtml(heading[1])}</h4>`;
    } else {
      list.push(line);
    }
  });
  flushList();
  return html;
}

function parseProjectComments(notes) {
  const text = String(notes || "").trim();
  if (!text) return [];
  if (text.startsWith("[网页评论JSON]")) {
    try {
      const parsed = JSON.parse(text.replace("[网页评论JSON]", "").trim());
      if (Array.isArray(parsed)) return parsed.map(normalizeComment).filter(item => item.text);
    } catch {
      return [];
    }
  }
  if (text.startsWith("[网页评论]")) {
    return text
      .split(/\n+/)
      .slice(1)
      .map(line => {
        const match = line.match(/^(.+?)｜(.+?)：([\s\S]*)$/);
        if (!match) return null;
        return {
          time: match[1].trim(),
          author: match[2].trim(),
          text: match[3].trim(),
          avatar: "",
          userId: ""
        };
      })
      .filter(Boolean);
  }
  return [{ legacy: true, time: "", author: "", text, avatar: "", userId: "" }];
}

function serializeProjectComments(comments) {
  const clean = comments
    .map(normalizeComment)
    .filter(item => item.text);
  if (!clean.length) return "";
  return `[网页评论JSON]\n${JSON.stringify(clean)}`;
}

function plainNotesForFeishu(notes) {
  const seen = new Set();
  return parseProjectComments(notes)
    .map(item => String(item.text || "").trim())
    .filter(Boolean)
    .filter(text => {
      if (seen.has(text)) return false;
      seen.add(text);
      return true;
    })
    .join("\n");
}

function normalizeComment(item) {
  const rawAuthor = String(item.author || "匿名").trim() || "匿名";
  const avatar = String(item.avatar || "").trim();
  const userId = String(item.userId || item.openId || "").trim();
  const legacy = Boolean(item.legacy) || (["备注", "历史备注"].includes(rawAuthor) && !avatar && !userId);
  return {
    legacy,
    time: legacy ? "" : (item.time || formatCommentTime(new Date())),
    author: legacy ? "" : rawAuthor,
    avatar,
    userId,
    text: String(item.text || "").trim()
  };
}

function formatCommentTime(date) {
  const pad = value => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function renderProjectComments(project) {
  const comments = parseProjectComments(project.notes);
  const commenter = currentFeishuUser?.name || localStorage.getItem(COMMENTER_KEY) || "我";
  const commenterAvatar = currentFeishuUser?.avatar || "";
  const commentsHtml = comments.length
    ? comments.map((item, index) => item.legacy
      ? `
        <div class="comment-legacy">
          <span>原备注</span>
          <p>${escapeHtml(item.text)}</p>
        </div>
      `
      : `
        <div
          class="comment-item"
          data-comment-index="${index}"
          data-project-id="${project.id}"
          title="右键可编辑或删除"
        >
          ${renderAvatar(item.author || "备", item.avatar)}
          <div class="comment-body">
            <div class="comment-meta">
              <strong>${escapeHtml(item.author || "备注")}</strong>
              ${item.time ? `<small>${escapeHtml(item.time)}</small>` : ""}
            </div>
            <p>${escapeHtml(item.text)}</p>
          </div>
        </div>
      `).join("")
    : `<div class="comment-empty">暂无评论</div>`;
  return `
    <div class="comment-list">${commentsHtml}</div>
    <div class="comment-compose">
      ${renderAvatar(commenter, commenterAvatar, "comment-self-avatar")}
      <textarea
        class="comment-input"
        data-action="comment-input"
        data-id="${project.id}"
        placeholder="写备注..."
      ></textarea>
      <button class="comment-submit" data-action="add-comment" data-id="${project.id}" type="button">发送</button>
    </div>
  `;
}

function renderAvatar(name, avatar, className = "avatar") {
  const label = escapeHtml(String(name || "用").slice(0, 1));
  if (avatar) {
    return `
      <span class="${className} avatar-image" aria-label="${escapeHtml(name)}" data-fallback="${label}">
        <img src="${escapeHtml(avatar)}" alt="${escapeHtml(name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.classList.add('avatar-broken');this.remove();" />
      </span>
    `;
  }
  return `<span class="${className}">${label}</span>`;
}

async function saveProjectComments(project, comments, successMessage = "备注已同步到飞书") {
  project.notes = serializeProjectComments(comments);
  markProjectLocalEdit(project);
  persist();
  markNoteDirty(project.id, true);
  const syncResult = await syncProjectNotesToFeishu(project);
  showSyncNotice(syncResult.ok ? successMessage : "备注已保存在本机，飞书同步暂未成功", syncResult.ok ? "success" : "warning");
  render();
}

function closeCommentMenu() {
  document.querySelector(".comment-menu")?.remove();
}

function openCommentMenu(event, project, index) {
  closeCommentMenu();
  const menu = document.createElement("div");
  menu.className = "comment-menu";
  menu.style.left = `${Math.min(event.clientX, window.innerWidth - 150)}px`;
  menu.style.top = `${Math.min(event.clientY, window.innerHeight - 96)}px`;
  menu.innerHTML = `
    <button data-comment-menu="edit" data-id="${project.id}" data-index="${index}" type="button">编辑</button>
    <button data-comment-menu="delete" data-id="${project.id}" data-index="${index}" type="button">删除</button>
  `;
  document.body.appendChild(menu);
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
    .replace(/\r/g, "\n")
    .replace(/([^\n\d])\s*([1-9][0-9]*[.、）)])(?!\d)\s*/g, "$1\n$2 ")
    .replace(/(^|\n)\s*([1-9][0-9]*[.、）)])(?!\d)\s*/g, "\n$2 ")
    .replace(/\s*([一二三四五六七八九十]+[、）)])\s*/g, "\n$1 ");
  const parts = normalized
    .split(/\n+/)
    .map(item => item.replace(/^([1-9][0-9]*|[一二三四五六七八九十]+)[.、）)]\s*/, "").trim())
    .flatMap(item => item.split(/；/).map(part => part.trim()).filter(Boolean))
    .filter(item => !/^KPI目标[:：]?$/.test(item));
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
    document.querySelector("#startDate").value = "";
    document.querySelector("#cycleDays").value = "";
    document.querySelector("#invoiceStatus").value = "待确认";
  }
  document.querySelector("#projectDialogEyebrow").textContent = project ? "Edit Project" : "New Project";
  document.querySelector("#projectDialogTitle").textContent = project ? "编辑项目" : "添加项目";
  els.projectFormState.textContent = "";
  els.saveProjectBtn.disabled = false;
  els.saveProjectBtn.textContent = "保存并同步飞书";
  lockPageScroll();
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
  const id = document.querySelector("#projectId").value;
  const existing = projects.find(item => item.id === id) || {};
  return {
    ...existing,
    id,
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
    reportLinks: existing.reportLinks || [],
    briefLinks: existing.briefLinks || [],
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

function closeProjectForm() {
  document.querySelectorAll(".people-picker.open").forEach(item => item.classList.remove("open"));
  els.dialog?.close();
}

els.openFormBtn?.addEventListener("click", () => openForm());
els.closeProjectDialog?.addEventListener("click", closeProjectForm);
els.cancelProjectBtn?.addEventListener("click", closeProjectForm);

els.dialog?.addEventListener("close", unlockPageScroll);
els.dialog?.addEventListener("click", event => {
  if (event.target === els.dialog) {
    closeProjectForm();
    return;
  }
  const remove = event.target.closest("[data-remove-person]");
  if (remove) {
    const field = remove.dataset.removeField;
    pickerState[field] = (pickerState[field] || []).filter(name => name !== remove.dataset.removePerson);
    renderPeoplePicker(field);
    return;
  }
  const trigger = event.target.closest(".picker-trigger");
  if (!trigger && !event.target.closest(".people-picker")) {
    document.querySelectorAll(".people-picker.open").forEach(item => item.classList.remove("open"));
    return;
  }
  if (!trigger) return;
  const picker = trigger.closest(".people-picker");
  document.querySelectorAll(".people-picker.open").forEach(item => {
    if (item !== picker) item.classList.remove("open");
  });
  picker.classList.toggle("open");
});

els.dialog?.addEventListener("change", event => {
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

els.projectForm?.addEventListener("submit", async event => {
  event.preventDefault();
  const formProject = collectForm();
  if (!formProject.name) {
    els.projectFormState.textContent = "请先填写项目名称。";
    return;
  }
  if (formProject.status !== "待开始" && (!formProject.startDate || !formProject.cycleDays)) {
    els.projectFormState.textContent = "进行中、已完成或停滞项目需要填写开始时间和周期。";
    return;
  }
  els.saveProjectBtn.disabled = true;
  els.saveProjectBtn.textContent = "正在同步…";
  els.projectFormState.textContent = "正在保存到飞书，请稍候。";
  const existingProject = projects.find(item => item.id === formProject.id);
  const syncResult = existingProject?.id?.startsWith("rec")
    ? await syncProjectFieldsToFeishu(formProject, changedSyncFields(existingProject, formProject))
    : await syncProjectToFeishu(formProject);
  if (!syncResult.ok) {
    els.saveProjectBtn.disabled = false;
    els.saveProjectBtn.textContent = "重新同步";
    const reason = syncResult.error?.message || "请检查网络或 Worker 后重试";
    els.projectFormState.textContent = `同步失败，内容尚未保存：${reason}`;
    showSyncNotice("项目同步飞书失败，编辑窗口已保留", "warning");
    return;
  }
  formProject.id = syncResult.recordId;
  const index = projects.findIndex(item => item.id === formProject.id || item.id === document.querySelector("#projectId").value);
  markProjectLocalEdit(formProject);
  if (index >= 0) projects[index] = formProject;
  else projects.unshift(formProject);
  persist();
  closeProjectForm();
  render();
  showSyncNotice("项目已保存并同步到飞书", "success");
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

els.board.addEventListener("change", async event => {
  const select = event.target.closest("select[data-action='status']");
  if (!select) return;
  const project = projects.find(item => item.id === select.dataset.id);
  if (!project) return;
  const previousStatus = project.status;
  const previousLocalEditedAt = project._localEditedAt;
  project.status = select.value;
  markProjectLocalEdit(project);
  persist();
  const syncResult = await syncProjectFieldsToFeishu(project, { status: project.status });
  if (!syncResult.ok) {
    project.status = previousStatus;
    project._localEditedAt = previousLocalEditedAt;
    persist();
    const reason = syncResult.error?.message || "请检查网络或 Worker 后重试";
    showSyncNotice(`状态同步失败，已恢复原状态：${reason}`, "warning");
  } else {
    showSyncNotice("状态已同步到飞书", "success");
  }
  render();
});

els.board.addEventListener("click", async event => {
  const protectedFile = event.target.closest("a[data-proxy-file='true']");
  if (protectedFile) {
    event.preventDefault();
    await openProtectedFile(protectedFile);
    return;
  }
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  if (button.dataset.action === "feishu-login") {
    sessionStorage.setItem(AUTH_ATTEMPT_KEY, "1");
    window.location.assign(loginUrl());
    return;
  }
  if (button.dataset.action === "retry-projects") {
    button.disabled = true;
    button.textContent = "正在加载…";
    await bootstrap();
    return;
  }
  const project = projects.find(item => item.id === button.dataset.id);
  if (button.dataset.action === "edit" && project) {
    openForm(project);
    return;
  }
  if (button.dataset.action === "add-comment" && project) {
    const card = button.closest(".project-row");
    const textInput = card?.querySelector(`[data-action='comment-input'][data-id="${project.id}"]`);
    const text = textInput?.value.trim() || "";
    if (!text) return;
    const author = currentFeishuUser?.name || localStorage.getItem(COMMENTER_KEY) || "我";
    localStorage.setItem(COMMENTER_KEY, author);
    const comments = parseProjectComments(project.notes);
    comments.push({
      author,
      text,
      time: formatCommentTime(new Date()),
      avatar: currentFeishuUser?.avatar || "",
      userId: currentFeishuUser?.openId || currentFeishuUser?.unionId || ""
    });
    await saveProjectComments(project, comments);
    return;
  }
  if (button.dataset.action === "invoice" && project) {
    const previousInvoiceStatus = project.invoiceStatus;
    const previousLocalEditedAt = project._localEditedAt;
    project.invoiceStatus = button.dataset.value;
    markProjectLocalEdit(project);
    persist();
    const syncResult = await syncProjectFieldsToFeishu(project, { invoiceStatus: project.invoiceStatus });
    if (!syncResult.ok) {
      project.invoiceStatus = previousInvoiceStatus;
      project._localEditedAt = previousLocalEditedAt;
      persist();
      const reason = syncResult.error?.message || "请检查网络或 Worker 后重试";
      showSyncNotice(`开票状态同步失败，已恢复原状态：${reason}`, "warning");
    } else {
      showSyncNotice("开票状态已同步到飞书", "success");
    }
    render();
    return;
  }
});

els.board.addEventListener("contextmenu", event => {
  const item = event.target.closest(".comment-item[data-project-id]");
  if (!item) return;
  const project = projects.find(projectItem => projectItem.id === item.dataset.projectId);
  if (!project) return;
  event.preventDefault();
  openCommentMenu(event, project, Number(item.dataset.commentIndex));
});

document.addEventListener("click", async event => {
  const menuButton = event.target.closest("[data-comment-menu]");
  if (!menuButton) {
    closeCommentMenu();
    return;
  }
  const project = projects.find(item => item.id === menuButton.dataset.id);
  const index = Number(menuButton.dataset.index);
  if (!project || Number.isNaN(index)) return;
  const comments = parseProjectComments(project.notes);
  const current = comments[index];
  if (!current) return;
  closeCommentMenu();
  if (menuButton.dataset.commentMenu === "edit") {
    const nextText = window.prompt("修改备注", current.text);
    if (nextText == null) return;
    const cleaned = nextText.trim();
    if (!cleaned) return;
    comments[index] = { ...current, text: cleaned, time: formatCommentTime(new Date()) };
    await saveProjectComments(project, comments, "备注已修改并同步");
  }
  if (menuButton.dataset.commentMenu === "delete") {
    if (!window.confirm("删除这条备注吗？")) return;
    comments.splice(index, 1);
    await saveProjectComments(project, comments, "备注已删除并同步");
  }
});

window.addEventListener("scroll", closeCommentMenu, { passive: true });

els.exportBtn.addEventListener("click", async () => {
  const payload = JSON.stringify(projects, null, 2);
  await navigator.clipboard.writeText(payload);
  els.exportBtn.textContent = "✓";
  setTimeout(() => {
    els.exportBtn.textContent = "↓";
  }, 1200);
});

bootstrap();
