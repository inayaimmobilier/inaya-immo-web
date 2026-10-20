"use client"

import { useEffect, useState } from "react"
import { Phone, MessageCircle, Headset } from "lucide-react"
import {
  lienAppel, lienWhatsApp, numeroAffiche, type NumeroContact,
} from "@/lib/numeros-contact-format"

// ============================================================================
// NUMÉROS DE CONTACT D'INAYA À L'ÉCRAN — trois présentations, une source :
//   - BarreContact      : bandeau fin en haut de toutes les pages (Navbar) ;
//   - BandeauConseiller : bloc « Parlez à un conseiller » au milieu de l'accueil ;
//   - ContactPied       : numéros dans le pied de page.
// Pour les clients peu à l'aise avec les formulaires : un toucher, et le
// téléphone compose le numéro (lien tel:). Liste gérée dans Admin → Paramètres.
// ============================================================================

let enCours: Promise<NumeroContact[]> | null = null
/** Lit les numéros une seule fois par visite (réponse mise en cache par le CDN). */
function chargerNumeros(): Promise<NumeroContact[]> {
  enCours ??= fetch("/api/contact/numeros")
    .then(r => (r.ok ? r.json() : { numeros: [] }))
    .then((j: { numeros?: NumeroContact[] }) => j.numeros ?? [])
    .catch(() => { enCours = null; return [] })
  return enCours
}

export function useNumerosContact(initial?: NumeroContact[]): NumeroContact[] {
  const [n, setN] = useState<NumeroContact[]>(initial ?? [])
  useEffect(() => { if (!initial) void chargerNumeros().then(setN) }, [initial])
  return n
}

/** Bandeau fin, en haut de chaque page : « Besoin d'aide ? Appelez-nous ». */
export function BarreContact() {
  const numeros = useNumerosContact()
  if (!numeros.length) return null
  return (
    <div className="bg-slate-950 text-white">
      {/* Mobile : centré, gros boutons Appeler / WhatsApp faciles à toucher. */}
      <div className="sm:hidden overflow-x-auto [scrollbar-width:none] py-2 px-3">
        <div className="w-max mx-auto flex items-center gap-3">
          {numeros.map(n => (
            <div key={n.numero} className="flex items-center gap-1.5">
              <a href={lienAppel(n.numero)}
                className="inline-flex items-center gap-1.5 bg-amber-400 active:bg-amber-300 text-slate-900 font-bold text-sm pl-2.5 pr-3 py-1.5 rounded-full shadow"
                aria-label={`Appeler ${n.libelle ?? "Inaya"} au ${numeroAffiche(n.numero)}`}>
                <Phone className="w-4 h-4" /> {numeroAffiche(n.numero)}
              </a>
              {n.whatsapp && (
                <a href={lienWhatsApp(n.numero)} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 bg-green-500 active:bg-green-400 text-white font-bold text-sm px-3 py-1.5 rounded-full shadow"
                  aria-label="Écrire sur WhatsApp">
                  <MessageCircle className="w-4 h-4" /> WhatsApp
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="hidden sm:flex max-w-6xl mx-auto px-4 sm:px-6 h-9 items-center gap-3 overflow-x-auto whitespace-nowrap text-xs [scrollbar-width:none]">
        <span className="inline-flex items-center gap-1.5 text-slate-300 shrink-0">
          <Headset className="w-3.5 h-3.5 text-amber-400" /> Besoin d&apos;aide ? Appelez un conseiller Inaya :
        </span>
        {numeros.map(n => (
          <span key={n.numero} className="inline-flex items-center gap-1.5 shrink-0">
            <a href={lienAppel(n.numero)} className="inline-flex items-center gap-1 font-semibold text-white hover:text-amber-300"
              aria-label={`Appeler ${n.libelle ?? "Inaya"} au ${numeroAffiche(n.numero)}`}>
              <Phone className="w-3 h-3 text-amber-400" /> {numeroAffiche(n.numero)}
            </a>
            {n.libelle && <span className="hidden md:inline text-slate-400">({n.libelle})</span>}
            {n.whatsapp && (
              <a href={lienWhatsApp(n.numero)} target="_blank" rel="noopener noreferrer"
                className="text-green-400 hover:text-green-300" aria-label="Écrire sur WhatsApp">
                <MessageCircle className="w-3.5 h-3.5" />
              </a>
            )}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Bloc « Parlez à un conseiller » — milieu de l'accueil. */
export function BandeauConseiller({ numeros }: { numeros: NumeroContact[] }) {
  if (!numeros.length) return null
  return (
    <section className="bg-gradient-to-br from-blue-700 via-blue-800 to-slate-900 relative overflow-hidden">
      <div className="absolute -top-20 -right-20 w-72 h-72 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 relative">
        <div className="flex flex-col md:flex-row md:items-center gap-8">
          <div className="md:w-2/5">
            <p className="text-amber-400 text-xs font-bold uppercase tracking-widest mb-3">Un conseiller vous répond</p>
            <h2 className="text-2xl font-bold text-white leading-snug mb-3">
              Vous préférez en parler de vive voix ?
            </h2>
            <p className="text-blue-100 text-sm leading-relaxed">
              Dites-nous ce que vous cherchez : quartier, budget, nombre de pièces. Un conseiller Inaya
              vous propose les biens disponibles et organise la visite. Pas besoin de remplir de formulaire.
            </p>
          </div>
          <div className="md:flex-1 grid sm:grid-cols-2 gap-3">
            {numeros.map(n => (
              <div key={n.numero} className="bg-white/10 backdrop-blur border border-white/15 rounded-2xl p-4">
                <p className="text-blue-200 text-xs font-medium mb-1">{n.libelle ?? "Service client"}</p>
                <a href={lienAppel(n.numero)} className="block text-white text-xl font-bold tracking-wide mb-3 hover:text-amber-300">
                  {numeroAffiche(n.numero)}
                </a>
                <div className="flex gap-2">
                  <a href={lienAppel(n.numero)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 bg-amber-400 hover:bg-amber-300 text-slate-900 font-bold text-sm py-2.5 rounded-xl transition-colors">
                    <Phone className="w-4 h-4" /> Appeler
                  </a>
                  {n.whatsapp && (
                    <a href={lienWhatsApp(n.numero)} target="_blank" rel="noopener noreferrer"
                      className="flex-1 inline-flex items-center justify-center gap-1.5 bg-green-500 hover:bg-green-400 text-white font-bold text-sm py-2.5 rounded-xl transition-colors">
                      <MessageCircle className="w-4 h-4" /> WhatsApp
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/** Numéros dans le pied de page (fond sombre). */
export function ContactPied({ numeros }: { numeros: NumeroContact[] }) {
  if (!numeros.length) return null
  return (
    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-5 gap-y-2 text-sm">
      <span className="text-slate-400 inline-flex items-center gap-1.5"><Headset className="w-4 h-4 text-amber-400" /> Appelez-nous :</span>
      {numeros.map(n => (
        <span key={n.numero} className="inline-flex items-center gap-2">
          <a href={lienAppel(n.numero)} className="text-white font-semibold hover:text-amber-300">{numeroAffiche(n.numero)}</a>
          {n.libelle && <span className="text-slate-500 text-xs">{n.libelle}</span>}
          {n.whatsapp && (
            <a href={lienWhatsApp(n.numero)} target="_blank" rel="noopener noreferrer" className="text-green-400 hover:text-green-300" aria-label="WhatsApp">
              <MessageCircle className="w-4 h-4" />
            </a>
          )}
        </span>
      ))}
    </div>
  )
}
