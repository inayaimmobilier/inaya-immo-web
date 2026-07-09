import { createAdminClient } from "@/lib/supabase/server"
import { getSecret } from "@/lib/secrets"

// ============================================================================
// Couche LLM multi-fournisseurs pour l'assistant IA.
// L'admin choisit le modèle (table app_settings, clé "assistant_model").
// Deux formats d'API seulement :
//   - "anthropic" : API Messages native de Claude
//   - "openai"    : API "chat/completions" compatible OpenAI — partagée par
//                   OpenAI (ChatGPT), DeepSeek, Groq, OpenRouter, Together, Mistral…
// Chaque fournisseur a sa clé dans les variables d'environnement.
// ============================================================================

type Shape = "anthropic" | "openai"

interface ProviderCfg { label: string; shape: Shape; baseUrl?: string; envKey: string }

const PROVIDERS: Record<string, ProviderCfg> = {
  anthropic:  { label: "Anthropic (Claude)", shape: "anthropic", envKey: "ANTHROPIC_API_KEY" },
  openai:     { label: "OpenAI (ChatGPT)",   shape: "openai", baseUrl: "https://api.openai.com/v1",       envKey: "OPENAI_API_KEY" },
  deepseek:   { label: "DeepSeek",           shape: "openai", baseUrl: "https://api.deepseek.com/v1",      envKey: "DEEPSEEK_API_KEY" },
  zhipu:      { label: "Zhipu (GLM)",        shape: "openai", baseUrl: "https://open.bigmodel.cn/api/paas/v4", envKey: "ZHIPU_API_KEY" },
  google:     { label: "Google (Gemini)",    shape: "openai", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", envKey: "GEMINI_API_KEY" },
  groq:       { label: "Groq",               shape: "openai", baseUrl: "https://api.groq.com/openai/v1",   envKey: "GROQ_API_KEY" },
  openrouter: { label: "OpenRouter",         shape: "openai", baseUrl: "https://openrouter.ai/api/v1",     envKey: "OPENROUTER_API_KEY" },
  together:   { label: "Together AI",        shape: "openai", baseUrl: "https://api.together.xyz/v1",      envKey: "TOGETHER_API_KEY" },
  mistral:    { label: "Mistral AI",         shape: "openai", baseUrl: "https://api.mistral.ai/v1",        envKey: "MISTRAL_API_KEY" },
}

export interface ModelEntry {
  id: string            // identifiant interne (stocké en base)
  label: string         // libellé affiché à l'admin
  provider: keyof typeof PROVIDERS
  model: string         // identifiant du modèle côté API
  openSource: boolean
}

// Catalogue : modèles propriétaires + open source (≥5 open source).
export const MODEL_CATALOG: ModelEntry[] = [
  // Propriétaires
  { id: "claude-haiku",   label: "Claude Haiku 4.5 (Anthropic)",  provider: "anthropic", model: "claude-haiku-4-5-20251001", openSource: false },
  { id: "claude-sonnet",  label: "Claude Sonnet 4.6 (Anthropic)", provider: "anthropic", model: "claude-sonnet-4-6",          openSource: false },
  { id: "gpt-4o-mini",    label: "GPT-4o mini (ChatGPT)",         provider: "openai",    model: "gpt-4o-mini",                openSource: false },
  { id: "gpt-4o",         label: "GPT-4o (ChatGPT)",              provider: "openai",    model: "gpt-4o",                     openSource: false },
  // Open source
  { id: "deepseek-v3",    label: "DeepSeek V3 (open source)",            provider: "deepseek", model: "deepseek-chat",                          openSource: true },
  { id: "llama-3.3-70b",  label: "Llama 3.3 70B · Groq (open source)",   provider: "groq",     model: "llama-3.3-70b-versatile",                openSource: true },
  { id: "qwen-2.5-72b",   label: "Qwen 2.5 72B · Together (open source)", provider: "together", model: "Qwen/Qwen2.5-72B-Instruct-Turbo",        openSource: true },
  { id: "gemma2-9b",      label: "Gemma 2 9B · Groq (open source)",      provider: "groq",     model: "gemma2-9b-it",                           openSource: true },
  { id: "mistral-small",  label: "Mistral Small (open weights)",         provider: "mistral",  model: "mistral-small-latest",                   openSource: true },
  { id: "llama-3.1-8b",   label: "Llama 3.1 8B · Groq (open source, rapide)", provider: "groq", model: "llama-3.1-8b-instant",                 openSource: true },
  // Ajouts demandés. NB : le champ `model` = identifiant EXACT côté API du
  // fournisseur ; ajustez-le en une ligne si le fournisseur renomme sa version.
  { id: "glm-5.2",        label: "GLM 5.2 (Zhipu)",              provider: "zhipu",    model: "glm-4.6",         openSource: true },
  { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro (raisonnement)", provider: "deepseek", model: "deepseek-reasoner", openSource: true },
  { id: "deepseek-flash", label: "DeepSeek Flash (rapide)",      provider: "deepseek", model: "deepseek-chat",   openSource: true },
  { id: "gemini-flash",   label: "Gemini Flash (Google)",        provider: "google",   model: "gemini-2.0-flash", openSource: false },
]

const DEFAULT_MODEL_ID = "claude-haiku"

// Liste publique des fournisseurs (pour l'UI admin de saisie des clés).
export interface ProviderInfo { id: string; label: string; envKey: string }
export const PROVIDER_LIST: ProviderInfo[] =
  Object.entries(PROVIDERS).map(([id, c]) => ({ id, label: c.label, envKey: c.envKey }))

/** Modèle choisi par l'admin (clé app_settings "assistant_model"), avec repli. */
export async function getActiveModelId(): Promise<string> {
  try {
    const admin = createAdminClient()
    const { data } = await admin.from("app_settings").select("value").eq("key", "assistant_model").maybeSingle()
    const id = (data as { value: unknown } | null)?.value
    if (typeof id === "string" && MODEL_CATALOG.some(m => m.id === id)) return id
  } catch { /* ignore — repli ci-dessous */ }
  return DEFAULT_MODEL_ID
}

// --- Outils (définition agnostique du fournisseur) -------------------------
export interface ToolSpec { name: string; description: string; parameters: Record<string, unknown> }
export type ToolExecutor = (name: string, args: Record<string, unknown>) => Promise<unknown>

export interface ChatTurn { role: "user" | "assistant"; text: string }
export type RunResult = { ok: true; reply: string } | { ok: false; error: string }

interface RunOpts { system: string; history: ChatTurn[]; tools: ToolSpec[]; exec: ToolExecutor }

const MAX_TOOL_ROUNDS = 5
const MAX_TOKENS = 1024

export async function runAssistant(opts: RunOpts): Promise<RunResult> {
  const id = await getActiveModelId()
  const entry = MODEL_CATALOG.find(m => m.id === id) ?? MODEL_CATALOG[0]
  const provider = PROVIDERS[entry.provider]
  // Clé saisie dans l'admin (base) en priorité, sinon variable d'environnement.
  const apiKey = (await getSecret(provider.envKey)) || process.env[provider.envKey] || ""
  if (!apiKey) {
    return { ok: false, error: `Le fournisseur « ${provider.label} » n'est pas configuré. Ajoutez sa clé API dans Admin → Paramètres → Assistant IA.` }
  }

  try {
    return provider.shape === "anthropic"
      ? { ok: true, reply: await runAnthropic(entry.model, apiKey, opts) }
      : { ok: true, reply: await runOpenAICompatible(entry.model, apiKey, provider.baseUrl!, opts) }
  } catch (e) {
    console.error("INAYA-LLM-001", entry.id, e)
    return { ok: false, error: "L'assistant rencontre un souci technique. Réessayez dans un instant." }
  }
}

// --- Implémentation Anthropic ---------------------------------------------
interface AnthBlock { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }

async function runAnthropic(model: string, apiKey: string, opts: RunOpts): Promise<string> {
  const tools = opts.tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters }))
  const messages: { role: "user" | "assistant"; content: unknown }[] =
    opts.history.map(m => ({ role: m.role, content: m.text }))

  for (let i = 0; i < MAX_TOOL_ROUNDS; i++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: MAX_TOKENS, system: opts.system, tools, messages }),
    })
    if (!res.ok) throw new Error(`anthropic ${res.status}`)
    const data = (await res.json()) as { content: AnthBlock[]; stop_reason: string }
    const toolUses = data.content.filter(b => b.type === "tool_use")

    if (data.stop_reason !== "tool_use" || toolUses.length === 0) {
      return data.content.filter(b => b.type === "text").map(b => b.text).join("\n").trim()
    }

    messages.push({ role: "assistant", content: data.content })
    const results: Record<string, unknown>[] = []
    for (const tu of toolUses) {
      const out = await opts.exec(tu.name ?? "", tu.input ?? {})
      results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out) })
    }
    messages.push({ role: "user", content: results })
  }
  return "Je n'ai pas pu finaliser la recherche. Reformulez votre demande."
}

// --- Implémentation compatible OpenAI (OpenAI, DeepSeek, Groq, …) ----------
interface OAToolCall { id: string; type: string; function: { name: string; arguments: string } }
interface OAMessage { role: string; content: string | null; tool_calls?: OAToolCall[]; tool_call_id?: string }

async function runOpenAICompatible(model: string, apiKey: string, baseUrl: string, opts: RunOpts): Promise<string> {
  const tools = opts.tools.map(t => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }))
  const messages: OAMessage[] = [
    { role: "system", content: opts.system },
    ...opts.history.map(m => ({ role: m.role, content: m.text })),
  ]

  for (let i = 0; i < MAX_TOOL_ROUNDS; i++) {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: MAX_TOKENS, tools, tool_choice: "auto", messages }),
    })
    if (!res.ok) throw new Error(`openai-compat ${res.status}`)
    const data = (await res.json()) as { choices: { message: OAMessage }[] }
    const msg = data.choices?.[0]?.message
    if (!msg) return "Je n'ai pas de réponse pour le moment."

    if (msg.tool_calls?.length) {
      messages.push(msg)
      for (const tc of msg.tool_calls) {
        let args: Record<string, unknown> = {}
        try { args = JSON.parse(tc.function.arguments || "{}") } catch { /* args vides */ }
        const out = await opts.exec(tc.function.name, args)
        messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(out) })
      }
      continue
    }
    return (msg.content ?? "").trim()
  }
  return "Je n'ai pas pu finaliser la recherche. Reformulez votre demande."
}
