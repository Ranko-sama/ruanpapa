// Each collision burst is one instrument. Closely spaced contacts share a beat.
const minimumGap = {
  click: 0.035,
  start: 0.3,
  jump: 0.055,
  land: 0.12,
  hit: 0.043,
  skill: 0.09,
  pop: 0.05,
  ko: 0.13,
  respawn: 0.09,
  event: 0.3,
  win: 0.8,
  lose: 0.8,
  tick: 0.05,
  score: 0.08,
  glass: 0.11,
  emote: 0.18,
};

export function createAudio() {
  let enabled = true;
  let context;
  let master;
  let noiseBuffer;
  const lastPlayed = new Map();

  function unlock() {
    const AudioEngine = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioEngine || !enabled) return;
    try {
      if (!context) {
        context = new AudioEngine({ latencyHint: 'interactive' });
        master = context.createGain();
        master.gain.value = 0.56;
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -11;
        limiter.knee.value = 10;
        limiter.ratio.value = 8;
        limiter.attack.value = 0.004;
        limiter.release.value = 0.1;
        master.connect(limiter);
        limiter.connect(context.destination);

        // A single white-noise sample can feed both the glass tinkle and the mallet.
        noiseBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.35), context.sampleRate);
        const samples = noiseBuffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      }
      if (context.state === 'suspended' || context.state === 'interrupted') {
        return context.resume().catch(() => {});
      }
    } catch {
      // Browsers without audio output can still run the game.
    }
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    if (!master) return;
    const now = context.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(enabled ? 0.56 : 0, now + 0.012);
  }

  function play(name, amount = 1) {
    if (!enabled || context?.state !== 'running' || !Object.hasOwn(minimumGap, name)) return;
    const intensity = Number.isFinite(amount) ? Math.min(1.4, Math.max(0, amount)) : 1;
    const now = context.currentTime;
    if (!intensity || now - (lastPlayed.get(name) ?? -Infinity) < minimumGap[name]) return;
    lastPlayed.set(name, now);
    const start = now + 0.004;

    function envelope(time, duration, level, attack) {
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level * intensity), time + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
      gain.connect(master);
      return gain;
    }

    function tone(from, to, duration, { level = 0.2, delay = 0, type = 'sine' } = {}) {
      const time = start + delay;
      const voice = context.createOscillator();
      const gain = envelope(time, duration, level, Math.min(0.007, duration * 0.12));
      voice.type = type;
      voice.frequency.setValueAtTime(from, time);
      voice.frequency.exponentialRampToValueAtTime(to, time + duration * 0.82);
      voice.connect(gain);
      voice.onended = () => {
        voice.disconnect();
        gain.disconnect();
      };
      voice.start(time);
      voice.stop(time + duration + 0.006);
    }

    function noise(from, to, duration, level, delay = 0, type = 'lowpass') {
      const time = start + delay;
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = envelope(time, duration, level, 0.003);
      source.buffer = noiseBuffer;
      filter.type = type;
      filter.Q.value = 0.75;
      filter.frequency.setValueAtTime(from, time);
      filter.frequency.exponentialRampToValueAtTime(to, time + duration);
      source.connect(filter);
      filter.connect(gain);
      source.onended = () => {
        source.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
      source.start(time);
      source.stop(time + duration + 0.006);
    }

    function notes(frequencies, spacing, length, { delay = 0, level = 0.19, type = 'triangle' } = {}) {
      frequencies.forEach((frequency, index) => {
        tone(frequency, frequency * 0.996, length, { delay: delay + index * spacing, level, type });
      });
    }

    const bend = 0.92 + Math.random() * 0.16;
    switch (name) {
      case 'click':
        tone(760, 620, 0.044, { level: 0.11 });
        tone(420, 500, 0.037, { level: 0.045, type: 'triangle' });
        break;
      case 'tick':
        tone(830, 1030, 0.055, { level: 0.1, type: 'triangle' });
        break;
      case 'start':
        notes([392, 523.25, 659.25, 783.99], 0.064, 0.18);
        tone(196, 98, 0.18, { level: 0.22 });
        break;
      case 'jump':
        tone(190 * bend, 470 * bend, 0.19, { level: 0.25, type: 'triangle' });
        tone(91, 60, 0.09, { level: 0.18 });
        break;
      case 'land':
        tone(145 * bend, 67 * bend, 0.082, { level: 0.26 });
        tone(94 * bend, 163 * bend, 0.14, { level: 0.13, delay: 0.052 });
        break;
      case 'hit':
        tone(215 * bend, 53 * bend, 0.135, { level: 0.46, type: 'triangle' });
        tone(530 * bend, 225, 0.078, { level: 0.14 });
        noise(2400, 470, 0.073, 0.25);
        break;
      case 'skill':
        noise(780, 3200, 0.19, 0.22, 0, 'bandpass');
        tone(105 * bend, 465, 0.19, { level: 0.26, type: 'triangle' });
        tone(330, 72, 0.2, { level: 0.2, delay: 0.105 });
        break;
      case 'pop':
        tone(540 * bend, 188 * bend, 0.088, { level: 0.28 });
        noise(3400, 800, 0.033, 0.11);
        break;
      case 'ko':
        tone(370, 1090, 0.29, { level: 0.25, type: 'triangle' });
        tone(560, 1590, 0.24, { level: 0.08, delay: 0.035 });
        tone(150, 53, 0.2, { level: 0.29 });
        noise(3500, 620, 0.105, 0.24);
        break;
      case 'respawn':
        notes([392, 523.25, 783.99], 0.061, 0.18, { type: 'sine', level: 0.22 });
        tone(100, 200, 0.14, { level: 0.1 });
        break;
      case 'event':
        notes([523.25, 698.46, 523.25, 932.33], 0.09, 0.15);
        noise(1300, 2700, 0.17, 0.08, 0, 'bandpass');
        break;
      case 'win':
        notes([523.25, 659.25, 783.99, 1046.5], 0.12, 0.36, { level: 0.24 });
        notes([130.81, 164.81, 196, 261.63], 0.12, 0.28, { level: 0.19, type: 'sine' });
        tone(783.99, 783.99, 0.49, { level: 0.1, delay: 0.36 });
        break;
      case 'lose':
        notes([392, 349.23, 293.66, 261.63], 0.13, 0.31, { level: 0.18 });
        tone(130.81, 110, 0.43, { level: 0.16, delay: 0.36 });
        break;
      case 'score':
        notes([783.99, 1174.66], 0.06, 0.19, { type: 'sine', level: 0.21 });
        break;
      case 'glass': {
        noise(6700, 1300, 0.22, 0.24, 0, 'highpass');
        const resonances = [1460, 2130, 1700, 2590];
        resonances.forEach((frequency, index) => {
          tone(frequency * bend, frequency * 0.83, 0.135, { level: 0.075, delay: index * 0.027 });
        });
        break;
      }
      case 'emote':
        tone(370, 610, 0.12, { level: 0.19, type: 'triangle' });
        tone(570, 400, 0.17, { level: 0.16, delay: 0.1, type: 'triangle' });
        break;
    }
  }

  return { unlock, play, setEnabled };
}
