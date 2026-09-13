"use client";

import { useState } from "react";
import "./globals.css";
import pkg from "../package.json";

const INSTALL_STEPS = [
  {
    title: "a-Shell 설치",
    body: "앱스토어에서 무료 앱 a-Shell을 설치하세요. (a-Shell mini 말고 a-Shell)",
    command: null,
  },
  {
    title: "yt-dlp 설치",
    body: "a-Shell을 열고 아래 명령을 입력하세요. 1~2분 걸립니다.",
    command: "pip install yt-dlp",
  },
  {
    title: "ffmpeg 설치 (1080p·mp3에 필요)",
    body: "고화질 저장과 mp3 변환에 필요합니다. 건너뛰면 720p까지만 받을 수 있어요.",
    command:
      "mkdir -p ~/bin && curl -L https://github.com/holzschu/a-Shell-commands/releases/download/0.1/ffmpeg.wasm -o ~/bin/ffmpeg.wasm",
  },
  {
    title: "cnation 스크립트 설치",
    body: "해상도 선택과 mp3 저장을 처리하는 스크립트입니다.",
    command:
      "curl -L https://cnation-youtube.vercel.app/cnation-dl.sh -o cnation-dl.sh",
  },
  {
    title: "사용하기",
    body: "유튜브 주소와 화질을 넣어 실행하세요. 화질은 1080 / 720 / 480 / 360 / mp3 중 선택합니다.",
    command: 'sh cnation-dl.sh "유튜브주소" 1080',
  },
];

function CommandBlock({ command }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="cmd">
      <code>{command}</code>
      <button type="button" className="cmd-copy" onClick={copy}>
        {copied ? "복사됨" : "복사"}
      </button>
    </div>
  );
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [info, setInfo] = useState(null);
  const [itag, setItag] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorDetail, setErrorDetail] = useState("");
  const [webOpen, setWebOpen] = useState(false);

  async function handleAnalyze(e) {
    e.preventDefault();
    setError("");
    setErrorDetail("");
    setInfo(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/info?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (!res.ok) {
        setErrorDetail(data.detail || "");
        throw new Error(data.error || "영상 정보를 가져오지 못했습니다.");
      }
      if (!data.formats?.length)
        throw new Error("다운로드 가능한 화질을 찾지 못했습니다.");
      setInfo(data);
      setItag(String(data.formats[0].itag));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleDownload() {
    if (!itag || !info) return;
    const format = info.formats.find((f) => String(f.itag) === itag);
    const params = new URLSearchParams({
      url,
      itag,
      muxed: format?.muxed ? "1" : "0",
      title: info.title || "download",
    });
    window.location.href = `/api/download?${params.toString()}`;
  }

  return (
    <main className="page">
      <div className="version-badge">v{pkg.version}</div>
      <div className="card">
        <div className="logo">
          <div className="logo-badge">CN</div>
          <div className="title">cnation Youtube Downloader</div>
        </div>
        <p className="subtitle">
          아이폰에서 유튜브 영상을 원하는 해상도로 저장하세요.
        </p>

        <div className="callout">
          유튜브는 클라우드 서버에서 오는 요청을 차단하기 때문에, 아이폰이 직접
          내려받는 방식으로 설치합니다. 처음 한 번만 설정하면 이후에는 명령 한
          줄로 저장할 수 있어요.
        </div>

        <ol className="steps">
          {INSTALL_STEPS.map((step, i) => (
            <li key={step.title}>
              <div className="step-head">
                <span className="step-num">{i + 1}</span>
                <span className="step-title">{step.title}</span>
              </div>
              <p className="step-body">{step.body}</p>
              {step.command && <CommandBlock command={step.command} />}
            </li>
          ))}
        </ol>

        <div className="callout subtle">
          저장된 파일은 <b>파일 앱 &gt; 나의 iPhone &gt; a-Shell &gt; Documents
          &gt; cnation</b> 에 있습니다. 단축어 앱에서 a-Shell 명령을 실행하도록
          만들면, 유튜브 앱의 공유 버튼으로 바로 저장할 수도 있어요.
        </div>

        <button
          type="button"
          className="disclosure"
          onClick={() => setWebOpen((v) => !v)}
        >
          {webOpen ? "▾" : "▸"} 웹에서 바로 받기 (프록시 설정 필요)
        </button>

        {webOpen && (
          <div className="web-section">
            <p className="step-body">
              서버에서 바로 내려받는 방식입니다. 유튜브의 클라우드 IP 차단 때문에
              주거용 프록시를 환경 변수에 설정해야 동작합니다.
            </p>

            <form onSubmit={handleAnalyze}>
              <input
                type="url"
                required
                placeholder="https://www.youtube.com/watch?v=..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? "분석 중..." : "분석하기"}
              </button>
            </form>

            {error && (
              <div className="error">
                {error}
                {errorDetail && <div className="error-detail">{errorDetail}</div>}
              </div>
            )}

            {info && (
              <div className="result">
                {info.thumbnail && (
                  <img className="thumb" src={info.thumbnail} alt={info.title} />
                )}
                <div className="result-body">
                  <p className="video-title">{info.title}</p>

                  <label htmlFor="quality">해상도 선택</label>
                  <select
                    id="quality"
                    value={itag}
                    onChange={(e) => setItag(e.target.value)}
                  >
                    {info.formats.map((f) => (
                      <option key={f.itag} value={f.itag}>
                        {f.quality} · {f.container}
                        {f.contentLength
                          ? ` · ${(f.contentLength / (1024 * 1024)).toFixed(1)}MB`
                          : ""}
                      </option>
                    ))}
                  </select>

                  <button className="btn-secondary" onClick={handleDownload}>
                    이 화질로 저장하기
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <p className="notice">
          본인이 저작권을 보유했거나 다운로드가 허용된 영상만 저장해 주세요. 이
          도구는 개인적인 용도로만 사용해야 하며, 저작권이 있는 콘텐츠를 무단으로
          다운로드하는 것은 유튜브 이용약관 및 관련 법령을 위반할 수 있습니다.
        </p>

        <footer className="footer">
          <div>제작자 : cnation(문명국)</div>
          <div>
            문의 : <a href="mailto:mmk75@naver.com">mmk75@naver.com</a>
          </div>
        </footer>
      </div>
    </main>
  );
}
