"use client"

import { useState, useRef, useEffect } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { MessageCircle, X, Send, Loader2 } from "lucide-react"

interface Msg { role: "user" | "assistant"; text: string }

const WELCOME: Msg = {
  role: "assistant",
  text: "Bonjour 👋 Je suis l'assistant Inaya. Dites-moi ce que vous cherchez et je vous propose des annonces adaptées.",
}

const SUGGESTIONS = [
  "Louer à Bouaké",
  "Acheter une maison",
  "Studio meublé (court séjour)",
  "Terrain à vendre",
]

// Rend un texte avec liens markdown [libellé](url) cliquables (liens internes uniquement).
// onLinkClick : appelé au clic sur une annonce → ferme l'assistant pour laisser
// place à la page du bien.
function renderText(text: string, onLinkClick?: () => void) {
  const parts: React.ReactNode[] = []
  const re = /\[([^\]]+)\]\((\/[^)]+)\)/g
  let last = 0, m: RegExpExecArray | null, key = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    parts.push(
      <Link key={key++} href={m[2]} onClick={onLinkClick}
        className="text-blue-700 font-medium underline underline-offset-2 hover:text-blue-800">
        {m[1]}
      </Link>,
    )
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

export default function ChatWidget() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([WELCOME])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, open])

  // Masqué sur le back-office et les pages d'authentification.
  if (pathname?.startsWith("/admin") || pathname?.startsWith("/connexion") || pathname?.startsWith("/inscription")) {
    return null
  }

  async function send(preset?: string) {
    const text = (preset ?? input).trim()
    if (!text || loading) return
    const next = [...messages, { role: "user" as const, text }]
    setMessages(next)
    setInput("")
    setLoading(true)
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next.filter(m => m !== WELCOME) }),
      })
      const data = await res.json()
      setMessages([...next, { role: "assistant", text: data.reply ?? "…" }])
    } catch {
      setMessages([...next, { role: "assistant", text: "Connexion impossible. Réessayez." }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Bouton flottant */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 bg-blue-700 text-white px-4 py-3 rounded-full shadow-lg hover:bg-blue-600 transition-colors"
          aria-label="Ouvrir l'assistant"
        >
          <MessageCircle className="w-5 h-5" />
          <span className="text-sm font-semibold hidden sm:inline">Assistant Inaya</span>
        </button>
      )}

      {/* Panneau de chat — z au-dessus de la navbar (z-50) pour rester fermable en plein écran mobile */}
      {open && (
        <div className="fixed z-[60] bg-white shadow-2xl border border-gray-100 flex flex-col overflow-hidden inset-2 rounded-2xl sm:inset-auto sm:bottom-5 sm:right-5 sm:w-96 sm:h-[32rem] sm:max-h-[80vh]">
          <div className="flex items-center justify-between px-4 py-3 bg-blue-700 text-white shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-mark.svg" alt="" className="w-7 h-7 rounded-lg ring-1 ring-white/25 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight truncate">Assistant Inaya</p>
                <p className="text-[11px] text-blue-100 leading-tight truncate">Trouvez votre bien en discutant</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Fermer l'assistant"
              className="shrink-0 -mr-1 p-2 rounded-lg text-blue-100 hover:text-white hover:bg-white/10 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-gray-50">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-line leading-relaxed ${
                  m.role === "user" ? "bg-blue-700 text-white rounded-br-sm" : "bg-white border border-gray-100 text-gray-800 rounded-bl-sm"
                }`}>
                  {m.role === "assistant" ? renderText(m.text, () => setOpen(false)) : m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-3 py-2">
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                </div>
              </div>
            )}

            {/* Suggestions de démarrage (uniquement au début de la conversation) */}
            {messages.length === 1 && !loading && (
              <div className="flex flex-wrap gap-2 pt-1">
                {SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => send(s)}
                    className="text-xs font-medium text-blue-700 bg-white border border-blue-200 rounded-full px-3 py-1.5 hover:bg-blue-50 transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 p-2.5 flex items-end gap-2 bg-white">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }}
              rows={1}
              placeholder="Votre message…"
              className="flex-1 resize-none max-h-24 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400"
            />
            <button
              onClick={() => send()}
              disabled={loading || !input.trim()}
              className="flex-shrink-0 w-9 h-9 flex items-center justify-center bg-blue-700 text-white rounded-xl hover:bg-blue-600 transition-colors disabled:opacity-50"
              aria-label="Envoyer"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
