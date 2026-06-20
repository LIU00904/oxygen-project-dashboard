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
const WORKER_VERSION = "20260617-project-write-v1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

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
      if (request.method === "GET") {
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
      const recordId = result.data?.record?.record_id || result.data?.record_id || body.recordId;
      return json({ ok: true, recordId, updated: Object.keys(fields), version: WORKER_VERSION });
    } catch (error) {
      return json({ error: String(error?.message || error) }, 500);
    }
  }
};

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
  const target = new URL(returnTo);
  target.hash = `feishu_user=${encodeURIComponent(toBase64(user))}`;
  return Response.redirect(target.toString(), 302);
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
      "Content-Type": "application/json"
    }
  });
}
