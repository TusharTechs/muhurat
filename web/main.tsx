import { Component, StrictMode, useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { LangProvider, useT } from "./i18n"
import { CheckPage } from "./pages/Check"
import { ExamPage } from "./pages/Exam"
import { HomePage } from "./pages/Home"
import { ProofPage } from "./pages/Proof"
import { RunPage } from "./pages/Run"
import { ringBell, setSoundEnabled, soundEnabled } from "./sound"
import "./fonts"
import "./styles.css"

const REPO = (import.meta.env.VITE_REPO_URL as string | undefined) || "https://github.com"

function useRoute() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const onChange = () => {
      setHash(location.hash)
      window.scrollTo(0, 0)
    }
    window.addEventListener("hashchange", onChange)
    return () => window.removeEventListener("hashchange", onChange)
  }, [])
  return hash.replace(/^#\/?/, "").split("?")[0].split("/")
}

function SoundToggle() {
  const [on, setOn] = useState(soundEnabled)
  return (
    <button
      type="button"
      className={`icon ${on ? "on" : ""}`}
      aria-pressed={on}
      title={on ? "Bell sound on" : "Ring a bell when a paper opens"}
      onClick={() => {
        setSoundEnabled(!on)
        setOn(!on)
        if (!on) ringBell()
      }}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M12 3a5 5 0 0 0-5 5v3.5L5 15h14l-2-3.5V8a5 5 0 0 0-5-5Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M10 18a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.6" />
        {!on && <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.6" />}
      </svg>
    </button>
  )
}

/** Data on Arkiv comes from anyone; if something still slips past validation, fail one view, not the app. */
class Boundary extends Component<{ children: React.ReactNode }, { failed?: string }> {
  state: { failed?: string } = {}
  static getDerivedStateFromError(error: Error) {
    return { failed: error.message }
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="page">
        <p className="error">This view hit unexpected data and stopped: {this.state.failed}</p>
        <button type="button" onClick={() => location.reload()}>Reload</button>
      </main>
    )
  }
}

function App() {
  const [page, arg] = useRoute()
  const { t, lang, setLang } = useT()
  const link = (href: string, label: string, active: boolean) => (
    <a href={href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
      {label}
    </a>
  )
  return (
    <>
      <nav className="nav">
        <a href="#/" className="brand" aria-label="Muhurat home">
          <span className="deva">मुहूर्त</span>
          <span>Muhurat</span>
        </a>
        <div className="links">
          {link("#/", t("nav.exams"), !page || page === "exam")}
          {link("#/check", t("nav.check"), page === "check")}
          {link("#/run", t("nav.run"), page === "run")}
          {link("#/proof", t("nav.proof"), page === "proof")}
          <a href={REPO} target="_blank" rel="noreferrer">{t("nav.source")}</a>
          <SoundToggle />
          <button type="button" className="lang" onClick={() => setLang(lang === "en" ? "hi" : "en")} aria-label="Switch language">
            {lang === "en" ? "हिंदी" : "English"}
          </button>
        </div>
      </nav>
      <Boundary key={location.hash}>
      {page === "exam" && arg ? (
        <ExamPage id={arg} key={location.hash} />
      ) : page === "check" ? (
        <CheckPage />
      ) : page === "run" ? (
        <RunPage />
      ) : page === "proof" ? (
        <ProofPage />
      ) : (
        <HomePage />
      )}
      </Boundary>
      <footer className="footer">
        <div>
          <span className="deva">मुहूर्त</span> Built on Arkiv, the Web3 database (Tiramisu testnet), and drand quicknet, for Arkiv: Global Tour Stop on the road to Devcon 8 Mumbai.
        </div>
        <div className="quiet small">
          All questions are synthetic demo content written for this project. No personal data is stored anywhere. MIT licence ·{" "}
          <a href={`${REPO}/blob/main/arkiv/schema.md`} target="_blank" rel="noreferrer">data contract</a> ·{" "}
          <a href={`${REPO}/blob/main/arkiv/friction.md`} target="_blank" rel="noreferrer">friction report</a>
        </div>
      </footer>
    </>
  )
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LangProvider>
      <App />
    </LangProvider>
  </StrictMode>,
)
