// ============================================================================
// PUBLIEURS BLOQUÉS — numéros dont les annonces de groupe sont ignorées.
//
// Certains membres des groupes WhatsApp republient les annonces des AUTRES,
// sans en avoir les informations : contact qui ne connaît pas le bien, détails
// manquants, confusion (demande du DG, 16/10/2026). Le service d'ingestion
// ignore leurs messages (whatsapp-service/src/publieurs-bloques.ts) ; ici, la
// gestion de la liste et le nettoyage de leurs annonces passées.
//
// Liste dans `app_settings.publieurs_bloques` = [{telephone, nom, motif, ajoute_le}].
// ============================================================================
import { createAdminClient } from "@/lib/supabase/server"

type Db = ReturnType<typeof createAdminClient>
const CLE = "publieurs_bloques"

export interface PublieurBloque { telephone: string; nom: string | null; motif: string | null; ajoute_le: string }

export const finNumero = (t: string | null | undefined) => (t ?? "").replace(/\D/g, "").slice(-8)

export async function lirePublieursBloques(db: Db): Promise<PublieurBloque[]> {
  const { data } = await db.from("app_settings").select("value").eq("key", CLE).maybeSingle()
  const v = (data as { value?: unknown } | null)?.value
  return Array.isArray(v) ? (v as PublieurBloque[]).filter(x => x && finNumero(x.telephone).length === 8) : []
}

async function ecrire(db: Db, liste: PublieurBloque[]): Promise<void> {
  const { error } = await db.from("app_settings").upsert({ key: CLE, value: liste } as never, { onConflict: "key" })
  if (error) throw new Error(error.message)
}

export async function bloquerPublieur(db: Db, p: { telephone: string; nom?: string | null; motif?: string | null }): Promise<PublieurBloque[]> {
  const f = finNumero(p.telephone)
  if (f.length !== 8) throw new Error("Numéro invalide : il faut au moins 8 chiffres.")
  const liste = await lirePublieursBloques(db)
  const entree: PublieurBloque = {
    telephone: p.telephone.replace(/[^\d+]/g, ""), nom: p.nom?.trim() || null,
    motif: p.motif?.trim().slice(0, 300) || null, ajoute_le: new Date().toISOString(),
  }
  const i = liste.findIndex(x => finNumero(x.telephone) === f)
  const suite = i >= 0
    ? liste.map((x, k) => (k === i ? { ...x, nom: entree.nom ?? x.nom, motif: entree.motif ?? x.motif } : x))
    : [entree, ...liste]
  await ecrire(db, suite)
  return suite
}

export async function debloquerPublieur(db: Db, telephone: string): Promise<PublieurBloque[]> {
  const f = finNumero(telephone)
  const suite = (await lirePublieursBloques(db)).filter(x => finNumero(x.telephone) !== f)
  await ecrire(db, suite)
  return suite
}

/**
 * Nettoie les annonces PASSÉES d'un numéro qu'on vient de bloquer :
 *  - annonce dont TOUS les publieurs sont bloqués → suspendue (réversible) ;
 *  - annonce qui a aussi un autre publieur (le vrai annonceur) → le numéro
 *    bloqué est seulement retiré de sa provenance.
 */
export async function nettoyerAnnoncesBloquees(db: Db, telephone: string): Promise<{ suspendues: number; provenancesRetirees: number }> {
  const f = finNumero(telephone)
  const bloques = new Set((await lirePublieursBloques(db)).map(x => finNumero(x.telephone)))
  bloques.add(f)
  const { data } = await db.from("property_publishers").select("id,property_id,contact_phone")
    .ilike("contact_phone", `%${f}%`).limit(2000)
  const lignes = ((data ?? []) as { id: string; property_id: string; contact_phone: string | null }[])
    .filter(l => finNumero(l.contact_phone) === f)
  const parBien = [...new Set(lignes.map(l => l.property_id))]

  let suspendues = 0, provenancesRetirees = 0
  for (const pid of parBien) {
    const { data: tous } = await db.from("property_publishers").select("id,contact_phone").eq("property_id", pid)
    const pubs = (tous ?? []) as { id: string; contact_phone: string | null }[]
    const autres = pubs.filter(x => { const g = finNumero(x.contact_phone); return g.length === 8 && !bloques.has(g) })
    if (autres.length === 0) {
      const { count } = await db.from("properties").update({ statut: "suspendu" } as never, { count: "exact" })
        .eq("id", pid).in("statut", ["publie", "en_attente_validation"])
      suspendues += count ?? 0
    } else {
      const ids = lignes.filter(l => l.property_id === pid).map(l => l.id)
      const { error } = await db.from("property_publishers").delete().in("id", ids)
      if (!error) provenancesRetirees += ids.length
    }
  }
  return { suspendues, provenancesRetirees }
}
