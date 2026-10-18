import { createContext, useContext, useEffect, useState } from "react"

export type Lang = "en" | "hi"

const en = {
  "nav.exams": "Exams",
  "nav.check": "Leak checker",
  "nav.run": "Run your own",
  "nav.proof": "For judges",
  "nav.source": "Source",
  "hero.eyebrow": "For the 22 lakh students who sat NEET-UG twice in 2026",
  "hero.title1": "An exam paper that does not exist",
  "hero.title2": "until the bell rings.",
  "hero.lede":
    "Questions are sealed with drand timelock encryption and kept on Arkiv, the Web3 database, as records nobody owns. At the bell, a 48-byte key reaches the whole world at the same instant and every centre opens the same paper. Before that, nobody can: not the board, not the setters, not us.",
  "home.next": "Next bell",
  "home.last": "Last opened",
  "home.tryNow": "Try to open it now",
  "home.seePaper": "Open the paper yourself",
  "home.schedule": "Sealed in advance through judging week. Each one opens on its own.",
  "home.how": "How a paper is born",
  "exam.sealedTitle": "This paper does not exist yet.",
  "exam.sealedBody":
    "Its questions are sealed to drand round {round}. Until that round is published nobody can open them, not the board, not the setters, not us. Any “leaked paper” on sale right now is fake.",
  "exam.try": "Try to open it now",
  "exam.openedTitle": "Opened at the bell, in your browser.",
  "exam.opening": "The bell has rung. Fetching the round key and opening…",
  "exam.everyone": "Opens for everyone at the same instant",
  "exam.banks": "Sealed banks",
  "exam.control": "Control room",
  "exam.court": "Leak court",
  "exam.stateAtBell": "State at the bell",
  "check.title": "Is this “leaked paper” real?",
  "check.lede": "Paste the text of a paper someone is selling or forwarding, or upload a screenshot. The check runs in your browser against what is sealed on Arkiv.",
  "check.fakeTitle": "Fake. This paper cannot exist yet.",
  "check.fakeBody":
    "Until the bell nobody holds it: the questions are drawn at the bell from sealed banks, by randomness that does not exist yet. Whatever is being sold is made up. Do not pay.",
  "check.report": "Report it at cybercrime.gov.in or call 1930.",
  "check.button": "Check against the opened paper",
  "count.h": "hrs",
  "count.m": "min",
  "count.s": "sec",
  "count.d": "days",
} as const

type Key = keyof typeof en

const hi: Record<Key, string> = {
  "nav.exams": "परीक्षाएँ",
  "nav.check": "लीक जाँच",
  "nav.run": "अपनी परीक्षा",
  "nav.proof": "निर्णायकों के लिए",
  "nav.source": "कोड",
  "hero.eyebrow": "उन 22 लाख विद्यार्थियों के लिए जिन्होंने 2026 में NEET-UG दो बार दी",
  "hero.title1": "एक प्रश्नपत्र जो तब तक मौजूद ही नहीं है",
  "hero.title2": "जब तक घंटी नहीं बजती।",
  "hero.lede":
    "प्रश्न drand टाइमलॉक एन्क्रिप्शन से सील किए जाते हैं और Arkiv पर ऐसे रिकॉर्ड के रूप में रखे जाते हैं जिनका कोई मालिक नहीं। घंटी बजते ही 48-बाइट की एक कुंजी पूरी दुनिया तक एक साथ पहुँचती है और हर केंद्र एक ही प्रश्नपत्र खोलता है। उससे पहले कोई नहीं खोल सकता: न बोर्ड, न प्रश्नकर्ता, न हम।",
  "home.next": "अगली घंटी",
  "home.last": "पिछला खुला प्रश्नपत्र",
  "home.tryNow": "अभी खोलकर देखें",
  "home.seePaper": "प्रश्नपत्र खुद खोलें",
  "home.schedule": "निर्णय सप्ताह के लिए पहले से सील। हर प्रश्नपत्र अपने समय पर अपने आप खुलेगा।",
  "home.how": "प्रश्नपत्र कैसे जन्म लेता है",
  "exam.sealedTitle": "यह प्रश्नपत्र अभी मौजूद ही नहीं है।",
  "exam.sealedBody":
    "इसके प्रश्न drand राउंड {round} तक सील हैं। वह राउंड प्रकाशित होने तक इन्हें कोई नहीं खोल सकता, न बोर्ड, न प्रश्नकर्ता, न हम। अभी बिक रहा कोई भी “लीक पेपर” नकली है।",
  "exam.try": "अभी खोलकर देखें",
  "exam.openedTitle": "घंटी पर, आपके ब्राउज़र में खुला।",
  "exam.opening": "घंटी बज चुकी है। राउंड कुंजी लाकर प्रश्नपत्र खोला जा रहा है…",
  "exam.everyone": "सबके लिए एक ही पल में खुलेगा",
  "exam.banks": "सील प्रश्न-बैंक",
  "exam.control": "नियंत्रण कक्ष",
  "exam.court": "लीक अदालत",
  "exam.stateAtBell": "घंटी के समय की स्थिति",
  "check.title": "क्या यह “लीक पेपर” असली है?",
  "check.lede": "जो पेपर बेचा या फ़ॉरवर्ड किया जा रहा है उसका टेक्स्ट चिपकाएँ, या स्क्रीनशॉट डालें। जाँच आपके ब्राउज़र में Arkiv पर सील रिकॉर्ड से होती है।",
  "check.fakeTitle": "नकली। यह प्रश्नपत्र अभी मौजूद ही नहीं हो सकता।",
  "check.fakeBody":
    "घंटी से पहले यह किसी के पास नहीं है: प्रश्न घंटी के समय सील बैंकों से ऐसी यादृच्छिकता से चुने जाते हैं जो अभी बनी ही नहीं। जो बेचा जा रहा है वह गढ़ा हुआ है। पैसे न दें।",
  "check.report": "cybercrime.gov.in पर शिकायत करें या 1930 पर कॉल करें।",
  "check.button": "खुले प्रश्नपत्र से मिलान करें",
  "count.h": "घंटे",
  "count.m": "मिनट",
  "count.s": "सेकंड",
  "count.d": "दिन",
}

const dictionaries = { en, hi }
const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: "en", setLang: () => {} })

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    try {
      return (localStorage.getItem("muhurat.lang") as Lang) || "en"
    } catch {
      return "en"
    }
  })
  useEffect(() => {
    document.documentElement.lang = lang
    try {
      localStorage.setItem("muhurat.lang", lang)
    } catch {
      // private mode: the choice just isn't remembered
    }
  }, [lang])
  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>
}

export function useT() {
  const { lang, setLang } = useContext(LangContext)
  const t = (key: Key, vars: Record<string, string | number> = {}) =>
    (dictionaries[lang][key] ?? en[key]).replace(/\{(\w+)\}/g, (_, v) => String(vars[v] ?? ""))
  return { t, lang, setLang }
}
