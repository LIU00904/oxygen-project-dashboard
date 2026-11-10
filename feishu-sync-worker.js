const FIELD_MAP = {
  status: "项目状态",
  name: "客户",
  startDate: "项目开始日期",
  endDate: "项目结束日期",
  kpi: "项目kpi",
  platform: "平台",
  notes: "备注",
  invoiceStatus: "网页开票信息",
  publishLinks: "发稿链接",
  monitorLinks: "监测表",
  optimizationSuggestion: "优化建议",
  manager: "客户对接",
  writer: "写稿审稿",
  publisher: "发稿",
  monitor: "监测"
};

const PERSON_KEYS = new Set(["manager", "writer", "publisher", "monitor"]);
const WORKER_VERSION = "20261110-total-group-test-v2";
const PROJECT_CACHE_SECONDS = 30 * 60;
const PROJECT_STALE_CACHE_SECONDS = 8 * 24 * 60 * 60;
const TABLE_URL = "https://jcnquengglen.feishu.cn/base/SRjgbQqBMa6L1isu8CFcuUAAnEb?table=tbl8o6BzxfDpqxMX&view=vew234Y6ro";
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
// Checklist is intentionally a short-lived operational surface, not an archive.
const TODO_RETENTION_DAYS = 31;
const REMINDER_RETENTION_DAYS = 62;
// 项目群提醒的唯一事实来源。群聊只需在首次由机器人命令绑定，之后无需把 chat_id 写进前端。
// weekday 与 Date#getDay() 一致：周一为 1、周三为 3、周五为 5。
const PROJECT_REMINDER_RULES = {
  "太太乐松茸鲜": {
    manager: "刘依晨",
    rules: [
      { type: "weekly", weekday: 1, title: "本周数据表与发布目标", owner: "刘依晨、徐奕旸", detail: "更新数据表；本周写稿 10 篇、发稿至少 20 篇" },
      { type: "weekly", weekday: 1, title: "本周监测安排", owner: "彭安迪", detail: "本周完成 2 次监测并同步结果" },
      { type: "weekly", weekday: 3, title: "提交周报", owner: "刘依晨", detail: "整理本周发布、数据与审计进度" },
      { type: "monthly", day: 10, title: "提交月报", owner: "刘依晨", detail: "提交月度复盘与下月计划", leadDays: 7 }
    ]
  },
  "西门子": { manager: "徐奕旸", rules: [{ type: "weekly", weekday: 1, title: "本周交付目标", owner: "徐奕旸", detail: "本周写稿 10 篇、发稿 20 篇，完成周报与深演监测" }, { type: "weekly", weekday: 5, title: "完成下周稿件", owner: "徐奕旸", detail: "完成下一周稿件排期与写稿准备" }] },
  "赏·会所": { manager: "徐奕旸", rules: [{ type: "weekly", weekday: 3, title: "完成本周写稿", owner: "徐奕旸", detail: "完成写稿 4 篇" }, { type: "weekly", weekday: 4, title: "完成本周发稿", owner: "徐奕旸", detail: "完成发稿至少 6 篇" }] },
  "哲库林 润喉糖": { manager: "辛味珈", rules: [{ type: "weekly", weekday: 1, title: "提交 10 篇稿件", owner: "彭安迪", detail: "每周一交付 10 篇稿件" }, { type: "weekly", weekday: 1, title: "跟进本周发稿", owner: "徐奕旸", detail: "发稿无固定篇数，跟进本周发布进度" }] },
  "广百": { manager: "徐奕旸", rules: [{ type: "weekly", weekday: 1, title: "本周交付目标", owner: "徐奕旸", detail: "本周写稿至少 25 篇；安排 2 次监测，推进双周报与月报" }] },
  "华硕 新": { manager: "向昱筱 Cheryl", rules: [{ type: "weekly", weekday: 1, title: "本周内容与发布目标", owner: "向昱筱 Cheryl、韩文静、刘依晨", detail: "写稿 50 篇、发稿 100 篇；核心稿件约 50 篇，项目经理汇总推进情况" }] },
  "咪咕体育": { manager: "辛味珈", rules: [{ type: "weekly", weekday: 1, title: "本周交付目标", owner: "彭安迪、刘依晨", detail: "本周写稿 22 篇、发稿约 70 篇" }] },
  "头道汤": { manager: "辛味珈", rules: [] }
};
const PROJECT_NAME_ALIASES = {
  "太太乐": "太太乐松茸鲜", "太太乐松茸鲜": "太太乐松茸鲜",
  "赏会所": "赏·会所", "赏 会所": "赏·会所", "赏·会所": "赏·会所",
  "华硕": "华硕 新", "华硕新": "华硕 新", "华硕 新": "华硕 新",
  "哲库林": "哲库林 润喉糖", "哲库林润喉糖": "哲库林 润喉糖",
  "咪咕影之刃": "咪咕体育", "咪咕 影之刃": "咪咕体育", "咪咕体育": "咪咕体育"
};
const FIELD_ALIASES = {
  reportLinks: ["项目报告文件", "报告文件", "报告"],
  briefLinks: ["Brief", "brief", "项目Brief", "项目简报"],
  projectLinks: ["项目资料", "资料", "链接"],
  currentData: ["当前数据", "数据分析", "KPI分析"],
  optimizationSuggestion: ["优化建议", "建议"],
  notes: ["备注"]
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

let memoryProjectsCache = null;
let todoSchemaReady = null;
let reminderSchemaReady = null;
const STALLED_PROJECTS = new Set(["西昊", "西昊2", "mac", "海蓝之谜"]);
const CURRENT_ONGOING = new Set([
  "太太乐松茸鲜",
  "哲库林 润喉糖",
  "万豪",
  "万事达银联",
  "数贸会",
  "西门子",
  "国泰海通",
  "TMA",
  "pxn",
  "华硕 新",
  "伊利金领冠",
  "头道汤",
  "可孚制氧机"
]);
const COMPLETED_PROJECTS = new Set([
  "北京大学深圳研究生院",
  "格力高",
  "格力高 百奇",
  "咪咕体育",
  "一丰 荣放 亚洲龙",
  "赏·会所",
  "深演",
  "骨科医生"
]);

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(refreshScheduledCache(env));
    if (env.TODOS_DB) ctx.waitUntil(pruneExpiredTodos(env));
    if (env.TODOS_DB) ctx.waitUntil(dispatchProjectGroupReminders(env, new Date(event.scheduledTime || Date.now())));
  },
  async fetch(request, env) {
    try {
      const requestUrl = new URL(request.url);
      if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }
      // 飞书事件回调不使用网页登录态；通过应用 Verification Token 校验来源。
      if (requestUrl.pathname === "/bot/events") {
        return handleBotEvent(request, env);
      }
      if (requestUrl.pathname === "/auth/start") {
        return startAuth(request, env);
      }
      if (requestUrl.pathname === "/auth/callback") {
        return finishAuth(request, env);
      }
      if (requestUrl.pathname === "/projects") {
        const user = await authorizeRequest(request, env);
        const token = await tenantToken(env);
        const forceRefresh = requestUrl.searchParams.get("refresh") === "1";
        const { projects, cached } = await readCachedProjects(env, token, requestUrl.origin, forceRefresh);
        return json({
          ok: true,
          user,
          projects,
          meta: {
            syncedAt: new Date().toISOString(),
            source: "feishu-worker",
            recordCount: projects.length,
            version: WORKER_VERSION,
            cached
          }
        });
      }
      if (requestUrl.pathname === "/download") {
        const user = await authorizeRequest(request, env);
        const token = await tenantToken(env);
        return downloadFeishuFile(requestUrl, token, user, env);
      }
      if (requestUrl.pathname === "/todos" || requestUrl.pathname.startsWith("/todos/")) {
        return handleTodos(request, env, requestUrl);
      }
      if (requestUrl.pathname === "/reminder-groups" || requestUrl.pathname.startsWith("/reminder-groups/")) {
        return handleReminderGroups(request, env, requestUrl);
      }
      if (requestUrl.pathname === "/reminders/preview") {
        await authorizeRequest(request, env);
        return json({ ok: true, now: chinaNow(new Date()), reminders: await previewProjectReminders(env, new Date()) });
      }
      if (request.method === "GET") {
        await authorizeRequest(request, env);
        const token = await tenantToken(env);
        const notes = await readNotes(env, token);
        return json({ ok: true, notes });
      }
      if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, 405);
      }

      const body = await request.json();
      if (!body.fields) {
        return json({ error: "Missing fields" }, 400);
      }

      await authorizeRequest(request, env);
      const token = await tenantToken(env);
      const peopleDirectory = await readPeopleDirectory(env, token);
      const fields = {};
      for (const [key, feishuField] of Object.entries(FIELD_MAP)) {
        if (body.fields[key] === undefined) continue;
        if (key === "startDate" || key === "endDate") {
          fields[feishuField] = dateToMs(body.fields[key]);
        } else if (PERSON_KEYS.has(key)) {
          fields[feishuField] = peopleValue(body.fields[key], peopleDirectory);
        } else {
          fields[feishuField] = body.fields[key] || "";
        }
      }

      const baseUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${env.FEISHU_APP_TOKEN}/tables/${env.FEISHU_TABLE_ID}/records`;
      const url = body.recordId ? `${baseUrl}/${body.recordId}` : baseUrl;
      const response = await fetch(url, {
        method: body.recordId ? "PUT" : "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ fields })
      });
      const result = await response.json();
      if (!response.ok || result.code) {
        return json({ error: result }, 500);
      }
      await clearProjectsCache(env, requestUrl.origin);
      const recordId = result.data?.record?.record_id || result.data?.record_id || body.recordId;
      return json({ ok: true, recordId, updated: Object.keys(fields), version: WORKER_VERSION });
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      return json({ error: String(error?.message || error) }, status);
    }
  }
};

async function handleTodos(request, env, requestUrl) {
  const user = await authorizeRequest(request, env);
  await ensureTodoSchema(env);
  await pruneExpiredTodos(env);
  const id = decodeURIComponent(requestUrl.pathname.replace(/^\/todos\/?/, ""));

  if (request.method === "GET") {
    if (id) return json({ error: "Method not allowed" }, 405);
    const { results = [] } = await env.TODOS_DB.prepare(`
      SELECT id, project, title, description, due_date, owner, priority, status,
             created_by, created_at, updated_by, updated_at, revision
      FROM project_todos
      ORDER BY CASE WHEN status = 'done' THEN 1 ELSE 0 END,
               CASE WHEN due_date = '' THEN 1 ELSE 0 END,
               due_date ASC, updated_at DESC
    `).all();
    return json({ ok: true, todos: results.map(todoResponse), meta: { syncedAt: new Date().toISOString() } });
  }

  if (request.method === "POST") {
    if (id) return json({ error: "Method not allowed" }, 405);
    const input = normalizeTodo(await request.json());
    const now = new Date().toISOString();
    const actor = todoActor(user);
    const todo = { id: crypto.randomUUID(), ...input, createdAt: now, createdBy: actor, updatedAt: now, updatedBy: actor, revision: 1 };
    await env.TODOS_DB.prepare(`
      INSERT INTO project_todos (id, project, title, description, due_date, owner, priority, status, created_by, created_at, updated_by, updated_at, revision)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(todo.id, todo.project, todo.title, todo.description, todo.date, todo.owner, todo.priority, todo.status, todo.createdBy, todo.createdAt, todo.updatedBy, todo.updatedAt, todo.revision).run();
    return json({ ok: true, todo }, 201);
  }

  if (request.method === "PATCH") {
    if (!id) return json({ error: "Missing todo id" }, 400);
    const existing = await env.TODOS_DB.prepare(`
      SELECT id, project, title, description, due_date, owner, priority, status,
             created_by, created_at, updated_by, updated_at, revision
      FROM project_todos WHERE id = ?
    `).bind(id).first();
    if (!existing) return json({ error: "Todo not found" }, 404);
    const existingTodo = todoResponse(existing);
    const input = normalizeTodo({ ...existingTodo, ...(await request.json()) });
    const now = new Date().toISOString();
    const actor = todoActor(user);
    const revision = Number(existing.revision || 0) + 1;
    const todo = { id, ...input, createdAt: existingTodo.createdAt, createdBy: existingTodo.createdBy, updatedAt: now, updatedBy: actor, revision };
    await env.TODOS_DB.prepare(`
      UPDATE project_todos
      SET project = ?, title = ?, description = ?, due_date = ?, owner = ?, priority = ?, status = ?, updated_by = ?, updated_at = ?, revision = ?
      WHERE id = ?
    `).bind(todo.project, todo.title, todo.description, todo.date, todo.owner, todo.priority, todo.status, todo.updatedBy, todo.updatedAt, todo.revision, id).run();
    return json({ ok: true, todo });
  }

  if (request.method === "DELETE") {
    if (!id) return json({ error: "Missing todo id" }, 400);
    const existing = await env.TODOS_DB.prepare("SELECT id FROM project_todos WHERE id = ?").bind(id).first();
    if (!existing) return json({ error: "Todo not found" }, 404);
    await env.TODOS_DB.prepare("DELETE FROM project_todos WHERE id = ?").bind(id).run();
    return json({ ok: true, id });
  }

  return json({ error: "Method not allowed" }, 405);
}

async function ensureTodoSchema(env) {
  if (!env.TODOS_DB) throw new HttpError("待办同步库尚未绑定", 503);
  if (!todoSchemaReady) {
    todoSchemaReady = env.TODOS_DB.batch([
      env.TODOS_DB.prepare(`CREATE TABLE IF NOT EXISTS project_todos (
        id TEXT PRIMARY KEY,
        project TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        due_date TEXT NOT NULL DEFAULT '',
        owner TEXT NOT NULL DEFAULT '',
        priority TEXT NOT NULL DEFAULT 'P2',
        status TEXT NOT NULL DEFAULT 'todo',
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1
      )`),
      env.TODOS_DB.prepare("CREATE INDEX IF NOT EXISTS idx_project_todos_project_date ON project_todos(project, due_date)")
    ]).catch(error => {
      todoSchemaReady = null;
      throw error;
    });
  }
  return todoSchemaReady;
}

async function pruneExpiredTodos(env) {
  if (!env.TODOS_DB) return;
  await ensureTodoSchema(env);
  const cutoff = new Date(Date.now() - TODO_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await env.TODOS_DB.prepare("DELETE FROM project_todos WHERE created_at < ?").bind(cutoff).run();
}

async function ensureReminderSchema(env) {
  if (!env.TODOS_DB) throw new HttpError("待办同步库尚未绑定", 503);
  await ensureTodoSchema(env);
  if (!reminderSchemaReady) {
    reminderSchemaReady = (async () => {
      await env.TODOS_DB.batch([
      env.TODOS_DB.prepare(`CREATE TABLE IF NOT EXISTS project_chat_bindings (
        project TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL UNIQUE,
        bound_by TEXT NOT NULL DEFAULT '',
        bound_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`),
      // v2 deliberately does not make chat_id unique: a temporary total project
      // group can receive reminders from many projects during the rollout phase.
      env.TODOS_DB.prepare(`CREATE TABLE IF NOT EXISTS project_chat_bindings_v2 (
        project TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        bound_by TEXT NOT NULL DEFAULT '',
        bound_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`),
      env.TODOS_DB.prepare("CREATE INDEX IF NOT EXISTS idx_project_chat_bindings_v2_chat ON project_chat_bindings_v2(chat_id)"),
      env.TODOS_DB.prepare(`CREATE TABLE IF NOT EXISTS reminder_dispatches (
        dispatch_key TEXT PRIMARY KEY,
        project TEXT NOT NULL,
        slot TEXT NOT NULL,
        dispatched_at TEXT NOT NULL
      )`),
      env.TODOS_DB.prepare("CREATE INDEX IF NOT EXISTS idx_reminder_dispatches_created ON reminder_dispatches(dispatched_at)")
      ]);
      // Preserve any legacy one-project-per-chat bindings when upgrading.
      await env.TODOS_DB.prepare(`INSERT OR IGNORE INTO project_chat_bindings_v2 (project, chat_id, bound_by, bound_at, updated_at)
        SELECT project, chat_id, bound_by, bound_at, updated_at FROM project_chat_bindings`).run();
    })().catch(error => {
      reminderSchemaReady = null;
      throw error;
    });
  }
  return reminderSchemaReady;
}

async function pruneReminderDispatches(env) {
  if (!env.TODOS_DB) return;
  await ensureReminderSchema(env);
  const cutoff = new Date(Date.now() - REMINDER_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await env.TODOS_DB.prepare("DELETE FROM reminder_dispatches WHERE dispatched_at < ?").bind(cutoff).run();
}

function canonicalProjectName(value) {
  const raw = String(value || "").trim();
  return PROJECT_NAME_ALIASES[raw] || raw;
}

function chinaNow(value = new Date()) {
  /** @type {Record<string, string>} */
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23"
  }).formatToParts(value).reduce((out, part) => {
    out[part.type] = part.value;
    return out;
  }, /** @type {Record<string, string>} */ ({}));
  const weekday = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[parts.weekday];
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute), weekday };
}

function localDateParts(ymd) {
  const [year, month, day] = String(ymd).split("-").map(Number);
  return { year, month, day };
}

function addChinaDays(ymd, days) {
  const { year, month, day } = localDateParts(ymd);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return value.toISOString().slice(0, 10);
}

function monthDueDate(date, day) {
  const { year, month, day: currentDay } = localDateParts(date);
  const monthEnd = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const safeDay = Math.min(Number(day), monthEnd);
  const current = new Date(Date.UTC(year, month - 1, currentDay));
  const due = new Date(Date.UTC(year, month - 1, safeDay));
  if (due < current) {
    const nextMonthEnd = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, month, Math.min(Number(day), nextMonthEnd))).toISOString().slice(0, 10);
  }
  return due.toISOString().slice(0, 10);
}

function reminderCandidates(now = new Date()) {
  const local = chinaNow(now);
  const results = [];
  for (const [project, config] of Object.entries(PROJECT_REMINDER_RULES)) {
    for (const rule of config.rules || []) {
      if (rule.type === "weekly" && rule.weekday === local.weekday) {
        results.push({ key: `${project}|${local.date}|${rule.title}`, project, manager: config.manager, rule, dueDate: local.date, phase: "due" });
      }
      if (rule.type === "monthly") {
        const dueDate = monthDueDate(local.date, rule.day);
        const leadDate = addChinaDays(dueDate, -Number(rule.leadDays || 0));
        if (local.date === dueDate || (rule.leadDays && local.date === leadDate)) {
          results.push({ key: `${project}|${dueDate}|${rule.title}`, project, manager: config.manager, rule, dueDate, phase: local.date === dueDate ? "due" : "lead" });
        }
      }
    }
    // 周一例行 KPI 快报由当前项目经理在项目群汇报；头道汤为外包项目，不自动催 KPI。
    if (local.weekday === 1 && project !== "头道汤") {
      results.push({ key: `${project}|${local.date}|kpi-brief`, project, manager: config.manager, rule: { title: "本周 KPI 快报", owner: config.manager, detail: "请同步 KPI 完成情况、当前差距、风险与本周下一步" }, dueDate: local.date, phase: "kpi" });
    }
  }
  return results;
}

function reminderTodoId(candidate) {
  return `auto-${candidate.key}`.replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, "-").slice(0, 180);
}

async function ensureAutomatedTodo(env, candidate) {
  const id = reminderTodoId(candidate);
  const existing = await env.TODOS_DB.prepare("SELECT id FROM project_todos WHERE id = ?").bind(id).first();
  if (existing) return;
  const now = new Date().toISOString();
  await env.TODOS_DB.prepare(`
    INSERT INTO project_todos (id, project, title, description, due_date, owner, priority, status, created_by, created_at, updated_by, updated_at, revision)
    VALUES (?, ?, ?, ?, ?, ?, 'P1', 'todo', '飞书提醒机器人', ?, '飞书提醒机器人', ?, 1)
  `).bind(id, candidate.project, candidate.rule.title, candidate.rule.detail || "", candidate.dueDate, candidate.rule.owner || "", now, now).run();
}

function escapeAtText(value) {
  return String(value || "").replace(/[<>&\"]/g, char => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[char]));
}

function normalizePersonName(name) {
  const raw = String(name || "").trim()
    .replace(/^辛味加$/, "辛味珈")
    .replace(/^徐奕畅$/, "徐奕旸");
  return /向昱筱|cheryl/i.test(raw) ? "向昱筱" : raw;
}

function personIdForName(name, directory) {
  const actual = normalizePersonName(name);
  if (directory.get(actual) || directory.get(name)) return directory.get(actual) || directory.get(name);
  for (const [candidate, id] of directory.entries()) {
    const normalized = normalizePersonName(candidate);
    if (normalized === actual || normalized.startsWith(actual) || actual.startsWith(normalized)) return id;
  }
  return "";
}

function mention(name, directory) {
  return String(name || "负责人").split(/、|,|，|\//).map(item => item.trim()).filter(Boolean).map(person => {
    const id = personIdForName(person, directory);
    return id ? `<at user_id="${escapeAtText(id)}">${escapeAtText(person)}</at>` : `@${person}`;
  }).join(" ");
}

async function sendProjectGroupMessage(token, chatId, text) {
  const response = await fetch("https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ receive_id: chatId, msg_type: "text", content: JSON.stringify({ text }) })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.code) throw new Error(feishuErrorMessage(result, "项目群消息发送失败"));
  return result.data || {};
}

async function reserveDispatch(env, dispatchKey, project, slot) {
  const now = new Date().toISOString();
  const result = await env.TODOS_DB.prepare("INSERT OR IGNORE INTO reminder_dispatches (dispatch_key, project, slot, dispatched_at) VALUES (?, ?, ?, ?)").bind(dispatchKey, project, slot, now).run();
  return Number(result.meta?.changes || 0) > 0;
}

async function activeBindings(env) {
  await ensureReminderSchema(env);
  const { results = [] } = await env.TODOS_DB.prepare("SELECT project, chat_id FROM project_chat_bindings_v2").all();
  return new Map(results.map(row => [row.project, row.chat_id]));
}

async function bindProjectToChat(env, project, chatId, boundBy) {
  await ensureReminderSchema(env);
  const now = new Date().toISOString();
  await env.TODOS_DB.prepare(`INSERT INTO project_chat_bindings_v2 (project, chat_id, bound_by, bound_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(project) DO UPDATE SET chat_id = excluded.chat_id, bound_by = excluded.bound_by, updated_at = excluded.updated_at`
  ).bind(project, chatId, boundBy || "飞书成员", now, now).run();
}

async function bindAllProjectsToChat(env, chatId, boundBy) {
  const projects = Object.keys(PROJECT_REMINDER_RULES);
  for (const project of projects) await bindProjectToChat(env, project, chatId, boundBy);
  return projects;
}

async function openChecklistDueToday(env, ymd) {
  const { results = [] } = await env.TODOS_DB.prepare(`
    SELECT id, project, title, description, due_date, owner, priority, status
    FROM project_todos WHERE due_date = ? AND status != 'done'
  `).bind(ymd).all();
  return results.map(todoResponse);
}

async function dispatchProjectGroupReminders(env, now = new Date()) {
  await ensureReminderSchema(env);
  await pruneReminderDispatches(env);
  const local = chinaNow(now);
  if (![10, 15].includes(local.hour)) return { skipped: "outside-reminder-window" };
  const slot = local.hour === 10 ? "morning" : "afternoon";
  const bindings = await activeBindings(env);
  if (!bindings.size) return { skipped: "no-project-groups" };
  const token = await tenantToken(env);
  const directory = await readPeopleDirectory(env, token);
  const sent = [];
  if (slot === "morning") {
    for (const candidate of reminderCandidates(now)) {
      const chatId = bindings.get(candidate.project);
      if (!chatId) continue;
      const dispatchKey = `${local.date}|morning|${candidate.key}|${candidate.phase}`;
      if (!(await reserveDispatch(env, dispatchKey, candidate.project, slot))) continue;
      if (candidate.phase !== "kpi") await ensureAutomatedTodo(env, candidate);
      const prefix = candidate.phase === "lead" ? "【提前 7 天提醒】" : candidate.phase === "kpi" ? "【本周 KPI 快报】" : "【今日项目节点】";
      const manager = candidate.manager && candidate.manager !== candidate.rule.owner ? `\n项目经理 ${mention(candidate.manager, directory)} 请同步 KPI 完成、差距、风险与下一步。` : "";
      const phaseCopy = candidate.phase === "lead" ? `该事项 DDL 为 ${candidate.dueDate}` : "今天请完成并在 Checklist 勾选";
      const text = `${prefix}\n${mention(candidate.rule.owner, directory)} ${candidate.project} · ${candidate.rule.title}\n${candidate.rule.detail || ""}\n${phaseCopy}${manager}`;
      await sendProjectGroupMessage(token, chatId, text);
      sent.push({ project: candidate.project, title: candidate.rule.title, phase: candidate.phase });
    }
    for (const todo of await openChecklistDueToday(env, local.date)) {
      const project = canonicalProjectName(todo.project);
      const chatId = bindings.get(project);
      if (!chatId || String(todo.id || "").startsWith("auto-")) continue;
      const dispatchKey = `${local.date}|morning|todo|${todo.id}`;
      if (!(await reserveDispatch(env, dispatchKey, project, slot))) continue;
      const text = `【今日 Checklist】\n${mention(todo.owner || "负责人", directory)} ${project} · ${todo.title}\n优先级 ${todo.priority || "P2"}${todo.description ? `\n${todo.description}` : ""}\n请在完成后勾选。`;
      await sendProjectGroupMessage(token, chatId, text);
      sent.push({ project, title: todo.title, phase: "checklist" });
    }
  } else {
    for (const todo of await openChecklistDueToday(env, local.date)) {
      const project = canonicalProjectName(todo.project);
      const chatId = bindings.get(project);
      if (!chatId) continue;
      const dispatchKey = `${local.date}|afternoon|todo|${todo.id}`;
      if (!(await reserveDispatch(env, dispatchKey, project, slot))) continue;
      const text = `【15:00 未完成提醒】\n${mention(todo.owner || "负责人", directory)} ${project} · ${todo.title} 尚未在 Checklist 完成。\n请更新状态，或同步新的完成时间。`;
      await sendProjectGroupMessage(token, chatId, text);
      sent.push({ project, title: todo.title, phase: "overdue" });
    }
  }
  return { sent, slot, date: local.date };
}

async function previewProjectReminders(env, now = new Date()) {
  const local = chinaNow(now);
  const bindings = await activeBindings(env);
  return reminderCandidates(now).map(item => ({ ...item, bound: bindings.has(item.project), local })).filter(item => item.bound);
}

async function handleReminderGroups(request, env, requestUrl) {
  const user = await authorizeRequest(request, env);
  await ensureReminderSchema(env);
  const rawProject = decodeURIComponent(requestUrl.pathname.replace(/^\/reminder-groups\/?/, ""));
  if (request.method === "GET") {
    const { results = [] } = await env.TODOS_DB.prepare("SELECT project, chat_id, bound_by, bound_at, updated_at FROM project_chat_bindings_v2 ORDER BY project").all();
    return json({ ok: true, bindings: results.map(item => ({ ...item, chatId: item.chat_id })) });
  }
  if (request.method === "POST") {
    const body = await request.json();
    const project = canonicalProjectName(body.project);
    const chatId = String(body.chatId || "").trim();
    if (!project || !chatId) return json({ error: "项目和 chatId 均为必填" }, 400);
    if (!PROJECT_REMINDER_RULES[project]) return json({ error: "该项目尚未配置提醒规则" }, 400);
    await bindProjectToChat(env, project, chatId, todoActor(user));
    return json({ ok: true, project, chatId });
  }
  if (request.method === "DELETE") {
    const project = canonicalProjectName(rawProject);
    if (!project) return json({ error: "缺少项目名" }, 400);
    await env.TODOS_DB.prepare("DELETE FROM project_chat_bindings_v2 WHERE project = ?").bind(project).run();
    return json({ ok: true, project });
  }
  return json({ error: "Method not allowed" }, 405);
}

async function handleBotEvent(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const raw = await request.text();
  let payload;
  try { payload = JSON.parse(raw); } catch { return json({ error: "Invalid event body" }, 400); }
  // 首次保存回调地址时飞书使用 url_verification 握手；该响应必须原样回传 challenge。
  if (payload.type === "url_verification") return json({ challenge: payload.challenge || "" });
  const verificationToken = payload.header?.token || payload.token || "";
  if (!env.FEISHU_VERIFICATION_TOKEN || verificationToken !== env.FEISHU_VERIFICATION_TOKEN) return json({ error: "Invalid bot event" }, 401);
  if (payload.encrypt) return json({ error: "请关闭事件 Encrypt Key，或在 Worker 配置解密后重试" }, 400);
  const event = payload.event || {};
  if (payload.header?.event_type !== "im.message.receive_v1" || event.message?.chat_type !== "group") return json({ ok: true });
  const chatId = event.message?.chat_id;
  const sender = event.sender?.sender_id?.open_id || "";
  let text = "";
  try { text = JSON.parse(event.message?.content || "{}").text || ""; } catch {}
  // 文本消息在不同飞书客户端可能带有机器人 @ 占位符，例如 @_user_1。
  // 只提取命令后的项目名，避免因为 @ 机器人的富文本格式不同导致群绑定失效。
  const command = String(text)
    .replace(/<at[^>]*>.*?<\/at>/g, "")
    .replace(/@_user_\d+/gi, "")
    .replace(/@[\w-]+/g, "")
    .trim();
  const bindAllMatch = /^(?:绑定)(?:全部|所有)项目$/.test(command);
  const unbindAllMatch = /^(?:解除)(?:全部|所有)项目$/.test(command);
  const testAllMatch = /^(?:测试)(?:全部|所有)项目(?:提醒)?$/.test(command);
  const bindMatch = command.match(/(?:^|\s)绑定项目\s+(.+?)\s*$/);
  const unbindMatch = command.match(/(?:^|\s)解除项目\s+(.+?)\s*$/);
  if (!bindAllMatch && !unbindAllMatch && !testAllMatch && !bindMatch && !unbindMatch) return json({ ok: true });
  const token = await tenantToken(env);
  await ensureReminderSchema(env);

  if (bindAllMatch) {
    const projects = await bindAllProjectsToChat(env, chatId, sender);
    await sendProjectGroupMessage(token, chatId, `已将当前群设为「总项目测试群」，共绑定 ${projects.length} 个项目：${projects.join("、")}。\n每天 10:00 会发送当天固定节点与 Checklist；15:00 会提醒当天尚未完成的 Checklist。\n现在发送「测试所有项目提醒」，即可立即核验全部项目配置。`);
    return json({ ok: true, projects });
  }

  if (unbindAllMatch) {
    await env.TODOS_DB.prepare("DELETE FROM project_chat_bindings_v2 WHERE chat_id = ?").bind(chatId).run();
    await sendProjectGroupMessage(token, chatId, "已解除当前群的全部项目提醒绑定。");
    return json({ ok: true });
  }

  if (testAllMatch) {
    const directory = await readPeopleDirectory(env, token);
    const bindings = await activeBindings(env);
    const projects = Object.entries(PROJECT_REMINDER_RULES).filter(([project]) => bindings.get(project) === chatId);
    if (!projects.length) {
      await sendProjectGroupMessage(token, chatId, "当前群尚未绑定项目。请先发送：绑定所有项目");
      return json({ ok: true });
    }
    for (const [project, config] of projects) {
      const rows = (config.rules || []).map(rule => `• ${rule.title}｜${mention(rule.owner, directory)}\n  ${rule.detail || ""}`).join("\n");
      const kpi = project === "头道汤" ? "外包项目，不自动催 KPI" : `每周一由 ${mention(config.manager, directory)} 汇报 KPI 完成、差距、风险与下一步`;
      await sendProjectGroupMessage(token, chatId, `【提醒配置测试】${project}\n项目经理：${mention(config.manager, directory)}\n${rows || "• 暂无固定周期节点"}\n• KPI 快报｜${kpi}`);
    }
    await sendProjectGroupMessage(token, chatId, `【测试完成】已发送 ${projects.length} 个项目的提醒配置。后续为单独项目建群后，在新群发送「绑定项目 项目名」，该项目会自动迁移到新群。`);
    return json({ ok: true, tested: projects.map(([project]) => project) });
  }

  const project = canonicalProjectName((bindMatch || unbindMatch)[1]);
  if (!PROJECT_REMINDER_RULES[project]) {
    await sendProjectGroupMessage(token, chatId, `未找到「${project}」的提醒配置。请使用项目全名，例如：绑定项目 太太乐松茸鲜`);
    return json({ ok: true });
  }
  if (bindMatch) {
    await bindProjectToChat(env, project, chatId, sender);
    await sendProjectGroupMessage(token, chatId, `已绑定「${project}」。固定节点会在当天 10:00 @ 负责人；当天未完成 Checklist 会在 15:00 再提醒一次。`);
  } else {
    await env.TODOS_DB.prepare("DELETE FROM project_chat_bindings_v2 WHERE project = ? AND chat_id = ?").bind(project, chatId).run();
    await sendProjectGroupMessage(token, chatId, `已解除「${project}」的项目群绑定。`);
  }
  return json({ ok: true });
}

function todoActor(user) {
  return String(user?.name || user?.openId || "飞书成员").slice(0, 120);
}

function normalizeTodo(value) {
  const source = value && typeof value === "object" ? value : {};
  const title = String(source.title || "").trim().slice(0, 200);
  const project = String(source.project || "未归属项目").trim().slice(0, 160) || "未归属项目";
  if (!title) throw new HttpError("待办事项不能为空", 400);
  const priority = ["P0", "P1", "P2"].includes(String(source.priority || "P2").toUpperCase()) ? String(source.priority || "P2").toUpperCase() : "P2";
  const status = ["todo", "doing", "done"].includes(String(source.status || "todo")) ? String(source.status || "todo") : "todo";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(source.date || "")) ? String(source.date) : "";
  return {
    project,
    title,
    description: String(source.description || "").trim().slice(0, 2000),
    date,
    owner: String(source.owner || "").trim().slice(0, 120),
    priority,
    status
  };
}

function todoResponse(row) {
  return {
    id: row.id,
    project: row.project,
    title: row.title,
    description: row.description || "",
    date: row.due_date || "",
    owner: row.owner || "",
    priority: row.priority || "P2",
    status: row.status || "todo",
    createdBy: row.created_by || "",
    createdAt: row.created_at || "",
    updatedBy: row.updated_by || "",
    updatedAt: row.updated_at || "",
    revision: Number(row.revision || 1)
  };
}

async function readCachedProjects(env, token, origin, forceRefresh = false) {
  const cacheKey = `${env.FEISHU_APP_TOKEN}:${env.FEISHU_TABLE_ID}:${WORKER_VERSION}:${origin}`;
  if (
    !forceRefresh &&
    memoryProjectsCache?.key === cacheKey &&
    Date.now() < memoryProjectsCache.expiresAt
  ) {
    return {
      projects: memoryProjectsCache.projects,
      cached: true
    };
  }

  const edgeCached = await readEdgeProjectsCache(env, origin);
  if (!forceRefresh && edgeCached && Date.now() < edgeCached.freshUntil) {
    memoryProjectsCache = {
      key: cacheKey,
      projects: edgeCached.projects,
      expiresAt: edgeCached.freshUntil
    };
    return { projects: edgeCached.projects, cached: true };
  }

  try {
    const projects = await readProjects(env, token, origin);
    const freshUntil = Date.now() + PROJECT_CACHE_SECONDS * 1000;
    memoryProjectsCache = {
      key: cacheKey,
      projects,
      expiresAt: freshUntil
    };
    await writeEdgeProjectsCache(env, origin, projects, freshUntil);
    return { projects, cached: false };
  } catch (error) {
    if (edgeCached?.projects?.length) {
      return { projects: edgeCached.projects, cached: "stale" };
    }
    throw error;
  }
}

async function clearProjectsCache(env, origin) {
  memoryProjectsCache = null;
  if (typeof caches !== "undefined" && origin) {
    await caches.default.delete(projectsCacheRequest(env, origin));
  }
}

async function refreshScheduledCache(env) {
  try {
    const token = await tenantToken(env);
    await readCachedProjects(env, token, "https://oxygen-feishu-sync.liuyichen021231.workers.dev", true);
  } catch (error) {
    console.warn("scheduled cache refresh failed", error);
  }
}

function projectsCacheRequest(env, origin) {
  return new Request(`${origin}/__project-cache/${env.FEISHU_APP_TOKEN}/${env.FEISHU_TABLE_ID}/${WORKER_VERSION}`);
}

async function readEdgeProjectsCache(env, origin) {
  if (typeof caches === "undefined") return null;
  const cached = await caches.default.match(projectsCacheRequest(env, origin));
  if (!cached) return null;
  return cached.json().catch(() => null);
}

async function writeEdgeProjectsCache(env, origin, projects, freshUntil) {
  if (typeof caches === "undefined") return;
  const payload = JSON.stringify({
    projects,
    freshUntil,
    cachedAt: new Date().toISOString()
  });
  await caches.default.put(projectsCacheRequest(env, origin), new Response(payload, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${PROJECT_STALE_CACHE_SECONDS}`
    }
  }));
}

class HttpError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

function startAuth(request, env) {
  const requestUrl = new URL(request.url);
  const returnTo = safeReturnTo(requestUrl.searchParams.get("return_to"));
  const redirectUri = `${requestUrl.origin}/auth/callback`;
  const state = btoa(unescape(encodeURIComponent(JSON.stringify({
    returnTo,
    createdAt: Date.now()
  }))));
  const authUrl = new URL("https://open.feishu.cn/open-apis/authen/v1/index");
  authUrl.searchParams.set("app_id", env.FEISHU_APP_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  return Response.redirect(authUrl.toString(), 302);
}

async function finishAuth(request, env) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state") || "";
  if (!code) return html("飞书登录失败：没有收到授权 code。", 400);
  const decodedState = parseState(state);
  const returnTo = safeReturnTo(decodedState?.returnTo);
  const appToken = await appAccessToken(env);
  const userAuth = await userAccessToken(appToken, code);
  const user = await userInfo(userAuth.accessToken);
  const session = await signSession(user, env, userAuth);
  const target = new URL(returnTo);
  target.searchParams.set("feishu_user", toBase64(user));
  target.searchParams.set("feishu_session", session);
  return Response.redirect(target.toString(), 302);
}

function safeReturnTo(value) {
  const fallback = "https://liu00904.github.io/oxygen-project-dashboard/#/overview";
  try {
    const target = new URL(String(value || fallback));
    if (target.protocol === "file:") {
      return `http://127.0.0.1:4175/index.html${target.hash || "#/overview"}`;
    }
    const allowed = new Set([
      "https://liu00904.github.io",
      "http://127.0.0.1:4175",
      "http://localhost:4175"
    ]);
    return allowed.has(target.origin) ? target.toString() : fallback;
  } catch {
    return fallback;
  }
}

async function authorizeRequest(request, env) {
  const auth = request.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  const querySession = new URL(request.url).searchParams.get("session") || "";
  const token = match?.[1] || querySession;
  if (!token) throw new HttpError("请先登录飞书", 401);
  const user = await verifySession(token, env);
  const allowedTenant = String(env.FEISHU_ALLOWED_TENANT_KEY || "").trim();
  if (allowedTenant && user.tenantKey !== allowedTenant) throw new HttpError("当前飞书企业未授权访问", 403);
  const allowedOpenIds = String(env.FEISHU_ALLOWED_OPEN_IDS || "")
    .split(/,|，|\s+/)
    .map(item => item.trim())
    .filter(Boolean);
  if (allowedOpenIds.length && !allowedOpenIds.includes(user.openId)) {
    throw new HttpError("当前飞书账号未授权访问", 403);
  }
  return user;
}

async function signSession(user, env, userAuth = null) {
  const payload = {
    name: user.name,
    avatar: user.avatar,
    openId: user.openId,
    unionId: user.unionId,
    tenantKey: user.tenantKey,
    // The file-read token is encrypted before it is placed in the signed
    // dashboard session. It is only decrypted inside this Worker when a
    // document is fetched, so the browser never receives a raw Feishu token.
    fileAccess: userAuth?.accessToken ? await sealForSession(userAuth.accessToken, env) : "",
    fileAccessExp: userAuth?.expiresAt || 0,
    exp: Date.now() + SESSION_MAX_AGE_MS
  };
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmac(body, sessionSecret(env));
  return `${body}.${signature}`;
}

async function verifySession(token, env) {
  const [body, signature] = String(token || "").split(".");
  if (!body || !signature) throw new HttpError("登录状态无效", 401);
  const expected = await hmac(body, sessionSecret(env));
  if (signature !== expected) throw new HttpError("登录状态已失效", 401);
  const payload = JSON.parse(base64UrlDecode(body));
  if (!payload.exp || Date.now() > payload.exp) throw new HttpError("登录已过期", 401);
  return payload;
}

async function sealForSession(value, env) {
  const encoder = new TextEncoder();
  const keyBytes = await crypto.subtle.digest("SHA-256", encoder.encode(sessionSecret(env)));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt"]);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(value));
  return `${base64UrlEncodeBytes(iv)}.${base64UrlEncodeBytes(new Uint8Array(cipher))}`;
}

async function openSessionSeal(value, env) {
  const [ivPart, cipherPart] = String(value || "").split(".");
  if (!ivPart || !cipherPart) return "";
  try {
    const encoder = new TextEncoder();
    const keyBytes = await crypto.subtle.digest("SHA-256", encoder.encode(sessionSecret(env)));
    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64UrlDecodeBytes(ivPart) },
      key,
      base64UrlDecodeBytes(cipherPart)
    );
    return new TextDecoder().decode(plain);
  } catch {
    return "";
  }
}

function sessionSecret(env) {
  return env.FEISHU_SESSION_SECRET || env.FEISHU_APP_SECRET;
}

async function hmac(value, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

async function readNotes(env, token) {
  const notes = {};
  let pageToken = "";
  do {
    const suffix = pageToken ? `&page_token=${pageToken}` : "";
    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${env.FEISHU_APP_TOKEN}/tables/${env.FEISHU_TABLE_ID}/records/search?page_size=100${suffix}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        field_names: ["备注"]
      })
    });
    const result = await response.json();
    if (!response.ok || result.code) throw new Error(JSON.stringify(result));
    for (const item of result.data?.items || []) {
      notes[item.record_id] = textValue(item.fields?.["备注"]);
    }
    pageToken = result.data?.page_token || "";
  } while (pageToken);
  return notes;
}

async function readProjects(env, token, origin) {
  const projects = [];
  let pageToken = "";

  do {
    const suffix = pageToken ? `&page_token=${pageToken}` : "";
    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${env.FEISHU_APP_TOKEN}/tables/${env.FEISHU_TABLE_ID}/records?page_size=500${suffix}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    const result = await response.json();
    if (!response.ok || result.code) throw new Error(feishuErrorMessage(result, "读取项目表失败"));
    for (const item of result.data?.items || []) {
      const project = recordToProject(item, origin);
      if (project.name) projects.push(project);
    }
    pageToken = result.data?.page_token || "";
  } while (pageToken);

  return projects.sort((a, b) => {
    const priority = { "进行中": 0, "待开始": 1, "已完成": 2, "停滞": 3 };
    return (priority[a.status] ?? 9) - (priority[b.status] ?? 9)
      || String(a.name).localeCompare(String(b.name), "zh-Hans-CN");
  });
}

function feishuErrorMessage(result, fallback) {
  return result?.msg
    || result?.error?.message
    || result?.error?.details?.[0]?.message
    || fallback;
}

function recordToProject(record, origin) {
  const fields = record.fields || {};
  const name = textValue(fields[FIELD_MAP.name]).trim();
  const startDate = dateIso(fields[FIELD_MAP.startDate]);
  const endDate = dateIso(fields[FIELD_MAP.endDate]);
  const cycle = cycleDays(startDate, endDate);
  const status = inferStatus(name, fields, startDate, endDate);
  const publishLinks = [
    ...linkList(fields[FIELD_MAP.publishLinks]),
    ...FIELD_ALIASES.projectLinks.flatMap(fieldName => linkList(fields[fieldName]))
  ];
  const monitorLinks = linkList(fields[FIELD_MAP.monitorLinks]);
  const reportLinks = FIELD_ALIASES.reportLinks.flatMap(fieldName => fileList(fields[fieldName], origin));
  const briefLinks = FIELD_ALIASES.briefLinks.flatMap(fieldName => fileList(fields[fieldName], origin));
  const currentData = firstText(fields, FIELD_ALIASES.currentData).trim();
  const suggestion = (textValue(fields[FIELD_MAP.optimizationSuggestion]) || firstText(fields, FIELD_ALIASES.optimizationSuggestion)).trim();
  const notes = (textValue(fields[FIELD_MAP.notes]) || firstText(fields, FIELD_ALIASES.notes)).trim();

  return {
    id: record.record_id,
    recordId: record.record_id,
    source: "feishu",
    name,
    status,
    startDate,
    cycleDays: cycle,
    progressPercent: progressFromFields(fields, status, startDate, cycle),
    kpi: textValue(fields[FIELD_MAP.kpi]).trim(),
    platform: textValue(fields[FIELD_MAP.platform]).trim(),
    notes: cleanNotes(notes),
    manager: names(fields[FIELD_MAP.manager]),
    writer: names(fields[FIELD_MAP.writer]),
    publisher: names(fields[FIELD_MAP.publisher]),
    monitor: names(fields[FIELD_MAP.monitor]),
    invoiceStatus: textValue(fields[FIELD_MAP.invoiceStatus]).trim() || "待确认",
    publishLinks,
    monitorLinks,
    reportLinks,
    briefLinks,
    kpiStatus: "",
    currentData: currentData || defaultCurrent(status),
    optimizationSuggestion: suggestion || defaultSuggestion(status, publishLinks, monitorLinks),
    tableUrl: TABLE_URL
  };
}

function inferStatus(name, fields, startDate, endDate) {
  const explicit = normalizeStatus(textValue(fields[FIELD_MAP.status]));
  if (explicit) return explicit;
  if (COMPLETED_PROJECTS.has(name)) return "已完成";
  if (STALLED_PROJECTS.has(name)) return "停滞";
  if (CURRENT_ONGOING.has(name)) return "进行中";
  const progress = Number(fields["项目进度"]);
  if (Number.isFinite(progress) && progress >= 1) return "已完成";
  if (isPastEndDate(endDate)) return "已完成";
  if (startDate && isStarted(startDate)) return "待开始";
  return "待开始";
}

function isStarted(startDate) {
  const start = new Date(`${startDate}T00:00:00+08:00`).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Number.isFinite(start) && start <= today.getTime();
}

function isPastEndDate(endDate) {
  if (!endDate) return false;
  const end = new Date(`${endDate}T00:00:00+08:00`).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Number.isFinite(end) && end < today.getTime();
}

function progressFromFields(fields, status, startDate, cycle) {
  if (status === "已完成") return 100;
  if (status === "待开始" || status === "停滞") return 0;
  const progress = Number(fields["项目进度"]);
  if (Number.isFinite(progress)) {
    return Math.max(0, Math.min(100, Math.round(progress * 100)));
  }
  return progressPercent(status, startDate, cycle);
}

function dateIso(value) {
  if (!value) return "";
  if (typeof value === "number") return new Date(value).toISOString().slice(0, 10);
  if (typeof value === "string") {
    const normalized = value.replace(/\./g, "-").replace(/\//g, "-");
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
  }
  return "";
}

function cycleDays(startDate, endDate) {
  if (!startDate || !endDate) return "";
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const diff = Math.round((end.getTime() - start.getTime()) / 86400000);
  return Number.isFinite(diff) && diff > 0 ? diff : "";
}

function names(value) {
  if (!Array.isArray(value)) return textValue(value).trim();
  return value
    .map(item => item?.name || item?.en_name || item?.text || item?.email || textValue(item))
    .filter(Boolean)
    .join("、");
}

function normalizeStatus(value) {
  const text = String(value || "");
  if (!text) return "";
  if (text.includes("完成")) return "已完成";
  if (text.includes("停滞")) return "停滞";
  if (text.includes("待") || text.includes("已提交")) return "待开始";
  if (text.includes("进行")) return "进行中";
  return "待开始";
}

function progressPercent(status, startDate, cycle) {
  if (status === "待开始" || status === "停滞" || !startDate || !cycle) return 0;
  if (status === "已完成") return 100;
  const start = new Date(`${startDate}T00:00:00Z`);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const elapsed = Math.max(0, Math.round((today.getTime() - start.getTime()) / 86400000));
  return Math.max(0, Math.min(100, Math.round((elapsed / Number(cycle)) * 100)));
}

function linkList(value) {
  const output = [];
  const visit = item => {
    if (!item) return;
    if (typeof item === "string") {
      item.split(/\n+/).forEach(part => {
        const url = normalizeHref(part);
        if (url) output.push({ label: url.replace(/^https?:\/\//, "").slice(0, 32), url });
      });
      return;
    }
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (typeof item === "object") {
      if (item.file_token || item.tmp_url || item.file_url || isFeishuMediaDownload(item.url || item.link)) return;
      const url = normalizeHref(item.link || item.url || item.text || item.name);
      if (url) {
        output.push({ label: item.text || item.name || url.replace(/^https?:\/\//, "").slice(0, 32), url });
      }
      if (Array.isArray(item.value)) visit(item.value);
    }
  };
  visit(value);
  return uniqueLinks(output);
}

function normalizeHref(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  const embedded = text.match(/https?:\/\/[^\s，。；;,）)]+/i);
  if (embedded) return embedded[0];
  const naked = text.match(/(?:[\w-]+\.)+[a-z]{2,}\/[^\s，。；;,）)]*/i);
  if (naked) return `https://${naked[0]}`;
  if (/^[\w.-]+\.[a-z]{2,}$/i.test(text)) return `https://${text}`;
  return "";
}

function isFeishuMediaDownload(value) {
  return /open\.feishu\.cn\/open-apis\/drive\/v1\/medias\/[^/]+\/download/i.test(String(value || ""));
}

function fileList(value, origin) {
  const output = [];
  const visit = item => {
    if (!item) return;
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (typeof item === "object") {
      const directUrl = item.tmp_url || item.file_url || item.link || item.url;
      const fileToken = item.file_token || item.token;
      const label = item.name || item.file_name || item.text || textValue(item) || "飞书文件";
      const normalizedDirectUrl = normalizeHref(directUrl);
      const url = normalizedDirectUrl && !isFeishuMediaDownload(normalizedDirectUrl)
        ? normalizedDirectUrl
        : TABLE_URL;
      if (url || label) {
        output.push({
          label,
          url,
          fileToken,
          fileType: item.type || item.mime_type || "",
          size: item.size || 0,
          authRequired: false
        });
      }
      if (Array.isArray(item.value)) visit(item.value);
    }
  };
  visit(value);
  return uniqueLinks(output);
}

function firstText(fields, fieldNames) {
  for (const fieldName of fieldNames) {
    const value = textValue(fields[fieldName]).trim();
    if (value) return value;
  }
  return "";
}

function downloadProxyUrl(origin, fileToken, label, directUrl) {
  const url = new URL("/download", origin);
  url.searchParams.set("file_token", fileToken);
  if (label) url.searchParams.set("name", label);
  const extra = extractExtraParam(directUrl);
  if (extra) url.searchParams.set("extra", extra);
  return url.toString();
}

function extractExtraParam(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.searchParams.get("extra") || "";
  } catch {
    return "";
  }
}

async function downloadFeishuFile(requestUrl, token, user, env) {
  const fileToken = requestUrl.searchParams.get("file_token");
  if (!fileToken) return json({ error: "Missing file_token" }, 400);
  const name = requestUrl.searchParams.get("name") || "feishu-file";
  const extra = requestUrl.searchParams.get("extra") || "";
  const downloadUrl = new URL(`https://open.feishu.cn/open-apis/drive/v1/medias/${encodeURIComponent(fileToken)}/download`);
  if (extra) downloadUrl.searchParams.set("extra", extra);
  const userToken = user?.fileAccess && (!user.fileAccessExp || Date.now() < user.fileAccessExp)
    ? await openSessionSeal(user.fileAccess, env)
    : "";
  // Personal drive permissions are evaluated with the reader's OAuth token
  // first. The application token remains a fallback for table-owned files.
  let response = null;
  let failure = "";
  for (const accessToken of [userToken, token].filter(Boolean)) {
    response = await fetch(downloadUrl.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    if (response.ok) break;
    failure = await response.text().catch(() => "");
  }
  if (!response?.ok) {
    const status = response?.status || 502;
    const needsFreshLogin = !userToken || status === 401 || status === 403;
    return json({
      error: failure || `下载文件失败：${status}`,
      code: "FILE_ACCESS_DENIED",
      relogin: needsFreshLogin,
      hint: needsFreshLogin ? "请重新登录飞书后再次打开文件。" : "请确认你拥有该飞书文件的访问权限。"
    }, status);
  }
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
  return new Response(response.body, {
    status: response.status,
    headers
  });
}

function uniqueLinks(list) {
  const seen = new Set();
  return list.filter(item => {
    if (!item?.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

function cleanNotes(value) {
  return String(value || "")
    .replace(/\[网页评论JSON\][\s\S]*$/g, "")
    .trim();
}

function defaultCurrent(status) {
  if (status === "待开始") return "当前完成度 0%";
  return "项目数据已从飞书读取，待补充发稿/监测分析。";
}

function defaultSuggestion(status, publishLinks, monitorLinks) {
  if (status === "待开始") return "项目启动前补齐排期、发稿计划、监测表链接与负责人。";
  if (!publishLinks.length || !monitorLinks.length) return "补齐发稿链接与监测表后，可继续核对 KPI。";
  return "持续按发稿链接与监测表复核 KPI。";
}

async function readPeopleDirectory(env, token) {
  const directory = new Map();
  let pageToken = "";
  const fieldNames = [...PERSON_KEYS].map(key => FIELD_MAP[key]);
  do {
    const suffix = pageToken ? `&page_token=${pageToken}` : "";
    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${env.FEISHU_APP_TOKEN}/tables/${env.FEISHU_TABLE_ID}/records/search?page_size=100${suffix}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ field_names: fieldNames })
    });
    const result = await response.json();
    if (!response.ok || result.code) throw new Error(JSON.stringify(result));
    for (const item of result.data?.items || []) {
      for (const fieldName of fieldNames) {
        const people = Array.isArray(item.fields?.[fieldName]) ? item.fields[fieldName] : [];
        for (const person of people) {
          const name = person?.name || person?.en_name;
          const id = person?.id || person?.open_id || person?.user_id;
          if (name && id && !directory.has(name)) directory.set(name, id);
        }
      }
    }
    pageToken = result.data?.page_token || "";
  } while (pageToken);
  return directory;
}

function peopleValue(value, directory) {
  const names = String(value || "")
    .split(/、|,|，|\//)
    .map(item => item.trim())
    .filter(Boolean);
  const missing = names.filter(name => !directory.has(name));
  if (missing.length) throw new Error(`无法匹配飞书人员：${missing.join("、")}`);
  return names.map(name => ({ id: directory.get(name) }));
}

async function tenantToken(env) {
  const response = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: env.FEISHU_APP_ID,
      app_secret: env.FEISHU_APP_SECRET
    })
  });
  const result = await response.json();
  if (!response.ok || result.code) throw new Error(JSON.stringify(result));
  return result.tenant_access_token;
}

async function appAccessToken(env) {
  const response = await fetch("https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: env.FEISHU_APP_ID,
      app_secret: env.FEISHU_APP_SECRET
    })
  });
  const result = await response.json();
  if (!response.ok || result.code) throw new Error(JSON.stringify(result));
  return result.app_access_token;
}

async function userAccessToken(appToken, code) {
  const response = await fetch("https://open.feishu.cn/open-apis/authen/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${appToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code
    })
  });
  const result = await response.json();
  if (!response.ok || result.code) throw new Error(JSON.stringify(result));
  const accessToken = result.data?.access_token;
  if (!accessToken) throw new Error("飞书未返回用户授权令牌");
  return {
    accessToken,
    expiresAt: Date.now() + Math.max(60, Number(result.data?.expires_in || 7200) - 60) * 1000
  };
}

async function userInfo(userToken) {
  const response = await fetch("https://open.feishu.cn/open-apis/authen/v1/user_info", {
    headers: {
      Authorization: `Bearer ${userToken}`
    }
  });
  const result = await response.json();
  if (!response.ok || result.code) throw new Error(JSON.stringify(result));
  const data = result.data || {};
  return {
    name: data.name || data.en_name || data.email || "飞书用户",
    avatar: data.avatar_url || data.avatar_thumb || data.avatar_middle || data.avatar_big || "",
    openId: data.open_id || "",
    unionId: data.union_id || "",
    tenantKey: data.tenant_key || ""
  };
}

function dateToMs(value) {
  if (!value) return null;
  return new Date(`${value}T00:00:00Z`).getTime();
}

function textValue(value) {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(textValue).join("");
  if (typeof value === "object") {
    if (Array.isArray(value.value)) return textValue(value.value);
    return value.text || value.name || value.link || value.url || "";
  }
  return String(value);
}

function parseState(value) {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(value))));
  } catch {
    return null;
  }
}

function base64UrlEncode(value) {
  return btoa(unescape(encodeURIComponent(value)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return decodeURIComponent(escape(atob(padded)));
}

function base64UrlEncodeBytes(bytes) {
  let binary = "";
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecodeBytes(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function toBase64(value) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(value))));
}

function html(message, status = 200) {
  return new Response(`<!doctype html><meta charset="utf-8"><title>飞书登录</title><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:32px;"><h2>${message}</h2></body>`, {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/html; charset=utf-8"
    }
  });
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}
