"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Home } from "lucide-react"

/**
 * Après une décision, propose un retour à l'accueil et redirige automatiquement
 * au bout de `seconds` secondes (avec compte à rebours visible).
 */
export default function RedirectHome({ seconds = 6 }: { seconds?: number }) {
  const router = useRouter()
  const [left, setLeft] = useState(seconds)

  useEffect(() => {
    if (left <= 0) { router.push("/"); return }
    const t = setTimeout(() => setLeft(left - 1), 1000)
    return () => clearTimeout(t)
  }, [left, router])

  return (
    <div className="space-y-2 text-center pt-1">
      <Link
        href="/"
        className="w-full inline-flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-600 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
      >
        <Home className="w-4 h-4" /> Retour à l&apos;accueil
      </Link>
      <p className="text-xs text-gray-400">Redirection automatique dans {left} s…</p>
    </div>
  )
}
