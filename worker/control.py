"""Atomically accept one download request, even with two simultaneous HTTP calls."""
import os
from pathlib import Path
import sys

root = Path(__file__).resolve().parent
staged = Path(sys.argv[1]).resolve()
if staged.parent != root or not staged.name.startswith("request-"):
    sys.exit(2)
try:
    os.link(staged, root / "request.json")
except FileExistsError:
    sys.exit(3)
finally:
    staged.unlink(missing_ok=True)
