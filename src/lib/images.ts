import type { Attachment } from '@/types'
import { uid } from './utils'

/**
 * Image attachment helpers.
 *
 * Gemini performs best with images up to ~1568px on the longest side, so larger
 * uploads are downscaled client-side and re-encoded as JPEG before they are
 * stored or sent. Small images are kept untouched to avoid needless re-encoding.
 */
export const MAX_IMAGE_DIMENSION = 1568
export const MAX_INPUT_BYTES = 10 * 1024 * 1024
/** Files at or under this size and resolution are sent as-is. */
const PASSTHROUGH_BYTES = 512 * 1024

export class AttachmentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AttachmentError'
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new AttachmentError(`Could not read “${file.name}”.`))
    reader.readAsDataURL(file)
  })
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file)
    } catch {
      /* fall through to <img> decoding */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new AttachmentError(`“${file.name}” is not a readable image.`))
      img.src = url
    })
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

function downscaleToDataUrl(source: ImageBitmap | HTMLImageElement, mimeType: string): string {
  const width = 'width' in source ? source.width : 0
  const height = 'height' in source ? source.height : 0
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height, 1))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new AttachmentError('Canvas is unavailable in this browser.')
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  // PNG keeps transparency; everything else becomes a smaller JPEG.
  return mimeType === 'image/png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.85)
}

/**
 * Turns a picked file into an Attachment with a data: URL, downscaling when
 * needed. Throws AttachmentError with a user-friendly message otherwise.
 */
export async function fileToAttachment(file: File): Promise<Attachment> {
  if (!file.type.startsWith('image/')) {
    throw new AttachmentError(`“${file.name}” is not an image. Only image files can be attached.`)
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new AttachmentError(`“${file.name}” is larger than ${Math.round(MAX_INPUT_BYTES / (1024 * 1024))} MB.`)
  }

  let dataUrl: string
  if (file.size <= PASSTHROUGH_BYTES) {
    // Small file: check its dimensions, but keep the original bytes when they fit.
    const bitmap = await loadBitmap(file)
    try {
      const w = bitmap.width
      const h = bitmap.height
      if (Math.max(w, h) <= MAX_IMAGE_DIMENSION) {
        dataUrl = await readAsDataUrl(file)
      } else {
        dataUrl = downscaleToDataUrl(bitmap, file.type)
      }
    } finally {
      if ('close' in bitmap) bitmap.close()
    }
  } else {
    const bitmap = await loadBitmap(file)
    try {
      dataUrl = downscaleToDataUrl(bitmap, file.type)
    } finally {
      if ('close' in bitmap) bitmap.close()
    }
  }

  return {
    id: uid('att'),
    name: file.name || 'image',
    mimeType: file.type || 'image/png',
    size: file.size,
    dataUrl,
  }
}
