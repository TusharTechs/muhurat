/**
 * An original soundtrack, synthesised: a tanpura-like drone (Pa, Sa', Sa', Sa plucked in a loop),
 * a soft clock tick under the problem scenes, a stamp thud, chimes, and the temple bell placed
 * exactly where the paper opens. Writes a 44.1 kHz stereo 16-bit WAV.
 */
import { writeFileSync } from "node:fs"

export type Cues = { bell: number[]; chime: number[]; thud: number[]; ticks: [number, number][] }

const RATE = 44100
const SA = 130.81 // C3

export function soundtrack(seconds: number, cues: Cues, path: string) {
  const n = Math.ceil(seconds * RATE)
  const L = new Float32Array(n)
  const R = new Float32Array(n)
  const add = (i: number, l: number, r = l) => {
    if (i >= 0 && i < n) {
      L[i] += l
      R[i] += r
    }
  }

  // Tanpura: each pluck is a rich harmonic tone with a slow decay and a little shimmer.
  const pluck = (at: number, freq: number, gain: number, pan: number) => {
    const start = Math.floor(at * RATE)
    const len = Math.floor(3.4 * RATE)
    for (let k = 0; k < len; k++) {
      const t = k / RATE
      let v = 0
      for (let h = 1; h <= 9; h++) {
        const shimmer = 1 + 0.35 * Math.sin(2 * Math.PI * (0.6 + h * 0.13) * t)
        v += (Math.sin(2 * Math.PI * freq * h * t * (1 + h * 0.0004)) * shimmer) / (h ** 1.15)
      }
      const env = Math.min(1, t / 0.015) * Math.exp(-t / 1.25)
      const s = v * env * gain
      add(start + k, s * (1 - pan), s * (1 + pan))
    }
  }
  const pattern: [number, number][] = [
    [SA * 1.5, -0.3],
    [SA * 2, 0.2],
    [SA * 2, 0.25],
    [SA, -0.1],
  ]
  for (let t = 0, i = 0; t < seconds - 1; t += 0.95, i++) {
    const [f, pan] = pattern[i % 4]
    const fadeIn = Math.min(1, t / 6)
    const fadeOut = Math.min(1, (seconds - t) / 6)
    pluck(t, f, 0.018 * fadeIn * fadeOut, pan)
  }

  // A low drone underneath.
  for (let k = 0; k < n; k++) {
    const t = k / RATE
    const env = Math.min(1, t / 4) * Math.min(1, (seconds - t) / 4)
    const v = (Math.sin(2 * Math.PI * (SA / 2) * t) * 0.5 + Math.sin(2 * Math.PI * (SA * 0.75) * t) * 0.25) * 0.05 * env
    add(k, v, v)
  }

  // Clock ticks: a short filtered click every second inside each tick range.
  for (const [from, to] of cues.ticks) {
    for (let t = from + 0.5; t < to; t += 1) {
      const start = Math.floor(t * RATE)
      for (let k = 0; k < 900; k++) {
        const v = Math.sin(2 * Math.PI * 2200 * (k / RATE)) * Math.exp(-k / 120) * 0.08
        add(start + k, v * 0.9, v)
      }
    }
  }

  // Stamp thud: a low sine drop with a burst of noise.
  for (const at of cues.thud) {
    const start = Math.floor(at * RATE)
    let seed = 7
    for (let k = 0; k < RATE * 0.6; k++) {
      const t = k / RATE
      seed = (seed * 16807) % 2147483647
      const noise = (seed / 2147483647) * 2 - 1
      const v = (Math.sin(2 * Math.PI * (70 - 30 * t) * t) * 0.6 + noise * 0.25 * Math.exp(-t / 0.03)) * Math.exp(-t / 0.18) * 0.55
      add(start + k, v, v)
    }
  }

  // Temple bell and chimes: inharmonic partials with long decays.
  const bell = (at: number, base: number, gain: number, decay: number) => {
    const start = Math.floor(at * RATE)
    const partials: [number, number, number][] = [
      [1, 1, 1],
      [2.01, 0.55, 0.75],
      [2.76, 0.42, 0.6],
      [4.07, 0.25, 0.42],
      [5.43, 0.16, 0.3],
      [0.5, 0.3, 1.2],
    ]
    const len = Math.floor(decay * 1.3 * RATE)
    for (let k = 0; k < len; k++) {
      const t = k / RATE
      let v = 0
      for (const [ratio, g, d] of partials) v += Math.sin(2 * Math.PI * base * ratio * t) * g * Math.exp(-t / (decay * d))
      const s = v * Math.min(1, t / 0.004) * gain
      add(start + k, s * 0.95, s)
    }
  }
  for (const at of cues.bell) bell(at, 523.25, 0.2, 2.6)
  for (const at of cues.chime) bell(at, 1046.5, 0.07, 1.1)

  // Normalise to -1 dBFS and write the WAV.
  let peak = 0
  for (let k = 0; k < n; k++) peak = Math.max(peak, Math.abs(L[k]), Math.abs(R[k]))
  const scale = peak > 0 ? 0.89 / peak : 1
  const data = Buffer.alloc(n * 4)
  for (let k = 0; k < n; k++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[k] * scale)) * 32767), k * 4)
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[k] * scale)) * 32767), k * 4 + 2)
  }
  const header = Buffer.alloc(44)
  header.write("RIFF", 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write("WAVEfmt ", 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(2, 22)
  header.writeUInt32LE(RATE, 24)
  header.writeUInt32LE(RATE * 4, 28)
  header.writeUInt16LE(4, 32)
  header.writeUInt16LE(16, 34)
  header.write("data", 36)
  header.writeUInt32LE(data.length, 40)
  writeFileSync(path, Buffer.concat([header, data]))
}
