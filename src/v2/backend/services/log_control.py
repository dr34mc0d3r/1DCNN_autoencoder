"""log_control.py — Runtime file-logging toggle.

Owns the single FileHandler so it can be added/removed without restarting.
app.py calls setup() once at startup; api/config.py calls set_enabled() on toggle.
"""

import logging
from pathlib import Path

_file_handler: logging.FileHandler | None = None
_LOG_DIR = Path(__file__).parent.parent / "logs"
_FMT = logging.Formatter("%(asctime)s %(levelname)-8s %(name)s: %(message)s")


def setup(enabled: bool) -> None:
    """Install the file handler once at startup when enabled."""
    global _file_handler
    if enabled:
        _LOG_DIR.mkdir(exist_ok=True)
        _file_handler = logging.FileHandler(str(_LOG_DIR / "server.log"))
        _file_handler.setFormatter(_FMT)
        logging.getLogger().addHandler(_file_handler)


def set_enabled(enabled: bool) -> None:
    """Toggle file logging at runtime — adds or removes the FileHandler."""
    global _file_handler
    root = logging.getLogger()
    if enabled and _file_handler is None:
        _LOG_DIR.mkdir(exist_ok=True)
        _file_handler = logging.FileHandler(str(_LOG_DIR / "server.log"))
        _file_handler.setFormatter(_FMT)
        root.addHandler(_file_handler)
    elif not enabled and _file_handler is not None:
        root.removeHandler(_file_handler)
        _file_handler.close()
        _file_handler = None
