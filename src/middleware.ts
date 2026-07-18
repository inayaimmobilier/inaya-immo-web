import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

// ============================================================================
// Middleware d'accès. Remplace l'ancien src/proxy.ts (jamais branché, donc
// inerte). Le matcher ci-dessous ne cible QUE les espaces protégés : les pages
// publiques (accueil, /biens, /recherche…) ne subissent aucun appel réseau
// supplémentaire — important pour le TTFB et le SEO.
//
// Deux garanties :
//  1. Espaces protégés → connexion obligatoire (sinon /connexion).
//  2. Espaces libre-service (client, propriétaire, locataire, prestataire,
//     apporteur) → compte VÉRIFIÉ obligatoire. Un compte créé mais dont l'OTP
//     n'a jamais été validé (ex. faux numéro) est renvoyé vers /verifier et ne
//     peut PAS accéder à son tableau de bord. Les comptes staff (créés par un
//     admin, sans OTP) sont exemptés de cette exigence.
// ============================================================================

// Espaces réservés aux comptes libre-service : exigent verifie=true.
const SELF_SERVICE = ["/client", "/proprietaire", "/locataire", "/prestataire", "/apporteur"]
// Rôles internes : exemptés de la vérification OTP (créés par un admin).
const STAFF_ROLES = ["super_admin", "admin", "moderateur", "agent", "comptable"]

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options))
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname

  // 1. Connexion obligatoire sur tout espace protégé.
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = "/connexion"
    url.searchParams.set("redirect", pathname)
    return NextResponse.redirect(url)
  }

  // 2. Verrou de vérification sur les espaces libre-service.
  if (SELF_SERVICE.some(r => pathname.startsWith(r))) {
    const { data } = await supabase.from("profiles").select("role, verifie").eq("id", user.id).single()
    const profile = data as { role: string; verifie: boolean } | null
    const isStaff = !!profile && STAFF_ROLES.includes(profile.role)
    if (profile && !profile.verifie && !isStaff) {
      const url = request.nextUrl.clone()
      url.pathname = "/verifier"
      url.searchParams.set("redirect", pathname)
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // SÉCURITÉ (défense en profondeur) : /admin exige une session. Chaque page
    // admin vérifie déjà le RÔLE ; ce verrou global garantit qu'aucune page
    // admin oubliée ne soit servie à un visiteur non connecté.
    "/admin/:path*",
    "/client/:path*",
    "/proprietaire/:path*",
    "/locataire/:path*",
    "/prestataire/:path*",
    "/apporteur/:path*",
  ],
}
