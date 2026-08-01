// ============================================================================
// Rattrapage du nombre de chambres sur les annonces qui n'en portent pas.
//
// Pourquoi une passe planifiée plutôt qu'un correctif à la publication :
// l'essentiel des annonces (plus de mille par semaine) est inséré DIRECTEMENT
// en base par le service WhatsApp, sans passer par le site. Un correctif posé
// dans le back-office ne les verrait jamais. Cette passe, elle, couvre toutes
// les sources — et l'ingestion laisse volontairement `null` pour les studios et
// les entrées couchées, qui deviennent alors invisibles aux filtres.
//
// Idempotente : ne touche que les lignes dont `nb_chambres` est vide.
// ============================================================================
import { createAdminClient } from "@/lib/supabase/server"
import { extractRooms } from "@/lib/rooms-extract"

interface Row {
  id: string; titre: string; description: string | null
  categorie: string | null; nb_pieces: number | null
}

export async function runRoomsBackfill(limit = 1500): Promise<{
  ok: boolean; examinees: number; completees: number; erreurs: number
}> {
  const admin = createAdminClient()
  let examinees = 0, completees = 0, erreurs = 0

  try {
    // PostgREST plafonne à 1000 lignes : `order` + `range` sont obligatoires,
    // sans quoi on ne verrait jamais que les annonces les plus anciennes.
    const PAGE = 1000
    const rows: Row[] = []
    for (let page = 0; rows.length < limit; page++) {
      const { data, error } = await admin.from("properties")
        .select("id,titre,description,categorie,nb_pieces")
        .is("nb_chambres", null)
        .order("created_at", { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1)
      if (error) { console.error("INAYA-ROOMS-010", error.message); break }
      const batch = (data ?? []) as Row[]
      rows.push(...batch)
      if (batch.length < PAGE) break
    }

    examinees = rows.length
    for (const r of rows.slice(0, limit)) {
      const g = extractRooms(`${r.titre} . ${r.description ?? ""}`, r.categorie ?? "")
      if (g.nb_chambres == null) continue
      const patch: Record<string, number> = { nb_chambres: g.nb_chambres }
      if (g.nb_pieces != null && r.nb_pieces == null) patch.nb_pieces = g.nb_pieces
      const { error } = await admin.from("properties").update(patch as never).eq("id", r.id)
      if (error) erreurs++
      else completees++
    }
    return { ok: true, examinees, completees, erreurs }
  } catch (e) {
    console.error("INAYA-ROOMS-011", e)
    return { ok: false, examinees, completees, erreurs }
  }
}
