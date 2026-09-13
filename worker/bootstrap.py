"""Prepare the disposable Linux worker. No Vercel credentials enter this VM."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent


def state(message, phase="preparing"):
    temp = ROOT / "state.tmp"
    temp.write_text(json.dumps({"phase": phase, "message": message}, ensure_ascii=False), encoding="utf-8")
    os.replace(temp, ROOT / "state.json")


def run(args, timeout=240):
    result = subprocess.run(args, cwd=ROOT, capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        # Installation output has no job upload tokens, but do not expose it to the UI.
        raise RuntimeError("영상 처리 도구를 설치하지 못했습니다. Sandbox 인터넷 연결을 확인해 주세요.")


def fetch(url, path):
    with urllib.request.urlopen(url, timeout=90) as response, path.open("wb") as output:
        while chunk := response.read(1024 * 256):
            output.write(chunk)


def main():
    try:
        venv = ROOT / "venv"
        python = venv / "bin" / "python"
        if not python.exists():
            state("영상 처리 도구를 준비하고 있어요. 몇 분 정도 걸릴 수 있습니다.")
            run([sys.executable, "-m", "venv", str(venv)], 60)
            run([str(python), "-m", "pip", "install", "--disable-pip-version-check", "--no-input", "-r", str(ROOT / "requirements.txt")])
        tools = ROOT / "tools"
        tools.mkdir(exist_ok=True)
        deno = tools / "deno"
        if not deno.exists():
            state("유튜브 연결 도구를 준비하고 있어요.")
            base = "https://github.com/denoland/deno/releases/download/v2.9.6/"
            name = "deno-x86_64-unknown-linux-gnu.zip"
            archive = ROOT / "deno.zip"
            fetch(base + name, archive)
            with urllib.request.urlopen(base + name + ".sha256sum", timeout=30) as response:
                expected = response.read().decode().split()[0].lower()
            digest = hashlib.sha256()
            with archive.open("rb") as stream:
                while chunk := stream.read(1024 * 1024):
                    digest.update(chunk)
            if digest.hexdigest() != expected:
                raise RuntimeError("유튜브 연결 도구 검증에 실패했습니다.")
            with zipfile.ZipFile(archive) as package:
                deno.write_bytes(package.read("deno"))
            deno.chmod(0o755)
            archive.unlink()
        # Replace bootstrap process; yt-dlp and imageio are imported only from this venv.
        os.execv(str(python), [str(python), str(ROOT / "worker.py")])
    except Exception:
        state("영상 처리 도구를 준비하지 못했습니다. Sandbox의 인터넷 연결·사용 한도를 확인한 뒤 다시 시도해 주세요.", "failed")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
