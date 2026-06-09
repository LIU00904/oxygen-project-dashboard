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
  optimizationSuggestion: "优化建议"
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const body = await request.json();
    if (!body.recordId || !body.fields) {
      return json({ error: "Missing recordId or fields" }, 400);
    }

    const token = await tenantToken(env);
    const fields = {};
    for (const [key, feishuField] of Object.entries(FIELD_MAP)) {
      if (body.fields[key] === undefined) continue;
      if (key === "startDate" || key === "endDate") {
        fields[feishuField] = dateToMs(body.fields[key]);
      } else {
        fields[feishuField] = body.fields[key] || "";
      }
    }

    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${env.FEISHU_APP_TOKEN}/tables/${env.FEISHU_TABLE_ID}/records/${body.recordId}`;
    const response = await fetch(url, {
      method: "PUT",
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
    return json({ ok: true, updated: Object.keys(fields) });
  }
};

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

function dateToMs(value) {
  if (!value) return null;
  return new Date(`${value}T00:00:00Z`).getTime();
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
