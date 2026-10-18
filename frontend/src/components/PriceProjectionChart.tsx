import { useState } from 'react'

type Estimate = {
  estimated_total_min: number
  estimated_total_max: number
  currency: string
}

type Scenario = {
  id: 'low' | 'base' | 'high'
  color: string
  growth: number
  start: number
}

const chart = { left: 76, right: 730, top: 24, bottom: 246, width: 760, height: 310 }

export default function PriceProjectionChart({ estimate, bangla }: { estimate: Estimate; bangla: boolean }) {
  const midpoint = (estimate.estimated_total_min + estimate.estimated_total_max) / 2
  const [growth, setGrowth] = useState({ low: 2, base: 5, high: 8 })
  const scenarios: Scenario[] = [
    { id: 'low', color: 'var(--chart-low, #005830)', growth: growth.low, start: estimate.estimated_total_min },
    { id: 'base', color: '#d08a22', growth: growth.base, start: midpoint },
    { id: 'high', color: 'var(--chart-high, #58A028)', growth: growth.high, start: estimate.estimated_total_max },
  ]
  const series = scenarios.map((scenario) => ({
    ...scenario,
    values: Array.from({ length: 11 }, (_, year) => scenario.start * (1 + scenario.growth / 100) ** year),
  }))
  const allValues = [...series.flatMap((item) => item.values), estimate.estimated_total_min, estimate.estimated_total_max]
  const minValue = Math.min(...allValues) * 0.94
  const maxValue = Math.max(...allValues) * 1.06
  const x = (year: number) => chart.left + (year / 10) * (chart.right - chart.left)
  const y = (value: number) => chart.bottom - ((value - minValue) / (maxValue - minValue || 1)) * (chart.bottom - chart.top)
  const format = (value: number) => new Intl.NumberFormat(bangla ? 'bn-BD' : 'en-BD', {
    maximumFractionDigits: 0,
  }).format(value)
  const title = bangla ? '১০ বছরের সম্ভাব্য দামের দৃশ্যপট' : '10-year illustrative price scenarios'
  const labels = {
    low: bangla ? 'কম' : 'Low',
    base: bangla ? 'মাঝারি' : 'Base',
    high: bangla ? 'বেশি' : 'High',
  }

  return (
    <section className="price-projection" aria-label={title}>
      <h3>{title}</h3>
      <p className="projection-description">
        {bangla
          ? 'আজকের আনুমানিক মূল্যসীমা থেকে শুরু। এগুলো synthetic demo scenarios—বাস্তব বাজারদর বা নিশ্চিত পূর্বাভাস নয়।'
          : 'Starts from today’s estimated price range. These are synthetic demo scenarios, not real market prices or guaranteed forecasts.'}
      </p>
      <div className="projection-baseline">
        <strong>{bangla ? 'আজকের baseline' : 'Today’s baseline'}</strong>
        <span>{estimate.currency || 'BDT'} {format(estimate.estimated_total_min)} – {format(estimate.estimated_total_max)}</span>
      </div>
      <div className="projection-controls">
        {series.map((scenario) => (
          <label className="projection-control" key={scenario.id}>
            <span><i style={{ backgroundColor: scenario.color }} />{labels[scenario.id]} {bangla ? 'বার্ষিক বৃদ্ধি' : 'annual growth'}</span>
            <span className="projection-input-wrap">
              <input
                aria-label={`${labels[scenario.id]} ${bangla ? 'বার্ষিক বৃদ্ধির হার (%)' : 'annual growth rate (%)'}`}
                type="number"
                min="-20"
                max="50"
                step="0.5"
                value={growth[scenario.id]}
                onChange={(event) => {
                  const value = Number(event.target.value)
                  if (event.target.value !== '' && Number.isFinite(value)) {
                    setGrowth((current) => ({ ...current, [scenario.id]: Math.max(-20, Math.min(50, value)) }))
                  }
                }}
              />%
            </span>
          </label>
        ))}
      </div>
      <div className="projection-chart-scroll">
        <svg className="projection-svg" viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label={title}>
          {[0, 1, 2, 3, 4].map((tick) => {
            const value = minValue + ((maxValue - minValue) * tick) / 4
            const position = y(value)
            return (
              <g key={tick}>
                <line x1={chart.left} x2={chart.right} y1={position} y2={position} className="projection-gridline" />
                <text x={chart.left - 10} y={position + 4} textAnchor="end" className="projection-axis-label">{format(value)}</text>
              </g>
            )
          })}
          <rect
            x={x(0) - 8}
            y={y(estimate.estimated_total_max)}
            width="16"
            height={Math.max(2, y(estimate.estimated_total_min) - y(estimate.estimated_total_max))}
            className="projection-baseline-band"
          />
          {[5, 10].map((year) => (
            <g key={year}>
              <line x1={x(year)} x2={x(year)} y1={chart.top} y2={chart.bottom} className="projection-highlight-line" />
              <text x={x(year)} y={chart.bottom + 24} textAnchor="middle" className="projection-axis-label projection-highlight-label">
                {year}{bangla ? ' বছর' : ' yr'}
              </text>
            </g>
          ))}
          {[1, 2, 3, 4, 6, 7, 8, 9].map((year) => (
            <text key={year} x={x(year)} y={chart.bottom + 24} textAnchor="middle" className="projection-axis-label">
              {year}
            </text>
          ))}
          <text x={chart.left} y={chart.bottom + 48} className="projection-axis-label">
            {bangla ? 'আজ' : 'Today'}
          </text>
          {series.map((scenario) => (
            <g key={scenario.id}>
              <polyline
                points={scenario.values.map((value, year) => `${x(year)},${y(value)}`).join(' ')}
                fill="none"
                stroke={scenario.color}
                strokeWidth={scenario.id === 'base' ? 3.5 : 2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {[5, 10].map((year) => (
                <g key={year}>
                  <circle cx={x(year)} cy={y(scenario.values[year])} r="7" fill="white" stroke={scenario.color} strokeWidth="3" />
                  <circle cx={x(year)} cy={y(scenario.values[year])} r="3" fill={scenario.color} />
                </g>
              ))}
            </g>
          ))}
          <text x={chart.right} y={chart.bottom + 48} textAnchor="end" className="projection-axis-label">
            {bangla ? 'বছর' : 'Years'}
          </text>
        </svg>
      </div>
      <div className="projection-points">
        {[5, 10].map((year) => (
          <div className="projection-point-card" key={year}>
            <strong>{year} {bangla ? 'বছর' : 'years'}</strong>
            {series.map((scenario) => (
              <div className="projection-point-row" key={scenario.id}>
                <span><i style={{ backgroundColor: scenario.color }} />{labels[scenario.id]}</span>
                <b>{estimate.currency || 'BDT'} {format(scenario.values[year])}</b>
              </div>
            ))}
          </div>
        ))}
      </div>
      <small className="projection-footnote">
        {bangla
          ? 'গ্রাফে প্রতিটি scenario-র জন্য আজকের সীমার নিম্ন, মধ্য ও উচ্চ মান থেকে বার্ষিক চক্রবৃদ্ধি দেখানো হয়েছে।'
          : 'Each scenario compounds annually from the low, midpoint, or high end of today’s estimated range.'}
      </small>
    </section>
  )
}
