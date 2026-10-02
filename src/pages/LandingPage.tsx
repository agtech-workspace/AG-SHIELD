import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { Shield, Search, Users, Award, Menu, X, ArrowRight, CheckCircle, Smartphone, Building2 } from 'lucide-react'
import { ACCOUNT_NUMBER_LENGTH } from '../lib/constants'

type Props = { session: Session | null }

const stats = [
  { label: 'Accounts checked', value: '10,000+' },
  { label: 'Scammers flagged', value: '500+' },
  { label: 'Community reports', value: '2,000+' },
  { label: 'Banks covered', value: '20+' },
]

const features = [
  { icon: Search, title: 'Instant Fraud Check', desc: 'Enter any Nigerian bank account number to see if it\'s linked to fraud, scams, or suspicious activity.' },
  { icon: Users, title: 'Community Powered', desc: 'Over 2,000 community reports help keep everyone safe. Report suspicious accounts instantly.' },
  { icon: Award, title: 'Verified Merchants', desc: 'Merchants can verify their business and earn a trust badge to share with customers.' },
  { icon: Smartphone, title: 'Android App', desc: 'Real-time protection while banking. Automatically detects suspicious accounts before you pay.' },
]

export default function LandingPage({ session }: Props) {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="min-h-screen bg-white">
      {/* NAV */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/90 backdrop-blur-md shadow-sm' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-md shadow-green-500/25">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <span className="text-lg font-bold text-gray-900">Shield</span>
              <span className="text-xs text-gray-400 font-medium hidden sm:inline">by AG Tech</span>
            </div>

            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm text-gray-600 hover:text-green-600 font-medium transition-colors">Features</a>
              <a href="#how-it-works" className="text-sm text-gray-600 hover:text-green-600 font-medium transition-colors">How It Works</a>
              <a href="#stats" className="text-sm text-gray-600 hover:text-green-600 font-medium transition-colors">Impact</a>
              {session ? (
                <button
                  type="button"
                  onClick={() => navigate('/dashboard')}
                  className="px-5 py-2 bg-green-600 text-white rounded-full text-sm font-semibold hover:bg-green-700 shadow-lg shadow-green-500/25 transition-all hover:shadow-xl hover:shadow-green-500/30"
                >
                  Dashboard
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="px-5 py-2 bg-green-600 text-white rounded-full text-sm font-semibold hover:bg-green-700 shadow-lg shadow-green-500/25 transition-all hover:shadow-xl hover:shadow-green-500/30"
                >
                  Get Started
                </button>
              )}
            </div>

            <button type="button" className="md:hidden p-2 text-gray-600" onClick={() => setMenuOpen(!menuOpen)}>
              {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="md:hidden bg-white border-t px-4 py-4 space-y-3">
            <a href="#features" className="block text-sm text-gray-600 py-2" onClick={() => setMenuOpen(false)}>Features</a>
            <a href="#how-it-works" className="block text-sm text-gray-600 py-2" onClick={() => setMenuOpen(false)}>How It Works</a>
            <a href="#stats" className="block text-sm text-gray-600 py-2" onClick={() => setMenuOpen(false)}>Impact</a>
            {session ? (
              <button type="button" onClick={() => { setMenuOpen(false); navigate('/dashboard') }} className="w-full px-5 py-2 bg-green-600 text-white rounded-full text-sm font-semibold">
                Dashboard
              </button>
            ) : (
              <button type="button" onClick={() => { setMenuOpen(false); navigate('/login') }} className="w-full px-5 py-2 bg-green-600 text-white rounded-full text-sm font-semibold">
                Get Started
              </button>
            )}
          </div>
        )}
      </nav>

      {/* HERO */}
      <section className="relative pt-24 pb-20 md:pt-32 md:pb-28 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-green-50 via-white to-emerald-50 pointer-events-none" />
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-bl from-green-100/30 to-transparent pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-100 rounded-full text-green-700 text-xs font-semibold mb-6">
                <CheckCircle className="w-3.5 h-3.5" />
                Trusted by 10,000+ Nigerians
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6">
                Check Any Account<br />
                <span className="text-green-600">Before You Pay</span>
              </h1>
              <p className="text-lg text-gray-600 mb-8 leading-relaxed max-w-lg">
                Nigeria's first community-powered fraud detection platform. Enter an account number to see if it's been reported for scams, fraud, or suspicious activity.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Enter account number to check..."
                    className="w-full pl-12 pr-4 py-3.5 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 shadow-sm"
                    maxLength={ACCOUNT_NUMBER_LENGTH}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, ACCOUNT_NUMBER_LENGTH)
                        if (val.length === 10) {
                          if (session) navigate('/dashboard')
                          else navigate(`/login?check=${val}`)
                        }
                      }
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => navigate(session ? '/dashboard' : '/login')}
                  className="px-8 py-3.5 bg-green-600 text-white rounded-full text-sm font-semibold hover:bg-green-700 shadow-lg shadow-green-500/30 transition-all hover:shadow-xl inline-flex items-center gap-2 justify-center"
                >
                  {session ? 'Go to Dashboard' : 'Start Free'} <ArrowRight className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-4">No sign-up required to check accounts. 10 seconds. Free forever.</p>
            </div>
            <div className="hidden md:block relative">
              <div className="relative w-full aspect-square max-w-md mx-auto">
                <div className="absolute inset-0 bg-gradient-to-br from-green-400 to-emerald-600 rounded-3xl rotate-6 opacity-20" />
                <div className="absolute inset-0 bg-white rounded-3xl shadow-2xl border border-gray-100 p-8 flex flex-col">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-md">
                      <Shield className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 text-sm">Risk Assessment</p>
                      <p className="text-xs text-gray-400">Real-time check</p>
                    </div>
                  </div>
                  <div className="flex-1 space-y-4">
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-2 h-2 rounded-full bg-red-500" />
                        <span className="text-xs font-semibold text-red-700">HIGH RISK</span>
                      </div>
                      <p className="text-sm font-mono text-gray-800">*******1087</p>
                      <p className="text-xs text-red-600 mt-1">EFCC flagged — cybercrime conviction</p>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="text-xs font-semibold text-green-700">SAFE</span>
                      </div>
                      <p className="text-sm font-mono text-gray-800">*******7890</p>
                      <p className="text-xs text-green-600 mt-1">No negative history. Verified safe.</p>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        <span className="text-xs font-semibold text-amber-700">CAUTION</span>
                      </div>
                      <p className="text-sm font-mono text-gray-800">*******7654</p>
                      <p className="text-xs text-amber-600 mt-1">2 community reports — verify carefully</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST BANNER */}
      <section className="py-12 bg-gray-50 border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-2xl md:text-3xl font-bold text-gray-900">{s.value}</p>
                <p className="text-sm text-gray-500 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="py-20 md:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Why Nigerians Trust Shield</h2>
            <p className="text-gray-600 text-lg">Built to protect you from the growing wave of bank transfers scams and fraud.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((f) => (
              <div key={f.title} className="group bg-white border border-gray-100 rounded-2xl p-6 hover:shadow-lg hover:border-green-200 transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center mb-4 group-hover:bg-green-200 transition-colors">
                  <f.icon className="w-6 h-6 text-green-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="py-20 md:py-28 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">How It Works</h2>
            <p className="text-gray-600 text-lg">Three simple steps to protect yourself from fraud.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Enter Account Number', desc: 'Type the 10-digit bank account number you want to check. No sign-up required.' },
              { step: '02', title: 'Instant Risk Report', desc: 'Get an immediate risk assessment — Safe, Warning, or High Risk — with detailed reasons.' },
              { step: '03', title: 'Make Informed Decisions', desc: 'Use the report to decide. Report scammers to protect the community.' },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center mx-auto mb-5">
                  <span className="text-2xl font-bold text-green-600">{item.step}</span>
                </div>
                <h3 className="font-semibold text-gray-900 mb-2 text-lg">{item.title}</h3>
                <p className="text-sm text-gray-500 max-w-xs mx-auto">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MERCHANT BANNER */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-r from-green-600 to-emerald-700 rounded-3xl p-8 md:p-12 text-white">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Building2 className="w-6 h-6" />
                  <span className="text-sm font-semibold uppercase tracking-wider opacity-80">For Businesses</span>
                </div>
                <h2 className="text-2xl md:text-3xl font-bold mb-4">Verify Your Business</h2>
                <p className="text-green-100 mb-6">Get a verified badge that proves your business is legitimate. Share it on WhatsApp, Instagram, or your website to build trust with customers.</p>
                <button
                  type="button"
                  onClick={() => navigate('/verify-business')}
                  className="px-6 py-3 bg-white text-green-700 rounded-full text-sm font-semibold hover:bg-green-50 transition-colors inline-flex items-center gap-2"
                >
                  Verify Now <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => navigate(session ? '/dashboard' : '/login')}
                  className="px-6 py-3 bg-white/10 text-white border border-white/30 rounded-full text-sm font-semibold hover:bg-white/20 transition-colors inline-flex items-center gap-2 ml-3"
                >
                  Consumer Dashboard
                </button>
              </div>
              <div className="hidden md:block">
                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                  <div className="flex items-center gap-3 mb-4">
                    <Award className="w-8 h-8 text-yellow-300" />
                    <div>
                      <p className="font-semibold text-sm">Verified Business</p>
                      <p className="text-xs text-green-200">Shield Verified</p>
                    </div>
                  </div>
                  <p className="text-sm text-green-100">This business has completed verification and passed all fraud checks.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Start Protecting Yourself Today</h2>
          <p className="text-gray-600 text-lg mb-8">Join thousands of Nigerians who check accounts before they pay. It's free and takes 10 seconds.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              type="button"
              onClick={() => navigate(session ? '/dashboard' : '/login')}
              className="px-8 py-3.5 bg-green-600 text-white rounded-full text-sm font-semibold hover:bg-green-700 shadow-lg shadow-green-500/30 transition-all hover:shadow-xl inline-flex items-center gap-2 justify-center"
            >
              {session ? 'Open Dashboard' : 'Get Started Free'} <ArrowRight className="w-4 h-4" />
            </button>
            {!session && (
              <button
                type="button"
                onClick={() => navigate('/login?register=1')}
                className="px-8 py-3.5 border-2 border-green-600 text-green-600 rounded-full text-sm font-semibold hover:bg-green-50 transition-colors"
              >
                Create Account
              </button>
            )}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-12 border-t border-gray-100 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Shield className="w-5 h-5 text-green-600" />
                <span className="font-bold text-gray-900">Shield</span>
              </div>
              <p className="text-sm text-gray-500">Built by AG Tech to protect Nigerians from bank transfer fraud.</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><a href="#features" className="hover:text-green-600">Features</a></li>
                <li><a href="#how-it-works" className="hover:text-green-600">How It Works</a></li>
                <li><a href="#" className="hover:text-green-600">Android App</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><span className="hover:text-green-600 cursor-pointer">About AG Tech</span></li>
                <li><Link to="/privacy" className="hover:text-green-600">Privacy Policy</Link></li>
                <li><Link to="/terms" className="hover:text-green-600">Terms of Service</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-4">Contact</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li>agtechrelations@gmail.com</li>
                <li>Lagos, Nigeria</li>
              </ul>
            </div>
          </div>
          <div className="mt-10 pt-6 border-t border-gray-200 text-center text-xs text-gray-400">
            &copy; {new Date().getFullYear()} AG Tech. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}
