import type { DeezerTrack } from '../hooks/useDeezer'

export const DEEZER_LIBRARY_KEY = 'deezer.library.v1'

export interface SavedDeezerTrack {
  id: number
  title: string
  artist: string
  album: string
  duration?: number
  imageLarge: string
  imageMedium: string
  preview: string
}

function toSavedTrack(track: DeezerTrack): SavedDeezerTrack {
  return {
    id: track.id,
    title: track.title || track.title_short,
    artist: track.artist.name,
    album: track.album.title,
    duration: track.duration,
    imageLarge: track.album.cover_xl || track.album.cover_big || track.album.cover_medium,
    imageMedium: track.album.cover_medium || track.album.cover_small,
    preview: track.preview,
  }
}

export async function refreshDeezerTrackPreview(trackId: number, signal?: AbortSignal) {
  const response = await fetch(`/api/deezer/track/${trackId}`, { cache: 'no-store', signal })
  if (!response.ok) {
    throw new Error(`A Deezer respondeu com o status ${response.status}.`)
  }

  const track = (await response.json()) as DeezerTrack
  if (track.id !== trackId || !track.preview) return null

  saveDeezerTracks([track])
  return track.preview
}

export function saveDeezerTracks(tracks: DeezerTrack[]) {
  if (typeof window === 'undefined' || tracks.length === 0) return

  try {
    const existing = readDeezerLibrary()
    const recent = tracks.map(toSavedTrack)
    const recentIds = new Set(recent.map((track) => track.id))
    const updated = [
      ...recent,
      ...existing.filter((track) => !recentIds.has(track.id)),
    ].slice(0, 500)

    // Keep recently saved tracks first and cap storage to avoid growing without limit.
    window.localStorage.setItem(DEEZER_LIBRARY_KEY, JSON.stringify(updated))
  } catch {
    // Storage can be disabled or full; the API results still remain usable in memory.
  }
}

export function clearDeezerLibrary() {
  if (typeof window === 'undefined') return false

  try {
    window.localStorage.removeItem(DEEZER_LIBRARY_KEY)
    return true
  } catch {
    return false
  }
}

export function readDeezerLibrary(): SavedDeezerTrack[] {
  if (typeof window === 'undefined') return []

  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(DEEZER_LIBRARY_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []

    return parsed.filter((item): item is SavedDeezerTrack =>
      typeof item?.id === 'number' &&
      typeof item?.title === 'string' &&
      typeof item?.artist === 'string' &&
      typeof item?.album === 'string' &&
      typeof item?.imageLarge === 'string' &&
      typeof item?.imageMedium === 'string' &&
      typeof item?.preview === 'string',
    )
  } catch {
    return []
  }
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function similarity(left: string, right: string) {
  if (!left || !right) return 0
  if (left === right) return 1

  if (right.includes(left) || left.includes(right)) {
    return 0.82 + 0.18 * (Math.min(left.length, right.length) / Math.max(left.length, right.length))
  }

  const bigrams = (value: string) => {
    const compact = value.replaceAll(' ', '')
    const result = new Set<string>()
    for (let index = 0; index < compact.length - 1; index += 1) {
      result.add(compact.slice(index, index + 2))
    }
    return result
  }

  const leftPairs = bigrams(left)
  const rightPairs = bigrams(right)
  if (!leftPairs.size || !rightPairs.size) return 0

  let shared = 0
  leftPairs.forEach((pair) => {
    if (rightPairs.has(pair)) shared += 1
  })

  return (2 * shared) / (leftPairs.size + rightPairs.size)
}

export function findClosestDeezerTrack(query: string, tracks = readDeezerLibrary()) {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) return null

  const closest = tracks.reduce<{ track: SavedDeezerTrack | null; score: number }>(
    (current, track) => {
      if (!track.preview) return current

      const title = normalize(track.title)
      const artist = normalize(track.artist)
      const combined = `${title} ${artist}`
      const score = Math.max(
        similarity(normalizedQuery, combined),
        similarity(normalizedQuery, title) * 0.96,
        similarity(normalizedQuery, artist) * 0.9,
      )

      return score > current.score ? { track, score } : current
    },
    { track: null, score: 0 },
  )

  return closest.score >= 0.2 ? closest.track : null
}
