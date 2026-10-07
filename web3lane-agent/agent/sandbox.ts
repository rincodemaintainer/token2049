import { DefaultSandbox, defineSandbox } from "eve/sandbox";
import { JustBashSandbox } from "eve/sandbox/just-bash";

// The hosted chat container has no Docker socket or VM access. Browser work
// stays on the separate trusted paid runner.
export const environment = process.env.WEB3LANE_SELF_HOSTED === "1"
  ? JustBashSandbox.environment({ autoInstall: false })
  : DefaultSandbox.environment();

export default defineSandbox(() => environment.open());
