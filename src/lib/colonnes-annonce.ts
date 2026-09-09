// ============================================================================
// Colonnes à demander pour afficher une CARTE d'annonce.
//
// Pourquoi une constante plutôt que `select("*")` : la table `properties` porte
// `search_vector`, un `tsvector` généré par Postgres à partir du titre, de la
// description, du quartier et de la ville. Il sert UNIQUEMENT à l'index
// full-text côté SQL, aucune page ne le lit, et il pèse plusieurs fois le texte
// dont il est tiré. Avec `*`, il traversait le réseau pour chaque annonce, à
// chaque affichage — sur des pages en `force-dynamic` qui se rafraîchissent
// toutes les 60 secondes. Le quota de trafic Supabase a sauté le 09/09/2026, et
// la plateforme entière est devenue inaccessible : plus une annonce sur le site,
// plus rien pour l'application, ingestion à l'arrêt.
//
// Règle : jamais `*` sur `properties`. On nomme ce qu'on affiche.
// ============================================================================

/** Champs lus par `PropertyCard`, plus la référence et le tarif des résidences. */
export const COLONNES_CARTE =
  "id,reference,titre,type_offre,categorie,prix,quartier,ville,statut," +
  "surface,nb_pieces,nb_chambres,nb_sdb,meuble,tarif_periode," +
  "created_at,validated_at," +
  "property_media(url,type,ordre,thumbnail_url),zones(nom)"
