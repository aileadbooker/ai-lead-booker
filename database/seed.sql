-- Seed data for testing the AI Lead Booker system (SQLite version)

-- Insert business configuration
INSERT INTO business_config (
  id,
  business_name,
  brand_voice,
  approval_mode,
  confidence_threshold,
  required_fields,
  business_hours,
  ai_disclosure_text,
  escalation_email
) VALUES (
  'bc-' || lower(hex(randomblob(4))),
  'Acme Software Solutions',
  'Professional, helpful, and consultative. Focus on understanding customer needs before proposing solutions.',
  'shadow',
  70,
  '["budget", "timeline", "company"]',
  '{"start": "09:00", "end": "17:00", "timezone": "America/New_York"}',
  'This conversation is assisted by AI. A human team member will review and can intervene at any time.',
  'sales@example.com'
);

-- Insert knowledge base entries
-- Note: SQLite doesn't support WITH/INSERT as easily with unions for multiple inserts 
-- in some versions, so we'll do simple multi-row inserts or separate ones.

INSERT INTO knowledge_base (id, business_id, type, key, value, metadata)
SELECT 'kb-' || lower(hex(randomblob(4))), id, 'service', 'Enterprise CRM', 'Custom CRM solution for mid-to-large businesses', '{}' FROM business_config LIMIT 1;

INSERT INTO knowledge_base (id, business_id, type, key, value, metadata)
SELECT 'kb-' || lower(hex(randomblob(4))), id, 'service', 'Sales Automation Platform', 'AI-powered sales automation', '{}' FROM business_config LIMIT 1;

INSERT INTO knowledge_base (id, business_id, type, key, value, metadata)
SELECT 'kb-' || lower(hex(randomblob(4))), id, 'pricing', 'Enterprise CRM Pricing', 'Ranges from $5,000 to $50,000/month', '{}' FROM business_config LIMIT 1;

INSERT INTO knowledge_base (id, business_id, type, key, value, metadata)
SELECT 'kb-' || lower(hex(randomblob(4))), id, 'policy', 'Refund Policy', 'No refunds on consulting services.', '{}' FROM business_config LIMIT 1;

INSERT INTO knowledge_base (id, business_id, type, key, value, metadata)
SELECT 'kb-' || lower(hex(randomblob(4))), id, 'disqualifier', 'Competitors', 'Salesforce, HubSpot, Pipedrive employees', '{}' FROM business_config LIMIT 1;
