# Project Blueprint: The Weekend Dispatch

## Architecture Overview
This is a Next.js (App Router) application designed to aggregate weekly unstructured updates from a friend group and synthesize them into a single, cohesive Sunday newsletter. We should 

The system relies on Upstash Redis (via Vercel) for temporary state, Respan for LLM routing and observability, Vercel Cron for scheduling, and Resend for email distribution.

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

### Flow 2: Aggregation & Synthesis (Cron -> Redis -> Respan)
- **API Route:** `GET /api/cron/generate`
- **Trigger:** Triggered automatically by Vercel Cron. Schedule defined in `vercel.json`:
  ```json
  {
    "crons": [{ "path": "/api/cron/generate", "schedule": "0 9 * * 0" }]
  }

### DB Schema
Use a Redis List. Key format: `dispatch:submissions:current_week`. Each entry should be a JSON object containing `{ author, general_update, prompt_answer, timestamp }`