import { useState, type FormEvent } from 'react'
import { Avatar, Collapsible, Label } from 'radix-ui'
import { Link } from 'react-router'
import { SpectrumPlayer } from '../components/SpectrumPlayer'
import { useDeezer, type DeezerTrack } from '../hooks/useDeezer'
import { clearDeezerLibrary, readDeezerLibrary, saveDeezerTracks } from '../lib/deezerStorage'
import './DeezerPage.css'

interface AdvancedFilters {
  artist: string
  album: string
  track: string
  label: string
  dur_min: string
  dur_max: string
  bpm_min: string
  bpm_max: string
}

const EMPTY_FILTERS: AdvancedFilters = {
  artist: '',
  album: '',
  track: '',
  label: '',
  dur_min: '',
  dur_max: '',
  bpm_min: '',
  bpm_max: '',
}

function makeQuery(term: string, filters: AdvancedFilters) {
  const parts = term.trim() ? [term.trim()] : []

  Object.entries(filters).forEach(([field, rawValue]) => {
    const value = rawValue.trim()
    if (!value) return

    const formattedValue = ['artist', 'album', 'track', 'label'].includes(field)
      ? `"${value.replaceAll('"', '')}"`
      : value
    parts.push(`${field}:${formattedValue}`)
  })

  return parts.join(' ') || 'eminem'
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

function secureImageUrl(url: string) {
  return url.replace(/^http:\/\//, 'https://')
}

function TrackRow({
  track,
  index,
  isSaved,
  onSave,
}: {
  track: DeezerTrack
  index: number
  isSaved: boolean
  onSave: (track: DeezerTrack) => void
}) {
  return (
    <article className="track-row">
      <span className="track-index" aria-hidden="true">
        {String(index + 1).padStart(2, '0')}
      </span>
      <Avatar.Root className="track-cover">
        <Avatar.Image
          className="track-cover-image"
          src={secureImageUrl(track.album.cover_medium)}
          alt={`Capa do álbum ${track.album.title}`}
          loading="lazy"
        />
        <Avatar.Fallback className="track-cover-fallback" delayMs={300}>
          {track.album.title.slice(0, 2).toUpperCase()}
        </Avatar.Fallback>
      </Avatar.Root>
      <div className="track-copy">
        <a className="track-title" href={track.link} target="_blank" rel="noreferrer">
          {track.title_short || track.title}
          {track.title_version && <span className="track-version"> {track.title_version}</span>}
        </a>
        <div className="track-subline">
          <a href={track.artist.link} target="_blank" rel="noreferrer">
            {track.artist.name}
          </a>
          <span aria-hidden="true">·</span>
          <span>{track.album.title}</span>
          {track.explicit_lyrics && <span className="explicit-tag">E</span>}
        </div>
      </div>
      {track.preview ? (
        <SpectrumPlayer
          compact
          playbackGroup="deezer-search-results"
          src={track.preview}
          title={`${track.title} — ${track.artist.name}`}
        />
      ) : (
        <span className="preview-unavailable">Prévia indisponível</span>
      )}
      <span className="track-duration">{formatDuration(track.duration)}</span>
      <button
        className={`save-track${isSaved ? ' is-saved' : ''}`}
        type="button"
        onClick={() => onSave(track)}
        disabled={isSaved}
        aria-pressed={isSaved}
        aria-label={isSaved ? `${track.title} já está salva` : `Salvar ${track.title} na biblioteca`}
      >
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M4.5 3.5h8l3 3v10h-11zM7 3.5v5h6v-5M7 16.5v-5h6v5" />
        </svg>
        {isSaved ? 'Salva' : 'Salvar'}
      </button>
      <a
        className="deezer-link"
        href={track.link}
        target="_blank"
        rel="noreferrer"
        aria-label={`Abrir ${track.title} na Deezer`}
      >
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M11 3h6v6M17 3l-9 9M15 11v5H4V5h5" />
        </svg>
      </a>
    </article>
  )
}

function FilterField({
  name,
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  name: keyof AdvancedFilters
  label: string
  value: string
  onChange: (name: keyof AdvancedFilters, value: string) => void
  type?: 'text' | 'number'
  placeholder?: string
}) {
  return (
    <Label.Root className="filter-field">
      <span>{label}</span>
      <input
        name={name}
        type={type}
        min={type === 'number' ? 0 : undefined}
        step={type === 'number' ? 1 : undefined}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(name, event.target.value)}
      />
    </Label.Root>
  )
}

export function DeezerPage() {
  const [term, setTerm] = useState('')
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [showFilters, setShowFilters] = useState(false)
  const [showJson, setShowJson] = useState(false)
  const [savedTrackIds, setSavedTrackIds] = useState(
    () => new Set(readDeezerLibrary().map((track) => track.id)),
  )
  const { tracks, total, isLoading, error, hasMore, loadMore } = useDeezer(query)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setQuery(makeQuery(term, filters))
  }

  function updateFilter(name: keyof AdvancedFilters, value: string) {
    setFilters((current) => ({ ...current, [name]: value }))
  }

  function saveTrack(track: DeezerTrack) {
    saveDeezerTracks([track])
    setSavedTrackIds((current) => new Set(current).add(track.id))
  }

  function clearLibrary() {
    if (savedTrackIds.size === 0) return
    if (!window.confirm('Deseja remover todas as faixas da biblioteca local?')) return

    if (clearDeezerLibrary()) {
      setSavedTrackIds(new Set())
    } else {
      window.alert('Não foi possível limpar a biblioteca local.')
    }
  }

  return (
    <main className="deezer-page">
      <header className="topbar">
        <Link className="wordmark" to="/" aria-label="Voltar ao player">
          <span className="wordmark-mark" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>deezer<span className="wordmark-light"> search</span></span>
        </Link>
        <span className="api-status"><span />API de busca</span>
      </header>

      <section className="search-intro" aria-labelledby="page-title">
        <div className="intro-copy">
          <h1 id="page-title">Encontre sua próxima faixa.</h1>
          <p>Busque músicas no catálogo Deezer e ouça uma prévia de 30 segundos.</p>
        </div>

        <form className="search-form" onSubmit={handleSubmit}>
          <Label.Root className="search-box">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="10.8" cy="10.8" r="6.8" />
              <path d="m16 16 4.2 4.2" />
            </svg>
            <span className="visually-hidden">Buscar faixas, artistas ou álbuns</span>
            <input
              type="search"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Artista, faixa ou álbum"
            />
            {term && <kbd>↵</kbd>}
          </Label.Root>
          <Collapsible.Root
            className="filters-wrap"
            open={showFilters}
            onOpenChange={setShowFilters}
          >
            <Collapsible.Trigger asChild>
              <button
                className={`filter-toggle${showFilters ? ' is-open' : ''}`}
                type="button"
                aria-controls="advanced-filters"
              >
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M3 5h14M5.5 10h9M8 15h4" />
                </svg>
                Filtros
                <span className="filter-count">
                  {Object.values(filters).filter(Boolean).length || ''}
                </span>
              </button>
            </Collapsible.Trigger>
            <Collapsible.Content className="advanced-filters" id="advanced-filters">
              <div className="filter-grid">
                <FilterField name="artist" label="Artista" value={filters.artist} onChange={updateFilter} placeholder="ex.: aloe blacc" />
                <FilterField name="album" label="Álbum" value={filters.album} onChange={updateFilter} placeholder="ex.: good things" />
                <FilterField name="track" label="Faixa" value={filters.track} onChange={updateFilter} placeholder="ex.: i need a dollar" />
                <FilterField name="label" label="Gravadora" value={filters.label} onChange={updateFilter} placeholder="ex.: because music" />
                <FilterField name="dur_min" label="Duração mínima (s)" type="number" value={filters.dur_min} onChange={updateFilter} />
                <FilterField name="dur_max" label="Duração máxima (s)" type="number" value={filters.dur_max} onChange={updateFilter} />
                <FilterField name="bpm_min" label="BPM mínimo" type="number" value={filters.bpm_min} onChange={updateFilter} />
                <FilterField name="bpm_max" label="BPM máximo" type="number" value={filters.bpm_max} onChange={updateFilter} />
              </div>
              <p className="filter-hint">Os filtros são combinados com o termo da busca.</p>
            </Collapsible.Content>
          </Collapsible.Root>
          <button className="search-submit" type="submit" disabled={isLoading}>
            {isLoading ? 'Buscando…' : 'Buscar'}
          </button>

        </form>

        <div className="query-example">
          <span>Busca avançada</span>
          <code>artist:"aloe blacc" dur_min:180 bpm_max:120</code>
        </div>
      </section>

      <section className="results-section" aria-labelledby="results-title">
        <div className="results-heading">
          <div>
            <h2 id="results-title">Resultados</h2>
            <p aria-live="polite">
              {isLoading && tracks.length === 0
                ? 'Consultando o catálogo…'
                : `${total.toLocaleString('pt-BR')} faixas encontradas`}
            </p>
          </div>
          <div className="results-actions">
            <button
              className="json-toggle clear-library"
              type="button"
              onClick={clearLibrary}
              disabled={savedTrackIds.size === 0}
            >
              Limpar biblioteca ({savedTrackIds.size})
            </button>
            <button
              className={`json-toggle${showJson ? ' is-active' : ''}`}
              type="button"
              onClick={() => setShowJson((visible) => !visible)}
              aria-expanded={showJson}
            >
              <span aria-hidden="true">{'{ }'}</span>
              {showJson ? 'Ocultar JSON' : 'Ver JSON'}
            </button>
          </div>
        </div>

        {error && (
          <div className="state-panel error-panel" role="alert">
            <strong>Não foi possível carregar os resultados.</strong>
            <span>{error} Confira a conexão e tente novamente.</span>
            <button type="button" onClick={() => setQuery((current) => `${current} `)}>Tentar de novo</button>
          </div>
        )}

        {!error && isLoading && tracks.length === 0 && (
          <div className="state-panel" role="status">Buscando faixas na Deezer…</div>
        )}

        {!error && !isLoading && tracks.length === 0 && (
          <div className="state-panel empty-panel">
            <strong>Nenhuma faixa encontrada</strong>
            <span>Tente outro artista, faixa ou ajuste os filtros avançados.</span>
          </div>
        )}

        {tracks.length > 0 && (
          <div className="track-list">
            <div className="list-labels" aria-hidden="true">
              <span>FAIXA</span>
              <span>PRÉVIA</span>
              <span>TEMPO</span>
              <span />
            </div>
            {tracks.map((track, index) => (
              <TrackRow
                key={track.id}
                track={track}
                index={index}
                isSaved={savedTrackIds.has(track.id)}
                onSave={saveTrack}
              />
            ))}
          </div>
        )}

        {showJson && tracks.length > 0 && (
          <pre className="json-view" aria-label="Resposta JSON da busca Deezer">
            {JSON.stringify({ data: tracks, total }, null, 2)}
          </pre>
        )}

        {hasMore && tracks.length > 0 && (
          <button className="load-more" type="button" onClick={() => void loadMore()} disabled={isLoading}>
            {isLoading ? 'Carregando…' : 'Carregar mais faixas'}
          </button>
        )}
      </section>

      <footer className="page-footer">
        <span>Resultados fornecidos pela API pública Deezer.</span>
        <span>As prévias têm até 30 segundos.</span>
      </footer>
    </main>
  )
}
