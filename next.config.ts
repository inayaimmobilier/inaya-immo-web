import type { NextConfig } from "next";

// Autorise next/image à charger les médias depuis Cloudflare R2.
// On dérive le hostname de l'URL publique du bucket si elle est définie,
// sinon on autorise les domaines R2 par défaut (pub-*.r2.dev).
const remotePatterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [
  { protocol: "https", hostname: "**.r2.dev" },
  { protocol: "https", hostname: "**.r2.cloudflarestorage.com" },
];

const publicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
if (publicUrl) {
  try {
    const { hostname } = new URL(publicUrl);
    if (!hostname.endsWith(".r2.dev") && !hostname.endsWith(".r2.cloudflarestorage.com")) {
      remotePatterns.push({ protocol: "https", hostname });
    }
  } catch {
    // URL invalide : on garde les domaines par défaut
  }
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns,
    // On désactive l'optimisation next/image : nos médias sont déjà optimisés
    // à l'upload côté R2 (thumbnails générés), et l'optimizer Vercel facture
    // chaque transformation. En cas de dépassement de quota, Vercel renvoie
    // un HTTP 402 "OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED" sur /_next/image,
    // ce qui casse TOUTES les images du site (icônes brisées).
    //
    //Avec unoptimized: true, les <Image src="...r2.dev/..."> sont rendus
    // tels quels (src direct vers R2), sans passer par le proxy — plus de
    // quota, plus de 402, chargement plus rapide (1 hop au lieu de 2).
    unoptimized: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "200mb",
    },
  },
};

export default nextConfig;
