"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Search, MessageSquare, Heart, User } from "lucide-react"
import { cn } from "@/lib/utils"

const TABS = [
  { href: "/client/mes-requetes", label: "Mes recherches", icon: Search },
  { href: "/client/mes-demandes", label: "Mes demandes", icon: MessageSquare },
  { href: "/client/favoris", label: "Favoris", icon: Heart },
  { href: "/client/profil", label: "Profil", icon: User },
]

export default function ClientNav() {
  const pathname = usePathname()
  return (
    <nav className="flex gap-2 overflow-x-auto">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/")
        return (
          <Link key={href} href={href}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors",
              active ? "bg-blue-700 text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-blue-300",
            )}>
            <Icon className="w-4 h-4" /> {label}
          </Link>
        )
      })}
    </nav>
  )
}
