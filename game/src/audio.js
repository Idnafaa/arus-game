// Sound only: every effect is synthesised with WebAudio, so the game ships no
// audio files. The context is created on the first user gesture, because a
// browser will not play sound before one.

export function createAudio() {
  let context = null;

  function ensure() {
    if (context !== null) return context;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      context = new AudioContext();
    } catch {
      context = null;
    }
    return context;
  }

  function tone(startFreq, endFreq, seconds, kind, volume, when = 0) {
    const audio = ensure();
    if (audio === null) return;
    try {
      const at = audio.currentTime + when;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = kind;
      oscillator.frequency.setValueAtTime(startFreq, at);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), at + seconds);
      gain.gain.setValueAtTime(volume, at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + seconds);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(at);
      oscillator.stop(at + seconds + 0.02);
      if (audio.state === 'suspended') void audio.resume();
    } catch {
      // Sound is garnish: a failure here must never stop the game.
    }
  }

  return {
    /** Call from a user gesture so the browser allows sound from then on. */
    unlock() {
      ensure();
    },
    pickup(combo = 1) {
      // The pitch climbs with the combo, so a hot streak sounds like one.
      const base = 660 * (1 + (combo - 1) * 0.07);
      tone(base, base * 1.5, 0.12, 'sine', 0.12);
    },
    gold() {
      tone(880, 880, 0.1, 'triangle', 0.14);
      tone(1320, 1320, 0.16, 'triangle', 0.12, 0.09);
    },
    heart() {
      tone(520, 780, 0.18, 'sine', 0.12);
    },
    shield() {
      tone(740, 740, 0.1, 'sine', 0.12);
      tone(1108, 1108, 0.18, 'sine', 0.1, 0.08);
    },
    shieldBreak() {
      tone(300, 90, 0.2, 'sawtooth', 0.12);
      tone(990, 990, 0.12, 'sine', 0.1, 0.05);
    },
    near() {
      tone(980, 320, 0.09, 'sine', 0.07);
    },
    levelup() {
      tone(523, 523, 0.1, 'triangle', 0.12);
      tone(659, 659, 0.1, 'triangle', 0.12, 0.09);
      tone(784, 784, 0.16, 'triangle', 0.12, 0.18);
    },
    hit() {
      tone(180, 60, 0.25, 'sawtooth', 0.16);
    },
    win() {
      tone(523, 523, 0.14, 'triangle', 0.14);
      tone(659, 659, 0.14, 'triangle', 0.14, 0.13);
      tone(784, 784, 0.22, 'triangle', 0.14, 0.26);
    },
    lose() {
      tone(392, 392, 0.2, 'triangle', 0.12);
      tone(311, 311, 0.2, 'triangle', 0.12, 0.18);
      tone(233, 220, 0.34, 'triangle', 0.12, 0.36);
    },
  };
}
