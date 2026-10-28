# Inward — local MVP

## Run it

```bash
npm install
npm run dev
```

Open the URL it prints (usually http://localhost:5173) in your browser. Because it's
served from localhost, the browser treats it as secure and will properly prompt for
microphone access — that's the thing the hosted artifact preview couldn't do.

## Testing on your phone

`vite.config.js` is set to expose on your local network. After `npm run dev`, the
terminal also prints a "Network" URL like `http://192.168.1.42:5173`. Open that on
your phone (same wifi) to test recording from the phone itself. Mobile Safari/Chrome
should prompt for mic access the same way desktop does.

## API key

The script-writing step calls the Anthropic API directly from the browser. On first
load you'll be asked to paste a key from console.anthropic.com — it's saved only in
your browser's local storage, never sent anywhere else.

## What's still missing (by design, for this MVP)

- No background/lock-screen playback — that needs a native app, not a web page.
- No audio persistence between sessions — download the WAV if you want to keep a
  meditation; streaks, listen counts, and mood notes do persist (localStorage).
- No sound-design polish — one ambient pad, two soft bell tones. Enough to judge if
  the concept works, not the final mix.
