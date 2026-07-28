# MailFlow Project - Copilot Instructions

## Project Overview
MailFlow is a complete, production-ready AI-powered B2B cold email outreach automation platform built with React, Node.js, and SQLite. The application enables teams to:
- Connect Gmail/Outlook accounts via OAuth
- Import and manage lead databases
- Generate personalized AI emails using Claude
- Auto-enrich company data via web scraping  
- Review and approve emails with a human gate
- Send safely with anti-spam protections
- Track replies and schedule follow-ups
- View real-time dashboards and analytics

## Repository Structure

### Frontend (`client/`)
React 18 + Vite application with dark-mode UI (Tailwind + shadcn/ui)
- **Pages**: Dashboard, Campaigns, Drafts, Leads, Inbox, Settings
- **Components**: Sidebar, StatCard, EmailPreviewPane, etc.
- **Styling**: Dark theme (slate/indigo) with responsive design
- **API Client**: Axios instance with proxy to backend

### Backend (`server/`)
Node.js/Express.js local REST API
- **Routes**: auth.js, campaigns.js, leads.js, drafts.js, send.js, inbox.js, dashboard.js, tracking.js
- **Services**: gmail.js, outlook.js, ai.js, enrichment.js, crypto.js
- **Database**: SQLite via better-sqlite3 with 8 core tables
- **Features**: OAuth token management, async email generation, reply polling, pixel tracking

### Database (SQLite)
Auto-created `mailflow.db` with schema:
- accounts, campaigns, leads, drafts, events, followups, import_logs

## Key Technologies
- **Frontend**: React 18, Vite, TailwindCSS, Lucide Icons
- **Backend**: Express, better-sqlite3, Playwright, node-cron
- **AI**: Anthropic Claude (claude-sonnet-4-20250514)
- **Email**: Gmail API, Microsoft Graph API (OAuth 2.0)  
- **Encryption**: AES-256-CBC for token storage

## Critical Implementation Notes

### AI Email Generation
- Uses Anthropic Claude API with expert B2B copywriter system prompt
- Per-lead: Master prompt + lead data + business enrichment → unique email
- Both initial emails (150 words) and follow-ups (80 words)
- Batch processing with error handling for failed generations

### Safe Sending Engine
- Sequential sends (no parallel) with randomized 45–90 second delays
- Respects daily limits (default 50/day) per account
- Tracks sent emails with message_id for reply threading
- Optional 1x1 pixel tracking for open rates
- Session-based pause/resume/stop controls

### Business Enrichment
- Playwright headless scraper for company websites
- Extracts: services, location, pain points (old copyright, no HTTPS, no phone, etc.)
- Async processing; gracefully handles scraping failures
- Enrichment data stored as JSON in leads.enrichment_data

### Reply Tracking
- node-cron job polls inbox every 15 minutes
- Matches replies by thread_id or In-Reply-To header
- Auto-updates lead status, cancels pending follow-ups
- Logs reply metadata for display in inbox view

## Setup & Installation

### Prerequisites
- Node.js 20+
- npm or yarn
- API Keys:
  - Anthropic (Claude)
  - Google Cloud (Gmail OAuth)
  - Microsoft Azure (Outlook OAuth)

### Installation Steps
1. `npm install-all` (installs root, client/, server/)
2. Copy `.env.example` → `.env` and add API keys
3. Set up Google Cloud & Azure OAuth credentials with correct redirect URIs
4. `npm run dev` starts Vite (5173) + Express (3001)
5. Visit http://localhost:5173 to access UI

### OAuth Redirect URIs
- Gmail: `http://localhost:3001/auth/gmail/callback`
- Outlook: `http://localhost:3001/auth/outlook/callback`

## Development Workflow

### Adding New Campaign Feature
1. Create route in `server/routes/campaigns.js`
2. Update database schema if needed in `server/db/schema.sql`
3. Create React page component in `client/src/pages/`
4. Add navigation link to Sidebar
5. Test API via REST client or frontend UI

### Debugging
- Server logs: `npm run server:dev` shows Node output
- Client logs: Browser DevTools console
- Database: Use `sqlite3 mailflow.db` CLI to inspect

## API Reference (Core Endpoints)

**Auth**: `/auth/gmail`, `/auth/outlook`, `/auth/accounts`  
**Campaigns**: `POST|GET|PUT /api/campaigns`, `/:id/stats`  
**Leads**: `POST /api/leads/import`, `GET /api/leads`  
**Drafts**: `GET|POST /api/drafts`, `/:id/{approve|regenerate}`  
**Send**: `POST /api/send/:campaign_id/start`, `/{pause|resume|stop}`  
**Inbox**: `POST /api/inbox/poll`, `GET /api/inbox/replies`  
**Stats**: `GET /api/dashboard/{stats|overview}`  
**Tracking**: `GET /t/:draft_id.png`  

## Common Customizations

**Change send delay**: Edit campaign.delay_min/delay_max  
**Modify AI prompts**: Edit system prompt in `server/services/ai.js`  
**Add new email provider**: Create `server/services/provider.js`, add OAuth routes  
**Adjust theme colors**: Edit `client/tailwind.config.js` (slate/indigo)  
**Database backups**: Copy `mailflow.db` periodically  

## Performance & Scaling

- **Large lists**: Process in batches via multiple campaigns
- **Enrichment**: Option to disable for faster processing  
- **Sending**: Tune daily_limit and delay_min/max per email provider
- **Replies**: Increase cron interval if load is high
- **Database**: Use indexes (already created) for lead/draft/event queries

## Security Best Practices

✅ OAuth tokens encrypted at-rest (AES-256)  
✅ No SMTP credentials stored  
✅ APP_SECRET required for encryption  
✅ Use HTTPS in production  
✅ Locally stored database (no cloud sync)  

## Next Steps for User

1. **Install Node.js 20+** on your machine
2. **Clone/extract** this `mailflow/` directory
3. **Follow README.md** setup instructions (Google Cloud, Azure)
4. **Set API keys** in `.env` file
5. **Run `npm run dev`** and visit localhost:5173
6. **Connect email account** via Settings
7. **Create first campaign** and import leads
8. **Review & send** your first batch of emails!

## Support & Extension

- All endpoints are RESTful and can be consumed by external tools
- Database is standard SQLite - exportable to CSV/JSON
- AI prompts can be dynamically customized per campaign
- Frontend is fully modular - easy to add new pages/components

---

**Project**: MailFlow v1.0 | **Built**: April 2026 | **Status**: Production-Ready MVP
