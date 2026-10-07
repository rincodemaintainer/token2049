import { eveChannel } from "eve/channels/eve";
import { localDev, placeholderAuth, type AuthFn, vercelOidc, withAuthChallenges } from "eve/channels/auth";
import { qaAgentBearerAuth } from "../lib/qa-agent-bearer-auth.ts";

const bearerToken: AuthFn<Request> = async (request) => {
  return qaAgentBearerAuth(request.headers.get("authorization"));
};

export default eveChannel({
  auth: [
    withAuthChallenges(bearerToken, [{ scheme: "Bearer" }]),
    // Lets the eve TUI and your Vercel deployments reach the deployed agent.
    vercelOidc(),
    // Open on localhost for `eve dev` and the REPL; ignored in production.
    localDev(),
    // This placeholder will not allow browser requests in production.
    // Replace it with your app's auth provider, like Auth.js or Clerk,
    // or use none() for a public demo.
    placeholderAuth(),
  ],
});
