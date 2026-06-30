"use client"

import Link from "next/link"
import { useState } from "react"
import { Menu, X, Home, Search, PlusCircle } from "lucide-react"

export default function Navbar() {
  const [open, setOpen] = useState(false)

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-blue-700 rounded-xl flex items-center justify-center shadow-sm">
              <Home className="w-5 h-5 text-white" />
            </div>
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
            <Link href="/connexion" className="text-sm text-gray-600 hover:text-blue-700 transition-colors px-3 py-2 font-medium">
              Connexion
            </Link>
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
            <Link href="/connexion" className="text-sm text-gray-600 py-2 text-center border border-gray-200 rounded-xl" onClick={() => setOpen(false)}>Connexion</Link>
            <Link href="/inscription" className="text-sm bg-blue-700 text-white py-2 text-center rounded-xl font-medium" onClick={() => setOpen(false)}>S&apos;inscrire</Link>
          </div>
        </div>
      )}
    </nav>
  )
}
