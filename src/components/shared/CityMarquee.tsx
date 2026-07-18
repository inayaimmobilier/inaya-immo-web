// Bandeau défilant des communes couvertes (hero d'accueil). Défilement horizontal
// infini et fluide (CSS pur, aucun JS), pause au survol, fondu sur les bords,
// et respect de prefers-reduced-motion. Le contenu est dupliqué à l'identique pour
// une boucle sans raccord (cf. .inaya-marquee-* dans globals.css).

interface Ville { id: string; nom: string }

function CityChip({ nom }: { nom: string }) {
  return (
    <span className="group inline-flex items-center gap-2 whitespace-nowrap text-slate-300 text-xs sm:text-sm px-3.5 py-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm transition-colors hover:border-emerald-400/40 hover:bg-white/10 hover:text-white">
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70 animate-ping" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
      </span>
      {nom}
    </span>
  )
}

function Group({ villes, hidden }: { villes: Ville[]; hidden?: boolean }) {
  // gap interne + padding de fin (pr-2) = même écart au « joint » entre les copies.
  return (
    <div className="flex items-center gap-2 pr-2" aria-hidden={hidden}>
      {villes.map(v => <CityChip key={v.id} nom={v.nom} />)}
      <span className="whitespace-nowrap pr-2 text-xs text-slate-500">— Côte d&apos;Ivoire</span>
    </div>
  )
}

export default function CityMarquee({ villes }: { villes: Ville[] }) {
  const list = villes.length > 0 ? villes : [{ id: "bk", nom: "Bouaké" }]
  return (
    <div className="inaya-marquee-mask mb-5 -mx-4 overflow-hidden px-4 sm:-mx-6 sm:px-6">
      <div className="inaya-marquee-track">
        <Group villes={list} />
        {/* Deuxième copie (décor) pour la boucle continue. */}
        <Group villes={list} hidden />
      </div>
    </div>
  )
}
