"use client";

import { useState } from "react";
import "./globals.css";
import pkg from "../package.json";

export default function Home() {
  const [url, setUrl] = useState("");
  const [info, setInfo] = useState(null);
  const [itag, setItag] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorDetail, setErrorDetail] = useState("");

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
      if (!data.formats?.length) throw new Error("다운로드 가능한 화질을 찾지 못했습니다.");
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
          <div>
            <div className="title">cnation Youtube Downloader</div>
          </div>
        </div>
        <p className="subtitle">유튜브 링크를 붙여넣고 원하는 해상도로 저장하세요.</p>

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
            {errorDetail && (
              <div style={{ marginTop: 8, fontSize: "0.75rem", opacity: 0.8, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                {errorDetail}
              </div>
            )}
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

        <p className="notice">
          본인이 저작권을 보유했거나 다운로드가 허용된 영상만 저장해 주세요. 이
          도구는 개인적인 용도로만 사용해야 하며, 저작권이 있는 콘텐츠를
          무단으로 다운로드하는 것은 유튜브 이용약관 및 관련 법령을 위반할 수
          있습니다.
        </p>

        <footer className="footer">
          <div>제작자 : cnation(문명국)</div>
          <div>
            문의 :{" "}
            <a href="mailto:mmk75@naver.com">mmk75@naver.com</a>
          </div>
        </footer>
      </div>
    </main>
  );
}
