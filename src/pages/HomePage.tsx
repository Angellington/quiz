import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Avatar, Label } from 'radix-ui'
import { Link } from 'react-router'
import { SpectrumPlayer } from '../components/SpectrumPlayer'
import {
  findClosestDeezerTrack,
  refreshDeezerTrackPreview,
  readDeezerLibrary,
  type SavedDeezerTrack,
} from '../lib/deezerStorage'
import './HomePage.css'

interface LyricLine {
  time: number
  text: string
}

interface LyricsResponse {
  trackName?: string
  artistName?: string
  albumName?: string
  duration?: number
  syncedLyrics?: string | null
  plainLyrics?: string | null
  instrumental?: boolean
}

type LyricsState = 'loading' | 'synced' | 'plain' | 'missing' | 'error'

const PREVIEW_START_OFFSET_SECONDS = 48.5

function httpsImage(url: string) {
  return url.replace(/^http:\/\//, 'https://')
}

function parseSyncedLyrics(source: string): LyricLine[] {
  const timestamp = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g
  const lines: LyricLine[] = []

  source.split(/\r?\n/).forEach((rawLine) => {
    const matches = Array.from(rawLine.matchAll(timestamp))
    const text = rawLine.replace(timestamp, '').trim()
    if (!text) return

    matches.forEach((match) => {
      const minutes = Number(match[1])
      const seconds = Number(match[2])
      const fraction = match[3] ?? '0'
      const fractionSeconds = Number(`0.${fraction}`)
      lines.push({ time: minutes * 60 + seconds + fractionSeconds, text })
    })
  })

  return lines.sort((left, right) => left.time - right.time)
}

function normalizeLyricsMatch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function matchesLyricsTrack(record: LyricsResponse, track: SavedDeezerTrack) {
  const resultTitle = normalizeLyricsMatch(record.trackName ?? '')
  const resultArtist = normalizeLyricsMatch(record.artistName ?? '')
  const trackTitle = normalizeLyricsMatch(track.title)
  const trackArtist = normalizeLyricsMatch(track.artist)

  const titleMatches = resultTitle && trackTitle && (
    resultTitle === trackTitle || resultTitle.includes(trackTitle) || trackTitle.includes(resultTitle)
  )
  const artistMatches = resultArtist && trackArtist && (
    resultArtist === trackArtist || resultArtist.includes(trackArtist) || trackArtist.includes(resultArtist)
  )

  return Boolean(titleMatches && artistMatches)
}

function chooseLyricsRecord(records: LyricsResponse[], track: SavedDeezerTrack, syncedOnly: boolean) {
  return records
    .filter((record) => matchesLyricsTrack(record, track))
    .filter((record) => {
      const targetDuration = track.duration ?? 0
      return !targetDuration || !record.duration || Math.abs(targetDuration - record.duration) <= 15
    })
    .filter((record) => !syncedOnly || Boolean(record.syncedLyrics))
    .sort((left, right) => {
      const targetDuration = track.duration ?? 0
      const leftDifference = targetDuration && left.duration
        ? Math.abs(targetDuration - left.duration)
        : Number.MAX_SAFE_INTEGER
      const rightDifference = targetDuration && right.duration
        ? Math.abs(targetDuration - right.duration)
        : Number.MAX_SAFE_INTEGER
      return leftDifference - rightDifference
    })[0]
}

function SyncedLyrics({
  track,
  currentTime,
}: {
  track: SavedDeezerTrack
  currentTime: number
}) {
  const [state, setState] = useState<LyricsState>('loading')
  const [syncedLines, setSyncedLines] = useState<LyricLine[]>([])
  const [plainLines, setPlainLines] = useState<string[]>([])
  const lineRefs = useRef<Array<HTMLParagraphElement | null>>([])

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({
      track_name: track.title,
      artist_name: track.artist,
      album_name: track.album,
    })
    if (track.duration && track.duration > 0) {
      params.set('duration', String(track.duration))
    }

    async function loadLyrics() {
      setState('loading')
      setSyncedLines([])
      setPlainLines([])

      try {
        const response = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
          signal: controller.signal,
          headers: { 'Lrclib-Client': 'Quiz/1.0' },
        })


        let exactMatch: LyricsResponse | null = null
        if (response.ok) {
          exactMatch = (await response.json()) as LyricsResponse
        } else if (response.status !== 404) {
          throw new Error(`Lyrics request failed: ${response.status}`)
        }

        let lyrics = exactMatch
        let lines = lyrics?.syncedLyrics ? parseSyncedLyrics(lyrics.syncedLyrics) : []

        if (lines.length === 0) {
          const searchParams = new URLSearchParams({
            track_name: track.title,
            artist_name: track.artist,
          })
          const searchResponse = await fetch(`https://lrclib.net/api/search?${searchParams.toString()}`, {
            signal: controller.signal,
            headers: { 'Lrclib-Client': 'Quiz/1.0' },
          })
          if (!searchResponse.ok) throw new Error(`Lyrics search failed: ${searchResponse.status}`)

          const searchResults = (await searchResponse.json()) as LyricsResponse[]
          const syncedMatch = chooseLyricsRecord(searchResults, track, true)
          const plainMatch = chooseLyricsRecord(searchResults, track, false)
          lyrics = syncedMatch
            ?? (exactMatch?.plainLyrics ? exactMatch : null)
            ?? plainMatch
            ?? exactMatch
            ?? null
          lines = lyrics?.syncedLyrics ? parseSyncedLyrics(lyrics.syncedLyrics) : []
        }

        if (lines.length > 0) {
          console.log("lines", lines)
          setSyncedLines(lines)
          setState('synced')
        } else if (lyrics?.plainLyrics) {
          setPlainLines(lyrics.plainLyrics.split(/\r?\n/).filter(Boolean))
          setState('plain')
        } else {
          setState('missing')
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState('error')
      }
    }

    void loadLyrics()
    return () => controller.abort()
  }, [track])

  const lyricTime = currentTime + PREVIEW_START_OFFSET_SECONDS
  const activeIndex = syncedLines.reduce(
    (current, line, index) => (line.time <= lyricTime ? index : current),
    -1,
  )

  useEffect(() => {
    if (activeIndex >= 0) {
      lineRefs.current[activeIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [activeIndex])

  return (
    <section className="lyrics-panel" aria-labelledby="lyrics-title">
      <div className="lyrics-heading">
        <h3 id="lyrics-title">Letra</h3>
        {state === 'synced' && <span>Sincronizada</span>}
      </div>
      {state === 'loading' && <p className="lyrics-message" role="status">Buscando letra…</p>}
      {state === 'error' && <p className="lyrics-message" role="status">Não foi possível carregar a letra agora.</p>}
      {state === 'missing' && <p className="lyrics-message" role="status">Não encontramos a letra desta faixa.</p>}
      {state === 'plain' && (
        <div className="lyrics-lines is-plain" aria-label="Letra sem sincronização">
          <p className="lyrics-message">A letra está disponível, mas sem marcação de tempo.</p>
          {plainLines.map((line, index) => <p key={`${index}-${line}`}>{line}</p>)}
        </div>
      )}
      {state === 'synced' && (
        <div className="lyrics-lines" aria-live="off">
          {syncedLines.map((line, index) => (
            <p
              key={`${line.time}-${index}`}
              ref={(element) => { lineRefs.current[index] = element }}
              className={index === activeIndex ? 'is-current' : ''}
            >
              {line.text}
            </p>
          ))}
        </div>
      )}
    </section>
  )
}

export function HomePage() {
  const [query, setQuery] = useState('')
  const [selectedTrack, setSelectedTrack] = useState<SavedDeezerTrack | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [savedCount, setSavedCount] = useState(() => readDeezerLibrary().length)
  const [currentTime, setCurrentTime] = useState(0)
  const [activePreview, setActivePreview] = useState<{ trackId: number; url: string } | null>(null)
  const [isRefreshingPreview, setIsRefreshingPreview] = useState(false)
  const previewRefreshAttempts = useRef(new Set<string>())

  useEffect(() => {
    if (!selectedTrack) {
      setActivePreview(null)
      setIsRefreshingPreview(false)
      return
    }

    const controller = new AbortController()
    let isCurrent = true
    setActivePreview(null)
    setIsRefreshingPreview(true)

    void refreshDeezerTrackPreview(selectedTrack.id, controller.signal)
      .then((preview) => {
        if (!isCurrent) return
        setActivePreview({ trackId: selectedTrack.id, url: preview || selectedTrack.preview })
      })
      .catch(() => {
        if (!isCurrent) return
        setActivePreview({ trackId: selectedTrack.id, url: selectedTrack.preview })
      })
      .finally(() => {
        if (isCurrent) setIsRefreshingPreview(false)
      })

    return () => {
      isCurrent = false
      controller.abort()
    }
  }, [selectedTrack])

  async function renewFailedPreview(trackId: number, failedUrl: string) {
    if (!failedUrl || previewRefreshAttempts.current.has(failedUrl)) return
    previewRefreshAttempts.current.add(failedUrl)

    try {
      const preview = await refreshDeezerTrackPreview(trackId)
      if (preview && preview !== failedUrl) {
        setActivePreview((current) =>
          current?.trackId === trackId && current.url === failedUrl
            ? { trackId, url: preview }
            : current,
        )
      }
    } catch {
      // Keep the player's existing error message if Deezer cannot issue a fresh preview URL.
    }
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedQuery = query.trim()
    if (!trimmedQuery) return

    setHasSearched(true)
    setCurrentTime(0)
    const library = readDeezerLibrary()
    setSavedCount(library.length)
    setSelectedTrack(findClosestDeezerTrack(trimmedQuery, library))
  }

  return (
    <main className="home-page">
      {selectedTrack && (
        <div
          className="home-backdrop"
          style={{ backgroundImage: `url("${httpsImage(selectedTrack.imageLarge)}")` }}
          aria-hidden="true"
        />
      )}
      <div className="home-scrim" aria-hidden="true" />

      <header className="home-topbar">
        <Link className="home-brand" to="/" aria-label="Quiz, início">
          <span className="home-brand-mark" aria-hidden="true"><i /><i /><i /><i /><i /></span>
          <span>Quiz</span>
        </Link>
        <Link className="library-link" to="/deezer">
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="m12.5 12.5 4 4" />
          </svg>
          Buscar na Deezer
        </Link>
      </header>

      <section className="home-content" aria-label="Busca local e faixa selecionada">
        {!selectedTrack && (
          <div className="home-search-intro">
            <span className="home-symbol" aria-hidden="true">
              <svg viewBox="0 0 40 40" fill="none">
                <path d="M10 27V16M17 31V10M24 25V14M31 29V8" />
              </svg>
            </span>
            <h1 id="home-title">O que você quer ouvir?</h1>
            <p>Encontre uma faixa que já passou pela sua busca Deezer.</p>
          </div>
        )}

        <form className="home-search-form" onSubmit={handleSearch}>
          <Label.Root className="home-search-field">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="10.8" cy="10.8" r="6.8" />
              <path d="m16 16 4.2 4.2" />
            </svg>
            <span className="home-visually-hidden">Buscar por música ou artista na biblioteca salva</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Digite o nome da música ou do artista"
            />
          </Label.Root>
          <button className="home-search-button" type="submit" disabled={!query.trim()}>
            Buscar
            <span aria-hidden="true">↗</span>
          </button>
        </form>

        <p className="library-count" aria-live="polite">
          {savedCount === 1 ? '1 faixa salva na biblioteca' : `${savedCount} faixas salvas na biblioteca`}
        </p>

        {!selectedTrack && hasSearched && (
          <div className="home-empty" role="status">
            <strong>Nenhuma faixa parecida foi encontrada.</strong>
            <span>Busque mais músicas na Deezer para adicioná-las à biblioteca.</span>
            <Link to="/deezer">Abrir busca Deezer</Link>
          </div>
        )}

        {selectedTrack && (
          <div className="now-playing">
            <Avatar.Root className="now-playing-art">
              <Avatar.Image
                src={httpsImage(selectedTrack.imageMedium)}
                alt={`Capa de ${selectedTrack.album}`}
              />
              <Avatar.Fallback delayMs={200}>
                {selectedTrack.album.slice(0, 2).toUpperCase()}
              </Avatar.Fallback>
            </Avatar.Root>
            <h2 id="now-playing-title">{selectedTrack.title}</h2>
            <p className="now-playing-artist">{selectedTrack.artist}</p>
            {activePreview?.trackId === selectedTrack.id && activePreview.url ? (
              <SpectrumPlayer
                key={selectedTrack.id}
                src={activePreview.url}
                title={`${selectedTrack.title} — ${selectedTrack.artist}`}
                autoPlay
                onTimeUpdate={setCurrentTime}
                onMediaError={() => void renewFailedPreview(selectedTrack.id, activePreview.url)}
              />
            ) : (
              <p className="lyrics-message" role="status">
                {isRefreshingPreview || activePreview?.trackId !== selectedTrack.id
                  ? 'Atualizando a prévia…'
                  : 'Esta faixa não tem uma prévia disponível.'}
              </p>
            )}
            <SyncedLyrics track={selectedTrack} currentTime={currentTime} />
          </div>
        )}
      </section>

      <footer className="home-footer">
        <span>Prévia de até 30 segundos</span>
        <span>Pesquise na Deezer para ampliar sua biblioteca local</span>
      </footer>
    </main>
  )
}
