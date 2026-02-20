# AI Lead Booker - Setup Guide

## Prerequisites

1. **Node.js** (v18 or higher)
   ```bash
   node --version
   ```

2. **SQLite** (Pre-installed on macOS)
   - No installation required!

3. **Google Cloud Project** with Gmail API and Calendar API enabled

4. **OpenAI API Key**

## Installation Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up SQLite Database

The system uses a zero-configuration SQLite database. To initialize it with schema and seed data:

```bash
npx ts-node scripts/setup-sqlite.ts
```

### 3. Configure Google Cloud APIs

#### Enable APIs:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable **Gmail API** and **Google Calendar API**
4. Create OAuth 2.0 credentials (Desktop app type)
5. Download credentials JSON

#### Get Refresh Token:
```bash
# Use Google OAuth Playground or run this helper
npx google-oauth-cli \
  --client-id YOUR_CLIENT_ID \
  --client-secret YOUR_CLIENT_SECRET \
  --scope https://www.googleapis.com/auth/gmail.readonly \
    https://www.googleapis.com/auth/gmail.send \
    https://www.googleapis.com/auth/calendar
```

This will give you a REFRESH_TOKEN.

### 4. Configure Environment Variables

```bash
# Copy example
cp .env.example .env

# Edit .env with your values
nano .env
```

Required variables:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/lead_booker
OPENAI_API_KEY=sk-...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
GMAIL_USER_EMAIL=your-email@gmail.com
```

### 5. Update Business Configuration

Edit the seed data or update directly in database:

```sql
UPDATE business_config
SET escalation_email = 'your-real-email@example.com',
    approval_mode = 'shadow'  -- Keep in shadow mode for testing
WHERE true;
```

### 6. Build and Run

```bash
# Build TypeScript
npm run build

# Start the server
npm start
```

Or for development with auto-reload:
```bash
npm run dev
```

## Testing the System

### 1. Send a Test Email

Send an email to the Gmail account you configured from a different email address:

```
Subject: Interested in Enterprise CRM
Body: Hi, I'm interested in your Enterprise CRM solution. We're a 500-person company
looking to improve our sales process. What are your pricing options?
```

### 2. Check Logs

Watch the console output. You should see:
- Email detected
- Lead created
- LLM qualification decision
- **SHADOW MODE** message (email drafted but not sent)

### 3. Check Database

```sql
-- View leads
SELECT * FROM leads ORDER BY created_at DESC LIMIT 5;

-- View LLM decisions
SELECT lead_id, action, confidence, reasoning FROM llm_decisions ORDER BY created_at DESC LIMIT 5;

-- View action log (shadow mode emails)
SELECT * FROM action_log WHERE action_type = 'shadow_email' ORDER BY created_at DESC;
```

### 4. Switch to Live Mode

Once confident:

```sql
UPDATE business_config SET approval_mode = 'live';
```

Restart the server. Now emails will actually be sent!

## Monitoring

### Health Check
```bash
curl http://localhost:3000/health
```

### View Logs
```bash
tail -f logs/app.log  # If you set up logging
```

### Database Queries

```sql
-- Lead pipeline
SELECT status, COUNT(*) FROM leads GROUP BY status;

-- Booking rate
SELECT 
  COUNT(DISTINCT b.lead_id)::float / NULLIF(COUNT(DISTINCT l.id), 0) * 100 AS booking_rate_pct
FROM leads l
LEFT JOIN bookings b ON l.id = b.lead_id;

-- Escalation rate
SELECT 
  COUNT(DISTINCT e.lead_id)::float / NULLIF(COUNT(DISTINCT l.id), 0) * 100 AS escalation_rate_pct
FROM leads l
LEFT JOIN escalations e ON l.id = e.lead_id;
```

## Troubleshooting

### "npm: command not found"
Install Node.js: https://nodejs.org/

### "Database connection failed"
- Check PostgreSQL is running: `pg_isready`
- Verify DATABASE_URL in .env

### "OpenAI API error"
- Verify API key is correct
- Check you have credits: https://platform.openai.com/account/billing

### "Gmail API 401 Unauthorized"
- Refresh token may be expired
- Regenerate using OAuth playground

### No emails being detected
- Check Gmail account has unread messages in INBOX
- Verify GMAIL_USER_EMAIL matches OAuth account
- Check console for API errors

## Next Steps (Milestone 2)

Once Milestone 1 is working:
1. Implement follow-up scheduler (node-cron)
2. Add multi-turn conversation handling
3. Build escalation notification emails
4. Add booking confirmation workflow

## Security Notes

- **Never commit .env file**
- Keep API keys secure
- Use shadow mode until thoroughly tested
- Monitor escalations closely in production
- Set up rate limiting for external API calls
