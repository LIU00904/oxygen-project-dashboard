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
const WORKER_VERSION = "20260626-file-download-proxy-v1";
const PROJECT_CACHE_SECONDS = 120;
const TABLE_URL = "https://jcnquengglen.feishu.cn/base/SRjgbQqBMa6L1isu8CFcuUAAnEb?table=tbl8o6BzxfDpqxMX&view=vew234Y6ro";
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

let memoryProjectsCache = null;
const STALLED_PROJECTS = new Set(["西昊", "西昊2", "mac", "海蓝之谜"]);

export default {
  async fetch(request, env) {
    try {
      const requestUrl = new URL(request.url);
      if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
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
        const { projects, cached } = await readCachedProjects(env, token, requestUrl.origin);
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
        await authorizeRequest(request, env);
        const token = await tenantToken(env);
        return downloadFeishuFile(requestUrl, token);
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
      await clearProjectsCache(env);
      const recordId = result.data?.record?.record_id || result.data?.record_id || body.recordId;
      return json({ ok: true, recordId, updated: Object.keys(fields), version: WORKER_VERSION });
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      return json({ error: String(error?.message || error) }, status);
    }
  }
};

async function readCachedProjects(env, token, origin) {
  const cacheKey = `${env.FEISHU_APP_TOKEN}:${env.FEISHU_TABLE_ID}:${WORKER_VERSION}:${origin}`;
  if (
    memoryProjectsCache?.key === cacheKey &&
    Date.now() < memoryProjectsCache.expiresAt
  ) {
    return {
      projects: memoryProjectsCache.projects,
      cached: true
    };
  }

  const projects = await readProjects(env, token, origin);
  memoryProjectsCache = {
    key: cacheKey,
    projects,
    expiresAt: Date.now() + PROJECT_CACHE_SECONDS * 1000
  };
  return { projects, cached: false };
}

async function clearProjectsCache(env) {
  memoryProjectsCache = null;
}

class HttpError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

function startAuth(request, env) {
  const requestUrl = new URL(request.url);
  const returnTo = requestUrl.searchParams.get("return_to") || "https://liu00904.github.io/oxygen-project-dashboard/";
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
  const returnTo = decodedState?.returnTo || "https://liu00904.github.io/oxygen-project-dashboard/";
  const appToken = await appAccessToken(env);
  const userToken = await userAccessToken(appToken, code);
  const user = await userInfo(userToken);
  const session = await signSession(user, env);
  const target = new URL(returnTo);
  target.hash = `feishu_user=${encodeURIComponent(toBase64(user))}&feishu_token=${encodeURIComponent(session)}`;
  return Response.redirect(target.toString(), 302);
}

async function authorizeRequest(request, env) {
  const auth = request.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new HttpError("请先登录飞书", 401);
  const user = await verifySession(match[1], env);
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

async function signSession(user, env) {
  const payload = {
    name: user.name,
    avatar: user.avatar,
    openId: user.openId,
    unionId: user.unionId,
    tenantKey: user.tenantKey,
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
  const status = inferStatus(name, fields, startDate);
  const publishLinks = [
    ...linkList(fields[FIELD_MAP.publishLinks]),
    ...linkList(fields["项目资料"])
  ];
  const monitorLinks = linkList(fields[FIELD_MAP.monitorLinks]);
  const reportLinks = [
    ...linkList(fields["项目报告文件"]),
    ...fileList(fields["项目报告文件"], origin)
  ];
  const briefLinks = [
    ...linkList(fields["Brief"]),
    ...fileList(fields["Brief"], origin)
  ];
  const currentData = textValue(fields["当前数据"]).trim();
  const suggestion = textValue(fields[FIELD_MAP.optimizationSuggestion]).trim();

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
    notes: cleanNotes(textValue(fields[FIELD_MAP.notes])),
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

function inferStatus(name, fields, startDate) {
  if (STALLED_PROJECTS.has(name)) return "停滞";
  const progress = Number(fields["项目进度"]);
  if (Number.isFinite(progress) && progress >= 1) return "已完成";
  if (startDate || (Number.isFinite(progress) && progress > 0)) return "进行中";
  return "待开始";
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
  const diff = Math.round((end - start) / 86400000);
  return Number.isFinite(diff) && diff > 0 ? diff : "";
}

function names(value) {
  if (!Array.isArray(value)) return textValue(value).trim();
  return value
    .map(item => item?.name || item?.en_name || item?.email || textValue(item))
    .filter(Boolean)
    .join("、");
}

function normalizeStatus(value) {
  const text = String(value || "");
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
  const elapsed = Math.max(0, Math.round((today - start) / 86400000));
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

function fileList(value, origin) {
  const output = [];
  const visit = item => {
    if (!item) return;
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (typeof item === "object") {
      const directUrl = item.url || item.link || item.tmp_url || item.file_url;
      const fileToken = item.file_token || item.token;
      const label = item.name || item.file_name || item.text || "飞书文件";
      const url = fileToken && origin
        ? downloadProxyUrl(origin, fileToken, label, directUrl)
        : directUrl;
      if (url || label) {
        output.push({
          label,
          url,
          fileToken,
          fileType: item.type || item.mime_type || "",
          size: item.size || 0,
          authRequired: Boolean(fileToken && origin)
        });
      }
      if (Array.isArray(item.value)) visit(item.value);
    }
  };
  visit(value);
  return uniqueLinks(output);
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

async function downloadFeishuFile(requestUrl, token) {
  const fileToken = requestUrl.searchParams.get("file_token");
  if (!fileToken) return json({ error: "Missing file_token" }, 400);
  const name = requestUrl.searchParams.get("name") || "feishu-file";
  const extra = requestUrl.searchParams.get("extra") || "";
  const downloadUrl = new URL(`https://open.feishu.cn/open-apis/drive/v1/medias/${encodeURIComponent(fileToken)}/download`);
  if (extra) downloadUrl.searchParams.set("extra", extra);
  const response = await fetch(downloadUrl.toString(), {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return json({ error: text || `下载文件失败：${response.status}` }, response.status);
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
  return result.data?.access_token;
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
