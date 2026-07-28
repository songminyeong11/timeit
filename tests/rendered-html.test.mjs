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
  assert.match(html, /MY TO-DO/);
  assert.match(html, /오늘 순공 시간/);
  assert.match(html, /00:00:00/);
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
  assert.match(page, /monthHours\.map/);
  assert.match(page, /displayHours\(hours\)/);
  assert.match(page, /TodoListCard className="home-todo-card"/);
  assert.match(page, /function PlannerScreen\(\{ totalToday, subjects, studyLogs/);
  assert.match(css, /\.bottom-nav \{ position: fixed;/);
  assert.match(css, /\.grass-hours span b/);
  assert.match(css, /\.dark \.home-v3/);
  assert.match(page, /const updateStudyLog/);
  assert.match(page, /const deleteStudyLog/);
  assert.match(page, /onAddStudyLog=\{addStudyLog\}/);
  assert.match(page, /const recordActiveSubject/);
  assert.match(page, /if \(isRunning\) recordActiveSubject\(\);\s*setSelectedSubject\(subjectId\);/);
  assert.match(page, /plannerTheme/);
  assert.doesNotMatch(page, /function StudyGroupPanel/);
  assert.doesNotMatch(page, /수능 D-110 집중방/);
  assert.match(page, /timeit-storage-version/);
  assert.match(page, /timeit-profile-name/);
  assert.doesNotMatch(page, /onBackup=\{backupData\}/);
  assert.match(css, /\.dark \.time-slot\.filled/);
  assert.match(css, /\.timeline-editor/);
  assert.match(page, /timeline-today-time/);
  assert.match(page, /stats-period/);
  assert.match(page, /isProfileEditing/);
  assert.match(css, /\.timeline-header-side/);
  assert.match(css, /\.profile-edit-button/);
  assert.match(page, /"중지"/);
});
