// ============================================================================
// Démarchage des RÉSIDENCES MEUBLÉES.
//
// Constat : 5 meublées au catalogue, pour un onglet entier dans l'application,
// un espace de réservation et une estimation de séjour. L'outillage est prêt,
// il manque le stock. Or le stock est déjà là, mal rangé : 113 annonces
// d'habitation publiées en location mentionnent explicitement un meublé.
//
// Ce module les retrouve et donne le contact du publieur pour le démarcher.
// ============================================================================
import { createAdminClient } from "@/lib/supabase/server"

/**
 * Signaux propres au meublé. « résidence » seul est VOLONTAIREMENT exclu : il
 * attrape « zone résidentielle » et remplissait la liste de terrains.
 */
const SIGNAL = /(meubl[ée]|court[\s-]?s[ée]jour|par\s*nuit|\/\s*nuit|nuit[ée]e|airbnb|air[\s-]bnb)/i

/** Seules les catégories d'habitation peuvent devenir un meublé. */
const HABITATION = new Set(["maison", "appartement", "studio", "duplex", "villa"])

export interface Candidat {
  id: string; reference: number | null; titre: string
  categorie: string; prix: number | null
  ville: string | null; quartier: string | null
  created_at: string
  publieur_nom: string | null
  publieur_tel: string | null
}

/**
 * Annonces publiées qui ressemblent à un meublé sans en porter le type.
 * Coûteux (lecture paginée du catalogue) : réservé aux pages admin.
 */
export async function candidatsMeubles(limite = 200): Promise<Candidat[]> {
  const admin = createAdminClient()
  const PAGE = 1000
  type Row = {
    id: string; reference: number | null; titre: string; description: string | null
    categorie: string; type_offre: string; prix: number | null
    ville: string | null; quartier: string | null; created_at: string
  }
  const rows: Row[] = []
  for (let page = 0; page < 10; page++) {
    // PostgREST plafonne à 1000 lignes : order + range obligatoires.
    const { data, error } = await admin.from("properties")
      .select("id,reference,titre,description,categorie,type_offre,prix,ville,quartier,created_at")
      .eq("statut", "publie")
      .order("created_at", { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1)
    if (error) { console.error("INAYA-PROSP-010", error.message); break }
    const batch = (data ?? []) as Row[]
    rows.push(...batch)
    if (batch.length < PAGE) break
  }

  const retenus = rows.filter(r =>
    r.type_offre !== "residence_meublee" &&
    HABITATION.has(r.categorie) &&
    SIGNAL.test(`${r.titre} ${r.description ?? ""}`),
  ).slice(0, limite)
  if (retenus.length === 0) return []

  // Contact du publieur : c'est la personne à démarcher.
  const contacts = new Map<string, { nom: string | null; tel: string | null }>()
  const ids = retenus.map(r => r.id)
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await admin.from("property_publishers")
      .select("property_id,contact_nom,contact_phone,rang")
      .in("property_id", ids.slice(i, i + 100))
      .order("rang", { ascending: true })
    for (const p of (data ?? []) as { property_id: string; contact_nom: string | null; contact_phone: string | null }[]) {
      if (!contacts.has(p.property_id)) contacts.set(p.property_id, { nom: p.contact_nom, tel: p.contact_phone })
    }
  }

  return retenus.map(r => ({
    id: r.id, reference: r.reference, titre: r.titre, categorie: r.categorie,
    prix: r.prix, ville: r.ville, quartier: r.quartier, created_at: r.created_at,
    publieur_nom: contacts.get(r.id)?.nom ?? null,
    publieur_tel: contacts.get(r.id)?.tel ?? null,
  }))
}

/** Argumentaire pré-rempli, à envoyer au propriétaire par WhatsApp. */
export function pitchWhatsApp(c: Candidat): string {
  const lieu = [c.quartier, c.ville].filter(Boolean).join(", ")
  const nom = c.publieur_nom?.trim().split(/\s+/)[0]
  return (
    `Bonjour${nom ? ` ${nom}` : ""}, c'est Inaya Immo.\n\n` +
    `Votre bien meublé${lieu ? ` à ${lieu}` : ""} (annonce N°${c.reference ?? "—"}) ` +
    "intéresserait aussi les personnes de passage à Bouaké, qui cherchent au mois ou à la nuitée.\n\n" +
    "Nous pouvons le publier en résidence meublée sur notre application : les clients réservent " +
    "leurs dates directement, et nos agents gèrent la mise en relation comme d'habitude. " +
    "C'est gratuit et cela ne remplace pas votre annonce actuelle.\n\n" +
    "Souhaitez-vous que je m'en occupe ?"
  )
}
