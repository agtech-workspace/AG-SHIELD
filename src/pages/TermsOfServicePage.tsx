import { Link } from 'react-router-dom'
import { Shield, ArrowLeft } from 'lucide-react'

export default function TermsOfServicePage() {
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
          <h2 className="text-2xl font-semibold text-gray-800 mb-1">Terms of Service</h2>
          <p className="text-[13px] text-gray-500 mb-6">Last updated: January 2026</p>

          <p className="text-[15px] leading-relaxed text-gray-600 mb-8">
            Welcome to Shield. By accessing or using our fraud prevention platform, you agree to be bound by these Terms of Service ("Terms"). Please read them carefully.
          </p>

          <section className="mb-6 pb-5 border-b border-slate-100 last:mb-0 last:pb-0 last:border-b-0">
            <h3 className="text-[15px] font-semibold text-gray-800 mb-2">1. Acceptance of Terms</h3>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0">
              These Terms constitute a legally binding agreement between you and Shield. By creating an account or using our services, you confirm that you are at least 18 years old and have the legal capacity to enter into this agreement.
            </p>
          </section>

          <section className="mb-6 pb-5 border-b border-slate-100 last:mb-0 last:pb-0 last:border-b-0">
            <h3 className="text-[15px] font-semibold text-gray-800 mb-2">2. Description of Service</h3>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0">
              Shield provides a financial fraud prevention platform that allows users to verify account information, assess risk levels associated with financial accounts, submit community reports about suspicious activity, and access real-time intelligence feeds. The service is provided on an "as is" and "as available" basis.
            </p>
          </section>

          <section className="mb-6 pb-5 border-b border-slate-100 last:mb-0 last:pb-0 last:border-b-0">
            <h3 className="text-[15px] font-semibold text-gray-800 mb-2">3. Account Registration and Security</h3>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0">
              You must provide accurate and complete information when creating an account. You are responsible for maintaining the confidentiality of your login credentials and for all activities that occur under your account. You must implement strong passwords and notify us immediately of any unauthorized access.
            </p>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0">
              You are responsible for all activity under your account. If you suspect your account has been compromised, you must contact us immediately. We reserve the right to suspend or terminate accounts that violate these Terms.
            </p>
          </section>

          <section className="mb-6 pb-5 border-b border-slate-100 last:mb-0 last:pb-0 last:border-b-0">
            <h3 className="text-[15px] font-semibold text-gray-800 mb-2">4. Acceptable Use</h3>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0">
              You agree not to misuse the Shield services. Prohibited activities include using the platform for any illegal purpose, infringing on intellectual property rights, reverse engineering our systems, uploading malware, interfering with security measures, scraping data without permission, sending spam or harmful content, and engaging in fraud or deceptive practices.
            </p>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0">
              You may not probe, scan, or test for vulnerabilities in our systems, attempt to gain unauthorized access to any data, or use automated tools such as bots or crawlers without prior written permission.
            </p>
          </section>

          <section className="mb-6 pb-5 border-b border-slate-100 last:mb-0 last:pb-0 last:border-b-0">
            <h3 className="text-[15px] font-semibold text-gray-800 mb-2">5. Intellectual Property</h3>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0">
              The Shield platform, including all text, graphics, logos, software, and algorithms, is the property of Shield and is protected by intellectual property laws. You are granted a limited, non-exclusive, non-transferable license to use the service for personal fraud prevention purposes only.
            </p>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0">
              Community reports and user-submitted data remain the property of the submitting user, but Shield retains a perpetual license to use anonymized, aggregated data for improving our services and protecting the broader community.
            </p>
          </section>

          <section className="mb-6 pb-5 border-b border-slate-100 last:mb-0 last:pb-0 last:border-b-0">
            <h3 className="text-[15px] font-semibold text-gray-800 mb-2">6. Accuracy of Information</h3>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0">
              While we strive to provide accurate risk assessments, Shield does not guarantee the accuracy, completeness, or timeliness of any information provided through our platform. Risk assessments are based on available data and community reports and should be used as one factor in your decision-making process.
            </p>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0">
              We make no warranty that the service will prevent all fraudulent activity. Users should exercise independent judgment and caution in all financial transactions.
            </p>
          </section>

          <section className="mb-6 pb-5 border-b border-slate-100 last:mb-0 last:pb-0 last:border-b-0">
            <h3 className="text-[15px] font-semibold text-gray-800 mb-2">7. Privacy and Data Security</h3>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0">
              Our collection and use of personal data is governed by our Privacy Policy. By using Shield, you agree to the terms of our Privacy Policy, which is incorporated into these Terms by reference.
            </p>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0">
              We implement reasonable security measures including encryption in transit and at rest, secure authentication, regular security assessments, and role-based access controls. However, no system is completely secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section className="mb-6 pb-5 border-b border-slate-100 last:mb-0 last:pb-0 last:border-b-0">
            <h3 className="text-[15px] font-semibold text-gray-800 mb-2">8. Limitation of Liability</h3>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0">
              To the maximum extent permitted by law, Shield shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or goodwill, arising from your use of or inability to use the service.
            </p>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0">
              Shield's total liability for any claim arising out of or relating to these Terms or the service shall not exceed the amount you have paid to us, if any, in the twelve months preceding the claim.
            </p>
          </section>

          <section className="mb-6 pb-5 border-b border-slate-100 last:mb-0 last:pb-0 last:border-b-0">
            <h3 className="text-[15px] font-semibold text-gray-800 mb-2">9. Disclaimer of Warranties</h3>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0 uppercase">
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
            </p>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0 uppercase">
              WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS.
            </p>
          </section>

          <section className="mb-6 pb-5 border-b border-slate-100 last:mb-0 last:pb-0 last:border-b-0">
            <h3 className="text-[15px] font-semibold text-gray-800 mb-2">10. Indemnification</h3>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0">
              You agree to indemnify, defend, and hold harmless Shield and its officers, directors, employees, and agents from any claims, liabilities, damages, losses, and expenses arising out of or related to your use of the service, your violation of these Terms, or your violation of any rights of any third party.
            </p>
          </section>

          <section className="mb-6 pb-5 border-b border-slate-100 last:mb-0 last:pb-0 last:border-b-0">
            <h3 className="text-[15px] font-semibold text-gray-800 mb-2">11. Term and Termination</h3>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0">
              These Terms remain in effect as long as you use the service. Either party may terminate the agreement at any time. Shield reserves the right to suspend or terminate your account immediately if we determine you have violated these Terms.
            </p>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0">
              Upon termination, your right to use the service will cease immediately, but provisions that by their nature should survive termination will remain in effect, including limitation of liability and intellectual property provisions.
            </p>
          </section>

          <section className="mb-6 pb-5 border-b border-slate-100 last:mb-0 last:pb-0 last:border-b-0">
            <h3 className="text-[15px] font-semibold text-gray-800 mb-2">12. Modifications to Terms</h3>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0">
              We reserve the right to modify these Terms at any time. We will notify users of material changes by posting the updated Terms on our platform. Your continued use of the service after modifications constitutes acceptance of the updated Terms.
            </p>
          </section>

          <section className="mb-6 pb-5 border-b border-slate-100 last:mb-0 last:pb-0 last:border-b-0">
            <h3 className="text-[15px] font-semibold text-gray-800 mb-2">13. Dispute Resolution</h3>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0">
              Any disputes arising from these Terms or your use of the service shall first be addressed through good-faith negotiations. If resolution cannot be reached, disputes shall be resolved through binding arbitration in accordance with applicable arbitration rules, unless prohibited by law.
            </p>
          </section>

          <section className="mb-6 pb-5 border-b border-slate-100 last:mb-0 last:pb-0 last:border-b-0">
            <h3 className="text-[15px] font-semibold text-gray-800 mb-2">14. Governing Law</h3>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0">
              These Terms shall be governed by and construed in accordance with applicable law, without regard to conflict of law principles.
            </p>
          </section>

          <section className="mb-6 pb-5 border-b border-slate-100 last:mb-0 last:pb-0 last:border-b-0">
            <h3 className="text-[15px] font-semibold text-gray-800 mb-2">15. Entire Agreement</h3>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0">
              These Terms, together with our Privacy Policy, constitute the entire agreement between you and Shield regarding the service and supersede all prior agreements and communications.
            </p>
          </section>

          <section className="mb-6 pb-5 border-b border-slate-100 last:mb-0 last:pb-0 last:border-b-0">
            <h3 className="text-[15px] font-semibold text-gray-800 mb-2">16. Contact Information</h3>
            <p className="text-gray-600 leading-relaxed mb-2 last:mb-0">
              If you have questions about these Terms, please contact us through our platform support channels.
            </p>
          </section>
        </div>

        <div className="text-center">
          <p className="text-[13px] text-gray-500 mb-2">Shield &copy; 2026. All rights reserved.</p>
          <div>
            <Link to="/privacy" className="text-slate-blue no-underline font-medium text-[13px] hover:underline">Privacy Policy</Link>
          </div>
        </div>
      </div>
    </main>
  )
}
