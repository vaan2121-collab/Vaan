// Спокойная фоновая музыка и звуки — всё синтезируется через Web Audio, без аудиофайлов.
(function () {
  'use strict';

  const AC = window.AudioContext || window.webkitAudioContext;
  const BEAT = 0.9; // секунды на долю — медленно и спокойно
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);

  // Аккорды: бас + тона аккорда (MIDI-номера)
  const PROG = [
    { bass: 41, chord: [57, 60, 64, 65] }, // Fmaj7
    { bass: 36, chord: [55, 60, 62, 64] }, // Cadd9
    { bass: 45, chord: [57, 60, 64, 67] }, // Am7
    { bass: 43, chord: [55, 59, 62, 67] }, // G
    { bass: 38, chord: [57, 60, 62, 65] }, // Dm7
    { bass: 40, chord: [55, 59, 64, 67] }, // Em7
    { bass: 41, chord: [57, 60, 65, 69] }, // F
    { bass: 43, chord: [55, 59, 62, 65] }  // G7
  ];
  const SCALE = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81]; // до-мажорная пентатоника

  let ctx = null, master, musicIn, musicOut, sfxOut, noiseBuf;
  let timer = null, nextBar = 0, bar = 0, melody = 5;
  let musicOn = false, sfxOn = true;

  function impulse(sec) {
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return buf;
  }

  function init() {
    if (!AC) return false;
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      master.connect(ctx.destination);

      musicOut = ctx.createGain();
      musicOut.gain.value = 0;
      musicOut.connect(master);

      musicIn = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2400;
      const rev = ctx.createConvolver();
      rev.buffer = impulse(4);
      const dry = ctx.createGain(); dry.gain.value = 0.75;
      const wet = ctx.createGain(); wet.gain.value = 0.55;
      musicIn.connect(lp);
      lp.connect(dry); dry.connect(musicOut);
      lp.connect(rev); rev.connect(wet); wet.connect(musicOut);

      sfxOut = ctx.createGain();
      sfxOut.gain.value = 0.6;
      sfxOut.connect(master);

      noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.6), ctx.sampleRate);
      const nd = noiseBuf.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) ctx.suspend();
        else ctx.resume();
      });
    }
    if (ctx.state !== 'running' && !document.hidden) ctx.resume();
    return true;
  }

  // Мягкий «пианинный» тон: синус + тихая октава, быстрая атака и долгое затухание
  function tone(freq, t, dur, vol, dest) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    g.connect(dest);

    const o1 = ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.value = freq;
    o1.connect(g);

    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = freq * 2;
    o2.detune.value = 4;
    const g2 = ctx.createGain();
    g2.gain.value = 0.15;
    o2.connect(g2); g2.connect(g);

    o1.start(t); o2.start(t);
    o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }

  function scheduleBar(t) {
    const ch = PROG[bar % PROG.length];
    const section = bar % 16;

    tone(midi(ch.bass), t, BEAT * 5, 0.12, musicIn);

    // тихое арпеджио аккорда
    ch.chord.forEach((n, k) => {
      if (Math.random() < 0.7) tone(midi(n), t + k * BEAT * 0.5 + Math.random() * 0.03, 3.5, 0.04, musicIn);
    });
    if (Math.random() < 0.4) {
      const n = ch.chord[Math.floor(Math.random() * 4)];
      tone(midi(n), t + BEAT * 2.5, 3, 0.035, musicIn);
    }

    // редкая мелодия, с паузами как у C418
    if (bar >= 4 && section < 14 && Math.random() < 0.7) {
      for (let pos = 0; pos < 8; pos++) {
        if (Math.random() < 0.28) {
          melody = Math.max(0, Math.min(SCALE.length - 1, melody + Math.floor(Math.random() * 5) - 2));
          tone(midi(SCALE[melody]), t + pos * BEAT / 2, 2.8, 0.055, musicIn);
        }
      }
    }
    bar++;
  }

  function schedule() {
    if (ctx.state !== 'running') return;
    if (nextBar < ctx.currentTime) nextBar = ctx.currentTime + 0.1;
    while (nextBar < ctx.currentTime + 1.2) {
      scheduleBar(nextBar);
      nextBar += BEAT * 4;
    }
  }

  function setMusic(on) {
    musicOn = on;
    if (!on) {
      if (ctx) {
        musicOut.gain.cancelScheduledValues(ctx.currentTime);
        musicOut.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
      }
      if (timer) { clearInterval(timer); timer = null; }
      return;
    }
    if (!init()) return;
    musicOut.gain.cancelScheduledValues(ctx.currentTime);
    musicOut.gain.setTargetAtTime(0.9, ctx.currentTime, 0.8);
    if (!timer) {
      timer = setInterval(schedule, 200);
      schedule();
    }
  }

  function setSfx(on) { sfxOn = on; }

  // ---------- Звуковые эффекты ----------
  function noise(t, dur, freq, q, vol) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(sfxOut);
    s.start(t, Math.random() * 0.3);
    s.stop(t + dur + 0.02);
  }

  function thump(t, from, to, dur, vol) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(sfxOut);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function ready() { return sfxOn && init(); }

  function move() {
    if (!ready()) return;
    const t = ctx.currentTime;
    noise(t, 0.07, 1100, 1.2, 0.5);
    thump(t, 180, 90, 0.09, 0.35);
  }

  function capture() {
    if (!ready()) return;
    const t = ctx.currentTime;
    for (let k = 0; k < 4; k++) noise(t + k * 0.045, 0.12, 400 + Math.random() * 900, 0.8, 0.6);
    thump(t, 120, 50, 0.2, 0.35);
  }

  function melodySfx(notes, gap, vol) {
    if (!ready()) return;
    const t = ctx.currentTime;
    notes.forEach((n, k) => tone(midi(n), t + k * gap, 1.2, vol, sfxOut));
  }

  window.Sound = {
    init,
    setMusic,
    setSfx,
    move,
    capture,
    levelUp: () => melodySfx([72, 76, 79, 84], 0.08, 0.18),
    win: () => melodySfx([60, 64, 67, 72, 76, 79, 84], 0.13, 0.2),
    lose: () => melodySfx([67, 63, 60, 55], 0.25, 0.2)
  };
})();
