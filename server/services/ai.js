import axios from 'axios'
import { getActiveAI, PROVIDER_CONFIG } from '../routes/config.js'
import { replaceLeadPlaceholders } from './leadUtils.js'

const sanitizeJSON = (raw) => {
  return raw
    .replace(/```json|```/g, '')
    .trim()
    .replace(/[\x00-\x1F\x7F]/g, (ch) => {
      const map = { '\n': '\\n', '\r': '\\r', '\t': '\\t' };
      return map[ch] ?? '';
    });
};

function extractLastJsonBlock(content) {
  // Scan from the end to find the last complete { } JSON object
  let closeIdx = content.lastIndexOf('}')
  if (closeIdx < 0) return null

  // Walk backwards to find matching opening brace with nesting
  let depth = 0
  let openIdx = -1
  for (let i = closeIdx; i >= 0; i--) {
    if (content[i] === '}') depth++
    else if (content[i] === '{') depth--
    if (depth === 0) { openIdx = i; break }
  }
  if (openIdx < 0) return null

  return content.substring(openIdx, closeIdx + 1)
}

function tryParse(str) {
  try { return JSON.parse(str) }
  catch { return null }
}

function parseAIJsonResponse(content) {
  // 1 — locate the last complete { } block in the response
  let jsonStr = extractLastJsonBlock(content)
  if (!jsonStr) throw new Error('Invalid AI response format')

  // 2 — try clean parse first
  let parsed = tryParse(jsonStr)
  if (parsed) return parsed

  // 3 — strip markdown fences + trim + remove control chars that are
  //     never valid in JSON (0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F, 0x7F).
  //     Keep \t \n \r which are valid structural whitespace.
  jsonStr = jsonStr
    .replace(/```json|```/g, '')
    .trim()
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')

  parsed = tryParse(jsonStr)
  if (parsed) return parsed

  // 4 — last resort: escape \n \r \t everywhere (sacrifices
  //     structural whitespace but fixes inline control chars)
  jsonStr = sanitizeJSON(extractLastJsonBlock(content))
  parsed = tryParse(jsonStr)
  if (parsed) return parsed

  console.error('AI JSON parse failed — raw content:', JSON.stringify(content.substring(0, 1000)))
  throw new Error('Invalid AI response format')
}

export const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function callAI(systemPrompt, userPrompt, maxTokens = 1024) {
  const keyData = await getActiveAI()
  if (!keyData) throw new Error('No AI provider configured')
  const provider = PROVIDER_CONFIG[keyData.provider]
  if (!provider) throw new Error(`Unknown provider: ${keyData.provider}`)

  let response
  let lastError
  const maxRetries = 3

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const backoff = Math.pow(2, attempt) * 1000
        await sleep(backoff)
      }

      if (keyData.provider === 'anthropic') {
        response = await axios.post(provider.apiUrl, {
          model: keyData.model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }, {
          headers: {
            'x-api-key': keyData.api_key,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
        })
        return response.data.content[0].text
      } else {
        response = await axios.post(provider.apiUrl, {
          model: keyData.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: maxTokens,
          temperature: 0.7,
        }, {
          headers: {
            'Authorization': `Bearer ${keyData.api_key}`,
            'Content-Type': 'application/json',
          },
        })
        return response.data.choices[0].message.content
      }
    } catch (err) {
      lastError = err
      if (err.response?.status === 429) {
        console.log(`Rate limited (attempt ${attempt + 1}/${maxRetries}), retrying...`)
        continue
      }
      throw err
    }
  }
  throw lastError || new Error('AI request failed')
}

const LINKEDIN_SUMMARY_PROMPT = `You are a senior LinkedIn research specialist and B2B researcher. Given a LinkedIn profile URL and a person's name, analyze the URL structure and infer their likely professional background. Consider:
- Likely job title and seniority level
- Industry and market focus
- Company size and type
- Key areas of responsibility
- Likely business challenges in their role

Return ONLY valid JSON in this exact format:
{
  "company": "Actual company name from LinkedIn (or null if not found)",
  "industry_trend": "Specific industry trend, service line, or focus area the person/company is currently emphasizing (be specific)",
  "professional_background": "Detailed 3-4 sentence summary covering their role, industry, company focus, and seniority",
  "business_challenges": "Likely business challenges related to visibility, authority, inbound leads, recruiting, partnerships, project pipeline, or operational efficiency based on their industry",
  "similar_company": "Name of a similar company in the same space that could be used for social proof (or null if not applicable)",
  "personalized_opening": "A specific, personalized opening line for an email that references something concrete from their profile (do not use generic phrases)"
}`

const EMAIL_SYSTEM_PROMPT = `Act like a senior B2B outbound copywriter and LinkedIn research specialist.

Your goal is to generate a highly personalized, high-converting cold outreach email for a potential client.
You must combine/merge the user's custom outreach instructions (Email Prompt) and the recipient's LinkedIn Profile Analysis.

Recipient's LinkedIn Profile Analysis:
- Company
- Industry Trend/Focus
- Professional Background
- Business Challenges
- Personalized Opening

User's Email Prompt (Instructions for the email content, services/offer, tone, and signature):
- Read the instructions carefully to understand the value proposition, tone, CTA, and email details.

Requirements:
1) Incorporate the recipient's LinkedIn background and challenges naturally to show the email is tailored specifically for them.
2) Use the personalized opening as a reference or starting point to craft a warm, professional, and natural opening line.
3) Follow the user's email prompt for the main offer, services, CTA, and sender name/signature. Do not assume or force generic company names or signatures like "Tarasaka" or "Mihir Shukla" unless specified in the user's prompt.
4) Do NOT sound robotic, generic, or obviously AI-generated. Avoid excessive compliments. Keep it concise, engaging, and professional.
5) Return ONLY valid JSON in this exact format:
{
  "subject": "A compelling, curiosity-driven subject line under 8 words (e.g., customized based on the prompt/recipient)",
  "body": "The email body text, using single/double line breaks for clean paragraph formatting."
}`

const FOLLOWUP_1_PROMPT = `You are an expert B2B sales copywriter. Write a follow-up email (sequence 1 - sent 3 days after initial email) based on the original email prompt context.
The email must:
- Sound human-written, not AI
- Reference the previous email naturally without repeating it
- Still feel personalized using the LinkedIn background
- Be concise (under 100 words)
- Offer a new angle or piece of value aligned with the original prompt
- End with a soft call to action
- End with a suitable signature based on the original email prompt context
Do NOT use phrases like "I hope this email finds you well" or "I came across your profile".
Return ONLY valid JSON: { "subject": "...", "body": "..." }`

const FOLLOWUP_2_PROMPT = `You are an expert B2B sales copywriter. Write a follow-up email (sequence 2 - sent 3 days after previous follow-up) based on the original email prompt context.
The email must:
- Sound human-written, not AI
- Be shorter and more direct than the first follow-up
- Acknowledge the lack of reply conversationally
- Reference something specific from their background
- Keep it under 80 words
- End with a clear, low-pressure CTA
- End with a suitable signature based on the original email prompt context
Do NOT use AI-sounding phrases.
Return ONLY valid JSON: { "subject": "...", "body": "..." }`

const FOLLOWUP_3_PROMPT = `You are an expert B2B sales copywriter. Write a follow-up email (sequence 3 - sent 3 days after previous follow-up) based on the original email prompt context.
The email must:
- Sound human-written, not AI
- Be brief and direct (under 60 words)
- Be slightly more urgent but still polite
- Focus on one key point aligned with the original email prompt context
- End with a simple CTA
- End with a suitable signature based on the original email prompt context
Do NOT sound robotic or templated.
Return ONLY valid JSON: { "subject": "...", "body": "..." }`

const CLOSEUP_PROMPT = `You are an expert B2B sales copywriter. Write a polite closing email (final sequence - sent 5 days after last follow-up) based on the original email prompt context.
The email must:
- Sound like a genuine human signing off
- Acknowledge they may not be interested right now
- Thank them for their time
- Leave the door open for future contact
- Be warm and gracious (under 60 words)
- End with a suitable signature based on the original email prompt context
Do NOT sound pushy or desperate.
Return ONLY valid JSON: { "subject": "...", "body": "..." }`

export async function summarizeLinkedIn(linkedinUrl, name, linkedinData = '') {
  let userPrompt = `LinkedIn URL: ${linkedinUrl || 'Not provided'}
Person's Name: ${name || 'Unknown'}`

  if (linkedinData) {
    userPrompt += `\nRaw LinkedIn Profile Data:\n${linkedinData}`
  }

  userPrompt += `\n\nBased on this information, infer or analyze their professional background — job title, seniority, industry, company focus, and likely business challenges related to digital visibility, growth, and operations. Return ONLY valid JSON in the exact format specified in the system prompt.`

  try {
    const content = await callAI(LINKEDIN_SUMMARY_PROMPT, userPrompt, 512)
    const parsed = parseAIJsonResponse(content)
    return {
      company: parsed.company || null,
      industry_trend: parsed.industry_trend || '',
      professional_background: parsed.professional_background || `${name} - Professional at ${linkedinUrl || 'unknown company'}`,
      business_challenges: parsed.business_challenges || '',
      similar_company: parsed.similar_company || null,
      personalized_opening: parsed.personalized_opening || `Hello ${name || 'there'}`
    }
  } catch (error) {
    console.error('LinkedIn summarization error:', error.message)
    return {
      company: null,
      industry_trend: '',
      professional_background: `${name} - Professional at ${linkedinUrl || 'unknown company'}`,
      business_challenges: '',
      similar_company: null,
      personalized_opening: `Hello ${name || 'there'}`
    }
  }
}

export async function generatePersonalizedEmail(leadData, linkedinSummary, campaign) {
  const userPrompt = `User's Email Prompt (Writing Instructions & Offer):
${campaign.master_prompt}

Recipient Lead Information:
- Name: ${leadData.first_name || ''} ${leadData.last_name || ''}
- Company: ${leadData.company || 'Not provided'}
- Website: ${leadData.website || 'Not provided'}
- Job Title: ${leadData.title || 'Not provided'}
- Email: ${leadData.email}
- LinkedIn Profile URL: ${leadData.linkedin_url || 'Not provided'}
- Extra Notes: ${leadData.notes || 'None'}

Recipient's LinkedIn Profile Analysis:
- Company: ${linkedinSummary.company || 'Not detected'}
- Industry Trend/Focus: ${linkedinSummary.industry_trend || 'Not detected'}
- Professional Background: ${linkedinSummary.professional_background || 'Not analyzed'}
- Business Challenges: ${linkedinSummary.business_challenges || 'Not analyzed'}
- Similar Company for Reference: ${linkedinSummary.similar_company || 'Not identified'}
- Personalized Opening: ${linkedinSummary.personalized_opening || ''}

Write a personalized cold email that merges the recipient's LinkedIn background with the user's email prompt instructions.
Return ONLY valid JSON in this exact format:
{
  "subject": "...",
  "body": "..."
}`

  try {
    const content = await callAI(EMAIL_SYSTEM_PROMPT, userPrompt, 2048)
    const parsed = parseAIJsonResponse(content)
    return {
      subject: parsed.subject || `Quick question for ${leadData.first_name || ''}`,
      body: parsed.body || 'No body',
    }
  } catch (error) {
    console.log('AI not available or disabled, using manual template:', error.message)
    const rawSubject = campaign?.subject_template || campaign?.name || `Quick question for [f_name]`
    const rawBody = campaign?.body_template || campaign?.master_prompt || `Hi [f_name],\n\nHope you are doing well.`
    return {
      subject: replaceLeadPlaceholders(rawSubject, leadData),
      body: replaceLeadPlaceholders(rawBody, leadData),
    }
  }
}

export async function generateFollowupEmail(leadData, linkedinSummary, campaign, sequence) {
  let systemPrompt
  const sequenceLabels = {
    2: 'Follow-up 1 (3 days after main email)',
    3: 'Follow-up 2 (3 days after Follow-up 1)',
    4: 'Follow-up 3 (3 days after Follow-up 2)',
    5: 'Close-up (5 days after Follow-up 3)',
  }

  switch (sequence) {
    case 2: systemPrompt = FOLLOWUP_1_PROMPT; break
    case 3: systemPrompt = FOLLOWUP_2_PROMPT; break
    case 4: systemPrompt = FOLLOWUP_3_PROMPT; break
    case 5: systemPrompt = CLOSEUP_PROMPT; break
    default: systemPrompt = FOLLOWUP_1_PROMPT; break
  }

  const userPrompt = `Email Template (original context):
${campaign.master_prompt}

Lead Information:
- Name: ${leadData.first_name || ''} ${leadData.last_name || ''}
- Email: ${leadData.email}
- LinkedIn Profile URL: ${leadData.linkedin_url || 'Not provided'}

LinkedIn Profile Analysis:
- Company: ${linkedinSummary.company || 'Not detected'}
- Industry Trend/Focus: ${linkedinSummary.industry_trend || 'Not detected'}
- Professional Background: ${linkedinSummary.professional_background}
- Business Challenges: ${linkedinSummary.business_challenges || 'Not analyzed'}
- Similar Company for Reference: ${linkedinSummary.similar_company || 'Not identified'}
- Personalized Opening: ${linkedinSummary.personalized_opening}

This is a ${sequenceLabels[sequence] || `Follow-up sequence ${sequence}`}.

Write a follow-up email for this lead. Return ONLY valid JSON in this exact format:
{
  "subject": "...",
  "body": "..."
}`

  try {
    const content = await callAI(systemPrompt, userPrompt, 1024)
    const parsed = parseAIJsonResponse(content)
    return {
      subject: parsed.subject || 'No subject',
      body: parsed.body || 'No body',
    }
  } catch (error) {
    console.error('Follow-up generation error:', error.message)
    throw error
  }
}

export async function generateEmail(leadData, enrichmentData, campaign, sequence = 1) {
  let keyData
  let provider

    keyData = await getActiveAI()
    if (!keyData) {
      throw new Error('No AI provider configured')
    }
    provider = PROVIDER_CONFIG[keyData.provider]

  if (!provider) {
    throw new Error(`Unknown provider: ${keyData.provider}`)
  }

  const isFollowUp = sequence > 1

   let enrichmentContext = ''
   let linkedinSummary = null
   if (enrichmentData && enrichmentData.linkedin_summary) {
     linkedinSummary = enrichmentData.linkedin_summary
   } else if (leadData.enrichment_data) {
     try {
       const parsed = typeof leadData.enrichment_data === 'string'
         ? JSON.parse(leadData.enrichment_data)
         : leadData.enrichment_data
       linkedinSummary = parsed?.linkedin_summary || null
     } catch (e) {}
   }

   let linkedinContext = ''
   if (linkedinSummary) {
     linkedinContext = `
  Recipient's LinkedIn Profile Analysis:
  - Company: ${linkedinSummary.company || 'Not detected'}
  - Industry Trend/Focus: ${linkedinSummary.industry_trend || 'Not detected'}
  - Professional Background: ${linkedinSummary.professional_background || 'Not analyzed'}
  - Business Challenges: ${linkedinSummary.business_challenges || 'Not analyzed'}
  - Similar Company for Reference: ${linkedinSummary.similar_company || 'Not identified'}
  - Personalized Opening: ${linkedinSummary.personalized_opening || ''}`
   }

   if (enrichmentData) {
     enrichmentContext = `
 Business Enrichment (from website scan):
 - Summary: ${enrichmentData.summary || 'Not available'}
 - Services: ${enrichmentData.services?.join(', ') || 'Not available'}
 - Location: ${enrichmentData.location || 'Not available'}
 - LinkedIn Profile: ${enrichmentData.linkedin_url || 'Not available'}
 - Issues found: ${enrichmentData.issues?.join(', ') || 'None detected'}`
   }

   const userPrompt = isFollowUp
     ? `Agency/Goal: ${campaign.goal}
 Tone: ${campaign.tone}

 Lead Info:
 - Name: ${leadData.first_name} ${leadData.last_name}
 - Title: ${leadData.title || 'Not provided'}
 - Company: ${leadData.company || 'Not provided'}
 - Email: ${leadData.email}
 - LinkedIn Profile: ${leadData.linkedin_url || 'Not provided'}
 ${enrichmentContext}
 ${linkedinContext}

 Campaign Context:
 ${campaign.master_prompt}

 This is a follow-up email (sequence ${sequence}). The prospect has not replied to the previous email.
 Write a fresh follow-up that provides new value or a different angle. Keep it under 80 words.

 Return ONLY valid JSON in this exact format:
 {
   "subject": "...",
   "body": "..."
 }`
     : `Agency/Goal: ${campaign.goal}
 Tone: ${campaign.tone}
 CTA Type: ${campaign.cta_type}

 Lead Info:
 - Name: ${leadData.first_name} ${leadData.last_name}
 - Title: ${leadData.title || 'Not provided'}
 - Company: ${leadData.company || 'Not provided'}
 - Website: ${leadData.website || 'Not provided'}
 - Email: ${leadData.email}
 - LinkedIn Profile: ${leadData.linkedin_url || 'Not provided'}
 - Notes: ${leadData.notes || 'None'}
 ${enrichmentContext}
 ${linkedinContext}

 Campaign Context:
 ${campaign.master_prompt}

 Write a cold outreach email. Keep it under 150 words and include a ${campaign.cta_type} CTA.
 Return ONLY valid JSON in this exact format:
 {
   "subject": "...",
   "body": "..."
 }`

  const systemPrompt = `You are an expert B2B cold email copywriter. Your job is to write highly personalised,
concise cold emails for agencies and sales teams. Each email must:
- Sound like it was written specifically for this person, not from a template
- If Recipient's LinkedIn Profile Analysis is provided, incorporate the recipient's LinkedIn background, trends, and challenges naturally to show the email is tailored specifically for them, using the personalized opening as a starting point.
- ALWAYs start the email by greeting the lead by their First Name
- ALWAYS try to naturally mention their Company Name to show the email is personalised for them
- Be under 150 words for the initial email
- Have ONE clear CTA (call-to-action)
- Open with a specific observation about THEIR business, not a compliment
- Never use phrases like "I hope this email finds you well", "My name is", "I wanted to reach out"
- Use plain text style — no bullet points, no bold, no headers in the email body
- The subject line should be curiosity-driven, under 8 words, no ALL CAPS

For follow-up emails (sequence > 1):
- Acknowledge the lack of reply without being passive-aggressive
- Offer a new angle, insight, or piece of value
- Keep it under 80 words
- Never say "Just following up" or "Bumping this up"

Always return ONLY valid JSON in the exact format requested.`

  const maxRetries = 3
  let lastError

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const backoff = Math.pow(2, attempt) * 1000
        await sleep(backoff)
      }

      let response

      if (keyData.provider === 'anthropic') {
        response = await axios.post(provider.apiUrl, {
          model: keyData.model,
          max_tokens: 1024,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }, {
          headers: {
            'x-api-key': keyData.api_key,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
        })

        const content = response.data.content[0].text
        const parsed = parseAIJsonResponse(content)
        return {
          subject: parsed.subject || 'No subject',
          body: parsed.body || 'No body',
        }
      } else {
        // OpenAI-compatible API (OpenAI, Groq, Grok, DeepSeek, Gemini)
        response = await axios.post(provider.apiUrl, {
          model: keyData.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 1024,
          temperature: 0.7,
        }, {
          headers: {
            'Authorization': `Bearer ${keyData.api_key}`,
            'Content-Type': 'application/json',
          },
        })

        const content = response.data.choices[0].message.content
        const parsed = parseAIJsonResponse(content)
        return {
          subject: parsed.subject || 'No subject',
          body: parsed.body || 'No body',
        }
      }
    } catch (error) {
      lastError = error
      if (error.response?.status === 429) {
        console.log(`Rate limited (attempt ${attempt + 1}/${maxRetries}), retrying...`)
        continue
      }
      throw error
    }
  }
  console.error('AI API error:', lastError.response?.data || lastError.message)
  throw lastError
}

export async function generateFollowupTemplate(campaign, sequence = 2) {
   const keyData = await getActiveAI()
   if (!keyData) throw new Error('No AI provider configured')
   const provider = PROVIDER_CONFIG[keyData.provider]
   if (!provider) throw new Error(`Unknown provider: ${keyData.provider}`)

   const systemPrompt = `You are an expert B2B cold email copywriter. Write a follow-up template for sequence ${sequence}.
   Keep it under 80 words. Focus on being professional and offering a new angle.
   Use [First Name] and [Company] as placeholders.
   Return ONLY valid JSON: { "subject": "...", "body": "..." }`

   const userPrompt = `Agency Goal: ${campaign.goal}
   Tone: ${campaign.tone}
   Master Prompt Context: ${campaign.master_prompt}`

   const maxRetries = 3
   let lastError

   for (let attempt = 0; attempt < maxRetries; attempt++) {
     try {
       if (attempt > 0) {
         const backoff = Math.pow(2, attempt) * 1000
         await sleep(backoff)
       }

       let response

       if (keyData.provider === 'anthropic') {
         response = await axios.post(provider.apiUrl, {
           model: keyData.model,
           max_tokens: 512,
           system: systemPrompt,
           messages: [{ role: 'user', content: userPrompt }],
         }, {
           headers: {
             'x-api-key': keyData.api_key,
             'anthropic-version': '2023-06-01',
             'Content-Type': 'application/json',
           },
         })

          const content = response.data.content[0].text
          return parseAIJsonResponse(content)
       } else {
         // OpenAI-compatible API (OpenAI, Groq, Grok, DeepSeek, Gemini)
         response = await axios.post(provider.apiUrl, {
           model: keyData.model,
           messages: [
             { role: 'system', content: systemPrompt },
             { role: 'user', content: userPrompt },
           ],
           max_tokens: 512,
           temperature: 0.7,
         }, {
           headers: {
             'Authorization': `Bearer ${keyData.api_key}`,
             'Content-Type': 'application/json',
           },
         })

          const content = response.data.choices[0].message.content
          return parseAIJsonResponse(content)
       }
     } catch (error) {
       lastError = error
       if (error.response?.status === 429) {
         console.log(`Rate limited on template gen (attempt ${attempt + 1}/${maxRetries}), retrying...`)
         continue
       }
       throw error
     }
   }
   console.error('AI Template Generation Error:', lastError.response?.data || lastError.message)
   throw lastError
 }

export async function generateEmailBatch(leads, enrichmentMap, campaign) {
  try {
    const results = []

    for (const lead of leads) {
      try {
        const leadId = (lead._id || lead.id).toString()
        const enrichment = enrichmentMap[leadId] || null
        const email = await generateEmail(lead, enrichment, campaign, 1)

        results.push({
          leadId: leadId,
          sequence: 1,
          success: true,
          subject: email.subject,
          body: email.body,
        })
      } catch (err) {
        results.push({
          leadId: (lead._id || lead.id).toString(),
          sequence: 1,
          success: false,
          error: err.message,
        })
      }
    }

    return results
  } catch (error) {
    console.error('Batch generation error:', error)
    throw error
  }
}

export default {
  generateEmail,
  generateEmailBatch,
  generatePersonalizedEmail,
  summarizeLinkedIn,
  generateFollowupEmail,
}
