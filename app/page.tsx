"use client";

import { useEffect, useMemo, useState } from "react";

type Screen = "home" | "planner" | "timer" | "stats" | "settings";
type PlannerMode = "daily" | "weekly" | "monthly";

type Subject = {
  id: string;
  name: string;
  short: string;
  color: string;
  soft: string;
  minutes: number;
  target: number;
};

type Todo = {
  id: number;
  subject: string;
  text: string;
  due: string;
  done: boolean;
  priority?: boolean;
};

const initialSubjects: Subject[] = [
  { id: "korean", name: "국어", short: "국", color: "#e68d87", soft: "#f9e3e0", minutes: 82, target: 120 },
  { id: "math", name: "수학", short: "수", color: "#718fb8", soft: "#e1e9f5", minutes: 124, target: 150 },
  { id: "english", name: "영어", short: "영", color: "#78ad95", soft: "#e1f0e8", minutes: 54, target: 90 },
  { id: "society", name: "생활과 윤리", short: "윤", color: "#c394ac", soft: "#f3e4eb", minutes: 38, target: 60 },
];

const initialTodos: Todo[] = [
  { id: 1, subject: "math", text: "미적분 4점 기출 20문제", due: "오늘", done: false, priority: true },
  { id: 2, subject: "korean", text: "문학 EBS 연계 작품 정리", due: "오늘", done: true },
  { id: 3, subject: "english", text: "영단어 Day 17 복습", due: "오늘", done: false },
  { id: 4, subject: "society", text: "사회계약론 오답 노트", due: "D-2", done: false },
];

const week = [
  ["월", "28", 76],
  ["화", "29", 116],
  ["수", "30", 164],
  ["목", "31", 128],
  ["금", "1", 298],
  ["토", "2", 214],
  ["일", "3", 0],
];

const grassValues = [0, 1, 2, 1, 3, 2, 4, 1, 0, 2, 3, 1, 2, 4, 4, 3, 1, 0, 2, 3, 2, 4, 1, 2, 4, 3, 2, 0, 1, 3, 4, 2, 2, 4, 1];

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}시간 ${String(rest).padStart(2, "0")}분` : `${rest}분`;
}

function Icon({ children }: { children: string }) {
  return <span className="icon" aria-hidden="true">{children}</span>;
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("home");
  const [plannerMode, setPlannerMode] = useState<PlannerMode>("daily");
  const [subjects, setSubjects] = useState<Subject[]>(initialSubjects);
  const [todos, setTodos] = useState<Todo[]>(initialTodos);
  const [selectedSubject, setSelectedSubject] = useState("math");
  const [isRunning, setIsRunning] = useState(false);
  const [timerMode, setTimerMode] = useState<"stopwatch" | "pomodoro">("stopwatch");
  const [pomodoroPhase, setPomodoroPhase] = useState<"집중" | "휴식">("집중");
  const [seconds, setSeconds] = useState(0);
  const [isDark, setIsDark] = useState(false);
  const [newTodo, setNewTodo] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [savedSession, setSavedSession] = useState<string | null>(null);
  const [extraMinutes, setExtraMinutes] = useState(0);

  useEffect(() => {
    const savedTodos = window.localStorage.getItem("timeit-todos");
    const savedTheme = window.localStorage.getItem("timeit-theme");
    if (savedTodos) setTodos(JSON.parse(savedTodos));
    if (savedTheme === "dark") setIsDark(true);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("timeit-todos", JSON.stringify(todos));
  }, [todos]);

  useEffect(() => {
    window.localStorage.setItem("timeit-theme", isDark ? "dark" : "light");
  }, [isDark]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (!isRunning) return;
    const interval = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [isRunning]);

  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const wakeLock = (navigator as Navigator & { wakeLock?: { request: (kind: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    if (isRunning && wakeLock) {
      wakeLock.request("screen").then((result) => { lock = result; }).catch(() => undefined);
    }
    return () => { if (lock) void lock.release(); };
  }, [isRunning]);

  const activeSubject = subjects.find((subject) => subject.id === selectedSubject) ?? subjects[0];
  const completedCount = todos.filter((todo) => todo.done).length;
  const completion = Math.round((completedCount / todos.length) * 100);
  const totalToday = 298 + extraMinutes + Math.floor(seconds / 60);
  const donutStyle = useMemo(() => {
    const total = subjects.reduce((sum, subject) => sum + subject.minutes, 0);
    let point = 0;
    return `conic-gradient(${subjects.map((subject) => {
      const next = point + (subject.minutes / total) * 100;
      const item = `${subject.color} ${point.toFixed(1)}% ${next.toFixed(1)}%`;
      point = next;
      return item;
    }).join(", ")})`;
  }, [subjects]);

  const toggleTodo = (id: number) => {
    setTodos((items) => items.map((todo) => todo.id === id ? { ...todo, done: !todo.done } : todo));
  };

  const addTodo = () => {
    if (!newTodo.trim()) return;
    setTodos((items) => [...items, { id: Date.now(), subject: selectedSubject, text: newTodo.trim(), due: "오늘", done: false }]);
    setNewTodo("");
    setIsAdding(false);
  };

  const saveSession = () => {
    if (!seconds) return;
    const recorded = Math.max(1, Math.floor(seconds / 60));
    setExtraMinutes((value) => value + recorded);
    setSubjects((items) => items.map((subject) => subject.id === selectedSubject ? { ...subject, minutes: subject.minutes + recorded } : subject));
    setSavedSession(`${activeSubject.name} ${formatMinutes(recorded)} 기록됨`);
    setSeconds(0);
    setIsRunning(false);
  };

  const goTimer = (subject = selectedSubject) => {
    setSelectedSubject(subject);
    setScreen("timer");
  };

  return (
    <main className={`app-shell ${isDark ? "dark" : ""}`}>
      <section className="phone-frame">
        <header className="topbar">
          <button className="avatar" aria-label="프로필">서</button>
          <div className="brand">timeit<span>°</span></div>
          <button className="round-control" onClick={() => setIsDark((value) => !value)} aria-label="테마 전환">
            <Icon>{isDark ? "☀" : "☾"}</Icon>
          </button>
        </header>

        <div className="content-scroll">
          {screen === "home" && (
            <HomeScreen completion={completion} totalToday={totalToday} todos={todos} subjects={subjects} onTimer={() => goTimer()} onNavigate={setScreen} />
          )}
          {screen === "planner" && (
            <PlannerScreen plannerMode={plannerMode} setPlannerMode={setPlannerMode} todos={todos} subjects={subjects} selectedSubject={selectedSubject} setSelectedSubject={setSelectedSubject} toggleTodo={toggleTodo} isAdding={isAdding} setIsAdding={setIsAdding} newTodo={newTodo} setNewTodo={setNewTodo} addTodo={addTodo} />
          )}
          {screen === "timer" && (
            <TimerScreen activeSubject={activeSubject} subjects={subjects} selectedSubject={selectedSubject} setSelectedSubject={setSelectedSubject} seconds={seconds} setSeconds={setSeconds} isRunning={isRunning} setIsRunning={setIsRunning} timerMode={timerMode} setTimerMode={setTimerMode} pomodoroPhase={pomodoroPhase} setPomodoroPhase={setPomodoroPhase} onFinish={saveSession} savedSession={savedSession} />
          )}
          {screen === "stats" && <StatsScreen subjects={subjects} totalToday={totalToday} donutStyle={donutStyle} />}
          {screen === "settings" && <SettingsScreen subjects={subjects} isDark={isDark} setIsDark={setIsDark} />}
        </div>

        <nav className="bottom-nav" aria-label="주요 메뉴">
          {[
            ["home", "⌂", "홈"],
            ["planner", "▤", "플래너"],
            ["timer", "◷", "타이머"],
            ["stats", "◔", "통계"],
            ["settings", "⚙", "설정"],
          ].map(([id, icon, label]) => (
            <button key={id} className={`nav-item ${screen === id ? "active" : ""}`} onClick={() => setScreen(id as Screen)} aria-current={screen === id ? "page" : undefined}>
              <Icon>{icon}</Icon><span>{label}</span>
            </button>
          ))}
        </nav>
      </section>
    </main>
  );
}

function HomeScreen({ completion, totalToday, todos, subjects, onTimer, onNavigate }: { completion: number; totalToday: number; todos: Todo[]; subjects: Subject[]; onTimer: () => void; onNavigate: (screen: Screen) => void }) {
  return <>
    <section className="hero-card">
      <div className="hero-topline"><span>2026. 08. 01 · 토요일</span><span className="weather">맑음 27°</span></div>
      <p className="eyebrow">수능까지 <strong>D-110</strong></p>
      <h1>오늘 한 걸음이<br />내일의 나를 바꿔.</h1>
      <div className="hero-decor decor-one" /><div className="hero-decor decor-two" />
    </section>

    <section className="summary-grid">
      <article className="summary-card progress-card">
        <div className="card-heading"><span>오늘의 목표</span><b>{completion}%</b></div>
        <div className="progress-ring" style={{ "--progress": `${completion * 3.6}deg` } as React.CSSProperties}><span>{todos.filter((todo) => todo.done).length}<small>/{todos.length}</small></span></div>
        <p>할 일 {todos.filter((todo) => !todo.done).length}개 남았어요</p>
      </article>
      <article className="summary-card time-card">
        <div className="card-heading"><span>오늘 집중</span><button onClick={() => onNavigate("stats")}>자세히 ›</button></div>
        <strong>{formatMinutes(totalToday)}</strong>
        <div className="mini-bars"><i style={{ height: "38%" }} /><i style={{ height: "62%" }} /><i style={{ height: "84%" }} /><i className="today-bar" style={{ height: "95%" }} /><i style={{ height: "56%" }} /><i style={{ height: "28%" }} /></div>
      </article>
    </section>

    <section className="section-block home-tasks">
      <div className="section-heading"><div><span className="section-kicker">TODAY&apos;S FOCUS</span><h2>오늘의 할 일</h2></div><button onClick={() => onNavigate("planner")}>전체 보기 <b>→</b></button></div>
      <div className="compact-task-list">
        {todos.slice(0, 3).map((todo) => { const subject = subjects.find((item) => item.id === todo.subject)!; return <div className="compact-task" key={todo.id}><span className="subject-dot" style={{ background: subject.color }} /><div><strong>{todo.text}</strong><span>{subject.name} · {todo.due}</span></div>{todo.done && <span className="done-mark">✓</span>}</div>; })}
      </div>
    </section>

    <button className="quick-start" onClick={onTimer}><span className="play-button">▶</span><span><small>지금 바로</small>집중 시작하기</span><b>→</b></button>
  </>;
}

function PlannerScreen({ plannerMode, setPlannerMode, todos, subjects, selectedSubject, setSelectedSubject, toggleTodo, isAdding, setIsAdding, newTodo, setNewTodo, addTodo }: { plannerMode: PlannerMode; setPlannerMode: (value: PlannerMode) => void; todos: Todo[]; subjects: Subject[]; selectedSubject: string; setSelectedSubject: (value: string) => void; toggleTodo: (id: number) => void; isAdding: boolean; setIsAdding: (value: boolean) => void; newTodo: string; setNewTodo: (value: string) => void; addTodo: () => void }) {
  return <>
    <section className="screen-intro planner-intro"><span className="section-kicker">PLAN YOUR DAY</span><h1>공부가 쌓이는<br /><em>나만의 페이지.</em></h1></section>
    <div className="segmented-control" role="tablist">
      {(["daily", "weekly", "monthly"] as PlannerMode[]).map((mode) => <button key={mode} className={plannerMode === mode ? "selected" : ""} onClick={() => setPlannerMode(mode)}>{mode === "daily" ? "일간" : mode === "weekly" ? "주간" : "월간"}</button>)}
    </div>
    {plannerMode === "daily" && <DailyPlanner todos={todos} subjects={subjects} selectedSubject={selectedSubject} setSelectedSubject={setSelectedSubject} toggleTodo={toggleTodo} isAdding={isAdding} setIsAdding={setIsAdding} newTodo={newTodo} setNewTodo={setNewTodo} addTodo={addTodo} />}
    {plannerMode === "weekly" && <WeeklyPlanner />}
    {plannerMode === "monthly" && <MonthlyPlanner />}
  </>;
}

function DailyPlanner({ todos, subjects, selectedSubject, setSelectedSubject, toggleTodo, isAdding, setIsAdding, newTodo, setNewTodo, addTodo }: { todos: Todo[]; subjects: Subject[]; selectedSubject: string; setSelectedSubject: (value: string) => void; toggleTodo: (id: number) => void; isAdding: boolean; setIsAdding: (value: boolean) => void; newTodo: string; setNewTodo: (value: string) => void; addTodo: () => void }) {
  return <>
    <section className="date-strip"><button>‹</button><div><span>2026년 8월</span><strong>1 <small>토</small></strong></div><button>›</button></section>
    <section className="planner-card todo-card">
      <div className="planner-card-header"><div><span className="section-kicker">MY TO-DO</span><h2>오늘 꼭 해낼 것</h2></div><span className="count-pill">{todos.filter((todo) => todo.done).length}/{todos.length}</span></div>
      <div className="todo-list">
        {todos.map((todo) => { const subject = subjects.find((item) => item.id === todo.subject)!; return <button className={`todo-row ${todo.done ? "completed" : ""}`} key={todo.id} onClick={() => toggleTodo(todo.id)}><span className="check-box">✓</span><span className="todo-color" style={{ background: subject.color }} /><span className="todo-copy"><b>{todo.text}</b><small>{subject.name} · {todo.due}</small></span>{todo.priority && <span className="priority">중요</span>}</button>; })}
      </div>
      {isAdding ? <div className="add-todo"><select value={selectedSubject} onChange={(event) => setSelectedSubject(event.target.value)}>{subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}</select><input autoFocus value={newTodo} onChange={(event) => setNewTodo(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addTodo(); }} placeholder="예: 수능특강 2강 풀기" /><button onClick={addTodo}>추가</button></div> : <button className="add-line" onClick={() => setIsAdding(true)}>＋ 오늘의 할 일 추가</button>}
    </section>
    <section className="planner-card timeline-card">
      <div className="planner-card-header"><div><span className="section-kicker">TIMELINE</span><h2>나의 타임테이블</h2></div><span className="ten-minutes">10 min grid</span></div>
      <div className="timeline-legend">{subjects.map((subject) => <span key={subject.id}><i style={{ background: subject.color }} />{subject.name}</span>)}</div>
      <div className="timeline">
        <div className="time-labels"><span>08</span><span>09</span><span>10</span><span>11</span><span>12</span><span>13</span><span>14</span><span>15</span></div>
        <div className="time-grid">
          <div className="study-block math-block"><b>수학</b><small>08:10 — 09:50</small></div>
          <div className="study-block korean-block"><b>국어</b><small>10:20 — 11:30</small></div>
          <div className="study-block english-block"><b>영단어</b><small>13:20 — 14:10</small></div>
        </div>
      </div>
      <p className="timeline-note"><span>✦</span> 타이머 기록은 10분 단위로 자동 반영돼요.</p>
    </section>
  </>;
}

function WeeklyPlanner() {
  return <section className="weekly-panel">
    <article className="week-goal-card"><span className="section-kicker">WEEKLY GOAL</span><h2>이번 주 25시간</h2><p>지금까지 <b>16시간 36분</b> 집중했어요.</p><div className="goal-progress"><i style={{ width: "66%" }} /></div><small>66% 달성 · 어제보다 42분 더 집중</small></article>
    <article className="weekly-chart-card"><div className="planner-card-header"><div><span className="section-kicker">STUDY RHYTHM</span><h2>요일별 집중 시간</h2></div><b>16h 36m</b></div><div className="weekly-bars">{week.map(([day, date, value]) => <div className={day === "금" ? "today" : ""} key={day}><div className="bar-track"><i style={{ height: `${Math.max(Number(value) / 3.4, 2)}%` }} /></div><span>{day}</span><small>{date}</small></div>)}</div></article>
    <section className="week-promise"><span>이번 주 약속</span><strong>수학 킬러 3점, 더 이상 미루지 않기</strong><b>✦</b></section>
  </section>;
}

function MonthlyPlanner() {
  const days = Array.from({ length: 31 }, (_, index) => index + 1);
  return <section className="month-panel"><article className="monthly-summary"><div><span className="section-kicker">AUGUST</span><h2>8월의 기록</h2></div><div><b>21</b><span>집중한 날</span></div></article><div className="calendar-head">{["일", "월", "화", "수", "목", "금", "토"].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{Array.from({ length: 5 }).map((_, index) => <i key={`blank-${index}`} />)}{days.map((day) => <button key={day} className={`${day === 1 ? "today-date" : ""} ${[2, 3, 7, 8, 11, 12, 13, 14, 17, 18, 20, 22, 23, 24, 26, 28, 29, 30].includes(day) ? "studied" : ""}`}><span>{day}</span>{[2, 7, 11, 18, 22, 29].includes(day) && <b>{day === 22 ? "✦" : "●"}</b>}</button>)}</div><article className="month-message"><span>8월 스티커</span><strong>꾸준히 해온 나를 칭찬해요</strong><b>🌿</b></article></section>;
}

function TimerScreen({ activeSubject, subjects, selectedSubject, setSelectedSubject, seconds, setSeconds, isRunning, setIsRunning, timerMode, setTimerMode, pomodoroPhase, setPomodoroPhase, onFinish, savedSession }: { activeSubject: Subject; subjects: Subject[]; selectedSubject: string; setSelectedSubject: (value: string) => void; seconds: number; setSeconds: (value: number) => void; isRunning: boolean; setIsRunning: (value: boolean) => void; timerMode: "stopwatch" | "pomodoro"; setTimerMode: (value: "stopwatch" | "pomodoro") => void; pomodoroPhase: "집중" | "휴식"; setPomodoroPhase: (value: "집중" | "휴식") => void; onFinish: () => void; savedSession: string | null }) {
  return <section className={`timer-page ${isRunning ? "running" : ""}`} style={{ "--subject": activeSubject.color, "--subject-soft": activeSubject.soft } as React.CSSProperties}>
    <div className="timer-heading"><span className="section-kicker">FOCUS MODE</span><button className="wake-status"><i /> 화면 켜짐 유지</button></div>
    <h1>지금은 <em>{activeSubject.name}</em><br />만 생각해요.</h1>
    <div className="timer-modes"><button className={timerMode === "stopwatch" ? "selected" : ""} onClick={() => setTimerMode("stopwatch")}>스톱워치</button><button className={timerMode === "pomodoro" ? "selected" : ""} onClick={() => setTimerMode("pomodoro")}>뽀모도로</button></div>
    <div className="subject-picker">{subjects.map((subject) => <button key={subject.id} onClick={() => setSelectedSubject(subject.id)} className={selectedSubject === subject.id ? "picked" : ""} style={{ "--color": subject.color, "--soft": subject.soft } as React.CSSProperties}><span>{subject.short}</span>{subject.name}</button>)}</div>
    <div className="timer-orbit"><div className="orbit-one" /><div className="orbit-two" /><div className="timer-center"><span>{timerMode === "pomodoro" ? pomodoroPhase : "집중 시간"}</span><strong>{timerMode === "pomodoro" && pomodoroPhase === "휴식" ? "05:00" : formatDuration(seconds)}</strong><small>{isRunning ? "집중을 이어가고 있어요" : seconds ? "잠시 멈춰 있어요" : "시작할 준비가 됐어요"}</small></div></div>
    {timerMode === "pomodoro" && <button className="phase-switch" onClick={() => setPomodoroPhase(pomodoroPhase === "집중" ? "휴식" : "집중")}>25분 집중 · 5분 휴식 <b>↗</b></button>}
    <div className="timer-actions"><button className="finish-session" onClick={onFinish} disabled={!seconds}>기록 완료</button><button className="main-timer-button" onClick={() => setIsRunning(!isRunning)}>{isRunning ? "Ⅱ" : "▶"}</button><button className="reset-session" onClick={() => { setIsRunning(false); setSeconds(0); }}>↺</button></div>
    {savedSession && <div className="saved-toast">✓ {savedSession}</div>}
  </section>;
}

function StatsScreen({ subjects, totalToday, donutStyle }: { subjects: Subject[]; totalToday: number; donutStyle: string }) {
  const total = subjects.reduce((sum, subject) => sum + subject.minutes, 0);
  return <section className="stats-page"><div className="screen-intro"><span className="section-kicker">STUDY INSIGHTS</span><h1>쌓인 시간을<br /><em>눈으로 확인해요.</em></h1></div><article className="stats-highlight"><span>이번 주 총 집중</span><strong>16시간 <em>36분</em></strong><p>지난주보다 <b>2시간 14분</b> 더 해냈어요 <span>↗</span></p></article><article className="analytics-card"><div className="planner-card-header"><div><span className="section-kicker">SUBJECT BALANCE</span><h2>과목별 집중 비율</h2></div><button>이번 주⌄</button></div><div className="donut-layout"><div className="donut" style={{ background: donutStyle }}><div><b>{formatMinutes(total)}</b><small>누적 공부</small></div></div><div className="donut-legend">{subjects.map((subject) => <span key={subject.id}><i style={{ background: subject.color }} />{subject.name}<b>{Math.round((subject.minutes / total) * 100)}%</b></span>)}</div></div></article><article className="analytics-card"><div className="planner-card-header"><div><span className="section-kicker">WEEKLY FLOW</span><h2>이번 주 학습 리듬</h2></div><b className="soft-strong">{formatMinutes(totalToday)}</b></div><div className="stats-bars">{week.map(([day, , value]) => <div key={day}><i style={{ height: `${Math.max(Number(value) / 3.2, 3)}%` }} /><span>{day}</span></div>)}</div></article><article className="analytics-card grass-card"><div className="planner-card-header"><div><span className="section-kicker">STUDY GARDEN</span><h2>공부 잔디</h2></div><span className="garden-total">이번 달 21일</span></div><div className="grass-grid">{grassValues.map((value, index) => <i className={`grass-${value}`} key={index} />)}</div><div className="grass-legend"><span>적게</span><i className="grass-0" /><i className="grass-1" /><i className="grass-2" /><i className="grass-4" /><span>많이</span></div></article></section>;
}

function SettingsScreen({ subjects, isDark, setIsDark }: { subjects: Subject[]; isDark: boolean; setIsDark: (value: boolean) => void }) {
  return <section className="settings-page"><div className="screen-intro"><span className="section-kicker">MY SPACE</span><h1>내 공부의 결을<br /><em>정리하는 곳.</em></h1></div><article className="profile-card"><div className="large-avatar">서</div><div><h2>서윤의 타임잇</h2><p>오늘도 작은 집중을 모으는 중</p></div><button>편집</button></article><section className="settings-group"><span>과목 관리</span>{subjects.map((subject) => <button key={subject.id}><i style={{ background: subject.color }} /><b>{subject.name}</b><small>목표 {formatMinutes(subject.target)}</small><strong>›</strong></button>)}</section><section className="settings-group"><span>화면 설정</span><button onClick={() => setIsDark(!isDark)}><i className="theme-icon">{isDark ? "☾" : "☀"}</i><b>다크 모드</b><span className={`toggle ${isDark ? "on" : ""}`}><i /></span></button><button><i className="theme-icon">♢</i><b>플래너 테마</b><small>밀크티 베이지</small><strong>›</strong></button></section><section className="settings-group"><span>데이터</span><button><i className="theme-icon">⇧</i><b>내 기록 백업하기</b><strong>›</strong></button></section></section>;
}
