const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { createServer } = require("../server");

async function withServer(run) {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

function demoBody() {
  return {
    proposals: [
      { name: "Maya", prompt: "Make everything one page and add Apple Pay." },
      { name: "Theo", prompt: "Add a promo code and verify the shipping address." },
    ],
  };
}

test("health endpoint identifies the running service", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, service: "foundit-merge", version: 1 });
  });
});

test("analyze endpoint returns branches, changes, and conflicts", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(demoBody()),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.branches.length, 2);
    assert.equal(body.summary.totalChanges, 4);
    assert.equal(body.summary.conflictCount, 1);
  });
});

test("merge endpoint returns a checked merged configuration", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(demoBody()),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.passed, true);
    assert.equal(body.config.layout, "single");
    assert.equal(body.config.addressVerification, "inline");
    assert.equal(body.checks.length, 4);
  });
});

test("API errors are JSON and use useful status codes", async () => {
  await withServer(async (baseUrl) => {
    const invalidJson = await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    assert.equal(invalidJson.status, 400);
    assert.match((await invalidJson.json()).error, /valid JSON/);

    const invalidProposal = await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposals: [] }),
    });
    assert.equal(invalidProposal.status, 422);
    assert.match((await invalidProposal.json()).error, /Exactly two/);
  });
});

test("static files are served and traversal is rejected", async () => {
  await withServer(async (baseUrl) => {
    const home = await fetch(`${baseUrl}/`);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /Foundit Merge/);

    const missing = await fetch(`${baseUrl}/missing-file.js`);
    assert.equal(missing.status, 404);

    const traversal = await fetch(`${baseUrl}/..%2Fpackage.json`);
    assert.equal(traversal.status, 403);
  });
});
