import { useEffect, useRef, useState } from 'react'

type GaugeProps = {
  score: number
  risk: 'safe' | 'warning' | 'high_risk'
  label: string
  size?: number
}

const COLORS = {
  safe: '#22c55e',
  safeGlow: 'rgba(34,197,94,0.4)',
  warning: '#f59e0b',
  warningGlow: 'rgba(245,158,11,0.4)',
  high_risk: '#dc2626',
  high_riskGlow: 'rgba(220,38,38,0.5)',
  track: '#1e293b',
  tick: '#475569',
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle)
  const end = polarToCartesian(cx, cy, r, startAngle)
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0
  return [`M ${start.x} ${start.y}`, `A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`].join(' ')
}

export default function Gauge({ score, risk, label, size = 240 }: GaugeProps) {
  const [animScore, setAnimScore] = useState(0)
  const [visible, setVisible] = useState(false)
  const animRef = useRef<number | null>(null)

  const cx = size / 2
  const cy = size / 2 + size * 0.04
  const r = size * 0.38
  const strokeW = size * 0.08
  const startAngle = 215
  const endAngle = -35
  const span = startAngle - endAngle

  const needleAngle = startAngle - (score / 100) * span

  const color = risk === 'high_risk' ? COLORS.high_risk : risk === 'warning' ? COLORS.warning : COLORS.safe
  const glow = risk === 'high_risk' ? COLORS.high_riskGlow : risk === 'warning' ? COLORS.warningGlow : COLORS.safeGlow

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true))
    let start = 0
    const duration = 800
    const startTime = performance.now()

    function tick(now: number) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      start = Math.round(eased * score)
      setAnimScore(start)
      if (progress < 1) animRef.current = requestAnimationFrame(tick)
    }

    animRef.current = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [score])

  const activeArc = describeArc(cx, cy, r, needleAngle, startAngle)

  const ticks = [0, 25, 50, 75, 100]
  const tickLabels = ['0', '25', '50', '75', '100']

  return (
    <div className="relative select-none">
      <svg
        width={size}
        height={size * 0.85}
        viewBox={`0 0 ${size} ${size * 0.85}`}
        className={`transition-opacity duration-500 ${visible ? 'opacity-100' : 'opacity-0'}`}
      >
        <defs>
          <radialGradient id={`glow-${risk}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={glow} />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <linearGradient id={`arc-grad-${risk}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={score > 60 ? '#dc2626' : score > 30 ? '#f59e0b' : '#22c55e'} />
            <stop offset="50%" stopColor={score > 60 ? '#ef4444' : score > 30 ? '#fbbf24' : '#4ade80'} />
            <stop offset="100%" stopColor={score > 60 ? '#f87171' : score > 30 ? '#fcd34d' : '#86efac'} />
          </linearGradient>
          <filter id="arc-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="needle-glow">
            <feGaussianBlur stdDeviation="2" />
          </filter>
        </defs>

        <circle cx={cx} cy={cy} r={r * 1.3} fill={`url(#glow-${risk})`} opacity={0.3} className="transition-all duration-700" />

        <path
          d={describeArc(cx, cy, r, startAngle, endAngle)}
          fill="none"
          stroke={COLORS.track}
          strokeWidth={strokeW}
          strokeLinecap="round"
          opacity={0.3}
        />

        <path
          d={activeArc}
          fill="none"
          stroke={`url(#arc-grad-${risk})`}
          strokeWidth={strokeW}
          strokeLinecap="round"
          filter="url(#arc-glow)"
          className="transition-all duration-700 ease-out"
        />

        {ticks.map((t, i) => {
          const angle = startAngle - (t / 100) * span
          const outer = polarToCartesian(cx, cy, r + strokeW * 0.7, angle)
          const inner = polarToCartesian(cx, cy, r - strokeW * 0.7, angle)
          return (
            <g key={t}>
              <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke={COLORS.tick} strokeWidth={2} opacity={0.6} />
              <text
                x={polarToCartesian(cx, cy, r + strokeW * 1.8, angle).x}
                y={polarToCartesian(cx, cy, r + strokeW * 1.8, angle).y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={COLORS.tick}
                fontSize={size * 0.035}
                fontFamily="monospace"
                opacity={0.5}
              >
                {tickLabels[i]}
              </text>
            </g>
          )
        })}

        <g
          style={{
            transformOrigin: `${cx}px ${cy}px`,
            transform: `rotate(${needleAngle - 180}deg)`,
            transition: 'transform 1s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        >
          <line
            x1={cx}
            y1={cy}
            x2={cx}
            y2={cy - r * 0.85}
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            filter="url(#needle-glow)"
            opacity={0.9}
          />
          <circle cx={cx} cy={cy} r={size * 0.035} fill={color} />
          <circle cx={cx} cy={cy} r={size * 0.018} fill="#0f172a" />
        </g>

        <text x={cx} y={cy - r * 0.45} textAnchor="middle" fill="#fff" fontSize={size * 0.12} fontWeight="bold" fontFamily="monospace">
          {animScore}
        </text>
        <text x={cx} y={cy - r * 0.28} textAnchor="middle" fill={color} fontSize={size * 0.045} fontWeight="600" letterSpacing="2" className="transition-colors duration-500">
          {label}
        </text>
        <text x={cx} y={cy + r * 0.95} textAnchor="middle" fill="#64748b" fontSize={size * 0.035} letterSpacing="3" fontFamily="monospace" opacity={0.7}>
          AG GAUGE
        </text>
      </svg>

      {risk === 'high_risk' && (
        <div className="absolute inset-0 rounded-full" style={{ boxShadow: `0 0 ${size * 0.15}px ${glow}`, animation: 'gauge-pulse 1.5s ease-in-out infinite' }} />
      )}

      <style>{`
        @keyframes gauge-pulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.02); }
        }
        @keyframes gauge-warn-flash {
          0%, 100% { opacity: 0; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  )
}
