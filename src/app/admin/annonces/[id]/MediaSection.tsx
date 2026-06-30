"use client"

import { useRef, useState, useTransition } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Upload, Trash2, Loader2, Film, ImageIcon } from "lucide-react"

interface MediaRow {
  id: string
  type: "image" | "video"
  url: string
  ordre: number
}

interface Props {
  propertyId: string
  initialMedia: MediaRow[]
}

export default function MediaSection({ propertyId, initialMedia }: Props) {
  const [media, setMedia] = useState<MediaRow[]>(initialMedia)
  const [uploading, setUploading] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setErrors([])
    setUploading(true)
    try {
      const fd = new FormData()
      Array.from(files).forEach(f => fd.append("files", f))
      const res = await fetch(`/api/admin/annonces/${propertyId}/media`, { method: "POST", body: fd })
      const json = await res.json() as { created?: MediaRow[]; errors?: string[] }
      if (json.created?.length) {
        setMedia(prev => [...prev, ...json.created!].sort((a, b) => a.ordre - b.ordre))
      }
      if (json.errors?.length) setErrors(json.errors)
    } catch (e) {
      setErrors([(e as Error).message])
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await fetch(`/api/admin/annonces/${propertyId}/media`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId: id }),
      })
      setMedia(prev => prev.filter(m => m.id !== id))
      startTransition(() => router.refresh())
    } catch (e) {
      setErrors([(e as Error).message])
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Grille des médias existants */}
      {media.length > 0 ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {media.map(m => (
            <div key={m.id} className="relative group aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-100">
              {m.type === "image" ? (
                <Image src={m.url} alt="" fill className="object-cover" sizes="200px" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Film className="w-8 h-8 text-gray-400" />
                </div>
              )}
              <button
                onClick={() => handleDelete(m.id)}
                disabled={deletingId === m.id}
                className="absolute top-1.5 right-1.5 p-1 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                title="Supprimer"
              >
                {deletingId === m.id
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
          <ImageIcon className="w-8 h-8 mb-2" />
          <p className="text-sm">Aucun média pour cette annonce</p>
        </div>
      )}

      {/* Zone d'upload */}
      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/mp4,video/mov,video/avi,video/webm"
          multiple
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50"
        >
          {uploading
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Envoi en cours…</>
            : <><Upload className="w-4 h-4" /> Ajouter des photos / vidéos</>}
        </button>
        <p className="text-xs text-gray-400 mt-1.5">JPEG, PNG, WebP, MP4 — 20 Mo max par fichier</p>
      </div>

      {errors.length > 0 && (
        <div className="rounded-lg bg-red-50 border border-red-100 p-3 space-y-1">
          {errors.map((e, i) => (
            <p key={i} className="text-xs text-red-600">{e}</p>
          ))}
        </div>
      )}
    </div>
  )
}
