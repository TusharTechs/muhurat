/**
 * End-to-end UI run against the local mock: every screen, including a live bell.
 *
 *   npx tsx scripts/mock/e2e.ts <screenshot dir>
 */
import { type ChildProcess, spawn } from "node:child_process"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { chromium } from "playwright"
import { bankFor } from "../../src/questions"

const out = process.argv[2] ?? "e2e-shots"
mkdirSync(out, { recursive: true })
const BELL_IN = 50
const children: ChildProcess[] = []
const start = (cmd: string, args: string[], env: Record<string, string> = {}) => {
  const child = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" }) // npx is npx.cmd on Windows
  child.stderr?.on("data", (d) => process.env.E2E_DEBUG && process.stderr.write(d))
  children.push(child)
  return child
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const cleanup = () => children.forEach((c) => c.kill())
process.on("exit", cleanup)

rmSync(".env.mock", { force: true })
start("npx", ["tsx", "scripts/mock/server.ts"], { BELL_IN: String(BELL_IN) })
const started = Date.now()
while (!existsSync(".env.mock")) await sleep(250)
start("npx", ["vite", "--mode", "mock", "--port", "5199", "--strictPort"])
await sleep(3500)

const browser = await chromium.launch(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {})
const errors: string[] = []
const shoot = async (name: string, width = 1280) => {
  await page.setViewportSize({ width, height: 900 })
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true })
  console.log(`  shot ${name}`)
}
const page = await browser.newPage()
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.split("\n")[0]}`))
page.on("console", (m) => {
  if (m.type() === "error" && !/ws:\/\/localhost|WebSocket|^Event$|fonts\.g/.test(m.text())) errors.push(`console: ${m.text().slice(0, 200)}`)
})
const go = async (hash: string, wait = 2500) => {
  await page.goto(`http://localhost:5199/${hash}`)
  await page.waitForTimeout(wait)
}

await go("#/")
await shoot("01-home")
await shoot("01-home-mobile", 390)

await page.emulateMedia({ colorScheme: "dark" })
await go("#/")
await shoot("01-home-dark")
await page.emulateMedia({ colorScheme: "light" })

await go("#/exam/mock-soon")
const tryButton = page.getByRole("button", { name: /try to open/i })
if (await tryButton.count()) {
  await tryButton.click()
  await page.waitForTimeout(1500)
}
await shoot("02-exam-sealed")

await go("#/check?exam=mock-soon")
await page.locator("textarea").fill("NEET PAPER LEAKED 100% REAL ₹40,000\nQ1. The powerhouse of the cell is the")
await page.waitForTimeout(500)
await shoot("03-check-before-bell")

const bellAt = started + BELL_IN * 1000
await go("#/exam/mock-soon", 0)
const wait = bellAt - Date.now() + 9000
console.log(`  waiting ${Math.ceil(wait / 1000)} s for the mock bell`)
await page.waitForTimeout(Math.max(0, wait))
await shoot("04-exam-opened")
await shoot("04-exam-opened-mobile", 390)
await page.locator("button.lang").click()
await page.waitForTimeout(800)
await shoot("04b-exam-hindi")
await page.locator("button.lang").click()

await go("#/exam/mock-past", 5000)
await shoot("05-exam-past")
const bellToggle = page.getByLabel(/state at the bell/i)
if (await bellToggle.count()) {
  await bellToggle.check()
  await page.waitForTimeout(2500)
  await shoot("06-exam-past-at-bell")
}

const chem = bankFor("x", "chemistry").questions
await go("#/check?exam=mock-past")
await page.locator("textarea").fill(`LEAKED!!\n1. ${chem[0].text}\n2. ${chem[4].text}\n3. Who won the cricket world cup in the year that`)
await page.getByRole("button", { name: /check/i }).click()
await page.waitForTimeout(4000)
await shoot("07-check-after-bell")

for (const [hash, name] of [["#/run", "08-run"], ["#/proof", "09-proof"]] as const) {
  await go(hash, 3000)
  await shoot(name)
}

console.log(errors.length ? `\n${errors.length} browser error(s):\n${[...new Set(errors)].join("\n")}` : "\nno browser errors")
await browser.close()
cleanup()
process.exit(0)
