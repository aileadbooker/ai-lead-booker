-- AI Lead Booker System - Database Schema (SQLite version)

-- Users table for authentication and billing
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  google_id TEXT UNIQUE,
  name TEXT,
  photo TEXT,
  access_token TEXT,
  refresh_token TEXT,
  google_app_password TEXT,
  google_account_email TEXT,
  has_paid INTEGER DEFAULT 0,
  onboarding_completed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY, -- Using UUID strings
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  phone TEXT,
  company TEXT,
  source TEXT NOT NULL, -- 'email' | 'webform'
  status TEXT NOT NULL DEFAULT 'new', -- 'new' | 'qualifying' | 'awaiting_response' | 'ready_to_book' | 'booked' | 'escalated' | 'closed'
  opted_out INTEGER DEFAULT 0, -- 0 for false, 1 for true
  last_contact_at TEXT, -- ISO string
  next_action_at TEXT, -- ISO string
  followup_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_leads_next_action ON leads(next_action_at) WHERE opted_out = 0;
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);

-- Email threading support
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  gmail_thread_id TEXT,
  message_id TEXT,
  in_reply_to TEXT,
  subject TEXT,
  body TEXT NOT NULL,
  sent_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_lead ON messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(gmail_thread_id);

-- Conversation state tracking
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'new', -- 'new' | 'qualifying' | 'clarifying' | 'ready_to_book' | 'booked' | 'closed'
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_conversations_lead ON conversations(lead_id);

-- LLM structured outputs with fallback tracking
CREATE TABLE IF NOT EXISTS llm_decisions (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  confidence INTEGER CHECK (confidence >= 0 AND confidence <= 100),
  missing_fields TEXT DEFAULT '[]', -- JSON string
  message_draft TEXT,
  reasoning TEXT,
  qualification_scores TEXT, -- JSON string
  fallback_used INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_llm_decisions_lead ON llm_decisions(lead_id);

-- Bookings with double-book protection
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  external_event_id TEXT UNIQUE,
  scheduled_at TEXT NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  qualification_summary TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled', -- 'scheduled' | 'completed' | 'no_show' | 'cancelled'
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bookings_lead ON bookings(lead_id);
CREATE INDEX IF NOT EXISTS idx_bookings_external_event ON bookings(external_event_id);
CREATE INDEX IF NOT EXISTS idx_bookings_scheduled ON bookings(scheduled_at);

-- Escalations
CREATE TABLE IF NOT EXISTS escalations (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  resolved INTEGER DEFAULT 0,
  resolved_at TEXT,
  resolved_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_escalations_lead ON escalations(lead_id);
CREATE INDEX IF NOT EXISTS idx_escalations_resolved ON escalations(resolved);

-- Analytics Events Table
CREATE TABLE IF NOT EXISTS analytics_events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL, -- 'email_sent', 'reply_received', 'interested', 'not_interested', 'booked', 'disqualified'
    lead_id TEXT,
    metadata TEXT, -- JSON string for additional data
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_lead_id ON analytics_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON analytics_events(created_at);

-- Business configuration with shadow/live mode
CREATE TABLE IF NOT EXISTS business_config (
  id TEXT PRIMARY KEY,
  business_name TEXT NOT NULL,
  brand_voice TEXT,
  approval_mode TEXT NOT NULL DEFAULT 'shadow' CHECK (approval_mode IN ('shadow', 'live')),
  confidence_threshold INTEGER DEFAULT 70 CHECK (confidence_threshold >= 0 AND confidence_threshold <= 100),
  required_fields TEXT DEFAULT '[]', -- JSON string
  business_hours TEXT DEFAULT '{"start": "09:00", "end": "17:00", "timezone": "America/New_York"}', -- JSON string
  ai_disclosure_text TEXT,
  escalation_email TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Knowledge base for guardrail validation
CREATE TABLE IF NOT EXISTS knowledge_base (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES business_config(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('service', 'policy', 'pricing', 'disqualifier')),
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  metadata TEXT DEFAULT '{}', -- JSON string
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_base_business ON knowledge_base(business_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_type ON knowledge_base(type);

-- Rate limiting
CREATE TABLE IF NOT EXISTS rate_limits (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  period TEXT NOT NULL CHECK (period IN ('daily', 'weekly')),
  count INTEGER DEFAULT 0,
  reset_at TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(lead_id, period)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_lead ON rate_limits(lead_id);
CREATE INDEX IF NOT EXISTS idx_rate_limits_reset ON rate_limits(reset_at);

-- Action log for audit trail
CREATE TABLE IF NOT EXISTS action_log (
  id TEXT PRIMARY KEY,
  lead_id TEXT REFERENCES leads(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  details TEXT NOT NULL, -- JSON string
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_action_log_lead ON action_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_action_log_type ON action_log(action_type);
CREATE INDEX IF NOT EXISTS idx_action_log_created ON action_log(created_at);

-- Custom Pitch configuration
CREATE TABLE IF NOT EXISTS custom_pitch (
  id TEXT PRIMARY KEY,
  initial_pitch TEXT NOT NULL,
  yes_response TEXT NOT NULL,
  no_response TEXT NOT NULL,
  yes_2_response TEXT,
  no_2_response TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Campaign Configuration
CREATE TABLE IF NOT EXISTS campaign_config (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'running')),
  current_niche TEXT,
  daily_limit INTEGER DEFAULT 50,
  updated_at TEXT DEFAULT (datetime('now'))
);
