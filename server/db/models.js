import mongoose from 'mongoose';

const accountSchema = new mongoose.Schema({
  provider: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  display_name: String,
  avatar_url: String,
  access_token: String,
  refresh_token: String,
  token_expiry: Number,
  is_active: { type: Boolean, default: false },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

const campaignSchema = new mongoose.Schema({
  name: { type: String, required: true },
  goal: String,
  master_prompt: String,
  subject_template: String,
  body_template: String,
  tone: { type: String, default: 'professional' },
  cta_type: { type: String, default: 'reply' },
  daily_limit: { type: Number, default: 50 },
  delay_min: { type: Number, default: 45 },
  delay_max: { type: Number, default: 90 },
  followup_days: { type: String, default: '[3,6,9,14]' },
  followup_prompts: String,
  followup_templates: [{
    sequence: Number,
    delay_days: { type: Number, default: 3 },
    subject: String,
    body: String,
    enabled: { type: Boolean, default: true }
  }],
  reply_to_thread: { type: Boolean, default: false },
  status: { type: String, default: 'draft' },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

const leadSchema = new mongoose.Schema({
  campaign_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
  first_name: String,
  last_name: String,
  email: { type: String, required: true, lowercase: true },
  company: String,
  website: String,
  title: String,
  notes: String,
  linkedin_url: String,
  linkedin_data: String,
  email_type: { type: String, default: 'unknown' },
  enrichment_data: String, // Stringified JSON or we could use Mixed
  status: { type: String, default: 'new' },
  subject: String,
  message: String,
  image_url: String,
  // Email threading fields
  messageId: { type: String }, // Stores the Message-ID of the first sent email
  threadId: { type: String }, // Stores the thread ID (especially for Gmail)
  originalSubject: { type: String }, // Stores the original subject for Re: prefix in replies
  replied: { type: Boolean, default: false },
  repliedAt: Date,
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Index for performance
leadSchema.index({ campaign_id: 1 });
leadSchema.index({ email: 1 });

const draftSchema = new mongoose.Schema({
  lead_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  campaign_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
  sequence: { type: Number, default: 1 },
  subject: String,
  body: String,
  status: { type: String, default: 'draft' },
  reviewed_at: Date,
  sent_at: Date,
  scheduled_at: Date,
  message_id: String,
  thread_id: String,
  is_reply: { type: Boolean, default: false },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

draftSchema.index({ lead_id: 1 });
draftSchema.index({ campaign_id: 1 });
draftSchema.index({ status: 1 });

const eventSchema = new mongoose.Schema({
  lead_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  draft_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Draft' },
  event_type: { type: String, required: true },
  metadata: String, // Stringified JSON
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

const followupSchema = new mongoose.Schema({
   lead_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
   campaign_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
   sequence: { type: Number, default: 1 }, // 1 = Round 1, 2 = Round 2, 3 = Round 3
   subject: String,
   body: String,
   status: { type: String, default: 'pending' }, // pending, sent, failed, cancelled
   scheduled_date: { type: Date }, // Changed to Date type for easier querying
   sent_at: Date,
   auto_cancel_on_reply: { type: Boolean, default: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updatedAt' } });

const importLogSchema = new mongoose.Schema({
  campaign_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
  file_name: String,
  total_rows: Number,
  valid_count: Number,
  business_count: Number,
  personal_count: Number,
  invalid_count: Number,
  errors: String,
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, suppressReservedKeysWarning: true });


const configSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: String,
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

const apiKeySchema = new mongoose.Schema({
  provider: { type: String, required: true },
  api_key: String,
  api_url: String,
  model: { type: String, default: 'default' },
  is_active: { type: Boolean, default: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

export const Account = mongoose.models.Account || mongoose.model('Account', accountSchema);
export const Campaign = mongoose.models.Campaign || mongoose.model('Campaign', campaignSchema);
export const Lead = mongoose.models.Lead || mongoose.model('Lead', leadSchema);
export const Draft = mongoose.models.Draft || mongoose.model('Draft', draftSchema);
export const LeadEvent = mongoose.models.LeadEvent || mongoose.model('LeadEvent', eventSchema);
export const Followup = mongoose.models.Followup || mongoose.model('Followup', followupSchema);
export const ImportLog = mongoose.models.ImportLog || mongoose.model('ImportLog', importLogSchema);
export const Config = mongoose.models.Config || mongoose.model('Config', configSchema);
export const ApiKey = mongoose.models.ApiKey || mongoose.model('ApiKey', apiKeySchema);

export default {
  Account,
  Campaign,
  Lead,
  Draft,
  LeadEvent,
  Followup,
  ImportLog,
  Config,
  ApiKey,
};
