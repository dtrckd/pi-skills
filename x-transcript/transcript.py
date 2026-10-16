#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = ["faster-whisper"]
# ///
"""Transcribe the video of an X post (or any yt-dlp URL) locally with faster-whisper."""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from faster_whisper import WhisperModel


def stamp(seconds: float) -> str:
    h, rem = divmod(int(seconds), 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02}:{s:02}" if h else f"{m}:{s:02}"


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] in ("-h", "--help"):
        sys.exit("Usage: transcript.py <post-url>   (env X_TRANSCRIPT_MODEL, default: small)")
    url = sys.argv[1]

    meta = json.loads(subprocess.run(["yt-dlp", "-j", "--no-playlist", url], capture_output=True, text=True, check=True).stdout)
    print(f"# {meta.get('title')}")
    print(f"Author: {meta.get('uploader')} (@{meta.get('uploader_id')})")
    print(f"URL: {meta.get('webpage_url', url)}")
    print(f"Post: {meta.get('description', '')}\n", flush=True)

    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["yt-dlp", "-q", "--no-playlist", "-N", "8", "-f", "ba[abr<=64]/ba/w", "-o", f"{tmp}/media.%(ext)s", url], check=True)
        media = next(Path(tmp).iterdir())
        # Decode via ffmpeg: faster-whisper's PyAV path breaks on av>=19.
        pcm = subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-i", str(media), "-f", "f32le", "-ac", "1", "-ar", "16000", "-"],
                             capture_output=True, check=True).stdout
        # cpu_threads explicit: the default follows OMP_NUM_THREADS, which pi sets to 1.
        model = WhisperModel(os.environ.get("X_TRANSCRIPT_MODEL", "small"), device="cpu", compute_type="int8",
                             cpu_threads=max(1, (os.cpu_count() or 2) // 2))
        segments, info = model.transcribe(np.frombuffer(pcm, np.float32), vad_filter=True)
        print(f"Language: {info.language}\n", flush=True)
        for seg in segments:
            print(f"[{stamp(seg.start)}] {seg.text.strip()}", flush=True)


if __name__ == "__main__":
    main()
