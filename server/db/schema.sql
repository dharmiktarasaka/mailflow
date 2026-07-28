-- Email accounts
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expiry INTEGER,
  is_active INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Campaigns
CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  goal TEXT,
  master_prompt TEXT,
  tone TEXT DEFAULT 'professional',
  cta_type TEXT DEFAULT 'reply',
  daily_limit INTEGER DEFAULT 50,
  delay_min INTEGER DEFAULT 45,
  delay_max INTEGER DEFAULT 90,
  followup_days TEXT DEFAULT '[3,7]',
  followup_prompts TEXT,
  reply_to_thread INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Leads
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER REFERENCES campaigns(id),
  first_name TEXT,
  last_name TEXT,
  email TEXT NOT NULL,
  company TEXT,
  website TEXT,
  title TEXT,
  notes TEXT,
  email_type TEXT DEFAULT 'unknown',
  enrichment_data TEXT,
  status TEXT DEFAULT 'new',
  subject TEXT,
  message TEXT,
  image_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Drafts
CREATE TABLE IF NOT EXISTS drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER REFERENCES leads(id),
  campaign_id INTEGER REFERENCES campaigns(id),
  sequence INTEGER DEFAULT 1,
  subject TEXT,
  body TEXT,
  status TEXT DEFAULT 'draft',
  reviewed_at DATETIME,
  sent_at DATETIME,
  scheduled_at DATETIME,
  message_id TEXT,
  thread_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Events (activity log)
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER REFERENCES leads(id),
  draft_id INTEGER REFERENCES drafts(id),
  event_type TEXT NOT NULL,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Followups
CREATE TABLE IF NOT EXISTS followups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER REFERENCES leads(id),
  campaign_id INTEGER REFERENCES campaigns(id),
  sequence INTEGER DEFAULT 1,
  subject TEXT,
  body TEXT,
  status TEXT DEFAULT 'pending',
  scheduled_date TEXT,
  sent_at DATETIME,
  auto_cancel_on_reply INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Campaign Lead Import tracking
CREATE TABLE IF NOT EXISTS import_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER REFERENCES campaigns(id),
  file_name TEXT,
  total_rows INTEGER,
  valid_count INTEGER,
  business_count INTEGER,
  personal_count INTEGER,
  invalid_count INTEGER,
  errors TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Application configuration
CREATE TABLE IF NOT EXISTS config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- API Keys storage (multiple providers)
CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  api_key TEXT,
  api_url TEXT,
  model TEXT DEFAULT 'default',
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_leads_campaign ON leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_drafts_lead ON drafts(lead_id);
CREATE INDEX IF NOT EXISTS idx_drafts_campaign ON drafts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);
CREATE INDEX IF NOT EXISTS idx_events_lead ON events(lead_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);
CREATE INDEX IF NOT EXISTS idx_followups_scheduled ON followups(scheduled_date);
