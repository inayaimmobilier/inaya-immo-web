"use client"

import { useState } from "react"

const MOIS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
]

const cls = "px-2 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-100"

/**
 * Sélecteur de date par listes déroulantes : Jour / Mois / Année.
 * Le nombre de jours s'adapte au mois et à l'année choisis ; les années
 * commencent à l'année en cours (réservation). Émet une date ISO "AAAA-MM-JJ".
 */
export default function DateSelect({ onChange, yearsAhead = 3 }: {
  onChange: (iso: string) => void
  yearsAhead?: number
}) {
  const baseYear = new Date().getFullYear()
  const years = Array.from({ length: yearsAhead + 1 }, (_, i) => baseYear + i)

  const [j, setJ] = useState("")
  const [m, setM] = useState("")
  const [y, setY] = useState("")

  // Jours du mois choisi (28–31). new Date(année, mois, 0) = dernier jour du mois.
  const daysInMonth = m && y ? new Date(Number(y), Number(m), 0).getDate() : 31
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  function emit(nj: string, nm: string, ny: string) {
    if (nj && nm && ny) onChange(`${ny}-${nm.padStart(2, "0")}-${nj.padStart(2, "0")}`)
    else onChange("")
  }
  // Ramène le jour dans la limite du mois (ex: 31 → 30 si on passe à un mois de 30 jours).
  function clampDay(nm: string, ny: string): string {
    const dim = nm && ny ? new Date(Number(ny), Number(nm), 0).getDate() : 31
    if (j && Number(j) > dim) { const d = String(dim); setJ(d); return d }
    return j
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      <select aria-label="Jour" value={j} onChange={e => { setJ(e.target.value); emit(e.target.value, m, y) }} className={cls}>
        <option value="">Jour</option>
        {days.map(d => <option key={d} value={d}>{d}</option>)}
      </select>
      <select aria-label="Mois" value={m} onChange={e => { const v = e.target.value; setM(v); emit(clampDay(v, y), v, y) }} className={cls}>
        <option value="">Mois</option>
        {MOIS.map((nom, i) => <option key={i} value={i + 1}>{nom}</option>)}
      </select>
      <select aria-label="Année" value={y} onChange={e => { const v = e.target.value; setY(v); emit(clampDay(m, v), m, v) }} className={cls}>
        <option value="">Année</option>
        {years.map(yr => <option key={yr} value={yr}>{yr}</option>)}
      </select>
    </div>
  )
}
