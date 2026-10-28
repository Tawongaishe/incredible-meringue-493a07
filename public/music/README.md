# Background music

Drop free-to-use mp3 files here, then add an entry for each one to the
`BACKGROUND_TRACKS` array near the top of `src/main.js`:

deep_vocal has deeper sounds but very ambient 
forest_flow includes some nature sounds
subtle_vibration is what you typicallt think when you hear meditation music 

these are all generated music from Suno

```js
{ id: "rain", name: "Soft rain", url: "/music/soft-rain.mp3" }
```

- `id` — unique, lowercase, no spaces.
- `name` — what shows up in the Studio picker.
- `url` — must start with `/music/` and match the filename exactly (case-sensitive).

Files must live locally in this folder rather than being linked from an
external site. Vite serves everything in `public/` from the site root, so a
local file always loads same-origin — no CORS headers required. A hotlinked
mp3 from a random external host usually lacks the CORS headers browsers
require to decode cross-origin audio, and `decodeAudioData` fails silently
in that case (the same class of bug that broke voice playback earlier).
