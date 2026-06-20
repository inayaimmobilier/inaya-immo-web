# Structure du projet Next.js — Inaya Immo

```
web/
├── src/
│   ├── app/                        # App Router Next.js
│   │   ├── (public)/               # Pages publiques (catalogue, fiche bien)
│   │   │   ├── page.tsx            # Accueil / catalogue
│   │   │   ├── biens/
│   │   │   │   ├── page.tsx        # Liste des annonces
│   │   │   │   └── [id]/page.tsx   # Fiche détail d'un bien
│   │   │   └── recherche/page.tsx  # Recherche avancée
│   │   ├── (auth)/                 # Auth (login, inscription)
│   │   │   ├── connexion/page.tsx
│   │   │   └── inscription/page.tsx
│   │   ├── (client)/               # Espace client connecté
│   │   │   ├── favoris/page.tsx
│   │   │   ├── mes-requetes/page.tsx
│   │   │   └── profil/page.tsx
│   │   ├── (admin)/                # Back-office admin
│   │   │   ├── layout.tsx          # Layout admin avec sidebar
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── annonces/
│   │   │   │   ├── page.tsx        # Liste + validation
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── leads/page.tsx
│   │   │   ├── transactions/page.tsx
│   │   │   ├── commissions/page.tsx
│   │   │   ├── utilisateurs/page.tsx
│   │   │   ├── whatsapp/page.tsx   # Gestion sessions WhatsApp
│   │   │   └── parametres/page.tsx
│   │   ├── api/                    # API Routes Next.js
│   │   │   ├── webhooks/
│   │   │   │   └── whatsapp/route.ts
│   │   │   ├── ai/
│   │   │   │   ├── chat/route.ts
│   │   │   │   └── extract/route.ts
│   │   │   ├── properties/route.ts
│   │   │   └── notifications/route.ts
│   │   ├── layout.tsx              # Layout racine
│   │   └── globals.css
│   ├── components/
│   │   ├── ui/                     # shadcn/ui (auto-généré)
│   │   ├── properties/             # Composants annonces
│   │   │   ├── PropertyCard.tsx
│   │   │   ├── PropertyGrid.tsx
│   │   │   ├── PropertyMap.tsx
│   │   │   └── PropertyFilters.tsx
│   │   ├── chat/                   # Assistant IA
│   │   │   └── ChatWidget.tsx
│   │   ├── admin/                  # Composants back-office
│   │   │   ├── Sidebar.tsx
│   │   │   └── ModerationQueue.tsx
│   │   └── shared/                 # Composants partagés
│   │       ├── Navbar.tsx
│   │       └── Footer.tsx
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts           # Client navigateur
│   │   │   ├── server.ts           # Client serveur (SSR)
│   │   │   └── middleware.ts       # Auth middleware
│   │   ├── ai/
│   │   │   ├── claude.ts           # Client Anthropic
│   │   │   ├── extract.ts          # Extraction annonces WA
│   │   │   └── moderate.ts         # Modération IA
│   │   ├── matching/
│   │   │   └── engine.ts           # Moteur de matching
│   │   └── utils.ts
│   ├── types/
│   │   ├── database.ts             # Types générés Supabase
│   │   └── index.ts
│   └── middleware.ts               # Auth middleware Next.js
├── .env.local                      # Variables (jamais committé)
├── .env.local.example              # Modèle des variables
└── package.json
```
