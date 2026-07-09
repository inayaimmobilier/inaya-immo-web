"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import {
  LayoutDashboard, Home, Users, MessageSquare, Wallet,
  Settings, ChevronLeft, ChevronRight, LogOut,
  Bell, Smartphone, TrendingUp, MapPin, Megaphone, Sofa, Building2, HandCoins, Clock, Star, UserCircle
} from "lucide-react"
import { cn } from "@/lib/utils"

const NAV = [
  { href: "/admin/dashboard",     icon: LayoutDashboard, label: "Dashboard",        roles: ["super_admin","admin","moderateur","agent"] },
  { href: "/agent",               icon: UserCircle,      label: "Mon espace agent", roles: ["agent"] },
  { href: "/admin/annonces",      icon: Home,            label: "Annonces",         roles: ["super_admin","admin","moderateur","agent"] },
  { href: "/admin/residences",    icon: Sofa,            label: "Résidences",       roles: ["super_admin","admin","moderateur","agent"] },
  { href: "/admin/expiration",    icon: Clock,           label: "Durée des annonces", roles: ["super_admin","admin"] },
  { href: "/admin/leads",         icon: MessageSquare,   label: "Leads",            roles: ["super_admin","admin","agent"] },
  { href: "/admin/agents",        icon: TrendingUp,      label: "Agents",           roles: ["super_admin","admin"] },
  { href: "/admin/gestion",       icon: Building2,       label: "Gestion locative", roles: ["super_admin","admin","moderateur","comptable"] },
  { href: "/admin/apports",       icon: HandCoins,       label: "Apports",          roles: ["super_admin","admin","comptable"] },
  { href: "/admin/transactions",  icon: Wallet,          label: "Transactions",     roles: ["super_admin","admin"] },
  { href: "/admin/commissions",   icon: TrendingUp,      label: "Commissions",      roles: ["super_admin","admin"] },
  { href: "/admin/utilisateurs",  icon: Users,           label: "Utilisateurs",     roles: ["super_admin","admin"] },
  { href: "/admin/whatsapp",      icon: Smartphone,      label: "WhatsApp",         roles: ["super_admin","admin"] },
  { href: "/admin/zones",         icon: MapPin,          label: "Zones",            roles: ["super_admin","admin"] },
  { href: "/admin/services",      icon: Megaphone,       label: "Services",         roles: ["super_admin","admin"] },
  { href: "/admin/temoignages",   icon: Star,            label: "Avis",             roles: ["super_admin","admin","moderateur"] },
  { href: "/admin/parametres",    icon: Settings,        label: "Paramètres",       roles: ["super_admin","admin"] },
]

interface Props {
  role: string
  nom: string
  residenceAlerts?: number
  userId?: string
  telegramChatId?: string | null
  botUsername?: string
}

export default function AdminSidebar({ role, nom, residenceAlerts = 0, userId, telegramChatId, botUsername }: Props) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  const links = NAV.filter(n => n.roles.includes(role))

  return (
    <aside className={cn(
      "bg-gray-900 text-white flex flex-col transition-all duration-200 sticky top-0 h-screen z-40",
      collapsed ? "w-16" : "w-56"
    )}>
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-16 border-b border-gray-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-mark.svg" alt="Inaya Immo" className="w-8 h-8 rounded-lg flex-shrink-0" />
        {!collapsed && (
          <span className="font-bold text-sm leading-tight">
            <span className="text-blue-400">Inaya</span>
            <span className="text-amber-400"> Immo</span>
            <br />
            <span className="text-gray-400 font-normal text-xs">Back-office</span>
          </span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto p-1 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors flex-shrink-0"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {links.map(({ href, icon: Icon, label }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={cn(
                "relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                active
                  ? "bg-blue-600 text-white"
                  : "text-gray-400 hover:bg-gray-800 hover:text-white"
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span>{label}</span>}
              {href === "/admin/residences" && residenceAlerts > 0 && (
                <span className={cn(
                  "ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold",
                  collapsed && "absolute top-1.5 right-1.5"
                )}>
                  {residenceAlerts}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Profil & déconnexion */}
      <div className="border-t border-gray-800 p-3 space-y-1">
        {!collapsed && (
          <div className="px-3 py-2">
            <p className="text-xs text-gray-400 truncate">{nom}</p>
            <p className="text-xs text-blue-400 font-medium capitalize">{role.replace("_"," ")}</p>
          </div>
        )}
        {/* Connexion Telegram — visible pour tous les agents/staff si bot configuré */}
        {botUsername && userId && !collapsed && (
          telegramChatId
            ? <div className="px-3 py-1.5 flex items-center gap-2 text-xs text-sky-400">
                <span>✈</span> <span>Telegram connecté</span>
              </div>
            : <a
                href={`https://t.me/${botUsername}?start=${userId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-sky-400 hover:bg-gray-800 transition-colors"
              >
                <span>✈</span> <span>Connecter Telegram</span>
              </a>
        )}
        <Link
          href="/admin/notifications"
          title={collapsed ? "Notifications" : undefined}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <Bell className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Notifications</span>}
        </Link>
        <form action="/api/auth/signout" method="post">
          <button
            type="submit"
            title={collapsed ? "Déconnexion" : undefined}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-400 hover:bg-red-900/40 hover:text-red-400 transition-colors"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>Déconnexion</span>}
          </button>
        </form>
      </div>
    </aside>
  )
}
