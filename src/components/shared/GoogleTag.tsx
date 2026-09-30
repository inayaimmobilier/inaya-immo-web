import Script from "next/script"

/**
 * Balise Google (Google Ads, ex. « AW-18483714391 »), réglée dans Admin →
 * Paramètres. Rendue par le layout serveur, donc présente dans le HTML de
 * CHAQUE page — c'est ce que vérifie « Tester l'installation » de Google Ads.
 *
 * Consentement (mode consentement v2 de Google) : la balise se charge tout de
 * suite mais part en « refusé » ; aucun cookie publicitaire n'est déposé tant
 * que le visiteur n'a pas accepté le bandeau. S'il accepte (maintenant ou lors
 * d'une visite précédente), on passe en « accordé ». Même règle que le Pixel
 * Meta : le bandeau cookies reste la seule source de vérité.
 *
 * Conversions : `conversions` associe un type de prise de contact à son
 * « send_to » Google Ads (AW-…/libellé), exposés à `adsConversion()`.
 */
export default function GoogleTag({ tagId, conversions }: { tagId: string | null; conversions: Record<string, string> }) {
  if (!tagId) return null
  const init = `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
var c = null; try { c = localStorage.getItem("inaya_consent"); } catch (e) {}
var etat = function (ok) { var v = ok ? "granted" : "denied"; return { ad_storage: v, ad_user_data: v, ad_personalization: v, analytics_storage: v }; };
gtag("consent", "default", etat(c === "granted"));
window.addEventListener("inaya-consent", function (e) { gtag("consent", "update", etat(e.detail === "granted")); });
window.__inayaAds = ${JSON.stringify({ conversions }).replace(/</g, "\\u003c")};
gtag("js", new Date());
gtag("config", ${JSON.stringify(tagId)}, { allow_enhanced_conversions: true });
`
  return (
    <>
      <Script id="google-tag-init" strategy="afterInteractive">{init}</Script>
      <Script id="google-tag" strategy="afterInteractive" src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(tagId)}`} />
    </>
  )
}
