"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Cookie } from "lucide-react"
import { getConsent, setConsent } from "@/lib/analytics"

/**
 * Bandeau de consentement cookies. Tant que le visiteur n'a pas répondu, le Pixel
 * Meta (cookies tiers) N'EST PAS chargé. « Accepter » l'active ; « Refuser » ne
 * dépose aucun cookie de suivi. Le choix est mémorisé (localStorage).
 */
export default function CookieConsent() {
  const [show, setShow] = useState(false)

  useEffect(() => { setShow(getConsent() === null) }, [])

  if (!show) return null

  function choose(v: "granted" | "denied") {
    setConsent(v)
    setShow(false)
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] p-3 sm:p-4">
      <div className="mx-auto max-w-3xl bg-white border border-gray-200 shadow-lg rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-start gap-3 flex-1">
          <Cookie className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-gray-600 leading-relaxed">
            Nous utilisons des cookies de mesure d&apos;audience pour améliorer votre expérience et nos annonces.
            {" "}
            <Link href="/conditions" className="text-blue-700 underline underline-offset-2 hover:text-blue-800">En savoir plus</Link>.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => choose("denied")}
            className="text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-2 rounded-xl border border-gray-200 hover:bg-gray-50">
            Refuser
          </button>
          <button onClick={() => choose("granted")}
            className="text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-xl">
            Accepter
          </button>
        </div>
      </div>
    </div>
  )
}
