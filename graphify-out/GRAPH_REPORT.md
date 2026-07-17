# Graph Report - src  (2026-07-11)

## Corpus Check
- 237 files · ~122,893 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1100 nodes · 2642 edges · 73 communities (66 shown, 7 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.56)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- notifications.ts
- page.tsx
- UserRole
- actions.ts
- page.tsx 2
- page.tsx 3
- page.tsx 4
- commissions.ts
- testFlowActions.ts
- route.ts
- actions.ts 2
- page.tsx 5
- createClient()
- formatPrix()
- database.ts
- PublierForm.tsx
- actions.ts 3
- route.ts 2
- page.tsx 6
- llm.ts
- createAdminClient()
- actions.ts 4
- page.tsx 7
- route.ts 3
- PropertyFilters.tsx
- PropertyCard.tsx
- page.tsx 8
- page.tsx 9
- actions.ts 5
- formatRelativeDate()
- page.tsx 10
- utils.ts
- matching.ts
- actions.ts 6
- actions.ts 7
- actions.ts 8
- page.tsx 11
- page.tsx 12
- page.tsx 13
- layout.tsx
- property-types-server.ts
- actions.ts 9
- ModerationTable.tsx
- page.tsx 14
- page.tsx 15
- page.tsx 16
- page.tsx 17
- saveSearch.ts
- page.tsx 18
- page.tsx 19
- layout.tsx 2
- page.tsx 20
- page.tsx 21
- page.tsx 22
- assistant-actions.ts
- layout.tsx 3
- route.ts 4
- route.ts 5
- page.tsx 23
- actions.ts 10
- loading.tsx
- actions.ts 11
- middleware.ts
- page.tsx 24
- route.ts 6
- route.ts 7
- route.ts 8
- route.ts 9
- ServiceBanners.tsx
- route.ts 10
- page.tsx 25

## God Nodes (most connected - your core abstractions)
1. `createAdminClient()` - 249 edges
2. `createClient()` - 238 edges
3. `formatPrix()` - 61 edges
4. `UserRole` - 54 edges
5. `formatRelativeDate()` - 27 edges
6. `PropertyCat` - 14 edges
7. `CommissionRule` - 13 edges
8. `PropertyType` - 13 edges
9. `notifyUser()` - 12 edges
10. `formatDate()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `ResidencesPage()` --calls--> `createClient()`  [EXTRACTED]
  app/(public)/residences/page.tsx → lib/supabase/server.ts
- `DoublonsPage()` --calls--> `createClient()`  [EXTRACTED]
  app/admin/annonces/doublons/page.tsx → lib/supabase/server.ts
- `ApportsManager()` --calls--> `formatPrix()`  [EXTRACTED]
  app/admin/apports/ApportsManager.tsx → lib/utils.ts
- `ExpirationPage()` --calls--> `createAdminClient()`  [EXTRACTED]
  app/admin/expiration/page.tsx → lib/supabase/server.ts
- `GestionLocativePage()` --calls--> `createAdminClient()`  [EXTRACTED]
  app/admin/gestion/page.tsx → lib/supabase/server.ts

## Import Cycles
- None detected.

## Communities (73 total, 7 thin omitted)

### Community 0 - "notifications.ts"
Cohesion: 0.06
Nodes (47): createEncaissement(), createLocataire(), createMandat(), createTravaux(), createVersement(), insert(), num(), requireStaff() (+39 more)

### Community 1 - "page.tsx"
Cohesion: 0.05
Nodes (34): metadata, geist, metadata, orgJsonLd, metadata, MonComptePage(), BienDetailPage(), generateMetadata() (+26 more)

### Community 2 - "UserRole"
Cohesion: 0.09
Nodes (37): ActionResult, bulkDeleteUsers(), createUser(), currentProfile(), deleteUser(), otherActiveSuperAdmins(), ROLES, setUserPassword() (+29 more)

### Community 3 - "actions.ts"
Cohesion: 0.08
Nodes (35): AccountType, confirmVerificationCode(), isRealEmail(), maskEmail(), maskPhone(), normalizePhone(), phoneDigits(), recordAgentApplication() (+27 more)

### Community 4 - "page.tsx 2"
Cohesion: 0.07
Nodes (35): annulerReservation(), confirmerReservation(), decideReservation(), Result, setDisponibilite(), staffRole(), supprimerResidence(), DeleteResidenceButton() (+27 more)

### Community 5 - "page.tsx 3"
Cohesion: 0.07
Nodes (28): ActionResult, createWaAccount(), deleteWaAccount(), ENGINES, requireAdmin(), retryFailedNotifications(), setNotifierAccount(), SupabaseClient (+20 more)

### Community 6 - "page.tsx 4"
Cohesion: 0.08
Nodes (28): changeStatut(), deleteProperty(), getCallerRole(), marquerSignalementsTraites(), updateProperty(), MediaRow, Props, AdminBienDetail() (+20 more)

### Community 7 - "commissions.ts"
Cohesion: 0.10
Nodes (26): Prop, CATEGORIES, MODES, Props, SOURCES, EditReglePage(), HistoryRow, metadata (+18 more)

### Community 8 - "testFlowActions.ts"
Cohesion: 0.12
Nodes (27): buildAssignmentText(), buildWaText(), computeCommissionForLead(), contextOf(), getLeadTestContext(), getStandardMap(), getStandardOptions(), getTestFollowupMessage() (+19 more)

### Community 9 - "route.ts"
Cohesion: 0.14
Nodes (23): POST(), STAFF_ROLES, VIDEO_EXTS, DELETE(), MAX_MB, POST(), PUT(), STAFF_ROLES (+15 more)

### Community 10 - "actions.ts 2"
Cohesion: 0.11
Nodes (18): approveAgentApplication(), createAgent(), deleteAgent(), digits(), rejectAgentApplication(), requireAdmin(), Res, setAgentStatus() (+10 more)

### Community 11 - "page.tsx 5"
Cohesion: 0.11
Nodes (21): AgentDetailPage(), EN_COURS, metadata, PageProps, ALLOWED_STATUTS, assignLead(), deleteLead(), forceAgentConfirmation() (+13 more)

### Community 12 - "createClient()"
Cohesion: 0.14
Nodes (15): AdminLayout(), AgentDashboard(), KPI_STATUTS, POST(), POST(), POST(), POST(), GET() (+7 more)

### Community 13 - "formatPrix()"
Cohesion: 0.13
Nodes (15): DashboardPage(), getDashboardStats(), STATUT_LABEL_DASH, STATUT_PILL, AgentAnnoncesPage(), ApporteurPage(), PILL, LocatairePage() (+7 more)

### Community 14 - "database.ts"
Cohesion: 0.13
Nodes (16): metadata, MODE_LABEL, PageProps, STATUTS, TransactionsPage(), TxRow, FLOW, OPTIONS (+8 more)

### Community 15 - "PublierForm.tsx"
Cohesion: 0.13
Nodes (15): getInitialContact(), getVilles(), metadata, PublierPage(), CATEGORIES, InitialContact, PERIODES, PreviewFile (+7 more)

### Community 16 - "actions.ts 3"
Cohesion: 0.18
Nodes (14): ActionResult, createRule(), createRuleAndRedirect(), deleteRule(), parseForm(), requireAdmin(), SupabaseClient, toggleRule() (+6 more)

### Community 17 - "route.ts 2"
Cohesion: 0.18
Nodes (17): Args, cleanTerm(), exec(), fmtNum(), formatProperty(), hits, listerZones(), PERIODE_TXT (+9 more)

### Community 18 - "page.tsx 6"
Cohesion: 0.16
Nodes (15): AgentOpt, metadata, NouvelleTransactionPage(), PageProps, PropOpt, MesRequetesPage(), metadata, ReqRow (+7 more)

### Community 19 - "llm.ts"
Cohesion: 0.17
Nodes (16): AnthBlock, getActiveModelId(), MODEL_CATALOG, ModelEntry, OAMessage, OAToolCall, ProviderCfg, ProviderInfo (+8 more)

### Community 20 - "createAdminClient()"
Cohesion: 0.21
Nodes (10): ApportsPage(), checkAdmin(), DELETE(), PATCH(), GET(), POST(), tgSend(), GET() (+2 more)

### Community 21 - "actions.ts 4"
Cohesion: 0.22
Nodes (12): createExpiryRule(), deleteExpiryRule(), num(), requireAdmin(), Result, toggleExpiryRule(), CAT, ExpiryRulesManager() (+4 more)

### Community 22 - "page.tsx 7"
Cohesion: 0.20
Nodes (13): ActionResult, savePropertyTypes(), saveSettings(), slugCode(), CANAUX, metadata, PageProps, ParametresPage() (+5 more)

### Community 23 - "route.ts 3"
Cohesion: 0.22
Nodes (15): cleanTerm(), contactPhone(), exec(), fmt(), listerZones(), PERIODE, POST(), present() (+7 more)

### Community 24 - "PropertyFilters.tsx"
Cohesion: 0.16
Nodes (12): PropertiesList(), csv(), DEFAULT_CATS, PIECES_MIN, PropertyFilters(), Zone, DEFAULT_CATS, TypeOffre (+4 more)

### Community 25 - "PropertyCard.tsx"
Cohesion: 0.17
Nodes (10): FavorisPage(), FavRow, metadata, Property, Property, PropertyCard(), CATEGORIE_GRADIENT, CATEGORIE_ICON (+2 more)

### Community 26 - "page.tsx 8"
Cohesion: 0.23
Nodes (11): getHero(), getRecentProperties(), getResidences(), getServiceBanners(), getStats(), getVilles(), Home(), metadata (+3 more)

### Community 27 - "page.tsx 9"
Cohesion: 0.18
Nodes (11): deleteMyProperty(), isOwner(), Result, updateMyProperty(), EditMyPropertyPage(), metadata, CATEGORIES, DeleteResult (+3 more)

### Community 28 - "actions.ts 5"
Cohesion: 0.27
Nodes (11): Simulator(), ActionResult, createTransaction(), createTransactionAndRedirect(), deleteTransaction(), requireAdmin(), SupabaseClient, updateTransaction() (+3 more)

### Community 29 - "formatRelativeDate()"
Cohesion: 0.18
Nodes (12): LeadsPage(), PageProps, STATUT_PILL, STATUTS, LeadRow, MesDemandesPage(), metadata, STATUT_LABEL (+4 more)

### Community 30 - "page.tsx 10"
Cohesion: 0.22
Nodes (11): deleteTestimonial(), moderateTestimonial(), requireModerator(), Result, AdminTemoignagesPage(), FILTERS, metadata, PageProps (+3 more)

### Community 31 - "utils.ts"
Cohesion: 0.18
Nodes (10): PageProps, PropRow, TABS, ContacterPage(), metadata, PageProps, Property, STATUT_COLOR (+2 more)

### Community 32 - "matching.ts"
Cohesion: 0.30
Nodes (11): POST(), POST(), evaluateMatch(), groupAlertsEnabled(), MatchScore, mayNotify(), round2(), runMatchingForProperty() (+3 more)

### Community 33 - "actions.ts 6"
Cohesion: 0.23
Nodes (9): ActionResult, dismissGroup(), mergeIntoCanonical(), requireStaff(), SupabaseClient, MergeGroup(), Props, MergeCandidate() (+1 more)

### Community 34 - "actions.ts 7"
Cohesion: 0.23
Nodes (10): createApport(), requireAdmin(), Result, updateApportStatut(), ApportsManager(), NEXT, Person, PILL (+2 more)

### Community 35 - "actions.ts 8"
Cohesion: 0.20
Nodes (8): normalizePhone(), saveSearchFull(), CATEGORIES, Initial, PIECES_MIN, metadata, NouvelleRequetePage(), PageProps

### Community 36 - "page.tsx 11"
Cohesion: 0.22
Nodes (8): AnnoncesAdminPage(), PageProps, STATUTS, metadata, Property, ResidencesPage(), AutoRefresh(), Props

### Community 37 - "page.tsx 12"
Cohesion: 0.24
Nodes (8): ActionResult, toggleFavorite(), updateProfile(), metadata, PageProps, ProfilPage(), save(), FavoriteButton()

### Community 38 - "page.tsx 13"
Cohesion: 0.22
Nodes (7): AdminServicesPage(), metadata, Banner, CATEGORIES, COULEUR_PREVIEW, COULEURS, EMPTY

### Community 39 - "layout.tsx"
Cohesion: 0.27
Nodes (7): ClientNav(), TABS, ClientLayout(), AdminSidebar(), NAV, Props, cn()

### Community 40 - "property-types-server.ts"
Cohesion: 0.33
Nodes (4): Row, GET(), PropertyType, getPropertyTypes()

### Community 41 - "actions.ts 9"
Cohesion: 0.36
Nodes (6): POST(), publierAnnonce(), PublierResult, getModerationPrompt(), moderateProperty(), ModerationResult

### Community 42 - "ModerationTable.tsx"
Cohesion: 0.32
Nodes (6): bulkModerate(), requireModerator(), Result, AnnonceRow, ModerationTable(), STATUT_PILL

### Community 43 - "page.tsx 14"
Cohesion: 0.25
Nodes (5): metadata, Ville, ZonesPage(), Quartier, Ville

### Community 44 - "page.tsx 15"
Cohesion: 0.32
Nodes (6): Result, updateMyAgentProfile(), AgentProfilPage(), metadata, PageProps, save()

### Community 45 - "page.tsx 16"
Cohesion: 0.33
Nodes (6): CANAL_BADGE, metadata, NotificationsPage(), NotifRow, TYPE_ICON, NotifCanal

### Community 46 - "page.tsx 17"
Cohesion: 0.48
Nodes (5): deleteMyAgentProperty(), isOwner(), updateMyAgentProperty(), EditAgentPropertyPage(), metadata

### Community 47 - "saveSearch.ts"
Cohesion: 0.43
Nodes (4): normalizePhone(), Result, saveSearch(), SaveSearchParams

### Community 48 - "page.tsx 18"
Cohesion: 0.33
Nodes (3): MandatDetail(), PageProps, RecordForms()

### Community 49 - "page.tsx 19"
Cohesion: 0.40
Nodes (4): PrestatairePage(), NEXT, PILL, TravauxStatus()

### Community 50 - "layout.tsx 2"
Cohesion: 0.40
Nodes (4): ProprietaireLayout(), DIFFUSEUR, GERE, ProprioNav()

### Community 51 - "page.tsx 20"
Cohesion: 0.47
Nodes (3): ProprietaireDashboard(), safeCount(), safeSum()

### Community 52 - "page.tsx 21"
Cohesion: 0.40
Nodes (3): metadata, PageProps, SaveSearchLink()

### Community 53 - "page.tsx 22"
Cohesion: 0.50
Nodes (4): DupItem, DoublonsPage(), metadata, PropRow

### Community 55 - "layout.tsx 3"
Cohesion: 0.50
Nodes (3): AgentNav(), ITEMS, AgentLayout()

### Community 56 - "route.ts 4"
Cohesion: 0.60
Nodes (4): ALLOWED, checkAuth(), DELETE(), PATCH()

### Community 57 - "route.ts 5"
Cohesion: 0.60
Nodes (4): ALLOWED, checkAuth(), GET(), POST()

### Community 58 - "page.tsx 23"
Cohesion: 0.50
Nodes (3): markAllRead(), metadata, NotifRow

### Community 62 - "middleware.ts"
Cohesion: 0.50
Nodes (4): config, middleware(), SELF_SERVICE, STAFF_ROLES

### Community 63 - "page.tsx 24"
Cohesion: 0.50
Nodes (3): GestionLocativePage(), Owner, Prop

### Community 64 - "route.ts 6"
Cohesion: 0.83
Nodes (3): checkAdmin(), GET(), POST()

### Community 65 - "route.ts 7"
Cohesion: 0.83
Nodes (3): checkAdmin(), GET(), POST()

### Community 66 - "route.ts 8"
Cohesion: 0.83
Nodes (3): checkAdmin(), DELETE(), PATCH()

### Community 67 - "route.ts 9"
Cohesion: 0.83
Nodes (3): checkAdmin(), GET(), POST()

## Knowledge Gaps
- **318 isolated node(s):** `MOIS`, `CANAL_LABEL`, `CATEGORIES`, `LeadResult`, `ReportResult` (+313 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createAdminClient()` connect `createAdminClient()` to `notifications.ts`, `page.tsx`, `UserRole`, `actions.ts`, `page.tsx 2`, `page.tsx 3`, `page.tsx 4`, `commissions.ts`, `testFlowActions.ts`, `route.ts`, `actions.ts 2`, `page.tsx 5`, `createClient()`, `formatPrix()`, `PublierForm.tsx`, `route.ts 2`, `llm.ts`, `actions.ts 4`, `page.tsx 7`, `route.ts 3`, `PropertyFilters.tsx`, `page.tsx 8`, `page.tsx 9`, `page.tsx 10`, `utils.ts`, `matching.ts`, `actions.ts 7`, `actions.ts 8`, `page.tsx 11`, `page.tsx 13`, `property-types-server.ts`, `actions.ts 9`, `ModerationTable.tsx`, `page.tsx 14`, `page.tsx 15`, `page.tsx 17`, `saveSearch.ts`, `page.tsx 18`, `page.tsx 19`, `page.tsx 20`, `page.tsx 21`, `route.ts 4`, `route.ts 5`, `actions.ts 11`, `page.tsx 24`, `route.ts 6`, `route.ts 7`, `route.ts 8`, `route.ts 9`, `page.tsx 25`?**
  _High betweenness centrality (0.281) - this node is a cross-community bridge._
- **Why does `createClient()` connect `createClient()` to `notifications.ts`, `page.tsx`, `UserRole`, `actions.ts`, `page.tsx 2`, `page.tsx 3`, `page.tsx 4`, `commissions.ts`, `route.ts`, `actions.ts 2`, `page.tsx 5`, `formatPrix()`, `database.ts`, `PublierForm.tsx`, `actions.ts 3`, `page.tsx 6`, `createAdminClient()`, `actions.ts 4`, `page.tsx 7`, `PropertyFilters.tsx`, `PropertyCard.tsx`, `page.tsx 8`, `page.tsx 9`, `actions.ts 5`, `formatRelativeDate()`, `page.tsx 10`, `utils.ts`, `matching.ts`, `actions.ts 6`, `actions.ts 7`, `actions.ts 8`, `page.tsx 11`, `page.tsx 12`, `page.tsx 13`, `layout.tsx`, `actions.ts 9`, `ModerationTable.tsx`, `page.tsx 14`, `page.tsx 15`, `page.tsx 16`, `page.tsx 17`, `saveSearch.ts`, `page.tsx 19`, `layout.tsx 2`, `page.tsx 20`, `page.tsx 21`, `page.tsx 22`, `assistant-actions.ts`, `layout.tsx 3`, `route.ts 4`, `route.ts 5`, `page.tsx 23`, `actions.ts 10`, `actions.ts 11`, `route.ts 6`, `route.ts 7`, `route.ts 8`, `route.ts 9`, `route.ts 10`, `page.tsx 25`?**
  _High betweenness centrality (0.266) - this node is a cross-community bridge._
- **Why does `UserRole` connect `UserRole` to `notifications.ts`, `page.tsx`, `page.tsx 2`, `page.tsx 3`, `page.tsx 4`, `commissions.ts`, `route.ts`, `actions.ts 2`, `page.tsx 5`, `formatPrix()`, `database.ts`, `actions.ts 3`, `page.tsx 6`, `actions.ts 4`, `page.tsx 7`, `actions.ts 5`, `page.tsx 10`, `actions.ts 6`, `actions.ts 7`, `page.tsx 13`, `ModerationTable.tsx`, `page.tsx 14`, `page.tsx 16`, `page.tsx 19`, `layout.tsx 2`, `page.tsx 22`, `assistant-actions.ts`, `layout.tsx 3`, `route.ts 4`, `route.ts 5`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **What connects `MOIS`, `CANAL_LABEL`, `CATEGORIES` to the rest of the system?**
  _318 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `notifications.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.060285563194077206 - nodes in this community are weakly interconnected._
- **Should `page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.05202661826981246 - nodes in this community are weakly interconnected._
- **Should `UserRole` be split into smaller, more focused modules?**
  _Cohesion score 0.08788159111933395 - nodes in this community are weakly interconnected._