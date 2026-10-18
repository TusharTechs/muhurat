/**
 * Makes the demo video: the film (rendered frame by frame), the real app driven through a live bell
 * (captured with Chromium's screencast, captions and cursor overlaid in the page), an original
 * synthesised soundtrack, stitched into one 1080p MP4 under three minutes.
 *
 *   npm run video                    # app scenes against the local mock (no network needed)
 *   npm run video -- --live          # app scenes against Arkiv Tiramisu + drand quicknet
 *                                    #   first: npm run schedule -- --in 4 --leak, then npm run centres
 *   options: --repo github.com/you/muhurat  --board 0x…  --exam <id>  --out muhurat-demo.mp4
 */
import { type ChildProcess, execFileSync, spawn } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import ffmpegStatic from "ffmpeg-static"
import { type Page, chromium } from "playwright"
import { privateKeyToAccount } from "viem/accounts"
import { type Cues, soundtrack } from "./soundtrack"

const argv = process.argv.slice(2)
const flag = (name: string) => argv.includes(`--${name}`)
const opt = (name: string) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const LIVE = flag("live")
const REPO = opt("repo") ?? process.env.REPO ?? "github.com/your-name/muhurat"
const OUT = resolve(opt("out") ?? "muhurat-demo.mp4")
const FPS = 30
const BEFORE_BELL = 34 // the tour starts this many seconds before the bell
const TOUR = 64 // seconds of app footage
const FFMPEG = ffmpegStatic && existsSync(ffmpegStatic) ? ffmpegStatic : "ffmpeg"
const WORK = resolve("video-build")
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const children: ChildProcess[] = []
const run = (cmd: string, args: string[], env: Record<string, string> = {}) => {
  const child = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] })
  child.stderr?.on("data", (d) => process.env.VIDEO_DEBUG && process.stderr.write(d))
  children.push(child)
  return child
}
const cleanup = () => children.forEach((c) => c.kill())
process.on("exit", cleanup)
process.on("SIGINT", () => process.exit(1))
const ffmpeg = (args: string[]) => execFileSync(FFMPEG, ["-y", "-hide_banner", "-loglevel", "error", ...args], { stdio: "inherit" })
const log = (s: string) => console.log(`video  ${s}`)

rmSync(WORK, { recursive: true, force: true })
for (const d of ["intro", "outro", "app"]) mkdirSync(`${WORK}/${d}`, { recursive: true })

const browser = await chromium.launch(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {})

// ---------------------------------------------------------------- 1. the film

run("npx", ["vite", "--port", "5301", "--strictPort"])
await sleep(4000)

async function renderFilm(part: "intro" | "outro") {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  await page.goto(`http://localhost:5301/film.html?part=${part}&repo=${encodeURIComponent(REPO)}`)
  await page.waitForFunction(() => window.FILM !== undefined)
  await page.evaluate(() => window.FILM.ready)
  const { duration, cues } = await page.evaluate(() => ({ duration: window.FILM.duration, cues: window.FILM.cues }))
  const frames = Math.round(duration * FPS)
  for (let i = 0; i < frames; i++) {
    await page.evaluate((t) => window.FILM.renderAt(t), i / FPS)
    await page.screenshot({ path: `${WORK}/${part}/${String(i).padStart(5, "0")}.jpg`, type: "jpeg", quality: 92 })
    if (i % (FPS * 10) === 0) log(`${part} ${Math.round((i / frames) * 100)}%`)
  }
  await page.close()
  ffmpeg(["-framerate", String(FPS), "-i", `${WORK}/${part}/%05d.jpg`, "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", "-r", String(FPS), `${WORK}/${part}.mp4`])
  return { duration, cues }
}

const intro = await renderFilm("intro")
const outro = await renderFilm("outro")
log(`film rendered: intro ${intro.duration}s, outro ${outro.duration}s`)

// ---------------------------------------------------------------- 2. the app, live

let appUrl = "http://localhost:5301"
if (!LIVE) {
  rmSync(".env.mock", { force: true })
  run("npx", ["tsx", "scripts/mock/server.ts"], { BELL_IN: String(BEFORE_BELL + 26) })
  while (!existsSync(".env.mock")) await sleep(250)
  for (const line of readFileSync(".env.mock", "utf8").split("\n")) {
    const m = /^(\w+)=(.*)$/.exec(line)
    if (m) process.env[m[1]] = m[2].replace(/^'(.*)'$/, "$1")
  }
  process.env.ARKIV_RPC_URL = process.env.VITE_RPC_URL
  run("npx", ["vite", "--mode", "mock", "--port", "5302", "--strictPort"])
  appUrl = "http://localhost:5302"
  await sleep(4000)
}

// Imported only now: in mock mode they must see the mock's RPC and drand settings.
const { listExams, loadExam } = await import("../../src/arkiv")
const { dateForRound } = await import("../../src/drand")
const { publicClient } = await import("../lib")

const board = (opt("board") ?? process.env.VITE_BOARD ?? (process.env.PRIVATE_KEY ? privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`).address : undefined)) as `0x${string}`
if (!board) throw new Error("no board: pass --board 0x… or set PRIVATE_KEY in .env")
const exams = (await listExams(publicClient, board, new Date())).map((e) => ({ id: String(e.attributes?.exam?.value), opensAt: dateForRound(Number(e.attributes?.round?.value)) }))
const target = opt("exam") ? exams.find((e) => e.id === opt("exam")) : exams.filter((e) => e.opensAt.getTime() - Date.now() > (BEFORE_BELL + 6) * 1000).sort((a, b) => a.opensAt.getTime() - b.opensAt.getTime())[0]
if (!target) throw new Error(`no exam by ${board} rings more than ${BEFORE_BELL + 6}s from now. Run: npm run schedule -- --in 4 --leak`)
const bundle = await loadExam(publicClient, board, target.id)
log(`exam ${target.id}, bell ${target.opensAt.toISOString()}, ${bundle.banks.length} banks, ${bundle.claims.length} claims, ${bundle.leases.length} leases`)

const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 })
const page = await context.newPage()
const qs = `?board=${board}`
await page.goto(`${appUrl}/${"#/" + qs}`)
await page.waitForTimeout(2500)

// Captions, a visible cursor and an honest source badge, drawn inside the page so the screencast keeps them.
await page.addStyleTag({
  content: `#mh-cap{position:fixed;left:24px;bottom:22px;z-index:99999;max-width:700px;background:rgba(14,12,29,.9);color:#f4efe4;border-left:4px solid #f7b32b;border-radius:12px;padding:13px 18px;font:500 18px/1.42 "Inter Variable",system-ui;box-shadow:0 18px 40px rgba(0,0,0,.35);transition:opacity .35s,transform .35s}
#mh-cap b{display:block;font:600 11.5px/1 "JetBrains Mono Variable",monospace;letter-spacing:.14em;color:#f7b32b;margin-bottom:7px;text-transform:uppercase}
#mh-cur{position:fixed;z-index:100000;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:99px;border:3px solid #f7b32b;background:rgba(247,179,43,.25);transition:left .7s cubic-bezier(.2,.7,.2,1),top .7s cubic-bezier(.2,.7,.2,1);pointer-events:none;left:900px;top:420px}
#mh-cur.click{animation:mhclick .55s}
@keyframes mhclick{0%{box-shadow:0 0 0 0 rgba(247,179,43,.75)}100%{box-shadow:0 0 0 24px rgba(247,179,43,0)}}
#mh-src{position:fixed;right:18px;bottom:18px;z-index:99999;font:600 11px "JetBrains Mono Variable",monospace;letter-spacing:.12em;color:#0e0c1d;background:#f7b32b;padding:6px 10px;border-radius:99px}`,
})
await page.evaluate((live) => {
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div id="mh-cap" style="opacity:0"></div><div id="mh-cur"></div><div id="mh-src">${live ? "LIVE · ARKIV TIRAMISU + DRAND QUICKNET" : "APP · LOCAL ARKIV/DRAND REPLAY"}</div>`,
  )
}, LIVE)

const caption = (label: string, text: string) =>
  page.evaluate(
    ([l, t]) => {
      const cap = document.getElementById("mh-cap")!
      cap.innerHTML = `<b>${l}</b>${t}`
      cap.style.opacity = "1"
    },
    [label, text],
  )
const pointAt = async (selector: string) => {
  const loc = page.locator(selector).first()
  await loc.scrollIntoViewIfNeeded().catch(() => {})
  const box = await loc.boundingBox()
  if (!box) return loc
  await page.evaluate(([x, y]) => {
    const c = document.getElementById("mh-cur")!
    c.style.left = `${x}px`
    c.style.top = `${y}px`
  }, [box.x + box.width / 2, box.y + box.height / 2])
  await page.waitForTimeout(800)
  return loc
}
const clickAt = async (selector: string) => {
  const loc = await pointAt(selector)
  await page.evaluate(() => {
    const c = document.getElementById("mh-cur")!
    c.classList.remove("click")
    void c.offsetWidth
    c.classList.add("click")
  })
  await loc.click().catch(() => {})
}
const scrollToSel = (selector: string, offset = 80) =>
  page.evaluate(
    ([s, o]) => {
      const node = document.querySelector(s as string)
      if (node) window.scrollTo({ top: node.getBoundingClientRect().top + window.scrollY - (o as number), behavior: "smooth" })
    },
    [selector, offset],
  )
const go = (hash: string) => page.evaluate((h) => (location.hash = h), hash)

// Start capturing exactly BEFORE_BELL seconds before the bell.
const T0 = target.opensAt.getTime() - BEFORE_BELL * 1000
if (T0 - Date.now() > 0) log(`waiting ${Math.round((T0 - Date.now()) / 1000)}s to start the tour ${BEFORE_BELL}s before the bell`)
while (Date.now() < T0) await sleep(100)
const at = async (s: number) => {
  const wait = T0 + s * 1000 - Date.now()
  if (wait > 0) await sleep(wait)
}

const cdp = await context.newCDPSession(page)
const frames: { ts: number; file: string }[] = []
cdp.on("Page.screencastFrame", (f) => {
  const file = `${WORK}/app/${String(frames.length).padStart(5, "0")}.jpg`
  writeFileSync(file, Buffer.from(f.data, "base64"))
  frames.push({ ts: f.metadata.timestamp ?? Date.now() / 1000, file })
  cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
})
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 })
const tourStart = Date.now() / 1000

await caption("The app · Home", "The next paper is sealed on Arkiv. A countdown to a key that does not exist yet.")
await at(4.5)
await go(`#/exam/${target.id}${qs}`)
await at(6)
await caption("Sealed banks", "Three appointed setters. Each bank is readonly and owned by 0x…dEaD. A forged bank from an unappointed wallet is ignored.")
await scrollToSel("section h3")
await at(11.5)
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }))
await at(12.5)
await caption("Try to open it", "Your own browser asks drand for the round key. It is refused: too early.")
await clickAt(".bell button")
await at(17.5)
await go(`#/check?exam=${target.id}&board=${board}`)
await at(18.5)
await caption("Leak checker", "A “leaked paper” for sale? Before the bell it cannot exist, so the verdict is instant: fake.")
await clickAt("textarea")
await page.locator("textarea").pressSequentially("NEET PAPER LEAKED 100% REAL ₹40,000\nQ1. The powerhouse of the cell is the", { delay: 14 }).catch(() => {})
await scrollToSel(".verdict", 120)
await at(24.5)
await go(`#/exam/${target.id}${qs}`)
await at(25.5)
await caption("Control room", "Centres hold 10-minute leases, renewed with extendEntity. Silence lets a lease lapse on its own.")
await scrollToSel(".tiles", 160)
await at(29.5)
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }))
await caption("The bell", "drand publishes the round key to the whole world at once. Every centre opens at the same second.")
await at(BEFORE_BELL + 4)
await caption("Opened", "15 questions drawn from 45 by the round's randomness. Nobody chose this paper. Not even the setters.")
await at(BEFORE_BELL + 7.5)
await scrollToSel(".booklet-wrap", 70)
await at(BEFORE_BELL + 10)
await caption("Each centre prints its own order", "Same questions, different order per centre, plus a QR to verify the copy. A leaked photo names its centre.")
const select = ".seg-select select"
await pointAt(select)
await page.locator(select).selectOption({ index: 2 }).catch(() => {})
await at(BEFORE_BELL + 15.5)
await scrollToSel(".claims", 260)
await caption("Leak court", "Claims filed on Arkiv before the bell are tested now. A proven leak names the setter's bank. A fake is a fake.")
await at(BEFORE_BELL + 21.5)
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }))
const toggle = page.locator(".switch input")
if (await toggle.count()) {
  await caption("State at the bell", "atBlock reads the database exactly as it was at the bell block.")
  await clickAt(".switch input")
}
await at(BEFORE_BELL + 25)
await go(`#/proof?exam=${target.id}&board=${board}`)
await at(BEFORE_BELL + 26)
await caption("For judges", "Every Arkiv feature, with evidence computed live from the RPC and a link to the code.")
await page.evaluate(() => window.scrollTo({ top: 520, behavior: "smooth" }))
await at(BEFORE_BELL + 29)
await page.evaluate(() => window.scrollTo({ top: 1150, behavior: "smooth" }))
await at(TOUR)
await cdp.send("Page.stopScreencast")
const tourEnd = Date.now() / 1000
await browser.close()
cleanup()

// Frames arrive on change; hold each until the next to rebuild real time, then resample to 30 fps.
const list: string[] = []
frames.forEach((f, i) => {
  const next = frames[i + 1]?.ts ?? tourEnd
  list.push(`file '${f.file}'`, `duration ${Math.max(0.001, next - f.ts).toFixed(4)}`)
})
list.push(`file '${frames[frames.length - 1].file}'`)
writeFileSync(`${WORK}/app.txt`, list.join("\n"))
const firstTs = frames[0]?.ts ?? tourStart
ffmpeg([
  "-f", "concat", "-safe", "0", "-i", `${WORK}/app.txt`,
  "-vf", `fps=${FPS},scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x0e0c1d`,
  "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-t", String(tourEnd - firstTs), `${WORK}/app.mp4`,
])
const appDuration = tourEnd - firstTs
const bellInApp = target.opensAt.getTime() / 1000 - firstTs
log(`app footage ${appDuration.toFixed(1)}s from ${frames.length} frames; bell at ${bellInApp.toFixed(1)}s`)

// ---------------------------------------------------------------- 3. sound + stitch

const total = intro.duration + appDuration + outro.duration
const offsetOutro = intro.duration + appDuration
const cues: Cues = {
  bell: [...intro.cues.bell, intro.duration + bellInApp, ...outro.cues.bell.map((t) => offsetOutro + t)],
  chime: intro.cues.chime,
  thud: intro.cues.thud,
  ticks: [intro.cues.ticks as [number, number], [intro.duration + bellInApp - 8, intro.duration + bellInApp]],
}
soundtrack(total, cues, `${WORK}/sound.wav`)
writeFileSync(`${WORK}/parts.txt`, ["intro", "app", "outro"].map((p) => `file '${WORK}/${p}.mp4'`).join("\n"))
ffmpeg(["-f", "concat", "-safe", "0", "-i", `${WORK}/parts.txt`, "-c", "copy", `${WORK}/video.mp4`])
ffmpeg(["-i", `${WORK}/video.mp4`, "-i", `${WORK}/sound.wav`, "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", OUT])
log(`done: ${OUT} (${total.toFixed(1)}s)`)
process.exit(0)
