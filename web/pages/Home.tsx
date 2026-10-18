import { motion } from "framer-motion"
import { useEffect, useState } from "react"
import { type Entity, listExams } from "../../src/arkiv"
import { boardFromUrl, examInfo, publicClient } from "../chain"
import { BigCountdown, RoundTicker, Seal } from "../components"
import { useT } from "../i18n"
import { friendly, ist, useNow } from "../ui"

const HOW: [string, string][] = [
  ["Setters seal", "Each setter writes a question bank and seals it in the browser to a future drand round. The plaintext is wiped."],
  ["Arkiv keeps it", "The sealed bank becomes a readonly Arkiv entity, handed to 0x…dEaD in the same transaction. Nobody can edit or delete it."],
  ["The bell rings", "drand's threshold network publishes the round key to the whole world at once. Every centre decrypts at the same second."],
  ["Nobody chose it", "The paper is drawn from the banks by the round's public randomness. Leak claims filed before the bell are tested against it."],
]

const CROPS: [string, string][] = [
  ["Censorship resistant", "Papers and evidence are read from any Arkiv RPC with no backend. No platform ban is needed when a leak is impossible."],
  ["Open source", "MIT code and a documented data contract. Anyone can build a centre client, a checker or a court."],
  ["Private", "No candidate data on chain. Leak claims hold only salted fingerprints, readable by no one until the bell."],
  ["Secure", "Only banks whose $creator the board appointed count. Readonly payloads stop insider swaps."],
]

export function HomePage() {
  const board = boardFromUrl()
  const { t } = useT()
  const now = useNow()
  const [exams, setExams] = useState<Entity[]>()
  const [error, setError] = useState<string>()
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    listExams(publicClient, board, new Date(Date.now() - 3 * 86_400_000)).then(setExams, (e: Error) => setError(friendly(e)))
  }, [board])

  const infos = (exams ?? []).map(examInfo).sort((a, b) => a.opensAt.getTime() - b.opensAt.getTime())
  const next = infos.find((e) => e.opensAt.getTime() > now)
  const last = [...infos].reverse().find((e) => e.opensAt.getTime() <= now)
  const qs = `?board=${board}`
  const pastList = infos.filter((e) => e.opensAt.getTime() <= now)
  const shown = showAll ? infos : [...pastList.slice(-2), ...infos.filter((e) => e.opensAt.getTime() > now).slice(0, 6)]

  return (
    <main>
      <section className="hero">
        <div className="hero-inner">
          <div>
            <p className="eyebrow">{t("hero.eyebrow")}</p>
            <h1 className="display">
              {t("hero.title1")} <em>{t("hero.title2")}</em>
            </h1>
            <p className="lede">{t("hero.lede")}</p>
            <div className="row">
              {next && <a className="btn" href={`#/exam/${next.id}${qs}`}>{t("home.tryNow")}</a>}
              <a className="btn ghost" href="#/check">{t("nav.check")}</a>
            </div>
          </div>
          <motion.div className="hero-seal" initial={{ scale: 0.9, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: -4, opacity: 1 }} transition={{ duration: 0.9, ease: [0.2, 0.7, 0.2, 1] }}>
            <div className="envelope">
              <span className="env-flap" />
              <Seal size={150} />
            </div>
          </motion.div>
        </div>
      </section>

      <div className="page">
        {error && <p className="error">{error}</p>}
        {!exams && !error && <p className="quiet loading">Reading exams from Arkiv…</p>}

        <div className="grid two">
          {next && (
            <a className="card next" href={`#/exam/${next.id}${qs}`}>
              <div className="card-top"><span className="lockdot" aria-hidden="true" /> <strong>{t("home.next")}</strong></div>
              <BigCountdown to={next.opensAt} now={now} />
              <RoundTicker target={next.round} now={now} />
              <p className="quiet">{ist(next.opensAt)} · <span className="mono">{next.id}</span> · {next.sections.length} sealed banks · {next.perSection * next.sections.length} questions drawn at the bell</p>
              <span className="cta">{t("home.tryNow")} →</span>
            </a>
          )}
          {last && (
            <a className="card" href={`#/exam/${last.id}${qs}`}>
              <div className="card-top"><strong>{t("home.last")}</strong></div>
              <p className="mono big-id">{last.id}</p>
              <p className="quiet">Rang {ist(last.opensAt)}. Your browser fetches the round key, decrypts the banks it reads from Arkiv, and draws the same paper every centre printed.</p>
              <span className="cta">{t("home.seePaper")} →</span>
            </a>
          )}
        </div>

        <section>
          <h2 className="section-title">{t("home.how")}</h2>
          <ol className="how">
            {HOW.map(([title, body], i) => (
              <motion.li key={title} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.08 }}>
                <span className="how-n">{i + 1}</span>
                <h4>{title}</h4>
                <p>{body}</p>
              </motion.li>
            ))}
          </ol>
        </section>

        {infos.length > 0 && (
          <section>
            <h2 className="section-title">Schedule</h2>
            <p className="quiet">{t("home.schedule")}</p>
            <ul className="schedule">
              {shown.map((e) => {
                const past = e.opensAt.getTime() <= now
                return (
                  <li key={e.id} className={past ? "past" : ""}>
                    <a href={`#/exam/${e.id}${qs}`} className="mono">{e.id}</a>
                    <span>{ist(e.opensAt)}</span>
                    <span className={`pill ${past ? "open" : "sealed"}`}>{past ? "opened" : "sealed"}</span>
                  </li>
                )
              })}
            </ul>
            {!showAll && infos.length > shown.length && (
              <button type="button" className="ghost more" onClick={() => setShowAll(true)}>Show all {infos.length} exams</button>
            )}
          </section>
        )}

        <section className="crops">
          <h2 className="section-title">CROPS, in one exam</h2>
          <div className="grid four">
            {CROPS.map(([title, body]) => (
              <article key={title} className="card crop">
                <h4>{title}</h4>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="why">
          <h2 className="section-title">Why this exists</h2>
          <ol className="timeline">
            <li><b>3 May 2026</b> NEET-UG held for about 22 lakh candidates.</li>
            <li><b>12 May</b> Cancelled: the paper leaked on Telegram. The CBI took over the case.</li>
            <li><b>June</b> India restricted Telegram nationwide before the re-test; the Delhi High Court upheld it. NTA said edited messages were used to fake leak “evidence”.</li>
            <li><b>August</b> Maharashtra TET cancelled a day before the exam over a leak.</li>
            <li><b>The fix on the table</b> Encrypted papers printed at centres (Radhakrishnan committee). It still needs a key holder. Muhurat removes the key holder.</li>
          </ol>
        </section>
      </div>
    </main>
  )
}
