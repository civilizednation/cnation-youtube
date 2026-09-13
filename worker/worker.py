"""One video per disposable sandbox: inspect, download, merge and upload.

Only short-lived PUT URLs scoped to this job's two objects are supplied to the
worker. The full Vercel/Blob credentials remain in Next.js server routes.
"""
import http.client
import json
import math
import os
from pathlib import Path
import queue
import re
import shutil
import subprocess
import sys
import threading
import time
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
MAX_BYTES = 500 * 1024 * 1024
MAX_DURATION = 30 * 60


def normalize_url(value):
    if not isinstance(value, str) or len(value) > 2048:
        raise ValueError("올바른 유튜브 링크를 입력해 주세요.")
    url = urlparse(value.strip())
    if url.scheme not in ("http", "https") or url.username or url.password or url.port:
        raise ValueError("올바른 유튜브 링크를 입력해 주세요.")
    video_id = ""
    if url.hostname == "youtu.be":
        video_id = url.path.strip("/")
    elif url.hostname in ("youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"):
        if url.path == "/watch":
            video_id = parse_qs(url.query).get("v", [""])[0]
        else:
            match = re.fullmatch(r"/(?:shorts|embed|live)/([\w-]{11})/?", url.path)
            video_id = match.group(1) if match else ""
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
        raise ValueError("개별 유튜브 영상 링크를 입력해 주세요.")
    return "https://www.youtube.com/watch?v=" + video_id


def number(value):
    try:
        result = float(value or 0)
        return result if math.isfinite(result) else 0
    except (ValueError, TypeError):
        return 0


def parse_info(info):
    if info.get("live_status") in ("is_live", "is_upcoming", "post_live"):
        raise ValueError("진행 중이거나 아직 처리 중인 라이브는 지원하지 않습니다.")
    duration = number(info.get("duration"))
    if duration <= 0:
        raise ValueError("영상 길이를 확인하지 못했습니다. 다른 공개 영상을 이용해 주세요.")
    if duration > MAX_DURATION:
        raise ValueError("이 개인용 앱은 30분 이하 영상을 지원합니다.")
    grouped = {}
    for f in info.get("formats", []):
        codec = str(f.get("vcodec") or "none")
        format_id = str(f.get("format_id") or "")
        h, w = int(number(f.get("height"))), int(number(f.get("width")))
        if not h or not w or codec in ("none", "images") or f.get("has_drm") or not re.fullmatch(r"[A-Za-z0-9_-]+", format_id):
            continue
        short = min(w, h)
        quality = {"id": format_id, "height": short, "width": w, "fps": number(f.get("fps")), "size": number(f.get("filesize") or f.get("filesize_approx")), "codec": codec,
                   "hasAudio": f.get("acodec") not in (None, "none"), "photoCompatible": codec.startswith("avc1")}
        score = (quality["photoCompatible"], quality["fps"], quality["size"])
        if short not in grouped or score > grouped[short][0]:
            grouped[short] = (score, quality)
    qualities = [grouped[h][1] for h in sorted(grouped, reverse=True)]
    if not qualities:
        raise ValueError("다운로드할 수 있는 해상도를 찾지 못했습니다.")
    thumbnail = str(info.get("thumbnail") or "")
    parsed = urlparse(thumbnail)
    if parsed.scheme != "https" or not (parsed.hostname or "").endswith(".ytimg.com"):
        thumbnail = ""
    return {"title": str(info.get("title") or "YouTube 영상")[:500], "channel": str(info.get("channel") or "")[:150], "duration": duration, "thumbnail": thumbnail, "qualities": qualities}


def format_selector(quality):
    fid = quality["id"]
    if not re.fullmatch(r"[A-Za-z0-9_-]+", fid):
        raise ValueError("지원하지 않는 영상 형식입니다.")
    return fid if quality["hasAudio"] else f"{fid}+bestaudio[ext=m4a]/{fid}+bestaudio"


def safe_filename(title, height, extension):
    text = re.sub(r'[\x00-\x1f<>:"/\\|?*]', "_", title).strip(" .")[:85]
    return f"{text or 'video'} [{height}p].{extension}"


def friendly(error):
    text = str(error)
    lower = text.lower()
    if "sign in" in lower or "not a bot" in lower:
        return "유튜브에서 추가 인증을 요구했습니다. 다른 공개 영상을 시도하거나 나중에 다시 시도해 주세요."
    if "403" in lower or "429" in lower:
        return "유튜브가 서버의 요청을 제한했습니다. 잠시 후 다시 시도해 주세요."
    if "unavailable" in lower or "not available" in lower or "private video" in lower:
        return "현재 서버에서 이용할 수 없는 영상입니다. 공개 여부와 지역 제한을 확인해 주세요."
    if isinstance(error, (ValueError, TimeoutError)):
        return text
    return "영상을 준비하지 못했습니다. 다른 영상이나 낮은 화질로 다시 시도해 주세요."


class Worker:
    def __init__(self, root=ROOT):
        self.root = Path(root)
        self.state = {}
        self.last_progress = 0
        self.downloaded = {}
        self.deadline = time.time() + 24 * 60
        self.logs = []

    def write(self, phase, message, **extra):
        self.state = {**self.state, "phase": phase, "message": message, **extra}
        if "progress" not in extra:
            self.state.pop("progress", None)
        if phase != "downloading":
            self.state.pop("speed", None)
            self.state.pop("eta", None)
        temp = self.root / "state.tmp"
        temp.write_text(json.dumps(self.state, ensure_ascii=False), encoding="utf-8")
        os.replace(temp, self.root / "state.json")

    def check_limits(self):
        if time.time() >= self.deadline:
            raise TimeoutError("처리 시간이 초과되었습니다. 더 짧은 영상이나 낮은 화질로 시도해 주세요.")
        if shutil.disk_usage(self.root).free < 128 * 1024 * 1024:
            raise ValueError("영상 처리 공간이 부족합니다. 낮은 화질로 다시 시도해 주세요.")

    def progress(self, data):
        self.check_limits()
        name = str(data.get("filename", "video"))
        self.downloaded[name] = number(data.get("downloaded_bytes"))
        if sum(self.downloaded.values()) > MAX_BYTES:
            raise ValueError("영상과 소리의 총 다운로드 크기가 500 MB를 넘습니다. 낮은 화질을 선택해 주세요.")
        if data.get("status") == "finished":
            self.write("merging", "영상과 소리를 정리하고 있어요.")
            return
        if time.time() - self.last_progress < 0.5:
            return
        self.last_progress = time.time()
        total = number(data.get("total_bytes") or data.get("total_bytes_estimate"))
        extra = {"speed": number(data.get("speed")), "eta": number(data.get("eta"))}
        if total > 0:
            extra["progress"] = min(100, self.downloaded[name] / total * 100)
        self.write("downloading", "선택한 화질의 영상과 소리를 받고 있어요.", **extra)

    def debug(self, message):
        pass

    def warning(self, message):
        self.logs.append(str(message)[-500:])
        self.logs = self.logs[-5:]

    def error(self, message):
        self.warning(message)

    def common(self):
        import imageio_ffmpeg
        tools = self.root / "tools"
        tools.mkdir(exist_ok=True)
        ffmpeg = tools / "ffmpeg"
        if not ffmpeg.exists():
            ffmpeg.symlink_to(imageio_ffmpeg.get_ffmpeg_exe())
        return {"quiet": True, "no_warnings": False, "logger": self, "noplaylist": True, "socket_timeout": 20,
                "retries": 3, "fragment_retries": 3, "extractor_retries": 2, "cachedir": False,
                "js_runtimes": {"deno": {"path": str(tools / "deno")}}, "ffmpeg_location": str(ffmpeg)}

    def convert_for_photos(self, source, output, quality, duration, ffmpeg):
        self.write("merging", "사진 앱에서 재생할 수 있는 MP4로 정리하고 있어요.")
        # AAC is always normalized; H.264 can be copied without losing quality.
        video_args = ["-c:v", "copy"] if quality["photoCompatible"] else ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p"]
        args = [ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source), "-map", "0:v:0", "-map", "0:a:0", *video_args,
                "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-progress", "pipe:1", str(output)]
        events = queue.Queue()
        proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        errors = []

        def reader():
            for line in proc.stdout:
                events.put(line.strip())

        def stderr_reader():
            for line in proc.stderr:
                errors.append(line[-500:])
                del errors[:-10]

        thread = threading.Thread(target=reader, daemon=True)
        stderr_thread = threading.Thread(target=stderr_reader, daemon=True)
        thread.start()
        stderr_thread.start()
        try:
            while proc.poll() is None:
                self.check_limits()
                if output.exists() and output.stat().st_size > MAX_BYTES:
                    raise ValueError("변환한 파일이 500 MB를 넘습니다. 낮은 화질로 다시 시도해 주세요.")
                try:
                    line = events.get(timeout=0.5)
                    if line.startswith("out_time_us="):
                        percent = min(99, number(line.split("=", 1)[1]) / 1000000 / duration * 100)
                        self.write("merging", "사진 앱용 MP4로 정리하고 있어요.", progress=percent)
                except queue.Empty:
                    pass
            thread.join(timeout=2)
            stderr_thread.join(timeout=2)
            if proc.returncode:
                raise RuntimeError("MP4 변환 실패")
        finally:
            if proc.poll() is None:
                proc.kill()
                proc.wait()
            proc.stdout.close()
            proc.stderr.close()

    def upload(self, url, file, content_type):
        parsed = urlparse(url)
        allowed = (parsed.hostname or "").endswith(".vercel-storage.com") or (parsed.hostname == "vercel.com" and parsed.path.startswith("/api/blob/"))
        if parsed.scheme != "https" or parsed.username or parsed.password or not allowed:
            raise ValueError("저장소 업로드 주소가 올바르지 않습니다.")
        path = parsed.path + ("?" + parsed.query if parsed.query else "")
        size = file.stat().st_size
        for attempt in range(3):
            connection = http.client.HTTPSConnection(parsed.hostname, timeout=60)
            try:
                connection.putrequest("PUT", path)
                connection.putheader("Content-Type", content_type)
                connection.putheader("Content-Length", str(size))
                connection.endheaders()
                sent, last = 0, 0
                with file.open("rb") as stream:
                    while chunk := stream.read(256 * 1024):
                        self.check_limits()
                        connection.send(chunk)
                        sent += len(chunk)
                        if content_type != "application/json" and time.time() - last > 0.5:
                            self.write("uploading", "완성된 영상을 저장할 준비를 하고 있어요.", progress=sent / size * 100)
                            last = time.time()
                response = connection.getresponse()
                response.read(65536)
                if 200 <= response.status < 300:
                    return
                if response.status < 500 and response.status != 429:
                    raise ValueError("임시 저장소 업로드에 실패했습니다. Blob 설정과 저장 용량을 확인해 주세요.")
                raise OSError("Storage temporarily unavailable")
            except (OSError, http.client.HTTPException):
                if attempt == 2:
                    raise RuntimeError("임시 저장소 업로드 실패")
                time.sleep(2 ** attempt)
            finally:
                connection.close()

    def run(self):
        import yt_dlp
        input_data = json.loads((self.root / "input.json").read_text(encoding="utf-8"))
        self.deadline = min(self.deadline, input_data.get("created", time.time() * 1000) / 1000 + 28 * 60)
        url = normalize_url(input_data["url"])
        common = self.common()
        self.write("analyzing", "영상 제목과 제공되는 해상도를 확인하고 있어요.")
        with yt_dlp.YoutubeDL(common) as ydl:
            info = ydl.extract_info(url, download=False)
        video = parse_info(info)
        self.write("ready", "원하는 해상도와 저장할 곳을 선택해 주세요.", video=video)
        wait_until = min(self.deadline, time.time() + 5 * 60)
        request_path = self.root / "request.json"
        while not request_path.exists():
            if time.time() >= wait_until:
                raise TimeoutError("화질 선택 대기 시간이 만료되었습니다. 영상을 다시 확인해 주세요.")
            time.sleep(0.7)
        request = json.loads(request_path.read_text(encoding="utf-8"))
        quality = next((q for q in video["qualities"] if q["id"] == request.get("quality")), None)
        if not quality or request.get("container") not in ("mp4", "mkv") or request.get("destination") not in ("photos", "files"):
            raise ValueError("잘못된 다운로드 설정입니다.")
        if request["destination"] == "photos" and request["container"] != "mp4":
            raise ValueError("사진 앱용 영상은 MP4만 지원합니다.")
        if quality["size"] > MAX_BYTES:
            raise ValueError("선택한 영상이 500 MB를 넘습니다. 낮은 화질을 선택해 주세요.")
        media = self.root / "media"
        media.mkdir(exist_ok=True)
        container = request["container"]
        options = {**common, "format": format_selector(quality), "outtmpl": str(media / "source.%(ext)s"), "merge_output_format": container,
                   "max_filesize": MAX_BYTES, "noprogress": False, "progress_hooks": [self.progress], "overwrites": False,
                   "postprocessors": [{"key": "FFmpegVideoRemuxer", "preferedformat": container}]}
        self.write("downloading", "선택한 영상과 소리를 받고 있어요.")
        with yt_dlp.YoutubeDL(options) as ydl:
            ydl.extract_info(url, download=True)
        source = media / ("source." + container)
        if not source.exists():
            raise ValueError("다운로드 파일을 찾지 못했습니다. 낮은 화질로 다시 시도해 주세요.")
        output = media / ("video." + container)
        if request["destination"] == "photos":
            self.convert_for_photos(source, output, quality, video["duration"], common["ffmpeg_location"])
        else:
            source.rename(output)
        self.check_limits()
        size = output.stat().st_size
        if size > MAX_BYTES or size == 0:
            raise ValueError("파일 크기를 확인하지 못했거나 500 MB를 넘었습니다.")
        self.write("uploading", "완성된 영상을 저장할 준비를 하고 있어요.")
        content_type = "video/mp4" if container == "mp4" else "video/x-matroska"
        self.upload(request["videoUploadUrl"], output, content_type)
        result = {"phase": "complete", "message": "저장할 준비가 끝났어요.", "video": video, "filename": safe_filename(video["title"], quality["height"], container),
                  "height": quality["height"], "size": size, "pathname": request["pathname"], "expiresAt": int(time.time() * 1000) + 24 * 3600000}
        result_path = self.root / "result.json"
        result_path.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
        self.upload(request["resultUploadUrl"], result_path, "application/json")
        public_result = {k: v for k, v in result.items() if k not in ("phase", "message", "pathname")}
        self.write("complete", result["message"], **public_result)


if __name__ == "__main__":
    worker = Worker()
    try:
        worker.run()
    except Exception as error:
        # Redact all URLs: extractor errors may include signed YouTube URLs.
        diagnostic = re.sub(r"https?://\S+", "[주소 생략]", str(error))[-1200:]
        worker.write("failed", friendly(error), diagnostics=diagnostic)
        sys.exit(1)
