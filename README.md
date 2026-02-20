# AI Lead Booker

Autonomous AI Lead Booker that captures, qualifies, and books sales meetings with minimal human involvement.

## Features

✅ **Milestone 1: Core Flow (Completed)**
- Email monitoring via Gmail API
- LLM-powered qualification with structured JSON output
- Google Calendar integration with double-book protection
- Shadow/Live mode for safe testing
- Safety guardrails (opt-out, rate limits, business hours)
- Knowledge base for service/policy validation
- Required fields gating before booking
- Email threading support
- Escalation to humans when needed

## Quick Start

See [SETUP.md](./SETUP.md) for detailed installation and configuration instructions.

```bash
# Install dependencies
npm install

# Set up database
createdb lead_booker
psql lead_booker < database/schema.sql
psql lead_booker < database/seed.sql

# Configure .env (see .env.example)
cp .env.example .env
# Edit .env with your API keys

# Build and run
npm run build
npm start
```

## Architecture

```
Email Inbox → Gmail Service → Lead Processor → Qualification Engine → LLM Service
                                      ↓
                        Safety Guardrails Check
                                      ↓
                     ┌─────────────────┼─────────────────┐
                     ↓                 ↓                 ↓
              Send Message      Create Booking    Escalate to Human
```

## Technology Stack

- **Backend**: Node.js + TypeScript + Express
- **Database**: PostgreSQL (with email threading, follow-up queue)
- **Email**: Gmail API (threading support)
- **Calendar**: Google Calendar API
- **AI**: OpenAI GPT-4 (structured JSON output)

## Key Components

| Component | Description |
|-----------|-------------|
| `llm-service.ts` | OpenAI integration with fallback behavior |
| `qualification-engine.ts` | Required fields gating, confidence threshold |
| `safety-guardrails.ts` | Opt-out, rate limits, business hours |
| `gmail-service.ts` | Email monitoring with threading |
| `calendar-service.ts` | Booking with double-book protection |
| `email-sender.ts` | Shadow/live mode email sending |
| `lead-processor.ts` | Main orchestration pipeline |

## Database Schema

- `leads` - Core lead tracking with follow-up queue (`next_action_at`)
- `messages` - Email threading (`gmail_thread_id`, `message_id`, `in_reply_to`)
- `llm_decisions` - LLM outputs with fallback flag
- `bookings` - Calendar events with double-book protection (`external_event_id`)
- `business_config` - Shadow/live mode, required fields, policies
- `knowledge_base` - Services, pricing, policies for validation
- `rate_limits` - Per-lead message limits
- `escalations` - Human handoff tracking
- `action_log` - Full audit trail

## Shadow Mode

Start in **shadow mode** for safety. The AI will:
- Process emails
- Make qualification decisions
- Draft response messages
- **Log everything but NOT send emails**

Check `action_log` table for shadow actions. Once confident, switch to live mode:

```sql
UPDATE business_config SET approval_mode = 'live';
```

## Monitoring

```sql
-- Lead pipeline
SELECT status, COUNT(*) FROM leads GROUP BY status;

-- Recent decisions
SELECT action, confidence, reasoning FROM llm_decisions ORDER BY created_at DESC LIMIT 10;

-- Shadow mode emails (what WOULD be sent)
SELECT details->>'to', details->>'subject' 
FROM action_log 
WHERE action_type = 'shadow_email' 
ORDER BY created_at DESC;
```

## Roadmap

- [x] **Milestone 1**: Core flow (email → qualify → book)
- [ ] **Milestone 2**: Follow-ups + escalation workflows
- [ ] **Milestone 3**: Dashboard + analytics

## Security

- API keys in `.env` (never commit)
- Shadow mode for testing
- Opt-out compliance
- Rate limiting
- Business hours enforcement
- Escalation on uncertainty

## License

MIT
