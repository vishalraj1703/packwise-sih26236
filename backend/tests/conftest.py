import os
import sys
import tempfile
from pathlib import Path

# Isolated database and uploads for every test session (must be set before the app is imported).
_tmp = tempfile.mkdtemp(prefix="packwise-test-")
os.environ["PACKWISE_DATA_DIR"] = _tmp
os.environ.pop("DATABASE_URL", None)
os.environ["PACKWISE_AI"] = "off"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
