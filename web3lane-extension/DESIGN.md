---
name: web3lane
description: A calm, high-clarity Cardano Preprod wallet-testing workspace.
colors:
  forest: "#163300"
  ink: "#21351b"
  lime: "#9fe870"
  sage: "#e8ebe6"
  paper: "#f9faf7"
  sidebar: "#f0f3ed"
  border: "#d2dacd"
  muted-text: "#5c6b57"
  focus: "#4e842a"
  success: "#325b22"
  warning-bg: "#f1e8cc"
  warning-text: "#685222"
  error-bg: "#f7e6dc"
  error-text: "#783d25"
typography:
  display:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: "clamp(30px, 3.3vw, 43px)"
    fontWeight: 500
    lineHeight: 1.16
    letterSpacing: "-0.04em"
  title:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: "19px"
    fontWeight: 600
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.9
  label:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: "10px"
    fontWeight: 600
rounded:
  compact: "4px"
  control: "7px"
  nav: "8px"
  panel: "14px"
  pill: "20px"
spacing:
  compact: "8px"
  control: "15px"
  section: "25px"
  page: "46px"
components:
  button-primary:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.forest}"
    rounded: "{rounded.control}"
    padding: "11px 15px"
  button-secondary:
    backgroundColor: "#edf2e8"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "11px 15px"
  runbook:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.panel}"
    padding: "22px 25px"
---

# Design System: web3lane

## Overview

**Creative North Star: "The quiet wallet lab"**

web3lane inherits a restrained forest, sage, paper, and lime visual world. It presents sensitive wallet actions as a calm developer workspace: small labels, compact controls, generous panel breathing room, and precise status language.

The interface makes the approval boundary visible through the two-step runbook, Preprod badge, disabled states, readable signing payload, and local evidence views. Staking is explicitly deferred; this surface documents connection and message-signature testing only.

**Key Characteristics:**

- Fixed workspace rail, compact top bar, and paper work surface
- Dark forest agent-status card paired with restrained pale panels
- Lime reserved for the primary forward action and live status
- Human-readable state and agent-readable evidence share the same surface

## Colors

The palette uses quiet botanical neutrals for routine work, forest for authority, and lime for the small number of actions that move the session forward.

### Primary

- **Forest:** primary headings, the agent-status panel, completed-step state, and high-confidence text.
- **Lime:** the primary connection action and live indicators; retain its scarcity.

### Neutral

- **Paper:** cards and main work surfaces.
- **Sage:** page background and low-emphasis tonal layers.
- **Sidebar:** fixed rail and inactive control background.
- **Ink:** standard text.
- **Muted text:** captions, supporting copy, and secondary state.
- **Border:** quiet structure between workspace regions and panel rows.

### Named Rules

**The Lime Boundary Rule.** Use lime only for a clear next action, completion, or live state. Do not use it to decorate passive content.

## Typography

**Display Font:** Plus Jakarta Sans, sans-serif

**Body Font:** Plus Jakarta Sans, sans-serif

**Character:** Slightly tightened display text gives the workspace a confident, compact headline while small, loose leading keeps operational copy readable.

### Hierarchy

- **Display:** used for page-level session, activity, and guide headlines.
- **Title:** used for panel, card, and content-sheet headings.
- **Body:** used for explanatory text and instructional paragraphs.
- **Label:** used for controls, badges, metadata, and data-dense support text.

## Layout

The desktop layout uses a fixed 230px sidebar, an 80px top bar, and a main column capped at 1200px with 46px page padding. The session view is a primary runbook plus a narrower context column. At 1150px, the rail and page padding reduce; at 900px, the rail becomes icon-forward and the guide becomes one column. At 700px, the sidebar becomes a horizontal static header, action buttons fill the available width, and the session grid stacks.

## Elevation & Depth

The system is flat. Borders and pale tonal shifts separate panels and states; no box-shadow token is present. The dark agent card creates the strongest depth contrast without lifting above its peers.

## Shapes

Controls use compact rounded rectangles, navigation uses slightly softer corners, and primary cards use 14px corners. Pills identify persistent network state. Borders are thin, muted, and structural.

## Components

### Buttons

- **Shape:** compact rounded rectangle using the control radius.
- **Primary:** lime background, forest text, 42px minimum height, and a slightly deeper lime hover.
- **Secondary:** pale sage background with a quiet border; used when a connection or review state is required before progress.
- **Focus:** visible 3px green outline with 4px offset.

### Cards / Containers

- **Corner Style:** panel radius.
- **Background:** paper panels, with a forest agent-status card as the session focal point.
- **Border:** muted structural border.
- **Internal Padding:** controls and rows use compact spacing; panels use section spacing.

### Inputs / Fields

- **Style:** pale sidebar-toned fill, thin muted border, control radius, and compact text.
- **Focus:** shared visible green outline.

### Navigation

- **Style:** fixed pale sidebar on desktop with icon-and-label rows. The active item gains a tonal sage fill and forest text.
- **Mobile:** transforms into a horizontal tab row with an active bottom border.

### Runbook

The signature component is a two-step wallet test: connect, then review and request a message signature. Completion, waiting, unsupported network, and wallet-prompt states are all visible in the same panel.

## Do's and Don'ts

- Do preserve the explicit Cardano Preprod badge and network confirmation state.
- Do keep connection and signing as visibly separate steps.
- Do use short, direct helper text alongside controls that have wallet consequences.
- Do retain the readable signing payload before the approval request.
- Don't represent staking as available in this wallet-test surface.
- Don't expose signing as an agent-executed tool; the review button and wallet prompt remain the approval boundary.
- Don't add decorative shadows or high-saturation accents outside the existing lime action role.
