import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import uuid
import shutil
from contextlib import contextmanager
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("worker", Path(__file__).parents[1] / "worker" / "worker.py")
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


@contextmanager
def test_directory():
    # Ordinary inherited Windows permissions also work in restricted CI runners.
    base = Path(os.environ.get("TEST_TEMP_DIR", tempfile.gettempdir())).resolve()
    folder = base / ("cnation-test-" + uuid.uuid4().hex)
    folder.mkdir(mode=0o777)
    try:
        yield str(folder)
    finally:
        if folder.parent.resolve() == base and folder.name.startswith("cnation-test-"):
            shutil.rmtree(folder)


def fixture():
    return {"title": "한글 영상", "channel": "테스트", "duration": 10, "formats": [
        {"format_id": "137", "vcodec": "avc1.640028", "acodec": "none", "width": 1920, "height": 1080, "fps": 30},
        {"format_id": "399", "vcodec": "av01", "acodec": "none", "width": 1920, "height": 1080, "fps": 60},
        {"format_id": "18", "vcodec": "avc1", "acodec": "mp4a", "width": 640, "height": 360},
        {"format_id": "140", "vcodec": "none", "acodec": "mp4a"},
        {"format_id": "drm", "vcodec": "avc1", "height": 2160, "width": 3840, "has_drm": True}]}


class WorkerTests(unittest.TestCase):
    def test_video_formats_and_audio(self):
        result = worker.parse_info(fixture())
        self.assertEqual([q["height"] for q in result["qualities"]], [1080, 360])
        self.assertEqual(result["qualities"][0]["id"], "137")
        self.assertEqual(worker.format_selector(result["qualities"][0]), "137+bestaudio[ext=m4a]/137+bestaudio")
        self.assertEqual(worker.format_selector(result["qualities"][1]), "18")

    def test_portrait_short_edge(self):
        value = fixture()
        value["formats"][0]["width"], value["formats"][0]["height"] = 1080, 1920
        self.assertEqual(worker.parse_info(value)["qualities"][0]["height"], 1080)

    def test_reject_live_long_and_unknown_duration(self):
        for field, value in [("live_status", "is_live"), ("duration", 1801), ("duration", None)]:
            info = fixture()
            info[field] = value
            with self.assertRaises(ValueError):
                worker.parse_info(info)

    def test_url_and_filenames(self):
        self.assertEqual(worker.normalize_url("https://youtu.be/YE7VzlLtp-4?si=x"), "https://www.youtube.com/watch?v=YE7VzlLtp-4")
        for url in ["https://youtube.com.evil/watch?v=YE7VzlLtp-4", "https://a@youtube.com/watch?v=YE7VzlLtp-4", "http://127.0.0.1/"]:
            with self.assertRaises(ValueError):
                worker.normalize_url(url)
        self.assertEqual(worker.safe_filename('한글/영상:*', 720, "mp4"), "한글_영상__ [720p].mp4")

    def test_actual_byte_limit_and_progress(self):
        with test_directory() as folder:
            runner = worker.Worker(folder)
            runner.progress({"status": "downloading", "filename": "one", "downloaded_bytes": 500, "total_bytes": 1000})
            state = json.loads((Path(folder) / "state.json").read_text(encoding="utf-8"))
            self.assertEqual(state["progress"], 50)
            with self.assertRaises(ValueError):
                runner.progress({"status": "downloading", "filename": "two", "downloaded_bytes": worker.MAX_BYTES})

    def test_upload_streams_to_exact_presigned_path(self):
        class Connection:
            calls = []
            def __init__(self, hostname, **kwargs): self.calls.append(("host", hostname))
            def putrequest(self, method, path): self.calls.append((method, path))
            def putheader(self, *args): self.calls.append(args)
            def endheaders(self): pass
            def send(self, data): self.calls.append(("data", data))
            def getresponse(self): return type("Response", (), {"status": 200, "read": lambda *args: b"{}"})()
            def close(self): pass
        with test_directory() as folder, patch.object(worker.http.client, "HTTPSConnection", Connection):
            file = Path(folder) / "result.json"
            file.write_bytes(b"{}")
            worker.Worker(folder).upload("https://vercel.com/api/blob/?pathname=test&signature=test", file, "application/json")
            self.assertIn(("PUT", "/api/blob/?pathname=test&signature=test"), Connection.calls)
            self.assertIn(("Content-Length", "2"), Connection.calls)
            self.assertIn(("data", b"{}"), Connection.calls)
            with self.assertRaises(ValueError):
                worker.Worker(folder).upload("https://evil.example/upload", file, "application/json")

    def test_one_download_is_accepted_atomically(self):
        control = Path(__file__).parents[1] / "worker" / "control.py"
        with test_directory() as folder:
            target = Path(folder)
            (target / "control.py").write_bytes(control.read_bytes())
            for suffix in ["a", "b"]:
                (target / f"request-{suffix}.json").write_text('{"quality":"137"}')
            first = subprocess.run([os.sys.executable, str(target / "control.py"), str(target / "request-a.json")])
            second = subprocess.run([os.sys.executable, str(target / "control.py"), str(target / "request-b.json")])
            self.assertEqual(first.returncode, 0)
            self.assertEqual(second.returncode, 3)
            self.assertTrue((target / "request.json").exists())


@unittest.skipUnless(os.environ.get("FFMPEG_EXE") and os.environ.get("FFPROBE_EXE"), "Set FFMPEG_EXE and FFPROBE_EXE to test actual video conversion")
class MediaIntegrationTests(unittest.TestCase):
    def test_photo_mp4_contains_h264_and_aac(self):
        for codec, compatible in [("libx264", True), ("libvpx-vp9", False)]:
            with self.subTest(codec=codec), test_directory() as folder:
                root = Path(folder)
                source = root / "source.mkv"
                output = root / "video.mp4"
                subprocess.run([os.environ["FFMPEG_EXE"], "-v", "error", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=10", "-f", "lavfi", "-i", "sine=frequency=440", "-t", "1", "-c:v", codec, "-pix_fmt", "yuv420p", "-c:a", "libopus", str(source)], check=True, timeout=30)
                worker.Worker(root).convert_for_photos(source, output, {"photoCompatible": compatible}, 1, os.environ["FFMPEG_EXE"])
                result = subprocess.run([os.environ["FFPROBE_EXE"], "-v", "error", "-show_entries", "stream=codec_name,width,height", "-of", "json", str(output)], capture_output=True, text=True, check=True)
                streams = json.loads(result.stdout)["streams"]
                self.assertEqual(streams[0]["codec_name"], "h264")
                self.assertEqual(streams[0]["height"], 180)
                self.assertEqual(streams[1]["codec_name"], "aac")


if __name__ == "__main__":
    unittest.main()

