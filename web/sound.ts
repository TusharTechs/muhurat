/**
 * A temple bell, synthesised: a few inharmonic partials with long exponential decays. No audio
 * files, nothing fetched.
 */
let ctx: AudioContext | undefined

export function unlockAudio() {
  ctx ??= new AudioContext()
  if (ctx.state === "suspended") void ctx.resume()
}

export function ringBell() {
  if (!ctx) return
  if (ctx.state === "suspended") void ctx.resume()
  const t = ctx.currentTime
  const out = ctx.createGain()
  out.gain.value = 0.22
  out.connect(ctx.destination)
  const partials: [ratio: number, gain: number, decay: number][] = [
    [1, 1, 4.2],
    [2.01, 0.55, 3.1],
    [2.76, 0.42, 2.4],
    [4.07, 0.25, 1.6],
    [5.43, 0.16, 1.1],
  ]
  for (const [ratio, gain, decay] of partials) {
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    osc.type = "sine"
    osc.frequency.value = 523.25 * ratio
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(gain, t + 0.008)
    env.gain.exponentialRampToValueAtTime(0.0001, t + decay)
    osc.connect(env).connect(out)
    osc.start(t)
    osc.stop(t + decay + 0.1)
  }
}

const KEY = "muhurat.sound"
export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === "on"
  } catch {
    return false
  }
}
export function setSoundEnabled(on: boolean) {
  if (on) unlockAudio()
  try {
    localStorage.setItem(KEY, on ? "on" : "off")
  } catch {
    // private mode: the toggle still works for this visit via the audio context
  }
}

// Browsers only start audio after a gesture: unlock on the first tap if the visitor chose sound before.
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", () => soundEnabled() && unlockAudio(), { once: true })
}
