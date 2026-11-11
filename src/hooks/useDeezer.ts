import { useCallback, useEffect, useRef, useState } from 'react'

export interface DeezerArtist {
  id: number
  name: string
  link: string
  picture: string
  picture_small: string
  picture_medium: string
  picture_big: string
  picture_xl: string
}

export interface DeezerAlbum {
  id: number
  title: string
  cover: string
  cover_small: string
  cover_medium: string
  cover_big: string
  cover_xl: string
}

export interface DeezerTrack {
  id: number
  readable: boolean
  title: string
  title_short: string
  title_version: string
  isrc: string
  link: string
  duration: number
  rank: number
  explicit_lyrics: boolean
  preview: string
  artist: DeezerArtist
  album: DeezerAlbum
}

interface DeezerSearchResponse {
  data: DeezerTrack[]
  total: number
  next?: string
}

interface UseDeezerResult {
  tracks: DeezerTrack[]
  total: number
  isLoading: boolean
  error: string | null
  hasMore: boolean
  loadMore: () => Promise<void>
}

const DEEZER_SEARCH_URL = '/api/deezer/search'

function useApiProxy(url: string) {
  const parsedUrl = new URL(url, window.location.origin)
  return `/api/deezer${parsedUrl.pathname}${parsedUrl.search}`
}

export function useDeezer(query = ''): UseDeezerResult {
  const [tracks, setTracks] = useState<DeezerTrack[]>([])
  const [total, setTotal] = useState(0)
  const [nextUrl, setNextUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestController = useRef<AbortController | null>(null)

  useEffect(() => {
    requestController.current?.abort()

    if (!query.trim()) {
      setTracks([])
      setTotal(0)
      setNextUrl(null)
      setError(null)
      setIsLoading(false)
      return
    }

    const controller = new AbortController()
    requestController.current = controller
    const searchUrl = `${DEEZER_SEARCH_URL}?q=${encodeURIComponent(query.trim())}`

    async function search() {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(searchUrl, { signal: controller.signal })
        if (!response.ok) {
          throw new Error(`A Deezer respondeu com o status ${response.status}.`)
        }

        const result = (await response.json()) as DeezerSearchResponse
        setTracks(result.data ?? [])
        setTotal(result.total ?? 0)
        setNextUrl(result.next ?? null)
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setTracks([])
        setTotal(0)
        setNextUrl(null)
        setError(
          cause instanceof Error
            ? cause.message
            : 'Não foi possível consultar a Deezer.',
        )
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    void search()

    return () => controller.abort()
  }, [query])

  const loadMore = useCallback(async () => {
    if (!nextUrl || isLoading) return

    requestController.current?.abort()
    const controller = new AbortController()
    requestController.current = controller
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(useApiProxy(nextUrl), { signal: controller.signal })
      if (!response.ok) {
        throw new Error(`A Deezer respondeu com o status ${response.status}.`)
      }

      const result = (await response.json()) as DeezerSearchResponse
      setTracks((current) => [...current, ...(result.data ?? [])])
      setNextUrl(result.next ?? null)
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível carregar mais faixas.',
      )
    } finally {
      if (!controller.signal.aborted) setIsLoading(false)
    }
  }, [isLoading, nextUrl])

  return { tracks, total, isLoading, error, hasMore: Boolean(nextUrl), loadMore }
}
