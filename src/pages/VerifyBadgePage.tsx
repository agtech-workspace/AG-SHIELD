import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Shield, Award, AlertCircle, Loader2 } from 'lucide-react'

type BadgeData = {
  business_name: string
  status: string
  risk_level: string
  badge_url: string | null
  verified_at: string | null
}

export default function VerifyBadgePage() {
  const { code } = useParams<{ code: string }>()
  const [data, setData] = useState<BadgeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function lookup() {
      if (!supabase || !code) {
        setError('No verification code provided.')
        setLoading(false)
        return
      }
      try {
        const { data: result, error: queryError } = await supabase
          .from('merchant_verifications')
          .select('business_name, status, risk_level, badge_url, verified_at')
          .eq('verification_code', code)
          .maybeSingle()

        if (queryError) throw queryError
        if (!result) {
          setError('No business found with this verification code.')
        } else {
          setData(result as BadgeData)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Lookup failed')
      } finally {
        setLoading(false)
      }
    }
    void lookup()
  }, [code])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border p-8 max-w-md w-full text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-900 mb-2">Verification Not Found</h2>
          <p className="text-sm text-gray-500 mb-4">{error}</p>
          <Link to="/" className="text-sm text-green-600 hover:underline">Back to AG Shield</Link>
        </div>
      </div>
    )
  }

  const isValid = data?.status === 'verified'

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-green-50/30 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-lg border max-w-md w-full overflow-hidden" data-tour="verify-badge">
        {/* Header */}
        <div className={`p-6 text-center ${isValid ? 'bg-gradient-to-r from-green-600 to-emerald-700' : 'bg-gray-200'}`}>
          <div className={`w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center ${isValid ? 'bg-white/20' : 'bg-gray-300'}`}>
            {isValid ? <Award className="w-8 h-8 text-yellow-300" /> : <AlertCircle className="w-8 h-8 text-gray-500" />}
          </div>
          <h1 className={`text-xl font-bold ${isValid ? 'text-white' : 'text-gray-600'}`}>
            {isValid ? 'Verified Business' : 'Not Verified'}
          </h1>
        </div>

        {/* Body */}
        <div className="p-6">
          {isValid && data?.business_name && (
            <div className="text-center mb-4">
              <p className="text-sm text-gray-500 uppercase tracking-wider mb-1">Business Name</p>
              <h2 className="text-2xl font-bold text-gray-900">{data.business_name}</h2>
            </div>
          )}

          <div className="space-y-3">
            {data?.risk_level && (
              <div className="flex justify-between text-sm py-2 border-b">
                <span className="text-gray-500">Risk Level</span>
                <span className={`font-medium ${
                  data.risk_level === 'safe' ? 'text-green-600' :
                  data.risk_level === 'warning' ? 'text-yellow-600' : 'text-red-600'
                }`}>{data.risk_level}</span>
              </div>
            )}
            {data?.verified_at && (
              <div className="flex justify-between text-sm py-2 border-b">
                <span className="text-gray-500">Verified Since</span>
                <span className="text-gray-700">{new Date(data.verified_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
            )}
            <div className="flex justify-between text-sm py-2 border-b">
              <span className="text-gray-500">Verification Status</span>
              <span className={`font-medium ${isValid ? 'text-green-600' : 'text-red-600'}`}>
                {data?.status ?? 'Unknown'}
              </span>
            </div>
          </div>

          {isValid && (
            <div className="mt-6 p-4 bg-green-50 rounded-xl border border-green-100">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-green-600" />
                <p className="text-sm font-semibold text-green-700">Verified by AG Shield</p>
              </div>
              <p className="text-xs text-green-600">This business has been verified against CAC records and fraud databases.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 border-t text-center">
          <Link to="/" className="text-xs text-gray-400 hover:text-green-600 flex items-center justify-center gap-1">
            <Shield className="w-3 h-3" /> AG Shield — Trust Infrastructure for Nigerian Business
          </Link>
        </div>
      </div>
    </div>
  )
}
