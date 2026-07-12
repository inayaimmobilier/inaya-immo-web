"use client"

import { useEffect, useState } from "react"
import { DEFAULT_PROPERTY_TYPES } from "@/lib/property-types"

export interface PropertyTypeOption {
  value: string
  label: string
}

/**
 * Récupère la liste des types de biens gérée par l'admin (depuis
 * /api/property-types), dans l'ordre défini par l'admin. Repli sur la liste par
 * défaut si l'API est indisponible.
 *
 * À utiliser dans TOUS les composants client qui affichent une liste de types de
 * biens (recherche, signalement, formulaires…) pour que l'ajout d'un type côté
 * admin (ex. « Villa ») apparaisse partout, sans jamais coder la liste en dur.
 */
export function usePropertyTypes(): { options: PropertyTypeOption[]; loading: boolean } {
  const fallback: PropertyTypeOption[] = DEFAULT_PROPERTY_TYPES.map(t => ({ value: t.code, label: t.label }))
  const [options, setOptions] = useState<PropertyTypeOption[]>(fallback)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch("/api/property-types")
      .then(r => r.json())
      .then((d: { code: string; label: string }[]) => {
        if (!cancelled && Array.isArray(d) && d.length) {
          setOptions(d.map(t => ({ value: t.code, label: t.label })))
        }
      })
      .catch(() => { /* garde le repli */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return { options, loading }
}
