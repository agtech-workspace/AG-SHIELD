import { Link } from 'react-router-dom'
import { Shield, ArrowLeft } from 'lucide-react'

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-gray-50 py-8 px-6 md:py-12 md:px-8">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div className="flex justify-between items-start flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-2">
            <Shield className="w-8 h-8 text-green-600" />
            <h1 className="text-xl font-bold text-gray-800 m-0">Shield</h1>
          </div>
          <Link to="/login" className="text-green-600 no-underline font-medium text-sm flex items-center gap-1 hover:text-green-700">
            <ArrowLeft className="w-4 h-4" /> Back to login
          </Link>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-1">Privacy Policy</h2>
          <p className="text-[13px] text-gray-500 mb-6">Last updated: January 2026</p>

          <p className="text-[15px] leading-relaxed text-gray-600 mb-8">
            Shield ("we," "our," or "us") is committed to protecting your personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our fraud prevention platform and related services.
          </p>

          <section className="mb-6 pb-5 border-b border-gray-100 last:mb-0 last:pb-0 last:border-b-0">
            <h3 className="text-[15px] font-semibold text-gray-800 mb-2">1. Information We Collect</h3>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0">
              We collect information you provide directly, such as your name, email address, nickname, and account credentials when you register. We also automatically collect usage data, device information, IP addresses, and interaction logs to improve our services and detect suspicious activity.
            </p>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0">
              When you submit account numbers for verification, we process and store those queries along with associated metadata including timestamps, bank identifiers, and risk assessment results.
            </p>
          </section>

          <section className="mb-6 pb-5 border-b border-gray-100 last:mb-0 last:pb-0 last:border-b-0">
            <h3 className="text-[15px] font-semibold text-gray-800 mb-2">2. How We Use Your Information</h3>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0">
              We use your information to provide, maintain, and improve our fraud detection services. This includes verifying account information, generating risk assessments, maintaining our community intelligence database, and communicating important service updates to you.
            </p>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0">
              We also use data for security purposes such as detecting, investigating, and preventing fraudulent transactions, protecting against security threats and abuse, and enforcing our Terms of Service.
            </p>
          </section>

          <section className="mb-6 pb-5 border-b border-gray-100 last:mb-0 last:pb-0 last:border-b-0">
            <h3 className="text-[15px] font-semibold text-gray-800 mb-2">3. Information Sharing and Disclosure</h3>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0">
              We do not sell your personal information. We may share data with trusted service providers who assist in operating our platform, conducting our business, or servicing you, provided they agree to keep this information confidential.
            </p>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0">
              We may disclose information when required by law, such as in response to lawful requests from law enforcement or regulatory authorities, or when necessary to protect our rights, safety, or property.
            </p>
          </section>

          <section className="mb-6 pb-5 border-b border-gray-100 last:mb-0 last:pb-0 last:border-b-0">
            <h3 className="text-[15px] font-semibold text-gray-800 mb-2">4. Data Security</h3>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0">
              We implement appropriate technical and organizational measures to protect your information. This includes encryption in transit and at rest, secure authentication mechanisms, regular security assessments, and access controls.
            </p>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0">
              While we strive to protect your data, no method of electronic transmission or storage is completely secure. We cannot guarantee absolute security, but we are committed to maintaining industry-standard protections.
            </p>
          </section>

          <section className="mb-6 pb-5 border-b border-gray-100 last:mb-0 last:pb-0 last:border-b-0">
            <h3 className="text-[15px] font-semibold text-gray-800 mb-2">5. Your Rights</h3>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0">
              You have the right to access, correct, or delete your personal information. You may update your account details at any time through your profile settings. To request deletion of your data, please contact us.
            </p>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0">
              You may opt out of receiving non-essential communications from us by adjusting your notification preferences or contacting support.
            </p>
          </section>

          <section className="mb-6 pb-5 border-b border-gray-100 last:mb-0 last:pb-0 last:border-b-0">
            <h3 className="text-[15px] font-semibold text-gray-800 mb-2">6. Cookies and Tracking</h3>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0">
              We use cookies and similar tracking technologies to enhance your experience, analyze usage patterns, and for security purposes. You can control cookies through your browser settings, though disabling them may affect functionality.
            </p>
          </section>

          <section className="mb-6 pb-5 border-b border-gray-100 last:mb-0 last:pb-0 last:border-b-0">
            <h3 className="text-[15px] font-semibold text-gray-800 mb-2">7. Data Retention</h3>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0">
              We retain personal information only as long as necessary to provide services, comply with legal obligations, resolve disputes, and enforce our agreements. When data is no longer needed, we securely delete or anonymize it.
            </p>
          </section>

          <section className="mb-6 pb-5 border-b border-gray-100 last:mb-0 last:pb-0 last:border-b-0">
            <h3 className="text-[15px] font-semibold text-gray-800 mb-2">8. Third-Party Services</h3>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0">
              Our platform may contain links to third-party websites or services. We are not responsible for the privacy practices or content of these external sites. We encourage you to review the privacy policies of any third-party sites you visit.
            </p>
          </section>

          <section className="mb-6 pb-5 border-b border-gray-100 last:mb-0 last:pb-0 last:border-b-0">
            <h3 className="text-[15px] font-semibold text-gray-800 mb-2">9. Children's Privacy</h3>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0">
              Our services are not intended for individuals under 18 years of age. We do not knowingly collect personal information from children. If we become aware of such collection, we will take steps to delete the information promptly.
            </p>
          </section>

          <section className="mb-6 pb-5 border-b border-gray-100 last:mb-0 last:pb-0 last:border-b-0">
            <h3 className="text-[15px] font-semibold text-gray-800 mb-2">10. Changes to This Policy</h3>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0">
              We may update this Privacy Policy from time to time. We will notify you of material changes by posting the updated policy on our platform. Your continued use of Shield after changes constitutes acceptance of the updated terms.
            </p>
          </section>

          <section className="mb-0">
            <h3 className="text-[15px] font-semibold text-gray-800 mb-2">11. Contact Us</h3>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0">
              If you have questions or concerns about this Privacy Policy or our data practices, please contact us through our platform support channels.
            </p>
          </section>
        </div>

        <div className="text-center">
          <p className="text-[13px] text-gray-500 mb-2">Shield &copy; 2026. All rights reserved.</p>
          <div>
            <Link to="/terms" className="text-green-600 no-underline font-medium text-[13px] hover:underline">Terms of Service</Link>
          </div>
        </div>
      </div>
    </main>
  )
}