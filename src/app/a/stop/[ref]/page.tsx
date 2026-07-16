import Link from "next/link"
import StopConfirm from "./StopConfirm"

export const metadata = { title: "Arrêter une alerte · Inaya Immo", robots: { index: false } }

export default async function StopAlertPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params
  // Jeton = numéro court « R820 » OU UUID de la requête (voie robuste sans migration).
  const token = String(ref).trim()
  const valid = token.length > 0

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <Link href="/" aria-label="Accueil Inaya">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark.svg" alt="Inaya Immo" className="inline-block w-12 h-12 rounded-2xl mb-2" />
          </Link>
          <h1 className="text-lg font-bold"><span className="text-blue-700">Inaya</span><span className="text-amber-500"> Immo</span></h1>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          {valid ? (
            <StopConfirm token={token} />
          ) : (
            <p className="text-sm text-gray-500 text-center">Numéro d&apos;alerte invalide.</p>
          )}
        </div>
      </div>
    </main>
  )
}
