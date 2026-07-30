"use client";

import { useEffect, useRef, useState } from "react";
import { BarChart3, CalendarDays, Check, CloudOff, House, LoaderCircle, Moon, Settings2, Sun, Timer } from "lucide-react";
import { getKoreanHolidays } from "./korean-holidays";

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
  trackedSeconds?: number;
  trackedMinutes?: number;
  recordedAt?: string;
};

type CalendarSchedule = {
  id: string;
  title: string;
  date: string;
  time?: string;
  description?: string;
  kind?: "schedule" | "holiday";
};

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleTokenClient = {
  requestAccessToken: (options?: { prompt?: string }) => void;
};

type GoogleOAuthApi = {
  initTokenClient: (options: {
    client_id: string;
    scope: string;
    callback: (response: GoogleTokenResponse) => void;
    error_callback?: (error: { type?: string }) => void;
  }) => GoogleTokenClient;
  revoke: (token: string, callback?: () => void) => void;
};

type GoogleCredentialResponse = {
  credential?: string;
};

type GoogleIdentityApi = {
  initialize: (options: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    context?: "signin" | "signup" | "use";
  }) => void;
  renderButton: (element: HTMLElement, options: {
    type?: "standard" | "icon";
    theme?: "outline" | "filled_blue" | "filled_black";
    size?: "large" | "medium" | "small";
    text?: "signin_with" | "signup_with" | "continue_with" | "signin";
    shape?: "rectangular" | "pill" | "circle" | "square";
    logo_alignment?: "left" | "center";
    width?: number;
    locale?: string;
  }) => void;
  disableAutoSelect: () => void;
};

type PlannerTheme = "milk" | "fog" | "rose";

type AuthUser = {
  id: string;
  email: string;
  name: string;
  authProvider?: "password" | "google" | "password+google";
};

type AccountData = {
  subjects: Subject[];
  todos: Todo[];
  studyLogs: StudyLog[];
  selectedSubject: string;
  isDark: boolean;
  plannerTheme: PlannerTheme;
  profileName: string;
  profileColor: string;
  profileStatus: string;
};

type ActiveTimerState = {
  subjectId: string;
  mode: "stopwatch" | "pomodoro";
  phase: "집중" | "휴식";
  elapsedSeconds: number;
  pomodoroRemaining: number;
  startedAt: number;
  savedAt: number;
  running: boolean;
};

const GOOGLE_CLIENT_ID = "322831832887-fm9l7tdqbp1qgfd6v52rirbt4b1nmdt6.apps.googleusercontent.com";
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const ACTIVE_TIMER_KEY = "timeit-active-timer-v1";
let googleIdentityScriptPromise: Promise<void> | null = null;
let googleIdInitialized = false;
let googleCredentialHandler: ((credential: string) => void) | null = null;

const initialSubjects: Subject[] = [
  { id: "focus", name: "공부", short: "공", color: "#8d9bc4", soft: "#e5eaf5", minutes: 0 },
];

const initialTodos: Todo[] = [];
const initialStudyLogs: StudyLog[] = [];

const demoSubjects: Subject[] = [
  { id: "demo-korean", name: "국어", short: "국", color: "#cf927f", soft: "#f5e4df", minutes: 57 },
  { id: "demo-math", name: "수학", short: "수", color: "#8d9bc4", soft: "#e5eaf5", minutes: 78 },
  { id: "demo-english", name: "영어", short: "영", color: "#7eae99", soft: "#dfefe7", minutes: 46 },
  { id: "demo-inquiry", name: "생명과학", short: "생", color: "#b78aac", soft: "#f1e3ee", minutes: 64 },
];

const demoTodos: Todo[] = [
  { id: 101, subject: "demo-korean", text: "문학 기출 3지문 분석", due: "오늘", done: true, priority: true },
  { id: 102, subject: "demo-math", text: "미적분 수열의 극한 오답 정리", due: "오늘", done: true },
  { id: 103, subject: "demo-english", text: "영단어 DAY 18 복습", due: "오늘", done: true },
  { id: 104, subject: "demo-inquiry", text: "유전 단원 개념 노트 완성", due: "오늘", done: false, priority: true },
  { id: 105, subject: "demo-math", text: "실전 모의고사 21·22번 다시 풀기", due: "오늘", done: false },
];

function createDemoStudyLogs() {
  const now = new Date();
  const today = [
    { subjectId: "demo-math", startMinutes: 7 * 60 + 40, trackedMinutes: 78 },
    { subjectId: "demo-korean", startMinutes: 10 * 60 + 10, trackedMinutes: 57 },
    { subjectId: "demo-english", startMinutes: 14 * 60, trackedMinutes: 46 },
    { subjectId: "demo-inquiry", startMinutes: 19 * 60 + 20, trackedMinutes: 64 },
  ].map((session, index) => ({
    id: `demo-today-${index}`,
    ...session,
    durationMinutes: Math.ceil(session.trackedMinutes / 10) * 10,
    recordedAt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(session.startMinutes / 60), session.startMinutes % 60).toISOString(),
  }));
  const subjects = ["demo-korean", "demo-math", "demo-english", "demo-inquiry"];
  const history = Array.from({ length: 27 }, (_, index) => {
    const daysAgo = index + 1;
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo);
    const sessionCount = daysAgo % 6 === 0 ? 2 : 3 + (daysAgo % 2);
    return Array.from({ length: sessionCount }, (_, sessionIndex) => {
      const trackedMinutes = 38 + ((daysAgo * 17 + sessionIndex * 23) % 61);
      const startMinutes = 8 * 60 + sessionIndex * 170 + (daysAgo % 4) * 10;
      return {
        id: `demo-${daysAgo}-${sessionIndex}`,
        subjectId: subjects[(daysAgo + sessionIndex) % subjects.length],
        startMinutes,
        durationMinutes: Math.ceil(trackedMinutes / 10) * 10,
        trackedMinutes,
        recordedAt: new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(startMinutes / 60), startMinutes % 60).toISOString(),
      };
    });
  }).flat();
  return [...today, ...history];
}

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

function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFromKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function dateLabelFromKey(value: string) {
  return todayLabel(dateFromKey(value));
}

function shiftDateKey(value: string, amount: number) {
  const date = dateFromKey(value);
  date.setDate(date.getDate() + amount);
  return dateKey(date);
}

function logDateKey(log: StudyLog) {
  return log.recordedAt ? dateKey(new Date(log.recordedAt)) : dateKey();
}

function recordedAtForDate(value: string, startMinutes: number) {
  const date = dateFromKey(value);
  date.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
  return date.toISOString();
}

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatMinutes(minutes: number) {
  const totalSeconds = Math.max(0, Math.round(minutes * 60));
  const hours = Math.floor(totalSeconds / 3600);
  const restMinutes = Math.floor((totalSeconds % 3600) / 60);
  const restSeconds = totalSeconds % 60;
  if (hours) return `${hours}시간 ${String(restMinutes).padStart(2, "0")}분`;
  if (restMinutes) return `${restMinutes}분${restSeconds ? ` ${restSeconds}초` : ""}`;
  return `${restSeconds}초`;
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
  return log.trackedSeconds !== undefined ? log.trackedSeconds / 60 : log.trackedMinutes ?? log.durationMinutes;
}

function safeStoredJson<T>(key: string): T | null {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) as T : null;
  } catch {
    window.localStorage.removeItem(key);
    return null;
  }
}

function minutesBySubject(logs: StudyLog[], subjects: Subject[], day?: string) {
  return Object.fromEntries(subjects.map((subject) => [
    subject.id,
    logs
      .filter((log) => log.subjectId === subject.id && (!day || logDateKey(log) === day))
      .reduce((sum, log) => sum + loggedMinutes(log), 0),
  ]));
}

function googleOAuthApi() {
  return (window as Window & { google?: { accounts?: { oauth2?: GoogleOAuthApi } } }).google?.accounts?.oauth2;
}

function googleIdentityApi() {
  return (window as Window & { google?: { accounts?: { id?: GoogleIdentityApi } } }).google?.accounts?.id;
}

function loadGoogleIdentityServices() {
  if (typeof window === "undefined") return Promise.reject(new Error("browser-only"));
  if (googleOAuthApi() && googleIdentityApi()) return Promise.resolve();
  if (googleIdentityScriptPromise) return googleIdentityScriptPromise;
  googleIdentityScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    const script = existing ?? document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      googleIdentityScriptPromise = null;
      reject(new Error("google-script-load-failed"));
    };
    if (!existing) document.head.appendChild(script);
  });
  return googleIdentityScriptPromise;
}

function requestGoogleCalendarToken() {
  return new Promise<string>((resolve, reject) => {
    const oauth = googleOAuthApi();
    if (!oauth) {
      reject(new Error("google-not-ready"));
      return;
    }
    const client = oauth.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_CALENDAR_SCOPE,
      callback: (response) => {
        if (response.access_token) resolve(response.access_token);
        else reject(new Error(response.error_description || response.error || "google-auth-failed"));
      },
      error_callback: () => reject(new Error("google-popup-closed")),
    });
    client.requestAccessToken({ prompt: "" });
  });
}

async function fetchGoogleCalendarMonth(accessToken: string, month: Date) {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const params = new URLSearchParams({
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 401) throw new Error("google-auth-expired");
  if (!response.ok) throw new Error("google-calendar-fetch-failed");
  const payload = await response.json() as {
    items?: Array<{ id?: string; summary?: string; start?: { date?: string; dateTime?: string } }>;
  };
  return (payload.items ?? []).flatMap((event, index) => {
    const startValue = event.start?.dateTime ?? event.start?.date;
    if (!startValue) return [];
    const isAllDay = Boolean(event.start?.date && !event.start?.dateTime);
    const startDate = isAllDay ? dateFromKey(startValue) : new Date(startValue);
    if (Number.isNaN(startDate.getTime())) return [];
    return [{
      id: event.id ?? `google-${dateKey(startDate)}-${index}`,
      title: event.summary?.trim() || "제목 없는 일정",
      date: isAllDay ? startValue : dateKey(startDate),
      time: isAllDay ? undefined : `${String(startDate.getHours()).padStart(2, "0")}:${String(startDate.getMinutes()).padStart(2, "0")}`,
    }];
  });
}

async function createGoogleStudyEvent(accessToken: string, log: StudyLog, subject?: Subject) {
  const start = dateFromKey(logDateKey(log));
  start.setHours(Math.floor(log.startMinutes / 60), log.startMinutes % 60, 0, 0);
  const end = new Date(start.getTime() + Math.max(1, Math.round(loggedMinutes(log) * 60)) * 1000);
  const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      summary: `[타임잇] ${subject?.name ?? "공부"}`,
      description: `타임잇에서 기록한 순공시간 ${formatMinutes(loggedMinutes(log))}`,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
      extendedProperties: { private: { timeitLogId: log.id } },
    }),
  });
  if (response.status === 401) throw new Error("google-auth-expired");
  if (!response.ok) throw new Error("google-calendar-create-failed");
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
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [pomodoroRemaining, setPomodoroRemaining] = useState(25 * 60);
  const [plannerTheme, setPlannerTheme] = useState<PlannerTheme>("milk");
  const [profileName, setProfileName] = useState("");
  const [profileColor, setProfileColor] = useState("#e5a089");
  const [profileStatus, setProfileStatus] = useState("");
  const [plannerDate, setPlannerDate] = useState(() => dateKey());
  const [calendarSchedules, setCalendarSchedules] = useState<CalendarSchedule[]>([]);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [googleReady, setGoogleReady] = useState(false);
  const [googleAuthBusy, setGoogleAuthBusy] = useState(false);
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);
  const [calendarSyncMessage, setCalendarSyncMessage] = useState("Google 캘린더를 연결하면 휴대폰 일정이 여기에 표시돼요.");
  const [storageReady, setStorageReady] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [accountDataReady, setAccountDataReady] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [syncState, setSyncState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [syncRetryKey, setSyncRetryKey] = useState(0);
  const lastTickAtRef = useRef<number | null>(null);
  const snapshotRef = useRef<AccountData | null>(null);

  useEffect(() => {
    const isDemo = window.location.hostname.split(".")[0] === "timeit-demo";
    const expectedStorageVersion = isDemo ? "demo-v5" : "production-v2";
    const savedTodos = safeStoredJson<Todo[]>("timeit-todos");
    const savedTheme = window.localStorage.getItem("timeit-theme");
    const savedLogs = safeStoredJson<StudyLog[]>("timeit-study-logs");
    const savedSubjects = safeStoredJson<Subject[]>("timeit-subjects");
    const savedSubjectMinutes = safeStoredJson<Record<string, number>>("timeit-subject-minutes");
    const savedPlannerTheme = window.localStorage.getItem("timeit-planner-theme");
    const savedProfileName = window.localStorage.getItem("timeit-profile-name");
    const savedProfileColor = window.localStorage.getItem("timeit-profile-color");
    const savedProfileStatus = window.localStorage.getItem("timeit-profile-status");
    const lightDefaultApplied = window.localStorage.getItem("timeit-light-default-v1");
    const storageVersion = window.localStorage.getItem("timeit-storage-version");
    if (storageVersion !== expectedStorageVersion) {
      ["timeit-todos", "timeit-study-logs", "timeit-subjects", "timeit-subject-minutes", "timeit-joined-groups", "timeit-profile-name", "timeit-profile-color", "timeit-profile-status"].forEach((key) => window.localStorage.removeItem(key));
      window.localStorage.setItem("timeit-storage-version", expectedStorageVersion);
      if (isDemo) {
        setSubjects(demoSubjects);
        setTodos(demoTodos);
        setStudyLogs(createDemoStudyLogs());
        setSelectedSubject("demo-math");
        setProfileName("민지");
        setProfileColor("#cf927f");
        setPlannerTheme("milk");
        setStorageReady(true);
        return;
      }
    }
    if (storageVersion === expectedStorageVersion) {
      if (Array.isArray(savedTodos)) setTodos(savedTodos);
      if (Array.isArray(savedLogs)) setStudyLogs(savedLogs);
      if (Array.isArray(savedSubjects)) {
        if (savedSubjects.length) {
          setSubjects(savedSubjects);
          setSelectedSubject((current) => savedSubjects.some((subject) => subject.id === current) ? current : savedSubjects[0].id);
        }
      } else if (savedSubjectMinutes) {
        setSubjects((items) => items.map((subject) => typeof savedSubjectMinutes[subject.id] === "number" ? { ...subject, minutes: savedSubjectMinutes[subject.id] } : subject));
      }
    }
    if (!lightDefaultApplied) {
      setIsDark(false);
      window.localStorage.setItem("timeit-theme", "light");
      window.localStorage.setItem("timeit-light-default-v1", "1");
    } else {
      setIsDark(savedTheme === "dark");
    }
    if (savedPlannerTheme === "milk" || savedPlannerTheme === "fog" || savedPlannerTheme === "rose") setPlannerTheme(savedPlannerTheme);
    if (storageVersion === expectedStorageVersion && savedProfileName) setProfileName(savedProfileName);
    if (storageVersion === expectedStorageVersion && savedProfileColor) setProfileColor(savedProfileColor);
    if (storageVersion === expectedStorageVersion && savedProfileStatus) setProfileStatus(savedProfileStatus);
    window.localStorage.removeItem("timeit-calendar-schedules");
    const activeTimer = safeStoredJson<ActiveTimerState>(ACTIVE_TIMER_KEY);
    if (activeTimer?.running && activeTimer.startedAt > 0 && Date.now() - activeTimer.startedAt < 24 * 60 * 60 * 1000) {
      const offlineSeconds = Math.max(0, Math.floor((Date.now() - activeTimer.savedAt) / 1000));
      const restoredSubjects = Array.isArray(savedSubjects) && savedSubjects.length ? savedSubjects : initialSubjects;
      setSelectedSubject(restoredSubjects.some((subject) => subject.id === activeTimer.subjectId) ? activeTimer.subjectId : restoredSubjects[0].id);
      setTimerMode(activeTimer.mode);
      setPomodoroPhase(activeTimer.phase);
      setSessionStartedAt(activeTimer.startedAt);
      const recoveredFocusSeconds = activeTimer.mode === "stopwatch"
        ? offlineSeconds
        : activeTimer.phase === "집중"
          ? Math.min(offlineSeconds, activeTimer.pomodoroRemaining)
          : 0;
      setSeconds(activeTimer.elapsedSeconds + recoveredFocusSeconds);
      setPomodoroRemaining(Math.max(0, activeTimer.pomodoroRemaining - (activeTimer.mode === "pomodoro" ? offlineSeconds : 0)));
      setIsRunning(true);
      setSavedSession("진행 중이던 타이머를 복원했어요");
    } else {
      window.localStorage.removeItem(ACTIVE_TIMER_KEY);
    }
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem("timeit-todos", JSON.stringify(todos));
  }, [storageReady, todos]);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem("timeit-theme", isDark ? "dark" : "light");
  }, [isDark, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem("timeit-study-logs", JSON.stringify(studyLogs));
  }, [storageReady, studyLogs]);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem("timeit-subjects", JSON.stringify(subjects));
    window.localStorage.setItem("timeit-subject-minutes", JSON.stringify(Object.fromEntries(subjects.map((subject) => [subject.id, subject.minutes]))));
  }, [storageReady, subjects]);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem("timeit-planner-theme", plannerTheme);
  }, [plannerTheme, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem("timeit-profile-name", profileName);
  }, [profileName, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem("timeit-profile-color", profileColor);
  }, [profileColor, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem("timeit-profile-status", profileStatus);
  }, [profileStatus, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    if (!isRunning || sessionStartedAt === null) {
      window.localStorage.removeItem(ACTIVE_TIMER_KEY);
      return;
    }
    const activeTimer: ActiveTimerState = {
      subjectId: selectedSubject,
      mode: timerMode,
      phase: pomodoroPhase,
      elapsedSeconds: seconds,
      pomodoroRemaining,
      startedAt: sessionStartedAt,
      savedAt: Date.now(),
      running: true,
    };
    window.localStorage.setItem(ACTIVE_TIMER_KEY, JSON.stringify(activeTimer));
  }, [isRunning, pomodoroPhase, pomodoroRemaining, seconds, selectedSubject, sessionStartedAt, storageReady, timerMode]);

  const accountSnapshot = (): AccountData => ({
    subjects,
    todos,
    studyLogs,
    selectedSubject,
    isDark,
    plannerTheme,
    profileName,
    profileColor,
    profileStatus,
  });

  useEffect(() => {
    snapshotRef.current = {
      subjects,
      todos,
      studyLogs,
      selectedSubject,
      isDark,
      plannerTheme,
      profileName,
      profileColor,
      profileStatus,
    };
  }, [isDark, plannerTheme, profileColor, profileName, profileStatus, selectedSubject, studyLogs, subjects, todos]);

  const applyAccountData = (data: AccountData, user: AuthUser) => {
    const nextSubjects = Array.isArray(data.subjects) && data.subjects.length ? data.subjects : initialSubjects;
    setSubjects(nextSubjects);
    setTodos(Array.isArray(data.todos) ? data.todos : []);
    setStudyLogs(Array.isArray(data.studyLogs) ? data.studyLogs : []);
    setSelectedSubject(nextSubjects.some((subject) => subject.id === data.selectedSubject) ? data.selectedSubject : nextSubjects[0].id);
    setIsDark(Boolean(data.isDark));
    if (data.plannerTheme === "milk" || data.plannerTheme === "fog" || data.plannerTheme === "rose") setPlannerTheme(data.plannerTheme);
    setProfileName(typeof data.profileName === "string" && data.profileName.trim() ? data.profileName : user.name);
    if (typeof data.profileColor === "string" && /^#[0-9a-f]{6}$/i.test(data.profileColor)) setProfileColor(data.profileColor);
    setProfileStatus(typeof data.profileStatus === "string" ? data.profileStatus : "");
  };

  const saveAccountData = async (data: AccountData) => {
    const response = await fetch("/api/user-data", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data }),
    });
    if (!response.ok) throw new Error(response.status === 401 ? "account-session-expired" : "account-save-failed");
  };

  const loadAccountData = async (user: AuthUser) => {
    setAuthUser(user);
    setAccountDataReady(false);
    const response = await fetch("/api/user-data", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("account-load-failed");
    const payload = await response.json() as { data: AccountData | null };
    if (payload.data) applyAccountData(payload.data, user);
    else {
      const firstData = { ...accountSnapshot(), profileName: profileName.trim() || user.name };
      setProfileName(firstData.profileName);
      await saveAccountData(firstData);
    }
    setAccountDataReady(true);
    setSyncState("saved");
  };

  useEffect(() => {
    if (!storageReady) return;
    let active = true;
    fetch("/api/auth/session", { headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error("session-failed");
        const payload = await response.json() as { user: AuthUser | null };
        if (!active) return;
        if (payload.user) await loadAccountData(payload.user);
        else setIsAuthOpen(true);
      })
      .catch(() => undefined)
      .finally(() => { if (active) setAuthReady(true); });
    return () => { active = false; };
  }, [storageReady]);

  useEffect(() => {
    if (!storageReady || !authReady || !authUser || !accountDataReady) return;
    let active = true;
    const timeout = window.setTimeout(() => {
      setSyncState("saving");
      void saveAccountData(accountSnapshot())
        .then(() => { if (active) setSyncState("saved"); })
        .catch((error: Error) => {
          if (!active) return;
          setSyncState("error");
          if (error.message === "account-session-expired") {
            setAuthUser(null);
            setAccountDataReady(false);
            setIsAuthOpen(true);
          }
        });
    }, 650);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [accountDataReady, authReady, authUser, isDark, plannerTheme, profileColor, profileName, profileStatus, selectedSubject, storageReady, studyLogs, subjects, syncRetryKey, todos]);

  useEffect(() => {
    const saveOnPageExit = () => {
      if (!authUser || !accountDataReady || !snapshotRef.current) return;
      void fetch("/api/user-data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: snapshotRef.current }),
        keepalive: true,
      });
    };
    window.addEventListener("pagehide", saveOnPageExit);
    return () => window.removeEventListener("pagehide", saveOnPageExit);
  }, [accountDataReady, authUser]);

  const handleAuthenticated = async (user: AuthUser) => {
    await loadAccountData(user);
    setAuthReady(true);
    setIsAuthOpen(false);
  };

  const handleAccountProfileUpdate = (user: AuthUser, nextName: string, nextColor: string, nextStatus: string) => {
    setAuthUser(user);
    setProfileName(nextName);
    setProfileColor(nextColor);
    setProfileStatus(nextStatus);
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setAuthUser(null);
    setAccountDataReady(false);
    setSubjects(initialSubjects);
    setTodos(initialTodos);
    setStudyLogs(initialStudyLogs);
    setSelectedSubject(initialSubjects[0].id);
    setProfileName("");
    setProfileColor("#e5a089");
    setProfileStatus("");
    setIsRunning(false);
    setSeconds(0);
    setSessionStartedAt(null);
    ["timeit-todos", "timeit-study-logs", "timeit-subjects", "timeit-subject-minutes", "timeit-profile-name", "timeit-profile-color", "timeit-profile-status", ACTIVE_TIMER_KEY].forEach((key) => window.localStorage.removeItem(key));
    setSyncState("idle");
    setIsAuthOpen(false);
  };

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    let active = true;
    loadGoogleIdentityServices()
      .then(() => { if (active) setGoogleReady(true); })
      .catch(() => { if (active) setCalendarSyncMessage("Google 연결 모듈을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!isRunning) {
      lastTickAtRef.current = null;
      return;
    }
    lastTickAtRef.current = Date.now();
    const interval = window.setInterval(() => {
      const now = Date.now();
      const lastTick = lastTickAtRef.current ?? now;
      const elapsed = Math.floor((now - lastTick) / 1000);
      if (elapsed <= 0) return;
      lastTickAtRef.current = lastTick + elapsed * 1000;
      if (timerMode === "pomodoro") {
        setPomodoroRemaining((value) => {
          const consumed = Math.min(value, elapsed);
          if (pomodoroPhase === "집중" && consumed > 0) setSeconds((current) => current + consumed);
          return Math.max(0, value - elapsed);
        });
        return;
      }
      setSeconds((value) => value + elapsed);
    }, 250);
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
  const todaySubjectMinutes = minutesBySubject(studyLogs, subjects, dateKey());
  const allTimeSubjectMinutes = minutesBySubject(studyLogs, subjects);
  const isCurrentSessionToday = sessionStartedAt !== null && dateKey(new Date(sessionStartedAt)) === dateKey();
  const totalToday = Object.values(todaySubjectMinutes).reduce((sum, minutes) => sum + minutes, 0) + (isRunning && isCurrentSessionToday ? seconds / 60 : 0);
  const todaySubjects = subjects.map((subject) => ({
    ...subject,
    minutes: (todaySubjectMinutes[subject.id] ?? 0) + (isRunning && isCurrentSessionToday && subject.id === selectedSubject ? seconds / 60 : 0),
  }));
  const settingsSubjects = subjects.map((subject) => ({ ...subject, minutes: allTimeSubjectMinutes[subject.id] ?? 0 }));
  const liveSession = isRunning && sessionStartedAt !== null && seconds > 0
    ? {
      id: "live-session",
      subjectId: selectedSubject,
      startMinutes: new Date(sessionStartedAt).getHours() * 60 + new Date(sessionStartedAt).getMinutes(),
      durationMinutes: Math.max(10, Math.ceil(seconds / 600) * 10),
      trackedSeconds: seconds,
      recordedAt: new Date(sessionStartedAt).toISOString(),
    }
    : null;
  const toggleTodo = (id: number) => {
    setTodos((items) => items.map((todo) => todo.id === id ? { ...todo, done: !todo.done } : todo));
  };
  const deleteTodo = (id: number) => {
    setTodos((items) => items.filter((todo) => todo.id !== id));
  };

  const addTodo = () => {
    if (!newTodo.trim()) return;
    setTodos((items) => [...items, { id: Date.now(), subject: selectedSubject, text: newTodo.trim(), due: "오늘", done: false }]);
    setNewTodo("");
    setIsAdding(false);
  };

  const addStudyLog = (log: StudyLog) => {
    const entry = { ...log, recordedAt: log.recordedAt ?? new Date().toISOString() };
    setStudyLogs((items) => [...items, entry]);
    if (googleAccessToken) {
      const subject = subjects.find((item) => item.id === entry.subjectId);
      void createGoogleStudyEvent(googleAccessToken, entry, subject)
        .then(() => {
          setCalendarRefreshKey((value) => value + 1);
          setCalendarSyncMessage(`${subject?.name ?? "공부"} 기록이 Google 캘린더에도 저장됐어요.`);
        })
        .catch((error: Error) => {
          if (error.message === "google-auth-expired") setGoogleAccessToken(null);
          setCalendarSyncMessage(error.message === "google-auth-expired"
            ? "Google 연결 시간이 만료됐어요. 다시 연결해 주세요."
            : "공부 기록은 저장됐지만 Google 캘린더 반영은 잠시 실패했어요.");
        });
    }
  };

  const connectGoogleCalendar = async () => {
    if (!googleReady || googleAuthBusy) return;
    setGoogleAuthBusy(true);
    setCalendarSyncMessage("Google 계정 연결을 확인하고 있어요.");
    try {
      const token = await requestGoogleCalendarToken();
      setGoogleAccessToken(token);
      setCalendarRefreshKey((value) => value + 1);
      setCalendarSyncMessage("Google 캘린더와 연결됐어요. 이번 달 일정을 불러오는 중이에요.");
    } catch {
      setCalendarSyncMessage("연결이 완료되지 않았어요. Google 계정 선택 창에서 다시 승인해 주세요.");
    } finally {
      setGoogleAuthBusy(false);
    }
  };

  const disconnectGoogleCalendar = () => {
    if (googleAccessToken) googleOAuthApi()?.revoke(googleAccessToken);
    setGoogleAccessToken(null);
    setCalendarSchedules([]);
    setCalendarSyncMessage("Google 캘린더 연결을 해제했어요.");
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

  const deleteSubject = (subjectId: string) => {
    const subject = subjects.find((item) => item.id === subjectId);
    if (!subject) return;
    if (subjects.length === 1) {
      window.alert("타이머를 사용하려면 과목이 하나 이상 필요해요.");
      return;
    }
    const hasRecords = studyLogs.some((log) => log.subjectId === subjectId);
    const isActiveSubject = selectedSubject === subjectId;
    const warning = hasRecords || isActiveSubject
      ? `${subject.name} 과목과 연결된 공부 기록${isActiveSubject && isRunning ? ", 현재 측정 중인 시간" : ""}도 함께 삭제됩니다. 계속할까요?`
      : `${subject.name} 과목을 삭제할까요?`;
    if (!window.confirm(warning)) return;

    const fallback = subjects.find((item) => item.id !== subjectId)!;
    setStudyLogs((items) => items.filter((log) => log.subjectId !== subjectId));
    setTodos((items) => items.map((todo) => todo.subject === subjectId ? { ...todo, subject: fallback.id } : todo));
    setSubjects((items) => items.filter((item) => item.id !== subjectId));
    if (isActiveSubject) {
      setSelectedSubject(fallback.id);
      setIsRunning(false);
      setSeconds(0);
      setSessionStartedAt(null);
      setPomodoroPhase("집중");
      setPomodoroRemaining(25 * 60);
      setSavedSession(null);
    }
  };

  const updateStudyLog = (id: string, next: Pick<StudyLog, "subjectId" | "startMinutes" | "durationMinutes">) => {
    const previous = studyLogs.find((log) => log.id === id);
    if (!previous) return;
    const updated: StudyLog = { ...previous, ...next, trackedSeconds: undefined, trackedMinutes: next.durationMinutes };
    setStudyLogs((items) => items.map((log) => log.id === id ? updated : log));
  };

  const deleteStudyLog = (id: string) => {
    const previous = studyLogs.find((log) => log.id === id);
    if (!previous) return;
    setStudyLogs((items) => items.filter((log) => log.id !== id));
  };

  const commitSession = (subjectId: string, elapsedSeconds: number, startedAt: number | null) => {
    if (elapsedSeconds <= 0) return 0;
    const recorded = elapsedSeconds / 60;
    const gridDuration = Math.max(10, Math.ceil(elapsedSeconds / 600) * 10);
    const startedDate = new Date(startedAt ?? Date.now());
    const startMinutes = startedDate.getHours() * 60 + startedDate.getMinutes();
    addStudyLog({
      id: `session-${Date.now()}`,
      subjectId,
      startMinutes,
      durationMinutes: gridDuration,
      trackedSeconds: elapsedSeconds,
      recordedAt: startedDate.toISOString(),
    });
    return recorded;
  };

  const recordActiveSubject = () => {
    const recorded = commitSession(selectedSubject, seconds, sessionStartedAt);
    if (!recorded) {
      setSessionStartedAt(null);
      setPomodoroRemaining(25 * 60);
      return 0;
    }
    setSavedSession(`${activeSubject.name} ${formatMinutes(recorded)} 기록됨`);
    setSeconds(0);
    setSessionStartedAt(null);
    setPomodoroRemaining(25 * 60);
    return recorded;
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
    if (!isRunning && sessionStartedAt === null) {
      setSessionStartedAt(Date.now());
      setSavedSession(null);
    }
    setIsRunning((value) => !value);
  };

  const chooseSubject = (subjectId: string) => {
    if (subjectId === selectedSubject) {
      if (isRunning) saveSession();
      else toggleTimer();
      return;
    }
    const previousSubject = subjects.find((subject) => subject.id === selectedSubject);
    const nextSubject = subjects.find((subject) => subject.id === subjectId);
    if (!nextSubject) return;
    const recorded = isRunning ? commitSession(selectedSubject, seconds, sessionStartedAt) : 0;
    setSelectedSubject(subjectId);
    setSessionStartedAt(Date.now());
    setSeconds(0);
    setPomodoroRemaining(25 * 60);
    setSavedSession(recorded && previousSubject
      ? `${previousSubject.name} ${formatMinutes(recorded)} 저장 · ${nextSubject.name} 시작`
      : `${nextSubject.name} 측정 시작`);
    setIsRunning(true);
  };

  const changeTimerMode = (mode: "stopwatch" | "pomodoro") => {
    if (isRunning && seconds > 0) recordActiveSubject();
    setIsRunning(false);
    setTimerMode(mode);
    setSeconds(0);
    setSessionStartedAt(null);
    setPomodoroPhase("집중");
    setPomodoroRemaining(25 * 60);
  };

  const resetTimer = () => {
    if (isRunning && seconds > 0 && !window.confirm("현재 측정한 시간을 기록하지 않고 초기화할까요?")) return;
    setIsRunning(false);
    setSeconds(0);
    setSessionStartedAt(null);
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
          <button className="avatar" onClick={() => setIsAuthOpen(true)} aria-label="계정 정보 열기">{profileName.trim().slice(0, 1) || "나"}</button>
          <div className="brand">timeit<span>°</span></div>
          <div className="topbar-actions">
            {authUser && <button
              className={`sync-indicator ${syncState}`}
              onClick={() => { if (syncState === "error") setSyncRetryKey((value) => value + 1); }}
              disabled={syncState !== "error"}
              aria-label={syncState === "error" ? "저장 다시 시도" : syncState === "saving" ? "계정에 저장 중" : "계정에 저장됨"}
              title={syncState === "error" ? "저장 실패 · 눌러서 다시 시도" : syncState === "saving" ? "저장 중" : "저장됨"}
            >
              {syncState === "saving" ? <LoaderCircle aria-hidden="true" /> : syncState === "error" ? <CloudOff aria-hidden="true" /> : <Check aria-hidden="true" />}
            </button>}
            <button className="quick-theme-toggle" onClick={() => setIsDark((value) => !value)} aria-label={isDark ? "라이트 모드로 변경" : "다크 모드로 변경"} title={isDark ? "라이트 모드" : "다크 모드"}>
              {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
            </button>
            <button className={`auth-trigger ${authUser ? "signed-in" : ""}`} onClick={() => setIsAuthOpen(true)} disabled={!authReady} aria-label={authUser ? "내 계정 열기" : "로그인 및 회원가입"}>
              {authUser ? <><i>{authUser.name.slice(0, 1)}</i><span>내 계정</span></> : "로그인"}
            </button>
          </div>
        </header>

        <div className="content-scroll">
          <div className={`screen-stage screen-stage-${screen}`} key={screen}>
            {screen === "home" && (
              <HomeScreen totalToday={totalToday} todos={todos} subjects={todaySubjects} selectedSubject={selectedSubject} setSelectedSubject={setSelectedSubject} toggleTodo={toggleTodo} deleteTodo={deleteTodo} isAdding={isAdding} setIsAdding={setIsAdding} newTodo={newTodo} setNewTodo={setNewTodo} addTodo={addTodo} onTimer={goTimer} onNavigate={setScreen} />
            )}
            {screen === "planner" && (
              <PlannerScreen plannerDate={plannerDate} onPlannerDateChange={setPlannerDate} subjects={subjects} studyLogs={liveSession ? [...studyLogs, liveSession] : studyLogs} onAddStudyLog={addStudyLog} onUpdateStudyLog={updateStudyLog} onDeleteStudyLog={deleteStudyLog} />
            )}
            {screen === "timer" && (
              <TimerScreen activeSubject={activeSubject} subjects={todaySubjects} selectedSubject={selectedSubject} totalToday={totalToday} seconds={seconds} pomodoroRemaining={pomodoroRemaining} isRunning={isRunning} timerMode={timerMode} pomodoroPhase={pomodoroPhase} onChooseSubject={chooseSubject} onToggle={toggleTimer} onChangeMode={changeTimerMode} onChangePhase={() => { setPomodoroPhase((phase) => phase === "집중" ? "휴식" : "집중"); setPomodoroRemaining(pomodoroPhase === "집중" ? 5 * 60 : 25 * 60); }} onReset={resetTimer} savedSession={savedSession} />
            )}
            {screen === "stats" && <StatsScreen subjects={subjects} studyLogs={studyLogs} calendarSchedules={calendarSchedules} setCalendarSchedules={setCalendarSchedules} googleAccessToken={googleAccessToken} googleReady={googleReady} googleAuthBusy={googleAuthBusy} calendarRefreshKey={calendarRefreshKey} calendarSyncMessage={calendarSyncMessage} onConnectGoogle={() => void connectGoogleCalendar()} onDisconnectGoogle={disconnectGoogleCalendar} onRefreshGoogle={() => setCalendarRefreshKey((value) => value + 1)} onGoogleAuthExpired={() => { setGoogleAccessToken(null); setCalendarSyncMessage("Google 연결 시간이 만료됐어요. 다시 연결해 주세요."); }} onGoogleSyncMessage={setCalendarSyncMessage} />}
            {screen === "settings" && <SettingsPanel subjects={settingsSubjects} onAddSubject={addSubject} onDeleteSubject={deleteSubject} isDark={isDark} setIsDark={setIsDark} plannerTheme={plannerTheme} setPlannerTheme={setPlannerTheme} profileName={profileName} setProfileName={setProfileName} profileColor={profileColor} setProfileColor={setProfileColor} />}
          </div>
        </div>

        <nav className="bottom-nav" aria-label="주요 메뉴">
          {[
            { id: "home" as Screen, icon: House, label: "홈" },
            { id: "stats" as Screen, icon: BarChart3, label: "통계" },
            { id: "timer" as Screen, icon: Timer, label: "타이머" },
            { id: "planner" as Screen, icon: CalendarDays, label: "플래너" },
            { id: "settings" as Screen, icon: Settings2, label: "설정" },
          ].map(({ id, icon: NavIcon, label }) => (
            <button key={id} className={`nav-item ${screen === id ? "active" : ""}`} onClick={() => setScreen(id)} aria-current={screen === id ? "page" : undefined}>
              <NavIcon className="nav-icon" strokeWidth={screen === id ? 2.35 : 1.85} aria-hidden="true" /><span>{label}</span>
            </button>
          ))}
        </nav>
      </section>
      {isAuthOpen && <AuthDialog user={authUser} profileName={profileName} profileColor={profileColor} profileStatus={profileStatus} onClose={() => setIsAuthOpen(false)} onAuthenticated={handleAuthenticated} onProfileUpdate={handleAccountProfileUpdate} onLogout={handleLogout} />}
    </main>
  );
}

function AuthDialog({ user, profileName, profileColor, profileStatus, onClose, onAuthenticated, onProfileUpdate, onLogout }: {
  user: AuthUser | null;
  profileName: string;
  profileColor: string;
  profileStatus: string;
  onClose: () => void;
  onAuthenticated: (user: AuthUser) => Promise<void>;
  onProfileUpdate: (user: AuthUser, name: string, color: string, status: string) => void;
  onLogout: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryInput, setRecoveryInput] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [pendingUser, setPendingUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [accountEditing, setAccountEditing] = useState(false);
  const [accountSection, setAccountSection] = useState<"none" | "password" | "recovery">("none");
  const [draftName, setDraftName] = useState(profileName || user?.name || "");
  const [draftStatus, setDraftStatus] = useState(profileStatus);
  const [draftColor, setDraftColor] = useState(profileColor);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [accountMessage, setAccountMessage] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const googleButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = dialogRef.current;
    const firstFocusable = dialog?.querySelector<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled)");
    firstFocusable?.focus();
    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled)"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyboard);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyboard);
    };
  }, [onClose]);

  useEffect(() => {
    if (user || recoveryCode || !googleButtonRef.current) return;
    let cancelled = false;
    const buttonHost = googleButtonRef.current;
    googleCredentialHandler = async (credential) => {
      if (cancelled) return;
      setBusy(true);
      setError("");
      try {
        const response = await fetch("/api/auth/google", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential }),
        });
        const payload = await response.json() as { user?: AuthUser; error?: string };
        if (!response.ok || !payload.user) throw new Error(payload.error || "Google 로그인을 완료하지 못했어요.");
        await onAuthenticated(payload.user);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Google 로그인을 완료하지 못했어요.");
      } finally {
        setBusy(false);
      }
    };
    void loadGoogleIdentityServices().then(() => {
      if (cancelled) return;
      const identity = googleIdentityApi();
      if (!identity) throw new Error("google-identity-not-ready");
      if (!googleIdInitialized) {
        identity.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => {
            if (response.credential) googleCredentialHandler?.(response.credential);
          },
          auto_select: false,
          cancel_on_tap_outside: true,
          context: "use",
        });
        googleIdInitialized = true;
      }
      buttonHost.replaceChildren();
      identity.renderButton(buttonHost, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "pill",
        logo_alignment: "left",
        width: Math.max(240, Math.floor(buttonHost.clientWidth)),
        locale: "ko",
      });
    }).catch(() => {
      if (!cancelled) setError("Google 로그인 버튼을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
    });
    return () => {
      cancelled = true;
      if (googleCredentialHandler) googleCredentialHandler = null;
      buttonHost.replaceChildren();
    };
  }, [onAuthenticated, recoveryCode, user]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const path = mode === "reset" ? "reset-password" : mode;
      const response = await fetch(`/api/auth/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "reset" ? { email, recoveryCode: recoveryInput, password } : { name, email, password }),
      });
      const payload = await response.json() as { user?: AuthUser; recoveryCode?: string; ok?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error || "요청을 완료하지 못했어요.");
      if (mode === "reset") {
        if (!payload.recoveryCode) throw new Error("새 복구 코드를 만들지 못했어요.");
        setRecoveryCode(payload.recoveryCode);
        return;
      }
      if (!payload.user) throw new Error("로그인을 완료하지 못했어요.");
      if (mode === "signup" && payload.recoveryCode) {
        setPendingUser(payload.user);
        setRecoveryCode(payload.recoveryCode);
        return;
      }
      await onAuthenticated(payload.user);
    } catch (reason) {
      setError(reason instanceof Error && reason.message !== "account-load-failed" ? reason.message : "계정 데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async () => {
    if (!user) return;
    setBusy(true);
    setAccountMessage("");
    try {
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draftName }),
      });
      const payload = await response.json() as { user?: AuthUser; error?: string };
      if (!response.ok || !payload.user) throw new Error(payload.error || "프로필을 저장하지 못했어요.");
      onProfileUpdate(payload.user, draftName.trim(), draftColor, draftStatus.trim());
      setAccountEditing(false);
      setAccountMessage("계정 정보가 저장됐어요.");
    } catch (reason) {
      setAccountMessage(reason instanceof Error ? reason.message : "프로필을 저장하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setAccountMessage("");
    try {
      const response = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "비밀번호를 변경하지 못했어요.");
      setCurrentPassword("");
      setNewPassword("");
      setAccountSection("none");
      setAccountMessage("비밀번호가 변경됐어요.");
    } catch (reason) {
      setAccountMessage(reason instanceof Error ? reason.message : "비밀번호를 변경하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  const issueRecoveryCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setAccountMessage("");
    try {
      const response = await fetch("/api/account/recovery-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword }),
      });
      const payload = await response.json() as { recoveryCode?: string; error?: string };
      if (!response.ok || !payload.recoveryCode) throw new Error(payload.error || "복구 코드를 만들지 못했어요.");
      setRecoveryCode(payload.recoveryCode);
      setCurrentPassword("");
    } catch (reason) {
      setAccountMessage(reason instanceof Error ? reason.message : "복구 코드를 만들지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  return <div className="auth-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className={`auth-dialog ${user ? "account-dialog" : ""}`} role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <button className="auth-close" onClick={onClose} aria-label="닫기">×</button>
      {user ? <>
        <div className="account-sheet-head"><span className="section-kicker">MY ACCOUNT</span><h2 id="auth-title">계정 정보</h2><p>내 프로필과 로그인 정보를 관리해요.</p></div>
        <div className="account-identity">
          <div className="account-avatar" style={{ background: draftColor }}>{draftName.trim().slice(0, 1) || "나"}</div>
          <div><strong>{draftName || user.name}</strong><small>{user.email}</small><span>{draftStatus || "상태 메시지를 설정해보세요."}</span></div>
          <button onClick={() => { setAccountEditing((value) => !value); setAccountMessage(""); }}>{accountEditing ? "취소" : "수정"}</button>
        </div>
        {accountEditing && <div className="account-edit-panel">
          <label><span>이름</span><input value={draftName} onChange={(event) => setDraftName(event.target.value)} minLength={2} maxLength={24} /></label>
          <label><span>상태 메시지</span><input value={draftStatus} onChange={(event) => setDraftStatus(event.target.value)} maxLength={40} placeholder="예: 오늘도 한 걸음씩" /></label>
          <div className="account-color-picker"><span>프로필 색상</span><div>{["#e5a089", "#8d9bc4", "#7eae99", "#b78aac", "#8b827c"].map((color) => <button type="button" className={draftColor === color ? "selected" : ""} onClick={() => setDraftColor(color)} style={{ background: color }} aria-label={`${color} 프로필 색상`} key={color} />)}</div></div>
          <button className="account-save-button" onClick={() => void saveProfile()} disabled={busy}>변경사항 저장</button>
        </div>}
        {user.authProvider === "google"
          ? <div className="account-provider-note"><span className="google-provider-mark">G</span><div><strong>Google 계정으로 로그인 중</strong><small>비밀번호 없이 {user.email} 계정으로 안전하게 로그인해요.</small></div></div>
          : <div className="account-menu">
            <button onClick={() => { setAccountSection(accountSection === "password" ? "none" : "password"); setRecoveryCode(""); setAccountMessage(""); }}><span>비밀번호 변경</span><b>›</b></button>
            <button onClick={() => { setAccountSection(accountSection === "recovery" ? "none" : "recovery"); setRecoveryCode(""); setAccountMessage(""); }}><span>복구 코드 관리</span><small>분실 대비</small><b>›</b></button>
          </div>}
        {accountSection === "password" && <form className="account-inline-form" onSubmit={changePassword}>
          <label><span>현재 비밀번호</span><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required /></label>
          <label><span>새 비밀번호</span><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={8} placeholder="8자 이상" required /></label>
          <button disabled={busy}>비밀번호 변경</button>
        </form>}
        {accountSection === "recovery" && <form className="account-inline-form" onSubmit={issueRecoveryCode}>
          <p>비밀번호를 잊었을 때 사용할 새 복구 코드를 발급합니다. 기존 코드는 즉시 만료돼요.</p>
          <label><span>현재 비밀번호</span><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required /></label>
          <button disabled={busy}>새 복구 코드 발급</button>
        </form>}
        {recoveryCode && <RecoveryCodeCard code={recoveryCode} />}
        {accountMessage && <p className="account-message" role="status">{accountMessage}</p>}
        <button className="account-logout-button" onClick={() => void onLogout()}>로그아웃</button>
      </> : <>
        {recoveryCode ? <>
          <span className="section-kicker">RECOVERY KEY</span>
          <h2 id="auth-title">{pendingUser ? "복구 코드를 저장해 주세요" : "비밀번호가 변경됐어요"}</h2>
          <p className="auth-description">이 코드는 다시 표시되지 않습니다. 안전한 곳에 보관해 주세요.</p>
          <RecoveryCodeCard code={recoveryCode} />
          <button className="auth-primary" onClick={() => pendingUser ? void onAuthenticated(pendingUser) : (setMode("login"), setRecoveryCode(""), setPassword(""), setRecoveryInput(""))}>{pendingUser ? "저장했어요, 시작하기" : "로그인으로 돌아가기"}</button>
        </> : <>
          <span className="section-kicker">TIMEIT</span>
          <h2 id="auth-title">{mode === "login" ? "로그인" : mode === "signup" ? "타임잇 시작하기" : "비밀번호 찾기"}</h2>
          <p className="auth-description">{mode === "login" ? "저장한 공부 기록을 불러와 바로 이어서 시작하세요." : mode === "signup" ? "기록을 안전하게 저장하고 다른 기기에서도 이어서 사용할 수 있어요." : "가입 이메일과 보관해 둔 복구 코드로 새 비밀번호를 설정하세요."}</p>
          {mode !== "reset" && <>
            <div className={`google-signin-host ${busy ? "is-busy" : ""}`} ref={googleButtonRef} aria-label="Google 계정으로 계속하기" />
            <div className="auth-divider"><span>또는 이메일로 계속</span></div>
          </>}
          {mode !== "reset" && <div className="auth-tabs" role="tablist">
            <button role="tab" aria-selected={mode === "login"} className={mode === "login" ? "selected" : ""} onClick={() => { setMode("login"); setError(""); }}>로그인</button>
            <button role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "selected" : ""} onClick={() => { setMode("signup"); setError(""); }}>회원가입</button>
          </div>}
          <form className="auth-form" onSubmit={submit}>
            {mode === "signup" && <label><span>이름</span><input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="사용할 이름" minLength={2} maxLength={24} autoFocus required /></label>}
            <label><span>이메일</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="name@example.com" autoFocus={mode !== "signup"} required /></label>
            {mode === "reset" && <label><span>복구 코드</span><input value={recoveryInput} onChange={(event) => setRecoveryInput(event.target.value.toUpperCase())} autoComplete="off" placeholder="XXXX-XXXX-XXXX-XXXX" required /></label>}
            <label><span>{mode === "reset" ? "새 비밀번호" : "비밀번호"}</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="8자 이상" minLength={8} maxLength={128} required /></label>
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button className="auth-primary" type="submit" disabled={busy}>{busy ? "확인 중…" : mode === "login" ? "로그인" : mode === "signup" ? "회원가입" : "새 비밀번호 설정"}</button>
          </form>
          <small className="auth-security-note">비밀번호는 암호화되어 안전하게 보관됩니다.</small>
          {mode === "login" ? <button className="forgot-password-button" onClick={() => { setMode("reset"); setError(""); setPassword(""); }}>비밀번호를 잊으셨나요? <b>비밀번호 찾기</b></button> : mode === "reset" ? <button className="forgot-password-button" onClick={() => { setMode("login"); setError(""); }}>로그인으로 돌아가기</button> : null}
        </>}
      </>}
    </section>
  </div>;
}

function RecoveryCodeCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return <div className="recovery-code-card">
    <span>내 복구 코드</span>
    <strong>{code}</strong>
    <button type="button" onClick={() => { void navigator.clipboard?.writeText(code); setCopied(true); }}>{copied ? "복사됨" : "코드 복사"}</button>
  </div>;
}

function HomeScreen({ totalToday, todos, subjects, selectedSubject, setSelectedSubject, toggleTodo, deleteTodo, isAdding, setIsAdding, newTodo, setNewTodo, addTodo, onTimer, onNavigate }: { totalToday: number; todos: Todo[]; subjects: Subject[]; selectedSubject: string; setSelectedSubject: (value: string) => void; toggleTodo: (id: number) => void; deleteTodo: (id: number) => void; isAdding: boolean; setIsAdding: (value: boolean) => void; newTodo: string; setNewTodo: (value: string) => void; addTodo: () => void; onTimer: (subject?: string) => void; onNavigate: (screen: Screen) => void }) {
  return <section className="home-v3">
    <div className="home-date-row"><span>{todayLabel()}</span></div>
    <section className="home-study-bottom">
      <div className="home-study-total"><span>오늘 순공 시간</span><strong>{formatDuration(totalToday * 60)}</strong><button onClick={() => onNavigate("stats")}>통계 →</button></div>
      <div className="home-quick-subjects">{subjects.map((subject) => <button key={subject.id} onClick={() => onTimer(subject.id)}><i style={{ background: subject.color }} /><span>{subject.name}</span><small>{formatMinutes(subject.minutes)}</small><b>▶</b></button>)}</div>
      <button className="home-start-button" onClick={() => onTimer()}><span>▶</span> 지금 집중 시작하기</button>
    </section>
    <TodoListCard className="home-todo-card" todos={todos} subjects={subjects} selectedSubject={selectedSubject} setSelectedSubject={setSelectedSubject} toggleTodo={toggleTodo} deleteTodo={deleteTodo} isAdding={isAdding} setIsAdding={setIsAdding} newTodo={newTodo} setNewTodo={setNewTodo} addTodo={addTodo} />
  </section>;
}

function PlannerScreen({ plannerDate, onPlannerDateChange, subjects, studyLogs, onAddStudyLog, onUpdateStudyLog, onDeleteStudyLog }: { plannerDate: string; onPlannerDateChange: (value: string) => void; subjects: Subject[]; studyLogs: StudyLog[]; onAddStudyLog: (log: StudyLog) => void; onUpdateStudyLog: (id: string, log: Pick<StudyLog, "subjectId" | "startMinutes" | "durationMinutes">) => void; onDeleteStudyLog: (id: string) => void }) {
  const selectedLogs = studyLogs.filter((log) => logDateKey(log) === plannerDate);
  const selectedTotal = selectedLogs.reduce((sum, log) => sum + loggedMinutes(log), 0);
  const addLogForSelectedDate = (log: StudyLog) => onAddStudyLog({ ...log, recordedAt: recordedAtForDate(plannerDate, log.startMinutes) });
  return <section className="planner-only"><TimelineGrid plannerDate={plannerDate} onPlannerDateChange={onPlannerDateChange} selectedTotal={selectedTotal} subjects={subjects} studyLogs={selectedLogs} onAddStudyLog={addLogForSelectedDate} onUpdateStudyLog={onUpdateStudyLog} onDeleteStudyLog={onDeleteStudyLog} /></section>;
}

function TodoListCard({ className = "", todos, subjects, selectedSubject, setSelectedSubject, toggleTodo, deleteTodo, isAdding, setIsAdding, newTodo, setNewTodo, addTodo }: { className?: string; todos: Todo[]; subjects: Subject[]; selectedSubject: string; setSelectedSubject: (value: string) => void; toggleTodo: (id: number) => void; deleteTodo: (id: number) => void; isAdding: boolean; setIsAdding: (value: boolean) => void; newTodo: string; setNewTodo: (value: string) => void; addTodo: () => void }) {
  return <section className={`planner-card todo-card ${className}`}>
    <div className="planner-card-header"><div><span className="section-kicker">MY TO-DO</span><h2>오늘 꼭 해낼 것</h2></div><span className="count-pill">{todos.filter((todo) => todo.done).length}/{todos.length}</span></div>
    <div className="todo-list">{todos.length ? todos.map((todo) => { const subject = subjects.find((item) => item.id === todo.subject) ?? subjects[0]; return <article className={`todo-row ${todo.done ? "completed" : ""}`} key={todo.id}><button className="todo-toggle" onClick={() => toggleTodo(todo.id)} aria-label={`${todo.text} ${todo.done ? "미완료로 변경" : "완료로 변경"}`}><span className="check-box">✓</span><span className="todo-color" style={{ background: subject.color }} /><span className="todo-copy"><b>{todo.text}</b><small>{subject.name} · {todo.due}</small></span>{todo.priority && <span className="priority">중요</span>}</button><button className="todo-delete" onClick={() => deleteTodo(todo.id)} aria-label={`${todo.text} 삭제`}>×</button></article>; }) : <div className="todo-empty"><b>오늘 할 일을 적어보세요.</b><span>작은 계획 하나부터 시작하면 충분해요.</span></div>}</div>
    {isAdding ? <div className="add-todo"><select value={selectedSubject} onChange={(event) => setSelectedSubject(event.target.value)}>{subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}</select><input autoFocus value={newTodo} onChange={(event) => setNewTodo(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addTodo(); }} placeholder="예: 수능특강 2강 풀기" /><button onClick={addTodo}>추가</button></div> : <button className="add-line" onClick={() => setIsAdding(true)}>＋ 오늘의 할 일 추가</button>}
  </section>;
}

function TimelineGrid({ plannerDate, onPlannerDateChange, selectedTotal, subjects, studyLogs, onAddStudyLog, onUpdateStudyLog, onDeleteStudyLog }: { plannerDate: string; onPlannerDateChange: (value: string) => void; selectedTotal: number; subjects: Subject[]; studyLogs: StudyLog[]; onAddStudyLog: (log: StudyLog) => void; onUpdateStudyLog: (id: string, log: Pick<StudyLog, "subjectId" | "startMinutes" | "durationMinutes">) => void; onDeleteStudyLog: (id: string) => void }) {
  const slots = Array.from({ length: 144 }, (_, index) => index);
  const hours = Array.from({ length: 24 }, (_, index) => index);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [isDateEditing, setIsDateEditing] = useState(false);
  const [dateDraft, setDateDraft] = useState(plannerDate);
  const [draft, setDraft] = useState({ subjectId: subjects[0]?.id ?? "math", startTime: "08:00", duration: 60 });
  const [editorError, setEditorError] = useState("");
  const slotLog = (slot: number) => studyLogs.find((log) => {
    const minute = slot * 10;
    return minute >= log.startMinutes && minute < log.startMinutes + log.durationMinutes;
  });

  const openNewLog = () => {
    setEditingLogId("new");
    setDraft({ subjectId: subjects[0]?.id ?? "math", startTime: "08:00", duration: 60 });
    setEditorError("");
  };

  const openExistingLog = (log: StudyLog) => {
    if (log.id === "live-session") return;
    setEditingLogId(log.id);
    setDraft({ subjectId: log.subjectId, startTime: clockFromMinutes(log.startMinutes), duration: Math.max(1, Math.round(loggedMinutes(log))) });
    setEditorError("");
  };

  const saveLog = () => {
    if (!editingLogId) return;
    const durationMinutes = Math.max(1, Math.min(1440, Math.round(draft.duration)));
    const startMinutes = minutesFromClock(draft.startTime);
    if (startMinutes + durationMinutes > 1440) {
      setEditorError("공부 기록이 자정을 넘지 않도록 시간을 조정해 주세요.");
      return;
    }
    const hasOverlap = studyLogs.some((log) => (
      log.id !== "live-session"
      && log.id !== editingLogId
      && startMinutes < log.startMinutes + Math.max(1, loggedMinutes(log))
      && startMinutes + durationMinutes > log.startMinutes
    ));
    if (hasOverlap) {
      setEditorError("같은 시간대에 이미 기록이 있어요. 시작 시간이나 공부 시간을 조정해 주세요.");
      return;
    }
    const next = { subjectId: draft.subjectId, startMinutes, durationMinutes };
    if (editingLogId === "new") onAddStudyLog({ id: `manual-${Date.now()}`, ...next, trackedMinutes: durationMinutes });
    else onUpdateStudyLog(editingLogId, next);
    setEditingLogId(null);
    setEditorError("");
  };

  const deleteLog = () => {
    if (!editingLogId || editingLogId === "new") return;
    onDeleteStudyLog(editingLogId);
    setEditingLogId(null);
    setEditorError("");
  };

  const changeDate = (nextDate: string) => {
    onPlannerDateChange(nextDate);
    setDateDraft(nextDate);
    setEditingLogId(null);
  };

  const finishDateEditing = () => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateDraft)) changeDate(dateDraft);
    else setDateDraft(plannerDate);
    setIsDateEditing(false);
  };

  return <section className="planner-card timetable-card">
    <div className="planner-card-header timetable-heading">
      <div className="timeline-title"><span className="section-kicker">STUDY TIMELINE</span><div className="timeline-date-nav"><button className="date-arrow" onClick={() => changeDate(shiftDateKey(plannerDate, -1))} aria-label="이전 날짜">‹</button>{isDateEditing ? <input autoFocus type="date" value={dateDraft} onChange={(event) => setDateDraft(event.target.value)} onBlur={finishDateEditing} onKeyDown={(event) => { if (event.key === "Enter") finishDateEditing(); if (event.key === "Escape") { setDateDraft(plannerDate); setIsDateEditing(false); } }} aria-label="플래너 날짜 직접 입력" /> : <button className="timeline-date-button" onClick={() => { setDateDraft(plannerDate); setIsDateEditing(true); }}><h2>{dateLabelFromKey(plannerDate)}</h2></button>}<button className="date-arrow" onClick={() => changeDate(shiftDateKey(plannerDate, 1))} aria-label="다음 날짜">›</button></div><small>날짜를 눌러 직접 입력 · 24시간 10분 단위</small></div>
      <div className="timeline-header-side"><button className="timeline-edit-toggle" onClick={() => { setIsEditorOpen((value) => !value); setEditingLogId(null); }}>기록 수정</button><span className="timeline-today-time">{plannerDate === dateKey() ? "오늘" : "선택일"} 순공 <b>{formatDuration(selectedTotal * 60)}</b></span></div>
    </div>
    <div className="timeline-legend">{subjects.map((subject) => <span key={subject.id}><i style={{ background: subject.color }} />{subject.name}</span>)}</div>
    <p className="timetable-helper">타이머 기록이 과목 색상의 형광펜 칸으로 채워져요.</p>
    <div className="time-table-scroll" aria-label="24시간 10분 단위 학습 시간표">
      {isEditorOpen && <section className="timeline-editor" aria-label="타임테이블 기록 수정">
        <div className="timeline-editor-head"><div><span>STUDY RECORDS</span><strong>기록을 추가하거나 수정하세요</strong></div><button onClick={openNewLog}>+ 기록 추가</button></div>
        <div className="timeline-record-list">{studyLogs.filter((log) => log.id !== "live-session").sort((a, b) => a.startMinutes - b.startMinutes).map((log) => { const subject = subjects.find((item) => item.id === log.subjectId); return <button className={editingLogId === log.id ? "selected" : ""} onClick={() => openExistingLog(log)} key={log.id}><i style={{ background: subject?.color }} /><span>{clockFromMinutes(log.startMinutes)} · {formatMinutes(loggedMinutes(log))}</span><b>{subject?.name}</b></button>; })}</div>
        {editingLogId && <div className="timeline-edit-form"><label>과목<select value={draft.subjectId} onChange={(event) => setDraft((value) => ({ ...value, subjectId: event.target.value }))}>{subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}</select></label><label>시작 시간<input type="time" value={draft.startTime} onChange={(event) => setDraft((value) => ({ ...value, startTime: event.target.value }))} /></label><label>공부 시간 (분)<input type="number" min="1" max="1440" step="1" value={draft.duration} onChange={(event) => setDraft((value) => ({ ...value, duration: Number(event.target.value) || 1 }))} /></label>{editorError && <p className="timeline-editor-error" role="alert">{editorError}</p>}<div className="timeline-edit-buttons"><button className="timeline-save" onClick={saveLog}>{editingLogId === "new" ? "기록 추가" : "수정 완료"}</button>{editingLogId !== "new" && <button className="timeline-delete" onClick={deleteLog}>기록 삭제</button>}</div></div>}
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
    <section className="subject-timer-list"><div className="subject-list-heading"><div><span className="section-kicker">SUBJECT TIMER</span><h2>과목별 집중 시간</h2></div><span>오늘 기록 · 한 과목씩 자동 저장</span></div>{subjects.map((subject) => { const isActive = subject.id === selectedSubject; return <article key={subject.id} className={`subject-timer-row ${isActive ? "active" : ""}`}><span className="subject-token" style={{ background: subject.soft, color: subject.color }}>{subject.short}</span><span className="subject-timer-name"><b>{subject.name}</b><small>{isActive && isRunning ? "현재 측정 중" : "버튼을 눌러 시작"}</small></span><strong>{formatDuration(subject.minutes * 60)}</strong><button className="subject-play" onClick={() => onChooseSubject(subject.id)} aria-label={`${subject.name} ${isActive && isRunning ? "측정 중지" : "측정 시작"}`}>{isActive && isRunning ? "중지" : "시작"}</button></article>; })}</section>
    {savedSession && <div className="saved-toast" role="status">✓ {savedSession}</div>}
  </section>;
}

function StatsScreen({ subjects, studyLogs, calendarSchedules, setCalendarSchedules, googleAccessToken, googleReady, googleAuthBusy, calendarRefreshKey, calendarSyncMessage, onConnectGoogle, onDisconnectGoogle, onRefreshGoogle, onGoogleAuthExpired, onGoogleSyncMessage }: { subjects: Subject[]; studyLogs: StudyLog[]; calendarSchedules: CalendarSchedule[]; setCalendarSchedules: (items: CalendarSchedule[]) => void; googleAccessToken: string | null; googleReady: boolean; googleAuthBusy: boolean; calendarRefreshKey: number; calendarSyncMessage: string; onConnectGoogle: () => void; onDisconnectGoogle: () => void; onRefreshGoogle: () => void; onGoogleAuthExpired: () => void; onGoogleSyncMessage: (message: string) => void }) {
  const [range, setRange] = useState<"week" | "month">("week");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => dateKey());
  const [calendarLoading, setCalendarLoading] = useState(false);
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
  const rangeLabel = range === "week" ? "이번 주" : "이번 달";
  const maxValue = Math.max(...values, 1);
  const calendarYear = calendarMonth.getFullYear();
  const calendarMonthIndex = calendarMonth.getMonth();
  const calendarDayCount = new Date(calendarYear, calendarMonthIndex + 1, 0).getDate();
  const calendarLeading = new Date(calendarYear, calendarMonthIndex, 1).getDay();
  const koreanHolidays = getKoreanHolidays(calendarYear);
  const calendarDays = Array.from({ length: calendarDayCount }, (_, index) => {
    const day = index + 1;
    const date = new Date(calendarYear, calendarMonthIndex, day);
    const key = dateKey(date);
    const minutes = studyLogs.filter((log) => logDateKey(log) === key).reduce((sum, log) => sum + loggedMinutes(log), 0);
    const schedules = calendarSchedules.filter((schedule) => schedule.date === key);
    const holidays = koreanHolidays.get(key) ?? [];
    const weekday = date.getDay();
    return { day, key, hours: minutes / 60, schedules, holidays, weekday, isHoliday: weekday === 0 || holidays.length > 0 };
  });
  const selectedDate = dateFromKey(selectedCalendarDate);
  const selectedHolidays = koreanHolidays.get(selectedCalendarDate) ?? [];
  const selectedSchedules: CalendarSchedule[] = [
    ...selectedHolidays.map((holiday, index) => ({ id: `holiday-${selectedCalendarDate}-${index}`, title: holiday.name, description: holiday.description, date: selectedCalendarDate, kind: "holiday" as const })),
    ...(selectedDate.getDay() === 0 && selectedHolidays.length === 0 ? [{ id: `sunday-${selectedCalendarDate}`, title: "일요일", description: "한 주의 정기 휴일", date: selectedCalendarDate, kind: "holiday" as const }] : []),
    ...calendarSchedules.filter((schedule) => schedule.date === selectedCalendarDate),
  ];
  const selectedStudyMinutes = studyLogs.filter((log) => logDateKey(log) === selectedCalendarDate).reduce((sum, log) => sum + loggedMinutes(log), 0);
  const moveCalendarMonth = (amount: number) => {
    const next = new Date(calendarYear, calendarMonthIndex + amount, 1);
    setCalendarMonth(next);
    setSelectedCalendarDate(dateKey(next));
  };

  useEffect(() => {
    if (!googleAccessToken) {
      setCalendarSchedules([]);
      return;
    }
    let active = true;
    setCalendarLoading(true);
    fetchGoogleCalendarMonth(googleAccessToken, calendarMonth)
      .then((items) => {
        if (!active) return;
        setCalendarSchedules(items);
        onGoogleSyncMessage("Google 캘린더와 연결됐어요. 일정과 공부 기록을 함께 보여드려요.");
      })
      .catch((error: Error) => {
        if (!active) return;
        if (error.message === "google-auth-expired") onGoogleAuthExpired();
        else onGoogleSyncMessage("Google 일정을 불러오지 못했어요. 잠시 후 새로고침해 주세요.");
      })
      .finally(() => { if (active) setCalendarLoading(false); });
    return () => { active = false; };
  }, [calendarMonth, calendarRefreshKey, googleAccessToken]);

  return <section className="stats-page">
    <div className="screen-intro"><span className="section-kicker">STUDY INSIGHTS</span><h1>쌓인 시간을<br /><em>눈으로 확인해요.</em></h1></div>
    <article className="stats-highlight"><span>{rangeLabel} 총 집중</span><strong>{formatMinutes(periodTotal)}</strong><p>{periodTotal ? <>기록한 시간만 <b>있는 그대로</b> 보여드려요.</> : <>아직 기록이 없어요. <b>타이머를 시작</b>해보세요.</>}</p></article>
    <article className="analytics-card"><div className="planner-card-header"><div><span className="section-kicker">SUBJECT BALANCE</span><h2>과목별 집중 비율</h2></div><div className="stats-period" role="tablist"><button className={range === "week" ? "selected" : ""} onClick={() => setRange("week")}>이번 주</button><button className={range === "month" ? "selected" : ""} onClick={() => setRange("month")}>이번 달</button></div></div><div className="donut-layout"><div className="donut" style={{ background: donutStyle }}><div><b>{formatMinutes(periodTotal)}</b><small>{rangeLabel} 집중</small></div></div><div className="donut-legend">{bySubject.map(({ subject, minutes }) => <span key={subject.id}><i style={{ background: subject.color }} />{subject.name}<b>{periodTotal ? Math.round(minutes / periodTotal * 100) : 0}%</b></span>)}</div></div></article>
    <article className="analytics-card"><div className="planner-card-header"><div><span className="section-kicker">{range === "week" ? "WEEKLY FLOW" : "MONTHLY FLOW"}</span><h2>{rangeLabel} 학습 리듬</h2></div><b className="soft-strong">{formatMinutes(periodTotal)}</b></div><div className={`stats-bars ${range === "month" ? "month-bars" : ""}`}>{values.map((value, index) => <div key={index}><i style={{ height: `${Math.max(value / maxValue * 100, value ? 3 : 0)}%` }} /><span>{range === "week" ? weekdays[days[index].getDay()] : `${index + 1}주`}</span></div>)}</div></article>
    <article className="analytics-card study-calendar-card">
      <div className="calendar-title-row"><div><span className="section-kicker">STUDY CALENDAR</span><h2>캘린더</h2></div><button className={`google-calendar-button ${googleAccessToken ? "connected" : ""}`} onClick={googleAccessToken ? onRefreshGoogle : onConnectGoogle} disabled={googleAuthBusy || (!googleReady && !googleAccessToken)}><CalendarDays aria-hidden="true" />{googleAuthBusy ? "연결 중" : googleAccessToken ? (calendarLoading ? "동기화 중" : "일정 새로고침") : "Google 캘린더 연결"}</button></div>
      <div className="calendar-month-nav"><button onClick={() => moveCalendarMonth(-1)} aria-label="이전 달">‹</button><strong>{calendarYear}년 {calendarMonthIndex + 1}월</strong><button onClick={() => moveCalendarMonth(1)} aria-label="다음 달">›</button></div>
      <div className="study-calendar-weekdays">{["일", "월", "화", "수", "목", "금", "토"].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="study-calendar-grid">{Array.from({ length: calendarLeading }, (_, index) => <span className="calendar-blank" key={`blank-${index}`} />)}{calendarDays.map((item) => <button className={`calendar-day grass-${grassLevel(item.hours)} ${item.weekday === 6 ? "saturday" : ""} ${item.isHoliday ? "holiday" : ""} ${selectedCalendarDate === item.key ? "selected" : ""} ${item.key === dateKey() ? "today" : ""}`} onClick={() => setSelectedCalendarDate(item.key)} key={item.key}><b>{item.day}</b><span className="calendar-day-meta">{item.holidays[0] && <small className="holiday-name">{item.holidays[0].name}</small>}{item.hours > 0 && <small>{displayHours(item.hours)}</small>}</span>{item.schedules.length > 0 && <i>{item.schedules.length}</i>}</button>)}</div>
      <div className="calendar-day-detail"><div><span>{selectedCalendarDate.replaceAll("-", ".")}</span><b>{formatMinutes(selectedStudyMinutes)} 집중</b></div>{selectedSchedules.length ? <ul>{selectedSchedules.map((schedule) => <li className={schedule.kind === "holiday" ? "holiday-schedule" : ""} key={schedule.id}><time>{schedule.kind === "holiday" ? "공휴일" : schedule.time ?? "종일"}</time><span><b>{schedule.title}</b>{schedule.description && <small>{schedule.description}</small>}</span></li>)}</ul> : <p>{googleAccessToken ? "이날 등록된 Google 일정이 없어요." : "Google 캘린더를 연결하면 휴대폰 일정이 보여요."}</p>}</div>
      <div className="calendar-sync-note"><span>{calendarSyncMessage}</span>{googleAccessToken && <button onClick={onDisconnectGoogle}>연결 해제</button>}</div>
    </article>
  </section>;
}

function SettingsPanel({ subjects, onAddSubject, onDeleteSubject, isDark, setIsDark, plannerTheme, setPlannerTheme, profileName, setProfileName, profileColor, setProfileColor }: { subjects: Subject[]; onAddSubject: (name: string) => void; onDeleteSubject: (id: string) => void; isDark: boolean; setIsDark: (value: boolean) => void; plannerTheme: PlannerTheme; setPlannerTheme: (value: PlannerTheme) => void; profileName: string; setProfileName: (value: string) => void; profileColor: string; setProfileColor: (value: string) => void }) {
  const [isProfileEditing, setIsProfileEditing] = useState(false);
  const [isSubjectEditing, setIsSubjectEditing] = useState(false);
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [subjectName, setSubjectName] = useState("");
  const themes: { id: PlannerTheme; label: string; description: string }[] = [
    { id: "milk", label: "웜 베이지", description: "가장 편안한 크림빛 배경" },
    { id: "fog", label: "포그 블루", description: "집중을 방해하지 않는 회청색 배경" },
    { id: "rose", label: "더스티 로즈", description: "채도를 낮춘 차분한 로즈 배경" },
  ];
  const selectedTheme = themes.find((theme) => theme.id === plannerTheme)!;

  return <section className="settings-page settings-v2">
    <div className="screen-intro"><span className="section-kicker">MY SPACE</span><h1>공부할 공간을<br /><em>가볍게 정리해요.</em></h1></div>
    <article className={`profile-card profile-editor ${isProfileEditing ? "editing" : ""}`}><div className="large-avatar" style={{ background: profileColor }}>{profileName.trim().slice(0, 1) || "나"}</div><div><h2>{profileName.trim() ? `${profileName.trim()}님의 타임잇` : "나의 타임잇"}</h2><p>{isProfileEditing ? "이름과 색상을 바꾼 뒤 완료를 눌러주세요." : "나만의 프로필을 설정해보세요."}</p></div><button className="profile-edit-button" onClick={() => setIsProfileEditing((value) => !value)}>{isProfileEditing ? "완료" : "수정"}</button>{isProfileEditing && <><label className="profile-name-field"><span>이름</span><input value={profileName} maxLength={10} onChange={(event) => setProfileName(event.target.value)} aria-label="프로필 이름" /></label><div className="profile-color-row" aria-label="프로필 색상">{["#e5a089", "#8d9bc4", "#7eae99", "#b78aac", "#8b827c"].map((color) => <button className={profileColor === color ? "selected" : ""} onClick={() => setProfileColor(color)} style={{ background: color }} aria-label={`${color} 프로필 색상`} key={color} />)}</div></>}</article>
    <section className="settings-group settings-subjects"><div className="settings-subjects-head"><span>과목 관리</span><button onClick={() => setIsSubjectEditing((value) => !value)}>{isSubjectEditing ? "완료" : "수정"}</button></div>{subjects.map((subject) => <div className="settings-subject" key={subject.id}><i style={{ background: subject.color }} /><span className="settings-subject-copy"><b>{subject.name}</b><small>{formatMinutes(subject.minutes)} 기록됨</small></span>{isSubjectEditing && <button className="subject-delete-button" onClick={() => onDeleteSubject(subject.id)} disabled={subjects.length === 1}>삭제</button>}</div>)}<div className="add-todo"><input value={subjectName} maxLength={12} onChange={(event) => setSubjectName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { onAddSubject(subjectName); setSubjectName(""); } }} placeholder="새 과목 이름" /><button onClick={() => { onAddSubject(subjectName); setSubjectName(""); }}>추가</button></div></section>
    <section className="settings-group"><span>화면 설정</span><button onClick={() => setIsDark(!isDark)}><i className="theme-icon">{isDark ? "☾" : "☀"}</i><b>다크 모드</b><span className={`toggle ${isDark ? "on" : ""}`}><i /></span></button><button onClick={() => setIsThemeOpen((value) => !value)}><i className="theme-icon">✦</i><b>플래너 테마</b><small>{selectedTheme.label}</small><strong>›</strong></button>{isThemeOpen && <div className="planner-theme-options">{themes.map((theme) => <button key={theme.id} className={plannerTheme === theme.id ? "selected" : ""} onClick={() => { setPlannerTheme(theme.id); setIsThemeOpen(false); }}><i className={`theme-swatch ${theme.id}`} /><span><b>{theme.label}</b><small>{theme.description}</small></span><strong>{plannerTheme === theme.id ? "✓" : ""}</strong></button>)}</div>}</section>
  </section>;
}
