"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Home, User } from "lucide-react"

const ITEMS = [
  { href: "/agent", label: "Tableau de bord", icon: LayoutDashboard, exact: true },
  { href: "/agent/annonces", label: "Mes annonces", icon: Home },
  { href: "/agent/profil", label: "Mon profil", icon: User },
]

export default function AgentNav() {
  const pathname = usePathname()
  return (
    <nav className="flex gap-1.5 overflow-x-auto pb-1">
      {ITEMS.map(({ href, label, icon: Icon, exact }) => {
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
