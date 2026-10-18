import { AnimatePresence, motion } from "framer-motion"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { LEASE_MINUTES } from "../../src/arkiv"
import { type ClaimMatch, parseClaim, testClaim, verdict } from "../../src/claims"
import { type ExamBundle, type Opened, attr, blockAt, boardFromUrl, examInfo, liveClient, loadExam, openExam, publicClient, tryEarly } from "../chain"
import { BigCountdown, Booklet, LeaseBar, RoundTicker, Seal, type Step, Stepper, WorldClocks } from "../components"
import { useT } from "../i18n"
import { ringBell, soundEnabled } from "../sound"
import { Addr, Badge, friendly, ist, short, useNow } from "../ui"

export function ExamPage({ id }: { id: string }) {
  const board = boardFromUrl()
  const { t } = useT()
  const now = useNow()
  const [bundle, setBundle] = useState<ExamBundle>()
  const [error, setError] = useState<string>()
  const [warning, setWarning] = useState<string>()
  const [bellBlock, setBellBlock] = useState<bigint>()
  const [atBell, setAtBell] = useState<ExamBundle>()
  const [showBell, setShowBell] = useState(false)
  const [opened, setOpened] = useState<Opened>()
  const [openError, setOpenError] = useState<string>()
  const [early, setEarly] = useState<string>()
  const [live, setLive] = useState(false)
  const seen = useRef(new Set<string>())
  const wasRung = useRef<boolean>()
  const loaded = useRef(false)
  const lastRefresh = useRef(0)
  const bellAt = useRef<number>()

  // A failed read only blanks the page if nothing has loaded yet; afterwards the last good state
  // stays on screen with a quiet warning, so one 429 at the bell cannot take the page down.
  const refresh = useCallback(() => {
    lastRefresh.current = Date.now()
    loadExam(publicClient, board, id).then(
      (b) => {
        loaded.current = true
        setBundle(b)
        setWarning(undefined)
      },
      (e: Error) => (loaded.current ? setWarning(friendly(e)) : setError(friendly(e))),
    )
  }, [board, id])

  useEffect(() => {
    refresh()
    let timer: ReturnType<typeof setTimeout> | undefined
    // Entity events are chain-wide, so coalesce them: at most one re-read a minute, and none while the
    // tab is hidden. Arkiv's public RPC allows about 100 anonymous queries an hour per IP
    // (arkiv/friction.md F3); leases count down locally. In the minute after the bell, when the
    // centres post their receipts, re-read every 4 seconds instead.
    const debounced = () => {
      clearTimeout(timer)
      if (document.hidden) return
      const sinceBell = bellAt.current === undefined ? -1 : Date.now() - bellAt.current
      const spacing = sinceBell >= 0 && sinceBell < 60_000 ? 4000 : 60_000
      timer = setTimeout(refresh, Math.max(1200, spacing - (Date.now() - lastRefresh.current)))
    }
    const onVisible = () => !document.hidden && Date.now() - lastRefresh.current > 60_000 && refresh()
    document.addEventListener("visibilitychange", onVisible)
    let stop = () => {}
    try {
      stop = liveClient.watchEntityEvents({ onEvent: debounced, onError: () => setLive(false) })
      setLive(true)
    } catch {
      setLive(false)
    }
    const fallback = setInterval(() => !document.hidden && Date.now() - lastRefresh.current > 110_000 && refresh(), 120_000)
    return () => {
      stop()
      document.removeEventListener("visibilitychange", onVisible)
      clearInterval(fallback)
      clearTimeout(timer)
    }
  }, [refresh])

  const examKey = bundle?.exam?.key
  // biome-ignore lint/correctness/useExhaustiveDependencies: the exam entity is readonly, its key identifies it
  const info = useMemo(() => (bundle?.exam ? examInfo(bundle.exam) : undefined), [examKey])
  bellAt.current = info?.opensAt.getTime()
  const rung = info ? now >= info.opensAt.getTime() : false

  // The bell: break the seal, ring, and re-read a few times as centres post their receipts.
  useEffect(() => {
    if (!info) return
    if (wasRung.current === false && rung) {
      if (soundEnabled()) ringBell()
      for (const delay of [4000, 12_000, 30_000]) setTimeout(refresh, delay)
    }
    wasRung.current = rung
  }, [rung, info, refresh])

  // drand may publish the round a moment after the bell second: retry quietly until it opens.
  const [openTry, setOpenTry] = useState(0)
  useEffect(() => {
    if (!rung || !bundle?.exam || opened) return
    let cancelled = false
    openExam(bundle).then(
      (o) => {
        if (cancelled) return
        setOpened(o)
        setOpenError(undefined)
      },
      (e: Error) => {
        if (cancelled) return
        if (openTry > 1) setOpenError(friendly(e))
        if (openTry < 40) setTimeout(() => setOpenTry((n) => n + 1), 3000)
      },
    )
    return () => {
      cancelled = true
    }
    // biome-ignore lint/correctness/useExhaustiveDependencies: retry is driven by openTry; bundle refreshes must not restart it
  }, [rung, examKey, opened, openTry])

  // The bell block exists only once the chain has passed the bell; poll until it has.
  useEffect(() => {
    if (!rung || !info || bellBlock !== undefined) return
    let cancelled = false
    const look = () =>
      blockAt(info.opensAt).then(
        (b) => (cancelled ? undefined : b === undefined ? setTimeout(look, 3000) : setBellBlock(b)),
        () => !cancelled && setTimeout(look, 5000),
      )
    look()
    return () => {
      cancelled = true
    }
  }, [rung, info, bellBlock])

  useEffect(() => {
    if (!showBell || bellBlock === undefined || atBell) return
    loadExam(publicClient, board, id, bellBlock).then(setAtBell, (e: Error) => {
      setShowBell(false)
      setWarning(`Could not read the state at the bell: ${friendly(e)}`)
    })
  }, [showBell, bellBlock, atBell, board, id])

  if (error && !bundle) return <main className="page"><p className="error">{error}</p></main>
  if (!bundle) return <main className="page"><p className="quiet loading">Reading exam {id} from Arkiv…</p></main>
  if (!bundle.exam || !info) return <main className="page"><p className="error">No exam “{id}” from board {short(board)}.</p></main>

  const view = showBell && atBell ? atBell : bundle
  const centres = view.appointments.filter((a) => attr(a, "role") === "centre")
  const setters = view.appointments.filter((a) => attr(a, "role") === "setter")
  for (const l of view.leases) seen.current.add(String(attr(l, "centre")))
  const receiptsMatch = opened ? view.receipts.filter((r) => String(attr(r, "paper_sha256")).slice(2) === opened.paper.hash).length : 0

  const steps: Step[] = [
    { label: "Published", detail: `block ${bundle.exam.createdAt}`, state: "done" },
    { label: "Banks sealed", detail: `${view.banks.length}/${setters.length}`, state: view.banks.length >= setters.length && setters.length ? "done" : "now" },
    { label: "Centres armed", detail: `${view.leases.length}/${centres.length}`, state: rung ? (view.receipts.length ? "done" : "todo") : view.leases.length ? "now" : "todo" },
    { label: "Bell", detail: `round ${info.round}`, state: rung ? "done" : "now" },
    { label: "Opened", detail: opened ? "in your browser" : undefined, state: opened ? "done" : rung ? "now" : "todo" },
    { label: "Receipts", detail: `${receiptsMatch || view.receipts.length}/${centres.length}${opened && view.receipts.length ? " same paper" : ""}`, state: view.receipts.length ? "done" : "todo" },
  ]

  return (
    <main className="page">
      <header className="exam-head">
        <div>
          <p className="eyebrow">{info.title}</p>
          <h1 className="mono examid">{info.id}</h1>
          <p className="quiet">
            Bell {ist(info.opensAt)} · drand round <span className="mono">{info.round}</span> · board <Addr value={board} />
          </p>
        </div>
        <div className="toggles">
          {live && <Badge tone="good">● live</Badge>}
          {rung && bellBlock !== undefined && (
            <label className="switch">
              <input type="checkbox" checked={showBell} onChange={(e) => setShowBell(e.target.checked)} /> {t("exam.stateAtBell")}
              {showBell && atBell && <span className="mono quiet"> block {String(atBell.block)}</span>}
            </label>
          )}
        </div>
      </header>

      {warning && <p className="warning-bar">{warning} Showing the last state read.</p>}
      <Stepper steps={steps} />

      <section className={`bell ${rung ? "rung" : "sealed"}`}>
        <div className="bell-grid">
          <div className="bell-seal">
            <Seal broken={rung} />
          </div>
          <div>
            <AnimatePresence mode="wait">
              {!rung ? (
                <motion.div key="sealed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -8 }}>
                  <h2>{t("exam.sealedTitle")}</h2>
                  <p>{t("exam.sealedBody", { round: info.round })}</p>
                  <BigCountdown to={info.opensAt} now={now} />
                  <RoundTicker target={info.round} now={now} />
                  <div className="row">
                    <button type="button" onClick={() => { setEarly("Asking drand for round " + info.round + "…"); tryEarly(bundle).then(setEarly) }}>
                      {t("exam.try")}
                    </button>
                  </div>
                  {early && <p className="mono early">{early}</p>}
                </motion.div>
              ) : (
                <motion.div key="open" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
                  <h2>{opened ? t("exam.openedTitle") : t("exam.opening")}</h2>
                  {opened && (
                    <p className="quiet">
                      {opened.paper.questions.length} questions drawn from {opened.banks.reduce((n, b) => n + b.questions.length, 0)} by round {opened.beacon.round}'s randomness. Key from{" "}
                      {opened.via === "drand" ? "drand's relays" : "a beacon relayed on Arkiv"}, verified against drand's public key. Nobody chose these questions.
                    </p>
                  )}
                  {openError && <p className="error">{openError}</p>}
                  <RoundTicker target={info.round} now={now} />
                </motion.div>
              )}
            </AnimatePresence>
            <WorldClocks at={info.opensAt} />
          </div>
        </div>
      </section>

      {opened && (
        <motion.section initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.3 }}>
          <Booklet paper={opened.paper} centres={centres.map((c) => String(attr(c, "centre")))} verifyUrl={`${location.origin}${location.pathname}#/exam/${info.id}?board=${board}`} />
        </motion.section>
      )}

      <section>
        <h3>{t("exam.banks")} <span className="quiet">· {view.banks.length} of {setters.length} appointed setters</span></h3>
        <div className="grid">
          {view.banks.map((b) => (
            <article key={b.key} className="card bank">
              <div className="card-top"><span className="lockdot" aria-hidden="true" /> <strong>{String(attr(b, "section"))}</strong></div>
              <dl>
                <dt>Sealed by</dt><dd><Addr value={b.creator} /> <Badge tone="good" title="$creator matches the board's appointment for this section">appointed</Badge></dd>
                <dt>Owner</dt><dd><Addr value={b.owner} label="0x…dEaD" /> <span className="quiet">nobody can delete it</span></dd>
                <dt>Flags</dt><dd>{b.creationFlags.readonly && <Badge tone="accent">readonly</Badge>} {b.creationFlags.permissionlessExtension && <Badge>anyone can keep alive</Badge>}</dd>
                <dt>Opens</dt><dd className="mono">round {String(attr(b, "round"))}</dd>
                <dt>Ciphertext</dt><dd className="mono">{short(String(attr(b, "ct_sha256")), 8)}</dd>
                <dt>Sealed at</dt><dd className="mono">block {String(b.createdAt)}</dd>
              </dl>
            </article>
          ))}
        </div>
        {view.rejected.length > 0 && (
          <p className="rejected">
            <Badge tone="bad">ignored</Badge> {view.rejected.length} record(s) for this exam came from wallets the board never appointed. Copying an attribute is easy; forging <span className="mono">$creator</span> is not.
          </p>
        )}
      </section>

      <section>
        <h3>{t("exam.control")} <span className="quiet">· each terminal renews a {LEASE_MINUTES}-minute lease with extendEntity; silence lets it lapse</span></h3>
        <div className="grid tiles">
          {centres.map((c) => {
            const code = String(attr(c, "centre"))
            const lease = view.leases.find((l) => attr(l, "centre") === code)
            const receipt = view.receipts.find((r) => attr(r, "centre") === code)
            const secsLeft = lease ? Math.max(0, Number(lease.expiresAt - view.block) * 2) : 0
            const tone = receipt ? "good" : lease ? (secsLeft < 180 ? "warn" : "good") : seen.current.has(code) ? "bad" : "quiet"
            const match = receipt && opened && String(attr(receipt, "paper_sha256")).slice(2) === opened.paper.hash
            return (
              <article key={code} className={`tile ${tone}`}>
                <div className="tile-top">
                  <span className={`beacon ${tone}`} aria-hidden="true" />
                  <strong>{code}</strong> <span className="quiet">{String(attr(c, "state"))}</span>
                </div>
                <p>
                  {receipt ? (match ? "Opened · same paper ✓" : "Opened") : lease ? `Ready · ${Math.floor(secsLeft / 60)}m ${secsLeft % 60}s on lease` : seen.current.has(code) ? "Lease lapsed · terminal silent" : "Not armed"}
                </p>
                {lease && !receipt && <LeaseBar secondsLeft={secsLeft} total={LEASE_MINUTES * 60} />}
                <Addr value={c.attributes?.member?.value as string} />
              </article>
            )
          })}
        </div>
      </section>

      <Court bundle={view} opened={opened} bellBlock={bellBlock} rung={rung} examId={info.id} />

      <p className="quiet small provenance">
        Every record above was read from the public Arkiv RPC by this page, with no backend. Exam entity <span className="mono">{short(bundle.exam.key, 8)}</span> ·{" "}
        <a href={`#/check?exam=${info.id}&board=${board}`}>Check a “leaked paper” against this exam</a> · <a href={`#/proof?exam=${info.id}&board=${board}`}>How this page uses Arkiv</a>
      </p>
    </main>
  )
}

function Court({ bundle, opened, bellBlock, rung, examId }: { bundle: ExamBundle; opened?: Opened; bellBlock?: bigint; rung: boolean; examId: string }) {
  const { t } = useT()
  const claims = [...bundle.claims].sort((a, b) => Number(a.createdAt - b.createdAt))
  return (
    <section>
      <h3>{t("exam.court")} <span className="quiet">· claims are fingerprints filed on Arkiv; their block is the evidence</span></h3>
      {!claims.length && <p className="quiet">No leak claims filed for this exam. Anyone can file one from the leak checker, before the bell.</p>}
      <div className="claims">
        {claims.map((c) => {
          const body = parseClaim(c.payload)
          const known = !rung || bellBlock !== undefined
          const before = bellBlock === undefined ? !rung : c.createdAt < bellBlock
          const matches: ClaimMatch[] = opened ? testClaim(examId, body.fingerprints, opened.banks, opened.paper) : []
          const v = rung && opened && known ? verdict(matches, before) : rung ? "testing" : "sealed"
          const lead = bellBlock !== undefined ? Number(bellBlock - c.createdAt) * 2 : undefined
          const sections = [...new Set(matches.map((m) => m.section))]
          const label = {
            sealed: ["quiet", "Sealed claim · tested at the bell"],
            testing: ["quiet", "Testing against the opened paper…"],
            proven: ["bad", "Proven leak"],
            "bank-leak": ["warn", "Bank leaked, not drawn"],
            "no-match": ["good", "No match · false claim"],
            "after-bell": ["quiet", "Filed after the bell · not evidence"],
          }[v] as ["bad" | "warn" | "good" | "quiet", string]
          return (
            <article key={c.key} className={`claim ${v}`}>
              <div className="claim-top">
                <Badge tone={label[0]}>{label[1]}</Badge>
                <span className="mono quiet small">block {String(c.createdAt)}{lead !== undefined && (lead > 0 ? ` · ${Math.round(lead / 60)} min before the bell` : ` · ${Math.round(-lead / 60)} min after`)}</span>
              </div>
              {body.note && <p>“{body.note}”</p>}
              <p className="quiet small">
                {body.fingerprints.length} phrase fingerprints · filed by <Addr value={c.creator} />
                {matches.length > 0 && <> · matches {matches.length} question(s), {matches.filter((m) => m.onPaper).length} on the paper · from the {sections.join(", ")} setter's bank</>}
              </p>
            </article>
          )
        })}
      </div>
    </section>
  )
}
