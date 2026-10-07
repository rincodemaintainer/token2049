import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description: "Draft optional agent commentary. The trusted host owns recorded evidence validation, case results, report packing, and payment submission. This tool cannot produce or seal a result report.",
  inputSchema: z.object({
    summary: z.string().trim().min(1).max(4000),
    comments: z.array(z.object({
      section: z.enum(["run", "recovery", "verdict", "checks"]),
      text: z.string().trim().min(1).max(4000),
    }).strict()).max(50).default([]),
  }).strict(),
  async execute({ summary, comments }) {
    return { schemaVersion: 1 as const, author: "web3lane", createdAt: new Date().toISOString(), summary, comments };
  },
});
