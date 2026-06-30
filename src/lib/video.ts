import "server-only"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { writeFile, readFile, unlink } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import ffmpeg from "fluent-ffmpeg"
import ffmpegPath from "ffmpeg-static"

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath)

export interface CompressedVideo {
  video: Buffer
  thumbnail: Buffer | null
}

/**
 * Compresse une vidéo pour le mobile (≤720p, H.264 CRF 28, AAC 96k, faststart)
 * et extrait une miniature. Même logique que le service WhatsApp.
 * Sur échec ffmpeg, l'appelant retombe sur la vidéo brute.
 */
export async function compressVideo(input: Buffer): Promise<CompressedVideo> {
  const id = randomUUID()
  const inPath = join(tmpdir(), `inaya-${id}-in`)
  const outPath = join(tmpdir(), `inaya-${id}-out.mp4`)
  const thumbPath = join(tmpdir(), `inaya-${id}-thumb.jpg`)

  await writeFile(inPath, input)
  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inPath)
        .videoCodec("libx264")
        .audioCodec("aac")
        .audioBitrate("96k")
        .outputOptions([
          "-vf", "scale=-2:720",
          "-crf", "28",
          "-preset", "veryfast",
          "-movflags", "+faststart",
          "-pix_fmt", "yuv420p",
        ])
        .on("error", reject)
        .on("end", () => resolve())
        .save(outPath)
    })

    let thumbnail: Buffer | null = null
    try {
      await new Promise<void>((resolve, reject) => {
        ffmpeg(inPath)
          .outputOptions(["-ss", "1", "-frames:v", "1", "-vf", "scale=-2:720"])
          .on("error", reject)
          .on("end", () => resolve())
          .save(thumbPath)
      })
      thumbnail = await readFile(thumbPath)
    } catch {
      // miniature optionnelle
    }

    const video = await readFile(outPath)
    return { video, thumbnail }
  } finally {
    await Promise.allSettled([unlink(inPath), unlink(outPath), unlink(thumbPath)])
  }
}
