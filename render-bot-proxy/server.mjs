import http from "node:http";

const port = Number(process.env.PORT || 10000);
const workerBotUrl = process.env.WORKER_BOT_URL;
const maxBodyBytes = 1024 * 1024;
const apiVersion = "20261116-shared-todos-v1";
const allowedOrigins = new Set(["https://liu00904.github.io"]);

async function proxyDashboardApi(request, response, url) {
  const origin = String(request.headers.origin || "");
  if (origin && !allowedOrigins.has(origin)) return sendJson(response, 403, { error: "Origin not allowed" });
  if (origin) response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.setHeader("Access-Control-Max-Age", "600");
  const path = url.pathname.slice(4);
  if (!/^\/(todos(?:\/[A-Za-z0-9_:%-]{1,200})?|fixed-checks|projects)$/.test(path)) return sendJson(response, 404, { error: "Not found" });
  if (request.method === "OPTIONS") return sendJson(response, 200, { ok: true });
  if (!["GET", "POST", "PATCH", "DELETE"].includes(request.method)) return sendJson(response, 405, { error: "Method not allowed" });
  const authorization = String(request.headers.authorization || "");
  if (!/^Bearer\s+\S+$/i.test(authorization)) return sendJson(response, 401, { error: "请先登录飞书" });
  if (!workerBotUrl) return sendJson(response, 503, { error: "同步服务尚未配置" });
  const target = new URL(path + url.search, new URL(workerBotUrl).origin);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const body = ["POST", "PATCH"].includes(request.method) ? await readBody(request) : undefined;
    const upstream = await fetch(target, {
      method: request.method,
      headers: { authorization, "content-type": "application/json" },
      body,
      redirect: "error",
      signal: controller.signal
    });
    const contentType = upstream.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return sendJson(response, 502, { error: "同步服务返回异常，请重新登录后重试" });
    const payload = await upstream.json();
    return sendJson(response, upstream.status, payload);
  } catch (error) {
    const tooLarge = error?.message === "Payload too large";
    console.error("Dashboard API forwarding failed", error?.name, error?.cause?.code || "");
    return sendJson(response, tooLarge ? 413 : error?.name === "AbortError" ? 504 : 502, {
      error: tooLarge ? "待办内容过长" : "共享同步服务暂时连接失败，请稍后重试"
    });
  } finally {
    clearTimeout(timer);
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) throw new Error("Payload too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function forwardToWorker(rawBody) {
  if (!workerBotUrl) {
    console.error("WORKER_BOT_URL is not configured");
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const upstream = await fetch(workerBotUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: rawBody,
      signal: controller.signal
    });
    if (!upstream.ok) console.error("Worker rejected bot event", upstream.status);
  } catch (error) {
    console.error("Worker forwarding failed", error?.message || error);
  } finally {
    clearTimeout(timer);
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && url.pathname === "/health") {
    return sendJson(response, 200, { ok: true, service: "oxygen-feishu-event-proxy", apiVersion });
  }

  if (url.pathname.startsWith("/api/")) return proxyDashboardApi(request, response, url);

  if (url.pathname !== "/bot/events") {
    return sendJson(response, 404, { error: "Not found" });
  }

  if (request.method !== "POST") {
    return sendJson(response, 405, { error: "Method not allowed" });
  }

  let rawBody;
  let payload;
  try {
    rawBody = await readBody(request);
    payload = JSON.parse(rawBody);
  } catch (error) {
    return sendJson(response, 400, {
      error: error?.message === "Payload too large" ? error.message : "Invalid JSON"
    });
  }

  if (payload?.type === "url_verification") {
    return sendJson(response, 200, { challenge: payload.challenge || "" });
  }

  sendJson(response, 200, { ok: true });
  void forwardToWorker(rawBody);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Feishu event proxy listening on ${port}`);
});
