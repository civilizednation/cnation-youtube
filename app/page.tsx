"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { JobState } from "@/lib/types";

function Icon({ name, size = 22 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    down: <><path d="M12 3v12m-5-5 5 5 5-5"/><path d="M4 16v4h16v-4"/></>,
    link: <><path d="m10 13 4-4"/><path d="M8 15 6 17a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 2 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 -1)"/></>,
    check: <path d="m5 12 4 4L19 6"/>, share: <><path d="M12 16V3m-4 4 4-4 4 4"/><path d="M7 10H4v11h16V10h-3"/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/></>,
    phone: <><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 18h4"/></>,
    play: <path d="m9 5 11 7-11 7Z"/>, x: <path d="m6 6 12 12M6 18 18 6"/>, arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.down}</svg>;
}
function sizeLabel(size = 0) { return size >= 1073741824 ? `${(size / 1073741824).toFixed(1)} GB` : `${(size / 1048576).toFixed(1)} MB`; }
function durationLabel(seconds: number) { const m = Math.floor(seconds / 60); return `${m}분 ${Math.floor(seconds % 60)}초`; }
const activePhases = new Set(["preparing", "analyzing", "downloading", "merging", "uploading"]);

export default function Home() {
  const [url, setUrl] = useState("");
  const [code, setCode] = useState("");
  const [session, setSession] = useState<{ configured: boolean; authenticated: boolean } | null>(null);
  const [device, setDevice] = useState("모든 기기에서");
  const [token, setToken] = useState("");
  const [job, setJob] = useState<JobState | null>(null);
  const [quality, setQuality] = useState("");
  const [container, setContainer] = useState("mp4");
  const [destination, setDestination] = useState("photos");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [preparedFile, setPreparedFile] = useState<File | null>(null);
  const [sharing, setSharing] = useState(false);
  const [supportsShare, setSupportsShare] = useState(false);
  const generation = useRef(0);
  const requestAbort = useRef<AbortController | null>(null);
  const preparing = !!job && activePhases.has(job.phase);

  async function api(path: string, options: RequestInit = {}) {
    const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) }, cache: "no-store" });
    const data = await response.json().catch(() => ({ error: "서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요." }));
    if (!response.ok) throw Object.assign(new Error(data.error || "요청을 처리하지 못했습니다."), { status: response.status });
    return data;
  }
  useEffect(() => {
    api("/api/session").then(setSession).catch(() => setError("앱에 연결하지 못했습니다. 새로고침해 주세요."));
    const ua = navigator.userAgent;
    setDevice(/iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ? "아이폰 · 아이패드" : /Android/.test(ua) ? "안드로이드" : "컴퓨터에서도");
    setSupportsShare(typeof navigator.canShare === "function");
    try { const saved = localStorage.getItem("clipdown-job"); if (saved) setToken(saved); } catch {}
    if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => requestAbort.current?.abort();
  }, []);
  const remember = useCallback((value: string) => {
    setToken(value);
    try { if (value) localStorage.setItem("clipdown-job", value); else localStorage.removeItem("clipdown-job"); } catch {}
  }, []);
  useEffect(() => {
    if (!token || !session?.authenticated) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const controller = new AbortController();
    async function poll() {
      try {
        const state: JobState = await api("/api/jobs/status", { headers: { "X-Job-Token": token }, signal: controller.signal });
        if (stopped) return;
        failures = 0; setJob(state);
        if (state.video && state.phase === "ready") setQuality(old => old || state.video!.qualities.find(q => q.height <= 1080)?.id || state.video!.qualities[0]?.id || "");
        if (["complete", "failed", "canceled"].includes(state.phase)) return;
        timer = setTimeout(poll, state.phase === "ready" ? 8000 : 2500);
      } catch (e) {
        if (stopped) return;
        const status = (e as { status?: number }).status;
        if (status === 401) { setSession({ configured: true, authenticated: false }); setError((e as Error).message); return; }
        if (status === 403 || status === 410) { remember(""); setJob(null); setError((e as Error).message); return; }
        failures++;
        if (failures >= 3) setError(`${e instanceof Error ? e.message : "연결이 끊겼습니다."} 잠시 후 다시 연결합니다.`);
        timer = setTimeout(poll, Math.min(15000, 2500 * failures));
      }
    }
    poll();
    return () => { stopped = true; clearTimeout(timer); controller.abort(); };
  }, [token, session?.authenticated]);

  async function unlock(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await api("/api/session", { method: "POST", body: JSON.stringify({ code }) }); setSession({ configured: true, authenticated: true }); setCode(""); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function analyze(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setPreparedFile(null); setQuality("");
    const current = ++generation.current;
    try {
      if (token) await api("/api/jobs/cancel", { method: "POST", headers: { "X-Job-Token": token } });
      remember("");
      setJob({ phase: "preparing", message: "영상을 확인할 준비를 하고 있어요." });
      const data = await api("/api/jobs", { method: "POST", body: JSON.stringify({ url }) });
      if (current === generation.current) remember(data.token);
    } catch (e) { setError((e as Error).message); setJob(null); } finally { setBusy(false); }
  }
  async function download() {
    setBusy(true); setError("");
    try {
      await api("/api/jobs/download", { method: "POST", headers: { "X-Job-Token": token }, body: JSON.stringify({ quality, container, destination }) });
      setJob(old => ({ ...old!, phase: "downloading", message: "선택한 화질로 다운로드를 시작합니다." }));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function cancel() {
    setBusy(true); setError("");
    try { await api("/api/jobs/cancel", { method: "POST", headers: { "X-Job-Token": token } }); generation.current++; remember(""); setJob(null); setPreparedFile(null); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function fileUrl() {
    return (await api("/api/jobs/file", { method: "POST", headers: { "X-Job-Token": token } })).url as string;
  }
  async function saveFile() {
    setBusy(true); setError("");
    try { const href = await fileUrl(); const a = document.createElement("a"); a.href = href; a.download = job?.filename || "video.mp4"; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function prepareShare() {
    setSharing(true); setError("");
    const controller = new AbortController(); requestAbort.current = controller;
    try {
      const response = await fetch(await fileUrl(), { signal: controller.signal });
      if (!response.ok) throw new Error("저장할 영상을 가져오지 못했습니다.");
      const blob = await response.blob();
      const file = new File([blob], job?.filename || "video.mp4", { type: blob.type || "video/mp4" });
      if (!navigator.canShare?.({ files: [file] })) throw new Error("이 브라우저에서는 영상 공유를 지원하지 않습니다. ‘파일로 다운로드’를 이용해 주세요.");
      setPreparedFile(file);
    } catch (e) { if ((e as Error).name !== "AbortError") setError((e as Error).message); } finally { setSharing(false); requestAbort.current = null; }
  }
  async function share() {
    if (!preparedFile) return;
    try { await navigator.share({ files: [preparedFile], title: job?.video?.title || "cnation 유투브 다운로더 영상" }); }
    catch (e) { if ((e as Error).name !== "AbortError") setError("공유 메뉴를 열지 못했습니다. 파일로 다운로드해 주세요."); }
  }
  return <main className="shell">
    <header className="topbar"><a className="brand" href="/" aria-label="cnation 유투브 다운로더 홈"><span className="brand-mark"><Icon name="down"/></span><span className="brand-word"><strong>cnation</strong><small>유투브 다운로더</small></span></a><button className="help-button" onClick={() => setShowHelp(v => !v)} aria-expanded={showHelp}>사용 안내 <span>?</span></button></header>
    <div className="workspace">
      <section className="intro"><span className="eyebrow">YOUR LINK. YOUR QUALITY.</span><h1>좋아하는 영상,<br/><span>내 폰에 저장.</span></h1><p>링크를 붙여넣고 원하는 화질을 선택하세요.</p><div className="device"><Icon name="phone" size={16}/>{device}<span className="device-divider"/>MP4 · MKV</div></section>
      <section className="download-panel" aria-label="영상 다운로드">
        <form onSubmit={analyze} className="link-form"><label htmlFor="youtube-url"><span className="step">01</span> 유튜브 영상 링크</label><div className="url-field"><Icon name="link"/><input id="youtube-url" type="url" inputMode="url" placeholder="https://youtu.be/..." value={url} onChange={e => setUrl(e.target.value)} required maxLength={2048} disabled={preparing || busy} autoComplete="off"/><button type="button" className="paste-button" disabled={preparing || busy} onClick={async () => { try { setUrl(await navigator.clipboard.readText()); } catch { setError("입력 칸을 길게 눌러 링크를 붙여넣어 주세요."); } }}>붙여넣기</button></div><button className="primary analyze-button" disabled={!session?.authenticated || busy || preparing || !url.trim()}>{preparing && ["preparing","analyzing"].includes(job!.phase) ? <><span className="spinner"/>영상 확인 중</> : <>영상 확인 <Icon name="arrow" size={19}/></>}</button></form>
        <p className="small-note">30분 이하 영상 · 최대 500 MB · 인터넷 연결 필요</p>
        {session && !session.configured && <div className="notice setup-notice"><Icon name="lock"/><div><strong>앱 설정을 마무리해 주세요</strong><p>배포 안내서에 따라 접속 코드, Sandbox와 저장소를 연결하면 다운로드할 수 있습니다.</p></div></div>}
        {session?.configured && !session.authenticated && <form onSubmit={unlock} className="unlock"><label htmlFor="access-code"><Icon name="lock" size={17}/> 개인용 앱 접속 코드</label><div className="unlock-row"><input id="access-code" type="password" placeholder="배포할 때 설정한 코드" value={code} onChange={e => setCode(e.target.value)} autoComplete="current-password" required/><button className="secondary" disabled={busy}>잠금 해제</button></div></form>}
        {error && <div role="alert" className="error"><span>{error}</span><button aria-label="알림 닫기" onClick={() => setError("")}><Icon name="x" size={18}/></button></div>}
        {job?.video && <section className="video-section"><div className="video-summary">{job.video.thumbnail ? <img src={job.video.thumbnail} alt="영상 미리보기" referrerPolicy="no-referrer"/> : <div className="thumbnail-placeholder"><Icon name="play"/></div>}<div><span className="meta">{job.video.channel} · {durationLabel(job.video.duration)}</span><h2>{job.video.title}</h2><span className="source-label">YouTube</span></div></div>
          {job.phase === "ready" && <><label htmlFor="quality" className="section-label"><span className="step">02</span> 원하는 해상도</label><div className="selection-row"><select id="quality" value={quality} onChange={e => setQuality(e.target.value)} disabled={busy}>{job.video.qualities.map(q => <option key={q.id} value={q.id}>{q.height}p{q.height>=2160?" · 4K":q.height>=1080?" · Full HD":""}{q.fps>30?` · ${q.fps}fps`:""}</option>)}</select><select aria-label="파일 형식" value={container} onChange={e => { setContainer(e.target.value); if (e.target.value === "mkv") setDestination("files"); }} disabled={busy || destination === "photos"}><option value="mp4">MP4</option><option value="mkv">MKV</option></select></div><p className="small-note">소리 포함 · 원본에서 제공하는 해상도만 표시합니다.</p><fieldset className="destination"><legend><span className="step">03</span> 저장할 곳</legend><label className={destination === "photos" ? "selected" : ""}><input type="radio" name="destination" value="photos" checked={destination === "photos"} onChange={() => { setDestination("photos"); setContainer("mp4"); }}/><span>사진 앱·갤러리용<small>호환되는 MP4로 준비</small></span></label><label className={destination === "files" ? "selected" : ""}><input type="radio" name="destination" value="files" checked={destination === "files"} onChange={() => setDestination("files")}/><span>파일 보관용<small>원본 코덱 유지</small></span></label></fieldset><button className="primary wide" disabled={busy || !quality} onClick={download}><Icon name="down"/> 동영상 준비하기</button><p className="small-note">사진 앱용 변환이 필요한 영상은 조금 더 걸릴 수 있어요.</p></>}
        </section>}
        {job && activePhases.has(job.phase) && <section className="progress-section" aria-live="polite"><div className="progress-heading"><strong>{job.message}</strong><span>{typeof job.progress === "number" ? `${Math.round(job.progress)}%` : ""}</span></div><div className={`progress-track ${typeof job.progress !== "number" ? "indeterminate" : ""}`} role="progressbar" aria-label="현재 처리 단계 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={job.progress}><span style={typeof job.progress === "number" ? { width: `${job.progress}%` } : {}}/></div><p className="small-note">{job.speed ? `${sizeLabel(job.speed)}/s · ` : ""}{job.eta ? `약 ${Math.ceil(job.eta / 60)}분 남음` : "준비가 끝나면 저장 버튼이 나타납니다."}</p><p className="small-note">영상과 소리를 각각 처리할 때 진행률이 다시 시작할 수 있습니다.</p></section>}
        {job?.phase === "complete" && <section className="complete-section" aria-live="polite"><span className="success-icon"><Icon name="check" size={28}/></span><h2>저장할 준비가 끝났어요.</h2><p>{job.height}p · {sizeLabel(job.size)} · 소리 포함</p><button className="primary wide" onClick={saveFile} disabled={busy || sharing}><Icon name="down"/>파일로 다운로드</button>{supportsShare && (job.size || 0) <= 100*1024*1024 && <button className="secondary wide" disabled={sharing || busy} onClick={preparedFile ? share : prepareShare}>{sharing ? <><span className="spinner"/>휴대폰으로 가져오는 중…</> : <><Icon name="share"/>{preparedFile ? "공유 메뉴 열기" : "사진 앱·갤러리로 저장 준비"}</>}</button>}{sharing && <button className="text-button" onClick={() => requestAbort.current?.abort()}>가져오기 취소</button>}<p className="small-note">아이폰은 공유 메뉴에서 ‘비디오 저장’을 선택하세요.<br/>메뉴가 없거나 큰 파일이면 파일로 받은 뒤 사진 앱으로 옮겨 주세요.</p><p className="expiry">완료 후 24시간 동안 다시 받을 수 있습니다.</p></section>}
        {job?.phase === "failed" && <div role="alert" className="error failure"><strong>영상을 준비하지 못했어요</strong><p>{job.message}</p>{job.diagnostics && <details><summary>상세 기록</summary><pre>{job.diagnostics}</pre></details>}</div>}
        {token && <button className="text-button cancel" disabled={busy} onClick={cancel}>{preparing ? "작업 취소" : job?.phase === "complete" ? "서버 파일 삭제하고 새 영상" : "처음부터 다시"}</button>}
        {!job && <div className="empty-state"><div className="empty-line"/><span><Icon name="play" size={18}/></span><div className="empty-line"/><p>어떤 영상을 저장할까요?<br/><small>영상 확인 후 선택 가능한 화질이 나타납니다.</small></p></div>}
      </section>
      {showHelp && <aside className="help-panel"><h2>이렇게 사용하세요</h2><ol><li>유튜브에서 영상 링크를 복사해 붙여넣습니다.</li><li>영상 확인 후 화질과 저장할 곳을 선택합니다.</li><li>준비가 끝나면 파일을 받거나 공유 메뉴를 엽니다.</li></ol><p>홈 화면에 추가하면 앱처럼 열 수 있어요. 다운로드에는 인터넷 연결이 필요합니다.</p><p>재생목록 전체, 진행 중인 라이브, 로그인·추가 인증이 필요한 영상은 지원하지 않습니다.</p></aside>}
    </div><footer><span>cnation</span><p>다운로드할 권한이 있는 영상에 이용해 주세요.</p></footer>
  </main>;
}

