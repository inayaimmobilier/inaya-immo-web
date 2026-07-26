// ============================================================================
// Pharmacies de garde — lecture de la garde du JOUR (assistants site + WhatsApp)
// et ajout admin. Best-effort : si la table n'existe pas encore (migration 048
// non appliquée), on renvoie une liste vide sans erreur.
// ============================================================================
import { createAdminClient } from "@/lib/supabase/server"

export interface PharmacieGarde {
  id: string; nom: string; ville: string; quartier: string | null
  adresse: string | null; telephone: string | null
  date_debut: string | null; date_fin: string | null
}

/** Pharmacies de garde actives couvrant aujourd'hui (option : filtrées par ville). */
export async function pharmaciesDeGarde(ville?: string): Promise<PharmacieGarde[]> {
  try {
    const admin = createAdminClient()
    const today = new Date().toISOString().slice(0, 10)
    let q = admin.from("pharmacies_garde")
      .select("id, nom, ville, quartier, adresse, telephone, date_debut, date_fin")
      .eq("actif", true)
      .or(`date_debut.is.null,date_debut.lte.${today}`)
      .or(`date_fin.is.null,date_fin.gte.${today}`)
      .order("ville").limit(50)
    if (ville?.trim()) q = q.ilike("ville", `%${ville.trim()}%`)
    const { data } = await q
    return (data ?? []) as PharmacieGarde[]
  } catch {
    return []
  }
}

/** Réponse formatée pour un assistant (outil `pharmacies_de_garde`). */
export async function pharmaciesTool(ville?: string): Promise<unknown> {
  const list = await pharmaciesDeGarde(ville)
  if (list.length === 0) {
    return { nombre: 0, message: "Aucune pharmacie de garde enregistrée pour aujourd'hui. Invite l'utilisateur à réessayer plus tard ou à consulter le syndicat des pharmaciens." }
  }
  return {
    nombre: list.length,
    date: new Date().toISOString().slice(0, 10),
    pharmacies: list.map(p => ({
      nom: p.nom, ville: p.ville, quartier: p.quartier ?? undefined,
      adresse: p.adresse ?? undefined, telephone: p.telephone ?? undefined,
    })),
  }
}
