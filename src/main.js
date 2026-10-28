import { PERSONAS, LIBRARY } from "./scripts.js";
const THEMES = ["Confidence","Calm under pressure","Letting go","Self-worth","Rest & sleep","Abundance"];
const TEST_SCRIPT_CHUNKS = [
  "Infinite Intelligence moves through me now, and I know that whatever I impress upon my subconscious mind, it will bring to pass. I now impress upon it the truth of who I am.",
  "I am competent. I am capable. I am fully equipped for this work at LinkedIn Premium. My subconscious mind knows the way, and it leads me with joy and excitement into every task before me.",
  "I am ready to grow, to mushroom beyond my wildest imagination, for there is no limit to the intelligence within me. This work is simply new soil for my malleable, neuroplastic mind — and my mind knows how to grow toward the light.",
  "I release all need to be perfect. I let that go now, completely, and in its place I embrace the process and the growth it brings. Nothing stands in my way, for I am one with Infinite Intelligence, and Infinite Intelligence knows no obstacle.",
  "My team is well equipped, and I give thanks for them. My manager is trustworthy and good, and I give thanks for him. My mentors are competent, and I learn freely and easily from their example. I give myself full permission to show up in all the power, intelligence, grace, and charm that is naturally, divinely mine.",
  "Everything about this year is working in my favor. I am stepping into the most exciting season of my career, and I feel it, I claim it, I accept it now. I am ready to know more of Tawo — how she thinks, how she moves, how she creates — and I explode quietly within, in gratitude and in competence.",
  "I detach from the praise of people. I connect myself instead to the praise of God, the only source I need. My subconscious mind now accepts this as true, and I give thanks, knowing it is already done.",
  "And so it is."
];
let selectedTheme = null;
let scriptChunks = [];
let currentChunkIndex = 0;
let recordedBlobs = [];
let mediaRecorder = null;
let mediaChunks = [];
let stream = null;
let finalWavBlob = null;
let appState = { streak:0, lastListenDate:null, totalListens:0, moodNotes:[] };
let hasCountedThisPlay = false;
let lastCurrentTime = 0;
let currentSavedId = null;     // id of the meditation on the player, if it has been saved
let currentScriptTitle = "";   // title of the script being recorded, used to suggest a name

// Add local mp3s to public/music/ and list them here — url must start with "/music/".
// See public/music/README.md for why these need to be local files, not hotlinked URLs.
const BACKGROUND_TRACKS = [
  { id: "none", name: "Voice only (no music)", url: null },
  { id: "pad", name: "Warm ambient pad (built-in)", url: null },
  { id: "deep_vocal", name: "Deep vocal (ambient)", url: "/music/deep_vocal.mp3" },
  { id: "forest_flow", name: "Forest flow (nature sounds)", url: "/music/forest_flow.mp3" },
  { id: "subtle_vibration", name: "Subtle vibration (classic meditation)", url: "/music/subtle_vibration.mp3" },
];
let studioSettings = { voiceVolume: 0.8, musicTrackId: "pad", musicVolume: 0.5, effectEnabled: true };
let cachedVoiceBuffers = null; // AudioBuffer objects decode independent of which context made them, so they're reusable across the live preview context and the offline render context
let cachedMusicBuffers = {}; // trackId -> AudioBuffer
let livePreviewNodes = null;

async function getVoiceBuffers(ctx){
  if(cachedVoiceBuffers) return cachedVoiceBuffers;
  const buffers = [];
  for(const blob of recordedBlobs){
    const arr = await blob.arrayBuffer();
    const buf = await new Promise((resolve, reject)=> ctx.decodeAudioData(arr, resolve, reject));
    buffers.push(buf);
  }
  cachedVoiceBuffers = buffers;
  return buffers;
}

async function getMusicBuffer(track, ctx){
  if(!track.url) return null;
  if(cachedMusicBuffers[track.id]) return cachedMusicBuffers[track.id];
  const resp = await fetch(track.url);
  if(!resp.ok) throw new Error(`Could not load "${track.name}" (${resp.status})`);
  const arr = await resp.arrayBuffer();
  const buf = await new Promise((resolve, reject)=> ctx.decodeAudioData(arr, resolve, reject));
  cachedMusicBuffers[track.id] = buf;
  return buf;
}

const app = document.getElementById("app");

app.innerHTML = `
  <div id="intro-layer" class="bg-layer bg-intro"></div>
  <div id="ripples-layer" class="bg-layer bg-ripples"></div>
  <div id="water-layer" class="bg-layer bg-water"></div>
  <div class="app">
    <div id="screen-intro" class="screen-hero hidden">
      <div class="hero-top">
        <div class="wordmark">Inward</div>
        <div class="tagline">Write it. Say it in your own voice. Live inside it.</div>
      </div>
      <div class="hero-content">
        <button class="btn btn-primary" id="btn-begin">Begin</button>
        <button class="btn btn-ghost btn-on-photo" id="btn-saved-intro">My meditations</button>
      </div>
    </div>

    <div id="screen-saved" class="screen-hero hidden">
      <div class="hero-content">
        <h2>My meditations</h2>
        <input type="text" id="saved-search" placeholder="Search by name…" />
        <div class="script-list saved-list" id="saved-list"></div>
        <div class="status" id="saved-status"></div>
        <button class="btn btn-primary" id="btn-saved-new">Record a new one</button>
      </div>
    </div>

    <div id="screen-library" class="screen-hero hidden">
      <div class="hero-content">
        <h2>Choose a script</h2>
        <div class="chips" id="persona-chips"></div>
        <div class="script-list" id="script-list"></div>
        <button class="link-btn" id="btn-write-own">Write my own instead</button>
        <button class="link-btn" id="btn-saved-library">My saved meditations</button>
      </div>
    </div>

    <div id="screen-settings" class="card hidden">
      <h2>Connect your API key</h2>
      <p class="muted">Script-writing calls the Anthropic API directly from your browser. Paste a key from
        <a href="https://console.anthropic.com" target="_blank">console.anthropic.com</a>.
        It's stored only in this browser's local storage.</p>
      <label>Anthropic API key</label>
      <input type="password" id="api-key-input" placeholder="sk-ant-..." />
      <button class="btn btn-primary" id="btn-save-key">Save key</button>
      <button class="link-btn" id="btn-use-test-script-settings">Skip for now — use a test script instead</button>
      <div class="status" id="settings-status"></div>
    </div>

    <div id="screen-setup" class="screen-hero hidden">
      <div class="hero-content">
        <h2>What are you working on?</h2>
        <label>Pick a thread (optional)</label>
        <div class="chips" id="theme-chips"></div>
        <label>What feels stuck, and how do you want to feel moving through your day instead? Write it plainly, in your own words.</label>
        <textarea id="feeling-input" placeholder="I keep bracing for criticism before meetings. I want to walk in steady, like my ideas already belong in the room."></textarea>
        <button class="btn btn-primary" id="btn-generate">Write my script</button>
        <button class="link-btn" id="btn-use-test-script">Use a test script instead (skip API + key)</button>
        <button class="link-btn" id="btn-open-settings">Change API key</button>
        <div class="status" id="setup-status"></div>
      </div>
    </div>

    <div id="screen-generating" class="card hidden">
      <h2>Writing your script</h2>
      <div class="spinner"></div>
      <p class="muted" style="text-align:center;">Shaping it into something you can say slowly, in your own voice.</p>
    </div>

    <div id="screen-record" class="screen-plain hidden">
      <h2>Record it, one piece at a time</h2>
      <div class="chunk-progress" id="chunk-progress"></div>
      <div class="dot-row" id="dot-row"></div>
      <div class="chunk-text" id="chunk-text"></div>
      <div id="record-controls"></div>
      <div class="status" id="record-status"></div>
    </div>

    <div id="screen-building" class="card hidden">
      <h2>Putting it together</h2>
      <div class="spinner"></div>
      <p class="muted" style="text-align:center;">Stitching your voice, adding a quiet bed of sound underneath.</p>
    </div>

    <div id="screen-player" class="card hidden">
      <h2 id="player-title">Your meditation</h2>
      <div class="stats">
        <div class="stat"><b id="stat-streak">0</b><span>day streak</span></div>
        <div class="stat"><b id="stat-listens">0</b><span>total listens</span></div>
      </div>
      <audio id="audio-el" style="display:none;"></audio>
      <button class="player-btn" id="play-btn">▶</button>
      <div class="toggle-row">
        <span>Loop</span>
        <input type="checkbox" id="loop-toggle" checked>
      </div>
      <div style="text-align:center; margin: 6px 0 16px;">
        <a class="download-link" id="download-link" download="inward-meditation.wav">Download audio file</a>
      </div>

      <div id="save-box" class="save-box">
        <label for="save-name">Save it with a name so you can come back to it</label>
        <input type="text" id="save-name" placeholder="Morning calm" maxlength="120" />
        <button class="btn btn-primary" id="btn-save-med">Save meditation</button>
        <div class="status" id="save-status"></div>
      </div>
      <div id="saved-note" class="muted saved-note hidden">Saved to My meditations.</div>

      <div class="section-divider">
        <h2>Studio</h2>
        <label>Background music</label>
        <select id="studio-music-select"></select>

        <div class="slider-row"><span>Music volume</span><b id="studio-music-volume-val"></b></div>
        <input type="range" id="studio-music-volume" min="0" max="100" step="5">

        <div class="slider-row" style="margin-top:14px;"><span>Voice volume</span><b id="studio-voice-volume-val"></b></div>
        <input type="range" id="studio-voice-volume" min="0" max="100" step="5">

        <div class="toggle-row" style="margin-top:14px;">
          <span>Headphone swell + drift effect</span>
          <input type="checkbox" id="studio-effect-toggle">
        </div>

        <button class="btn btn-ghost" id="btn-preview" style="margin-top:14px;">▶ Preview mix</button>
        <p class="muted" style="font-size:12px; margin: 6px 0 0;">Preview updates live as you drag the sliders. "Apply & rebuild" saves those settings into the final file below.</p>
        <button class="btn btn-ghost" id="btn-rebuild">Apply & rebuild</button>
        <div class="status" id="studio-status"></div>
      </div>

      <label style="margin-top:10px;">How do you feel right now?</label>
      <textarea id="mood-input" style="min-height:60px;" placeholder="A little steadier already."></textarea>
      <button class="btn btn-ghost" id="btn-save-mood">Save note</button>

      <div id="notes-list"></div>

      <button class="btn btn-ghost" id="btn-saved-player" style="margin-top:20px;">My meditations</button>
      <button class="btn btn-primary" id="btn-new">Start a new one</button>
    </div>
  </div>
`;

const $ = id => document.getElementById(id);
function show(id){
  ["screen-intro","screen-library","screen-saved","screen-settings","screen-setup","screen-generating","screen-record","screen-building","screen-player"].forEach(s=>{
    $(s).classList.toggle("hidden", s !== id);
  });
}

// ---------- persisted state (real localStorage now that we're on localhost) ----------
function loadState(){
  try{
    const raw = localStorage.getItem("inward-state");
    if(raw) appState = JSON.parse(raw);
  }catch(e){ /* no state yet */ }
  renderStats();
}
function saveState(){
  localStorage.setItem("inward-state", JSON.stringify(appState));
}
function renderStats(){
  $("stat-streak").textContent = appState.streak;
  $("stat-listens").textContent = appState.totalListens;
  const list = $("notes-list");
  list.innerHTML = "";
  appState.moodNotes.slice(-5).reverse().forEach(n=>{
    const d = document.createElement("div");
    d.className = "note-item";
    d.innerHTML = `<div class="note-date">${n.date}</div>${n.text}`;
    list.appendChild(d);
  });
}
function registerListen(){
  const today = new Date().toDateString();
  if(appState.lastListenDate !== today){
    const yesterday = new Date(Date.now()-86400000).toDateString();
    appState.streak = (appState.lastListenDate === yesterday) ? appState.streak + 1 : 1;
    appState.lastListenDate = today;
  }
  appState.totalListens += 1;
  renderStats();
  saveState();
}

// ---------- API key ----------
function getApiKey(){ return localStorage.getItem("inward-api-key") || ""; }

$("btn-save-key").onclick = ()=>{
  const key = $("api-key-input").value.trim();
  if(!key.startsWith("sk-ant-")){
    $("settings-status").textContent = "That doesn't look like an Anthropic key (starts with sk-ant-).";
    $("settings-status").className = "status error";
    return;
  }
  localStorage.setItem("inward-api-key", key);
  $("settings-status").textContent = "";
  show("screen-setup");
};
$("btn-open-settings").onclick = ()=>{
  $("api-key-input").value = getApiKey();
  show("screen-settings");
};

function useTestScript(){
  currentScriptTitle = "Test script";
  scriptChunks = TEST_SCRIPT_CHUNKS.slice();
  recordedBlobs = new Array(scriptChunks.length).fill(null);
  currentChunkIndex = 0;
  show("screen-record");
  renderRecordScreen();
}
$("btn-use-test-script").onclick = useTestScript;
$("btn-use-test-script-settings").onclick = useTestScript;

// ---------- library screen ----------
let selectedPersona = PERSONAS[0].id;
function renderLibrary(){
  const chipWrap = $("persona-chips");
  chipWrap.innerHTML = "";
  PERSONAS.forEach(p=>{
    const b = document.createElement("button");
    b.className = "chip" + (p.id === selectedPersona ? " active" : "");
    b.type = "button";
    b.textContent = p.label;
    b.onclick = ()=>{ selectedPersona = p.id; renderLibrary(); };
    chipWrap.appendChild(b);
  });
  const list = $("script-list");
  list.innerHTML = "";
  LIBRARY.filter(s=>s.persona === selectedPersona).forEach(s=>{
    const b = document.createElement("button");
    b.className = "script-item";
    b.type = "button";
    b.innerHTML = `<b></b><span></span>`;
    b.querySelector("b").textContent = s.title;
    b.querySelector("span").textContent = s.chunks[0];
    b.onclick = ()=>{
      currentScriptTitle = s.title;
      scriptChunks = s.chunks.slice();
      recordedBlobs = new Array(scriptChunks.length).fill(null);
      currentChunkIndex = 0;
      show("screen-record");
      renderRecordScreen();
    };
    list.appendChild(b);
  });
}
$("btn-write-own").onclick = ()=>{
  show(getApiKey() ? "screen-setup" : "screen-settings");
};

// ---------- setup screen ----------
function initChips(){
  const wrap = $("theme-chips");
  THEMES.forEach(t=>{
    const b = document.createElement("button");
    b.className = "chip";
    b.type = "button";
    b.textContent = t;
    b.onclick = ()=>{
      selectedTheme = (selectedTheme === t) ? null : t;
      [...wrap.children].forEach(c=>c.classList.remove("active"));
      if(selectedTheme) b.classList.add("active");
    };
    wrap.appendChild(b);
  });
}

$("btn-generate").onclick = async ()=>{
  const feeling = $("feeling-input").value.trim();
  if(!feeling){ $("setup-status").textContent = "Write a sentence or two first."; return; }
  $("setup-status").textContent = "";
  show("screen-generating");
  try{
    const chunks = await generateScript(feeling, selectedTheme);
    currentScriptTitle = selectedTheme || "My own script";
    scriptChunks = chunks;
    recordedBlobs = new Array(chunks.length).fill(null);
    currentChunkIndex = 0;
    show("screen-record");
    renderRecordScreen();
  }catch(e){
    console.error(e);
    show("screen-setup");
    $("setup-status").textContent = "Something went wrong writing the script: " + e.message;
    $("setup-status").className = "status error";
  }
};

async function generateScript(feeling, theme){
  const apiKey = getApiKey();
  if(!apiKey) throw new Error("No API key saved yet — tap 'Change API key' first.");
  const system = `You write short guided-meditation affirmation scripts in the voice and method of "The Power of the Subconscious Mind" by Joseph Murphy: calm, first-person ("I am", "I release", "I claim"), present tense, as if the desired state is already true, gently repetitive, free of therapy jargon or hedging language like "try to" or "maybe." Use Murphy's own vocabulary: Infinite Intelligence, my subconscious mind, impressing a truth upon the subconscious, divine right action, divine order, the peace of God, "I claim it, I accept it," "I give thanks," and closing on "it is done." The listener records this in their own voice as their own affirmation, so never address a "you." Sentences are short and easy to say slowly aloud. No stage directions, no headers, no markdown. Respond ONLY with raw JSON, no code fences, no preamble, in exactly this shape: {"chunks": ["...", "...", "...", "...", "..."]}. Produce exactly 5 chunks, each 2-3 short sentences, meant to be read aloud one at a time, moving from settling in, to naming the shift, to affirming the new state, to it becoming natural, to carrying it into the day.`;
  const userMsg = `Theme: ${theme || "personal growth"}\nWhat they shared: ${feeling}`;
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 1000,
      system: system,
      messages: [{role:"user", content: userMsg}]
    })
  });
  if(!resp.ok){
    const errBody = await resp.text();
    throw new Error(`API error ${resp.status}: ${errBody.slice(0,200)}`);
  }
  const data = await resp.json();
  const textBlock = data.content.find(b=>b.type==="text");
  let raw = textBlock.text.trim().replace(/^```json/,"").replace(/^```/,"").replace(/```$/,"").trim();
  const parsed = JSON.parse(raw);
  return parsed.chunks;
}

// ---------- record screen ----------
function renderRecordScreen(){
  $("screen-record").classList.remove("recording-active");
  $("chunk-progress").textContent = `Piece ${currentChunkIndex+1} of ${scriptChunks.length}`;
  $("chunk-text").textContent = scriptChunks[currentChunkIndex];
  const dotRow = $("dot-row");
  dotRow.innerHTML = "";
  scriptChunks.forEach((_,i)=>{
    const d = document.createElement("div");
    d.className = "dot" + (recordedBlobs[i] ? " done" : (i===currentChunkIndex ? " current" : ""));
    dotRow.appendChild(d);
  });
  renderRecordControls();
}

function renderRecordControls(){
  const wrap = $("record-controls");
  wrap.innerHTML = "";
  const hasRecording = !!recordedBlobs[currentChunkIndex];

  if(!hasRecording){
    const recBtn = document.createElement("button");
    recBtn.className = "btn btn-rec";
    recBtn.textContent = "● Record this piece";
    recBtn.onclick = startRecording;
    wrap.appendChild(recBtn);
  } else {
    const playRow = document.createElement("div");
    playRow.className = "row";
    const playBtn = document.createElement("button");
    playBtn.className = "btn btn-ghost";
    playBtn.textContent = "▶ Play back";
    playBtn.onclick = ()=>{
      const url = URL.createObjectURL(recordedBlobs[currentChunkIndex]);
      new Audio(url).play();
    };
    const redoBtn = document.createElement("button");
    redoBtn.className = "btn btn-ghost";
    redoBtn.textContent = "Redo";
    redoBtn.onclick = ()=>{ recordedBlobs[currentChunkIndex] = null; renderRecordScreen(); };
    playRow.appendChild(playBtn);
    playRow.appendChild(redoBtn);
    wrap.appendChild(playRow);

    const nextBtn = document.createElement("button");
    nextBtn.className = "btn btn-primary";
    const isLast = currentChunkIndex === scriptChunks.length - 1;
    nextBtn.textContent = isLast ? "Finish & build my meditation" : "Next piece →";
    nextBtn.onclick = ()=>{
      if(isLast){ currentSavedId = null; buildFinalAudio(); }
      else { currentChunkIndex += 1; renderRecordScreen(); }
    };
    wrap.appendChild(nextBtn);
  }
}

function pickRecorderMimeType(){
  const candidates = ["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg;codecs=opus"];
  for(const type of candidates){
    if(window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) return type;
  }
  return undefined; // let the browser pick its own default
}

async function startRecording(){
  $("record-status").textContent = "Requesting microphone…";
  $("record-status").className = "status";
  try{
    stream = await navigator.mediaDevices.getUserMedia({audio:true});
  }catch(e){
    $("record-status").textContent = "Microphone access was denied or unavailable: " + e.message;
    $("record-status").className = "status error";
    return;
  }
  mediaChunks = [];
  const mimeType = pickRecorderMimeType();
  mediaRecorder = mimeType ? new MediaRecorder(stream, {mimeType}) : new MediaRecorder(stream);
  mediaRecorder.ondataavailable = e=>{ if(e.data.size>0) mediaChunks.push(e.data); };
  mediaRecorder.onstop = ()=>{
    recordedBlobs[currentChunkIndex] = new Blob(mediaChunks, {type: mediaChunks[0]?.type || "audio/webm"});
    stream.getTracks().forEach(t=>t.stop());
    $("record-status").textContent = "";
    renderRecordScreen();
  };
  mediaRecorder.start();
  $("screen-record").classList.add("recording-active");
  $("record-status").textContent = "Recording…";
  const wrap = $("record-controls");
  wrap.innerHTML = "";
  const stopBtn = document.createElement("button");
  stopBtn.className = "btn btn-stop";
  stopBtn.textContent = "■ Stop";
  stopBtn.onclick = ()=> mediaRecorder.stop();
  wrap.appendChild(stopBtn);
}

// ---------- build final audio ----------
async function buildFinalAudio(isRebuild=false, onError=null){
  stopPreview();
  show("screen-building");
  try{
    const liveCtx = new (window.AudioContext || window.webkitAudioContext)();
    const buffers = await getVoiceBuffers(liveCtx);
    const track = BACKGROUND_TRACKS.find(t=>t.id===studioSettings.musicTrackId) || BACKGROUND_TRACKS[0];
    const musicBuffer = await getMusicBuffer(track, liveCtx);

    const sampleRate = liveCtx.sampleRate;
    const gap = 0.8, leadIn = 1.2, tailOut = 3.5;
    const voiceTotal = buffers.reduce((s,b)=>s+b.duration,0) + gap*(buffers.length-1);
    const totalDuration = leadIn + voiceTotal + tailOut;

    const offline = new OfflineAudioContext(2, Math.ceil(totalDuration*sampleRate), sampleRate);

    // ---- background music bed ----
    const musicPeak = studioSettings.musicVolume * 0.14; // gentle bed, kept under the voice
    if(track.id === "pad"){
      const padGain = offline.createGain();
      padGain.gain.setValueAtTime(0, 0);
      padGain.gain.linearRampToValueAtTime(musicPeak, 2);
      padGain.gain.setValueAtTime(musicPeak, totalDuration-3);
      padGain.gain.linearRampToValueAtTime(0, totalDuration);
      padGain.connect(offline.destination);
      [110, 165, 220].forEach((freq,i)=>{
        const osc = offline.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq;
        const g = offline.createGain();
        g.gain.value = 0.35 - i*0.08;
        osc.connect(g).connect(padGain);
        osc.start(0); osc.stop(totalDuration);
      });
      function bell(startTime){
        const osc = offline.createOscillator();
        osc.type = "sine"; osc.frequency.value = 528;
        const g = offline.createGain();
        g.gain.setValueAtTime(0.001, startTime);
        g.gain.linearRampToValueAtTime(musicPeak*1.8, startTime+0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, startTime+3.2);
        osc.connect(g).connect(offline.destination);
        osc.start(startTime); osc.stop(startTime+3.3);
      }
      if(musicPeak > 0){ bell(0.2); bell(totalDuration - 3.4); }
    } else if(musicBuffer){
      const musicGain = offline.createGain();
      musicGain.gain.setValueAtTime(0, 0);
      musicGain.gain.linearRampToValueAtTime(musicPeak, 2);
      musicGain.gain.setValueAtTime(musicPeak, totalDuration-3);
      musicGain.gain.linearRampToValueAtTime(0, totalDuration);
      musicGain.connect(offline.destination);
      const musicSrc = offline.createBufferSource();
      musicSrc.buffer = musicBuffer;
      musicSrc.loop = true;
      musicSrc.connect(musicGain);
      musicSrc.start(0);
      musicSrc.stop(totalDuration);
    }

    // ---- voice, with the headphone swell + drift effect ----
    const voiceGain = offline.createGain();
    voiceGain.gain.value = studioSettings.voiceVolume;
    const voicePan = offline.createStereoPanner();
    voiceGain.connect(voicePan).connect(offline.destination);

    if(studioSettings.effectEnabled){
      const swellLfo = offline.createOscillator();
      swellLfo.type = "sine";
      swellLfo.frequency.value = 0.06; // ~16s breathing cycle
      const swellDepth = offline.createGain();
      swellDepth.gain.value = studioSettings.voiceVolume * 0.35; // always < base gain, so it never goes silent
      swellLfo.connect(swellDepth).connect(voiceGain.gain);
      swellLfo.start(0); swellLfo.stop(totalDuration);

      const panLfo = offline.createOscillator();
      panLfo.type = "sine";
      panLfo.frequency.value = 0.03; // slow left-right-left drift
      const panDepth = offline.createGain();
      panDepth.gain.value = 0.6;
      panLfo.connect(panDepth).connect(voicePan.pan);
      panLfo.start(0); panLfo.stop(totalDuration);
    }

    let t = leadIn;
    buffers.forEach(buf=>{
      const src = offline.createBufferSource();
      src.buffer = buf;
      src.connect(voiceGain);
      src.start(t);
      t += buf.duration + gap;
    });

    const rendered = await offline.startRendering();
    const oldUrl = $("audio-el").src;
    finalWavBlob = audioBufferToWav(rendered);
    const url = URL.createObjectURL(finalWavBlob);
    $("audio-el").src = url;
    $("download-link").href = url;
    if(oldUrl && oldUrl.startsWith("blob:")) URL.revokeObjectURL(oldUrl);
    setupPlayer();
    renderSaveBox();
    show("screen-player");
  }catch(e){
    console.error(e);
    if(onError){
      onError(e);
    } else if(isRebuild){
      show("screen-player");
      $("studio-status").textContent = "Rebuild failed: " + e.message;
      $("studio-status").className = "status error";
    } else {
      show("screen-record");
      $("record-status").textContent = "Building failed: " + e.message;
      $("record-status").className = "status error";
    }
  }
}

function audioBufferToWav(buffer){
  const numCh = buffer.numberOfChannels;
  const len = buffer.length * numCh * 2 + 44;
  const arrBuf = new ArrayBuffer(len);
  const view = new DataView(arrBuf);
  const writeStr = (o,s)=>{ for(let i=0;i<s.length;i++) view.setUint8(o+i, s.charCodeAt(i)); };
  writeStr(0,"RIFF"); view.setUint32(4, len-8, true); writeStr(8,"WAVE");
  writeStr(12,"fmt "); view.setUint32(16,16,true); view.setUint16(20,1,true);
  view.setUint16(22,numCh,true); view.setUint32(24,buffer.sampleRate,true);
  view.setUint32(28,buffer.sampleRate*numCh*2,true); view.setUint16(32,numCh*2,true);
  view.setUint16(34,16,true); writeStr(36,"data"); view.setUint32(40,len-44,true);
  let offset = 44;
  const chans = [];
  for(let c=0;c<numCh;c++) chans.push(buffer.getChannelData(c));
  for(let i=0;i<buffer.length;i++){
    for(let c=0;c<numCh;c++){
      let sample = Math.max(-1, Math.min(1, chans[c][i]));
      sample = sample < 0 ? sample*0x8000 : sample*0x7FFF;
      view.setInt16(offset, sample, true);
      offset += 2;
    }
  }
  return new Blob([arrBuf], {type:"audio/wav"});
}

// ---------- player screen ----------
function setupPlayer(){
  const audio = $("audio-el");
  audio.loop = $("loop-toggle").checked;
  $("loop-toggle").onchange = ()=>{ audio.loop = $("loop-toggle").checked; };
  const playBtn = $("play-btn");
  hasCountedThisPlay = false;
  lastCurrentTime = 0;
  playBtn.onclick = ()=>{
    if(audio.paused){ stopPreview(); audio.play(); playBtn.textContent = "❚❚"; }
    else { audio.pause(); playBtn.textContent = "▶"; }
  };
  audio.onplay = ()=>{
    if(!hasCountedThisPlay){ registerListen(); hasCountedThisPlay = true; }
  };
  audio.ontimeupdate = ()=>{
    if(audio.currentTime < lastCurrentTime - 1){ registerListen(); }
    lastCurrentTime = audio.currentTime;
  };
  audio.onended = ()=>{ playBtn.textContent = "▶"; };
}

function initStudioPanel(){
  const select = $("studio-music-select");
  BACKGROUND_TRACKS.forEach(track=>{
    const opt = document.createElement("option");
    opt.value = track.id;
    opt.textContent = track.name;
    select.appendChild(opt);
  });
  select.value = studioSettings.musicTrackId;
  $("studio-music-volume").value = Math.round(studioSettings.musicVolume*100);
  $("studio-voice-volume").value = Math.round(studioSettings.voiceVolume*100);
  $("studio-effect-toggle").checked = studioSettings.effectEnabled;
  renderStudioLabels();

  $("studio-voice-volume").oninput = ()=>{
    renderStudioLabels();
    if(livePreviewNodes){
      const v = $("studio-voice-volume").value/100;
      const {voiceGain, swellDepth, ctx} = livePreviewNodes;
      voiceGain.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
      swellDepth.gain.setTargetAtTime(v*0.35, ctx.currentTime, 0.05);
    }
  };
  $("studio-music-volume").oninput = ()=>{
    renderStudioLabels();
    if(livePreviewNodes && livePreviewNodes.musicGain){
      const {musicGain, ctx} = livePreviewNodes;
      musicGain.gain.setTargetAtTime($("studio-music-volume").value/100*0.14, ctx.currentTime, 0.05);
    }
  };
  $("studio-effect-toggle").onchange = ()=>{
    if(!livePreviewNodes) return;
    const {swellDepth, panDepth, voiceGain, voicePan, ctx} = livePreviewNodes;
    if($("studio-effect-toggle").checked){
      swellDepth.connect(voiceGain.gain);
      panDepth.connect(voicePan.pan);
    } else {
      swellDepth.disconnect();
      panDepth.disconnect();
      voiceGain.gain.setTargetAtTime($("studio-voice-volume").value/100, ctx.currentTime, 0.05);
      voicePan.pan.setTargetAtTime(0, ctx.currentTime, 0.05);
    }
  };
  select.onchange = ()=>{
    if(livePreviewNodes) startPreview(); // switching the music bed needs a fresh graph; voice restarts from the top too
  };

  $("btn-preview").onclick = ()=>{
    if(livePreviewNodes) stopPreview();
    else startPreview();
  };

  $("btn-rebuild").onclick = async ()=>{
    studioSettings.musicTrackId = select.value;
    studioSettings.musicVolume = $("studio-music-volume").value/100;
    studioSettings.voiceVolume = $("studio-voice-volume").value/100;
    studioSettings.effectEnabled = $("studio-effect-toggle").checked;
    $("studio-status").textContent = "";
    await buildFinalAudio(true);
    if(currentSavedId){
      try{
        await apiJson(`${API}/${currentSavedId}`, {
          method:"PATCH",
          headers:{ "Content-Type":"application/json" },
          body: JSON.stringify({ studio: studioSettings })
        });
        $("studio-status").textContent = "Saved these settings to this meditation.";
        $("studio-status").className = "status";
      }catch(e){
        $("studio-status").textContent = "Rebuilt, but couldn't save these settings: " + e.message;
        $("studio-status").className = "status error";
      }
    }
  };
}
function renderStudioLabels(){
  $("studio-music-volume-val").textContent = $("studio-music-volume").value + "%";
  $("studio-voice-volume-val").textContent = $("studio-voice-volume").value + "%";
}

// ---------- live preview (real-time, for the Studio sliders) ----------
async function startPreview(){
  stopPreview();
  $("studio-status").textContent = "";
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const voiceBuffers = await getVoiceBuffers(ctx);
    const track = BACKGROUND_TRACKS.find(t=>t.id===$("studio-music-select").value) || BACKGROUND_TRACKS[0];

    const voiceGain = ctx.createGain();
    voiceGain.gain.value = $("studio-voice-volume").value/100;
    const voicePan = ctx.createStereoPanner();
    voiceGain.connect(voicePan).connect(ctx.destination);

    const swellLfo = ctx.createOscillator();
    swellLfo.type = "sine"; swellLfo.frequency.value = 0.06;
    const swellDepth = ctx.createGain();
    swellDepth.gain.value = voiceGain.gain.value * 0.35;
    swellLfo.connect(swellDepth);

    const panLfo = ctx.createOscillator();
    panLfo.type = "sine"; panLfo.frequency.value = 0.03;
    const panDepth = ctx.createGain();
    panDepth.gain.value = 0.6;
    panLfo.connect(panDepth);

    if($("studio-effect-toggle").checked){
      swellDepth.connect(voiceGain.gain);
      panDepth.connect(voicePan.pan);
    }
    swellLfo.start();
    panLfo.start();

    let musicGain = null;
    if(track.id === "pad"){
      musicGain = ctx.createGain();
      musicGain.gain.value = $("studio-music-volume").value/100 * 0.14;
      musicGain.connect(ctx.destination);
      [110, 165, 220].forEach((freq,i)=>{
        const osc = ctx.createOscillator();
        osc.type = "sine"; osc.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.value = 0.35 - i*0.08;
        osc.connect(g).connect(musicGain);
        osc.start();
      });
    } else if(track.url){
      const musicBuffer = await getMusicBuffer(track, ctx);
      musicGain = ctx.createGain();
      musicGain.gain.value = $("studio-music-volume").value/100 * 0.14;
      musicGain.connect(ctx.destination);
      const musicSrc = ctx.createBufferSource();
      musicSrc.buffer = musicBuffer;
      musicSrc.loop = true;
      musicSrc.connect(musicGain);
      musicSrc.start();
    }

    let t = ctx.currentTime + 0.1;
    let lastSrc = null;
    voiceBuffers.forEach(buf=>{
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(voiceGain);
      src.start(t);
      t += buf.duration + 0.8;
      lastSrc = src;
    });

    livePreviewNodes = { ctx, voiceGain, voicePan, swellDepth, panDepth, musicGain };
    if(lastSrc) lastSrc.onended = ()=>{ if(livePreviewNodes && livePreviewNodes.ctx === ctx) stopPreview(); };
    $("btn-preview").textContent = "■ Stop preview";
  }catch(e){
    console.error(e);
    $("studio-status").textContent = "Preview failed: " + e.message;
    $("studio-status").className = "status error";
  }
}
function stopPreview(){
  if(livePreviewNodes){
    try{ livePreviewNodes.ctx.close(); }catch(e){}
    livePreviewNodes = null;
  }
  $("btn-preview").textContent = "▶ Preview mix";
}

$("btn-save-mood").onclick = ()=>{
  const text = $("mood-input").value.trim();
  if(!text) return;
  appState.moodNotes.push({date: new Date().toLocaleString(), text});
  $("mood-input").value = "";
  renderStats();
  saveState();
};

$("btn-new").onclick = ()=>{
  stopPreview();
  $("feeling-input").value = "";
  selectedTheme = null;
  [...$("theme-chips").children].forEach(c=>c.classList.remove("active"));
  scriptChunks = []; recordedBlobs = []; currentChunkIndex = 0; finalWavBlob = null;
  cachedVoiceBuffers = null;
  currentSavedId = null; currentScriptTitle = "";
  $("save-name").value = "";
  pausePlayer();
  renderLibrary();
  show("screen-library");
};

// ---------- saved meditations (Netlify Function + Blobs, no login) ----------
const API = "/api/meditations";
let savedItems = [];

async function apiJson(url, options){
  const resp = await fetch(url, options);
  let data = null;
  try{ data = await resp.json(); }catch(e){ /* not JSON */ }
  if(!resp.ok) throw new Error((data && data.error) || `Request failed (${resp.status})`);
  return data;
}

function pausePlayer(){
  const audio = $("audio-el");
  if(audio && !audio.paused) audio.pause();
  $("play-btn").textContent = "▶";
}

function syncStudioControls(){
  $("studio-music-select").value = studioSettings.musicTrackId;
  $("studio-music-volume").value = Math.round(studioSettings.musicVolume*100);
  $("studio-voice-volume").value = Math.round(studioSettings.voiceVolume*100);
  $("studio-effect-toggle").checked = studioSettings.effectEnabled;
  renderStudioLabels();
}

function renderSaveBox(nameOverride){
  $("save-status").textContent = "";
  $("save-status").className = "status";
  if(currentSavedId){
    if(nameOverride) $("player-title").textContent = nameOverride;
    $("save-box").classList.add("hidden");
    $("saved-note").classList.remove("hidden");
  } else {
    $("player-title").textContent = "Your meditation";
    if(!$("save-name").value.trim()) $("save-name").value = currentScriptTitle || "";
    $("btn-save-med").disabled = false;
    $("save-box").classList.remove("hidden");
    $("saved-note").classList.add("hidden");
  }
}

$("btn-save-med").onclick = async ()=>{
  const name = $("save-name").value.trim();
  const status = $("save-status");
  status.className = "status";
  if(!name){ status.textContent = "Give it a name first."; status.className = "status error"; return; }
  if(!recordedBlobs.length || recordedBlobs.some(b=>!b)){ status.textContent = "There's nothing recorded to save yet."; status.className = "status error"; return; }
  const btn = $("btn-save-med");
  btn.disabled = true;
  const id = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2,10));
  try{
    for(let i=0;i<recordedBlobs.length;i++){
      status.textContent = `Saving your voice… (${i+1} of ${recordedBlobs.length})`;
      const blob = recordedBlobs[i];
      await apiJson(`${API}/${id}/pieces/${i}`, {
        method:"PUT",
        headers:{ "Content-Type": blob.type || "application/octet-stream" },
        body: blob
      });
    }
    status.textContent = "Almost done…";
    await apiJson(API, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ id, name, scriptTitle: currentScriptTitle || null, chunks: scriptChunks, studio: studioSettings })
    });
    currentSavedId = id;
    renderSaveBox(name);
  }catch(e){
    console.error(e);
    status.textContent = "Couldn't save: " + e.message;
    status.className = "status error";
    btn.disabled = false;
  }
};

async function openSavedList(){
  stopPreview();
  pausePlayer();
  show("screen-saved");
  $("saved-search").value = "";
  $("saved-list").innerHTML = "";
  $("saved-status").textContent = "Loading…";
  $("saved-status").className = "status";
  try{
    savedItems = await apiJson(API);
    $("saved-status").textContent = "";
    renderSavedList();
  }catch(e){
    $("saved-status").textContent = "Couldn't load your meditations: " + e.message;
    $("saved-status").className = "status error";
  }
}

function renderSavedList(){
  const q = $("saved-search").value.trim().toLowerCase();
  const list = $("saved-list");
  list.innerHTML = "";
  if(!savedItems.length){
    list.innerHTML = `<p class="muted">Nothing saved yet. After you record a meditation, give it a name and tap "Save meditation".</p>`;
    return;
  }
  const items = savedItems.filter(m=>!q || m.name.toLowerCase().includes(q));
  if(!items.length){
    list.innerHTML = `<p class="muted">No meditation with that name.</p>`;
    return;
  }
  items.forEach(m=>{
    const row = document.createElement("div");
    row.className = "saved-item";
    const open = document.createElement("button");
    open.type = "button";
    open.className = "script-item";
    open.innerHTML = `<b></b><span></span>`;
    open.querySelector("b").textContent = m.name;
    const date = m.createdAt ? new Date(m.createdAt).toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"}) : "";
    open.querySelector("span").textContent = [m.scriptTitle && m.scriptTitle !== m.name ? m.scriptTitle : "", date].filter(Boolean).join(" · ");
    open.onclick = ()=> openSaved(m.id);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "saved-del";
    del.setAttribute("aria-label", `Delete ${m.name}`);
    del.textContent = "Delete";
    del.onclick = async ()=>{
      if(del.dataset.confirm !== "1"){
        del.dataset.confirm = "1"; del.textContent = "Sure?"; del.classList.add("confirm");
        setTimeout(()=>{ if(del.isConnected){ del.dataset.confirm = ""; del.textContent = "Delete"; del.classList.remove("confirm"); } }, 3000);
        return;
      }
      del.disabled = true;
      try{
        await apiJson(`${API}/${m.id}`, { method:"DELETE" });
        savedItems = savedItems.filter(x=>x.id !== m.id);
        renderSavedList();
      }catch(e){
        $("saved-status").textContent = "Couldn't delete: " + e.message;
        $("saved-status").className = "status error";
        del.disabled = false;
      }
    };
    row.appendChild(open);
    row.appendChild(del);
    list.appendChild(row);
  });
}

async function openSaved(id){
  const fail = (e)=>{
    console.error(e);
    currentSavedId = null;
    show("screen-saved");
    $("saved-status").textContent = "Couldn't open it: " + e.message;
    $("saved-status").className = "status error";
  };
  show("screen-building");
  try{
    const meta = await apiJson(`${API}/${id}`);
    const blobs = await Promise.all(Array.from({length: meta.pieceCount}, async (_,i)=>{
      const resp = await fetch(`${API}/${meta.id}/pieces/${i}`);
      if(!resp.ok) throw new Error(`Part ${i+1} of the recording is missing`);
      return await resp.blob();
    }));
    scriptChunks = meta.chunks;
    recordedBlobs = blobs;
    cachedVoiceBuffers = null;
    currentScriptTitle = meta.scriptTitle || "";
    if(meta.studio){
      studioSettings = { ...studioSettings, ...meta.studio };
      if(!BACKGROUND_TRACKS.some(t=>t.id===studioSettings.musicTrackId)) studioSettings.musicTrackId = "pad";
    }
    syncStudioControls();
    currentSavedId = meta.id;
    await buildFinalAudio(false, fail);
    if(currentSavedId === meta.id) renderSaveBox(meta.name);
  }catch(e){
    fail(e);
  }
}

$("saved-search").oninput = renderSavedList;
$("btn-saved-intro").onclick = openSavedList;
$("btn-saved-library").onclick = openSavedList;
$("btn-saved-player").onclick = openSavedList;
$("btn-saved-new").onclick = ()=>{ renderLibrary(); show("screen-library"); };

// API key screen is skipped for now — reachable via "Write my own instead"
$("btn-begin").onclick = ()=>{
  renderLibrary();
  show("screen-library");
};

initChips();
initStudioPanel();
loadState();
show("screen-intro");
