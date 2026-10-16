---
name: x-transcript
description: Transcribe the video/audio of an X (Twitter) post locally (yt-dlp + faster-whisper). Also works with any yt-dlp supported URL.
---

# X Transcript

X posts have no captions, so the audio is downloaded and transcribed on CPU.

## Usage

```bash
{baseDir}/transcript.py <post-url> 2>/dev/null > /tmp/x-transcript.txt
```

Always redirect to a file, then `read` it in chunks. Never pipe to `head`/`tail`: a re-run re-downloads and re-transcribes everything.

Runs at roughly 8x realtime (a 1h video takes ~8 min), so give the bash call a long timeout (e.g. 1800s).
`X_TRANSCRIPT_MODEL` selects the Whisper model (default `small`; `base` is faster, `medium`/`large-v3` better).

## Output

```
# <post title>
Author: <name> (@<handle>)
URL: <url>
Post: <post text>

Language: en

[0:00] First segment
[0:07] Next segment
```

## Requirements

`uv`, `yt-dlp`, `ffmpeg` on PATH. First run downloads the Python deps and the model (~500 MB for `small`).
