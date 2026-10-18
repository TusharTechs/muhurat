/**
 * Adds the narration to the demo video: each line from VIDEO.md is spoken by macOS `say` into its own
 * window, the soundtrack ducks under the voice, and the mix is mastered to -14 LUFS for YouTube.
 * macOS only (it needs `say`). The published video used the neural "Aman" (en_IN) voice.
 *
 *   node scripts/video/voiceover.mjs muhurat-demo.mp4 muhurat-demo-voice.mp4 Aman 101.5 64 34
 *
 * The last three numbers are printed by `npm run video`: intro length, app footage length, and the
 * bell's offset inside the app footage.
 */
import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import ffmpegStatic from "ffmpeg-static"

const [IN, OUT, VOICE = "Rishi", introS, appS, bellS] = process.argv.slice(2)
const INTRO = Number(introS), APP = Number(appS), BELL = Number(bellS)
const FF = ffmpegStatic
const WORK = resolve("video-build", `voice-${VOICE}`)
mkdirSync(WORK, { recursive: true })
const RATE = 172 // words per minute: unhurried

// Spellings tuned for TTS: "drand" -> "dee-rand", Arkiv sounds like "archive".
const A = INTRO // tour start in the final video
const O = INTRO + APP // outro start
const lines = [
  // [start, end, text]  (end = the latest the line may finish)
  [0.4, 6.8, "On the third of May, twenty-two lakh students sat NEET."],
  [7.2, 14.8, "Nine days later, it was cancelled. The paper had leaked on Telegram."],
  [15.2, 22.6, "Every one of them sat it again."],
  [23.0, 32.6, "Then India switched off Telegram, for the whole country. And the exam agency said edited messages were used to fake leak evidence."],
  [33.0, 40.6, "It keeps happening. Forty-one leaks. Fifteen states. One point four crore applicants."],
  [41.0, 52.6, "Every leak needs one thing: a paper that exists before the exam. In a press. In a trunk. In a strong room."],
  [53.0, 59.6, "Even an encrypted paper needs someone holding the key."],
  [60.2, 67.6, "So what if the paper did not exist, until the bell? This is Muhurat."],
  [68.2, 87.6, "Setters seal their questions in the browser, with dee-rand timelock encryption. The sealed bank goes on Archive: read-only, and owned by nobody. Its key does not exist yet. Not with the board. Not with us. At the bell, dee-rand publishes it to the whole world at once, and every centre opens the same paper, at the same second."],
  [88.2, A - 0.4, "It only works on Archive. Creator checks. Frozen payloads, owned by nobody. And block order, that turns a leak claim into evidence."],
  [A + 0.4, A + 5.8, "Here it is, live. The next paper is already sealed."],
  [A + 6.2, A + 12.2, "Three appointed setters. Each bank is read-only, owned by nobody."],
  [A + 12.7, A + 18.2, "Try to open it now. Refused. The key does not exist yet."],
  [A + 18.7, A + 25.2, "A leaked paper, for sale? Before the bell, it is fake. It cannot exist."],
  [A + 25.7, A + BELL - 4.5, "Centres hold leases that lapse, if they go silent."],
  // the bell rings alone
  [A + BELL + 3.2, A + BELL + 9.8, "Opened, in the browser. Drawn by dee-rand's randomness. Nobody chose this paper."],
  [A + BELL + 10.2, A + BELL + 15.4, "Each centre prints its own order. A leaked photo names its centre."],
  [A + BELL + 15.8, A + BELL + 21.4, "The leak court tests every claim filed before the bell."],
  [A + BELL + 21.8, A + BELL + 25.6, "At block shows the database as it was at the bell."],
  [A + BELL + 26.2, O - 0.3, "And for judges: every Archive feature, with live evidence."],
  [O + 0.5, O + 99, "Censorship resistant. Open source. Private. Secure. Archive knows when data should die. Muhurat teaches it when data should be born."],
]

const seconds = (file) => Number(/estimated duration: ([\d.]+)/.exec(execFileSync("afinfo", [file]).toString())[1])
const inputs = []
const delays = []
lines.forEach(([start, end, text], i) => {
  const window = end - start
  const file = join(WORK, `l${i}.aiff`)
  let rate = RATE
  execFileSync("say", ["-v", VOICE, "-r", String(rate), "-o", file, text])
  let dur = seconds(file)
  if (dur > window) {
    rate = Math.min(205, Math.ceil(rate * (dur / window) * 1.03))
    execFileSync("say", ["-v", VOICE, "-r", String(rate), "-o", file, text])
    dur = seconds(file)
  }
  let tempo = 1
  if (dur > window) tempo = Math.min(1.12, dur / window)
  const fit = tempo > 1 ? dur / tempo : dur
  console.log(`${String(i).padStart(2)} @${start.toFixed(1)}s  ${fit.toFixed(1)}/${window.toFixed(1)}s  rate ${rate}${tempo > 1 ? ` tempo ${tempo.toFixed(2)}` : ""}${fit > window + 0.05 ? "  OVERRUN" : ""}`)
  inputs.push("-i", file)
  delays.push({ i, start, tempo })
})

// Voice: each line delayed into place, then cleaned up (rumble cut, gentle compression, a little room).
const n = delays.length
const parts = delays.map(({ i, start, tempo }) => `[${i + 1}:a]aresample=48000,aformat=channel_layouts=mono${tempo > 1 ? `,atempo=${tempo.toFixed(3)}` : ""},adelay=${Math.round(start * 1000)}[v${i}]`)
const filter = [
  ...parts,
  `${delays.map(({ i }) => `[v${i}]`).join("")}amix=inputs=${n}:normalize=0,highpass=f=90,lowpass=f=11000,acompressor=threshold=-20dB:ratio=3:attack=5:release=120:makeup=2,aecho=0.85:0.6:28|47:0.12|0.07,pan=stereo|c0=c0|c1=c0,asplit=2[voice][key]`,
  // Music ducks under the voice and comes back up between lines (and for the bell).
  `[0:a]aresample=48000,volume=0.9[music]`,
  `[music][key]sidechaincompress=threshold=0.02:ratio=6:attack=15:release=450:makeup=1[ducked]`,
  `[ducked][voice]amix=inputs=2:normalize=0:weights=1 1.35,loudnorm=I=-14:TP=-1.5:LRA=11[out]`,
].join(";")
writeFileSync(join(WORK, "filter.txt"), filter)
execFileSync(FF, ["-y", "-hide_banner", "-loglevel", "error", "-i", IN, ...inputs, "-filter_complex_script", join(WORK, "filter.txt"), "-map", "0:v", "-map", "[out]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", OUT], { stdio: "inherit" })
console.log(`done: ${OUT}`)
