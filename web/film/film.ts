/**
 * The Muhurat film: every frame is a pure function of time, so it renders frame-perfect at any
 * speed. `?part=intro` (problem → insight → solution → how → why) or `?part=outro`.
 * window.FILM = { duration, renderAt(t), cues } is driven by scripts/video/make.ts.
 */
import "../fonts"
import "./film.css"

const params = new URLSearchParams(location.search)
const part = params.get("part") ?? "intro"
const repo = (params.get("repo") ?? "github.com/your-name/muhurat").replace(/[<>&"]/g, "")

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const prog = (t: number, a: number, b: number) => clamp((t - a) / (b - a))
const out3 = (x: number) => 1 - (1 - x) ** 3
const inOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)
const rand = (i: number) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}
/** Fade + rise in at `a`, over `d` seconds. */
const enter = (el: HTMLElement | SVGElement, t: number, a: number, d = 0.7, dy = 30) => {
  const k = out3(prog(t, a, a + d))
  el.style.opacity = String(k)
  el.style.transform = `translateY(${(1 - k) * dy}px)`
}
const stage = document.getElementById("stage")!
const el = <T extends HTMLElement = HTMLElement>(root: HTMLElement, sel: string) => root.querySelector(sel) as T
const els = (root: HTMLElement, sel: string) => [...root.querySelectorAll<HTMLElement>(sel)]

type Scene = { from: number; to: number; chapter: string; source?: string; root: HTMLElement; update: (t: number) => void }
const scenes: Scene[] = []
function scene(from: number, to: number, chapter: string, source: string | undefined, html: string, update: (t: number, root: HTMLElement) => void) {
  const root = document.createElement("div")
  root.className = "scene"
  root.innerHTML = html
  stage.appendChild(root)
  scenes.push({ from, to, chapter, source, root, update: (t) => update(t, root) })
}

function sealSvg(id: string, size: number) {
  const pts: string[] = []
  for (let i = 0; i <= 72; i++) {
    const a = (i / 72) * Math.PI * 2
    const r = 46 + (i % 2 ? 2.6 : -0.6) + Math.sin(i * 1.7) * 0.9
    pts.push(`${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`)
  }
  return `<svg id="${id}" viewBox="0 0 100 100" width="${size}" height="${size}" style="position:absolute;filter:drop-shadow(0 30px 40px rgba(126,26,14,.55))">
    <defs><radialGradient id="${id}-g" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#ef6a4c"/><stop offset=".55" stop-color="#c8321e"/><stop offset="1" stop-color="#7e1a0e"/></radialGradient></defs>
    <path d="M${pts.join("L")}Z" fill="url(#${id}-g)"/>
    <circle cx="50" cy="50" r="33" fill="none" stroke="#7e1a0e" stroke-width="1.6" opacity=".7"/>
    <circle cx="50" cy="50" r="29" fill="none" stroke="#ef6a4c" stroke-width=".8" opacity=".6"/>
    <text x="50" y="62" text-anchor="middle" font-size="34" font-family="'Tiro Devanagari Hindi', serif" fill="#7e1a0e" opacity=".9">मु</text></svg>`
}

const icon = (path: string) => `<svg viewBox="0 0 24 24" width="76" height="76" fill="none" stroke="#f4efe4" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`
const ICONS = {
  setter: icon('<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>'),
  press: icon('<rect x="4" y="9" width="16" height="8" rx="1.5"/><path d="M7 9V4h10v5M7 17v3h10v-3"/>'),
  truck: icon('<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.6"/><circle cx="17" cy="17.5" r="1.6"/>'),
  vault: icon('<rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="12" cy="12" r="3.5"/><path d="M12 8.5v-1M15.5 12h1"/>'),
  school: icon('<path d="M3 10l9-5 9 5-9 5z"/><path d="M7 12v5c3 2 7 2 10 0v-5"/>'),
}

// ---------------------------------------------------------------- intro

if (part === "intro") {
  scene(0, 7.5, "01 · The problem", "Business Today, 15 May 2026", `
    <div class="col" style="left:150px;top:250px">
      <div class="eyebrow e1">3 May 2026</div>
      <div class="huge"><span class="n">0.0</span><small>lakh</small></div>
      <div class="body e2" style="max-width:1300px">students sat <b>NEET-UG</b>, India's entrance exam for medicine.</div>
    </div>`, (t, r) => {
    enter(el(r, ".e1"), t, 0.2)
    el(r, ".n").textContent = (22.7 * out3(prog(t, 0.6, 3.6))).toFixed(1)
    enter(el(r, ".huge"), t, 0.5, 0.6, 40)
    enter(el(r, ".e2"), t, 2.6)
  })

  scene(7.5, 15.5, "01 · The problem", "Scroll, 12 May 2026", `
    <div class="col" style="left:150px;top:300px;width:820px">
      <div class="eyebrow e1">12 May 2026</div>
      <div class="h1 e2">Cancelled.</div>
      <div class="body e3">The paper had leaked on Telegram. The CBI took over the case.</div>
    </div>
    <div class="sheet" style="left:1130px;top:140px">
      <div class="t">NEET-UG 2026</div><div class="s">QUESTION PAPER · SET A</div>
      ${Array.from({ length: 14 }, (_, i) => `<div class="bar" style="width:${60 + rand(i) * 40}%"></div>`).join("")}
      <div class="stamp" style="left:70px;top:330px">CANCELLED</div>
    </div>`, (t, r) => {
    enter(el(r, ".e1"), t, 0.1)
    enter(el(r, ".e2"), t, 0.3)
    enter(el(r, ".e3"), t, 1.6)
    const sheet = el(r, ".sheet")
    const k = out3(prog(t, 0, 0.8))
    sheet.style.transform = `translateX(${(1 - k) * 200}px) rotate(${3 - 3 * k}deg)`
    sheet.style.opacity = String(k)
    const stamp = el(r, ".stamp")
    const s = prog(t, 0.9, 1.15)
    stamp.style.opacity = String(s)
    stamp.style.transform = `rotate(-14deg) scale(${2.6 - 1.6 * out3(s)})`
  })

  scene(15.5, 23.5, "01 · The problem", "Business Today; Aakash, June 2026", `
    <div class="col" style="left:150px;top:300px;width:760px">
      <div class="eyebrow e1">21 June 2026</div>
      <div class="h2 e2">All of them sat it <em>again.</em></div>
      <div class="body e3">One dot is 1,000 students. Every one of them, twice.</div>
    </div>
    <canvas width="860" height="760" style="position:absolute;left:960px;top:170px"></canvas>`, (t, r) => {
    enter(el(r, ".e1"), t, 0.1)
    enter(el(r, ".e2"), t, 0.3)
    enter(el(r, ".e3"), t, 3)
    const c = el<HTMLCanvasElement>(r, "canvas").getContext("2d")!
    c.clearRect(0, 0, 860, 760)
    const cols = 55
    const total = 2270
    const first = Math.floor(total * out3(prog(t, 0.3, 2.6)))
    const second = Math.floor(total * inOut(prog(t, 3.2, 6.2)))
    for (let i = 0; i < total; i++) {
      const x = (i % cols) * 15.5 + 6
      const y = Math.floor(i / cols) * 17.5 + 6
      c.fillStyle = i < second ? "#f7b32b" : i < first ? "#6d678f" : "#221e3d"
      c.beginPath()
      c.arc(x, y, 5, 0, Math.PI * 2)
      c.fill()
    }
  })

  scene(23.5, 33.5, "01 · The problem", "Scroll; DD News; Delhi High Court, June 2026", `
    <div class="phone" style="left:170px;top:130px">
      <div class="bubble">PAPER LEAKED 100% REAL</div>
      <div class="bubble">NEET chemistry ₹40,000 only</div>
      <div class="bubble me">real?? send sample</div>
      <div class="bubble">pay first. limited seats</div>
      <div class="blocked">BLOCKED IN INDIA<br/>UNTIL 22 JUNE</div>
    </div>
    <div class="col" style="left:760px;top:220px;width:1000px">
      <div class="h2 e1">Then India switched off <em>Telegram.</em></div>
      <div class="bullet e2">Restricted nationwide under Section 69A, upheld by the Delhi High Court.</div>
      <div class="bullet e3">NTA: Telegram's edit feature was used to fabricate leak “evidence” after the exam.</div>
      <div class="bullet e4">Censorship as collateral damage of a leak.</div>
    </div>`, (t, r) => {
    els(r, ".bubble").forEach((b, i) => enter(b, t, 0.2 + i * 0.35, 0.5, 20))
    const blocked = el(r, ".blocked")
    blocked.style.opacity = String(prog(t, 2.4, 2.9))
    enter(el(r, ".e1"), t, 0.4)
    enter(el(r, ".e2"), t, 3.2)
    enter(el(r, ".e3"), t, 4.6)
    enter(el(r, ".e4"), t, 6.6)
  })

  scene(33.5, 41.5, "01 · The problem", "Indian Express via ForumIAS; Telangana Today, Aug 2026", `
    <div class="col" style="left:150px;top:150px"><div class="h2 e1">It keeps happening.</div></div>
    <div class="stats" style="left:150px;top:380px">
      <div class="stat"><div class="n n1">0</div><div class="l">paper leaks</div></div>
      <div class="stat"><div class="n n2">0</div><div class="l">states</div></div>
      <div class="stat"><div class="n n3">0.0</div><div class="l">crore applicants hit · in five years</div></div>
    </div>
    <div class="body e2" style="position:absolute;left:150px;top:800px">Aug 2026: Maharashtra TET cancelled <b>a day before</b> the exam.</div>`, (t, r) => {
    enter(el(r, ".e1"), t, 0.1)
    enter(el(r, ".stats"), t, 0.6)
    const k = out3(prog(t, 0.8, 3.4))
    el(r, ".n1").textContent = String(Math.round(41 * k))
    el(r, ".n2").textContent = String(Math.round(15 * k))
    el(r, ".n3").textContent = (1.4 * k).toFixed(1)
    enter(el(r, ".e2"), t, 4.2)
  })

  const chain: [keyof typeof ICONS, string, string][] = [
    ["setter", "Setter", "photographed"],
    ["press", "Printing press", "extra copies"],
    ["truck", "Transport", "trunk opened"],
    ["vault", "Strong room", "back door open*"],
    ["school", "Exam centre", "torn seal"],
  ]
  scene(41.5, 53.5, "02 · The insight", "*NEET 2024, Hazaribagh: the CBI found the strong room's back door open", `
    <div class="col" style="left:150px;top:150px;width:1600px">
      <div class="h2 e1">Every leak needs one thing:</div>
      <div class="h2 e2"><em>a paper that exists before the exam.</em></div>
    </div>
    ${chain.slice(0, -1).map((_, i) => `<div class="wire w${i}" style="left:${330 + i * 330}px;top:555px;width:200px"></div>`).join("")}
    ${chain.map(([k, name, leak], i) => `<div class="node n${i}" style="left:${150 + i * 330}px;top:480px"><div class="ic">${ICONS[k]}<div class="pulse p${i}"></div></div><div class="nm">${name}</div><div class="lk">${leak}</div></div>`).join("")}`, (t, r) => {
    enter(el(r, ".e1"), t, 0.1)
    enter(el(r, ".e2"), t, 7.2)
    chain.forEach((_, i) => {
      enter(el(r, `.n${i}`), t, 0.8 + i * 0.5, 0.5, 20)
      if (i < chain.length - 1) el(r, `.w${i}`).style.transform = `scaleX(${out3(prog(t, 1.1 + i * 0.5, 1.5 + i * 0.5))})`
      const p = el(r, `.p${i}`)
      const ph = (t - 3.8 - i * 0.55) % 1.6
      const on = t > 3.8 + i * 0.55
      p.style.opacity = on ? String(Math.max(0, 1 - ph / 1.6)) : "0"
      p.style.transform = `scale(${on ? 1 + ph * 0.35 : 1})`
      el(r, `.n${i} .lk`).style.opacity = String(prog(t, 3.8 + i * 0.55, 4.2 + i * 0.55))
    })
  })

  scene(53.5, 60.5, "02 · The insight", "Radhakrishnan committee (2024); Business Standard, Jul 2026", `
    <div class="col" style="left:150px;top:200px;width:1000px">
      <div class="h2 e1">Even an encrypted paper needs someone <em>holding the key.</em></div>
      <div class="body e2">India's reform committee: send encrypted papers to centres, print them just before the exam. Someone still holds and releases the key.</div>
    </div>
    <svg class="holder" viewBox="0 0 400 400" width="560" height="560" style="position:absolute;left:1230px;top:250px">
      <circle cx="200" cy="110" r="56" fill="none" stroke="#f4efe4" stroke-width="6"/>
      <path d="M90 360c0-70 50-120 110-120s110 50 110 120" fill="none" stroke="#f4efe4" stroke-width="6"/>
      <g transform="translate(250 230) rotate(-30)"><circle cx="0" cy="0" r="22" fill="none" stroke="#f7b32b" stroke-width="7"/><path d="M22 0h80M80 0v20M100 0v16" stroke="#f7b32b" stroke-width="7" fill="none"/></g>
      <path class="strike" d="M40 40L360 360" stroke="#ef5a40" stroke-width="14" stroke-linecap="round" fill="none" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>
    </svg>`, (t, r) => {
    enter(el(r, ".e1"), t, 0.1)
    enter(el(r, ".e2"), t, 1.6)
    enter(el(r, ".holder"), t, 0.4)
    ;(el(r, ".strike") as unknown as SVGPathElement).style.strokeDashoffset = String(1 - out3(prog(t, 4.2, 4.9)))
  })

  scene(60.5, 68.5, "03 · Muhurat", undefined, `
    <div class="col" style="left:0;right:0;top:250px;align-items:center;text-align:center">
      <div class="h1 e1">What if the paper did not exist</div>
      <div class="h1 e2"><em>until the bell?</em></div>
    </div>
    <div class="sealwrap" style="position:absolute;left:810px;top:180px;width:300px;height:300px">${sealSvg("bigseal", 300)}</div>
    <div class="col title" style="left:0;right:0;top:520px;align-items:center;text-align:center;gap:10px">
      <div style="font-family:var(--deva);font-size:150px;color:var(--sindoor);line-height:1.1">मुहूर्त</div>
      <div class="h2">Muhurat</div>
      <div class="body" style="max-width:1300px">An exam paper that does not exist, anywhere, until the bell rings.</div>
    </div>`, (t, r) => {
    enter(el(r, ".e1"), t, 0.2)
    enter(el(r, ".e2"), t, 1.2)
    const q = prog(t, 2.9, 3.3)
    el(r, ".e1").style.opacity = String(Number(el(r, ".e1").style.opacity) * (1 - q))
    el(r, ".e2").style.opacity = String(Number(el(r, ".e2").style.opacity) * (1 - q))
    const s = el(r, ".sealwrap")
    const k = out3(prog(t, 3.2, 3.7))
    s.style.opacity = String(k)
    s.style.transform = `scale(${1.8 - 0.8 * k}) rotate(${(1 - k) * -25}deg)`
    enter(el(r, ".title"), t, 4.3, 0.9)
  })

  const steps = ["Setters seal", "Arkiv keeps it", "The key does not exist yet", "Every centre, same second"]
  const stepsHtml = `<div class="steps">${steps.map((s, i) => `<div class="step s${i}"><b>0${i + 1}</b>${s}</div>`).join("")}</div>`
  const hex = (n: number, seed: number) => Array.from({ length: n }, (_, i) => "0123456789abcdef"[Math.floor(rand(i + seed) * 16)]).join("")
  scene(68.5, 88.5, "04 · How it works", "drand quicknet: 3 s rounds, threshold BLS; Arkiv Tiramisu testnet", `
    ${stepsHtml}
    <div class="a">
      <div class="panel" style="left:96px;top:320px;width:760px;height:560px">
        <div class="eyebrow" style="font-size:24px;margin-bottom:20px">Chemistry bank · plaintext</div>
        <div class="qline">The hybridisation of carbon in ethyne is</div>
        <div class="qline">The pH of a 0.001 M HCl solution is</div>
        <div class="qline">The oxidation state of Cr in K₂Cr₂O₇ is</div>
        <div class="qline">Which gas is evolved when zinc reacts with…</div>
      </div>
      <div class="panel" style="left:1000px;top:320px;width:824px;height:560px">
        <div class="eyebrow" style="font-size:24px;margin-bottom:20px">Sealed in the browser · drand timelock</div>
        <div class="cipher"></div>
        <div class="body" style="font-size:28px;margin-top:24px">Sealed to round <b>33,168,400</b>. The plaintext is wiped.</div>
      </div>
    </div>
    <div class="b">
      <div class="panel" style="left:96px;top:320px;width:1728px;height:600px">
        <div class="eyebrow" style="font-size:24px;margin-bottom:26px">Arkiv entity · kind = sealed_bank</div>
        <dl class="kv">
          <dt>$creator</dt><dd><span class="mono">0x9097…216d</span> <span class="badge g k1">appointed for chemistry ✓</span></dd>
          <dt>flags</dt><dd><span class="badge m k2">readonly</span><span class="badge k3">anyone can keep it alive</span></dd>
          <dt>$owner</dt><dd><span class="mono">0x…dEaD</span> <span class="badge r k4">nobody can delete it</span></dd>
          <dt>payload</dt><dd class="mono" style="color:var(--peacock);font-size:26px">-----BEGIN AGE ENCRYPTED FILE----- tlock 33168400 52db9ba7…</dd>
          <dt>expires</dt><dd>bell + 180 days <span class="badge k5">grievance window</span></dd>
        </dl>
        <div class="body k6" style="font-size:30px;margin-top:30px">Created, frozen and handed to nobody in <b>one transaction</b>.</div>
      </div>
    </div>
    <div class="c">
      <div class="ring" style="position:absolute;left:260px;top:330px;width:560px;height:560px"></div>
      <div class="col" style="left:1000px;top:390px;width:820px">
        <div class="eyebrow" style="font-size:26px">drand · League of Entropy</div>
        <div class="huge mono rnd" style="font-size:118px;font-family:var(--mono);font-weight:600">33,168,300</div>
        <div class="body cbody">Until this round, the key that opens the paper <b>does not exist</b>. Not with the board. Not with the setters. Not with us.</div>
        <div class="cipher key" style="font-size:24px;color:var(--marigold)"></div>
      </div>
    </div>
    <div class="d">
      ${["MUM-01 · Mumbai", "PAT-01 · Patna", "HZB-01 · Hazaribagh"].map((c, i) => `<div class="screen sc${i}" style="left:${96 + i * 614}px;top:330px"><div class="city"><span>${c}</span><span class="clk">09:59:58</span></div><div class="state">Sealed</div>${Array.from({ length: 5 }, () => `<div class="q"></div>`).join("")}</div>`).join("")}
      <div class="body dcap" style="position:absolute;left:96px;top:780px;width:1700px">15 questions drawn from 45 by the round's public randomness. <b>Nobody chose this paper.</b></div>
    </div>`, (t, r) => {
    const stepIdx = t < 5 ? 0 : t < 10 ? 1 : t < 15 ? 2 : 3
    els(r, ".step").forEach((s, i) => s.classList.toggle("on", i === stepIdx))
    enter(el(r, ".steps"), t, 0, 0.6)
    const show = (cls: string, a: number, b: number) => {
      const node = el(r, cls)
      node.style.opacity = String(prog(t, a, a + 0.4) * (1 - prog(t, b - 0.4, b)))
    }
    show(".a", 0, 5)
    show(".b", 5, 10)
    show(".c", 10, 15)
    show(".d", 15, 20.5)
    // a: plaintext scrambles into ciphertext
    const n = Math.floor(360 * out3(prog(t, 0.8, 3.6)))
    el(r, ".cipher").textContent = `${hex(n, 7)}${n < 360 ? hex(Math.min(24, 360 - n), Math.floor(t * 30)) : ""}`
    els(r, ".qline").forEach((q, i) => (q.style.opacity = String(1 - 0.85 * prog(t, 1 + i * 0.5, 2 + i * 0.5))))
    // b: badges pop
    ;[".k1", ".k2", ".k3", ".k4", ".k5", ".k6"].forEach((k, i) => enter(el(r, k), t, 5.6 + i * 0.55, 0.4, 14))
    // c: ring of 18 operators, round ticker, key appears at 13.5
    const ring = el(r, ".ring")
    if (!ring.childElementCount) for (let i = 0; i < 18; i++) ring.insertAdjacentHTML("beforeend", `<div class="ring-dot"></div>`)
    const flash = prog(t, 13.4, 13.7)
    els(ring, ".ring-dot").forEach((d, i) => {
      const a = (i / 18) * Math.PI * 2 + t * 0.15
      d.style.left = `${267 + 250 * Math.cos(a)}px`
      d.style.top = `${267 + 250 * Math.sin(a)}px`
      d.style.background = flash > 0 ? "#f7b32b" : "#3a355c"
      d.style.boxShadow = flash > 0 ? `0 0 ${30 * flash}px #f7b32b` : "none"
    })
    const round = Math.min(33168400, 33168300 + Math.floor(100 * inOut(prog(t, 10.4, 13.4))))
    el(r, ".rnd").textContent = round.toLocaleString("en-US")
    el(r, ".rnd").style.color = flash > 0 ? "#f7b32b" : "#f4efe4"
    const keyChars = Math.floor(96 * prog(t, 13.5, 14.6))
    el(r, ".key").textContent = keyChars ? `key  ${"97ba079320c8438beee1795e780d06cc6f7197461b10b4c3c8fb9773cb05c3b605497f76451b015514c950afb2eea52a".slice(0, keyChars)}` : ""
    // d: three centres open on the same frame
    const opened = t >= 16.2
    els(r, ".screen").forEach((s, i) => {
      enter(s, t, 15.1 + i * 0.15, 0.5, 20)
      s.classList.toggle("open", opened)
      el(s, ".state").textContent = opened ? "Opened" : "Sealed"
      el(s, ".clk").textContent = opened ? "10:00:00" : t > 15.6 ? "09:59:59" : "09:59:58"
    })
    enter(el(r, ".dcap"), t, 17, 0.6)
  })

  scene(88.5, 98.5, "05 · Why Arkiv", "Arkiv SDK 0.8.1: $creator, creation flags, executeBatch, atBlock", `
    <div class="col" style="left:96px;top:150px"><div class="h2 e1">Why it only works on Arkiv</div></div>
    <div class="card c1" style="left:96px;top:330px"><h4>$creator</h4><p>Only banks created by setters the board appointed count. Copying an attribute is easy. Forging <b>$creator</b> is not.</p></div>
    <div class="card c2" style="left:700px;top:330px"><h4>readonly + 0x…dEaD</h4><p>Frozen and handed to nobody in one batch. No insider can swap in a paper sealed to an earlier round, or delete it.</p></div>
    <div class="card c3" style="left:1304px;top:330px"><h4>block order</h4><p>A leak claim filed before the bell is <b>proof</b>. An edited screenshot is not. Read it back with <span class="mono">atBlock</span>.</p></div>
    <div class="body e2" style="position:absolute;left:96px;top:860px;width:1700px">On Postgres, an insider swaps the paper. On IPFS: no authorship, no query, no lifecycle.</div>`, (t, r) => {
    enter(el(r, ".e1"), t, 0.1)
    ;[".c1", ".c2", ".c3"].forEach((c, i) => enter(el(r, c), t, 0.8 + i * 0.6, 0.6, 40))
    enter(el(r, ".e2"), t, 4.8)
  })

  scene(98.5, 101.5, "06 · Live", undefined, `
    <div class="col" style="left:0;right:0;top:400px;align-items:center;text-align:center">
      <div class="h1 e1">Now, live.</div>
      <div class="eyebrow e2" style="font-size:28px">the real app · reading Arkiv directly · no backend</div>
    </div>`, (t, r) => {
    enter(el(r, ".e1"), t, 0.1)
    enter(el(r, ".e2"), t, 0.6)
  })
}

// ---------------------------------------------------------------- outro

if (part === "outro") {
  const quads: [string, string, string][] = [
    ["C", "ensorship resistant", "Read from any Arkiv RPC, no backend. No ban needed when a leak is impossible."],
    ["O", "pen source", "MIT code, documented data contract, an independent verifier."],
    ["P", "rivate", "No candidate data on chain. Leak claims are salted fingerprints."],
    ["S", "ecure", "$creator-checked, readonly, owned by nobody. Chain-checked timelock."],
  ]
  scene(0, 6, "CROPS", undefined, `
    <div class="col" style="left:96px;top:110px"><div class="h2 e0">CROPS, in one exam.</div></div>
    ${quads.map(([k, rest, p], i) => `<div class="quad q${i}" style="left:${96 + (i % 2) * 884}px;top:${290 + Math.floor(i / 2) * 340}px"><div class="k"><span>${k}</span>${rest}</div><p>${p}</p></div>`).join("")}`, (t, r) => {
    enter(el(r, ".e0"), t, 0.1)
    quads.forEach((_, i) => enter(el(r, `.q${i}`), t, 0.5 + i * 0.4, 0.6, 30))
  })
  scene(6, 12, "Muhurat", undefined, `
    <div class="sealwrap" style="position:absolute;left:860px;top:110px;width:200px;height:200px">${sealSvg("endseal", 200)}</div>
    <div class="col" style="left:0;right:0;top:380px;align-items:center;text-align:center;gap:20px">
      <div class="h2 e1">Arkiv knows when data should <em>die.</em></div>
      <div class="h2 e2">Muhurat teaches it when data should be <em>born.</em></div>
      <div class="body e3" style="margin-top:50px">मुहूर्त · Muhurat · Built for Arkiv: Global Tour Stop · Road to Devcon 8 Mumbai</div>
      <div class="eyebrow e4" style="font-size:30px">${repo}</div>
    </div>`, (t, r) => {
    enter(el(r, ".sealwrap"), t, 0.1)
    enter(el(r, ".e1"), t, 0.4)
    enter(el(r, ".e2"), t, 1.6)
    enter(el(r, ".e3"), t, 3)
    enter(el(r, ".e4"), t, 3.4)
  })
}

// ---------------------------------------------------------------- chrome + driver

stage.insertAdjacentHTML("beforeend", `<div id="chapter" class="chrome"></div><div id="source" class="chrome"></div><div id="progress" class="chrome"></div><div id="mark" class="chrome">मुहूर्त</div>`)
const duration = Math.max(...scenes.map((s) => s.to))

function renderAt(t: number) {
  let active: Scene | undefined
  for (const s of scenes) {
    const local = t - s.from
    const visible = t >= s.from && t < s.to
    const fade = Math.min(prog(local, 0, 0.45), 1 - prog(t, s.to - 0.45, s.to))
    s.root.style.opacity = visible ? String(fade) : "0"
    s.root.style.visibility = visible ? "visible" : "hidden"
    if (visible) {
      s.update(local)
      active = s
    }
  }
  const chapter = document.getElementById("chapter")!
  const [num, ...name] = (active?.chapter ?? "").split(" · ")
  chapter.innerHTML = name.length ? `<b>${num}</b>${name.join(" · ")}` : `<b>${num}</b>`
  const source = document.getElementById("source")!
  source.textContent = active?.source ?? ""
  source.style.opacity = active?.source ? "1" : "0"
  document.getElementById("progress")!.style.width = `${(t / duration) * 100}%`
  document.getElementById("mark")!.style.opacity = part === "intro" && t < 64 ? "0" : "1"
}

/** Sound cues, in seconds from the start of this part, consumed by the soundtrack. */
const cues = part === "intro" ? { thud: [8.65], bell: [64.0], chime: [82.0, 84.7], ticks: [0, 41.5] } : { bell: [6.2], thud: [], chime: [], ticks: [0, 0] }

declare global {
  interface Window {
    FILM: { duration: number; renderAt: (t: number) => void; cues: typeof cues; ready: Promise<unknown> }
  }
}
window.FILM = { duration, renderAt, cues, ready: document.fonts.ready }
renderAt(Number(params.get("t") ?? 0))
if (params.has("play")) {
  const start = performance.now()
  const loop = () => {
    const t = (performance.now() - start) / 1000
    renderAt(t % duration)
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}
