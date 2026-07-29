// ============================================================================
// Journal des suppressions d'annonces (table property_deletions, migration 050).
// Appelé JUSTE AVANT la suppression : une fois la ligne partie, l'info est
// perdue. Best-effort — ne doit jamais faire échouer une suppression.
// ============================================================================
import { createAdminClient } from "@/lib/supabase/server"

type Row = {
  id: string; reference: number | null; titre: string | null
  type_offre: string | null; categorie: string | null; prix: number | null
  ville: string | null; quartier: string | null; statut: string | null; created_at: string | null
}

/** Enregistre les annonces sur le point d'être supprimées. */
export async function logPropertyDeletions(
  ids: string[],
  opts: { source: "admin" | "groupee" | "auto"; deletedBy?: string | null },
): Promise<void> {
  if (ids.length === 0) return
  try {
    const admin = createAdminClient()
    const { data } = await admin.from("properties")
      .select("id,reference,titre,type_offre,categorie,prix,ville,quartier,statut,created_at")
      .in("id", ids)
    const rows = (data ?? []) as Row[]
    if (rows.length === 0) return

    const entries = rows.map(p => ({
      property_id: p.id, reference: p.reference, titre: p.titre,
      type_offre: p.type_offre, categorie: p.categorie, prix: p.prix,
      ville: p.ville, quartier: p.quartier,
      statut_avant: p.statut, publie_le: p.created_at,
      source: opts.source, deleted_by: opts.deletedBy ?? null,
    }))
    const { error } = await admin.from("property_deletions").insert(entries as never)
    // 42P01 = table absente (migration 050 non appliquée) → on n'alerte pas.
    if (error && error.code !== "42P01") console.error("INAYA-DEL-LOG", error.message)
  } catch (e) {
    console.error("INAYA-DEL-LOG-002", (e as Error).message)
  }
}
