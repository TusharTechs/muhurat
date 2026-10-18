import { useEffect, useState } from "react"
import { EXPLORER } from "./chain"

export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

export const short = (hex: string, n = 6) => (hex.length > 2 * n + 2 ? `${hex.slice(0, n + 2)}…${hex.slice(-n + 2)}` : hex)

export function Addr({ value, label }: { value: string; label?: string }) {
  return (
    <a className="mono addr" href={`${EXPLORER}/address/${value}`} target="_blank" rel="noreferrer" title={value}>
      {label ?? short(value)}
    </a>
  )
}

export function Tx({ hash, children }: { hash: string; children?: React.ReactNode }) {
  return (
    <a className="mono" href={`${EXPLORER}/tx/${hash}`} target="_blank" rel="noreferrer">
      {children ?? short(hash)}
    </a>
  )
}

export function Badge({ tone = "quiet", children, title }: { tone?: "quiet" | "good" | "warn" | "bad" | "accent"; children: React.ReactNode; title?: string }) {
  return (
    <span className={`badge ${tone}`} title={title}>
      {children}
    </span>
  )
}

const pad = (n: number) => String(n).padStart(2, "0")

export function Countdown({ to, now }: { to: Date; now: number }) {
  const left = Math.max(0, Math.floor((to.getTime() - now) / 1000))
  const d = Math.floor(left / 86400)
  const h = Math.floor((left % 86400) / 3600)
  const m = Math.floor((left % 3600) / 60)
  const s = left % 60
  return (
    <span className="countdown mono">
      {d > 0 && <>{d}d </>}
      {pad(h)}:{pad(m)}:{pad(s)}
    </span>
  )
}

export const ist = (d: Date) =>
  d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) + " IST"

export function Lock() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <rect x="5" y="10.5" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

/** A failed read, said plainly: the RPC's raw error is long and names internals. */
export const friendly = (err: Error) =>
  /ANON_COST_LIMITED|Status: 429/.test(err.message)
    ? "Arkiv's public RPC is rate-limiting this network for a minute. Showing the last state; it will refresh by itself."
    : /Failed to fetch|HTTP request failed|ERR_|NetworkError/.test(err.message)
    ? "Couldn't reach Arkiv's Tiramisu RPC. Check your connection and reload."
    : err.message.split("\n")[0]
