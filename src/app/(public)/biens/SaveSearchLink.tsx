"use client"

import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { BellPlus } from "lucide-react"

export default function SaveSearchLink() {
  const params = useSearchParams()
  const qs = params.toString()
  const href = `/mes-requetes/nouvelle${qs ? `?${qs}` : ""}`

  return (
    <Link href={href}
      className="inline-flex items-center gap-2 mt-6 bg-blue-700 text-white px-6 py-3 rounded-xl text-sm font-medium hover:bg-blue-800 transition-colors">
      <BellPlus className="w-4 h-4" />
      Sauvegarder ma recherche
    </Link>
  )
}
