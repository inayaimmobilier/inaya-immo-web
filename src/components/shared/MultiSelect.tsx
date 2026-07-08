"use client"

import { useState, useRef, useEffect } from "react"
import { ChevronDown, Check } from "lucide-react"

interface Opt { value: string; label: string }

/**
 * Sélecteur à choix multiple (liste de cases à cocher dans un menu déroulant).
 * Affiche les libellés sélectionnés, ou « N sélectionnés » au-delà de 2.
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
  /** Style visuel du bouton (remplace le style par défaut). Le layout flex est conservé. */
  buttonClass?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [])

  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v])
  const labelFor = (v: string) => options.find(o => o.value === v)?.label ?? v

  const summary =
    selected.length === 0 ? <span className="text-gray-400">{placeholder}</span>
    : selected.length <= 2 ? <span className="text-gray-700 truncate">{selected.map(labelFor).join(", ")}</span>
    : <span className="text-gray-700">{selected.length} sélectionnés</span>

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between gap-2 ${buttonClass ?? "px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 disabled:opacity-50"}`}
      >
        <span className="truncate text-left">{summary}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && !disabled && (
        <div className="absolute z-30 mt-1 w-full max-h-60 overflow-auto bg-white border border-gray-200 rounded-xl shadow-lg py-1">
          {options.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">Aucune option</p>}
          {options.map(o => {
            const on = selected.includes(o.value)
            return (
              <button
                type="button"
                key={o.value}
                onClick={() => toggle(o.value)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50"
              >
                <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? "bg-blue-600 border-blue-600" : "border-gray-300"}`}>
                  {on && <Check className="w-3 h-3 text-white" />}
                </span>
                <span className="truncate text-gray-700">{o.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
