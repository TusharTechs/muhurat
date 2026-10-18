import { useState } from "react"
import type { Address, Hex } from "viem"
import { publishExam, publishSealedBank } from "../../src/arkiv"
import { QUICKNET, dateForRound, offlineClient, roundForDate } from "../../src/drand"
import { type Section, bankFor } from "../../src/questions"
import { seal } from "../../src/seal"
import { publicClient } from "../chain"
import { Tx, ist } from "../ui"
import { connectWallet } from "../wallet"

const SECTIONS: Section[] = ["biology", "chemistry", "physics"]

/** Run a whole exam from one MetaMask account: you are the board and every setter. */
export function RunPage() {
  const [account, setAccount] = useState<Address>()
  const [minutes, setMinutes] = useState(3)
  const [log, setLog] = useState<React.ReactNode[]>([])
  const [examId, setExamId] = useState<string>()
  const [busy, setBusy] = useState(false)
  const say = (line: React.ReactNode) => setLog((l) => [...l, line])

  const [wallet, setWallet] = useState<Awaited<ReturnType<typeof connectWallet>>["wallet"]>()

  async function connect() {
    try {
      const c = await connectWallet()
      setAccount(c.account)
      setWallet(c.wallet)
    } catch (e) {
      say((e as Error).message)
    }
  }

  async function run() {
    if (!wallet || !account) return
    setBusy(true)
    setLog([])
    try {
      const round = roundForDate(new Date(Date.now() + minutes * 60_000))
      const opensAt = dateForRound(round)
      const exam = `own-${account.slice(2, 8).toLowerCase()}-${round}`
      const chainHash: Hex = `0x${QUICKNET.hash}`
      say(`1/4 Publishing exam ${exam} and appointing yourself setter for 3 sections. Confirm in your wallet.`)
      const published = await publishExam(
        wallet,
        { exam, title: "Your own exam (synthetic questions)", round, chainHash, opensAt, sections: SECTIONS, perSection: 5 },
        SECTIONS.map((section) => ({ role: "setter" as const, member: account, section })),
      )
      say(<>Exam published · <Tx hash={published.txHash} /></>)
      for (const [i, section] of SECTIONS.entries()) {
        say(`${i + 2}/4 Sealing the ${section} bank in this browser and handing it to 0x…dEaD. Confirm in your wallet.`)
        const armored = await seal(new TextEncoder().encode(JSON.stringify(bankFor(exam, section))), round, offlineClient())
        const { txHash } = await publishSealedBank(publicClient, wallet, { exam, section, round, chainHash, opensAt, armored })
        say(<>{section} sealed · <Tx hash={txHash} /></>)
      }
      say(`Done. The paper opens at ${ist(opensAt)}. Until then nobody can read it, including you.`)
      setExamId(exam)
    } catch (err) {
      say(<span className="error">{(err as Error).message.split("\n")[0]}</span>)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page narrow">
      <h1 className="display small">Run your own exam</h1>
      <p className="lede">
        Act as the board and the setters from one wallet on Arkiv's Tiramisu testnet: publish an exam, seal three banks to a drand round a
        few minutes away, then watch it open. Needs test GLM from the <a href="https://hub.arkiv.network/faucet" target="_blank" rel="noreferrer">Arkiv faucet</a>.
        Four wallet confirmations.
      </p>
      <ol className="how compact">
        <li><span className="how-n">1</span><h4>Publish</h4><p>One transaction: the exam and your three setter appointments.</p></li>
        <li><span className="how-n">2</span><h4>Seal ×3</h4><p>Each bank is timelocked in this browser, created readonly and handed to 0x…dEaD in the same transaction.</p></li>
        <li><span className="how-n">3</span><h4>Wait</h4><p>Try to open it early on the exam page. drand refuses: the key does not exist yet.</p></li>
        <li><span className="how-n">4</span><h4>The bell</h4><p>Your browser opens the paper the moment the round is published.</p></li>
      </ol>
      {!account ? (
        <button type="button" onClick={connect}>Connect wallet</button>
      ) : (
        <>
          <p className="quiet">Connected <span className="mono">{account}</span></p>
          <label className="field">
            Bell in (minutes)
            <input type="number" min={1} max={1440} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
          </label>
          <button type="button" disabled={busy} onClick={run}>{busy ? "Working…" : "Publish and seal"}</button>
        </>
      )}
      <ol className="log">{log.map((l, i) => <li key={i}>{l}</li>)}</ol>
      {examId && account && <p><a className="cta" href={`#/exam/${examId}?board=${account}`}>Watch your exam →</a></p>}
    </main>
  )
}
