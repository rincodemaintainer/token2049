import Link from "next/link";
import { SiteShell } from "@/components/site-shell";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata("Terms of Service · web3lane", "/terms", "Terms for using the web3lane wallet QA prototype.");

export default function Terms() {
  return <SiteShell><main className="legal-page"><h1>Terms of Service</h1><p className="legal-date">Last updated October 7, 2026</p>
    <p>These terms cover your use of the web3lane wallet QA prototype. By using the service, you agree to these terms. If you do not agree, do not use it.</p>
    <h2>Use responsibly</h2><p>Only test applications and wallets you own or have permission to test. You are responsible for your inputs, approvals, and compliance with applicable laws. Do not misuse the service, attempt unauthorized access, or disrupt other systems.</p>
    <h2>Review before acting</h2><p>AI-generated plans and results may be incomplete or incorrect. Review the scope, network, permissions, amounts, and evidence yourself. A test result is not a security audit, a guarantee of safety, or financial advice. Use isolated test wallets and never enter recovery phrases or private keys in chat.</p>
    <h2>Transactions and fees</h2><p>Blockchain transactions may be irreversible and carry network fees. Chat alone does not establish payment, escrow, or settlement. If you use a separate paid execution service, review its quote, approval requirements, payment method, and refund or dispute terms before paying. Do not assume that a direct payment includes escrow or automatic refunds.</p>
    <h2>Your content</h2><p>You retain rights to the content you submit and permit its processing as needed to provide the requested service. Only submit content you are authorized to share. See our <Link href="/privacy">Privacy Policy</Link> for the current data flow.</p>
    <h2>Availability and responsibility</h2><p>This experimental service is provided as available, without a promise of uninterrupted operation or error-free results. To the extent permitted by applicable law, web3lane disclaims implied warranties and liability for indirect or consequential losses. Nothing in these terms excludes rights or liabilities that cannot legally be excluded.</p>
    <h2>Changes and contact</h2><p>Features and these terms may change. Updates will appear here with a revised date. For questions, contact the operator who gave you access to this prototype. The legal operator name and public support address have not yet been published.</p>
  </main></SiteShell>;
}
