'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'
import { Eraser } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

type SignatureInputProps = {
  canvasRef?: React.RefObject<HTMLCanvasElement | null>
  /** The signature value (data URL). Use for controlled mode. */
  value?: string | null
  /** Default signature value (data URL). Use for uncontrolled mode. */
  defaultValue?: string | null
  /** Callback when signature changes. Required for controlled mode. */
  onChange?: (value: string | null) => void
  /** Callback when the signature input loses focus */
  onBlur?: () => void
  /** Whether the signature input is disabled */
  disabled?: boolean
  className?: string
  /** ARIA label for the signature canvas */
  'aria-label'?: string
  /** ARIA labelledby for the signature canvas */
  'aria-labelledby'?: string
  /** ARIA describedby for the signature canvas */
  'aria-describedby'?: string
  /** ARIA required for the signature canvas */
  'aria-required'?: boolean
  /** ARIA invalid for the signature canvas */
  'aria-invalid'?: boolean
}

const getCanvasColors = () => {
  const isDarkClass = document.documentElement.classList.contains('dark')
  const isLightClass = document.documentElement.classList.contains('light')

  const systemPrefersDark = window.matchMedia(
    '(prefers-color-scheme: dark)',
  ).matches

  const isDarkMode = isDarkClass || (!isLightClass && systemPrefersDark)

  return {
    strokeColor: isDarkMode ? '#ffffff' : '#000000',
    backgroundColor: isDarkMode ? '#000000' : '#ffffff',
  }
}

const disableTouchScroll = (canvas: HTMLCanvasElement) => {
  const preventScroll = (e: TouchEvent) => {
    e.preventDefault() // Disable scroll
  }

  canvas.addEventListener('touchstart', preventScroll, { passive: false })
  canvas.addEventListener('touchmove', preventScroll, { passive: false })
  canvas.addEventListener('touchend', preventScroll, { passive: false })

  return () => {
    canvas.removeEventListener('touchstart', preventScroll)
    canvas.removeEventListener('touchmove', preventScroll)
    canvas.removeEventListener('touchend', preventScroll)
  }
}

export default function SignatureInput({
  canvasRef: externalCanvasRef,
  value,
  defaultValue,
  onChange,
  onBlur,
  disabled,
  className,
  'aria-label': ariaLabel = 'Signature',
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-required': ariaRequired,
  'aria-invalid': ariaInvalid,
}: SignatureInputProps) {
  const internalCanvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = externalCanvasRef ?? internalCanvasRef
  const [isDrawing, setIsDrawing] = useState(false)
  const [canvasSize, setCanvasSize] = useState({ width: 400, height: 200 })
  const [lastPosition, setLastPosition] = useState<{
    x: number
    y: number
  } | null>(null)

  // ResizeObserver to sync canvas dimensions with container
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) {
          setCanvasSize({
            width: Math.floor(width),
            height: Math.floor(height),
          })
        }
      }
    })

    resizeObserver.observe(container)
    return () => resizeObserver.disconnect()
  }, [])

  // Track if this is the initial mount for defaultValue
  const isInitialMount = useRef(true)

  // Re-initialize canvas context when dimensions change
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { strokeColor, backgroundColor } = getCanvasColors()

    // Setup canvas context
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    ctx.strokeStyle = strokeColor

    // Fill with background
    ctx.fillStyle = backgroundColor
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }, [canvasRef, canvasSize])

  // Load signature from value (controlled) or defaultValue (uncontrolled)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // For controlled mode, always sync with value
    // For uncontrolled mode, only load defaultValue on initial mount
    const signatureToLoad =
      value !== undefined
        ? value
        : isInitialMount.current
          ? defaultValue
          : undefined

    if (isInitialMount.current) {
      isInitialMount.current = false
    }

    if (signatureToLoad === undefined) return

    if (signatureToLoad === null) {
      const { backgroundColor } = getCanvasColors()
      ctx.fillStyle = backgroundColor
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      return
    }

    const img = new Image()
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    }
    img.src = signatureToLoad
  }, [canvasRef, canvasSize, value, defaultValue])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Disable touch scrolling while drawing
    const cleanupTouchScroll = disableTouchScroll(canvas)

    return () => {
      cleanupTouchScroll()
    }
  }, [canvasRef])

  const startDrawing = (
    e:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    if (disabled) return
    e.preventDefault()
    setIsDrawing(true)
    draw(e)
  }

  const stopDrawing = () => {
    if (!isDrawing) return

    setIsDrawing(false)
    setLastPosition(null)
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) {
      ctx.beginPath()
      const dataUrl = canvas.toDataURL()
      onChange?.(dataUrl) // Pass data URL to the form's onChange
    }
  }

  const draw = (
    e:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    e.preventDefault()
    if (!isDrawing) return

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) {
      const rect = canvas.getBoundingClientRect()

      let clientX: number
      let clientY: number

      if ('touches' in e && e.touches[0]) {
        clientX = e.touches[0].clientX
        clientY = e.touches[0].clientY
      } else if ('clientX' in e) {
        clientX = e.clientX
        clientY = e.clientY
      } else {
        return
      }

      // Scale coordinates to match canvas internal resolution
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height
      const x = (clientX - rect.left) * scaleX
      const y = (clientY - rect.top) * scaleY

      if (lastPosition) {
        const midX = (lastPosition.x + x) / 2
        const midY = (lastPosition.y + y) / 2

        ctx.beginPath()
        ctx.moveTo(lastPosition.x, lastPosition.y)
        ctx.quadraticCurveTo(midX, midY, x, y) // Smooth transition
        ctx.stroke()
      } else {
        // For the first point, simply move to the position without a stroke
        ctx.beginPath()
        ctx.moveTo(x, y)
      }

      setLastPosition({ x, y })
    }
  }

  const clearSignature = () => {
    if (disabled) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) {
      const { backgroundColor } = getCanvasColors()
      ctx.fillStyle = backgroundColor
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      onChange?.(null) // Clear signature in the form as well
    }
  }

  // Callback ref to sync both internal and external refs
  const setCanvasRef = (element: HTMLCanvasElement | null) => {
    // Update internal ref
    ;(
      internalCanvasRef as React.MutableRefObject<HTMLCanvasElement | null>
    ).current = element
    // Update external ref if provided
    if (externalCanvasRef) {
      ;(
        externalCanvasRef as React.MutableRefObject<HTMLCanvasElement | null>
      ).current = element
    }
  }

  return (
    <div
      ref={containerRef}
      role="img"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      aria-required={ariaRequired}
      aria-invalid={ariaInvalid}
      aria-disabled={disabled}
      onBlur={onBlur}
      className={cn(
        'border-border relative h-[180px] w-full overflow-hidden rounded-lg border',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus:outline-none focus-visible:ring-[3px]',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <canvas
        ref={setCanvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        className="h-full w-full"
        onMouseDown={startDrawing}
        onMouseUp={stopDrawing}
        onMouseOut={stopDrawing}
        onMouseMove={draw}
        onTouchStart={startDrawing}
        onTouchEnd={stopDrawing}
        onTouchMove={draw}
      />
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="absolute bottom-1 left-1 z-10 rounded-full"
        onClick={clearSignature}
        disabled={disabled}
        aria-label="Clear"
      >
        <Eraser className="text-muted-foreground hover:text-primary h-4 w-4" />
      </Button>
    </div>
  )
}
