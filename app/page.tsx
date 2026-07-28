"use client";

import { useEffect, useMemo, useState } from "react";

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
};

type PlannerTheme = "milk" | "lavender" | "sage";

type StudyGroup = {
  id: string;
  name: string;
  category: string;
  description: string;
  members: number;
  averageMinutes: number;
  accent: string;
};

const initialSubjects: Subject[] = [
  { id: "korean", name: "국어", short: "국", color: "#e68d87", soft: "#f9e3e0", minutes: 60 },
  { id: "math", name: "수학", short: "수", color: "#718fb8", soft: "#e1e9f5", minutes: 160 },
  { id: "english", name: "영어", short: "영", color: "#78ad95", soft: "#e1f0e8", minutes: 50 },
  { id: "society", name: "생활과 윤리", short: "윤", color: "#c394ac", soft: "#f3e4eb", minutes: 40 },
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

const studyGroups: StudyGroup[] = [
  { id: "suneung-focus", name: "수능 D-110 집중방", category: "수능 · 고3", description: "매일의 순공을 조용히 쌓는 방", members: 18, averageMinutes: 294, accent: "#e09a83" },
  { id: "math-morning", name: "아침 수학 루틴", category: "수학 · 루틴", description: "오전 7시, 개념부터 기출까지", members: 12, averageMinutes: 218, accent: "#748fbb" },
  { id: "library-night", name: "독서실 야간 자습", category: "자습 · 야간", description: "22시까지 서로의 집중을 응원해요", members: 27, averageMinutes: 251, accent: "#7eae99" },
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

const grassHours = [0, 1.2, 2.6, 0.8, 4.1, 2.3, 5.4, 1.1, 0, 2.8, 3.7, 1.5, 2.1, 4.8, 5.7, 3.2, 1.6, 0, 2.4, 3.8, 2.7, 5.2, 1.9, 2.2, 4.6, 3.1, 2.8, 0, 1.4, 3.5, 5.1, 2.9, 2.4, 4.4, 1.7];

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
  const [selectedSubject, setSelectedSubject] = useState("math");
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
  const [profileName, setProfileName] = useState("송민영");
  const [profileColor, setProfileColor] = useState("#e5a089");
  const [joinedGroupIds, setJoinedGroupIds] = useState<string[]>(["suneung-focus"]);

  useEffect(() => {
    const savedTodos = window.localStorage.getItem("timeit-todos");
    const savedTheme = window.localStorage.getItem("timeit-theme");
    const savedLogs = window.localStorage.getItem("timeit-study-logs");
    const savedSubjectMinutes = window.localStorage.getItem("timeit-subject-minutes");
    const savedPlannerTheme = window.localStorage.getItem("timeit-planner-theme");
    const savedProfileName = window.localStorage.getItem("timeit-profile-name");
    const savedProfileColor = window.localStorage.getItem("timeit-profile-color");
    const savedGroups = window.localStorage.getItem("timeit-joined-groups");
    if (savedTodos) setTodos(JSON.parse(savedTodos));
    if (savedTheme === "dark") setIsDark(true);
    if (savedLogs) setStudyLogs(JSON.parse(savedLogs));
    if (savedSubjectMinutes) {
      const minutes = JSON.parse(savedSubjectMinutes) as Record<string, number>;
      setSubjects((items) => items.map((subject) => typeof minutes[subject.id] === "number" ? { ...subject, minutes: minutes[subject.id] } : subject));
    }
    if (savedPlannerTheme === "milk" || savedPlannerTheme === "lavender" || savedPlannerTheme === "sage") setPlannerTheme(savedPlannerTheme);
    if (savedProfileName) setProfileName(savedProfileName);
    if (savedProfileColor) setProfileColor(savedProfileColor);
    if (savedGroups) setJoinedGroupIds(JSON.parse(savedGroups));
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
    window.localStorage.setItem("timeit-joined-groups", JSON.stringify(joinedGroupIds));
  }, [joinedGroupIds]);

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

  const addStudyLog = (log: StudyLog) => {
    const minutes = loggedMinutes(log);
    setStudyLogs((items) => [...items, log]);
    setSubjects((items) => items.map((subject) => subject.id === log.subjectId ? { ...subject, minutes: subject.minutes + minutes } : subject));
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

  const saveSession = () => {
    if (!seconds) {
      setIsRunning(false);
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
    setIsRunning(false);
    setSessionStartMinutes(null);
    setPomodoroRemaining(25 * 60);
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
    if (isRunning) saveSession();
    setSelectedSubject(subjectId);
    setSessionStartMinutes(now.getHours() * 60 + now.getMinutes());
    setSeconds(0);
    setSavedSession(null);
    setIsRunning(true);
  };

  const toggleGroup = (groupId: string) => {
    setJoinedGroupIds((items) => items.includes(groupId) ? items.filter((id) => id !== groupId) : [...items, groupId]);
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
            <PlannerScreen subjects={subjects} studyLogs={liveSession ? [...studyLogs, liveSession] : studyLogs} onAddStudyLog={addStudyLog} onUpdateStudyLog={updateStudyLog} onDeleteStudyLog={deleteStudyLog} />
          )}
          {screen === "timer" && (
            <TimerScreen activeSubject={activeSubject} subjects={subjects} selectedSubject={selectedSubject} totalToday={totalToday} seconds={seconds} pomodoroRemaining={pomodoroRemaining} isRunning={isRunning} timerMode={timerMode} pomodoroPhase={pomodoroPhase} onChooseSubject={chooseSubject} onToggle={toggleTimer} onChangeMode={changeTimerMode} onChangePhase={() => { setPomodoroPhase((phase) => phase === "집중" ? "휴식" : "집중"); setPomodoroRemaining(pomodoroPhase === "집중" ? 5 * 60 : 25 * 60); }} onReset={resetTimer} savedSession={savedSession} />
          )}
          {screen === "stats" && <StatsScreen subjects={subjects} totalToday={totalToday} donutStyle={donutStyle} />}
          {screen === "settings" && <SettingsPanel subjects={subjects} totalToday={totalToday} isDark={isDark} setIsDark={setIsDark} plannerTheme={plannerTheme} setPlannerTheme={setPlannerTheme} profileName={profileName} setProfileName={setProfileName} profileColor={profileColor} setProfileColor={setProfileColor} joinedGroupIds={joinedGroupIds} onToggleGroup={toggleGroup} />}
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
    <div className="home-date-row"><span>2026년 8월 1일 토요일</span><b>D-110</b></div>
    <section className="home-study-bottom">
      <div className="home-study-total"><span>오늘 순공 시간</span><strong>{formatDuration(totalToday * 60)}</strong><button onClick={() => onNavigate("stats")}>통계 →</button></div>
      <div className="home-quick-subjects">{subjects.map((subject) => <button key={subject.id} onClick={() => onTimer(subject.id)}><i style={{ background: subject.color }} /><span>{subject.name}</span><small>{formatMinutes(subject.minutes)}</small><b>▶</b></button>)}</div>
      <button className="home-start-button" onClick={() => onTimer()}><span>▶</span> 지금 집중 시작하기</button>
    </section>
    <TodoListCard className="home-todo-card" todos={todos} subjects={subjects} selectedSubject={selectedSubject} setSelectedSubject={setSelectedSubject} toggleTodo={toggleTodo} isAdding={isAdding} setIsAdding={setIsAdding} newTodo={newTodo} setNewTodo={setNewTodo} addTodo={addTodo} />
  </section>;
}

function PlannerScreen({ subjects, studyLogs, onAddStudyLog, onUpdateStudyLog, onDeleteStudyLog }: { subjects: Subject[]; studyLogs: StudyLog[]; onAddStudyLog: (log: StudyLog) => void; onUpdateStudyLog: (id: string, log: Pick<StudyLog, "subjectId" | "startMinutes" | "durationMinutes">) => void; onDeleteStudyLog: (id: string) => void }) {
  return <section className="planner-only"><TimelineGrid subjects={subjects} studyLogs={studyLogs} onAddStudyLog={onAddStudyLog} onUpdateStudyLog={onUpdateStudyLog} onDeleteStudyLog={onDeleteStudyLog} /></section>;
}

function TodoListCard({ className = "", todos, subjects, selectedSubject, setSelectedSubject, toggleTodo, isAdding, setIsAdding, newTodo, setNewTodo, addTodo }: { className?: string; todos: Todo[]; subjects: Subject[]; selectedSubject: string; setSelectedSubject: (value: string) => void; toggleTodo: (id: number) => void; isAdding: boolean; setIsAdding: (value: boolean) => void; newTodo: string; setNewTodo: (value: string) => void; addTodo: () => void }) {
  return <section className={`planner-card todo-card ${className}`}>
    <div className="planner-card-header"><div><span className="section-kicker">MY TO-DO</span><h2>오늘 꼭 해낼 것</h2></div><span className="count-pill">{todos.filter((todo) => todo.done).length}/{todos.length}</span></div>
    <div className="todo-list">{todos.map((todo) => { const subject = subjects.find((item) => item.id === todo.subject)!; return <button className={`todo-row ${todo.done ? "completed" : ""}`} key={todo.id} onClick={() => toggleTodo(todo.id)}><span className="check-box">✓</span><span className="todo-color" style={{ background: subject.color }} /><span className="todo-copy"><b>{todo.text}</b><small>{subject.name} · {todo.due}</small></span>{todo.priority && <span className="priority">중요</span>}</button>; })}</div>
    {isAdding ? <div className="add-todo"><select value={selectedSubject} onChange={(event) => setSelectedSubject(event.target.value)}>{subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}</select><input autoFocus value={newTodo} onChange={(event) => setNewTodo(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addTodo(); }} placeholder="예: 수능특강 2강 풀기" /><button onClick={addTodo}>추가</button></div> : <button className="add-line" onClick={() => setIsAdding(true)}>＋ 오늘의 할 일 추가</button>}
  </section>;
}

function TimelineGrid({ subjects, studyLogs, onAddStudyLog, onUpdateStudyLog, onDeleteStudyLog }: { subjects: Subject[]; studyLogs: StudyLog[]; onAddStudyLog: (log: StudyLog) => void; onUpdateStudyLog: (id: string, log: Pick<StudyLog, "subjectId" | "startMinutes" | "durationMinutes">) => void; onDeleteStudyLog: (id: string) => void }) {
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
      <button className="timeline-edit-toggle" onClick={() => { setIsEditorOpen((value) => !value); setEditingLogId(null); }}>기록 수정</button>
      <div><span className="section-kicker">STUDY TIMELINE</span><h2>24시간 타임테이블</h2></div>
      <span className="ten-minutes">10분 단위</span>
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

function TimerScreen({ activeSubject, subjects, selectedSubject, totalToday, seconds, pomodoroRemaining, isRunning, timerMode, pomodoroPhase, onChooseSubject, onToggle, onChangeMode, onChangePhase, onReset, savedSession }: { activeSubject: Subject; subjects: Subject[]; selectedSubject: string; totalToday: number; seconds: number; pomodoroRemaining: number; isRunning: boolean; timerMode: "stopwatch" | "pomodoro"; pomodoroPhase: "집중" | "휴식"; onChooseSubject: (id: string) => void; onToggle: () => void; onChangeMode: (mode: "stopwatch" | "pomodoro") => void; onChangePhase: () => void; onReset: () => void; savedSession: string | null }) {
  const displayTime = timerMode === "pomodoro"
    ? `${String(Math.floor(pomodoroRemaining / 60)).padStart(2, "0")}:${String(pomodoroRemaining % 60).padStart(2, "0")}`
    : formatDuration(seconds);

  return <section className={`timer-page timer-v2 ${isRunning ? "running" : ""}`} style={{ "--subject": activeSubject.color, "--subject-soft": activeSubject.soft } as React.CSSProperties}>
    <div className="timer-status-bar"><span>오늘 순공 <b>{formatDuration(totalToday * 60)}</b></span><span className="timer-date">8월 1일 토요일</span><span className="timer-dday">D-110</span></div>
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

function StatsScreen({ subjects, totalToday, donutStyle }: { subjects: Subject[]; totalToday: number; donutStyle: string }) {
  const total = subjects.reduce((sum, subject) => sum + subject.minutes, 0);
  return <section className="stats-page"><div className="screen-intro"><span className="section-kicker">STUDY INSIGHTS</span><h1>쌓인 시간을<br /><em>눈으로 확인해요.</em></h1></div><article className="stats-highlight"><span>이번 주 총 집중</span><strong>16시간 <em>36분</em></strong><p>지난주보다 <b>2시간 14분</b> 더 해냈어요 <span>↗</span></p></article><article className="analytics-card"><div className="planner-card-header"><div><span className="section-kicker">SUBJECT BALANCE</span><h2>과목별 집중 비율</h2></div><button>이번 주⌄</button></div><div className="donut-layout"><div className="donut" style={{ background: donutStyle }}><div><b>{formatMinutes(total)}</b><small>누적 공부</small></div></div><div className="donut-legend">{subjects.map((subject) => <span key={subject.id}><i style={{ background: subject.color }} />{subject.name}<b>{Math.round((subject.minutes / total) * 100)}%</b></span>)}</div></div></article><article className="analytics-card"><div className="planner-card-header"><div><span className="section-kicker">WEEKLY FLOW</span><h2>이번 주 학습 리듬</h2></div><b className="soft-strong">{formatMinutes(totalToday)}</b></div><div className="stats-bars">{week.map(([day, , value]) => <div key={day}><i style={{ height: `${Math.max(Number(value) / 3.2, 3)}%` }} /><span>{day}</span></div>)}</div></article><article className="analytics-card grass-card"><div className="planner-card-header"><div><span className="section-kicker">STUDY GARDEN</span><h2>공부 잔디</h2></div><span className="garden-total">이번 달 21일</span></div><div className="grass-grid grass-hours">{grassHours.map((hours, index) => <span className={`grass-${grassLevel(hours)}`} key={index} title={`${index + 1}일 · ${displayHours(hours)}`}><b>{displayHours(hours)}</b></span>)}</div><div className="grass-legend"><span>적게</span><i className="grass-0" /><i className="grass-1" /><i className="grass-2" /><i className="grass-4" /><span>많이</span></div></article></section>;
}

function SettingsPanel({ subjects, totalToday, isDark, setIsDark, plannerTheme, setPlannerTheme, profileName, setProfileName, profileColor, setProfileColor, joinedGroupIds, onToggleGroup }: { subjects: Subject[]; totalToday: number; isDark: boolean; setIsDark: (value: boolean) => void; plannerTheme: PlannerTheme; setPlannerTheme: (value: PlannerTheme) => void; profileName: string; setProfileName: (value: string) => void; profileColor: string; setProfileColor: (value: string) => void; joinedGroupIds: string[]; onToggleGroup: (id: string) => void }) {
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [isGroupOpen, setIsGroupOpen] = useState(false);
  const themes: { id: PlannerTheme; label: string; description: string }[] = [
    { id: "milk", label: "밀크티 베이지", description: "따뜻하고 차분한 노트" },
    { id: "lavender", label: "라일락 노트", description: "맑은 보랏빛 포인트" },
    { id: "sage", label: "세이지 그린", description: "눈이 편한 초록 노트" },
  ];
  const selectedTheme = themes.find((theme) => theme.id === plannerTheme)!;

  return <section className="settings-page settings-v2">
    <div className="screen-intro"><span className="section-kicker">MY SPACE</span><h1>공부할 공간을<br /><em>가볍게 정리해요.</em></h1></div>
    <article className="profile-card profile-editor"><div className="large-avatar" style={{ background: profileColor }}>{profileName.trim().slice(0, 1) || "나"}</div><div><h2>{profileName.trim() || "나"}님의 타임잇</h2><p>이름과 프로필 색상은 바로 저장돼요.</p></div><label className="profile-name-field"><span>이름</span><input value={profileName} maxLength={10} onChange={(event) => setProfileName(event.target.value)} aria-label="프로필 이름" /></label><div className="profile-color-row" aria-label="프로필 색상">{["#e5a089", "#8d9bc4", "#7eae99", "#b78aac", "#8b827c"].map((color) => <button className={profileColor === color ? "selected" : ""} onClick={() => setProfileColor(color)} style={{ background: color }} aria-label={`${color} 프로필 색상`} key={color} />)}</div></article>
    <section className="settings-group settings-subjects"><span>과목 관리</span>{subjects.map((subject) => <div className="settings-subject" key={subject.id}><i style={{ background: subject.color }} /><b>{subject.name}</b><small>{formatMinutes(subject.minutes)} 기록됨</small></div>)}</section>
    <section className="settings-group"><span>화면 설정</span><button onClick={() => setIsDark(!isDark)}><i className="theme-icon">{isDark ? "☾" : "☀"}</i><b>다크 모드</b><span className={`toggle ${isDark ? "on" : ""}`}><i /></span></button><button onClick={() => setIsThemeOpen((value) => !value)}><i className="theme-icon">✦</i><b>플래너 테마</b><small>{selectedTheme.label}</small><strong>›</strong></button>{isThemeOpen && <div className="planner-theme-options">{themes.map((theme) => <button key={theme.id} className={plannerTheme === theme.id ? "selected" : ""} onClick={() => { setPlannerTheme(theme.id); setIsThemeOpen(false); }}><i className={`theme-swatch ${theme.id}`} /><span><b>{theme.label}</b><small>{theme.description}</small></span><strong>{plannerTheme === theme.id ? "✓" : ""}</strong></button>)}</div>}</section>
    <section className="settings-group group-settings"><span>스터디 그룹</span><button onClick={() => setIsGroupOpen((value) => !value)}><i className="theme-icon">◉</i><b>함께 집중하기</b><small>{joinedGroupIds.length ? `${joinedGroupIds.length}개 그룹 참여 중` : "그룹을 찾아보세요"}</small><strong>{isGroupOpen ? "⌃" : "›"}</strong></button>{isGroupOpen && <StudyGroupPanel totalToday={totalToday} profileName={profileName} profileColor={profileColor} joinedGroupIds={joinedGroupIds} onToggleGroup={onToggleGroup} />}</section>
  </section>;
}

function StudyGroupPanel({ totalToday, profileName, profileColor, joinedGroupIds, onToggleGroup }: { totalToday: number; profileName: string; profileColor: string; joinedGroupIds: string[]; onToggleGroup: (id: string) => void }) {
  const [tab, setTab] = useState<"mine" | "find">("mine");
  const [query, setQuery] = useState("");
  const joinedGroups = studyGroups.filter((group) => joinedGroupIds.includes(group.id));
  const foundGroups = studyGroups.filter((group) => `${group.name} ${group.category}`.toLowerCase().includes(query.toLowerCase()));
  const members = [
    { name: "김민서", minutes: 342, state: "집중 중", color: "#e5a089" },
    { name: profileName.trim() || "나", minutes: totalToday, state: "집중 중", color: profileColor, self: true },
    { name: "윤지호", minutes: 274, state: "휴식 중", color: "#8d9bc4" },
    { name: "이서연", minutes: 231, state: "자리 비움", color: "#7eae99" },
  ].sort((a, b) => b.minutes - a.minutes);

  return <section className="study-group-panel">
    <div className="group-tabs" role="tablist"><button className={tab === "mine" ? "selected" : ""} onClick={() => setTab("mine")}>내 그룹</button><button className={tab === "find" ? "selected" : ""} onClick={() => setTab("find")}>그룹 찾기</button></div>
    {tab === "mine" ? <div className="joined-group-list">{joinedGroups.length ? joinedGroups.map((group) => <article className="joined-group-card" key={group.id}><div className="group-card-top"><i style={{ background: group.accent }} /><div><span>{group.category}</span><h3>{group.name}</h3></div><button onClick={() => onToggleGroup(group.id)}>나가기</button></div><p>{group.description}</p><div className="group-stats"><span>오늘 평균 <b>{formatMinutes(group.averageMinutes)}</b></span><span>참여 <b>{group.members}명</b></span></div><div className="group-ranking">{members.map((member, index) => <div className={member.self ? "self" : ""} key={member.name}><b>{index + 1}</b><i style={{ background: member.color }} /> <span>{member.name}</span><small className={member.state === "집중 중" ? "studying" : ""}>{member.state}</small><strong>{formatMinutes(member.minutes)}</strong></div>)}</div></article>) : <div className="group-empty"><strong>아직 참여 중인 그룹이 없어요.</strong><span>같은 목표를 가진 사람들과 오늘의 집중을 나눠보세요.</span><button onClick={() => setTab("find")}>그룹 찾기</button></div>}</div> : <div className="group-discovery"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="수능, 수학, 자습으로 찾아보기" aria-label="스터디 그룹 검색" />{foundGroups.map((group) => { const joined = joinedGroupIds.includes(group.id); return <article key={group.id}><i style={{ background: group.accent }} /><div><span>{group.category} · {group.members}명</span><h3>{group.name}</h3><p>{group.description}</p></div><button className={joined ? "joined" : ""} onClick={() => onToggleGroup(group.id)}>{joined ? "참여 중" : "가입"}</button></article>})}</div>}
  </section>;
}
