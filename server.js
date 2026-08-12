const http = require("http");
const fs = require("fs");
const path = require("path");
const { analyzeProposals, mergeProposals } = require("./merge-engine");

const root = __dirname;
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 100_000) reject(Object.assign(new Error("Request body is too large."), { statusCode: 413 }));
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(Object.assign(new Error("Request body must be valid JSON."), { statusCode: 400 }));
      }
    });
    req.on("error", reject);
  });
}

async function handleApi(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/health") {
    sendJson(res, 200, { ok: true, service: "foundit-merge", version: 1 });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/analyze") {
    try {
      sendJson(res, 200, analyzeProposals(await readJson(req)));
    } catch (error) {
      sendJson(res, error.statusCode || 422, { error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && pathname === "/api/merge") {
    try {
      sendJson(res, 200, mergeProposals(await readJson(req)));
    } catch (error) {
      sendJson(res, error.statusCode || 422, { error: error.message });
    }
    return true;
  }

  if (pathname.startsWith("/api/")) {
    sendJson(res, 404, { error: "API route not found." });
    return true;
  }
  return false;
}

function serveStatic(req, res, pathname) {
  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405, { Allow: "GET, HEAD" }).end("Method not allowed");
    return;
  }

  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(root, requested);
  const relative = path.relative(root, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": mime[path.extname(filePath)] || "application/octet-stream",
      "Content-Length": data.length,
      "Cache-Control": "no-cache",
    });
    if (req.method === "HEAD") res.end();
    else res.end(data);
  });
}

function createServer() {
  return http.createServer(async (req, res) => {
    const pathname = decodeURIComponent((req.url || "/").split("?")[0]);
    if (await handleApi(req, res, pathname)) return;
    serveStatic(req, res, pathname);
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 4173);
  createServer().listen(port, "127.0.0.1", () => {
    console.log(`Foundit Merge is ready at http://127.0.0.1:${port}`);
  });
}

module.exports = { createServer };
