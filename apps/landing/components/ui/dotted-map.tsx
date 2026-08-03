'use client'

import { useEffect, useRef, useState } from 'react'

interface DottedMapProps {
  dots?: Array<{ lat: number; lng: number; label?: string }>
  lineColor?: string
}

export function DottedMap({ dots = [], lineColor = '#ea7317' }: DottedMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 800, h: 400 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { w, h } = size
    ctx.clearRect(0, 0, w, h)

    const rows = 30
    const cols = 60
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (c / cols) * w
        const y = (r / rows) * h
        const lat = 90 - (r / rows) * 180
        const lng = -180 + (c / cols) * 360
        if (isLandApprox(lat, lng)) {
          ctx.beginPath()
          ctx.arc(x + 6, y + 6, 1.5, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255,255,255,0.2)'
          ctx.fill()
        }
      }
    }

    dots.forEach(({ lat, lng }) => {
      const x = ((lng + 180) / 360) * w
      const y = ((90 - lat) / 180) * h
      ctx.beginPath()
      ctx.arc(x, y, 4, 0, Math.PI * 2)
      ctx.fillStyle = lineColor
      ctx.fill()
    })

    if (dots.length > 1) {
      ctx.beginPath()
      dots.forEach(({ lat, lng }, i) => {
        const x = ((lng + 180) / 360) * w
        const y = ((90 - lat) / 180) * h
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.strokeStyle = lineColor
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.globalAlpha = 0.5
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  }, [dots, lineColor, size])

  useEffect(() => {
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const { width, height } = e.contentRect
        if (width > 0 && height > 0) setSize({ w: width, h: height })
      }
    })
    if (canvasRef.current?.parentElement) ro.observe(canvasRef.current.parentElement)
    return () => ro.disconnect()
  }, [])

  return (
    <canvas
      ref={canvasRef}
      width={size.w}
      height={size.h}
      style={{ width: '100%', height: '100%' }}
    />
  )
}

function isLandApprox(lat: number, lng: number): boolean {
  if (lat > 75 || lat < -60) return false
  if (lat > 60 && (lng < -140 || (lng > -10 && lng < 30) || lng > 160)) return false
  if (lat < -20 && lng > 50 && lng < 140) return false
  if (lat < 10 && lat > -10 && lng > -50 && lng < 10) return false
  return true
}
