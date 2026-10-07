import { SiteShell } from "@/components/site-shell";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata("Privacy Policy · web3lane", "/privacy", "How the web3lane prototype handles chat, browser session data, and QA evidence.");

export default function Privacy() {
  return <SiteShell><main className="legal-page"><h1>Privacy Policy</h1><p className="legal-date">Last updated October 7, 2026</p>
    <p>This notice describes the current web3lane prototype. The legal operator name and public privacy contact have not yet been published. Contact the operator who gave you access before submitting personal or confidential information.</p>
    <h2>Information processed</h2><p>When you use chat, your messages, target URLs, answers, approval choices, and tool inputs and outputs are sent through our server to the configured QA agent. Information you provide may include public wallet addresses and transaction identifiers. A configured runner may capture screenshots, recordings, logs, and other test evidence.</p>
    <h2>Why and with whom</h2><p>This information is processed to respond to requests, prepare QA plans, perform approved actions, replay conversations, and investigate failures. The hosting, agent, AI model, and runner providers involved in a deployment may process this data. Their processing locations and retention terms depend on the configured services; a complete provider list has not yet been published.</p>
    <h2>Browser storage</h2><p>The chat stores a session identifier in your browser’s tab-scoped session storage to resume a conversation after refresh. Starting a new chat clears that local reference; it does not delete the previous conversation from the agent. The current landing page does not add advertising or analytics trackers. Hosting infrastructure may keep request and diagnostic logs.</p>
    <h2>Retention and your choices</h2><p>Conversation history is held by the agent backend; logs and test evidence may be retained by their respective services. A fixed retention schedule has not yet been established for this prototype. You can clear browser session storage and stop using the service. For access, correction, or deletion requests, contact the operator who gave you access. Applicable rights depend on your location; blockchain records cannot be removed by web3lane.</p>
    <h2>Keep sensitive information out</h2><p>Do not submit private keys, recovery phrases, passwords, or unnecessary personal data. Use isolated test accounts. Exported transcripts contain conversation and tool data, so review them before sharing. Third-party apps, wallets, payment services, and public blockchains have their own policies.</p>
    <h2>Updates</h2><p>We will update this page as the prototype’s data practices change and revise the date above.</p>
  </main></SiteShell>;
}
