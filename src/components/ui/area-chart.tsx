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
  fillColor?: string
}

export function AreaChart({
  data,
  height = 256,
  formatLabel,
  formatTooltipDate,
  valueLabel = 'VISITORS',
  lineColor = 'rgb(168, 85, 247)', // purple-500
  fillColor = 'rgba(168, 85, 247, 0.1)',
}: AreaChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  const maxCount = useMemo(() => Math.max(...data.map(d => d.count), 1), [data])

  const scaledMax = useMemo(() => {
    if (maxCount === 0) return 10
    const magnitude = Math.pow(10, Math.floor(Math.log10(maxCount)))
    const normalized = maxCount / magnitude
    let rounded: number
    if (normalized <= 1) rounded = 1
    else if (normalized <= 2) rounded = 2
    else if (normalized <= 5) rounded = 5
    else rounded = 10
    return rounded * magnitude
  }, [maxCount])

  // Calculate Y-axis labels
  const yLabels = useMemo(() => {
    const labels: number[] = []
    const step = scaledMax / 4
    for (let i = 4; i >= 0; i--) {
      labels.push(Math.round(step * i))
    }
    return labels
  }, [scaledMax])

  // Calculate X-axis labels (show ~7 labels max)
  const xLabels = useMemo(() => {
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

  const padding = { top: 10, right: 10, bottom: 30, left: 50 }
  const chartWidth = 100 // percentage
  const chartHeight = height - padding.top - padding.bottom

  // Generate SVG path for the line
  const linePath = useMemo(() => {
    if (data.length === 0) return ''

    const points = data.map((d, i) => {
      const x = (i / (data.length - 1 || 1)) * 100
      const y = 100 - (d.count / scaledMax) * 100
      return { x, y }
    })

    // Simple line path (no smoothing for accuracy)
    return points.map((p, i) =>
      `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
    ).join(' ')
  }, [data, scaledMax])

  // Generate SVG path for the area fill
  const areaPath = useMemo(() => {
    if (data.length === 0) return ''
    return `${linePath} L 100 100 L 0 100 Z`
  }, [linePath])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || data.length === 0) return

    const rect = containerRef.current.getBoundingClientRect()
    const chartArea = {
      left: padding.left,
      right: rect.width - padding.right,
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
          {/* Area fill */}
          <path
            d={areaPath}
            fill={fillColor}
          />
          {/* Line */}
          <path
            d={linePath}
            fill="none"
            stroke={lineColor}
            strokeWidth="2"
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

        {/* Data points on hover */}
        {hoveredIndex !== null && hoveredPoint && (
          <div
            className="absolute w-3 h-3 rounded-full border-2 pointer-events-none"
            style={{
              left: `${hoveredX}%`,
              top: `${100 - (hoveredPoint.count / scaledMax) * 100}%`,
              transform: 'translate(-50%, -50%)',
              backgroundColor: lineColor,
              borderColor: '#18181b',
            }}
          />
        )}
      </div>

      {/* X-axis labels */}
      <div
        className="absolute bottom-0 text-xs text-zinc-500 flex justify-between"
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
            top: Math.max(padding.top, mousePos.y - 60),
            transform: 'translateX(-50%)',
          }}
        >
          <div className="bg-[#1f1f23] border border-[#3f3f46] rounded-lg px-3 py-2 shadow-xl">
            <div className="text-[10px] text-zinc-400 font-medium tracking-wide mb-1">
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
