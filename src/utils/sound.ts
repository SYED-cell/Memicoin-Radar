let ctx: AudioContext | null = null;

/** Short two-tone chime via Web Audio — no audio assets required. Fails silently if audio is blocked. */
export function playAlertSound(critical = false): void {
  try {
    ctx ??= new AudioContext();
    const now = ctx.currentTime;
    const tones = critical ? [880, 660] : [660, 880];
    tones.forEach((freq, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.08, now + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 0.11);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.12);
    });
  } catch {
    /* audio unavailable */
  }
}
