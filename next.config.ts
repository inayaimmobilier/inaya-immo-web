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
  images: { remotePatterns },
  experimental: {
    serverActions: {
      bodySizeLimit: "200mb",
    },
  },
};

export default nextConfig;
