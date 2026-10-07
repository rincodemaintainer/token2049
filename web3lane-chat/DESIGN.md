# QA conversation workspace

Mode: Operate. A single operator discusses a QA job, inspects actual tool output and supplies explicit input. The six-step rail is a guide, not inferred execution progress.

Inherits `../web3lane-extension/DESIGN.md`: paper `#f9faf7`, sage `#e8ebe6`, sidebar `#f0f3ed`, forest `#163300`, ink `#21351b`, lime `#9fe870`, border `#d2dacd`, muted text `#5c6b57`. Plus Jakarta Sans preserves the existing identity and is self-hosted. Lime marks the primary send/answer action. Surfaces use thin borders, no shadows, 7px controls and 14px conversation panels.

Desktop: quiet journey rail; compact agent header and connection check; centered conversation and bottom composer. Mobile: compact brand/new-chat/checklist row, full-width conversation. The checklist remains accessible on its own route.

shadcn/ui Button and Textarea sources live in `components/ui`, with Tailwind v4 CSS-variable tokens and `components.json`. Markdown never enables raw HTML. Tool results collapse into inspectable rows; actual Eve input requests retain distinct review/answer controls. Connection, resuming, working, waiting, cancellation and error states remain textual.

The layout favors the existing minimal chat request over a new visual identity. No fabricated messages, stages, payment state or case results populate the empty view.
