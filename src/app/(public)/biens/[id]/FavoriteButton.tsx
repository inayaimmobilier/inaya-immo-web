"use client"

import { useState, useTransition } from "react"
import { Heart, Loader2 } from "lucide-react"
import { toggleFavorite } from "@/app/client/actions"
import QuickSignupModal from "./QuickSignupModal"

export default function FavoriteButton({ propertyId, initialActive, loggedIn }: {
  propertyId: string; initialActive: boolean; loggedIn: boolean
}) {
  const [active, setActive] = useState(initialActive)
  const [authed, setAuthed] = useState(loggedIn)
  const [signupOpen, setSignupOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function save() {
    const next = !active
    setActive(next)
    startTransition(async () => {
      const res = await toggleFavorite(propertyId)
      if (!res.ok) setActive(!next)
      else setActive(res.active ?? next)
    })
  }

  function onClick() {
    if (!authed) { setSignupOpen(true); return }
    save()
  }

  // Compte créé via le modal → on est désormais connecté, on enchaîne sur la sauvegarde.
  function onSignedUp() {
    setSignupOpen(false)
    setAuthed(true)
    setActive(true)
    startTransition(async () => {
      const res = await toggleFavorite(propertyId)
      if (!res.ok) setActive(false)
      else setActive(res.active ?? true)
    })
  }

  return (
    <>
      <button
        onClick={onClick}
        disabled={pending}
        title={active ? "Retirer des favoris" : "Ajouter aux favoris"}
        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
          active ? "bg-red-50 border-red-200 text-red-600" : "bg-white border-gray-200 text-gray-600 hover:border-red-300"
        }`}
      >
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Heart className={`w-4 h-4 ${active ? "fill-red-500 text-red-500" : ""}`} />}
        {active ? "Sauvegardé" : "Sauvegarder"}
      </button>

      <QuickSignupModal
        open={signupOpen}
        onClose={() => setSignupOpen(false)}
        onSuccess={onSignedUp}
        redirectTo={`/biens/${propertyId}`}
      />
    </>
  )
}
