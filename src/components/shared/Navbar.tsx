"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Menu, X, Search, PlusCircle, User, KeyRound, LogOut, LayoutDashboard } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { postLoginPath } from "@/lib/account-actions"

interface Session {
  nom: string
  espaceHref: string
}

export default function Navbar() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [checked, setChecked] = useState(false)

  // Vérifie la session côté client (Navbar est rendu sur des pages publiques
  // Server Components qui ne connaissent pas l'utilisateur). Reflète l'état
  // réel de connexion pour TOUS les types de comptes (client, propriétaire,
  // agent, admin…), sinon le menu affiche « Connexion » même connecté.
  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled) return
      if (!user) { setSession(null); setChecked(true); return }

      const { data: prof } = await supabase.from("profiles").select("nom, prenom").eq("id", user.id).maybeSingle()
      const p = prof as { nom: string | null; prenom: string | null } | null
      const nom = `${p?.prenom || ""} ${p?.nom || ""}`.trim() || user.email?.split("@")[0] || "Mon compte"
      const espaceHref = await postLoginPath().catch(() => "/client/mes-requetes")
      if (!cancelled) { setSession({ nom, espaceHref }); setChecked(true) }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  async function logout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    setSession(null)
    setOpen(false)
    router.push("/")
    router.refresh()
  }

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark.svg" alt="Inaya Immo" className="w-9 h-9 shadow-sm rounded-xl" />
            <div className="leading-tight">
              <span className="font-bold text-lg text-blue-700">Inaya</span>
              <span className="font-bold text-lg text-amber-500"> Immo</span>
            </div>
          </Link>

          {/* Nav desktop */}
          <div className="hidden md:flex items-center gap-6">
            <Link href="/biens?type=location" className="text-sm text-gray-800 hover:text-blue-700 transition-colors font-semibold">
              Location
            </Link>
            <Link href="/biens?type=vente" className="text-sm text-gray-800 hover:text-blue-700 transition-colors font-semibold">
              Vente
            </Link>
            <Link href="/residences" className="text-sm text-teal-700 hover:text-teal-800 transition-colors font-semibold">
              Résidences meublées
            </Link>
            <Link href="/biens" className="text-sm text-gray-800 hover:text-blue-700 transition-colors font-semibold">
              Toutes les annonces
            </Link>
          </div>

          {/* Actions desktop */}
          <div className="hidden md:flex items-center gap-3">
            <Link href="/biens" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-700 transition-colors px-2 py-2">
              <Search className="w-4 h-4" />
            </Link>
            {checked && session ? (
              <div className="relative group">
                <button className="flex items-center gap-2 text-sm text-gray-700 hover:text-blue-700 transition-colors px-3 py-2 font-medium">
                  <User className="w-4 h-4" /> {session.nom}
                </button>
                <div className="absolute right-0 top-full pt-1 hidden group-hover:block group-focus-within:block z-10">
                  <div className="bg-white border border-gray-100 rounded-xl shadow-lg py-1.5 w-48">
                    <Link href={session.espaceHref} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                      <LayoutDashboard className="w-4 h-4 text-gray-400" /> Mon espace
                    </Link>
                    <Link href="/mon-compte" className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                      <KeyRound className="w-4 h-4 text-gray-400" /> Mon compte
                    </Link>
                    <button onClick={logout} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                      <LogOut className="w-4 h-4" /> Déconnexion
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <Link href="/connexion" className="text-sm text-gray-600 hover:text-blue-700 transition-colors px-3 py-2 font-medium">
                Connexion
              </Link>
            )}
            <Link href="/publier"
              className="flex items-center gap-1.5 text-sm bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-xl transition-colors font-semibold shadow-sm">
              <PlusCircle className="w-4 h-4" />
              Publier une annonce
            </Link>
          </div>

          {/* Burger mobile */}
          <button className="md:hidden p-2 text-gray-500" onClick={() => setOpen(!open)}>
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Menu mobile */}
      {open && (
        <div className="md:hidden border-t border-gray-100 bg-white px-4 py-4 flex flex-col gap-3">
          <Link href="/biens?type=location" className="text-sm text-gray-700 py-2 font-medium" onClick={() => setOpen(false)}>Location</Link>
          <Link href="/biens?type=vente" className="text-sm text-gray-700 py-2 font-medium" onClick={() => setOpen(false)}>Vente</Link>
          <Link href="/residences" className="text-sm text-gray-700 py-2 font-medium" onClick={() => setOpen(false)}>Résidences meublées</Link>
          <Link href="/biens" className="text-sm text-gray-700 py-2 font-medium" onClick={() => setOpen(false)}>Toutes les annonces</Link>
          <div className="border-t border-gray-100 pt-3 flex flex-col gap-2">
            <Link href="/publier"
              className="flex items-center justify-center gap-1.5 text-sm bg-amber-500 text-white py-2.5 text-center rounded-xl font-semibold"
              onClick={() => setOpen(false)}>
              <PlusCircle className="w-4 h-4" />
              Publier une annonce
            </Link>
            {checked && session ? (
              <>
                <p className="text-xs text-gray-400 text-center pt-1">Connecté en tant que <strong className="text-gray-600">{session.nom}</strong></p>
                <Link href={session.espaceHref} className="flex items-center justify-center gap-1.5 text-sm text-gray-700 py-2 border border-gray-200 rounded-xl font-medium" onClick={() => setOpen(false)}>
                  <LayoutDashboard className="w-4 h-4" /> Mon espace
                </Link>
                <Link href="/mon-compte" className="flex items-center justify-center gap-1.5 text-sm text-gray-700 py-2 border border-gray-200 rounded-xl font-medium" onClick={() => setOpen(false)}>
                  <KeyRound className="w-4 h-4" /> Mon compte
                </Link>
                <button onClick={logout} className="flex items-center justify-center gap-1.5 text-sm text-red-600 py-2 border border-red-100 rounded-xl font-medium">
                  <LogOut className="w-4 h-4" /> Déconnexion
                </button>
              </>
            ) : (
              <>
                <Link href="/connexion" className="text-sm text-gray-600 py-2 text-center border border-gray-200 rounded-xl" onClick={() => setOpen(false)}>Connexion</Link>
                <Link href="/inscription" className="text-sm bg-blue-700 text-white py-2 text-center rounded-xl font-medium" onClick={() => setOpen(false)}>S&apos;inscrire</Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}
