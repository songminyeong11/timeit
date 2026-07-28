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

type StudyLog = {
  id: string;
  subjectId: string;
  startMinutes: number;
  durationMinutes: number;
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

const initialStudyLogs: StudyLog[] = [
  { id: "morning-korean", subjectId: "korean", startMinutes: 430, durationMinutes: 60 },
  { id: "math-core", subjectId: "math", startMinutes: 510, durationMinutes: 90 },
  { id: "english-words", subjectId: "english", startMinutes: 630, durationMinutes: 50 },
  { id: "math-review", subjectId: "math", startMinutes: 800, durationMinutes: 70 },
  { id: "ethics-note", subjectId: "society", startMinutes: 920, durationMinutes: 40 },
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
  const [studyLogs, setStudyLogs] = useState<StudyLog[]>(initialStudyLogs);
  const [sessionStartMinutes, setSessionStartMinutes] = useState<number | null>(null);
  const [pomodoroRemaining, setPomodoroRemaining] = useState(25 * 60);

  useEffect(() => {
    const savedTodos = window.localStorage.getItem("timeit-todos");
    const savedTheme = window.localStorage.getItem("timeit-theme");
    const savedLogs = window.localStorage.getItem("timeit-study-logs");
    if (savedTodos) setTodos(JSON.parse(savedTodos));
    if (savedTheme === "dark") setIsDark(true);
    if (savedLogs) setStudyLogs(JSON.parse(savedLogs));
  }, []);

  useEffect(() => {
    window.localStorage.setItem("timeit-todos", JSON.stringify(todos));
  }, [todos]);

  useEffect(() => {
    window.localStorage.setItem("timeit-theme", isDark ? "dark" : "light");
  }, [isDark]);

  useEffect(() => {
    window.localStorage.setItem("timeit-study-logs", JSON.stringify(studyLogs));
  }, [studyLogs]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (!isRunning) return;
    const interval = window.setInterval(() => {
      if (timerMode === "pomodoro") {
        setPomodoroRemaining((value) => Math.max(0, value - 1));
        if (pomodoroPhase === "집중") setSeconds((value) => value + 1);
        return;
      }
      setSeconds((value) => value + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isRunning, pomodoroPhase, timerMode]);

  useEffect(() => {
    if (!isRunning || timerMode !== "pomodoro" || pomodoroRemaining !== 0) return;
    const nextPhase = pomodoroPhase === "집중" ? "휴식" : "집중";
    setPomodoroPhase(nextPhase);
    setPomodoroRemaining(nextPhase === "집중" ? 25 * 60 : 5 * 60);
  }, [isRunning, pomodoroPhase, pomodoroRemaining, timerMode]);

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
  const liveSession = isRunning && sessionStartMinutes !== null && seconds > 0
    ? { id: "live-session", subjectId: selectedSubject, startMinutes: sessionStartMinutes, durationMinutes: Math.max(10, Math.ceil((seconds / 60) / 10) * 10) }
    : null;
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
    const gridDuration = Math.max(10, Math.ceil(recorded / 10) * 10);
    const now = new Date();
    const startMinutes = sessionStartMinutes ?? now.getHours() * 60 + now.getMinutes();
    setExtraMinutes((value) => value + recorded);
    setSubjects((items) => items.map((subject) => subject.id === selectedSubject ? { ...subject, minutes: subject.minutes + recorded } : subject));
    setStudyLogs((items) => [...items, { id: `session-${Date.now()}`, subjectId: selectedSubject, startMinutes, durationMinutes: gridDuration }]);
    setSavedSession(`${activeSubject.name} ${formatMinutes(recorded)} 기록됨`);
    setSeconds(0);
    setIsRunning(false);
    setSessionStartMinutes(null);
    setPomodoroRemaining(25 * 60);
  };

  const toggleTimer = () => {
    if (!isRunning && sessionStartMinutes === null) {
      const now = new Date();
      setSessionStartMinutes(now.getHours() * 60 + now.getMinutes());
      setSavedSession(null);
    }
    setIsRunning((value) => !value);
  };

  const chooseSubject = (subjectId: string) => {
    setSelectedSubject(subjectId);
    if (!isRunning) {
      const now = new Date();
      setSessionStartMinutes(now.getHours() * 60 + now.getMinutes());
      setIsRunning(true);
      setSavedSession(null);
    }
  };

  const changeTimerMode = (mode: "stopwatch" | "pomodoro") => {
    setIsRunning(false);
    setTimerMode(mode);
    setSeconds(0);
    setSessionStartMinutes(null);
    setPomodoroPhase("집중");
    setPomodoroRemaining(25 * 60);
  };

  const resetTimer = () => {
    setIsRunning(false);
    setSeconds(0);
    setSessionStartMinutes(null);
    setPomodoroPhase("집중");
    setPomodoroRemaining(25 * 60);
  };

  const goTimer = (subject = selectedSubject) => {
    setSelectedSubject(subject);
    setScreen("timer");
  };

  return (
    <main className={`app-shell ${isDark ? "dark" : ""} ${isRunning && screen === "timer" ? "focus-active" : ""}`}>
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
            <HomeScreen completion={completion} totalToday={totalToday} todos={todos} subjects={subjects} onTimer={goTimer} onNavigate={setScreen} />
          )}
          {screen === "planner" && (
            <PlannerScreen plannerMode={plannerMode} setPlannerMode={setPlannerMode} todos={todos} subjects={subjects} studyLogs={liveSession ? [...studyLogs, liveSession] : studyLogs} selectedSubject={selectedSubject} setSelectedSubject={setSelectedSubject} toggleTodo={toggleTodo} isAdding={isAdding} setIsAdding={setIsAdding} newTodo={newTodo} setNewTodo={setNewTodo} addTodo={addTodo} />
          )}
          {screen === "timer" && (
            <TimerScreen activeSubject={activeSubject} subjects={subjects} selectedSubject={selectedSubject} seconds={seconds} pomodoroRemaining={pomodoroRemaining} isRunning={isRunning} timerMode={timerMode} pomodoroPhase={pomodoroPhase} onChooseSubject={chooseSubject} onToggle={toggleTimer} onChangeMode={changeTimerMode} onChangePhase={() => { setPomodoroPhase((phase) => phase === "집중" ? "휴식" : "집중"); setPomodoroRemaining(pomodoroPhase === "집중" ? 5 * 60 : 25 * 60); }} onFinish={saveSession} onReset={resetTimer} savedSession={savedSession} />
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

function HomeScreen({ completion, totalToday, todos, subjects, onTimer, onNavigate }: { completion: number; totalToday: number; todos: Todo[]; subjects: Subject[]; onTimer: (subject?: string) => void; onNavigate: (screen: Screen) => void }) {
  const remainingTodos = todos.filter((todo) => !todo.done);
  const goalMinutes = 360;
  const goalPercent = Math.min(100, Math.round((totalToday / goalMinutes) * 100));
  return <section className="home-v2">
    <div className="home-date-row"><span>2026년 8월 1일 토요일</span><b>D-110</b></div>
    <section className="today-focus-card">
      <span>오늘 순공 시간</span>
      <strong>{formatDuration(totalToday * 60)}</strong>
      <div className="today-goal-line"><span>오늘 목표 06:00:00</span><b>{goalPercent}%</b></div>
      <div className="today-progress"><i style={{ width: `${goalPercent}%` }} /></div>
      <button onClick={() => onTimer()}><span>▶</span> 타이머 시작하기</button>
    </section>
    <section className="home-section home-subject-overview">
      <div className="home-section-header"><div><span className="section-kicker">SUBJECTS</span><h2>과목별 순공 시간</h2></div><button onClick={() => onNavigate("stats")}>통계 보기 →</button></div>
      <div className="home-subject-list">{subjects.map((subject) => {
        const percent = Math.min(100, Math.round((subject.minutes / subject.target) * 100));
        return <button key={subject.id} className="home-subject-row" onClick={() => onTimer(subject.id)}><span className="home-subject-dot" style={{ background: subject.color }} /><span className="home-subject-name"><b>{subject.name}</b><small>목표 {formatMinutes(subject.target)}</small></span><span className="home-subject-time"><strong>{formatMinutes(subject.minutes)}</strong><i><em style={{ width: `${percent}%`, background: subject.color }} /></i></span><span className="home-subject-play">▶</span></button>;
      })}</div>
    </section>
    <section className="home-section home-todo-overview">
      <div className="home-section-header"><div><span className="section-kicker">TODAY&apos;S PLAN</span><h2>오늘의 할 일 <b>{completion}%</b></h2></div><button onClick={() => onNavigate("planner")}>플래너 →</button></div>
      <div className="home-todo-list">{remainingTodos.slice(0, 3).map((todo) => { const subject = subjects.find((item) => item.id === todo.subject)!; return <button onClick={() => onNavigate("planner")} key={todo.id}><i style={{ borderColor: subject.color }} /><span>{todo.text}</span><small>{subject.name}</small></button>; })}</div>
      {remainingTodos.length > 3 && <p className="home-todo-more">할 일 {remainingTodos.length - 3}개가 더 있어요</p>}
    </section>
  </section>;
}

function PlannerScreen({ plannerMode, setPlannerMode, todos, subjects, studyLogs, selectedSubject, setSelectedSubject, toggleTodo, isAdding, setIsAdding, newTodo, setNewTodo, addTodo }: { plannerMode: PlannerMode; setPlannerMode: (value: PlannerMode) => void; todos: Todo[]; subjects: Subject[]; studyLogs: StudyLog[]; selectedSubject: string; setSelectedSubject: (value: string) => void; toggleTodo: (id: number) => void; isAdding: boolean; setIsAdding: (value: boolean) => void; newTodo: string; setNewTodo: (value: string) => void; addTodo: () => void }) {
  return <>
    <section className="screen-intro planner-intro"><span className="section-kicker">PLAN YOUR DAY</span><h1>공부가 쌓이는<br /><em>나만의 페이지.</em></h1></section>
    <div className="segmented-control" role="tablist">
      {(["daily", "weekly", "monthly"] as PlannerMode[]).map((mode) => <button key={mode} className={plannerMode === mode ? "selected" : ""} onClick={() => setPlannerMode(mode)}>{mode === "daily" ? "일간" : mode === "weekly" ? "주간" : "월간"}</button>)}
    </div>
    {plannerMode === "daily" && <DailyPlanner todos={todos} subjects={subjects} studyLogs={studyLogs} selectedSubject={selectedSubject} setSelectedSubject={setSelectedSubject} toggleTodo={toggleTodo} isAdding={isAdding} setIsAdding={setIsAdding} newTodo={newTodo} setNewTodo={setNewTodo} addTodo={addTodo} />}
    {plannerMode === "weekly" && <WeeklyPlanner />}
    {plannerMode === "monthly" && <MonthlyPlanner />}
  </>;
}

function DailyPlanner({ todos, subjects, studyLogs, selectedSubject, setSelectedSubject, toggleTodo, isAdding, setIsAdding, newTodo, setNewTodo, addTodo }: { todos: Todo[]; subjects: Subject[]; studyLogs: StudyLog[]; selectedSubject: string; setSelectedSubject: (value: string) => void; toggleTodo: (id: number) => void; isAdding: boolean; setIsAdding: (value: boolean) => void; newTodo: string; setNewTodo: (value: string) => void; addTodo: () => void }) {
  return <>
    <section className="date-strip"><button>‹</button><div><span>2026년 8월</span><strong>1 <small>토</small></strong></div><button>›</button></section>
    <section className="planner-card todo-card">
      <div className="planner-card-header"><div><span className="section-kicker">MY TO-DO</span><h2>오늘 꼭 해낼 것</h2></div><span className="count-pill">{todos.filter((todo) => todo.done).length}/{todos.length}</span></div>
      <div className="todo-list">
        {todos.map((todo) => { const subject = subjects.find((item) => item.id === todo.subject)!; return <button className={`todo-row ${todo.done ? "completed" : ""}`} key={todo.id} onClick={() => toggleTodo(todo.id)}><span className="check-box">✓</span><span className="todo-color" style={{ background: subject.color }} /><span className="todo-copy"><b>{todo.text}</b><small>{subject.name} · {todo.due}</small></span>{todo.priority && <span className="priority">중요</span>}</button>; })}
      </div>
      {isAdding ? <div className="add-todo"><select value={selectedSubject} onChange={(event) => setSelectedSubject(event.target.value)}>{subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}</select><input autoFocus value={newTodo} onChange={(event) => setNewTodo(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addTodo(); }} placeholder="예: 수능특강 2강 풀기" /><button onClick={addTodo}>추가</button></div> : <button className="add-line" onClick={() => setIsAdding(true)}>＋ 오늘의 할 일 추가</button>}
    </section>
    <TimelineGrid subjects={subjects} studyLogs={studyLogs} />
  </>;
}

function TimelineGrid({ subjects, studyLogs }: { subjects: Subject[]; studyLogs: StudyLog[] }) {
  const slots = Array.from({ length: 144 }, (_, index) => index);
  const hours = Array.from({ length: 24 }, (_, index) => index);
  const slotLog = (slot: number) => studyLogs.find((log) => {
    const minute = slot * 10;
    return minute >= log.startMinutes && minute < log.startMinutes + log.durationMinutes;
  });

  return <section className="planner-card timetable-card">
    <div className="planner-card-header timetable-heading">
      <div><span className="section-kicker">STUDY TIMELINE</span><h2>24시간 타임테이블</h2></div>
      <span className="ten-minutes">10분 단위</span>
    </div>
    <div className="timeline-legend">{subjects.map((subject) => <span key={subject.id}><i style={{ background: subject.color }} />{subject.name}</span>)}</div>
    <p className="timetable-helper">타이머 기록이 과목 색상의 형광펜 칸으로 채워져요.</p>
    <div className="time-table-scroll" aria-label="24시간 10분 단위 학습 시간표">
      <div className="time-table">
        <div className="time-axis">{hours.map((hour) => <span key={hour}>{String(hour).padStart(2, "0")}:00</span>)}</div>
        <div className="time-slots">
          {slots.map((slot) => {
            const log = slotLog(slot);
            const subject = log ? subjects.find((item) => item.id === log.subjectId) : undefined;
            const isStart = log && slot * 10 === log.startMinutes;
            const isEnd = log && slot * 10 + 10 >= log.startMinutes + log.durationMinutes;
            return <span key={slot} title={subject ? `${subject.name} · ${String(Math.floor(slot / 6)).padStart(2, "0")}:${String((slot % 6) * 10).padStart(2, "0")}` : ""} className={`time-slot ${subject ? "filled" : ""} ${isStart ? "slot-start" : ""} ${isEnd ? "slot-end" : ""} ${log?.id === "live-session" ? "live" : ""}`} style={subject ? { "--highlight": subject.color } as React.CSSProperties : undefined}>{isStart ? subject?.short : ""}</span>;
          })}
        </div>
      </div>
    </div>
    <div className="timetable-footer"><span><i /> 기록됨</span><span>아래로 스크롤해 24시간 전체를 확인하세요</span></div>
  </section>;
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

function TimerScreen({ activeSubject, subjects, selectedSubject, seconds, pomodoroRemaining, isRunning, timerMode, pomodoroPhase, onChooseSubject, onToggle, onChangeMode, onChangePhase, onFinish, onReset, savedSession }: { activeSubject: Subject; subjects: Subject[]; selectedSubject: string; seconds: number; pomodoroRemaining: number; isRunning: boolean; timerMode: "stopwatch" | "pomodoro"; pomodoroPhase: "집중" | "휴식"; onChooseSubject: (id: string) => void; onToggle: () => void; onChangeMode: (mode: "stopwatch" | "pomodoro") => void; onChangePhase: () => void; onFinish: () => void; onReset: () => void; savedSession: string | null }) {
  const displayTime = timerMode === "pomodoro"
    ? `${String(Math.floor(pomodoroRemaining / 60)).padStart(2, "0")}:${String(pomodoroRemaining % 60).padStart(2, "0")}`
    : formatDuration(seconds);

  return <section className={`timer-page timer-v2 ${isRunning ? "running" : ""}`} style={{ "--subject": activeSubject.color, "--subject-soft": activeSubject.soft } as React.CSSProperties}>
    <div className="timer-status-bar"><span>오늘 순공 <b>04:58</b></span><span className="timer-date">8월 1일 토요일</span><span className="timer-dday">D-110</span></div>
    <div className="timer-mode-row" role="tablist"><button className={timerMode === "stopwatch" ? "selected" : ""} onClick={() => onChangeMode("stopwatch")}>스톱워치</button><button className={timerMode === "pomodoro" ? "selected" : ""} onClick={() => onChangeMode("pomodoro")}>뽀모도로</button></div>
    <section className="focus-console">
      <div className="focus-subject"><span style={{ background: activeSubject.color }}>{activeSubject.short}</span><div><small>{timerMode === "pomodoro" ? `${pomodoroPhase} 세션` : "현재 과목"}</small><strong>{activeSubject.name}</strong></div><i className={isRunning ? "signal on" : "signal"} /></div>
      <div className="focus-time"><span>{timerMode === "pomodoro" ? (pomodoroPhase === "집중" ? "집중 남은 시간" : "휴식 남은 시간") : "공부 시간"}</span><strong>{displayTime}</strong><small>{isRunning ? "측정 중" : seconds ? "일시 정지" : "과목을 선택해 시작하세요"}</small></div>
      <div className="focus-controls"><button className="timer-reset" onClick={onReset} aria-label="타이머 초기화">↺</button><button className="timer-main" onClick={onToggle}>{isRunning ? "일시정지" : "집중 시작"}<b>{isRunning ? "Ⅱ" : "▶"}</b></button><button className="timer-complete" onClick={onFinish} disabled={!seconds}>완료</button></div>
      {timerMode === "pomodoro" && <button className="pomodoro-rule" onClick={onChangePhase}><span>{pomodoroPhase === "집중" ? "25분 집중 중" : "5분 휴식 중"}</span><b>{pomodoroPhase === "집중" ? "휴식으로 전환" : "집중으로 전환"} →</b></button>}
    </section>
    <section className="subject-timer-list"><div className="subject-list-heading"><div><span className="section-kicker">SUBJECT TIMER</span><h2>과목별 집중 시간</h2></div><span>과목을 눌러 시작</span></div>{subjects.map((subject) => { const isActive = subject.id === selectedSubject; const shownSeconds = isActive ? subject.minutes * 60 + seconds : subject.minutes * 60; return <button key={subject.id} className={`subject-timer-row ${isActive ? "active" : ""}`} onClick={() => onChooseSubject(subject.id)}><span className="subject-token" style={{ background: subject.soft, color: subject.color }}>{subject.short}</span><span className="subject-timer-name"><b>{subject.name}</b><small>{isActive && isRunning ? "현재 측정 중" : `${formatMinutes(subject.target)} 목표`}</small></span><strong>{formatDuration(shownSeconds)}</strong><span className="subject-play">{isActive && isRunning ? "Ⅱ" : "▶"}</span></button>; })}</section>
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
