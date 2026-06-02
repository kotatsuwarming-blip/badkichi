const YOUTUBE_ID_PATTERN = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#/].*)?$/

export function extractYouTubeId(url: string): string | null {
  if (!url) {
    return null
  }
  const match = url.match(YOUTUBE_ID_PATTERN)
  return match?.[1] ?? null
}
