import { useCallback, useEffect, useId, useRef, useState } from 'react'
import AudioSpectrum from 'react-audio-spectrum'
import './SpectrumPlayer.css'

interface SpectrumPlayerProps {
  src: string
  title: string
  compact?: boolean
  autoPlay?: boolean
  playbackGroup?: string
  onTimeUpdate?: (time: number) => void
  onMediaError?: () => void
}

const SPECTRUM_COLORS = [
  { stop: 0, color: '#a77bd4' },
  { stop: 0.56, color: '#d3adff' },
  { stop: 1, color: '#f3d4ff' },
]

function formatTime(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  return `${Math.floor(safeSeconds / 60)}:${String(Math.floor(safeSeconds % 60)).padStart(2, '0')}`
}

export function SpectrumPlayer({
  src,
  title,
  compact = false,
  autoPlay = false,
  playbackGroup,
  onTimeUpdate,
  onMediaError,
}: SpectrumPlayerProps) {
  const instanceId = useId().replaceAll(':', '')
  const audioId = `quiz-audio-${instanceId}`
  const canvasId = `quiz-spectrum-${instanceId}`
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState(false)
  const onMediaErrorRef = useRef(onMediaError)

  useEffect(() => {
    onMediaErrorRef.current = onMediaError
  }, [onMediaError])

  useEffect(() => {
    if (!autoPlay) return

    const audio = document.getElementById(audioId) as HTMLAudioElement | null
    if (!audio) return

    void audio.play().catch(() => setError(true))
  }, [audioId, autoPlay, src])

  useEffect(() => {
    if (!playbackGroup) return

    function pauseOtherPlayer(event: Event) {
      const detail = (event as CustomEvent<{ audioId: string; playbackGroup: string }>).detail
      if (detail.playbackGroup !== playbackGroup || detail.audioId === audioId) return

      const audio = document.getElementById(audioId) as HTMLAudioElement | null
      if (audio && !audio.paused) audio.pause()
    }

    window.addEventListener('spectrum-player-play', pauseOtherPlayer)
    return () => window.removeEventListener('spectrum-player-play', pauseOtherPlayer)
  }, [audioId, playbackGroup])

  function handlePlay() {
    setIsPlaying(true)
    setError(false)
    if (playbackGroup) {
      window.dispatchEvent(new CustomEvent('spectrum-player-play', {
        detail: { audioId, playbackGroup },
      }))
    }
  }

  const togglePlayback = useCallback(async () => {
    const audio = document.getElementById(audioId) as HTMLAudioElement | null
    if (!audio) return

    
    setError(false)
    try {
      if (audio.paused) {
        await audio.play()
      } else {
        audio.pause()
      }
    } catch {
      setError(true)
    }
  }, [audioId])

  function handleTimeUpdate(audio: HTMLAudioElement) {
    setCurrentTime(audio.currentTime)
    onTimeUpdate?.(audio.currentTime)
  }

  function handleMediaError() {
    setIsPlaying(false)
    setError(true)
    onMediaErrorRef.current?.()
  }

  function seek(value: string) {
    const audio = document.getElementById(audioId) as HTMLAudioElement | null
    if (!audio) return
    audio.currentTime = Number(value)
    handleTimeUpdate(audio)
  }

  return (
    <div className={`spectrum-player${compact ? ' is-compact' : ''}`}>
      <audio
        id={audioId}
        className="spectrum-audio"
        crossOrigin="anonymous"
        src={src}
        preload={compact ? 'none' : 'auto'}
        aria-label={title}
        onPlay={handlePlay}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) => handleTimeUpdate(event.currentTarget)}
        onError={handleMediaError}
      />
      <button
        className="spectrum-play"
        type="button"
        onClick={() => void togglePlayback()}
        aria-label={isPlaying ? `Pausar ${title}` : `Reproduzir ${title}`}
        title={isPlaying ? 'Pausar' : 'Reproduzir'}
      >
        {isPlaying ? (
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M7 5v10M13 5v10" /></svg>
        ) : (
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m7 4.5 9 5.5-9 5.5z" /></svg>
        )}
      </button>
      <div className="spectrum-main">
        <div className="spectrum-visualizer" aria-hidden="true">
          <AudioSpectrum
            id={canvasId}
            audioId={audioId}
            width={compact ? 120 : 348}
            height={compact ? 28 : 54}
            capColor="#f3d4ff"
            capHeight={2}
            meterWidth={compact ? 2 : 3}
            meterCount={compact ? 20 : 48}
            meterColor={SPECTRUM_COLORS}
            gap={compact ? 4 : 4}
          />
        </div>
        {!compact && (
          <div className="spectrum-timeline">
            <span>{formatTime(currentTime)}</span>
            <input
              type="range"
              min="0"
              max={duration || 30}
              step="0.1"
              value={Math.min(currentTime, duration || 30)}
              onChange={(event) => seek(event.target.value)}
              aria-label={`Posição da prévia de ${title}`}
            />
            <span>{formatTime(duration || 30)}</span>
          </div>
        )}
      </div>
      {error && !compact && <span className="spectrum-error" role="status">A prévia não iniciou. Tente reproduzir novamente.</span>}
    </div>
  )
}
