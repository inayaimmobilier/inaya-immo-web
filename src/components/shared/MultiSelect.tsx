"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import { ChevronDown, Check } from "lucide-react"

interface Opt { value: string; label: string }

interface Pos {
  /** Sous 640 px : feuille ancrée en bas de l'écran. */
  mobile: boolean
  left?: number
  width?: number
  top?: number
  bottom?: number
  /** Hauteur maximale de la LISTE seule — le bouton reste toujours en plus. */
  maxListe: number
}

/**
 * Sélecteur à choix multiple. La liste est rendue dans un PORTAIL en position
 * fixe : elle n'est donc jamais coupée par un parent en overflow-hidden (barre
 * de recherche de l'accueil).
 *
 * ── LE BOUTON « TERMINÉ » DOIT TOUJOURS ÊTRE VISIBLE ────────────────────────
 *
 * Le panneau s'ouvrait vers le bas à hauteur fixe, sans regarder l'espace
 * restant. Sur un téléphone, un champ situé au milieu de l'écran poussait donc
 * le bouton HORS de la fenêtre : il fallait faire défiler la page pour valider,
 * geste que personne ne devine. C'est le genre de détail qui fait abandonner
 * une recherche.
 *
 * Deux réponses selon la taille de l'écran :
 *  - MOBILE : panneau ancré EN BAS de l'écran, comme une feuille. Le bouton est
 *    au même endroit à chaque ouverture, quel que soit le champ touché.
 *  - ORDINATEUR : panneau ancré au champ, mais retourné au-dessus s'il manque
 *    de place dessous, et sa hauteur bornée à l'espace réellement disponible.
 *
 * Dans les deux cas la LISTE défile à l'intérieur et le bouton reste collé au
 * bas du panneau — jamais l'inverse.
 */
export default function MultiSelect({
  options, selected, onChange, placeholder, disabled, className, buttonClass,
}: {
  options: Opt[]
  selected: string[]
  onChange: (vals: string[]) => void
  placeholder: string
  disabled?: boolean
  className?: string
  buttonClass?: string
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<Pos | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const place = useCallback(() => {
    const b = btnRef.current?.getBoundingClientRect()
    if (!b) return
    const vh = window.innerHeight
    const vw = window.innerWidth

    // Sous 640 px, feuille ancrée en bas : c'est la seule disposition où le
    // bouton se trouve toujours au même endroit, sans dépendre de la position
    // du champ dans la page.
    if (vw < 640) {
      setPos({ mobile: true, maxListe: Math.round(vh * 0.55) })
      return
    }

    const MARGE = 12
    const FOOTER = 60          // hauteur du bloc « Terminé »
    const dessous = vh - b.bottom - MARGE
    const dessus = b.top - MARGE

    // On retourne le panneau vers le haut quand le dessous est trop court ET
    // que le dessus offre mieux : afficher 40 px de liste sous le champ ne rend
    // service à personne.
    const versLeHaut = dessous < 200 && dessus > dessous
    const espace = versLeHaut ? dessus : dessous
    setPos({
      mobile: false,
      left: Math.min(b.left, vw - Math.max(b.width, 200) - MARGE),
      width: Math.max(b.width, 200),
      top: versLeHaut ? undefined : b.bottom + 4,
      bottom: versLeHaut ? vh - b.top + 4 : undefined,
      maxListe: Math.max(120, espace - FOOTER),
    })
  }, [])

  useEffect(() => {
    if (!open) return
    place()
    const reposition = () => place()
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    window.addEventListener("scroll", reposition, true)
    window.addEventListener("resize", reposition)
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("scroll", reposition, true)
      window.removeEventListener("resize", reposition)
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open, place])

  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v])
  const labelFor = (v: string) => options.find(o => o.value === v)?.label ?? v

  const summary =
    selected.length === 0 ? <span className="text-gray-400">{placeholder}</span>
    : selected.length <= 2 ? <span className="text-gray-700 truncate">{selected.map(labelFor).join(", ")}</span>
    : <span className="text-gray-700">{selected.length} sélectionnés</span>

  const menu = open && pos ? createPortal(
    <>
      {/* Voile sur mobile : ferme au toucher hors du panneau et isole la
          feuille du reste de la page, qui défilerait sinon derrière elle. */}
      {pos.mobile && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 999 }}
          className="bg-slate-900/40"
        />
      )}
      <div
        ref={menuRef}
        style={pos.mobile
          ? { position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 1000 }
          : { position: "fixed", top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width, zIndex: 1000 }}
        className={pos.mobile
          ? "bg-white border-t border-gray-200 rounded-t-2xl shadow-2xl overflow-hidden"
          : "bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden"}
      >
        {pos.mobile && (
          <div className="pt-2 pb-1 flex justify-center">
            <span className="h-1 w-10 rounded-full bg-gray-300" />
          </div>
        )}
        {pos.mobile && (
          <p className="px-4 pb-2 text-sm font-semibold text-gray-900">{placeholder}</p>
        )}
      <div style={{ maxHeight: pos.maxListe }} className="overflow-auto py-1">
        {options.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">Aucune option</p>}
        {options.map(o => {
          const on = selected.includes(o.value)
          return (
            <button
              type="button"
              key={o.value}
              onClick={() => toggle(o.value)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-gray-50"
            >
              <span className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${on ? "bg-blue-600 border-blue-600" : "border-gray-300"}`}>
                {on && <Check className="w-3.5 h-3.5 text-white" />}
              </span>
              <span className="truncate text-gray-700">{o.label}</span>
            </button>
          )
        })}
      </div>
      {/* Bouton TOUJOURS visible : hors de la zone qui défile, et sur mobile
          au-dessus de la barre de navigation du système. */}
      <div
        className="border-t border-gray-100 p-2"
        style={pos.mobile ? { paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" } : undefined}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-3 rounded-lg"
        >
          Terminé{selected.length > 0 ? ` (${selected.length})` : ""}
        </button>
      </div>
      </div>
    </>,
    document.body,
  ) : null

  return (
    <div className={`relative ${className ?? ""}`}>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between gap-2 ${buttonClass ?? "px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 disabled:opacity-50"}`}
      >
        <span className="truncate text-left">{summary}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {menu}
    </div>
  )
}
