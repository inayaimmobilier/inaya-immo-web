// ============================================================================
// Mise en forme des messages et des claviers du bot admin.
// Les `callback_data` de Telegram sont limités à 64 octets : un UUID (36) plus
// un préfixe court d'action y tient, d'où le format « p:pub:<uuid> ». Ne pas
// rallonger les préfixes sans recompter.
// ============================================================================
import { esc, type Keyboard } from "./api"
import type { PropRow, Stats, UserRow } from "./ops"

export const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.inaya.ci"

const fmt = (n: number) => n.toLocaleString("fr-FR")

export const STATUT_LABEL: Record<string, string> = {
  publie: "✅ publiée",
  en_attente_validation: "⏳ en attente",
  rejete: "❌ rejetée",
  suspendu: "⏸️ suspendue",
  expire: "🕓 expirée",
  reserve: "🔒 réservée",
  conclu: "🤝 conclue",
}

export function prix(p: PropRow): string {
  if (!p.prix) return "Prix sur demande"
  const suffixe = p.type_offre === "residence_meublee" ? "/nuit" : p.type_offre === "location" ? "/mois" : ""
  return `${fmt(p.prix)} FCFA${suffixe}`
}

export function propLine(p: PropRow): string {
  const lieu = [p.quartier, p.ville].filter(Boolean).join(", ") || "lieu non précisé"
  return `<b>N°${p.reference ?? "—"}</b> · ${esc(p.titre)}\n${prix(p)} · ${esc(lieu)} · ${STATUT_LABEL[p.statut] ?? p.statut}`
}

export function propDetail(p: PropRow): string {
  const lieu = [p.quartier, p.ville].filter(Boolean).join(", ") || "non précisé"
  const d = new Date(p.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })
  const desc = p.description ? `\n\n${esc(p.description.slice(0, 600))}${p.description.length > 600 ? "…" : ""}` : ""
  return [
    `<b>N°${p.reference ?? "—"} — ${esc(p.titre)}</b>`,
    `${prix(p)}`,
    `📍 ${esc(lieu)}`,
    `🏷️ ${esc(p.type_offre)} · ${esc(p.categorie)}${p.nb_chambres ? ` · ${p.nb_chambres} ch.` : ""}`,
    `📌 ${STATUT_LABEL[p.statut] ?? p.statut}`,
    `🕐 publiée le ${d}`,
  ].join("\n") + desc
}

export function propKeyboard(p: PropRow, canDelete: boolean): Keyboard {
  const s = p.id
  const rows: Keyboard = []
  if (p.statut !== "publie") rows.push([{ text: "✅ Valider", data: `p:pub:${s}` }])
  if (p.statut !== "rejete") rows.push([{ text: "❌ Rejeter", data: `p:rej:${s}` }])
  rows.push([
    { text: "💰 Prix", data: `p:prix:${s}` },
    { text: "✏️ Titre", data: `p:titre:${s}` },
    { text: "⏸️ Suspendre", data: `p:susp:${s}` },
  ])
  if (canDelete) rows.push([{ text: "🗑️ Supprimer", data: `p:del:${s}` }])
  rows.push([{ text: "🌐 Ouvrir sur le site", url: `${SITE}/biens/${p.id}` }])
  return rows
}

export function listKeyboard(rows: PropRow[], ctx: string, page: number, total: number, perPage: number): Keyboard {
  const kb: Keyboard = rows.map(p => [{ text: `N°${p.reference ?? "—"} · ${p.titre.slice(0, 32)}`, data: `p:see:${p.id}` }])
  const nav: typeof kb[number] = []
  if (page > 0) nav.push({ text: "◀️ Précédent", data: `l:${ctx}:${page - 1}` })
  if ((page + 1) * perPage < total) nav.push({ text: "Suivant ▶️", data: `l:${ctx}:${page + 1}` })
  if (nav.length) kb.push(nav)
  kb.push([{ text: "🏠 Menu", data: "m:home" }])
  return kb
}

export function userLine(u: UserRow): string {
  const nom = `${u.prenom || ""} ${u.nom || ""}`.trim() || "Sans nom"
  return `<b>${esc(nom)}</b> · ${esc(u.role)}${u.verifie ? " · ✅ validé" : " · ⏳ non validé"}\n${esc(u.telephone || "pas de numéro")}`
}

export function userKeyboard(u: UserRow): Keyboard {
  const s = u.id
  return [[
    { text: u.verifie ? "↩️ Retirer validation" : "✅ Valider", data: `u:ver:${s}` },
    { text: "🎚️ Rôle", data: `u:role:${s}` },
  ]]
}

export function statsText(s: Stats): string {
  const top = s.topVues.length
    ? "\n\n<b>Les plus consultées (7 j)</b>\n" +
      s.topVues.map(t => `• N°${t.reference ?? "—"} ${esc(t.titre.slice(0, 40))} — ${t.vues} vues`).join("\n")
    : ""
  return [
    "<b>📊 Statistiques Inaya</b>",
    "",
    `Annonces publiées : <b>${fmt(s.publiees)}</b>`,
    `En attente de validation : <b>${fmt(s.attente)}</b>`,
    `Total au catalogue : ${fmt(s.total)}`,
    "",
    `Nouvelles annonces (24 h) : <b>${fmt(s.nouvelles24h)}</b>`,
    `Demandes reçues (24 h) : <b>${fmt(s.leads24h)}</b>`,
    `Visites du site : <b>${fmt(s.vues24h)}</b> sur 24 h · ${fmt(s.vues7j)} sur 7 j`,
    `Comptes inscrits : ${fmt(s.users)}`,
  ].join("\n") + top
}

export const MENU: Keyboard = [
  [{ text: "⏳ À valider", data: "l:attente:0" }, { text: "📋 Annonces", data: "l:recent:0" }],
  [{ text: "📊 Statistiques", data: "m:stats" }, { text: "👥 Comptes", data: "l:users:0" }],
  [{ text: "🔔 Notifications", data: "m:notifs" }, { text: "❓ Aide", data: "m:help" }],
]

export const HELP = [
  "<b>Piloter Inaya depuis Telegram</b>",
  "",
  "Vous pouvez écrire <b>en langage naturel</b> — par exemple :",
  "• « montre les annonces en attente »",
  "• « combien de visites aujourd'hui ? »",
  "• « passe l'annonce 5043 à 20000 »",
  "• « valide l'annonce 5043 »",
  "",
  "<b>Commandes</b>",
  "/menu — le tableau de bord",
  "/attente — annonces à valider",
  "/annonces [recherche] — chercher une annonce",
  "/stats — statistiques",
  "/comptes [recherche] — les utilisateurs",
  "/nouveau_compte — créer un compte",
  "/notifs — choisir les alertes reçues",
  "",
  "Les suppressions et créations de compte demandent toujours une confirmation.",
].join("\n")
