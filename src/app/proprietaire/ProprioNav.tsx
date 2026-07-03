"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Home, PlusCircle, Wallet, Users, Wrench, Banknote, User } from "lucide-react"

const DIFFUSEUR = [
  { href: "/proprietaire", label: "Tableau de bord", icon: LayoutDashboard, exact: true },
  { href: "/proprietaire/biens", label: "Mes biens", icon: Home },
  { href: "/publier", label: "Ajouter un bien", icon: PlusCircle },
  { href: "/client/profil", label: "Profil", icon: User },
]

const GERE = [
  { href: "/proprietaire", label: "Tableau de bord", icon: LayoutDashboard, exact: true },
  { href: "/proprietaire/biens", label: "Mes biens", icon: Home },
  { href: "/proprietaire/encaissements", label: "Encaissements", icon: Wallet },
  { href: "/proprietaire/locataires", label: "Locataires", icon: Users },
  { href: "/proprietaire/travaux", label: "Travaux", icon: Wrench },
  { href: "/proprietaire/versements", label: "Versements", icon: Banknote },
  { href: "/client/profil", label: "Profil", icon: User },
]

export default function ProprioNav({ managed }: { managed: boolean }) {
  const pathname = usePathname()
  const items = managed ? GERE : DIFFUSEUR
  return (
    <nav className="flex gap-1.5 overflow-x-auto pb-1">
      {items.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href)
        return (
          <Link key={href} href={href}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors border ${
              active ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
            }`}>
            <Icon className="w-4 h-4" /> {label}
          </Link>
        )
      })}
    </nav>
  )
}
