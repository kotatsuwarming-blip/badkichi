const YOUTUBE_ID_PATTERN = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#/].*)?$/
// 裸の 11 桁 ID（match-management が保存時に extractYoutubeId で正規化した値）も受理する
const BARE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/

export function extractYouTubeId(url: string): string | null {
  if (!url) {
    return null
  }
  if (BARE_ID_PATTERN.test(url)) {
    return url
  }
  const match = url.match(YOUTUBE_ID_PATTERN)
  return match?.[1] ?? null
}
