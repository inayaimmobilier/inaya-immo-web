// ============================================================================
// Envoi d'e-mails transactionnels via Resend (HTTP API, sans dépendance npm).
// Activé uniquement si RESEND_API_KEY est défini — sinon no-op silencieux
// (même logique « pluggable » que le SMS). On pourra brancher un autre
// fournisseur en ne touchant qu'à ce fichier.
//   RESEND_API_KEY   → clé API Resend (obligatoire pour envoyer)
//   RESEND_FROM      → expéditeur, ex. "Inaya Immo <no-reply@inaya.ci>"
// ============================================================================

/** Vrai si un fournisseur e-mail est configuré (permet d'exposer le canal Email). */
export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY
}

/**
 * Envoie un e-mail. Échoue « en douceur » (log only) pour ne jamais bloquer le
 * flux appelant. Retourne true si l'envoi a été accepté par le fournisseur.
 */
export async function sendEmail(to: string | null | undefined, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn("INAYA-MAIL-001 RESEND_API_KEY absent — e-mail ignoré")
    return false
  }
  const dest = to?.trim()
  if (!dest || !dest.includes("@")) {
    console.warn("INAYA-MAIL-002 destinataire e-mail invalide", to)
    return false
  }
  const from = process.env.RESEND_FROM ?? "Inaya Immo <no-reply@inaya.ci>"

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: dest, subject, html }),
    })
    if (!res.ok) {
      console.error("INAYA-MAIL-003 échec envoi", res.status, await res.text().catch(() => ""))
      return false
    }
    return true
  } catch (e) {
    console.error("INAYA-MAIL-004", (e as Error).message)
    return false
  }
}
