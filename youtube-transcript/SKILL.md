---
name: youtube-transcript
description: Fetch transcripts from YouTube videos for summarization and analysis.
---

# YouTube Transcript

Fetch transcripts from YouTube videos.

## Setup

```bash
cd {baseDir}
npm install
```

## Usage

```bash
{baseDir}/transcript.js <video-id-or-url>
```

Accepts video ID or full URL:
- `EBw7gsDPAYQ`
- `https://www.youtube.com/watch?v=EBw7gsDPAYQ`
- `https://youtu.be/EBw7gsDPAYQ`

## Output

Metadata header (title/channel/URL, via oEmbed) then timestamped transcript entries:

```
# Garage workshop: blackout Unifi camera & theater rack shelves
Channel: Nate Sweet (https://www.youtube.com/@NathanSweet)
URL: https://www.youtube.com/watch?v=EBw7gsDPAYQ

[0:00] All right. So, I got this UniFi Theta
[0:15] I took the camera out, painted it
[1:23] And here's the final result
```

## Notes

- Requires the video to have captions/transcripts available
- Works with auto-generated and manual transcripts
- Metadata is best-effort: if oEmbed fails, only the transcript is printed
