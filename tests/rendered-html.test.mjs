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
  const [page, css, workerAuth, workerIndex, hosting] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../worker/auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /if \(isRunning\) \{\s*saveSession\(\);/);
  assert.match(page, /setStudyLogs\(\(items\) => \[\.\.\.items,/);
  assert.match(page, /durationMinutes: gridDuration/);
  assert.match(page, /displayHours\(item\.hours\)/);
  assert.match(page, /TodoListCard className="home-todo-card"/);
  assert.match(page, /function PlannerScreen\(\{ plannerDate, onPlannerDateChange, subjects, studyLogs/);
  assert.match(css, /\.bottom-nav \{ position: fixed;/);
  assert.match(css, /width: min\(100%, 460px\)/);
  assert.match(page, /const \[isDark, setIsDark\] = useState\(false\)/);
  assert.match(page, /timeit-light-default-v1/);
  assert.match(page, /setIsDark\(savedTheme === "dark"\)/);
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
  assert.match(page, /const recorded = isRunning \? commitSession\(selectedSubject, seconds, sessionStartedAt\) : 0;/);
  assert.match(page, /const ACTIVE_TIMER_KEY = "timeit-active-timer-v1"/);
  assert.match(page, /lastTickAtRef/);
  assert.match(page, /safeStoredJson/);
  assert.match(page, /minutesBySubject\(studyLogs, subjects, dateKey\(\)\)/);
  assert.match(page, /same time|같은 시간대에 이미 기록이 있어요/);
  assert.match(page, /className={`sync-indicator/);
  assert.match(page, /className="todo-delete"/);
  assert.match(page, /setSavedSession\(recorded && previousSubject/);
  assert.match(page, /<button className="subject-play" onClick=\{\(\) => onChooseSubject\(subject\.id\)\}/);
  assert.match(page, /onDeleteSubject=\{deleteSubject\}/);
  assert.match(page, /className="subject-delete-button"/);
  assert.match(page, /timeit-subjects/);
  assert.match(page, /const demoSubjects: Subject\[\]/);
  assert.match(page, /const demoTodos: Todo\[\]/);
  assert.match(page, /function createDemoStudyLogs/);
  assert.match(page, /isDemo \? "demo-v5" : "production-v2"/);
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
  assert.match(page, /getKoreanHolidays/);
  assert.match(page, /item\.weekday === 6 \? "saturday"/);
  assert.match(page, /item\.isHoliday \? "holiday"/);
  assert.match(page, /GOOGLE_CALENDAR_SCOPE/);
  assert.match(page, /loadGoogleIdentityServices/);
  assert.match(page, /requestGoogleCalendarToken/);
  assert.match(page, /fetchGoogleCalendarMonth/);
  assert.match(page, /createGoogleStudyEvent/);
  assert.match(page, /Google 캘린더 연결/);
  assert.match(page, /google-calendar-button/);
  assert.doesNotMatch(page, /parseCalendarFile/);
  assert.doesNotMatch(page, /accept="\.ics,text\/calendar"/);
  assert.doesNotMatch(page, /createStudyCalendarFile/);
  assert.doesNotMatch(page, /navigator\.canShare/);
  assert.doesNotMatch(page, /폰으로 보내기/);
  assert.match(page, /icon: CalendarDays/);
  assert.match(page, /className="nav-icon"/);
  assert.doesNotMatch(page, /공부 잔디/);
  assert.match(css, /\.profile-edit-button/);
  assert.match(css, /\.study-calendar-weekdays span:last-child/);
  assert.match(css, /\.calendar-day\.saturday b/);
  assert.match(css, /\.calendar-day\.holiday b/);
  assert.match(css, /\.calendar-day-detail li\.holiday-schedule/);
  assert.match(page, /schedule\.description/);
  assert.match(css, /\.calendar-day\.today, \.calendar-day\.today\.selected/);
  assert.doesNotMatch(css, /\.calendar-day\.today b \{ color:/);
  assert.match(css, /\.bottom-nav \{ bottom: max\(10px, env\(safe-area-inset-bottom\)\); width: min\(calc\(100% - 24px\), 436px\)/);
  assert.match(css, /\.app-shell \{ min-height: 100dvh; background: var\(--paper\)/);
  assert.match(css, /\.dark\.app-shell \{ background: var\(--paper\); \}/);
  assert.match(css, /body:has\(\.app-shell:not\(\.dark\)\.planner-theme-fog\)/);
  assert.doesNotMatch(css, /\.app-shell \{[^}]*background: #ece9e5/);
  assert.doesNotMatch(css, /\.dark\.app-shell \{ background: radial-gradient/);
  assert.match(page, /\{ id: "stats" as Screen, icon: BarChart3, label: "통계" \},\s*\{ id: "timer"/);
  assert.match(page, /\{ id: "planner" as Screen, icon: CalendarDays, label: "플래너" \}/);
  assert.match(page, /className=\{`auth-trigger/);
  assert.match(page, /function AuthDialog/);
  assert.match(page, /Google 계정으로 계속하기/);
  assert.match(page, /\/api\/auth\/google/);
  assert.match(page, /identity\.renderButton/);
  assert.match(page, /\/api\/auth\/session/);
  assert.match(page, /reset-password/);
  assert.match(page, /비밀번호를 잊으셨나요/);
  assert.match(page, /function RecoveryCodeCard/);
  assert.match(page, /\/api\/account\/profile/);
  assert.match(page, /\/api\/account\/password/);
  assert.match(page, /\/api\/account\/recovery-code/);
  assert.match(page, /aria-label="계정 정보 열기"/);
  assert.match(page, /className="quick-theme-toggle"/);
  assert.match(page, /다크 모드로 변경/);
  assert.match(page, /\/api\/user-data/);
  assert.match(page, /accountDataReady/);
  assert.match(page, /else setIsAuthOpen\(true\)/);
  assert.match(css, /\.auth-overlay/);
  assert.match(css, /\.auth-dialog/);
  assert.match(css, /\.dark \.calendar-day\.grass-0 \{ background: #303738; \}/);
  assert.match(css, /\.dark \.calendar-day\.grass-4 \{ background: #5f936e;/);
  assert.match(css, /\.dark \.auth-form input::placeholder/);
  assert.match(css, /\.forgot-password-button/);
  assert.match(css, /\.account-dialog/);
  assert.match(css, /\.dark \.account-identity/);
  assert.match(css, /\.recovery-code-card/);
  assert.match(css, /\.quick-theme-toggle/);
  assert.match(css, /\.dark \.quick-theme-toggle/);
  assert.equal(JSON.parse(hosting).d1, "DB");
  assert.match(workerIndex, /handleAuthRequest/);
  assert.match(workerAuth, /PBKDF2/);
  assert.match(workerAuth, /createRemoteJWKSet/);
  assert.match(workerAuth, /jwtVerify/);
  assert.match(workerAuth, /audience: GOOGLE_CLIENT_ID/);
  assert.match(workerAuth, /users_google_sub_unique/);
  assert.match(workerAuth, /iterations: PASSWORD_ITERATIONS/);
  assert.match(workerAuth, /HttpOnly; Secure; SameSite=Lax/);
  assert.match(workerAuth, /origin === new URL\(request\.url\)\.origin/);
  assert.match(workerAuth, /ON CONFLICT\(user_id\) DO UPDATE/);
  assert.match(workerAuth, /\/api\/auth\/reset-password/);
  assert.match(workerAuth, /\/api\/account\/profile/);
  assert.match(workerAuth, /recovery_hash/);
  assert.match(workerAuth, /AUTH_ATTEMPT_LIMIT/);
  assert.match(workerAuth, /auth_attempts/);
  assert.match(workerIndex, /X-Content-Type-Options/);
  assert.doesNotMatch(workerAuth, /localStorage/);
  assert.match(page, /"중지"/);
});

test("calculates Korean public holidays, lunar holidays, and substitute days", async () => {
  const { getKoreanHolidays } = await import("../app/korean-holidays.ts");
  const holidays = getKoreanHolidays(2026);
  const names = (key) => (holidays.get(key) ?? []).map((holiday) => holiday.name);

  assert.deepEqual(names("2026-02-17"), ["설날"]);
  assert.deepEqual(names("2026-05-01"), ["노동절"]);
  assert.deepEqual(names("2026-05-24"), ["부처님 오신 날"]);
  assert.deepEqual(names("2026-05-25"), ["부처님 오신 날 대체공휴일"]);
  assert.deepEqual(names("2026-06-03"), ["제9회 전국동시지방선거"]);
  assert.deepEqual(names("2026-07-17"), ["제헌절"]);
  assert.deepEqual(names("2026-08-17"), ["광복절 대체공휴일"]);
  assert.deepEqual(names("2026-09-25"), ["추석"]);
  assert.equal(names("2026-09-28").length, 0);
  assert.deepEqual(names("2026-10-05"), ["개천절 대체공휴일"]);
});
