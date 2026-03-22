# Project Blueprint: The Weekend Dispatch

## Architecture Overview
This is a Next.js (App Router) application designed to aggregate weekly unstructured updates from a friend group and synthesize them into a single, cohesive Sunday newsletter. We should 

The system relies on Upstash Redis (via Vercel) for temporary state, Respan for LLM routing and observability, and Resend for email distribution. Automated Vercel Cron can be added later; `vercel.json` currently has no cron entries while the MVP is validated with manual triggers.

## Tech Stack & Dependencies
- **Framework:** Next.js 15 (App Router, TypeScript, Tailwind CSS, Lucide React)
- **Database:** `@upstash/redis` (Crucial: Do not use `@vercel/kv` as it is deprecated)
- **AI Gateway & Tracing:** `ai` (via Respan), `@respan/exporter-vercel`, `@vercel/otel`
- **Email:** `resend`

## System Workflows

### Flow 1: Data Ingestion (User -> Upstash Redis)
- **UI:** A simple, mobile-responsive page (`/`) with a text area and a dropdown to select the author. Use a dark-mode, sleek tech aesthetic.
- **API Route:** `POST /api/submit`
- **Logic:** Takes the form submission and pushes it to Redis. 
- **DB Schema:** Use a Redis List. Key format: `dispatch:submissions:current_week`. Each entry should be a JSON object containing `{ author, content, timestamp }`.

### Flow 2a: Prompt the audience (manual)
- **API Route:** `GET /api/cron/prompt`
- **Trigger:** Manual (authorized with `CRON_SECRET` via `Authorization: Bearer` or `x-cron-secret`). Sends a Resend broadcast with a link to `DISPATCH_APP_URL` for submissions.

### Flow 2b: Aggregation & synthesis (manual or future cron)
- **API Route:** `GET /api/cron/generate`
- **Trigger:** Manual for MVP (`?trigger=manual` optional for logging). Same auth as Flow 2a. Reads Redis submissions, runs LLM synthesis (Respan-traced), sends the summary broadcast.
- **MVP helper:** `npm run mvp:triggers` runs `scripts/mvp-triggers.sh` (set `BASE_URL` and `CRON_SECRET`).

### DB Schema
Use a Redis List. Key format: `dispatch:submissions:current_week`. Each entry should be a JSON object containing `{ author, general_update, prompt_answer, timestamp }`