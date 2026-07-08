"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import { ChevronDown, Check } from "lucide-react"

interface Opt { value: string; label: string }

/**
 * Sélecteur à choix multiple. La liste est rendue dans un PORTAIL en position
 * fixe : elle n'est donc jamais coupée par un parent en overflow-hidden (barre
 * de recherche de l'accueil). Un bouton « Terminé » permet de fermer clairement.
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
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const place = useCallback(() => {
    const b = btnRef.current?.getBoundingClientRect()
    if (b) setRect({ top: b.bottom + 4, left: b.left, width: b.width })
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

  const menu = open && rect ? createPortal(
    <div
      ref={menuRef}
      style={{ position: "fixed", top: rect.top, left: rect.left, width: Math.max(rect.width, 200), zIndex: 1000 }}
      className="bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden"
    >
      <div className="max-h-60 overflow-auto py-1">
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
      {/* Bouton de fermeture clair */}
      <div className="border-t border-gray-100 p-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-lg"
        >
          Terminé{selected.length > 0 ? ` (${selected.length})` : ""}
        </button>
      </div>
    </div>,
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
