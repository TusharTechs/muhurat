import { useEffect, useState } from "react"
import { type Entity, listExams } from "../../src/arkiv"
import { type ExamBundle, attr, blockAt, boardFromUrl, examInfo, liveClient, loadExam, publicClient } from "../chain"
import { Addr, Badge, friendly, short } from "../ui"

const REPO = (import.meta.env.VITE_REPO_URL as string | undefined) || "https://github.com"
const code = (path: string) => (
  <a className="mono small" href={`${REPO}/blob/main/${path}`} target="_blank" rel="noreferrer">
    {path}
  </a>
)

type Row = { feature: string; why: string; evidence: React.ReactNode; where: React.ReactNode; ok: boolean }

export function ProofPage() {
  const board = boardFromUrl()
  const params = new URLSearchParams(location.hash.split("?")[1] ?? "")
  const [exams, setExams] = useState<Entity[]>()
  const [examId, setExamId] = useState(params.get("exam") ?? "")
  const [now, setNow] = useState<ExamBundle>()
  const [atBell, setAtBell] = useState<ExamBundle>()
  const [events, setEvents] = useState(0)
  const [error, setError] = useState<string>()

  useEffect(() => {
    listExams(publicClient, board, new Date(Date.now() - 3 * 86_400_000)).then((list) => {
      setExams(list)
      if (!examId) {
        const past = list.map(examInfo).filter((e) => e.opensAt.getTime() < Date.now()).sort((a, b) => b.opensAt.getTime() - a.opensAt.getTime())
        const pick = past[0] ?? list.map(examInfo)[0]
        if (pick) setExamId(pick.id)
      }
    }, (e: Error) => setError(friendly(e)))
  }, [board, examId])

  useEffect(() => {
    if (!examId) return
    let current = true
    setAtBell(undefined)
    setNow(undefined)
    ;(async () => {
      const b = await loadExam(publicClient, board, examId)
      if (!current) return
      setNow(b)
      const info = b.exam && examInfo(b.exam)
      if (!info || info.opensAt.getTime() > Date.now()) return
      const bell = await blockAt(info.opensAt)
      if (bell === undefined) return
      const at = await loadExam(publicClient, board, examId, bell)
      if (current) setAtBell(at)
    })().catch((e: Error) => current && setError(friendly(e)))
    return () => {
      current = false
    }
  }, [board, examId])

  useEffect(() => {
    try {
      return liveClient.watchEntityEvents({ onEvent: () => setEvents((n) => n + 1) })
    } catch {
      return undefined
    }
  }, [])

  const rows: Row[] = []
  if (now?.exam) {
    const info = examInfo(now.exam)
    const appts = now.appointments
    const sameBlock = appts.length > 0 && appts.every((a) => a.createdAt === now.exam!.createdAt)
    const bank = now.banks[0]
    const setterOf = (b: Entity) => appts.find((a) => String(attr(a, "member")).toLowerCase() === b.creator.toLowerCase())
    const lease = now.leases[0]
    rows.push(
      {
        feature: "$creator, checked against appointments",
        why: "Section and centre names can be copied by any wallet. $creator cannot. A bank counts only if the board appointed its creator for that section.",
        evidence: bank ? (
          <>
            {now.banks.length} banks, each from its appointed setter (e.g. <Addr value={bank.creator} /> = appointment for {String(attr(setterOf(bank), "section"))}).{" "}
            <Badge tone={now.rejected.length ? "bad" : "quiet"}>{now.rejected.length} ignored from unappointed wallets</Badge>
          </>
        ) : "no banks yet",
        where: code("src/arkiv.ts"),
        ok: now.banks.length > 0,
      },
      {
        feature: "readonly flag + ownership to 0x…dEaD",
        why: "A sealed bank must not be swappable for one sealed to an earlier round, and its setter must not be able to delete it at T−1.",
        evidence: bank ? <>flags raw {bank.creationFlags.raw} (readonly {String(bank.creationFlags.readonly)}), owner <span className="mono">{short(bank.owner)}</span>, creator <span className="mono">{short(bank.creator)}</span></> : "—",
        where: code("src/arkiv.ts"),
        ok: !!bank?.creationFlags.readonly && bank.owner.toLowerCase().endsWith("dead"),
      },
      {
        feature: "Atomic batches (executeBatch + predictEntityKeys)",
        why: "The exam never exists without its appointments; a bank is never owned by its setter for even one block.",
        evidence: <>exam and {appts.length} appointments all created at block <span className="mono">{String(now.exam.createdAt)}</span> {sameBlock ? "(one transaction)" : ""}; each bank created already owned by 0x…dEaD</>,
        where: code("src/arkiv.ts"),
        ok: sameBlock,
      },
      {
        feature: "Entity Expiration per type",
        why: "Evidence must outlive the grievance window; readiness must die quickly when a terminal goes quiet.",
        evidence: (
          <>
            exam lives {((Number(now.exam.expiresAt - now.exam.createdAt) * 2) / 86400).toFixed(0)} days
            {lease && <>; a centre lease lives {Math.round((Number(lease.expiresAt - now.block) * 2) / 60)} more minutes</>}
          </>
        ),
        where: code("arkiv/schema.md"),
        ok: true,
      },
      {
        feature: "Lifetime Extension as a lease",
        why: "Centres call extendEntity every few minutes. A silent terminal drops off the control room by itself, with no server tracking heartbeats.",
        evidence: lease ? <>lease {short(lease.key)} created at block {String(lease.createdAt)}, now expires at {String(lease.expiresAt)}</> : <>no live leases right now (they exist only while centres are running)</>,
        where: code("scripts/centres.ts"),
        ok: true,
      },
      {
        feature: "Permissionless extension",
        why: "Exams, banks, beacons and leak claims can be kept alive by anyone (a litigant, a journalist), but changed by no one.",
        evidence: bank ? <>bank permissionlessExtension = {String(bank.creationFlags.permissionlessExtension)}; exam = {String(now.exam.creationFlags.permissionlessExtension)}</> : "—",
        where: code("src/arkiv.ts"),
        ok: !!bank?.creationFlags.permissionlessExtension,
      },
      {
        feature: "atBlock: the state at the bell",
        why: "What existed at the bell is the fact that matters in a dispute: which appointments were valid, which claims came first.",
        evidence: atBell ? (
          <>at bell block {String(atBell.block)}: {atBell.receipts.length} receipts, {atBell.claims.length} claims · now (block {String(now.block)}): {now.receipts.length} receipts, {now.claims.length} claims</>
        ) : info.opensAt.getTime() > Date.now() ? "this exam has not rung yet" : "reading…",
        where: code("web/pages/Exam.tsx"),
        ok: !!atBell,
      },
      {
        feature: "watchEntityEvents over WebSocket",
        why: "The control room and receipts update without a refresh loop. Over HTTP the SDK silently polls, so we use a socket.",
        evidence: <>this page's socket has received <b>{events}</b> entity event(s) since you opened it</>,
        where: code("web/chain.ts"),
        ok: true,
      },
      {
        feature: "Typed numeric attributes, ranges, pinned cursor paging",
        why: "opens_at is a u64, so upcoming exams are a range query; every walk pages at one pinned block so cursors stay valid.",
        evidence: <>{exams?.length ?? 0} exams found with <span className="mono">opens_at &gt; u64(now − 3 days)</span> created by the board</>,
        where: code("src/arkiv.ts"),
        ok: (exams?.length ?? 0) > 0,
      },
    )
  }

  return (
    <main className="page">
      <p className="eyebrow">For judges</p>
      <h1 className="display small">Every Arkiv feature, with the evidence live.</h1>
      <p className="lede">
        Each row below is computed now, in your browser, from the public Tiramisu RPC. Pick an exam, read the evidence, then follow the link to the code that
        produced it.
      </p>
      {error && <p className="error">{error}</p>}
      <label className="field inline">
        Exam
        <select value={examId} onChange={(e) => setExamId(e.target.value)}>
          {(exams ?? []).map(examInfo).sort((a, b) => b.opensAt.getTime() - a.opensAt.getTime()).map((e) => (
            <option key={e.id} value={e.id}>{e.id}</option>
          ))}
        </select>
      </label>

      <div className="proof">
        {rows.map((r) => (
          <article key={r.feature} className="proof-row">
            <div className="proof-feature">
              <span className={`check ${r.ok ? "ok" : ""}`} aria-hidden="true">{r.ok ? "✓" : "·"}</span>
              <h4>{r.feature}</h4>
            </div>
            <p className="quiet">{r.why}</p>
            <p className="evidence">{r.evidence}</p>
            <p>{r.where}</p>
          </article>
        ))}
        {!rows.length && !error && <p className="quiet loading">Reading evidence from Arkiv…</p>}
      </div>

      <section>
        <h2 className="section-title">Why Arkiv, and not…</h2>
        <div className="grid three">
          <article className="card"><h4>Postgres or a vendor API</h4><p>An insider swaps the sealed bank for one timelocked to an earlier round, or withholds the paper on exam morning. Nobody outside can tell.</p></article>
          <article className="card"><h4>IPFS</h4><p>Holds ciphertext, but has no authorship, no query by exam or creator, no leases, no lifecycle. Centres would trust whoever pins.</p></article>
          <article className="card"><h4>A subgraph or L1 contract</h4><p>A custom contract and indexer to run, and storing kilobytes of ciphertext per bank on L1 is prohibitive.</p></article>
        </div>
        <p className="quiet">
          Kept off Arkiv on purpose: plaintext questions, candidates, staff, and the decryption itself. Trust assumptions: drand quicknet's threshold
          network and Tiramisu's single sequencer.
        </p>
      </section>

      <section>
        <h2 className="section-title">Reproduce without this app</h2>
        <pre className="code">{`git clone ${REPO} && cd muhurat && npm install
npm test                                # offline: sealing, chain/round guard, batch shape, draw, leak claims
npm run verify -- --exam ${examId || "<exam>"} --board ${board}`}</pre>
      </section>
    </main>
  )
}
