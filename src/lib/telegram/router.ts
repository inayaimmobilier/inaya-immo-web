// ============================================================================
// Routeur du bot admin : commandes, appuis sur les boutons, étapes d'édition,
// et repli en langage naturel (« valide l'annonce 5043 ») via l'assistant IA
// équipé d'outils. Toute action destructrice passe par une confirmation.
// ============================================================================
import { runAssistant, type ToolSpec } from "@/lib/llm"
import { esc, tgAnswer, tgEdit, tgSend, type Keyboard } from "./api"
import { clearState, getState, setState, whoIs, type TgUser } from "./guard"
import * as ops from "./ops"
import {
  HELP, MENU, listKeyboard, propDetail, propKeyboard, propLine,
  statsText, userKeyboard, userLine,
} from "./ui"
import { getNotifPrefs, notifKeyboard, toggleNotifPref } from "./notify"

const PER_PAGE = 5
const DENIED = "⛔️ Ce compte Telegram n'est pas autorisé à piloter Inaya.\n\nDemandez à un administrateur de vous envoyer votre lien de connexion depuis Admin → Utilisateurs."

// ── Listes ──────────────────────────────────────────────────────────────────

type ListCtx = "attente" | "recent" | "users" | string

async function sendList(chatId: string, ctx: ListCtx, page: number, messageId?: number) {
  if (ctx === "users") {
    const { rows, total } = await ops.listUsers({ page, perPage: 8 })
    const text = rows.length
      ? `<b>👥 Comptes</b> (${total})\n\n${rows.map(userLine).join("\n\n")}`
      : "Aucun compte."
    const kb: Keyboard = rows.map(u => [{ text: `${u.prenom || ""} ${u.nom || "—"}`.trim(), data: `u:see:${u.id}` }])
    const nav: Keyboard[number] = []
    if (page > 0) nav.push({ text: "◀️", data: `l:users:${page - 1}` })
    if ((page + 1) * 8 < total) nav.push({ text: "▶️", data: `l:users:${page + 1}` })
    if (nav.length) kb.push(nav)
    kb.push([{ text: "➕ Nouveau compte", data: "u:new:" }, { text: "🏠 Menu", data: "m:home" }])
    return messageId ? tgEdit(chatId, messageId, text, kb) : tgSend(chatId, text, kb)
  }

  const statut = ctx === "attente" ? "en_attente_validation" : undefined
  const q = ctx.startsWith("q=") ? ctx.slice(2) : undefined
  const { rows, total } = await ops.listProperties({ statut, q, page, perPage: PER_PAGE })
  const titre = ctx === "attente" ? "⏳ Annonces à valider" : q ? `🔎 Recherche « ${esc(q)} »` : "📋 Dernières annonces"
  const text = rows.length
    ? `<b>${titre}</b> — ${total} résultat${total > 1 ? "s" : ""}\n\n${rows.map(propLine).join("\n\n")}`
    : `<b>${titre}</b>\n\nAucun résultat.`
  const kb = listKeyboard(rows, ctx, page, total, PER_PAGE)
  return messageId ? tgEdit(chatId, messageId, text, kb) : tgSend(chatId, text, kb)
}

async function sendProp(chatId: string, me: TgUser, id: string, messageId?: number) {
  const p = await ops.getProperty(id)
  if (!p) return tgSend(chatId, "Annonce introuvable (peut-être déjà supprimée).")
  const kb = propKeyboard(p, me.peutSupprimer)
  return messageId ? tgEdit(chatId, messageId, propDetail(p), kb) : tgSend(chatId, propDetail(p), kb)
}

// ── Messages texte ──────────────────────────────────────────────────────────

export async function onMessage(chatId: string, text: string, from: { id: number }): Promise<void> {
  // 1) Lien de connexion : seul cas autorisé sans être déjà identifié.
  const start = text.match(/^\/start\s+([0-9a-f-]{36})$/i)
  if (start) return void linkAccount(chatId, start[1])

  const me = await whoIs(chatId)
  if (!me) { await tgSend(chatId, DENIED); return }

  // 2) Étape en cours (saisie d'un prix, confirmation…) — prioritaire.
  const state = await getState(chatId)
  if (state && !text.startsWith("/")) {
    await clearState(chatId, me.id)
    return void handleStateInput(chatId, me, state, text)
  }

  const [cmd, ...rest] = text.trim().split(/\s+/)
  const arg = rest.join(" ").trim()

  switch (cmd.toLowerCase().replace(/@.*$/, "")) {
    case "/start":
    case "/menu":
      await tgSend(chatId, `Bonjour <b>${esc(me.nom)}</b> 👋\nQue voulez-vous faire ?`, MENU); return
    case "/aide":
    case "/help":
      await tgSend(chatId, HELP, MENU); return
    case "/attente":
      await sendList(chatId, "attente", 0); return
    case "/annonces":
      await sendList(chatId, arg ? `q=${arg}` : "recent", 0); return
    case "/comptes":
    case "/users": {
      if (!arg) { await sendList(chatId, "users", 0); return }
      const { rows, total } = await ops.listUsers({ q: arg, perPage: 8 })
      const body = rows.length ? rows.map(userLine).join("\n\n") : "Aucun compte trouvé."
      await tgSend(chatId, `<b>👥 ${total} résultat(s)</b>\n\n${body}`,
        rows.map(u => [{ text: `${u.prenom || ""} ${u.nom || "—"}`.trim(), data: `u:see:${u.id}` }]))
      return
    }
    case "/stats":
      await tgSend(chatId, statsText(await ops.stats()), MENU); return
    case "/notifs":
      await tgSend(chatId, "<b>🔔 Alertes reçues ici</b>\nTouchez pour activer ou couper.", notifKeyboard(await getNotifPrefs()))
      return
    case "/nouveau_compte": {
      if (!me.peutGererComptes) { await tgSend(chatId, "⛔️ Réservé aux administrateurs."); return }
      await setState(chatId, me.id, { kind: "create_user" })
      await tgSend(chatId,
        "➕ <b>Nouveau compte</b>\nEnvoyez :\n<code>Nom ; email ; mot de passe ; rôle</code>")
      return
    }
    default:
      // 3) Ni commande ni étape → langage naturel.
      await naturalLanguage(chatId, me, text)
  }
}

/** /start <uuid> : rattache ce chat au profil staff correspondant. */
async function linkAccount(chatId: string, profileId: string): Promise<void> {
  const { createAdminClient } = await import("@/lib/supabase/server")
  const db = createAdminClient()
  const { data } = await db.from("profiles").select("id,nom,prenom,role")
    .eq("id", profileId).in("role", ["agent", "moderateur", "admin", "super_admin"]).maybeSingle()
  const p = data as { nom: string | null; prenom: string | null } | null
  if (!p) { await tgSend(chatId, "❌ Lien invalide ou expiré. Demandez un nouveau lien à votre administrateur."); return }
  // Un chat Telegram ne peut appartenir qu'à UN profil : on détache d'abord
  // tout autre profil qui le porterait. Sans cela plusieurs profils finissent
  // par partager le même chat_id et l'identification devient ambiguë.
  await db.from("profiles").update({ telegram_chat_id: null } as never)
    .eq("telegram_chat_id", chatId).neq("id", profileId)
  await db.from("profiles").update({ telegram_chat_id: chatId } as never).eq("id", profileId)
  const nom = `${p.prenom || ""} ${p.nom || ""}`.trim() || "Administrateur"
  await tgSend(chatId,
    `✅ Bonjour <b>${esc(nom)}</b>, votre Telegram est connecté à Inaya Immo.\n\n` +
    "Vous recevrez ici l'activité de la plateforme et vous pouvez la piloter directement.",
    MENU)
}

// ── Étapes (saisie attendue) ────────────────────────────────────────────────

async function handleStateInput(chatId: string, me: TgUser, state: { kind: string; [k: string]: unknown }, text: string) {
  switch (state.kind) {
    case "edit_field": {
      const r = await ops.patchProperty(String(state.id), String(state.field), text)
      await tgSend(chatId, r.ok ? `✅ ${r.message}` : `⚠️ ${r.error}`)
      if (r.ok) await sendProp(chatId, me, String(state.id))
      return
    }
    case "create_user": {
      // Format attendu : Nom ; email ; mot de passe ; rôle
      const [nom, email, password, role] = text.split(";").map(s => s.trim())
      if (!nom || !email || !password) {
        await tgSend(chatId, "⚠️ Format attendu :\n<code>Nom ; email ; mot de passe ; rôle</code>")
        return
      }
      const r = await ops.createUser({ nom, email, password, role: role || "client" }, me)
      await tgSend(chatId, r.ok ? `✅ ${r.message}` : `⚠️ ${r.error}`, MENU)
      return
    }
    default:
      await tgSend(chatId, "Étape expirée — reprenez depuis le menu.", MENU)
  }
}

// ── Boutons ─────────────────────────────────────────────────────────────────

export async function onCallback(
  chatId: string, messageId: number, data: string, callbackId: string,
): Promise<void> {
  const me = await whoIs(chatId)
  if (!me) { await tgAnswer(callbackId, "Accès non autorisé", true); return }

  const [ns, action, ...restParts] = data.split(":")
  const id = restParts.join(":")

  try {
    if (ns === "m") {
      await tgAnswer(callbackId)
      if (action === "home") return void tgEdit(chatId, messageId, "Que voulez-vous faire ?", MENU)
      if (action === "stats") return void tgEdit(chatId, messageId, statsText(await ops.stats()), MENU)
      if (action === "help") return void tgEdit(chatId, messageId, HELP, MENU)
      if (action === "notifs") return void tgEdit(chatId, messageId, "<b>🔔 Alertes reçues ici</b>", notifKeyboard(await getNotifPrefs()))
      return
    }

    if (ns === "l") { await tgAnswer(callbackId); return void sendList(chatId, action, Number(id) || 0, messageId) }

    if (ns === "n") { // bascule d'une préférence de notification
      const prefs = await toggleNotifPref(action)
      await tgAnswer(callbackId, "Enregistré")
      return void tgEdit(chatId, messageId, "<b>🔔 Alertes reçues ici</b>", notifKeyboard(prefs))
    }

    if (ns === "p") return void onPropAction(chatId, messageId, callbackId, me, action, id)
    if (ns === "u") return void onUserAction(chatId, messageId, callbackId, me, action, id)

    await tgAnswer(callbackId)
  } catch (e) {
    console.error("INAYA-TG-CB", data, e)
    await tgAnswer(callbackId, "Une erreur est survenue", true)
  }
}

async function onPropAction(chatId: string, messageId: number, cbId: string, me: TgUser, action: string, id: string) {
  switch (action) {
    case "see":
      await tgAnswer(cbId); return void sendProp(chatId, me, id, messageId)
    case "pub": case "rej": case "susp": {
      const statut = action === "pub" ? "publie" : action === "rej" ? "rejete" : "suspendu"
      const r = await ops.setStatut(id, statut)
      await tgAnswer(cbId, r.ok ? r.message : r.error, !r.ok)
      if (r.ok) await sendProp(chatId, me, id, messageId)
      return
    }
    case "prix": case "titre": {
      await tgAnswer(cbId)
      const ok = await setState(chatId, me.id, { kind: "edit_field", id, field: action === "prix" ? "prix" : "titre" })
      await tgSend(chatId, !ok
        ? "⚠️ Modification en deux temps indisponible (migration 051 à appliquer). Dites-moi plutôt : « passe l'annonce N° … à 150000 »."
        : action === "prix"
          ? "💰 Envoyez le <b>nouveau prix</b> en chiffres (ex. <code>150000</code>)."
          : "✏️ Envoyez le <b>nouveau titre</b>.")
      return
    }
    case "del": {
      if (!me.peutSupprimer) { await tgAnswer(cbId, "Réservé aux administrateurs", true); return }
      await tgAnswer(cbId)
      const p = await ops.getProperty(id)
      await tgEdit(chatId, messageId,
        `⚠️ <b>Supprimer définitivement</b> l'annonce N°${p?.reference ?? "—"} ?\n${esc(p?.titre ?? "")}\n\nCette action est irréversible.`,
        [[{ text: "🗑️ Oui, supprimer", data: `p:delok:${id}` }, { text: "Annuler", data: `p:see:${id}` }]])
      return
    }
    case "delok": {
      const r = await ops.removeProperty(id, me)
      await tgAnswer(cbId, r.ok ? r.message : r.error, !r.ok)
      await tgEdit(chatId, messageId, r.ok ? "🗑️ Annonce supprimée." : `⚠️ ${esc(r.error)}`, MENU)
      return
    }
    default: await tgAnswer(cbId)
  }
}

async function onUserAction(chatId: string, messageId: number, cbId: string, me: TgUser, action: string, id: string) {
  if (action === "see") {
    const u = await ops.getUser(id)
    await tgAnswer(cbId)
    if (!u) return void tgSend(chatId, "Compte introuvable.")
    return void tgEdit(chatId, messageId, userLine(u), userKeyboard(u))
  }
  if (action === "ver") {
    const u = await ops.getUser(id)
    if (!u) { await tgAnswer(cbId, "Compte introuvable", true); return }
    const r = await ops.setUserVerified(id, !u.verifie, me)
    await tgAnswer(cbId, r.ok ? r.message : r.error, !r.ok)
    if (r.ok) {
      const fresh = await ops.getUser(id)
      if (fresh) await tgEdit(chatId, messageId, userLine(fresh), userKeyboard(fresh))
    }
    return
  }
  if (action === "new") {
    if (!me.peutGererComptes) { await tgAnswer(cbId, "Réservé aux administrateurs", true); return }
    await tgAnswer(cbId)
    await setState(chatId, me.id, { kind: "create_user" })
    return void tgSend(chatId,
      "➕ <b>Nouveau compte</b>\nEnvoyez les informations sur une seule ligne, séparées par des points-virgules :\n\n" +
      "<code>Nom ; email ; mot de passe ; rôle</code>\n\n" +
      "Rôles possibles : client, agent, moderateur, admin.\nExemple :\n" +
      "<code>Awa Koné ; awa@inaya.ci ; MotDePasse12 ; agent</code>")
  }
  if (action === "role") {
    await tgAnswer(cbId)
    return void tgEdit(chatId, messageId, "Nouveau rôle ?",
      [["client", "agent", "moderateur"].map(r => ({ text: r, data: `u:set_${r}:${id}` })),
       [{ text: "admin", data: `u:set_admin:${id}` }, { text: "◀️ Retour", data: `u:see:${id}` }]])
  }
  if (action.startsWith("set_")) {
    const r = await ops.setUserRole(id, action.slice(4), me)
    await tgAnswer(cbId, r.ok ? r.message : r.error, !r.ok)
    return
  }
  await tgAnswer(cbId)
}

// ── Langage naturel ─────────────────────────────────────────────────────────

const TOOLS: ToolSpec[] = [
  {
    name: "lister_annonces",
    description: "Liste ou recherche des annonces. Utiliser statut='en_attente_validation' pour celles à valider.",
    parameters: {
      type: "object",
      properties: {
        statut: { type: "string", description: "publie, en_attente_validation, rejete, suspendu, expire" },
        recherche: { type: "string", description: "mots-clés, quartier, ou numéro de référence" },
        ville: { type: "string" },
      },
    },
  },
  {
    name: "voir_annonce",
    description: "Affiche le détail d'une annonce à partir de son numéro de référence.",
    parameters: { type: "object", properties: { reference: { type: "number" } }, required: ["reference"] },
  },
  {
    name: "changer_statut",
    description: "Valide (publie), rejette, suspend ou expire une annonce désignée par sa référence.",
    parameters: {
      type: "object",
      properties: {
        reference: { type: "number" },
        statut: { type: "string", description: "publie, rejete, suspendu, expire, reserve, conclu" },
      },
      required: ["reference", "statut"],
    },
  },
  {
    name: "modifier_annonce",
    description: "Modifie un champ d'une annonce (prix, titre, description, quartier, ville, nb_chambres).",
    parameters: {
      type: "object",
      properties: {
        reference: { type: "number" },
        champ: { type: "string" },
        valeur: { type: "string" },
      },
      required: ["reference", "champ", "valeur"],
    },
  },
  {
    name: "statistiques",
    description: "Chiffres de la plateforme : annonces, visites, demandes, comptes.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "chercher_compte",
    description: "Recherche un utilisateur par nom ou numéro de téléphone.",
    parameters: { type: "object", properties: { recherche: { type: "string" } }, required: ["recherche"] },
  },
]

const SYSTEM = `Tu es l'assistant d'administration d'Inaya Immo, plateforme immobilière à Bouaké (Côte d'Ivoire).
Tu parles à un administrateur via Telegram. Réponds en français, brièvement, sans fioritures.
Utilise les outils pour lire ou modifier la plateforme. Les annonces sont désignées par leur NUMÉRO DE RÉFÉRENCE.
Ne prétends JAMAIS avoir fait une action sans avoir appelé l'outil correspondant.
Tu ne peux pas supprimer d'annonce ni créer de compte : pour cela, indique à l'administrateur d'ouvrir
l'annonce (« /annonces <référence> ») et d'utiliser le bouton, qui demande une confirmation.
Formatage : texte simple, éventuellement <b>gras</b>. Pas de Markdown.`

async function naturalLanguage(chatId: string, me: TgUser, text: string): Promise<void> {
  const exec = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    switch (name) {
      case "lister_annonces": {
        const { rows, total } = await ops.listProperties({
          statut: args.statut as string | undefined,
          q: args.recherche as string | undefined,
          ville: args.ville as string | undefined,
          perPage: 8,
        })
        return { total, annonces: rows.map(r => ({ reference: r.reference, titre: r.titre, prix: r.prix, statut: r.statut, quartier: r.quartier, ville: r.ville })) }
      }
      case "voir_annonce": {
        const p = await ops.getByReference(Number(args.reference))
        return p ?? { erreur: "introuvable" }
      }
      case "changer_statut": {
        const p = await ops.getByReference(Number(args.reference))
        if (!p) return { erreur: "annonce introuvable" }
        return await ops.setStatut(p.id, String(args.statut))
      }
      case "modifier_annonce": {
        const p = await ops.getByReference(Number(args.reference))
        if (!p) return { erreur: "annonce introuvable" }
        return await ops.patchProperty(p.id, String(args.champ), String(args.valeur))
      }
      case "statistiques":
        return await ops.stats()
      case "chercher_compte": {
        const { rows, total } = await ops.listUsers({ q: String(args.recherche), perPage: 8 })
        return { total, comptes: rows.map(u => ({ nom: `${u.prenom || ""} ${u.nom || ""}`.trim(), role: u.role, telephone: u.telephone, valide: u.verifie })) }
      }
      default:
        return { erreur: "outil inconnu" }
    }
  }

  const r = await runAssistant({ system: SYSTEM, history: [{ role: "user", text }], tools: TOOLS, exec })
  await tgSend(chatId, r.ok ? r.reply : `⚠️ ${esc(r.error)}`, MENU)
}
