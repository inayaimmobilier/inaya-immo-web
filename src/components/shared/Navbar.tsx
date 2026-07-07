"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { Menu, X, Search, PlusCircle } from "lucide-react"

const NAV_LINKS = [
  { href: "/biens?type=location", label: "Location" },
  { href: "/biens?type=vente", label: "Vente" },
  { href: "/residences", label: "Résidences meublées" },
  { href: "/biens", label: "Toutes les annonces" },
]

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  return (
    <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark.svg" alt="Inaya Immo" className="w-9 h-9 shadow-sm rounded-xl" />
            <div className="leading-tight hidden sm:block">
              <span className="font-bold text-lg text-blue-700">Inaya</span>
              <span className="font-bold text-lg text-amber-500"> Immo</span>
            </div>
          </Link>

          {/* Nav desktop */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => {
              const isActive = pathname.startsWith(link.href.split("?")[0])
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-sm px-3 py-2 rounded-lg font-medium transition-colors ${
                    isActive
                      ? "text-blue-700 bg-blue-50"
                      : "text-gray-600 hover:text-blue-700 hover:bg-gray-50"
                  }`}
                >
                  {link.label}
                </Link>
              )
            })}
          </div>

          {/* Actions desktop */}
          <div className="hidden md:flex items-center gap-2">
            <Link
              href="/biens"
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors p-2"
              aria-label="Rechercher"
            >
              <Search className="w-4 h-4" />
            </Link>
            <Link
              href="/connexion"
              className="text-sm text-gray-600 hover:text-blue-700 transition-colors px-3 py-2 rounded-lg font-medium"
            >
              Connexion
            </Link>
            <Link
              href="/inscription"
              className="text-sm text-blue-700 hover:bg-blue-50 transition-colors px-3 py-2 rounded-lg font-medium"
            >
              S&apos;inscrire
            </Link>
            <Link
              href="/publier"
              className="flex items-center gap-1.5 text-sm bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-xl transition-all font-semibold shadow-sm hover:shadow-md active:scale-95"
            >
              <PlusCircle className="w-4 h-4" />
              Publier
            </Link>
          </div>

          {/* Burger mobile */}
          <button
            className="md:hidden p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            onClick={() => setOpen(!open)}
            aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Menu mobile avec animation */}
      <div
        className={`md:hidden border-t border-gray-100 bg-white overflow-hidden transition-all duration-300 ${
          open ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-4 py-4 flex flex-col gap-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-gray-700 py-2.5 px-3 rounded-lg hover:bg-gray-50 font-medium"
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <div className="border-t border-gray-100 pt-3 mt-2 flex flex-col gap-2">
            <Link
              href="/publier"
              className="flex items-center justify-center gap-1.5 text-sm bg-amber-500 text-white py-2.5 rounded-xl font-semibold active:scale-[0.98] transition-transform"
              onClick={() => setOpen(false)}
            >
              <PlusCircle className="w-4 h-4" />
              Publier une annonce
            </Link>
            <div className="flex gap-2">
              <Link
                href="/connexion"
                className="flex-1 text-sm text-gray-600 py-2.5 text-center border border-gray-200 rounded-xl font-medium"
                onClick={() => setOpen(false)}
              >
                Connexion
              </Link>
              <Link
                href="/inscription"
                className="flex-1 text-sm bg-blue-700 text-white py-2.5 text-center rounded-xl font-medium"
                onClick={() => setOpen(false)}
              >
                S&apos;inscrire
              </Link>
            </div>
          </div>
        </div>
      </div>
    </nav>
  )
}
