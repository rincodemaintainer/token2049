# Wallet QA Agent

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

The pitch deck is a standalone HTML/CSS/JavaScript artifact, as requested.

## Users

Small Web3 teams without dedicated end-to-end QA hire the service to test a deployed wallet journey. Hackathon judges are the audience for this pitch deck.

## Product Purpose

Turn a short QA request into agreed expectations, bounded real-wallet execution, and evidence a buyer can inspect. A useful delivery may contain an app defect; incomplete service delivery can go to human review.

## Positioning

The buyer approves expected behavior and spending before a real browser wallet run. The report links each outcome to browser, wallet, and chain evidence, keeping app defects separate from service delivery issues.

## Operating Context

One desktop browser, wallet, deployed app, test network, and transaction journey form the MVP job. Masumi on Cardano handles service escrow; the tested app may be on another chain. The proposed first demo is a testnet token swap.

## Capabilities and Constraints

The product plan includes a structured interview, versioned plan and quote, signing limits, bounded recovery, session replay, evidence report, and human review. Current code has a deterministic planning/report core and verified browser wallet connection. Browser signing, browser swap execution, and paid Masumi flow are not yet verified. Planned features must be labeled in the deck.

## Brand Commitments

The existing TOKEN2049 Wallet QA thumbnail uses a dark navy, electric blue, and cyan identity. Preserve a recognizable connection to it.

## Evidence on Hand

The handoff documents in `wallet-qa-handoff/`, prototype status in `wallet-qa-agent/README.md`, and the existing slide thumbnail in `assets/` are source material. Handoff JSON examples are synthetic.

## Product Principles

- Agreement before execution.
- Tight limits around signatures and spend.
- Proof linked to each outcome.
- Honest uncertainty and human review.
