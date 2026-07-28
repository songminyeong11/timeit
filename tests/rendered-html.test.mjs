import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Timeit study dashboard", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>타임잇 \| 공부가 쌓이는 나만의 페이지<\/title>/);
  assert.match(html, /오늘의 할 일/);
  assert.match(html, /오늘 순공 시간/);
  assert.match(html, /04:58:00/);
  assert.match(html, /타이머/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Building your site/i);
});

test("keeps automatic timer logging and readable planning affordances wired", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /if \(isRunning\) \{\s*saveSession\(\);/);
  assert.match(page, /setStudyLogs\(\(items\) => \[\.\.\.items,/);
  assert.match(page, /durationMinutes: gridDuration/);
  assert.match(page, /grassHours\.map/);
  assert.match(page, /displayHours\(hours\)/);
  assert.match(page, /home-todo-center/);
  assert.match(css, /\.bottom-nav \{ position: fixed;/);
  assert.match(css, /\.grass-hours span b/);
  assert.match(css, /\.dark \.home-v3/);
});
