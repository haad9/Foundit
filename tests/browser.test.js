const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { createServer } = require("../server");

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

function findChrome() {
  return CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate));
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) return;
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket?.close();
  }
}

async function startChrome(url) {
  const executable = findChrome();
  if (!executable) return null;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "foundit-browser-test-"));
  const chrome = spawn(executable, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-software-rasterizer",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });

  let diagnostics = "";
  const browserSocket = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Chrome did not expose DevTools. ${diagnostics}`)), 12_000);
    chrome.stderr.on("data", (chunk) => {
      diagnostics += chunk.toString();
      const match = diagnostics.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    chrome.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Chrome exited before the test started (${code}). ${diagnostics}`));
    });
  });

  const devtoolsOrigin = `http://${new URL(browserSocket).host}`;
  const targetResponse = await fetch(`${devtoolsOrigin}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  const target = await targetResponse.json();
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  await client.send("Runtime.enable");
  await client.send("Page.enable");

  return {
    client,
    async close() {
      client.close();
      chrome.kill();
      await Promise.race([once(chrome, "exit"), new Promise((resolve) => setTimeout(resolve, 1500))]);
      fs.rmSync(profile, { recursive: true, force: true });
    },
  };
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(client, expression, message, timeout = 8_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(client, expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(`Timed out waiting for ${message}`);
}

async function submitIdeas(client, maya, theo) {
  await evaluate(client, `(() => {
    document.querySelector('#editIdeasBtn').click();
    const maya = document.querySelector('#mayaPrompt');
    const theo = document.querySelector('#theoPrompt');
    maya.value = ${JSON.stringify(maya)};
    theo.value = ${JSON.stringify(theo)};
    maya.dispatchEvent(new Event('input', { bubbles: true }));
    theo.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#ideasForm').requestSubmit();
    return true;
  })()`);
  await waitFor(client, "document.querySelector('#ideasModal').classList.contains('hidden')", "custom branches");
}

test("a tester can create, compare, resolve, and merge custom teammate ideas", { timeout: 30_000 }, async (t) => {
  const chromePath = findChrome();
  if (!chromePath) {
    t.skip("Chrome or Edge was not found; set CHROME_PATH to enable the browser test.");
    return;
  }

  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await startChrome(baseUrl);

  try {
    const { client } = browser;
    await waitFor(client, "document.body.dataset.ready === 'true'", "Foundit to initialize");

    await submitIdeas(
      client,
      "Let customers add a personal gift message.",
      "Add order notes for delivery instructions."
    );
    assert.equal(await evaluate(client, "document.querySelector('#readyCopy').textContent"), "Foundit found 2 changes across two versions.");

    await evaluate(client, "document.querySelector('#compareBtn').click()");
    await waitFor(client, "document.body.dataset.demoState === 'conflict'", "compatible review state");
    assert.match(await evaluate(client, "document.querySelector('#conflictHeading').textContent"), /work together/);

    await evaluate(client, "document.querySelector('#resolveBtn').click()");
    await waitFor(client, "document.body.dataset.demoState === 'merged'", "compatible merge", 10_000);
    const compatibleSummary = await evaluate(client, "document.querySelector('#successCopy').textContent");
    assert.match(compatibleSummary, /order notes/);
    assert.match(compatibleSummary, /gift messages/);
    assert.equal(await evaluate(client, "document.querySelector('#extrasPanel').classList.contains('visible')"), true);

    await evaluate(client, "document.querySelector('#resetBtn').click()");
    await waitFor(client, "document.body.dataset.demoState === 'branches'", "demo reset");
    await evaluate(client, "document.querySelector('#compareBtn').click()");
    await waitFor(client, "document.querySelector('#conflictHeading').textContent === 'Shipping address flow'", "semantic shipping conflict");
    assert.match(await evaluate(client, "document.querySelector('#conflictExplanation').textContent"), /separate address check/);

    await evaluate(client, "document.querySelector('#resolveBtn').click()");
    await waitFor(client, "document.body.dataset.demoState === 'merged'", "recommended merge", 10_000);
    assert.equal(await evaluate(client, "document.querySelector('#shopPage').classList.contains('has-discount')"), true);
    assert.equal(await evaluate(client, "document.querySelector('#shopPage').classList.contains('verify-inline')"), true);
    assert.equal(await evaluate(client, "document.querySelector('#shopPage').classList.contains('no-express')"), false);

    await submitIdeas(
      client,
      "Keep guest checkout and add discount codes.",
      "Require every customer to sign in to an account before checkout."
    );
    await evaluate(client, "document.querySelector('#compareBtn').click()");
    await waitFor(client, "document.querySelector('#conflictHeading').textContent === 'Guest access'", "direct behavior conflict");
    await evaluate(client, `(() => {
      const radio = document.querySelector('input[value="theo"]');
      radio.click();
      document.querySelector('#resolveBtn').click();
      return true;
    })()`);
    await waitFor(client, "document.body.dataset.demoState === 'merged'", "explicit teammate resolution", 10_000);
    assert.match(await evaluate(client, "document.querySelector('#accessLabel').textContent"), /Account required/);
  } finally {
    await browser.close();
    server.close();
    await once(server, "close");
  }
});
