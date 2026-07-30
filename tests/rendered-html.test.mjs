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
  assert.match(page, /displayHours\(item\.hours\)/);
  assert.match(page, /TodoListCard className="home-todo-card"/);
  assert.match(page, /function PlannerScreen\(\{ plannerDate, onPlannerDateChange, subjects, studyLogs/);
  assert.match(css, /\.bottom-nav \{ position: fixed;/);
  assert.match(css, /width: min\(100%, 460px\)/);
  assert.match(page, /const \[isDark, setIsDark\] = useState\(true\)/);
  assert.match(page, /setIsDark\(savedTheme !== "light"\)/);
  assert.doesNotMatch(page, /aria-label="테마 전환"/);
  assert.match(css, /\.grass-hours span b/);
  assert.match(css, /\.dark \.home-v3/);
  assert.match(page, /const updateStudyLog/);
  assert.match(page, /const deleteStudyLog/);
  assert.match(page, /onAddStudyLog=\{addStudyLog\}/);
  assert.match(page, /const recordActiveSubject/);
  assert.match(page, /const commitSession = \(subjectId: string, elapsedSeconds: number, startedAt: number \| null\)/);
  assert.match(page, /const recorded = elapsedSeconds \/ 60/);
  assert.match(page, /trackedSeconds: elapsedSeconds/);
  assert.doesNotMatch(page, /Math\.max\(1, Math\.floor\(elapsedSeconds \/ 60\)\)/);
  assert.match(page, /const recorded = isRunning \? commitSession\(selectedSubject, seconds, sessionStartMinutes\) : 0;/);
  assert.match(page, /setSavedSession\(recorded && previousSubject/);
  assert.match(page, /<button className="subject-play" onClick=\{\(\) => onChooseSubject\(subject\.id\)\}/);
  assert.match(page, /onDeleteSubject=\{deleteSubject\}/);
  assert.match(page, /className="subject-delete-button"/);
  assert.match(page, /timeit-subjects/);
  assert.match(page, /const demoSubjects: Subject\[\]/);
  assert.match(page, /const demoTodos: Todo\[\]/);
  assert.match(page, /function createDemoStudyLogs/);
  assert.match(page, /isDemo \? "demo-v5" : "production-v1"/);
  assert.match(page, /window\.location\.hostname\.split\("\."\)\[0\] === "timeit-demo"/);
  assert.match(page, /plannerTheme/);
  assert.doesNotMatch(page, /function StudyGroupPanel/);
  assert.doesNotMatch(page, /수능 D-110 집중방/);
  assert.match(page, /timeit-storage-version/);
  assert.match(page, /timeit-profile-name/);
  assert.doesNotMatch(page, /onBackup=\{backupData\}/);
  assert.match(css, /\.dark \.time-slot\.filled/);
  assert.match(css, /\.timeline-editor/);
  assert.match(page, /timeline-today-time/);
  assert.match(page, /const selectedLogs = studyLogs\.filter\(\(log\) => logDateKey\(log\) === plannerDate\)/);
  assert.match(page, /shiftDateKey\(plannerDate, -1\)/);
  assert.match(page, /shiftDateKey\(plannerDate, 1\)/);
  assert.match(page, /type="date" value=\{dateDraft\}/);
  assert.match(page, /recordedAtForDate\(plannerDate, log\.startMinutes\)/);
  assert.match(page, /stats-period/);
  assert.match(page, /isProfileEditing/);
  assert.match(css, /\.timeline-header-side/);
  assert.match(css, /\.timeline-date-nav/);
  assert.match(css, /\.app-shell:not\(\.dark\)\.planner-theme-fog \{ --paper:/);
  assert.match(css, /\.dark\.planner-theme-rose \{ --paper:/);
  assert.match(page, /STUDY CALENDAR/);
  assert.match(page, /parseCalendarFile/);
  assert.match(page, /accept="\.ics,text\/calendar"/);
  assert.doesNotMatch(page, /공부 잔디/);
  assert.match(css, /\.profile-edit-button/);
  assert.match(page, /"중지"/);
});
