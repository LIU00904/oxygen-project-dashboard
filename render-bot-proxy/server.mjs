import http from "node:http";

const port = Number(process.env.PORT || 10000);
const workerBotUrl = process.env.WORKER_BOT_URL;
const maxBodyBytes = 1024 * 1024;

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
    return sendJson(response, 200, { ok: true, service: "oxygen-feishu-event-proxy" });
  }

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
