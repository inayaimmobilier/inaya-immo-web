import type { Metadata } from "next"
import { Geist } from "next/font/google"
import "./globals.css"
import ChatWidget from "@/components/assistant/ChatWidget"
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION, absoluteUrl } from "@/lib/site"

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" })

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Inaya Immo — Location & Vente immobilière à Bouaké",
    template: "%s | Inaya Immo",
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "immobilier Bouaké", "location Bouaké", "vente maison Bouaké", "appartement Bouaké",
    "terrain Bouaké", "villa Bouaké", "résidence meublée Bouaké", "cession de bail",
    "agence immobilière Côte d'Ivoire", "location appartement Côte d'Ivoire", "Inaya Immo",
  ],
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME }],
  alternates: { canonical: "/" },
  robots: {
    index: true, follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  openGraph: {
    title: "Inaya Immo — Location & Vente immobilière à Bouaké",
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    type: "website",
    locale: "fr_CI",
  },
  twitter: {
    card: "summary_large_image",
    title: "Inaya Immo — Location & Vente immobilière à Bouaké",
    description: SITE_DESCRIPTION,
  },
}

// JSON-LD : identité de l'agence (aide Google + assistants IA à comprendre
// « qui » publie et « où » — signal E-E-A-T fort et directement citable par les IA).
const orgJsonLd = {
  "@context": "https://schema.org",
  "@type": "RealEstateAgent",
  name: SITE_NAME,
  description: SITE_DESCRIPTION,
  url: SITE_URL,
  logo: absoluteUrl("/logo-mark.svg"),
  areaServed: { "@type": "City", name: "Bouaké", address: { "@type": "PostalAddress", addressCountry: "CI", addressLocality: "Bouaké" } },
  address: { "@type": "PostalAddress", addressLocality: "Bouaké", addressCountry: "CI" },
  knowsLanguage: ["fr"],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }} />
        {children}
        <ChatWidget />
      </body>
    </html>
  )
}
