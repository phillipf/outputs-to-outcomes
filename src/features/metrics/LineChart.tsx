import type { MetricEntryRow } from './types'

type Point = {
  x: number
  y: number
  label: string
  value: number
}

function toDateLabel(value: string): string {
  const date = new Date(`${value}T00:00:00`)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

export function LineChart({ entries, unit }: { entries: MetricEntryRow[]; unit: string }) {
  if (!entries.length) {
    return <p className="muted">No data points yet.</p>
  }

  const width = 420
  const height = 170
  const padding = 24

  const sorted = [...entries].sort((a, b) => a.entry_date.localeCompare(b.entry_date))
  const values = sorted.map((entry) => Number(entry.value))

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = Math.max(max - min, 1)

  const points: Point[] = sorted.map((entry, index) => {
    const x =
      sorted.length === 1
        ? width / 2
        : padding + (index / (sorted.length - 1)) * (width - padding * 2)

    const normalized = (Number(entry.value) - min) / span
    const y = height - padding - normalized * (height - padding * 2)

    return {
      x,
      y,
      label: toDateLabel(entry.entry_date),
      value: Number(entry.value),
    }
  })

  const polyline = points.map((point) => `${point.x},${point.y}`).join(' ')

  return (
    <div className="chart-wrap">
      <svg
        aria-label="Metric trend"
        className="line-chart"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        <line
          stroke="#cad7cc"
          strokeWidth="1"
          x1={padding}
          x2={width - padding}
          y1={height - padding}
          y2={height - padding}
        />
        <polyline fill="none" points={polyline} stroke="#1f6f56" strokeWidth="3" />

        {points.map((point) => (
          <g key={`${point.label}-${point.value}`}>
            <circle cx={point.x} cy={point.y} fill="#1f6f56" r="4" />
            <title>{`${point.label}: ${point.value} ${unit}`.trim()}</title>
          </g>
        ))}
      </svg>

      <div className="chart-range">
        <span>{toDateLabel(sorted[0].entry_date)}</span>
        <span>{toDateLabel(sorted[sorted.length - 1].entry_date)}</span>
      </div>
    </div>
  )
}
