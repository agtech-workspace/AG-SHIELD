import { useState } from 'react'
import type { FormEvent } from 'react'
import { ICONS } from '../lib/icons'

type Role = 'Student / Developer' | 'Founder / Executive' | 'Investor' | 'Cybersecurity Analyst'

const ROLES: Role[] = ['Student / Developer', 'Founder / Executive', 'Investor', 'Cybersecurity Analyst']

const PILLARS = [
  { icon: 'cloud', label: 'Cloud & AI' },
  { icon: 'chart', label: 'Payments & Enterprise Fintech' },
  { icon: 'users', label: 'Public Sector & Diplomatic' },
  { icon: 'lock', label: 'Telecommunications' },
]

const DAYS = [
  {
    tag: 'Day 1',
    title: 'Alignment & The Future of Infrastructure',
    items: [
      { head: 'Opening Keynote', sub: 'National Infrastructure & Sovereign Technology.' },
      { head: 'Cyber Security, Zero-Trust & Cloud Defense', sub: 'Protecting financial switches, public APIs, and cloud architecture.' },
      { head: 'AI Governance, Machine Learning & Ethical Code', sub: 'Local data pipelines, algorithmic auditing, and ML in emerging markets.' },
      { head: 'Digital Public Infrastructure & Youth Talent Funnels', sub: 'Aligning student developers with global development initiatives.' },
    ],
  },
  {
    tag: 'Day 2',
    title: 'Creativity, Product & Venture Building',
    items: [
      { head: 'Keynote', sub: 'Building Products for the Next 100 Million.' },
      { head: 'The Multiverse of Product', sub: 'Bridging engineering, UI/UX design, and intuitive human design.' },
      { head: 'Creative Tech, Gaming, Web3 & Immersive Media', sub: '3D graphics, game engines, and gamified applications for the African economy.' },
      { head: 'Capital, Governance & Building for Longevity', sub: 'Institutional funding and corporate governance for high-growth ventures.' },
    ],
  },
]

export function EventPanel() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('Student / Developer')
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim() || !email.trim()) return
    try {
      const raw = localStorage.getItem('shield-techverse-regs')
      const regs: Array<{ name: string; email: string; role: string; at: string }> = raw ? JSON.parse(raw) : []
      regs.push({ name: name.trim(), email: email.trim(), role, at: new Date().toISOString() })
      localStorage.setItem('shield-techverse-regs', JSON.stringify(regs))
    } catch {
      /* ignore */
    }
    setSubmitted(true)
  }

  return (
    <section className="event-panel" id="events">
      <div className="card event-hero">
        <div className="event-hero-inner">
          <span className="event-badge">{ICONS.calendar} Annual Residency · UNILAG 2027</span>
          <h1>TechVerse Connect 2027</h1>
          <p className="event-tagline">Empower. Build. Replicate.</p>
          <p className="event-sub">
            Building continent-scale tech infrastructure — connecting campus talent to national impact.
            Hosted by AG Tech Leadership.
          </p>
          <p className="event-facts">
            <span>{ICONS.pin} University of Lagos (UNILAG), Nigeria</span>
            <span>{ICONS.clock} 2-Day Immersive Residency</span>
          </p>
        </div>
      </div>

      <div className="event-grid">
        {DAYS.map((day) => (
          <div key={day.tag} className="card event-day">
            <div className="event-day-head">
              <span className="event-badge">{day.tag}</span>
              <h2>{day.title}</h2>
            </div>
            <ul className="event-list">
              {day.items.map((item) => (
                <li key={item.head}>
                  <strong>{item.head}</strong>
                  <span>{item.sub}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="card event-pillars">
        <h2>Ecosystem &amp; Diplomatic Pillars</h2>
        <p className="event-muted">
          We are aligning with institutions across cloud, fintech, public sector, and telecommunications.
          Partner confirmations to be announced.
        </p>
        <div className="pillar-grid">
          {PILLARS.map((pillar) => (
            <span key={pillar.label} className="pillar-chip">
              {ICONS[pillar.icon as keyof typeof ICONS] ?? ICONS.users}
              {pillar.label}
            </span>
          ))}
        </div>
      </div>

      <div className="card event-waitlist">
        <h2>Reserve Your Campus Spot</h2>
        <p className="event-muted">Join the priority waitlist for TechVerse Connect 2027 at UNILAG.</p>
        {submitted ? (
          <div className="banner ok">
            {ICONS.check}
            <span>You're on the list. We'll email you closer to the date.</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="wl-form">
            <div className="field">
              <label htmlFor="evName">Full Name</label>
              <input id="evName" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ada Obi" />
            </div>
            <div className="field">
              <label htmlFor="evEmail">Email Address</label>
              <input id="evEmail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@domain.com" />
            </div>
            <div className="field">
              <label htmlFor="evRole">Primary Role</label>
              <select id="evRole" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <button type="submit" className="btn btn-block ag-teal-glow">{ICONS.mail} Join TechVerse 2027 Waitlist</button>
          </form>
        )}
      </div>
    </section>
  )
}