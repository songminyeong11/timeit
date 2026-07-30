"use client";

import { ArrowLeft, Check, Copy, Crown, LockKeyhole, Plus, Search, Send, UsersRound, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type GroupUser = {
  id: string;
  name: string;
  birthDate: string | null;
};

type GroupSummary = {
  id: string;
  name: string;
  description: string;
  category: string;
  targetGrade: string | null;
  visibility: "public" | "private";
  joinCode?: string;
  dailyTargetMinutes: number;
  maxMembers: number;
  memberCount: number;
  role?: "owner" | "member";
};

type GroupMember = {
  id: string;
  name: string;
  grade: string | null;
  role: "owner" | "member";
  todaySeconds: number;
  isStudying: boolean;
  subjectName: string | null;
  elapsedSeconds: number;
  isMe: boolean;
};

type GroupPost = {
  id: string;
  body: string;
  createdAt: number;
  authorId: string;
  authorName: string;
};

type GroupDetail = {
  group: GroupSummary & { ownerId: string; createdAt: number; role: "owner" | "member"; joinCode: string };
  members: GroupMember[];
  posts: GroupPost[];
};

type GroupsPayload = {
  myGroups: GroupSummary[];
  recommended: GroupSummary[];
  grade: string | null;
};

function formatStudyTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  if (hours > 0) return `${hours}시간 ${String(minutes).padStart(2, "0")}분`;
  return `${minutes}분`;
}

function shortElapsed(seconds: number) {
  const minutes = Math.max(0, Math.floor(seconds / 60));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}:${String(minutes % 60).padStart(2, "0")}` : `${minutes}분`;
}

async function requestJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "요청을 완료하지 못했어요.");
  return payload;
}

export function GroupScreen({ user, onOpenAccount }: { user: GroupUser | null; onOpenAccount: () => void }) {
  const [groups, setGroups] = useState<GroupsPayload>({ myGroups: [], recommended: [], grade: null });
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [listTab, setListTab] = useState<"mine" | "discover">("mine");
  const [roomTab, setRoomTab] = useState<"live" | "rank" | "lounge">("live");
  const [dialog, setDialog] = useState<"create" | "join" | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const loadGroups = async () => {
    if (!user) return;
    setLoading(true);
    try {
      setGroups(await requestJson<GroupsPayload>("/api/groups"));
      setMessage("");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "그룹을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (groupId: string, quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const nextDetail = await requestJson<GroupDetail>(`/api/groups/${groupId}`);
      setDetail(nextDetail);
      setSelectedGroupId(groupId);
      setMessage("");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "그룹 정보를 불러오지 못했어요.");
      if (!quiet) setSelectedGroupId(null);
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    void loadGroups();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!selectedGroupId) return;
    const timer = window.setInterval(() => void loadDetail(selectedGroupId, true), 30_000);
    return () => window.clearInterval(timer);
  }, [selectedGroupId]);

  if (!user) {
    return <section className="groups-page">
      <div className="screen-intro group-intro"><span>함께 집중하기</span><h1>혼자보다 오래,<br /><em>같이 공부해요.</em></h1></div>
      <article className="group-auth-card">
        <UsersRound aria-hidden="true" />
        <h2>로그인 후 그룹을 시작할 수 있어요</h2>
        <p>친구의 집중 상태를 보고, 오늘 공부 시간을 함께 쌓아보세요.</p>
        <button onClick={onOpenAccount}>로그인 · 회원가입</button>
      </article>
    </section>;
  }

  if (!user.birthDate) {
    return <section className="groups-page">
      <div className="screen-intro group-intro"><span>학년 맞춤 그룹</span><h1>나와 같은 학년을<br /><em>먼저 연결할게요.</em></h1></div>
      <article className="group-auth-card grade-onboarding">
        <div className="grade-mark">학년</div>
        <h2>생년월일을 한 번만 입력해 주세요</h2>
        <p>프로필에 저장된 생년월일로 현재 학년을 계산해 관련 그룹을 우선 추천합니다. 생년월일은 그룹원에게 공개되지 않아요.</p>
        <button onClick={onOpenAccount}>계정 정보에서 입력</button>
      </article>
    </section>;
  }

  if (selectedGroupId && detail) {
    return <GroupRoom
      detail={detail}
      tab={roomTab}
      setTab={setRoomTab}
      onBack={() => { setSelectedGroupId(null); setDetail(null); setRoomTab("live"); void loadGroups(); }}
      onRefresh={() => void loadDetail(selectedGroupId)}
      onLeave={async () => {
        const wording = detail.group.role === "owner" ? "그룹과 모든 게시글을 삭제할까요?" : "이 그룹에서 나갈까요?";
        if (!window.confirm(wording)) return;
        await requestJson<{ ok: true }>(`/api/groups/${selectedGroupId}`, { method: "DELETE" });
        setSelectedGroupId(null);
        setDetail(null);
        await loadGroups();
      }}
    />;
  }

  const visibleGroups = listTab === "mine" ? groups.myGroups : groups.recommended;

  return <section className="groups-page">
    <div className="screen-intro group-intro">
      <span>같이 만드는 공부 리듬</span>
      <h1>지금 공부 중인 친구가<br /><em>동기가 돼요.</em></h1>
      <div className="group-intro-meta"><b>{groups.grade ?? "학년 미설정"}</b><span>내 그룹 {groups.myGroups.length}</span></div>
    </div>

    <div className="group-toolbar">
      <div className="group-list-tabs" role="tablist" aria-label="그룹 보기">
        <button className={listTab === "mine" ? "selected" : ""} onClick={() => setListTab("mine")} role="tab" aria-selected={listTab === "mine"}>내 그룹</button>
        <button className={listTab === "discover" ? "selected" : ""} onClick={() => setListTab("discover")} role="tab" aria-selected={listTab === "discover"}>둘러보기</button>
      </div>
      <button className="group-tool-button" onClick={() => setDialog("join")} aria-label="초대 코드로 가입"><Search aria-hidden="true" /></button>
      <button className="group-tool-button primary" onClick={() => setDialog("create")} aria-label="새 그룹 만들기"><Plus aria-hidden="true" /></button>
    </div>

    {message && <p className="group-message" role="status">{message}</p>}
    <div className={`group-card-list ${loading ? "loading" : ""}`}>
      {visibleGroups.map((group) => (
        <button className="group-summary-card" key={group.id} onClick={() => void loadDetail(group.id)}>
          <div className="group-card-line">
            <span>{group.category}</span>
            {group.visibility === "private" && <LockKeyhole aria-label="비공개 그룹" />}
            {group.role === "owner" && <small>내가 만든 그룹</small>}
          </div>
          <h2>{group.name}</h2>
          <p>{group.description}</p>
          <div className="group-card-foot">
            <span><UsersRound aria-hidden="true" /> {group.memberCount}/{group.maxMembers}</span>
            <span>{group.targetGrade || "누구나"}</span>
            <b>하루 {formatStudyTime(group.dailyTargetMinutes * 60)}</b>
          </div>
        </button>
      ))}
      {!loading && visibleGroups.length === 0 && <div className="group-empty-state">
        <UsersRound aria-hidden="true" />
        <strong>{listTab === "mine" ? "아직 가입한 그룹이 없어요" : "지금 추천할 그룹이 없어요"}</strong>
        <p>{listTab === "mine" ? "같은 목표를 가진 친구들과 첫 그룹을 만들어보세요." : "초대 코드로 가입하거나 새 그룹을 직접 만들 수 있어요."}</p>
        <button onClick={() => setDialog("create")}>그룹 만들기</button>
      </div>}
    </div>

    {dialog && <GroupDialog
      mode={dialog}
      grade={groups.grade}
      onClose={() => setDialog(null)}
      onDone={async (groupId) => {
        setDialog(null);
        await loadGroups();
        await loadDetail(groupId);
      }}
    />}
  </section>;
}

function GroupDialog({ mode, grade, onClose, onDone }: { mode: "create" | "join"; grade: string | null; onClose: () => void; onDone: (groupId: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("내신");
  const [targetGrade, setTargetGrade] = useState(grade ?? "");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [dailyTargetMinutes, setDailyTargetMinutes] = useState(240);
  const [maxMembers, setMaxMembers] = useState(20);
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "join") {
        const payload = await requestJson<{ groupId: string }>("/api/groups/join", {
          method: "POST",
          body: JSON.stringify({ joinCode }),
        });
        await onDone(payload.groupId);
      } else {
        const payload = await requestJson<{ groupId: string }>("/api/groups", {
          method: "POST",
          body: JSON.stringify({ name, description, category, targetGrade, visibility, dailyTargetMinutes, maxMembers }),
        });
        await onDone(payload.groupId);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "요청을 완료하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  return <div className="group-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="group-dialog" onSubmit={submit}>
      <div className="group-dialog-head">
        <div><span>{mode === "create" ? "새로운 공부방" : "초대받은 공부방"}</span><h2>{mode === "create" ? "그룹 만들기" : "초대 코드로 가입"}</h2></div>
        <button type="button" onClick={onClose} aria-label="닫기">×</button>
      </div>
      {mode === "join" ? <label>
        <span>8자리 초대 코드</span>
        <input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))} placeholder="ABCD1234" autoFocus required />
      </label> : <>
        <label><span>그룹 이름</span><input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={24} placeholder="예: 고3 수능 루틴" autoFocus required /></label>
        <label><span>한 줄 소개</span><input value={description} onChange={(event) => setDescription(event.target.value)} minLength={2} maxLength={80} placeholder="매일 조용히 순공을 쌓는 그룹" required /></label>
        <div className="group-dialog-grid">
          <label><span>분야</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{["내신", "수능", "자격증", "공무원", "어학", "기타"].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>추천 학년</span><select value={targetGrade} onChange={(event) => setTargetGrade(event.target.value)}><option value="">누구나</option>{["초1", "초2", "초3", "초4", "초5", "초6", "중1", "중2", "중3", "고1", "고2", "고3", "대학생·일반"].map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>
        <div className="group-dialog-grid">
          <label><span>하루 기준 시간</span><select value={dailyTargetMinutes} onChange={(event) => setDailyTargetMinutes(Number(event.target.value))}>{[120, 180, 240, 300, 360, 480, 600].map((minutes) => <option value={minutes} key={minutes}>{formatStudyTime(minutes * 60)}</option>)}</select></label>
          <label><span>정원</span><select value={maxMembers} onChange={(event) => setMaxMembers(Number(event.target.value))}>{[5, 10, 20, 30, 50].map((count) => <option value={count} key={count}>{count}명</option>)}</select></label>
        </div>
        <div className="group-visibility">
          <button type="button" className={visibility === "public" ? "selected" : ""} onClick={() => setVisibility("public")}><span>공개</span><small>추천 목록에서 가입</small></button>
          <button type="button" className={visibility === "private" ? "selected" : ""} onClick={() => setVisibility("private")}><span>비공개</span><small>코드가 있어야 가입</small></button>
        </div>
      </>}
      {error && <p className="group-dialog-error" role="alert">{error}</p>}
      <button className="group-dialog-submit" disabled={busy}>{busy ? "처리 중…" : mode === "create" ? "그룹 만들기" : "가입하기"}</button>
    </form>
  </div>;
}

function GroupRoom({ detail, tab, setTab, onBack, onRefresh, onLeave }: {
  detail: GroupDetail;
  tab: "live" | "rank" | "lounge";
  setTab: (tab: "live" | "rank" | "lounge") => void;
  onBack: () => void;
  onRefresh: () => void;
  onLeave: () => Promise<void>;
}) {
  const [postBody, setPostBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const studying = detail.members.filter((member) => member.isStudying);
  const groupTotal = detail.members.reduce((sum, member) => sum + member.todaySeconds, 0);
  const targetSeconds = detail.group.dailyTargetMinutes * 60;
  const sortedLive = useMemo(() => [...detail.members].sort((a, b) => Number(b.isStudying) - Number(a.isStudying) || b.todaySeconds - a.todaySeconds), [detail.members]);

  const submitPost = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!postBody.trim()) return;
    setPosting(true);
    setError("");
    try {
      await requestJson<{ ok: true }>(`/api/groups/${detail.group.id}/posts`, { method: "POST", body: JSON.stringify({ body: postBody }) });
      setPostBody("");
      onRefresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "메시지를 올리지 못했어요.");
    } finally {
      setPosting(false);
    }
  };

  return <section className="groups-page group-room">
    <header className="group-room-header">
      <button onClick={onBack} aria-label="그룹 목록으로"><ArrowLeft aria-hidden="true" /></button>
      <div><span>{detail.group.category} · {detail.group.targetGrade || "누구나"}</span><h1>{detail.group.name}</h1></div>
      <button className="group-room-more" onClick={() => void onLeave()}>{detail.group.role === "owner" ? "삭제" : "나가기"}</button>
    </header>

    <article className="group-room-hero">
      <div className="group-room-status">
        <span><i /> 지금 {studying.length}명 집중 중</span>
        <b>{detail.members.length}/{detail.group.maxMembers}명</b>
      </div>
      <p>{detail.group.description}</p>
      <div className="group-room-totals">
        <div><span>함께 쌓은 오늘</span><strong>{formatStudyTime(groupTotal)}</strong></div>
        <div><span>내 순위</span><strong>{Math.max(1, detail.members.findIndex((member) => member.isMe) + 1)}위</strong></div>
      </div>
      <div className="group-invite-row">
        <span>초대 코드 <b>{detail.group.joinCode}</b></span>
        <button onClick={() => { void navigator.clipboard?.writeText(detail.group.joinCode); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copied ? "복사됨" : "복사"}
        </button>
      </div>
    </article>

    <div className="group-room-tabs" role="tablist">
      <button className={tab === "live" ? "selected" : ""} onClick={() => setTab("live")} role="tab">집중 현황</button>
      <button className={tab === "rank" ? "selected" : ""} onClick={() => setTab("rank")} role="tab">오늘 순위</button>
      <button className={tab === "lounge" ? "selected" : ""} onClick={() => setTab("lounge")} role="tab">라운지</button>
    </div>

    {tab === "live" && <div className="group-live-list">
      {sortedLive.map((member) => <article className={`group-member-card ${member.isStudying ? "studying" : ""}`} key={member.id}>
        <div className="group-member-avatar">{member.name.slice(0, 1)}</div>
        <div><h3>{member.name}{member.isMe && <small>나</small>}{member.role === "owner" && <Crown aria-label="그룹장" />}</h3><p>{member.isStudying ? `${member.subjectName || "공부"} 집중 중` : `${member.grade || "학년 미설정"} · 오늘 ${formatStudyTime(member.todaySeconds)}`}</p></div>
        <span>{member.isStudying ? <><Zap aria-hidden="true" />{shortElapsed(member.elapsedSeconds)}</> : "휴식 중"}</span>
      </article>)}
    </div>}

    {tab === "rank" && <div className="group-rank-list">
      <div className="group-goal-note"><span>그룹 하루 기준</span><b>1인 {formatStudyTime(targetSeconds)}</b></div>
      {detail.members.map((member, index) => {
        const progress = Math.min(100, member.todaySeconds / targetSeconds * 100);
        return <article className={`group-rank-row ${member.isMe ? "me" : ""}`} key={member.id}>
          <b>{index + 1}</b>
          <div className="group-member-avatar">{member.name.slice(0, 1)}</div>
          <div><h3>{member.name}{member.isMe && <small>나</small>}</h3><span><i style={{ width: `${progress}%` }} /></span></div>
          <strong>{formatStudyTime(member.todaySeconds)}</strong>
        </article>;
      })}
    </div>}

    {tab === "lounge" && <div className="group-lounge">
      <form onSubmit={submitPost}><input value={postBody} onChange={(event) => setPostBody(event.target.value)} maxLength={240} placeholder="오늘의 다짐이나 응원을 남겨보세요" /><button disabled={posting || !postBody.trim()} aria-label="메시지 올리기"><Send aria-hidden="true" /></button></form>
      {error && <p className="group-dialog-error">{error}</p>}
      <div className="group-post-list">
        {detail.posts.map((post) => <article key={post.id}><div className="group-member-avatar">{post.authorName.slice(0, 1)}</div><div><h3>{post.authorName}<time>{new Date(post.createdAt).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></h3><p>{post.body}</p></div></article>)}
        {!detail.posts.length && <div className="group-empty-state compact"><strong>아직 라운지가 조용해요</strong><p>첫 응원 메시지를 남겨보세요.</p></div>}
      </div>
    </div>}
  </section>;
}
