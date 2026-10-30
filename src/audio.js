// Tiny synthesized sound effects + soft ambience (WebAudio). Placeholder audio until real sound assets exist.
// Browsers only allow audio after a user gesture; unlock() is called from the first tap/click/key.
let ac = null, master = null, sfxGain = null, ambGain = null, ambNodes = null;
let settings = { sfx: 0.6, ambience: 0.3, muted: false };

export function configureAudio(next) {
  settings = { ...settings, ...next };
  if (!ac) return;
  master.gain.value = settings.muted ? 0 : 1;
  sfxGain.gain.value = settings.sfx;
  ambGain.gain.value = settings.ambience * 0.25;
}

export function unlockAudio() {
  if (ac || typeof window === 'undefined') { if (ac?.state === 'suspended') ac.resume(); return; }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  ac = new Ctx();
  master = ac.createGain(); master.connect(ac.destination);
  sfxGain = ac.createGain(); sfxGain.connect(master);
  ambGain = ac.createGain(); ambGain.connect(master);
  configureAudio({});
  startAmbience();
}

const NOTES = {
  click: [[660, 0.04, 'square']],
  coin: [[880, 0.06, 'square'], [1320, 0.08, 'square']],
  gather: [[220, 0.06, 'triangle'], [330, 0.06, 'triangle']],
  build: [[180, 0.08, 'square'], [140, 0.08, 'square'], [240, 0.1, 'triangle']],
  error: [[180, 0.12, 'sawtooth']],
  level: [[523, 0.08, 'square'], [659, 0.08, 'square'], [784, 0.14, 'square']],
  open: [[520, 0.03, 'triangle'], [780, 0.05, 'triangle']],
};
export function sfx(name) {
  if (!ac || settings.muted || settings.sfx <= 0) return;
  let t = ac.currentTime;
  for (const [f, d, type] of NOTES[name] || NOTES.click) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + d + 0.02); t += d * 0.85;
  }
}

function startAmbience() {
  // gentle filtered noise "breeze" + slow pad; volume controlled by settings.ambience
  const len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.35;
  const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
  const pad = ac.createOscillator(); pad.type = 'sine'; pad.frequency.value = 196;
  const padG = ac.createGain(); padG.gain.value = 0.05;
  src.connect(lp); lp.connect(ambGain); pad.connect(padG); padG.connect(ambGain);
  src.start(); pad.start();
  ambNodes = { src, pad };
}
export function audioState() { return { ready: !!ac, state: ac?.state || 'none', ...settings }; }
