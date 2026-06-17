"""
HermesAgentRunner: orchestrates per-profile Hermes Agent instances.

Option A: each Hermes SaaS profile = one isolated Hermes CLI subprocess.

Layout on disk under ~/.hermes-saas/profiles/<company_id>/<profile_id>/:
  config.yaml   -- agent config (model, max_turns, etc.)
  SOUL.md       -- persona + system prompt
  skills/<n>/   -- per-skill SKILL.md
  .env          -- company OpenRouter key (chmod 600)
  stdout.log    -- PTY output, tailed for streaming
  stdin.pipe    -- sequence; user input is written here
  pid           -- running PID
  exited        -- 'true' when process dies

Lifecycle:
  - start() spawns hermes via pty.fork + execvp on a thread (raw mode)
  - chat_stream() appends to stdin.pipe and tails stdout.log for new content
  - stop() kills the PID and reaps

Why not tmux? Some deployments don't have tmux. PTY + log files give us
the same loose coupling (process survives between requests, fastapi is stateless)
and the same streaming UX (tail stdout.log, diff against last snapshot).
"""

from __future__ import annotations

import asyncio
import errno
import fcntl
import json
import os
import pty
import re
import signal
import subprocess
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import AsyncIterator, Optional

HERMES_BIN = "/home/ubuntu/.local/bin/hermes"
PROFILES_ROOT = Path(os.path.expanduser("~/.hermes-saas/profiles"))


@dataclass
class AgentProcess:
    profile_id: str
    company_id: str
    pid: int
    started_at: float
    profile_dir: Path
    fd: Optional[int] = None  # PTY master fd (kept open in parent)


def _set_nonblocking(fd: int) -> None:
    flags = fcntl.fcntl(fd, fcntl.F_GETFL)
    fcntl.fcntl(fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)


class HermesRunner:
    def __init__(self):
        self._active: dict[str, AgentProcess] = {}
        PROFILES_ROOT.mkdir(parents=True, exist_ok=True)

    # ── Setup & teardown ─────────────────────────────────────

    def profile_dir(self, company_id: str, profile_id: str) -> Path:
        d = PROFILES_ROOT / company_id / profile_id
        (d / "skills").mkdir(parents=True, exist_ok=True)
        return d

    def ensure_profile_materialized(
        self,
        company_id: str,
        profile_id: str,
        name: str,
        model: str,
        soul_text: str,
        skills: list[dict],
        openrouter_key: str,
    ) -> Path:
        pdir = self.profile_dir(company_id, profile_id)

        env_path = pdir / ".env"
        env_path.write_text(
            f"OPENROUTER_API_KEY={openrouter_key}\n"
            "HERMES_PROVIDER=openrouter\n"
            "OPENROUTER_APP_URL=https://hermes-saas.app\n"
            "OPENROUTER_APP_NAME=Hermes SaaS\n"
            "PYTHONUNBUFFERED=1\n"
        )
        env_path.chmod(0o600)

        config = {
            "agent": {"name": name, "max_turns": 30, "tool_use_enforcement": True},
            "model": {"default": model, "provider": "openrouter", "context_length": 128000},
            "streaming": {"enabled": True},
            "memory": {"memory_enabled": True, "user_profile_enabled": False},
            "terminal": {"backend": "local"},
            "display": {"show_tool_progress": False, "show_cost": False, "show_reasoning": False},
        }
        (pdir / "config.yaml").write_text(json.dumps(config, indent=2))

        (pdir / "SOUL.md").write_text(soul_text)

        skill_root = pdir / "skills"
        if skill_root.exists():
            for child in skill_root.iterdir():
                if child.is_dir():
                    import shutil
                    shutil.rmtree(child)
        for skill in skills:
            slug = re.sub(r"[^a-z0-9-]", "-", skill["name"].lower()).strip("-")
            sd = skill_root / slug
            sd.mkdir(parents=True, exist_ok=True)
            (sd / "SKILL.md").write_text(skill.get("content", ""))

        return pdir

    # ── Process lifecycle ────────────────────────────────────

    def is_running(self, profile_id: str) -> bool:
        ap = self._active.get(profile_id)
        if not ap:
            return False
        try:
            os.kill(ap.pid, 0)
            return True
        except OSError:
            return False

    def start(self, company_id: str, profile_id: str) -> AgentProcess:
        """Spawn hermes as a forked PTY subprocess."""
        pdir = self.profile_dir(company_id, profile_id)

        # Clean up logs from previous run
        for fname in ("stdout.log", "exited"):
            p = pdir / fname
            if p.exists():
                p.unlink()

        log_path = pdir / "stdout.log"
        log_fd = os.open(str(log_path), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o644)

        # Build env: source .env + inherit
        env = os.environ.copy()
        env["HERMES_HOME"] = str(pdir)
        # Parse .env to extract OPENROUTER_API_KEY
        key = ""
        for line in (pdir / ".env").read_text().splitlines():
            if line.startswith("OPENROUTER_API_KEY="):
                key = line.split("=", 1)[1]
                break
        if key:
            env["OPENROUTER_API_KEY"] = key
        env["HERMES_PROVIDER"] = "openrouter"

        # Fork a PTY
        pid, fd = pty.fork()
        if pid == 0:
            # CHILD
            os.chdir(str(pdir))
            os.dup2(log_fd, 1)
            os.dup2(log_fd, 2)
            os.close(log_fd)
            try:
                os.execvpe(
                    HERMES_BIN,
                    [
                        HERMES_BIN,
                        "chat",
                        "--source", "hermes-saas",
                        "--pass-session-id",
                        f"--resume=hermes-saas-{profile_id[:12]}",
                        "-Q",  # quiet: no banner, spinner or tool previews
                    ],
                    env,
                )
            except FileNotFoundError:
                os.write(2, f"ERROR: {HERMES_BIN} not found\n".encode())
            os._exit(127)

        # PARENT
        os.close(log_fd)
        _set_nonblocking(fd)

        ap = AgentProcess(
            profile_id=profile_id,
            company_id=company_id,
            pid=pid,
            started_at=time.time(),
            profile_dir=pdir,
            fd=fd,
        )
        self._active[profile_id] = ap

        # Tail log in a side thread or simply check for content later; we use file tail.
        time.sleep(2)  # let hermes warm up
        return ap

    def stop(self, profile_id: str) -> bool:
        ap = self._active.pop(profile_id, None)
        if not ap:
            return False
        try:
            os.kill(ap.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            os.waitpid(ap.pid, os.WNOHANG)
        except ChildProcessError:
            pass
        if ap.fd is not None:
            try:
                os.close(ap.fd)
            except OSError:
                pass
        (ap.profile_dir / "exited").write_text("true")
        return True

    # ── Sending prompts & streaming responses ────────────────

    async def chat_stream(
        self,
        profile_id: str,
        message: str,
    ) -> AsyncIterator[dict]:
        ap = self._active.get(profile_id)
        if not ap or not self.is_running(profile_id):
            yield {"type": "error", "message": "Processo Hermes nao esta rodando"}
            return

        log_path = ap.profile_dir / "stdout.log"
        pos = log_path.stat().st_size if log_path.exists() else 0

        # Send prompt + Enter
        msg_bytes = (message.strip() + "\n").encode()
        try:
            os.write(ap.fd, msg_bytes)
        except OSError as e:
            yield {"type": "error", "message": f"Erro escrevendo no PTY: {e}"}
            return

        # Tail the log
        accumulated = ""
        stable_ticks = 0
        max_wait = 180
        start = time.time()

        while time.time() - start < max_wait:
            await asyncio.sleep(0.5)
            if not log_path.exists():
                continue
            sz = log_path.stat().st_size
            if sz <= pos:
                continue

            with open(log_path, "rb") as f:
                f.seek(pos)
                new_bytes = f.read(sz - pos)
                pos = sz

            try:
                delta = new_bytes.decode("utf-8", errors="replace")
            except Exception:
                delta = ""

            # Strip ANSI escape codes
            delta = re.sub(r"\x1b\[[0-9;?]*[a-zA-Z]", "", delta)
            # Strip tmux/hermes status prompt lines (▸, ›, ❯)
            delta_lines = [l for l in delta.splitlines() if l.strip()]
            delta = "\n".join(delta_lines)

            if delta.strip():
                accumulated += delta
                yield {"type": "chunk", "text": delta}
                stable_ticks = 0
            else:
                if accumulated.strip():
                    stable_ticks += 1
                    if stable_ticks >= 4:  # 2s of stillness = done
                        break

        yield {"type": "done", "full": accumulated.strip()}


runner = HermesRunner()
