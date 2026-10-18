import { motion, useReducedMotion } from "framer-motion"
import QRCode from "qrcode"
import { useEffect, useMemo, useState } from "react"
import { roundAt } from "drand-client"
import { QUICKNET } from "../src/drand"
import { type Paper, type PaperQuestion, centreVariant, variantHash } from "../src/paper"
import { useT } from "./i18n"

/** A wax seal with a scalloped rim; splits in two when `broken`. */
export function Seal({ broken = false, size = 168 }: { broken?: boolean; size?: number }) {
  const reduce = useReducedMotion()
  const rim = useMemo(() => {
    const pts: string[] = []
    for (let i = 0; i <= 72; i++) {
      const a = (i / 72) * Math.PI * 2
      const r = 46 + (i % 2 ? 2.6 : -0.6) + Math.sin(i * 1.7) * 0.9
      pts.push(`${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`)
    }
    return `M${pts.join("L")}Z`
  }, [])
  const half = (side: -1 | 1) => (
    <motion.g
      initial={false}
      animate={broken ? { x: side * 14, y: 6, rotate: side * 14, opacity: 0.92 } : { x: 0, y: 0, rotate: 0, opacity: 1 }}
      transition={{ duration: reduce ? 0 : 1.1, ease: [0.2, 0.7, 0.2, 1] }}
      style={{ originX: "50%", originY: "50%" }}
      clipPath={`url(#seal-${side < 0 ? "l" : "r"})`}
    >
      <path d={rim} fill="url(#seal-wax)" />
      <circle cx="50" cy="50" r="33" fill="none" stroke="var(--seal-deep)" strokeWidth="1.6" opacity="0.7" />
      <circle cx="50" cy="50" r="29" fill="none" stroke="var(--seal-hi)" strokeWidth="0.8" opacity="0.6" />
      <text x="50" y="62" textAnchor="middle" fontSize="34" fontFamily="'Tiro Devanagari Hindi', serif" fill="var(--seal-deep)" opacity="0.9">
        मु
      </text>
    </motion.g>
  )
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={broken ? "Seal broken" : "Sealed"} className="seal">
      <defs>
        <radialGradient id="seal-wax" cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="var(--seal-hi)" />
          <stop offset="0.55" stopColor="var(--seal)" />
          <stop offset="1" stopColor="var(--seal-deep)" />
        </radialGradient>
        <clipPath id="seal-l">
          <path d="M0 0H52L46 30L54 52L44 74L50 100H0Z" />
        </clipPath>
        <clipPath id="seal-r">
          <path d="M52 0H100V100H50L44 74L54 52L46 30Z" />
        </clipPath>
      </defs>
      {half(-1)}
      {half(1)}
    </svg>
  )
}

export function BigCountdown({ to, now }: { to: Date; now: number }) {
  const { t } = useT()
  const left = Math.max(0, Math.floor((to.getTime() - now) / 1000))
  const parts: [number, string][] = [
    [Math.floor(left / 86400), t("count.d")],
    [Math.floor((left % 86400) / 3600), t("count.h")],
    [Math.floor((left % 3600) / 60), t("count.m")],
    [left % 60, t("count.s")],
  ]
  const shown = parts[0][0] > 0 ? parts : parts.slice(1)
  return (
    <div className="bigcount" role="timer" aria-live="off">
      {shown.map(([v, label]) => (
        <div key={label} className="seg">
          <span className="num">{String(v).padStart(2, "0")}</span>
          <span className="lbl">{label}</span>
        </div>
      ))}
    </div>
  )
}

/** drand's clock, computed locally from the chain's genesis and period: no network needed. */
export function RoundTicker({ target, now }: { target: number; now: number }) {
  const current = roundAt(now, QUICKNET)
  const togo = Math.max(0, target - current)
  return (
    <p className="ticker mono">
      <span className="pulse" aria-hidden="true" /> drand round <b>{current.toLocaleString("en-IN")}</b>
      {togo > 0 ? (
        <>
          {" "}· sealed to <b>{target.toLocaleString("en-IN")}</b> · {togo.toLocaleString("en-IN")} rounds to go · the key does not exist yet
        </>
      ) : (
        <> · round {target.toLocaleString("en-IN")} published</>
      )}
    </p>
  )
}

const CITIES: [string, string][] = [
  ["Mumbai", "Asia/Kolkata"],
  ["Singapore", "Asia/Singapore"],
  ["London", "Europe/London"],
  ["New York", "America/New_York"],
]
export function WorldClocks({ at }: { at: Date }) {
  const { t } = useT()
  return (
    <div className="clocks">
      <span className="quiet small">{t("exam.everyone")}</span>
      <div>
        {CITIES.map(([city, tz]) => (
          <span key={city} className="clock">
            <span className="quiet">{city}</span>{" "}
            <span className="mono">{at.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

export type Step = { label: string; detail?: string; state: "done" | "now" | "todo" | "bad" }
export function Stepper({ steps }: { steps: Step[] }) {
  return (
    <ol className="stepper">
      {steps.map((s) => (
        <li key={s.label} className={s.state}>
          <span className="dot" aria-hidden="true" />
          <span className="lab">{s.label}</span>
          {s.detail && <span className="det mono">{s.detail}</span>}
        </li>
      ))}
    </ol>
  )
}

/**
 * The paper as a centre prints it: the board's header, a QR code that verifies this copy, and the
 * centre's own question order, so a photographed copy names the centre it came from.
 */
export function Booklet({ paper, centres, verifyUrl }: { paper: Paper; centres: string[]; verifyUrl: string }) {
  const [centre, setCentre] = useState(centres[0] ?? "master")
  const [qr, setQr] = useState<string>()
  const questions: PaperQuestion[] = centre === "master" ? paper.questions : centreVariant(paper, centre)
  const vhash = variantHash(questions)
  useEffect(() => {
    QRCode.toDataURL(`${verifyUrl}&centre=${centre}&variant=${vhash.slice(0, 16)}`, { margin: 1, width: 168, color: { dark: "#1a1633", light: "#ffffff" } }).then(setQr)
  }, [verifyUrl, centre, vhash])
  return (
    <div className="booklet-wrap">
      <div className="booklet-tools no-print">
        <label className="seg-select">
          Printed at
          <select value={centre} onChange={(e) => setCentre(e.target.value)}>
            <option value="master">Master order</option>
            {centres.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <button type="button" className="ghost" onClick={() => window.print()}>Print this paper</button>
      </div>
      <article className="booklet">
        <header className="booklet-head">
          <div>
            <p className="board">DEMO TESTING BOARD · MOCK TEST</p>
            <h3>Physics · Chemistry · Biology</h3>
            <p className="meta mono">
              {paper.exam} · round {paper.round} · paper {paper.hash.slice(0, 12)} · {centre === "master" ? "master" : `centre ${centre}`} · variant {vhash.slice(0, 8)}
            </p>
          </div>
          {qr && <img src={qr} alt="QR code that verifies this printed copy" width={84} height={84} />}
        </header>
        <ol className="qs">
          {questions.map((q) => (
            <li key={`${q.section}/${q.id}`}>
              <p>
                <span className="sec">{q.section}</span> {q.text}
              </p>
              <ol className="omr">
                {q.options.map((o, i) => (
                  <li key={o}>
                    <span className="bubble">{"ABCD"[i]}</span> {o}
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
        <footer className="booklet-foot mono">Opened at the bell from banks sealed on Arkiv. Scan to verify this copy. Synthetic demo questions.</footer>
      </article>
    </div>
  )
}

export function LeaseBar({ secondsLeft, total }: { secondsLeft: number; total: number }) {
  const pct = Math.max(0, Math.min(100, (secondsLeft / total) * 100))
  return (
    <div className="leasebar" aria-label={`${Math.round(pct)}% of lease left`}>
      <span style={{ width: `${pct}%` }} />
    </div>
  )
}
