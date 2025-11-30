'use client'

import { useState, useRef, useCallback, useMemo } from 'react'

interface DataPoint {
  date: string
  count: number
}

interface AreaChartProps {
  data: DataPoint[]
  height?: number
  formatLabel: (date: string) => string
  formatTooltipDate: (date: string) => string
  valueLabel?: string
  lineColor?: string
}

export function AreaChart({
  data,
  height = 256,
  formatLabel,
  formatTooltipDate,
  valueLabel = 'VISITORS',
  lineColor = 'rgb(139, 92, 246)', // violet-500
}: AreaChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const chartId = useMemo(() => `chart-${Math.random().toString(36).substr(2, 9)}`, [])

  const maxCount = useMemo(() => Math.max(...data.map(d => d.count), 0), [data])

  // Better scaling for small numbers
  const scaledMax = useMemo(() => {
    if (maxCount === 0) return 5
    if (maxCount <= 5) return Math.ceil(maxCount / 1) * 1 || 5
    if (maxCount <= 10) return Math.ceil(maxCount / 2) * 2
    if (maxCount <= 50) return Math.ceil(maxCount / 10) * 10
    if (maxCount <= 100) return Math.ceil(maxCount / 20) * 20

    const magnitude = Math.pow(10, Math.floor(Math.log10(maxCount)))
    const normalized = maxCount / magnitude
    let rounded: number
    if (normalized <= 1) rounded = 1
    else if (normalized <= 2) rounded = 2
    else if (normalized <= 5) rounded = 5
    else rounded = 10
    return rounded * magnitude
  }, [maxCount])

  // Calculate Y-axis labels (ensure unique values)
  const yLabels = useMemo(() => {
    const labels: number[] = []
    const numLabels = Math.min(5, scaledMax + 1)
    const step = scaledMax / (numLabels - 1)

    for (let i = numLabels - 1; i >= 0; i--) {
      const value = Math.round(step * i)
      // Only add if not duplicate
      if (labels.length === 0 || labels[labels.length - 1] !== value) {
        labels.push(value)
      }
    }

    // Ensure we have at least 2 labels
    if (labels.length < 2) {
      return [scaledMax, 0]
    }

    return labels
  }, [scaledMax])

  // Calculate X-axis labels (show ~7 labels max)
  const xLabels = useMemo(() => {
    if (data.length === 0) return []
    if (data.length <= 7) {
      return data.map((d, i) => ({ index: i, label: formatLabel(d.date) }))
    }
    const step = Math.ceil(data.length / 6)
    const labels: { index: number; label: string }[] = []
    for (let i = 0; i < data.length; i += step) {
      labels.push({ index: i, label: formatLabel(data[i].date) })
    }
    return labels
  }, [data, formatLabel])

  const padding = { top: 20, right: 20, bottom: 30, left: 45 }
  const chartHeight = height - padding.top - padding.bottom

  // Generate SVG path for the line with smooth curves
  const { linePath, areaPath } = useMemo(() => {
    if (data.length === 0) return { linePath: '', areaPath: '' }
    if (data.length === 1) {
      const x = 50
      const y = scaledMax > 0 ? 100 - (data[0].count / scaledMax) * 100 : 100
      return {
        linePath: `M 0 ${y} L 100 ${y}`,
        areaPath: `M 0 ${y} L 100 ${y} L 100 100 L 0 100 Z`
      }
    }

    const points = data.map((d, i) => {
      const x = (i / (data.length - 1)) * 100
      const y = scaledMax > 0 ? 100 - (d.count / scaledMax) * 100 : 100
      return { x, y }
    })

    // Create smooth curve using cardinal spline
    let linePath = `M ${points[0].x} ${points[0].y}`

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)]
      const p1 = points[i]
      const p2 = points[i + 1]
      const p3 = points[Math.min(points.length - 1, i + 2)]

      // Catmull-Rom to Bezier conversion
      const tension = 0.3
      const cp1x = p1.x + (p2.x - p0.x) * tension
      const cp1y = p1.y + (p2.y - p0.y) * tension
      const cp2x = p2.x - (p3.x - p1.x) * tension
      const cp2y = p2.y - (p3.y - p1.y) * tension

      linePath += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`
    }

    const areaPath = `${linePath} L 100 100 L 0 100 Z`

    return { linePath, areaPath }
  }, [data, scaledMax])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || data.length === 0) return

    const rect = containerRef.current.getBoundingClientRect()
    const chartArea = {
      left: padding.left,
      width: rect.width - padding.left - padding.right
    }

    const relativeX = e.clientX - rect.left - padding.left
    const percentage = relativeX / chartArea.width
    const index = Math.round(percentage * (data.length - 1))
    const clampedIndex = Math.max(0, Math.min(data.length - 1, index))

    setHoveredIndex(clampedIndex)
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }, [data.length, padding.left, padding.right])

  const handleMouseLeave = useCallback(() => {
    setHoveredIndex(null)
  }, [])

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-zinc-500" style={{ height }}>
        No data for this period
      </div>
    )
  }

  const hoveredPoint = hoveredIndex !== null ? data[hoveredIndex] : null
  const hoveredX = hoveredIndex !== null ? (hoveredIndex / (data.length - 1 || 1)) * 100 : 0
  const hoveredY = hoveredPoint && scaledMax > 0 ? 100 - (hoveredPoint.count / scaledMax) * 100 : 100

  return (
    <div
      ref={containerRef}
      className="relative select-none"
      style={{ height }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Y-axis labels */}
      <div
        className="absolute left-0 top-0 flex flex-col justify-between text-xs text-zinc-500"
        style={{
          height: chartHeight,
          marginTop: padding.top,
          width: padding.left - 8
        }}
      >
        {yLabels.map((label, i) => (
          <span key={i} className="text-right pr-2">
            {label.toLocaleString()}
          </span>
        ))}
      </div>

      {/* Chart area */}
      <div
        className="absolute"
        style={{
          left: padding.left,
          top: padding.top,
          right: padding.right,
          height: chartHeight,
        }}
      >
        {/* Grid lines */}
        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
          {yLabels.map((_, i) => (
            <line
              key={i}
              x1="0%"
              y1={`${(i / (yLabels.length - 1)) * 100}%`}
              x2="100%"
              y2={`${(i / (yLabels.length - 1)) * 100}%`}
              stroke="#27272a"
              strokeWidth="1"
            />
          ))}
        </svg>

        {/* Area and line */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {/* Gradient definition */}
          <defs>
            <linearGradient id={`${chartId}-gradient`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgb(139, 92, 246)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="rgb(139, 92, 246)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Area fill with gradient */}
          <path
            d={areaPath}
            fill={`url(#${chartId}-gradient)`}
          />

          {/* Line */}
          <path
            d={linePath}
            fill="none"
            stroke={lineColor}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* Hover indicator line */}
        {hoveredIndex !== null && (
          <div
            className="absolute top-0 bottom-0 w-px bg-zinc-500/50 pointer-events-none"
            style={{ left: `${hoveredX}%` }}
          />
        )}

        {/* Data point on hover */}
        {hoveredIndex !== null && hoveredPoint && (
          <div
            className="absolute w-3 h-3 rounded-full pointer-events-none"
            style={{
              left: `${hoveredX}%`,
              top: `${hoveredY}%`,
              transform: 'translate(-50%, -50%)',
              backgroundColor: lineColor,
              boxShadow: '0 0 0 3px rgba(139, 92, 246, 0.3)',
            }}
          />
        )}
      </div>

      {/* X-axis labels */}
      <div
        className="absolute bottom-0 text-xs text-zinc-500"
        style={{
          left: padding.left,
          right: padding.right,
          height: padding.bottom - 5,
        }}
      >
        {xLabels.map(({ index, label }) => (
          <span
            key={index}
            className="absolute transform -translate-x-1/2"
            style={{ left: `${(index / (data.length - 1 || 1)) * 100}%` }}
          >
            {label}
          </span>
        ))}
      </div>

      {/* Tooltip */}
      {hoveredIndex !== null && hoveredPoint && (
        <div
          className="absolute pointer-events-none z-20"
          style={{
            left: mousePos.x,
            top: Math.max(padding.top, mousePos.y - 70),
            transform: 'translateX(-50%)',
          }}
        >
          <div className="bg-[#1f1f23] border border-[#3f3f46] rounded-lg px-3 py-2 shadow-xl">
            <div className="text-[10px] text-zinc-400 font-medium tracking-wide uppercase mb-1">
              {valueLabel}
            </div>
            <div className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: lineColor }}
              />
              <span className="text-zinc-400 text-xs">
                {formatTooltipDate(hoveredPoint.date)}
              </span>
              <span className="text-zinc-100 text-sm font-semibold">
                {hoveredPoint.count.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
