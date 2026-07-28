"use client";

import { useEffect, useState } from "react";

type Screen = "home" | "planner" | "timer" | "stats" | "settings";

type Subject = {
  id: string;
  name: string;
  short: string;
  color: string;
  soft: string;
  minutes: number;
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
  trackedMinutes?: number;
  recordedAt?: string;
};

type PlannerTheme = "milk" | "lavender" | "sage";

const initialSubjects: Subject[] = [
  { id: "focus", name: "공부", short: "공", color: "#8d9bc4", soft: "#e5eaf5", minutes: 0 },
];

const initialTodos: Todo[] = [];
const initialStudyLogs: StudyLog[] = [];

function grassLevel(hours: number) {
  if (hours === 0) return 0;
  if (hours < 2) return 1;
  if (hours < 3.5) return 2;
  if (hours < 5) return 3;
  return 4;
}

function displayHours(hours: number) {
  return hours === 0 ? "—" : `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
}

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

function todayLabel(date = new Date()) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 ${weekdays[date.getDay()]}요일`;
}

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

function clockFromMinutes(minutes: number) {
  const safeMinutes = Math.max(0, Math.min(1430, minutes));
  return `${String(Math.floor(safeMinutes / 60)).padStart(2, "0")}:${String(safeMinutes % 60).padStart(2, "0")}`;
}

function minutesFromClock(value: string) {
  const [hour = "0", minute = "0"] = value.split(":");
  return Math.max(0, Math.min(1430, Number(hour) * 60 + Number(minute)));
}

function loggedMinutes(log: StudyLog) {
  return log.trackedMinutes ?? log.durationMinutes;
}

function Icon({ children }: { children: string }) {
  return <span className="icon" aria-hidden="true">{children}</span>;
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("home");
  const [subjects, setSubjects] = useState<Subject[]>(initialSubjects);
  const [todos, setTodos] = useState<Todo[]>(initialTodos);
  const [selectedSubject, setSelectedSubject] = useState("focus");
  const [isRunning, setIsRunning] = useState(false);
  const [timerMode, setTimerMode] = useState<"stopwatch" | "pomodoro">("stopwatch");
  const [pomodoroPhase, setPomodoroPhase] = useState<"집중" | "휴식">("집중");
  const [seconds, setSeconds] = useState(0);
  const [isDark, setIsDark] = useState(false);
  const [newTodo, setNewTodo] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [savedSession, setSavedSession] = useState<string | null>(null);
  const [studyLogs, setStudyLogs] = useState<StudyLog[]>(initialStudyLogs);
  const [sessionStartMinutes, setSessionStartMinutes] = useState<number | null>(null);
  const [pomodoroRemaining, setPomodoroRemaining] = useState(25 * 60);
  const [plannerTheme, setPlannerTheme] = useState<PlannerTheme>("milk");
  const [profileName, setProfileName] = useState("");
  const [profileColor, setProfileColor] = useState("#e5a089");

  useEffect(() => {
    const savedTodos = window.localStorage.getItem("timeit-todos");
    const savedTheme = window.localStorage.getItem("timeit-theme");
    const savedLogs = window.localStorage.getItem("timeit-study-logs");
    const savedSubjectMinutes = window.localStorage.getItem("timeit-subject-minutes");
    const savedPlannerTheme = window.localStorage.getItem("timeit-planner-theme");
    const savedProfileName = window.localStorage.getItem("timeit-profile-name");
    const savedProfileColor = window.localStorage.getItem("timeit-profile-color");
    const storageVersion = window.localStorage.getItem("timeit-storage-version");
    if (storageVersion !== "production-v1") {
      ["timeit-todos", "timeit-study-logs", "timeit-subject-minutes", "timeit-joined-groups", "timeit-profile-name"].forEach((key) => window.localStorage.removeItem(key));
      window.localStorage.setItem("timeit-storage-version", "production-v1");
    }
    if (storageVersion === "production-v1") {
      if (savedTodos) setTodos(JSON.parse(savedTodos));
      if (savedLogs) setStudyLogs(JSON.parse(savedLogs));
      if (savedSubjectMinutes) {
        const minutes = JSON.parse(savedSubjectMinutes) as Record<string, number>;
        setSubjects((items) => items.map((subject) => typeof minutes[subject.id] === "number" ? { ...subject, minutes: minutes[subject.id] } : subject));
      }
    }
    if (savedTheme === "dark") setIsDark(true);
    if (savedPlannerTheme === "milk" || savedPlannerTheme === "lavender" || savedPlannerTheme === "sage") setPlannerTheme(savedPlannerTheme);
    if (storageVersion === "production-v1" && savedProfileName) setProfileName(savedProfileName);
    if (storageVersion === "production-v1" && savedProfileColor) setProfileColor(savedProfileColor);
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
    window.localStorage.setItem("timeit-subject-minutes", JSON.stringify(Object.fromEntries(subjects.map((subject) => [subject.id, subject.minutes]))));
  }, [subjects]);

  useEffect(() => {
    window.localStorage.setItem("timeit-planner-theme", plannerTheme);
  }, [plannerTheme]);

  useEffect(() => {
    window.localStorage.setItem("timeit-profile-name", profileName);
  }, [profileName]);

  useEffect(() => {
    window.localStorage.setItem("timeit-profile-color", profileColor);
  }, [profileColor]);


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
  const totalToday = subjects.reduce((sum, subject) => sum + subject.minutes, 0) + Math.floor(seconds / 60);
  const liveSession = isRunning && sessionStartMinutes !== null && seconds > 0
    ? { id: "live-session", subjectId: selectedSubject, startMinutes: sessionStartMinutes, durationMinutes: Math.max(10, Math.ceil((seconds / 60) / 10) * 10), trackedMinutes: Math.floor(seconds / 60) }
    : null;
  const toggleTodo = (id: number) => {
    setTodos((items) => items.map((todo) => todo.id === id ? { ...todo, done: !todo.done } : todo));
  };

  const addTodo = () => {
    if (!newTodo.trim()) return;
    setTodos((items) => [...items, { id: Date.now(), subject: selectedSubject, text: newTodo.trim(), due: "오늘", done: false }]);
    setNewTodo("");
    setIsAdding(false);
  };

  const addStudyLog = (log: StudyLog) => {
    const entry = { ...log, recordedAt: log.recordedAt ?? new Date().toISOString() };
    const minutes = loggedMinutes(entry);
    setStudyLogs((items) => [...items, entry]);
    setSubjects((items) => items.map((subject) => subject.id === entry.subjectId ? { ...subject, minutes: subject.minutes + minutes } : subject));
  };

  const addSubject = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || subjects.some((subject) => subject.name === trimmed)) return;
    const colors = [
      { color: "#8d9bc4", soft: "#e5eaf5" }, { color: "#cf927f", soft: "#f5e4df" },
      { color: "#7eae99", soft: "#dfefe7" }, { color: "#b78aac", soft: "#f1e3ee" },
    ];
    const palette = colors[subjects.length % colors.length];
    const id = `subject-${Date.now()}`;
    setSubjects((items) => [...items, { id, name: trimmed, short: trimmed.slice(0, 1), ...palette, minutes: 0 }]);
    setSelectedSubject(id);
  };

  const updateStudyLog = (id: string, next: Pick<StudyLog, "subjectId" | "startMinutes" | "durationMinutes">) => {
    const previous = studyLogs.find((log) => log.id === id);
    if (!previous) return;
    const updated: StudyLog = { ...previous, ...next, trackedMinutes: next.durationMinutes };
    const previousMinutes = loggedMinutes(previous);
    const nextMinutes = loggedMinutes(updated);
    setStudyLogs((items) => items.map((log) => log.id === id ? updated : log));
    setSubjects((items) => items.map((subject) => {
      if (subject.id === previous.subjectId && subject.id === updated.subjectId) return { ...subject, minutes: Math.max(0, subject.minutes + nextMinutes - previousMinutes) };
      if (subject.id === previous.subjectId) return { ...subject, minutes: Math.max(0, subject.minutes - previousMinutes) };
      if (subject.id === updated.subjectId) return { ...subject, minutes: subject.minutes + nextMinutes };
      return subject;
    }));
  };

  const deleteStudyLog = (id: string) => {
    const previous = studyLogs.find((log) => log.id === id);
    if (!previous) return;
    const minutes = loggedMinutes(previous);
    setStudyLogs((items) => items.filter((log) => log.id !== id));
    setSubjects((items) => items.map((subject) => subject.id === previous.subjectId ? { ...subject, minutes: Math.max(0, subject.minutes - minutes) } : subject));
  };

  const recordActiveSubject = () => {
    if (!seconds) {
      setSessionStartMinutes(null);
      setPomodoroRemaining(25 * 60);
      return;
    }
    const recorded = Math.max(1, Math.floor(seconds / 60));
    const gridDuration = Math.max(10, Math.ceil(recorded / 10) * 10);
    const now = new Date();
    const startMinutes = sessionStartMinutes ?? now.getHours() * 60 + now.getMinutes();
    addStudyLog({ id: `session-${Date.now()}`, subjectId: selectedSubject, startMinutes, durationMinutes: gridDuration, trackedMinutes: recorded });
    setSavedSession(`${activeSubject.name} ${formatMinutes(recorded)} 기록됨`);
    setSeconds(0);
    setSessionStartMinutes(null);
    setPomodoroRemaining(25 * 60);
  };

  const saveSession = () => {
    recordActiveSubject();
    setIsRunning(false);
  };

  const toggleTimer = () => {
    if (isRunning) {
      saveSession();
      return;
    }
    if (!isRunning && sessionStartMinutes === null) {
      const now = new Date();
      setSessionStartMinutes(now.getHours() * 60 + now.getMinutes());
      setSavedSession(null);
    }
    setIsRunning((value) => !value);
  };

  const chooseSubject = (subjectId: string) => {
    if (subjectId === selectedSubject) {
      if (!isRunning) toggleTimer();
      return;
    }
    const now = new Date();
    if (isRunning) recordActiveSubject();
    setSelectedSubject(subjectId);
    setSessionStartMinutes(now.getHours() * 60 + now.getMinutes());
    setSeconds(0);
    setSavedSession(null);
    setIsRunning(true);
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
    <main className={`app-shell planner-theme-${plannerTheme} ${isDark ? "dark" : ""} ${isRunning && screen === "timer" ? "focus-active" : ""}`} style={{ "--profile-color": profileColor } as React.CSSProperties}>
      <section className="phone-frame">
        <header className="topbar">
          <button className="avatar" aria-label="프로필">{profileName.trim().slice(0, 1) || "나"}</button>
          <div className="brand">timeit<span>°</span></div>
          <button className="round-control" onClick={() => setIsDark((value) => !value)} aria-label="테마 전환">
            <Icon>{isDark ? "☀" : "☾"}</Icon>
          </button>
        </header>

        <div className="content-scroll">
          {screen === "home" && (
            <HomeScreen totalToday={totalToday} todos={todos} subjects={subjects} selectedSubject={selectedSubject} setSelectedSubject={setSelectedSubject} toggleTodo={toggleTodo} isAdding={isAdding} setIsAdding={setIsAdding} newTodo={newTodo} setNewTodo={setNewTodo} addTodo={addTodo} onTimer={goTimer} onNavigate={setScreen} />
          )}
          {screen === "planner" && (
            <PlannerScreen totalToday={totalToday} subjects={subjects} studyLogs={liveSession ? [...studyLogs, liveSession] : studyLogs} onAddStudyLog={addStudyLog} onUpdateStudyLog={updateStudyLog} onDeleteStudyLog={deleteStudyLog} />
          )}
          {screen === "timer" && (
            <TimerScreen activeSubject={activeSubject} subjects={subjects} selectedSubject={selectedSubject} totalToday={totalToday} seconds={seconds} pomodoroRemaining={pomodoroRemaining} isRunning={isRunning} timerMode={timerMode} pomodoroPhase={pomodoroPhase} onChooseSubject={chooseSubject} onToggle={toggleTimer} onChangeMode={changeTimerMode} onChangePhase={() => { setPomodoroPhase((phase) => phase === "집중" ? "휴식" : "집중"); setPomodoroRemaining(pomodoroPhase === "집중" ? 5 * 60 : 25 * 60); }} onReset={resetTimer} savedSession={savedSession} />
          )}
          {screen === "stats" && <StatsScreen subjects={subjects} studyLogs={studyLogs} />}
          {screen === "settings" && <SettingsPanel subjects={subjects} onAddSubject={addSubject} isDark={isDark} setIsDark={setIsDark} plannerTheme={plannerTheme} setPlannerTheme={setPlannerTheme} profileName={profileName} setProfileName={setProfileName} profileColor={profileColor} setProfileColor={setProfileColor} />}
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

function HomeScreen({ totalToday, todos, subjects, selectedSubject, setSelectedSubject, toggleTodo, isAdding, setIsAdding, newTodo, setNewTodo, addTodo, onTimer, onNavigate }: { totalToday: number; todos: Todo[]; subjects: Subject[]; selectedSubject: string; setSelectedSubject: (value: string) => void; toggleTodo: (id: number) => void; isAdding: boolean; setIsAdding: (value: boolean) => void; newTodo: string; setNewTodo: (value: string) => void; addTodo: () => void; onTimer: (subject?: string) => void; onNavigate: (screen: Screen) => void }) {
  return <section className="home-v3">
    <div className="home-date-row"><span>{todayLabel()}</span></div>
    <section className="home-study-bottom">
      <div className="home-study-total"><span>오늘 순공 시간</span><strong>{formatDuration(totalToday * 60)}</strong><button onClick={() => onNavigate("stats")}>통계 →</button></div>
      <div className="home-quick-subjects">{subjects.map((subject) => <button key={subject.id} onClick={() => onTimer(subject.id)}><i style={{ background: subject.color }} /><span>{subject.name}</span><small>{formatMinutes(subject.minutes)}</small><b>▶</b></button>)}</div>
      <button className="home-start-button" onClick={() => onTimer()}><span>▶</span> 지금 집중 시작하기</button>
    </section>
    <TodoListCard className="home-todo-card" todos={todos} subjects={subjects} selectedSubject={selectedSubject} setSelectedSubject={setSelectedSubject} toggleTodo={toggleTodo} isAdding={isAdding} setIsAdding={setIsAdding} newTodo={newTodo} setNewTodo={setNewTodo} addTodo={addTodo} />
  </section>;
}

function PlannerScreen({ totalToday, subjects, studyLogs, onAddStudyLog, onUpdateStudyLog, onDeleteStudyLog }: { totalToday: number; subjects: Subject[]; studyLogs: StudyLog[]; onAddStudyLog: (log: StudyLog) => void; onUpdateStudyLog: (id: string, log: Pick<StudyLog, "subjectId" | "startMinutes" | "durationMinutes">) => void; onDeleteStudyLog: (id: string) => void }) {
  return <section className="planner-only"><TimelineGrid totalToday={totalToday} subjects={subjects} studyLogs={studyLogs} onAddStudyLog={onAddStudyLog} onUpdateStudyLog={onUpdateStudyLog} onDeleteStudyLog={onDeleteStudyLog} /></section>;
}

function TodoListCard({ className = "", todos, subjects, selectedSubject, setSelectedSubject, toggleTodo, isAdding, setIsAdding, newTodo, setNewTodo, addTodo }: { className?: string; todos: Todo[]; subjects: Subject[]; selectedSubject: string; setSelectedSubject: (value: string) => void; toggleTodo: (id: number) => void; isAdding: boolean; setIsAdding: (value: boolean) => void; newTodo: string; setNewTodo: (value: string) => void; addTodo: () => void }) {
  return <section className={`planner-card todo-card ${className}`}>
    <div className="planner-card-header"><div><span className="section-kicker">MY TO-DO</span><h2>오늘 꼭 해낼 것</h2></div><span className="count-pill">{todos.filter((todo) => todo.done).length}/{todos.length}</span></div>
    <div className="todo-list">{todos.map((todo) => { const subject = subjects.find((item) => item.id === todo.subject)!; return <button className={`todo-row ${todo.done ? "completed" : ""}`} key={todo.id} onClick={() => toggleTodo(todo.id)}><span className="check-box">✓</span><span className="todo-color" style={{ background: subject.color }} /><span className="todo-copy"><b>{todo.text}</b><small>{subject.name} · {todo.due}</small></span>{todo.priority && <span className="priority">중요</span>}</button>; })}</div>
    {isAdding ? <div className="add-todo"><select value={selectedSubject} onChange={(event) => setSelectedSubject(event.target.value)}>{subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}</select><input autoFocus value={newTodo} onChange={(event) => setNewTodo(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addTodo(); }} placeholder="예: 수능특강 2강 풀기" /><button onClick={addTodo}>추가</button></div> : <button className="add-line" onClick={() => setIsAdding(true)}>＋ 오늘의 할 일 추가</button>}
  </section>;
}

function TimelineGrid({ totalToday, subjects, studyLogs, onAddStudyLog, onUpdateStudyLog, onDeleteStudyLog }: { totalToday: number; subjects: Subject[]; studyLogs: StudyLog[]; onAddStudyLog: (log: StudyLog) => void; onUpdateStudyLog: (id: string, log: Pick<StudyLog, "subjectId" | "startMinutes" | "durationMinutes">) => void; onDeleteStudyLog: (id: string) => void }) {
  const slots = Array.from({ length: 144 }, (_, index) => index);
  const hours = Array.from({ length: 24 }, (_, index) => index);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ subjectId: subjects[0]?.id ?? "math", startTime: "08:00", duration: 60 });
  const slotLog = (slot: number) => studyLogs.find((log) => {
    const minute = slot * 10;
    return minute >= log.startMinutes && minute < log.startMinutes + log.durationMinutes;
  });

  const openNewLog = () => {
    setEditingLogId("new");
    setDraft({ subjectId: subjects[0]?.id ?? "math", startTime: "08:00", duration: 60 });
  };

  const openExistingLog = (log: StudyLog) => {
    if (log.id === "live-session") return;
    setEditingLogId(log.id);
    setDraft({ subjectId: log.subjectId, startTime: clockFromMinutes(log.startMinutes), duration: log.durationMinutes });
  };

  const saveLog = () => {
    if (!editingLogId) return;
    const durationMinutes = Math.max(10, Math.min(720, Math.round(draft.duration / 10) * 10));
    const next = { subjectId: draft.subjectId, startMinutes: minutesFromClock(draft.startTime), durationMinutes };
    if (editingLogId === "new") onAddStudyLog({ id: `manual-${Date.now()}`, ...next, trackedMinutes: durationMinutes });
    else onUpdateStudyLog(editingLogId, next);
    setEditingLogId(null);
  };

  const deleteLog = () => {
    if (!editingLogId || editingLogId === "new") return;
    onDeleteStudyLog(editingLogId);
    setEditingLogId(null);
  };

  return <section className="planner-card timetable-card">
    <div className="planner-card-header timetable-heading">
    <div className="timeline-title"><span className="section-kicker">STUDY TIMELINE</span><h2>{todayLabel()}</h2><small>24시간 · 10분 단위</small></div>
      <div className="timeline-header-side"><button className="timeline-edit-toggle" onClick={() => { setIsEditorOpen((value) => !value); setEditingLogId(null); }}>기록 수정</button><span className="timeline-today-time">오늘 순공 <b>{formatDuration(totalToday * 60)}</b></span></div>
    </div>
    <div className="timeline-legend">{subjects.map((subject) => <span key={subject.id}><i style={{ background: subject.color }} />{subject.name}</span>)}</div>
    <p className="timetable-helper">타이머 기록이 과목 색상의 형광펜 칸으로 채워져요.</p>
    <div className="time-table-scroll" aria-label="24시간 10분 단위 학습 시간표">
      {isEditorOpen && <section className="timeline-editor" aria-label="타임테이블 기록 수정">
        <div className="timeline-editor-head"><div><span>STUDY RECORDS</span><strong>기록을 추가하거나 수정하세요</strong></div><button onClick={openNewLog}>+ 기록 추가</button></div>
        <div className="timeline-record-list">{studyLogs.filter((log) => log.id !== "live-session").sort((a, b) => a.startMinutes - b.startMinutes).map((log) => { const subject = subjects.find((item) => item.id === log.subjectId); return <button className={editingLogId === log.id ? "selected" : ""} onClick={() => openExistingLog(log)} key={log.id}><i style={{ background: subject?.color }} /><span>{clockFromMinutes(log.startMinutes)} · {formatMinutes(loggedMinutes(log))}</span><b>{subject?.name}</b></button>; })}</div>
        {editingLogId && <div className="timeline-edit-form"><label>과목<select value={draft.subjectId} onChange={(event) => setDraft((value) => ({ ...value, subjectId: event.target.value }))}>{subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}</select></label><label>시작 시간<input type="time" value={draft.startTime} onChange={(event) => setDraft((value) => ({ ...value, startTime: event.target.value }))} /></label><label>공부 시간 (분)<input type="number" min="10" max="720" step="10" value={draft.duration} onChange={(event) => setDraft((value) => ({ ...value, duration: Number(event.target.value) || 10 }))} /></label><div className="timeline-edit-buttons"><button className="timeline-save" onClick={saveLog}>{editingLogId === "new" ? "기록 추가" : "수정 완료"}</button>{editingLogId !== "new" && <button className="timeline-delete" onClick={deleteLog}>기록 삭제</button>}</div></div>}
      </section>}
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

function TimerScreen({ activeSubject, subjects, selectedSubject, totalToday, seconds, pomodoroRemaining, isRunning, timerMode, pomodoroPhase, onChooseSubject, onToggle, onChangeMode, onChangePhase, onReset, savedSession }: { activeSubject: Subject; subjects: Subject[]; selectedSubject: string; totalToday: number; seconds: number; pomodoroRemaining: number; isRunning: boolean; timerMode: "stopwatch" | "pomodoro"; pomodoroPhase: "집중" | "휴식"; onChooseSubject: (id: string) => void; onToggle: () => void; onChangeMode: (mode: "stopwatch" | "pomodoro") => void; onChangePhase: () => void; onReset: () => void; savedSession: string | null }) {
  const displayTime = timerMode === "pomodoro"
    ? `${String(Math.floor(pomodoroRemaining / 60)).padStart(2, "0")}:${String(pomodoroRemaining % 60).padStart(2, "0")}`
    : formatDuration(seconds);

  return <section className={`timer-page timer-v2 ${isRunning ? "running" : ""}`} style={{ "--subject": activeSubject.color, "--subject-soft": activeSubject.soft } as React.CSSProperties}>
    <div className="timer-status-bar"><span>오늘 순공 <b>{formatDuration(totalToday * 60)}</b></span><span className="timer-date">{todayLabel()}</span></div>
    <div className="timer-mode-row" role="tablist"><button className={timerMode === "stopwatch" ? "selected" : ""} onClick={() => onChangeMode("stopwatch")}>스톱워치</button><button className={timerMode === "pomodoro" ? "selected" : ""} onClick={() => onChangeMode("pomodoro")}>뽀모도로</button></div>
    <section className="focus-console">
      <div className="focus-subject"><span style={{ background: activeSubject.color }}>{activeSubject.short}</span><div><small>{timerMode === "pomodoro" ? `${pomodoroPhase} 세션` : "현재 과목"}</small><strong>{activeSubject.name}</strong></div><i className={isRunning ? "signal on" : "signal"} /></div>
      <div className="focus-time"><span>{timerMode === "pomodoro" ? (pomodoroPhase === "집중" ? "집중 남은 시간" : "휴식 남은 시간") : "공부 시간"}</span><strong>{displayTime}</strong><small>{isRunning ? "측정 중" : seconds ? "일시 정지" : "과목을 선택해 시작하세요"}</small></div>
      <div className="focus-controls"><button className="timer-reset" onClick={onReset} aria-label="타이머 초기화">↺</button><button className="timer-main" onClick={onToggle}>{isRunning ? "중지" : "집중 시작"}<b>{isRunning ? "■" : "▶"}</b></button></div>
      {timerMode === "pomodoro" && <button className="pomodoro-rule" onClick={onChangePhase}><span>{pomodoroPhase === "집중" ? "25분 집중 중" : "5분 휴식 중"}</span><b>{pomodoroPhase === "집중" ? "휴식으로 전환" : "집중으로 전환"} →</b></button>}
    </section>
    <section className="subject-timer-list"><div className="subject-list-heading"><div><span className="section-kicker">SUBJECT TIMER</span><h2>과목별 집중 시간</h2></div><span>과목을 눌러 시작</span></div>{subjects.map((subject) => { const isActive = subject.id === selectedSubject; const shownSeconds = isActive ? subject.minutes * 60 + seconds : subject.minutes * 60; return <button key={subject.id} className={`subject-timer-row ${isActive ? "active" : ""}`} onClick={() => onChooseSubject(subject.id)}><span className="subject-token" style={{ background: subject.soft, color: subject.color }}>{subject.short}</span><span className="subject-timer-name"><b>{subject.name}</b><small>{isActive && isRunning ? "현재 측정 중" : "눌러서 집중 시작"}</small></span><strong>{formatDuration(shownSeconds)}</strong><span className="subject-play">{isActive && isRunning ? "Ⅱ" : "▶"}</span></button>; })}</section>
    {savedSession && <div className="saved-toast">✓ {savedSession}</div>}
  </section>;
}

function StatsScreen({ subjects, studyLogs }: { subjects: Subject[]; studyLogs: StudyLog[] }) {
  const [range, setRange] = useState<"week" | "month">("week");
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (range === "week") start.setDate(start.getDate() - 6);
  else start.setDate(1);
  const periodLogs = studyLogs.filter((log) => log.recordedAt && new Date(log.recordedAt) >= start);
  const periodTotal = periodLogs.reduce((sum, log) => sum + loggedMinutes(log), 0);
  const bySubject = subjects.map((subject) => ({ subject, minutes: periodLogs.filter((log) => log.subjectId === subject.id).reduce((sum, log) => sum + loggedMinutes(log), 0) }));
  const donutStyle = periodTotal ? `conic-gradient(${bySubject.reduce<{ items: string[]; point: number }>((state, item) => { const next = state.point + item.minutes / periodTotal * 100; state.items.push(`${item.subject.color} ${state.point}% ${next}%`); state.point = next; return state; }, { items: [], point: 0 }).items.join(", ")})` : "conic-gradient(#e6e7eb 0 100%)";
  const days = range === "week" ? Array.from({ length: 7 }, (_, index) => { const date = new Date(now); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - 6 + index); return date; }) : Array.from({ length: 4 }, (_, index) => { const date = new Date(now.getFullYear(), now.getMonth(), 1 + index * 7); return date; });
  const values = days.map((date, index) => periodLogs.filter((log) => { const logged = new Date(log.recordedAt!); return range === "week" ? logged.toDateString() === date.toDateString() : Math.floor((logged.getDate() - 1) / 7) === index; }).reduce((sum, log) => sum + loggedMinutes(log), 0));
  const monthDays = Array.from({ length: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() }, (_, index) => index + 1);
  const monthHours = monthDays.map((day) => periodLogs.filter((log) => { const logged = new Date(log.recordedAt!); return logged.getDate() === day; }).reduce((sum, log) => sum + loggedMinutes(log), 0) / 60);
  const studiedDays = monthHours.filter((hours) => hours > 0).length;
  const rangeLabel = range === "week" ? "이번 주" : "이번 달";
  const maxValue = Math.max(...values, 1);

  return <section className="stats-page"><div className="screen-intro"><span className="section-kicker">STUDY INSIGHTS</span><h1>쌓인 시간을<br /><em>눈으로 확인해요.</em></h1></div><article className="stats-highlight"><span>{rangeLabel} 총 집중</span><strong>{formatMinutes(periodTotal)}</strong><p>{periodTotal ? <>기록한 시간만 <b>있는 그대로</b> 보여드려요.</> : <>아직 기록이 없어요. <b>타이머를 시작</b>해보세요.</>}</p></article><article className="analytics-card"><div className="planner-card-header"><div><span className="section-kicker">SUBJECT BALANCE</span><h2>과목별 집중 비율</h2></div><div className="stats-period" role="tablist"><button className={range === "week" ? "selected" : ""} onClick={() => setRange("week")}>이번 주</button><button className={range === "month" ? "selected" : ""} onClick={() => setRange("month")}>이번 달</button></div></div><div className="donut-layout"><div className="donut" style={{ background: donutStyle }}><div><b>{formatMinutes(periodTotal)}</b><small>{rangeLabel} 집중</small></div></div><div className="donut-legend">{bySubject.map(({ subject, minutes }) => <span key={subject.id}><i style={{ background: subject.color }} />{subject.name}<b>{periodTotal ? Math.round(minutes / periodTotal * 100) : 0}%</b></span>)}</div></div></article><article className="analytics-card"><div className="planner-card-header"><div><span className="section-kicker">{range === "week" ? "WEEKLY FLOW" : "MONTHLY FLOW"}</span><h2>{rangeLabel} 학습 리듬</h2></div><b className="soft-strong">{formatMinutes(periodTotal)}</b></div><div className={`stats-bars ${range === "month" ? "month-bars" : ""}`}>{values.map((value, index) => <div key={index}><i style={{ height: `${Math.max(value / maxValue * 100, value ? 3 : 0)}%` }} /><span>{range === "week" ? weekdays[days[index].getDay()] : `${index + 1}주`}</span></div>)}</div></article><article className="analytics-card grass-card"><div className="planner-card-header"><div><span className="section-kicker">STUDY GARDEN</span><h2>공부 잔디</h2></div><span className="garden-total">이번 달 {studiedDays}일</span></div><div className="grass-grid grass-hours">{monthHours.map((hours, index) => <span className={`grass-${grassLevel(hours)}`} key={index} title={`${index + 1}일 · ${displayHours(hours)}`}><b>{displayHours(hours)}</b></span>)}</div><div className="grass-legend"><span>적게</span><i className="grass-0" /><i className="grass-1" /><i className="grass-2" /><i className="grass-4" /><span>많이</span></div></article></section>;
}

function SettingsPanel({ subjects, onAddSubject, isDark, setIsDark, plannerTheme, setPlannerTheme, profileName, setProfileName, profileColor, setProfileColor }: { subjects: Subject[]; onAddSubject: (name: string) => void; isDark: boolean; setIsDark: (value: boolean) => void; plannerTheme: PlannerTheme; setPlannerTheme: (value: PlannerTheme) => void; profileName: string; setProfileName: (value: string) => void; profileColor: string; setProfileColor: (value: string) => void }) {
  const [isProfileEditing, setIsProfileEditing] = useState(false);
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [subjectName, setSubjectName] = useState("");
  const themes: { id: PlannerTheme; label: string; description: string }[] = [
    { id: "milk", label: "밀크티 베이지", description: "따뜻하고 차분한 노트" },
    { id: "lavender", label: "라일락 노트", description: "맑은 보랏빛 포인트" },
    { id: "sage", label: "세이지 그린", description: "눈이 편한 초록 노트" },
  ];
  const selectedTheme = themes.find((theme) => theme.id === plannerTheme)!;

  return <section className="settings-page settings-v2">
    <div className="screen-intro"><span className="section-kicker">MY SPACE</span><h1>공부할 공간을<br /><em>가볍게 정리해요.</em></h1></div>
    <article className={`profile-card profile-editor ${isProfileEditing ? "editing" : ""}`}><div className="large-avatar" style={{ background: profileColor }}>{profileName.trim().slice(0, 1) || "나"}</div><div><h2>{profileName.trim() ? `${profileName.trim()}님의 타임잇` : "나의 타임잇"}</h2><p>{isProfileEditing ? "이름과 색상을 바꾼 뒤 완료를 눌러주세요." : "나만의 프로필을 설정해보세요."}</p></div><button className="profile-edit-button" onClick={() => setIsProfileEditing((value) => !value)}>{isProfileEditing ? "완료" : "수정"}</button>{isProfileEditing && <><label className="profile-name-field"><span>이름</span><input value={profileName} maxLength={10} onChange={(event) => setProfileName(event.target.value)} aria-label="프로필 이름" /></label><div className="profile-color-row" aria-label="프로필 색상">{["#e5a089", "#8d9bc4", "#7eae99", "#b78aac", "#8b827c"].map((color) => <button className={profileColor === color ? "selected" : ""} onClick={() => setProfileColor(color)} style={{ background: color }} aria-label={`${color} 프로필 색상`} key={color} />)}</div></>}</article>
    <section className="settings-group settings-subjects"><span>과목 관리</span>{subjects.map((subject) => <div className="settings-subject" key={subject.id}><i style={{ background: subject.color }} /><b>{subject.name}</b><small>{formatMinutes(subject.minutes)} 기록됨</small></div>)}<div className="add-todo"><input value={subjectName} maxLength={12} onChange={(event) => setSubjectName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { onAddSubject(subjectName); setSubjectName(""); } }} placeholder="새 과목 이름" /><button onClick={() => { onAddSubject(subjectName); setSubjectName(""); }}>추가</button></div></section>
    <section className="settings-group"><span>화면 설정</span><button onClick={() => setIsDark(!isDark)}><i className="theme-icon">{isDark ? "☾" : "☀"}</i><b>다크 모드</b><span className={`toggle ${isDark ? "on" : ""}`}><i /></span></button><button onClick={() => setIsThemeOpen((value) => !value)}><i className="theme-icon">✦</i><b>플래너 테마</b><small>{selectedTheme.label}</small><strong>›</strong></button>{isThemeOpen && <div className="planner-theme-options">{themes.map((theme) => <button key={theme.id} className={plannerTheme === theme.id ? "selected" : ""} onClick={() => { setPlannerTheme(theme.id); setIsThemeOpen(false); }}><i className={`theme-swatch ${theme.id}`} /><span><b>{theme.label}</b><small>{theme.description}</small></span><strong>{plannerTheme === theme.id ? "✓" : ""}</strong></button>)}</div>}</section>
  </section>;
}
