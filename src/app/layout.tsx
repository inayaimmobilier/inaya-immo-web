import type { Metadata } from "next"
import { Geist } from "next/font/google"
import "./globals.css"
import ChatWidget from "@/components/assistant/ChatWidget"

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" })

export const metadata: Metadata = {
  title: {
    default: "Inaya Immo — Location & Vente à Bouaké",
    template: "%s | Inaya Immo",
  },
  description:
    "Trouvez votre bien immobilier à Bouaké. Location, vente, appartements, maisons, terrains. Inaya Immo — votre maison, en de bonnes mains.",
  keywords: ["immobilier", "bouaké", "location", "vente", "maison", "appartement", "côte d'ivoire"],
  openGraph: {
    title: "Inaya Immo — Location & Vente à Bouaké",
    description: "Trouvez votre bien immobilier à Bouaké.",
    type: "website",
    locale: "fr_CI",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <ChatWidget />
      </body>
    </html>
  )
}
