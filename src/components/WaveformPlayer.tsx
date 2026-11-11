import { useCallback, useEffect, useRef, useState } from 'react'
import './WaveformPlayer.css'

interface WaveformPlayerProps {
  src: string
  title: string
  compact?: boolean
  autoPlay?: boolean
  playbackGroup?: string
  onTimeUpdate?: (time: number) => void
  onMediaError?: () => void
}

function formatTime(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  return `${Math.floor(safeSeconds / 60)}:${String(Math.floor(safeSeconds % 60)).padStart(2, '0')}`
}

export function WaveformPlayer({
  src,
  title,
  compact = false,
  autoPlay = false,
  playbackGroup,
  onTimeUpdate,
  onMediaError,
}: WaveformPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const onTimeUpdateRef = useRef(onTimeUpdate)
  const onMediaErrorRef = useRef(onMediaError)
  const [isReady, setIsReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState(false)

  useEffect(() => {
    onTimeUpdateRef.current = onTimeUpdate
  }, [onTimeUpdate])

  useEffect(() => {
    onMediaErrorRef.current = onMediaError
  }, [onMediaError])

  const drawSpectrum = useCallback(() => {
    const canvas = canvasRef.current
    const analyser = analyserRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    const bounds = canvas.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return

    const pixelRatio = window.devicePixelRatio || 1
    const width = Math.round(bounds.width * pixelRatio)
    const height = Math.round(bounds.height * pixelRatio)
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    context.clearRect(0, 0, width, height)

    const barCount = compact ? 20 : 48
    const gap = 4 * pixelRatio
    const barWidth = Math.max(1, (width - gap * (barCount - 1)) / barCount)
    const frequencies = analyser ? new Uint8Array(analyser.frequencyBinCount) : null
    if (analyser && frequencies) analyser.getByteFrequencyData(frequencies)
    const gradient = context.createLinearGradient(0, 0, 0, height)
    gradient.addColorStop(0, '#f3d4ff')
    gradient.addColorStop(0.56, '#d3adff')
    gradient.addColorStop(1, '#a77bd4')

    for (let index = 0; index < barCount; index += 1) {
      const bin = frequencies
        ? Math.min(frequencies.length - 1, Math.floor((index / barCount) ** 1.7 * frequencies.length))
        : 0
      const level = frequencies ? frequencies[bin] / 255 : 0
      const barHeight = Math.max(2 * pixelRatio, level * height * 0.92)
      const x = index * (barWidth + gap)
      const y = (height - barHeight) / 2
      context.fillStyle = gradient
      context.beginPath()
      context.roundRect(x, y, barWidth, barHeight, Math.min(barWidth / 2, 3 * pixelRatio))
      context.fill()
    }
  }, [compact])

  const stopAnimation = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    drawSpectrum()
  }, [drawSpectrum])

  function animateSpectrum() {
    drawSpectrum()
    animationFrameRef.current = requestAnimationFrame(animateSpectrum)
  }

  function connectAudioAnalyser() {
    const audio = audioRef.current
    if (!audio) return

    try {
      const AudioContextConstructor = window.AudioContext
      if (!AudioContextConstructor) return

      const audioContext = audioContextRef.current ?? new AudioContextConstructor()
      audioContextRef.current = audioContext

      if (!sourceNodeRef.current) {
        const sourceNode = audioContext.createMediaElementSource(audio)
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.82
        sourceNode.connect(analyser)
        analyser.connect(audioContext.destination)
        sourceNodeRef.current = sourceNode
        analyserRef.current = analyser
      }

      void audioContext.resume()
    } catch {
      setError(true)
    }
  }

  useEffect(() => {
    drawSpectrum()
    const canvas = canvasRef.current
    if (!canvas || typeof ResizeObserver === 'undefined') return

    const resizeObserver = new ResizeObserver(drawSpectrum)
    resizeObserver.observe(canvas)
    return () => resizeObserver.disconnect()
  }, [drawSpectrum])

  useEffect(() => () => {
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current)
    void audioContextRef.current?.close()
  }, [])

  useEffect(() => {
    if (!playbackGroup) return

    function pauseOtherPlayer(event: Event) {
      const detail = (event as CustomEvent<{ playbackGroup: string }>).detail
      if (detail.playbackGroup === playbackGroup && audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause()
      }
    }

    window.addEventListener('waveform-player-play', pauseOtherPlayer)
    return () => window.removeEventListener('waveform-player-play', pauseOtherPlayer)
  }, [playbackGroup])

  useEffect(() => {
    if (!autoPlay) return
    const audio = audioRef.current
    if (!audio) return

    setError(false)
    void audio.play().catch(() => setError(true))
  }, [autoPlay, src])

  function handlePlay() {
    const audio = audioRef.current
    if (!audio) return

    setError(false)
    connectAudioAnalyser()
    if (playbackGroup) {
      window.dispatchEvent(new CustomEvent('waveform-player-play', {
        detail: { playbackGroup },
      }))
    }
    void audio.play().catch(() => setError(true))
  }

  function togglePlayback() {
    const audio = audioRef.current
    if (!audio) return

    if (audio.paused) handlePlay()
    else audio.pause()
  }

  function seek(value: string) {
    const audio = audioRef.current
    if (audio) audio.currentTime = Number(value)
  }

  return (
    <div className={`waveform-player${compact ? ' is-compact' : ''}`}>
      <audio
        ref={audioRef}
        className="waveform-audio"
        crossOrigin="anonymous"
        src={src}
        preload={compact ? 'none' : 'auto'}
        aria-label={title}
        onLoadStart={() => {
          setIsReady(false)
          setIsPlaying(false)
          setCurrentTime(0)
          setDuration(0)
          setError(false)
        }}
        onCanPlay={() => setIsReady(true)}
        onLoadedMetadata={(event) => {
          setIsReady(true)
          setDuration(event.currentTarget.duration)
        }}
        onPlay={() => {
          setIsPlaying(true)
          connectAudioAnalyser()
          if (animationFrameRef.current === null) animateSpectrum()
        }}
        onPause={() => {
          setIsPlaying(false)
          stopAnimation()
        }}
        onEnded={() => {
          setIsPlaying(false)
          stopAnimation()
        }}
        onTimeUpdate={(event) => {
          const time = event.currentTarget.currentTime
          setCurrentTime(time)
          onTimeUpdateRef.current?.(time)
        }}
        onError={() => {
          setIsPlaying(false)
          setError(true)
          onMediaErrorRef.current?.()
        }}
      />
      <button
        className="waveform-play"
        type="button"
        onClick={togglePlayback}
        aria-label={isPlaying ? `Pausar ${title}` : `Reproduzir ${title}`}
        title={isPlaying ? 'Pausar' : 'Reproduzir'}
      >
        {isPlaying ? (
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M7 5v10M13 5v10" /></svg>
        ) : (
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m7 4.5 9 5.5-9 5.5z" /></svg>
        )}
      </button>
      <div className="waveform-main">
        <div className="waveform-visualizer" aria-hidden="true">
          <canvas ref={canvasRef} />
        </div>
        {!compact && (
          <div className="waveform-timeline">
            <span>{formatTime(currentTime)}</span>
            <input
              type="range"
              min="0"
              max={duration || 30}
              step="0.1"
              value={Math.min(currentTime, duration || 30)}
              onChange={(event) => seek(event.target.value)}
              aria-label={`Posição da prévia de ${title}`}
              disabled={!isReady}
            />
            <span>{formatTime(duration || 30)}</span>
          </div>
        )}
      </div>
      {error && !compact && <span className="waveform-error" role="status">A prévia não iniciou. Tente reproduzir novamente.</span>}
    </div>
  )
}
