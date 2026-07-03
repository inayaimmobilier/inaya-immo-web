// Types générés depuis le schéma Supabase d'Inaya Immo
// À régénérer avec : npx supabase gen types typescript --project-id fcnmqpsfqrrsczgfehei > src/types/database.ts

export type UserRole = "super_admin" | "admin" | "moderateur" | "agent" | "client" | "proprietaire" | "locataire" | "prestataire" | "apporteur" | "comptable"
/** Sous-type propriétaire : diffuseur (ses propres biens) ou géré (gestion locative par Inaya). */
export type ProprietaireType = "diffuseur" | "gere"

/** Règle de durée de vie d'une annonce (moteur d'expiration configurable). */
export interface ExpiryRule {
  id: string
  nom: string
  actif: boolean
  priorite: number
  type_offre: PropertyType | null
  categorie: PropertyCat | null
  ville: string | null
  quartiers: string[] | null
  prix_min: number | null
  prix_max: number | null
  meuble: boolean | null
  duree_jours: number
  created_at: string
}
export type UserStatus = "actif" | "suspendu" | "banni"
export type PropertyType = "location" | "vente" | "cession" | "residence_meublee"
export type PropertyCat = "maison" | "appartement" | "studio" | "terrain" | "local_commercial" | "bureau" | "magasin" | "autre"
export type PropertyStatus = "brouillon" | "en_attente_validation" | "publie" | "reserve" | "conclu" | "rejete" | "expire" | "suspendu"
export type PropertySource = "whatsapp" | "agent" | "proprietaire" | "plateforme"
export type Canal = "web" | "app" | "whatsapp" | "interne"
export type LeadStatus = "nouveau" | "en_traitement" | "contacte" | "visite_planifiee" | "visite_effectuee" | "paiement_planifie" | "conclu" | "abandonne"
export type TransactionStatus = "en_cours" | "commission_due" | "payee" | "annulee"
export type PaymentMode = "liquide" | "mobile_money_direct"
export type MatchType = "exacte" | "similaire"
export type MatchStatus = "genere" | "notifie" | "vu" | "converti" | "ignore"
export type NotifCanal = "push" | "email" | "whatsapp" | "telegram"
export type WaEngine = "baileys" | "wppconnect" | "whatsmeow" | "whatsapp_web_js" | "venom_bot" | "api_officielle" | "waapi" | "twilio"
export type WaStatus = "connecte" | "deconnecte" | "banni" | "en_reconnexion"
export type MsgType = "offre" | "demande" | "hors_sujet"
export type CommissionMode = "pct_prix" | "pct_loyer" | "nb_mois" | "fixe" | "combine"
export type OperationType = "location" | "vente" | "tous"
export type ModerationDec = "approuver" | "rejeter" | "a_revoir"
export type RequestStatus = "active" | "satisfaite" | "expiree"
export type MsgRole = "user" | "assistant" | "system"

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          role: UserRole
          status: UserStatus
          nom: string | null
          prenom: string | null
          telephone: string | null
          commune: string | null
          agent_type: string | null
          agence: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["profiles"]["Row"], "created_at" | "updated_at">
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>
      }
      zones: {
        Row: {
          id: string
          nom: string
          ville: string
          actif: boolean
          created_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["zones"]["Row"], "id" | "created_at">
        Update: Partial<Database["public"]["Tables"]["zones"]["Insert"]>
      }
      app_settings: {
        Row: {
          key: string
          value: unknown
          updated_by: string | null
          updated_at: string
        }
        Insert: { key: string; value: unknown; updated_by?: string | null }
        Update: Partial<{ value: unknown; updated_by: string | null }>
      }
      api_secrets: {
        Row: { name: string; value: string; updated_by: string | null; updated_at: string }
        Insert: { name: string; value: string; updated_by?: string | null; updated_at?: string }
        Update: Partial<{ value: string; updated_by: string | null; updated_at: string }>
      }
      favorites: {
        Row: { user_id: string; property_id: string; created_at: string }
        Insert: { user_id: string; property_id: string }
        Update: Partial<{ user_id: string; property_id: string }>
      }
      properties: {
        Row: {
          id: string
          titre: string
          description: string | null
          type_offre: PropertyType
          categorie: PropertyCat
          prix: number
          charges: number
          surface: number | null
          nb_pieces: number | null
          nb_chambres: number | null
          nb_sdb: number | null
          meuble: boolean
          zone_id: string | null
          quartier: string | null
          ville: string
          lat: number | null
          lng: number | null
          statut: PropertyStatus
          source: PropertySource
          score_qualite: number
          doublon_de: string | null
          whatsapp_message_id: string | null
          created_by: string | null
          validated_by: string | null
          validated_at: string | null
          rejected_reason: string | null
          expire_at: string | null
          fingerprint: string | null
          publishers_count: number
          dedup_status: "unique" | "canonical" | "merged"
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["properties"]["Row"], "id" | "created_at" | "updated_at" | "search_vector">
        Update: Partial<Database["public"]["Tables"]["properties"]["Insert"]>
      }
      property_publishers: {
        Row: {
          id: string
          property_id: string
          publisher_id: string | null
          contact_nom: string | null
          contact_phone: string | null
          canal: Canal
          source: PropertySource
          whatsapp_account_id: string | null
          group_id: string | null
          group_nom: string | null
          whatsapp_message_id: string | null
          rang: number
          est_original: boolean
          publie_le: string
          created_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["property_publishers"]["Row"], "id" | "created_at" | "rang" | "est_original">
        Update: Partial<Database["public"]["Tables"]["property_publishers"]["Insert"]>
      }
      property_media: {
        Row: {
          id: string
          property_id: string
          type: "image" | "video"
          url: string
          thumbnail_url: string | null
          ordre: number
          taille_bytes: number | null
          source: "whatsapp" | "upload"
          created_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["property_media"]["Row"], "id" | "created_at">
        Update: Partial<Database["public"]["Tables"]["property_media"]["Insert"]>
      }
      search_requests: {
        Row: {
          id: string
          user_id: string | null
          contact_nom: string | null
          contact_telephone: string | null
          canal: Canal
          type_offre: PropertyType | null
          categories: PropertyCat[] | null
          budget_min: number | null
          budget_max: number | null
          zones: string[] | null
          surface_min: number | null
          nb_pieces_min: number | null
          meuble: boolean | null
          description_libre: string | null
          statut: RequestStatus
          source_message_id: string | null
          expire_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["search_requests"]["Row"], "id" | "created_at" | "updated_at" | "embedding">
        Update: Partial<Database["public"]["Tables"]["search_requests"]["Insert"]>
      }
      leads: {
        Row: {
          id: string
          property_id: string
          client_id: string | null
          contact_nom: string | null
          contact_telephone: string | null
          contact_email: string | null
          canal: Canal
          search_request_id: string | null
          message: string | null
          creneaux: unknown[]
          statut: LeadStatus
          agent_id: string | null
          pris_en_charge_le: string | null
          compte_rendu: string | null
          validation_proprietaire: string
          validation_token: string | null
          validated_proprio_le: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["leads"]["Row"], "id" | "created_at" | "updated_at">
        Update: Partial<Database["public"]["Tables"]["leads"]["Insert"]>
      }
      matches: {
        Row: {
          id: string
          property_id: string
          search_request_id: string
          type: MatchType
          score: number
          statut: MatchStatus
          notifie_le: string | null
          created_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["matches"]["Row"], "id" | "created_at">
        Update: Partial<Database["public"]["Tables"]["matches"]["Insert"]>
      }
      commission_rules: {
        Row: {
          id: string
          nom: string
          priorite: number
          actif: boolean
          est_defaut: boolean
          type_operation: OperationType
          categories: PropertyCat[] | null
          zones: string[] | null
          prix_min: number | null
          prix_max: number | null
          source: PropertySource | null
          agent_id: string | null
          contexte_tag: string | null
          mode_calcul: CommissionMode
          valeur: number
          montant_min: number | null
          montant_max: number | null
          split_agent_pct: number
          valide_du: string | null
          valide_au: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["commission_rules"]["Row"], "id" | "created_at" | "updated_at">
        Update: Partial<Database["public"]["Tables"]["commission_rules"]["Insert"]>
      }
      transactions: {
        Row: {
          id: string
          property_id: string
          lead_id: string | null
          type_operation: PropertyType
          montant_transaction: number
          commission_rule_id: string | null
          commission_montant_total: number
          commission_part_inaya: number
          commission_part_agent: number
          agent_id: string | null
          statut: TransactionStatus
          mode_paiement: PaymentMode | null
          reference_paiement: string | null
          note_admin: string | null
          paye_le: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["transactions"]["Row"], "id" | "created_at" | "updated_at">
        Update: Partial<Database["public"]["Tables"]["transactions"]["Insert"]>
      }
      whatsapp_accounts: {
        Row: {
          id: string
          nom: string
          numero: string
          engine: WaEngine
          status: WaStatus
          actif: boolean
          groupes_surveilles: unknown[]
          dernier_ping: string | null
          reconnexions_count: number
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["whatsapp_accounts"]["Row"], "id" | "created_at" | "updated_at">
        Update: Partial<Database["public"]["Tables"]["whatsapp_accounts"]["Insert"]>
      }
      notifications: {
        Row: {
          id: string
          user_id: string | null
          contact_telephone: string | null
          canal: NotifCanal
          type: string
          titre: string | null
          contenu: string
          payload: Record<string, unknown>
          lu: boolean
          envoye: boolean
          envoye_le: string | null
          erreur: string | null
          code_erreur: string | null
          created_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["notifications"]["Row"], "id" | "created_at">
        Update: Partial<Database["public"]["Tables"]["notifications"]["Insert"]>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      user_role: UserRole
      property_type: PropertyType
      property_cat: PropertyCat
      property_status: PropertyStatus
      lead_status: LeadStatus
      transaction_status: TransactionStatus
      wa_engine: WaEngine
      wa_status: WaStatus
      canal: Canal
    }
  }
}
