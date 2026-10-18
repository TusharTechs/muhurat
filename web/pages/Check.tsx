import { useEffect, useState } from "react"
import { type Entity, leakClaimCreate, listExams } from "../../src/arkiv"
import { claimFingerprints } from "../../src/claims"
import { type LeakMatch, matchLeak } from "../../src/paper"
import { type Opened, boardFromUrl, examInfo, loadExam, openExam, publicClient } from "../chain"
import { BigCountdown } from "../components"
import { useT } from "../i18n"
import { connectWallet } from "../wallet"
import { Badge, Tx, friendly, ist, useNow } from "../ui"

export function CheckPage() {
  const board = boardFromUrl()
  const { t } = useT()
  const now = useNow()
  const params = new URLSearchParams(location.hash.split("?")[1] ?? "")
  const [exams, setExams] = useState<Entity[]>([])
  const [examId, setExamId] = useState(params.get("exam") ?? "")
  const [claim, setClaim] = useState("")
  const [ocr, setOcr] = useState<string>()
  const [opened, setOpened] = useState<Opened>()
  const [result, setResult] = useState<LeakMatch[]>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [filed, setFiled] = useState<string>()
  const [source, setSource] = useState("")

  useEffect(() => {
    listExams(publicClient, board, new Date(Date.now() - 3 * 86_400_000)).then((list) => {
      setExams(list)
      if (!examId && list.length) {
        const infos = list.map(examInfo).sort((a, b) => a.opensAt.getTime() - b.opensAt.getTime())
        setExamId((infos.find((e) => e.opensAt.getTime() > Date.now()) ?? infos[infos.length - 1]).id)
      }
    }, (e: Error) => setError(friendly(e)))
  }, [board, examId])

  const info = exams.map(examInfo).find((e) => e.id === examId)
  const sealed = info ? now < info.opensAt.getTime() : true
  const fingerprints = info && claim.trim() ? claimFingerprints(info.id, claim) : []

  /** OCR runs in the browser (Tesseract, English + Hindi): the screenshot never leaves the device. */
  async function readImage(file: File) {
    setOcr("Reading the screenshot on this device…")
    try {
      const { createWorker } = await import("tesseract.js")
      const worker = await createWorker(["eng", "hin"])
      const { data } = await worker.recognize(file)
      await worker.terminate()
      setClaim(data.text)
      setOcr(undefined)
    } catch (e) {
      setOcr(`Could not read the image: ${(e as Error).message}`)
    }
  }

  async function check() {
    if (!info) return
    setBusy(true)
    setError(undefined)
    try {
      const o = opened?.paper.exam === info.id ? opened : await openExam(await loadExam(publicClient, board, info.id))
      setOpened(o)
      setResult(matchLeak(claim, o.banks, o.paper))
    } catch (e) {
      setError(friendly(e as Error))
    } finally {
      setBusy(false)
    }
  }

  async function fileClaim() {
    if (!info) return
    setBusy(true)
    setError(undefined)
    try {
      const { wallet } = await connectWallet()
      const { txHash } = await wallet.createEntity(leakClaimCreate(info.id, info.opensAt, fingerprints, source.trim()))
      setFiled(txHash)
    } catch (e) {
      setError(friendly(e as Error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page narrow">
      <h1 className="display small">{t("check.title")}</h1>
      <p className="lede">{t("check.lede")}</p>

      <label className="field">
        Exam
        <select value={examId} onChange={(e) => { setExamId(e.target.value); setResult(undefined); setFiled(undefined) }}>
          {exams.map(examInfo).sort((a, b) => b.opensAt.getTime() - a.opensAt.getTime()).map((e) => (
            <option key={e.id} value={e.id}>{e.id} · {ist(e.opensAt)}{e.opensAt.getTime() > now ? " · sealed" : " · opened"}</option>
          ))}
        </select>
      </label>

      <label className="field">
        Claimed questions
        <textarea rows={8} value={claim} onChange={(e) => setClaim(e.target.value)} placeholder={"PAPER LEAKED 100% REAL ₹40,000\nQ1. …\nQ2. …"} />
      </label>
      <label className="field file">
        Or a screenshot (read on your device, English + Hindi)
        <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && readImage(e.target.files[0])} />
      </label>
      {ocr && <p className="quiet">{ocr}</p>}
      {error && <p className="error">{error}</p>}

      {info && sealed ? (
        <>
          <section className="verdict bad">
            <h2>{t("check.fakeTitle")}</h2>
            <p>
              <span className="mono">{info.id}</span> is sealed to drand round {info.round} and opens at {ist(info.opensAt)}. {t("check.fakeBody")}
            </p>
            <BigCountdown to={info.opensAt} now={now} />
            <p className="quiet">{t("check.report")}</p>
          </section>
          <section className="card file-claim">
            <h3>Think it might be real? File it as a sealed claim.</h3>
            <p className="quiet">
              Your browser turns the text into {fingerprints.length || "salted"} phrase fingerprints and files only those on Arkiv. Nobody can read them, because nobody has
              the questions to compare against until the bell. At the bell anyone can test your claim, and its block number proves it came first. Edited
              screenshots cannot do that.
            </p>
            <label className="field">
              Where did you see it? (public label, optional; no names or phone numbers)
              <input value={source} maxLength={80} onChange={(e) => setSource(e.target.value)} placeholder="e.g. Telegram channel selling a 'chemistry leak'" />
            </label>
            <button type="button" disabled={!fingerprints.length || busy} onClick={fileClaim}>{busy ? "Filing…" : "File sealed claim (MetaMask)"}</button>
            {filed && <p className="good-text">Filed · <Tx hash={filed} /> · it will be tested on the exam page at the bell.</p>}
          </section>
        </>
      ) : (
        <button type="button" disabled={!claim.trim() || busy} onClick={check}>{busy ? "Opening the exam…" : t("check.button")}</button>
      )}

      {result && (
        <section className={`verdict ${result.length ? "warn" : "good"}`}>
          <h2>{result.length ? `${result.length} line(s) match sealed questions` : "Nothing matches the sealed questions"}</h2>
          <ul>
            {result.map((m) => (
              <li key={m.claimed}>
                <Badge tone={m.onPaper ? "bad" : "warn"}>{m.onPaper ? "on the paper" : "in a bank, not drawn"}</Badge> <Badge>{m.section} setter</Badge>
                <p>“{m.claimed.slice(0, 140)}”</p>
                <p className="quiet">matches: {m.question.text} ({Math.round(m.score * 100)}%)</p>
              </li>
            ))}
          </ul>
          <p className="quiet">
            Text pasted after the bell proves nothing about when it leaked. Only a claim filed on Arkiv before the bell does: see the leak court on the
            exam page. A question that matched but was not drawn points at the setter whose bank it came from.
          </p>
        </section>
      )}
    </main>
  )
}
