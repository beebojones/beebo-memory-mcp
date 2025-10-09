// scripts/param-provider.cjs
// Minimal SSE Parameter Provider to simulate device-side parameter injection
// Usage (PowerShell):
//   $env:MCP_TOKEN="Zedy1101"; node scripts/param-provider.cjs
// Then connect your client to: http://localhost:7070/params

const http = require("http");

const PORT = process.env.PARAM_PORT ? parseInt(process.env.PARAM_PORT, 10) : 7070;
const TOKEN = process.env.MCP_TOKEN || "Zedy1101";
const BASE_URL = process.env.BASE_URL || process.env.MCP_BRIDGE_URL || "http://127.0.0.1:10000";
const MEMORY_LIMIT = process.env.MEMORY_LIMIT || "5";

function sseWrite(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/params")) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    // Immediately send parameters as SSE events
    sseWrite(res, "param", { MCP_TOKEN: TOKEN });
    sseWrite(res, "param", { BASE_URL });
    sseWrite(res, "param", { MEMORY_LIMIT: parseInt(MEMORY_LIMIT, 10) });

    // keep the connection open
    const interval = setInterval(() => {
      sseWrite(res, "heartbeat", { t: Date.now() });
    }, 15000);

    req.on("close", () => clearInterval(interval));
  } else {
    res.writeHead(404);
    res.end("Not Found");
  }
});

server.listen(PORT, () => {
  console.log(`[param-provider] SSE listening on http://localhost:${PORT}/params`);
  console.log(`[param-provider] Defaults: BASE_URL=${BASE_URL} MEMORY_LIMIT=${MEMORY_LIMIT} MCP_TOKEN set=${Boolean(TOKEN)}`);
});
