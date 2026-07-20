"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { ArrowRight, Megaphone, ChevronLeft, ChevronRight } from "lucide-react"

// ============================================================================
// Composants publics d'affichage des espaces publicitaires.
// Fetch automatique via /api/ads?placement=<placement>.
// 4 formats : hero (rectangle), grid (petits carrés), ticker (bandeau défilant),
// carousel (rotation auto entre plusieurs items).
// ============================================================================

export interface AdItem {
  id: string
  titre: string
  sous_titre: string | null
  description: string | null
  cta_label: string | null
  cta_lien: string | null
  image_url: string | null
  video_url: string | null
  couleur: string
  icone: string
  property_id: string | null
  property_titre: string | null
  property_quartier: string | null
  property_prix: number | null
}

interface AdSpacePayload {
  space: { slug: string; nom: string; format: string; nb_slots: number; rotation_delay_sec: number }
  items: AdItem[]
}

const COULEURS: Record<string, { bg: string; badge: string; btn: string; ring: string }> = {
  blue:    { bg: "from-blue-600 to-blue-800",       badge: "bg-blue-100 text-blue-700",     btn: "bg-white text-blue-700 hover:bg-blue-50",         ring: "ring-blue-200" },
  amber:   { bg: "from-amber-500 to-orange-600",     badge: "bg-amber-100 text-amber-700",   btn: "bg-white text-amber-700 hover:bg-amber-50",       ring: "ring-amber-200" },
  emerald: { bg: "from-emerald-600 to-teal-700",     badge: "bg-emerald-100 text-emerald-700", btn: "bg-white text-emerald-700 hover:bg-emerald-50", ring: "ring-emerald-200" },
  purple:  { bg: "from-purple-600 to-fuchsia-700",   badge: "bg-purple-100 text-purple-700", btn: "bg-white text-purple-700 hover:bg-purple-50",     ring: "ring-purple-200" },
  rose:    { bg: "from-rose-600 to-pink-700",        badge: "bg-rose-100 text-rose-700",     btn: "bg-white text-rose-700 hover:bg-rose-50",         ring: "ring-rose-200" },
  slate:   { bg: "from-slate-700 to-slate-900",      badge: "bg-slate-100 text-slate-700",   btn: "bg-white text-slate-700 hover:bg-slate-50",       ring: "ring-slate-200" },
}
const couleur = (c: string) => COULEURS[c] ?? COULEURS.blue

function formatPrix(n: number | null): string {
  if (n == null) return ""
  return n.toLocaleString("fr-FR") + " FCFA"
}

/** Hook : récupère les espaces pub pour un placement. */
function useAds(placement: string): AdSpacePayload[] {
  const [data, setData] = useState<AdSpacePayload[]>([])
  useEffect(() => {
    let cancelled = false
    fetch(`/api/ads?placement=${placement}`)
      .then(r => r.json())
      .then((d: AdSpacePayload[]) => { if (!cancelled && Array.isArray(d) && d.length) setData(d) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [placement])
  return data
}

// ── HERO (rectangle plein largeur avec image/vidéo + CTA) ────────────────────
function AdHero({ item }: { item: AdItem }) {
  const c = couleur(item.couleur)
  const cls = `group relative block overflow-hidden rounded-3xl bg-gradient-to-br ${c.bg} ${item.cta_lien ? "cursor-pointer" : ""}`
  const inner = (
    <>
      {item.video_url ? (
        <video src={item.video_url} autoPlay muted loop playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:opacity-50 transition-opacity" />
      ) : item.image_url ? (
        <Image src={item.image_url} alt={item.titre} fill priority
          className="object-cover opacity-40 group-hover:opacity-50 transition-opacity" sizes="800px" />
      ) : null}

      <div className="relative z-10 p-8 sm:p-12 text-white min-h-[280px] flex flex-col justify-center">
        <span className={`inline-flex w-fit items-center gap-1.5 ${c.badge} text-xs font-medium rounded-full px-3 py-1 mb-4`}>
          <Megaphone className="w-3 h-3" /> {item.sous_titre ?? "À la une"}
        </span>
        <h3 className="text-2xl sm:text-3xl font-bold mb-2 leading-tight">{item.titre}</h3>
        {item.description && <p className="text-sm sm:text-base text-white/90 max-w-xl mb-4">{item.description}</p>}
        {item.property_prix != null && (
          <p className="text-lg font-semibold mb-3">à partir de {formatPrix(item.property_prix)}</p>
        )}
        {item.cta_label && (
          <span className={`inline-flex w-fit items-center gap-2 ${c.btn} font-semibold px-5 py-2.5 rounded-xl transition-colors`}>
            {item.cta_label} <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </span>
        )}
      </div>
    </>
  )
  return item.cta_lien ? <Link href={item.cta_lien} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>
}

// ── GRID (petits carrés avec plusieurs offres) ──────────────────────────────
function AdGridCard({ item }: { item: AdItem }) {
  const c = couleur(item.couleur)
  const cls = `group block rounded-2xl overflow-hidden border border-gray-100 bg-white hover:shadow-lg transition-shadow ${item.cta_lien ? "cursor-pointer" : ""}`
  const inner = (
    <>
      <div className={`relative aspect-[4/3] bg-gradient-to-br ${c.bg}`}>
        {item.image_url ? (
          <Image src={item.image_url} alt={item.titre} fill className="object-cover group-hover:scale-105 transition-transform duration-300" sizes="300px" />
        ) : item.video_url ? (
          <video src={item.video_url} autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-5xl">{item.icone}</div>
        )}
        {item.property_prix != null && (
          <span className="absolute bottom-2 left-2 bg-white/95 backdrop-blur text-gray-900 text-xs font-bold px-2 py-1 rounded-lg">
            {formatPrix(item.property_prix)}
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="text-sm font-semibold text-gray-900 line-clamp-1">{item.titre}</p>
        {item.property_quartier && <p className="text-xs text-gray-500 mt-0.5">{item.property_quartier}</p>}
        {item.cta_label && (
          <span className="inline-flex items-center gap-1 text-xs text-blue-700 mt-2 font-medium">
            {item.cta_label} <ArrowRight className="w-3 h-3" />
          </span>
        )}
      </div>
    </>
  )
  return item.cta_lien ? <Link href={item.cta_lien} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>
}

// ── TICKER (bandeau défilant, marquee CSS pur) ──────────────────────────────
function AdTicker({ items, delaySec }: { items: AdItem[]; delaySec: number }) {
  // Concatène les titres en un message défilant. Si un item a un lien, on
  // l'enveloppe dans un <Link>.
  const items2 = [...items, ...items] // duplication pour boucle continue
  return (
    <div className="relative overflow-hidden bg-slate-900 text-white py-2.5 rounded-full">
      <div
        className="flex gap-8 whitespace-nowrap"
        style={{ animation: `ad-marquee ${delaySec * items.length}s linear infinite` }}
      >
        {items2.map((it, i) => (
          <span key={i} className="inline-flex items-center gap-2 text-sm">
            <span className="text-base">{it.icone}</span>
            {it.cta_lien ? (
              <Link href={it.cta_lien} className="hover:text-amber-300 transition-colors font-medium">
                {it.titre}{it.sous_titre ? ` — ${it.sous_titre}` : ""}
              </Link>
            ) : (
              <span className="font-medium">{it.titre}{it.sous_titre ? ` — ${it.sous_titre}` : ""}</span>
            )}
          </span>
        ))}
      </div>
      <style>{`@keyframes ad-marquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }`}</style>
    </div>
  )
}

// ── CAROUSEL (rotation auto entre N items) ──────────────────────────────────
function AdCarousel({ items, delaySec }: { items: AdItem[]; delaySec: number }) {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    if (items.length <= 1) return
    const id = setInterval(() => setIdx(i => (i + 1) % items.length), delaySec * 1000)
    return () => clearInterval(id)
  }, [items.length, delaySec])

  if (items.length === 0) return null
  const item = items[idx] ?? items[0]

  return (
    <div className="relative">
      <AdHero item={item} />
      {items.length > 1 && (
        <>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-20">
            {items.map((_, i) => (
              <button key={i} onClick={() => setIdx(i)} aria-label={`Pub ${i + 1}`}
                className={`h-2 rounded-full transition-all ${i === idx ? "w-8 bg-white" : "w-2 bg-white/50"}`} />
            ))}
          </div>
          <button onClick={() => setIdx(i => (i - 1 + items.length) % items.length)} aria-label="Précédent"
            className="absolute left-3 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-white/20 backdrop-blur text-white hover:bg-white/40 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button onClick={() => setIdx(i => (i + 1) % items.length)} aria-label="Suivant"
            className="absolute right-3 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-white/20 backdrop-blur text-white hover:bg-white/40 transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
        </>
      )}
    </div>
  )
}

// ── Conteneur public : <AdSpace placement="home" /> ─────────────────────────
export default function AdSpace({ placement, className }: { placement: string; className?: string }) {
  const spaces = useAds(placement)
  if (spaces.length === 0) return null

  return (
    <div className={className}>
      {spaces.map(({ space, items }) => {
        if (items.length === 0) return null
        switch (space.format) {
          case "hero":
            return <div key={space.slug} className="mb-4"><AdHero item={items[0]} /></div>
          case "grid":
            return (
              <div key={space.slug} className="mb-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {items.map(it => <AdGridCard key={it.id} item={it} />)}
                </div>
              </div>
            )
          case "ticker":
            return <div key={space.slug} className="mb-4"><AdTicker items={items} delaySec={space.rotation_delay_sec} /></div>
          case "carousel":
            return <div key={space.slug} className="mb-4"><AdCarousel items={items} delaySec={space.rotation_delay_sec} /></div>
          default:
            return null
        }
      })}
    </div>
  )
}
