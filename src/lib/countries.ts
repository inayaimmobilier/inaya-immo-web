// ============================================================================
// Liste des pays pour le sélecteur d'indicatif téléphonique (inscription).
// La Côte d'Ivoire est placée EN TÊTE (plateforme ivoirienne), les autres
// pays suivent par ordre alphabétique du nom français.
// ============================================================================

export interface Country {
  /** Code ISO 3166-1 alpha-2 (sert aussi à générer le drapeau emoji). */
  iso: string
  /** Indicatif international avec le « + » (ex. « +225 »). */
  dial: string
  /** Nom en français. */
  name: string
}

/** Drapeau emoji dérivé du code ISO (CI → 🇨🇮). */
export function flagEmoji(iso: string): string {
  if (!iso || iso.length !== 2) return "🏳️"
  const base = 0x1f1e6 - 65 // 'A'
  return String.fromCodePoint(
    base + iso.toUpperCase().charCodeAt(0),
    base + iso.toUpperCase().charCodeAt(1),
  )
}

// Données brutes (ordre libre) — indicatif + nom français + ISO.
const RAW: [string, string, string][] = [
  // ── Afrique de l'Ouest / Centrale (prioritaire pour Inaya) ─────────────────
  ["+225", "Côte d'Ivoire", "CI"],
  ["+226", "Burkina Faso", "BF"],
  ["+223", "Mali", "ML"],
  ["+221", "Sénégal", "SN"],
  ["+224", "Guinée", "GN"],
  ["+229", "Bénin", "BJ"],
  ["+228", "Togo", "TG"],
  ["+227", "Niger", "NE"],
  ["+237", "Cameroun", "CM"],
  ["+241", "Gabon", "GA"],
  ["+242", "Congo", "CG"],
  ["+243", "Congo (RDC)", "CD"],
  ["+235", "Tchad", "TD"],
  ["+236", "Centrafrique", "CF"],
  ["+233", "Ghana", "GH"],
  ["+234", "Nigeria", "NG"],
  ["+232", "Sierra Leone", "SL"],
  ["+231", "Liberia", "LR"],
  ["+222", "Mauritanie", "MR"],
  ["+220", "Gambie", "GM"],
  ["+245", "Guinée-Bissau", "GW"],
  ["+238", "Cap-Vert", "CV"],
  // ── Afrique du Nord ───────────────────────────────────────────────────────
  ["+212", "Maroc", "MA"],
  ["+213", "Algérie", "DZ"],
  ["+216", "Tunisie", "TN"],
  ["+218", "Libye", "LY"],
  ["+20", "Égypte", "EG"],
  ["+249", "Soudan", "SD"],
  ["+251", "Éthiopie", "ET"],
  // ── Afrique de l'Est / Australe ───────────────────────────────────────────
  ["+254", "Kenya", "KE"],
  ["+255", "Tanzanie", "TZ"],
  ["+256", "Ouganda", "UG"],
  ["+250", "Rwanda", "RW"],
  ["+257", "Burundi", "BI"],
  ["+261", "Madagascar", "MG"],
  ["+230", "Maurice", "MU"],
  ["+260", "Zambie", "ZM"],
  ["+263", "Zimbabwe", "ZW"],
  ["+27", "Afrique du Sud", "ZA"],
  ["+264", "Namibie", "NA"],
  ["+267", "Botswana", "BW"],
  ["+258", "Mozambique", "MZ"],
  ["+244", "Angola", "AO"],
  ["+265", "Malawi", "MW"],
  ["+266", "Lesotho", "LS"],
  ["+268", "Eswatini", "SZ"],
  ["+269", "Comores", "KM"],
  ["+253", "Djibouti", "DJ"],
  ["+291", "Érythrée", "ER"],
  ["+252", "Somalie", "SO"],
  ["+239", "São Tomé-et-Principe", "ST"],
  ["+240", "Guinée équatoriale", "GQ"],
  // ── Europe ────────────────────────────────────────────────────────────────
  ["+33", "France", "FR"],
  ["+32", "Belgique", "BE"],
  ["+41", "Suisse", "CH"],
  ["+352", "Luxembourg", "LU"],
  ["+377", "Monaco", "MC"],
  ["+49", "Allemagne", "DE"],
  ["+39", "Italie", "IT"],
  ["+34", "Espagne", "ES"],
  ["+351", "Portugal", "PT"],
  ["+44", "Royaume-Uni", "GB"],
  ["+353", "Irlande", "IE"],
  ["+31", "Pays-Bas", "NL"],
  ["+43", "Autriche", "AT"],
  ["+48", "Pologne", "PL"],
  ["+7", "Russie", "RU"],
  ["+380", "Ukraine", "UA"],
  ["+40", "Roumanie", "RO"],
  ["+30", "Grèce", "GR"],
  ["+90", "Turquie", "TR"],
  ["+46", "Suède", "SE"],
  ["+47", "Norvège", "NO"],
  ["+45", "Danemark", "DK"],
  ["+358", "Finlande", "FI"],
  ["+354", "Islande", "IS"],
  ["+420", "Tchéquie", "CZ"],
  ["+421", "Slovaquie", "SK"],
  ["+36", "Hongrie", "HU"],
  ["+359", "Bulgarie", "BG"],
  ["+385", "Croatie", "HR"],
  ["+381", "Serbie", "RS"],
  ["+386", "Slovénie", "SI"],
  ["+370", "Lituanie", "LT"],
  ["+371", "Lettonie", "LV"],
  ["+372", "Estonie", "EE"],
  ["+375", "Biélorussie", "BY"],
  ["+373", "Moldavie", "MD"],
  ["+355", "Albanie", "AL"],
  ["+387", "Bosnie-Herzégovine", "BA"],
  ["+389", "Macédoine du Nord", "MK"],
  ["+382", "Monténégro", "ME"],
  ["+357", "Chypre", "CY"],
  ["+356", "Malte", "MT"],
  ["+376", "Andorre", "AD"],
  ["+995", "Géorgie", "GE"],
  ["+374", "Arménie", "AM"],
  ["+994", "Azerbaïdjan", "AZ"],
  // ── Amériques ─────────────────────────────────────────────────────────────
  ["+1", "Canada", "CA"],
  ["+1", "États-Unis", "US"],
  ["+52", "Mexique", "MX"],
  ["+55", "Brésil", "BR"],
  ["+54", "Argentine", "AR"],
  ["+56", "Chili", "CL"],
  ["+57", "Colombie", "CO"],
  ["+51", "Pérou", "PE"],
  ["+58", "Venezuela", "VE"],
  ["+593", "Équateur", "EC"],
  ["+591", "Bolivie", "BO"],
  ["+595", "Paraguay", "PY"],
  ["+598", "Uruguay", "UY"],
  ["+53", "Cuba", "CU"],
  ["+509", "Haïti", "HT"],
  ["+502", "Guatemala", "GT"],
  ["+504", "Honduras", "HN"],
  ["+503", "Salvador", "SV"],
  ["+505", "Nicaragua", "NI"],
  ["+506", "Costa Rica", "CR"],
  ["+507", "Panama", "PA"],
  ["+592", "Guyana", "GY"],
  ["+597", "Suriname", "SR"],
  ["+1", "République dominicaine", "DO"],
  ["+1", "Jamaïque", "JM"],
  ["+1", "Porto Rico", "PR"],
  ["+1", "Trinité-et-Tobago", "TT"],
  // ── Asie ──────────────────────────────────────────────────────────────────
  ["+86", "Chine", "CN"],
  ["+91", "Inde", "IN"],
  ["+81", "Japon", "JP"],
  ["+82", "Corée du Sud", "KR"],
  ["+850", "Corée du Nord", "KP"],
  ["+92", "Pakistan", "PK"],
  ["+880", "Bangladesh", "BD"],
  ["+62", "Indonésie", "ID"],
  ["+63", "Philippines", "PH"],
  ["+84", "Vietnam", "VN"],
  ["+66", "Thaïlande", "TH"],
  ["+60", "Malaisie", "MY"],
  ["+65", "Singapour", "SG"],
  ["+95", "Myanmar", "MM"],
  ["+855", "Cambodge", "KH"],
  ["+856", "Laos", "LA"],
  ["+93", "Afghanistan", "AF"],
  ["+98", "Iran", "IR"],
  ["+964", "Irak", "IQ"],
  ["+966", "Arabie Saoudite", "SA"],
  ["+971", "Émirats Arabes Unis", "AE"],
  ["+974", "Qatar", "QA"],
  ["+965", "Koweït", "KW"],
  ["+973", "Bahreïn", "BH"],
  ["+968", "Oman", "OM"],
  ["+967", "Yémen", "YE"],
  ["+962", "Jordanie", "JO"],
  ["+961", "Liban", "LB"],
  ["+963", "Syrie", "SY"],
  ["+972", "Israël", "IL"],
  ["+970", "Palestine", "PS"],
  ["+977", "Népal", "NP"],
  ["+94", "Sri Lanka", "LK"],
  ["+960", "Maldives", "MV"],
  ["+975", "Bhoutan", "BT"],
  ["+673", "Brunei", "BN"],
  ["+670", "Timor oriental", "TL"],
  ["+976", "Mongolie", "MN"],
  ["+886", "Taïwan", "TW"],
  ["+852", "Hong Kong", "HK"],
  ["+853", "Macao", "MO"],
  ["+7", "Kazakhstan", "KZ"],
  ["+992", "Tadjikistan", "TJ"],
  ["+993", "Turkménistan", "TM"],
  ["+996", "Kirghizistan", "KG"],
  ["+998", "Ouzbékistan", "UZ"],
  // ── Océanie ───────────────────────────────────────────────────────────────
  ["+61", "Australie", "AU"],
  ["+64", "Nouvelle-Zélande", "NZ"],
  ["+679", "Fidji", "FJ"],
  ["+675", "Papouasie-Nouvelle-Guinée", "PG"],
  ["+685", "Samoa", "WS"],
  ["+676", "Tonga", "TO"],
  ["+678", "Vanuatu", "VU"],
  ["+677", "Îles Salomon", "SB"],
]

const buildCountry = ([dial, name, iso]: [string, string, string]): Country => ({ iso, dial, name })

// Côte d'Ivoire en tête, le reste par ordre alphabétique du nom français.
// (les doublons d'indicatif comme +1 / +7 sont distingués par le nom du pays).
const CI = RAW.find(([, name]) => name === "Côte d'Ivoire")!
const REST = RAW.filter(([, name]) => name !== "Côte d'Ivoire")
  .sort((a, b) => a[1].localeCompare(b[1], "fr"))

/** Liste ordonnée : Côte d'Ivoire puis le reste alphabétique. */
export const COUNTRIES: Country[] = [buildCountry(CI), ...REST.map(buildCountry)]

/** Pays par défaut (Côte d'Ivoire). */
export const DEFAULT_COUNTRY: Country = COUNTRIES[0]
