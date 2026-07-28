import { chromium } from 'playwright'

const TIMEOUT = 10000

export async function enrichLead(email, website) {
  if (!website) {
    return null
  }

  try {
    const browser = await chromium.launch()
    const context = await browser.createBrowserContext()
    const page = await context.newPage()

    // Set smaller viewport to speed up loading
    await page.setViewportSize({ width: 1280, height: 720 })

    let url = website
    if (!url.startsWith('http')) {
      url = 'https://' + url
    }

    // Navigate with timeout
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT })

    // Extract data
    const pageContent = await page.content()
    const title = await page.title()

    // Extract text content
    const bodyText = await page.evaluate(() => {
      return document.body.innerText.substring(0, 5000) // First 5000 chars
    })

    // Check for issues
    const { issues, linkedInUrl } = await checkIssues(page, url, pageContent)

    // Extract services/offerings
    const services = extractServices(bodyText, pageContent)

    // Extract location
    const location = extractLocation(bodyText, pageContent)

    // Generate summary
    const summary = generateSummary(title, services, bodyText)

    await browser.close()

    return {
      businessName: title,
      services,
      location,
      issues,
      summary,
      linkedin_url: linkedInUrl || ''
    }
  } catch (error) {
    console.error('Enrichment error:', error.message)
    return null
  }
}

async function checkIssues(page, url, pageContent) {
   const issues = []

   // Check HTTPS
   if (!url.startsWith('https')) {
     issues.push('No HTTPS')
   }

   // Check for Google Maps
   if (!pageContent.includes('google.com/maps') && !pageContent.includes('google-map')) {
     issues.push('No Google Maps embed')
   }

   // Check copyright year
   const currentYear = new Date().getFullYear()
   const copyrightMatch = pageContent.match(/©\s*(\d{4})/)
   if (copyrightMatch && parseInt(copyrightMatch[1]) < currentYear - 1) {
     issues.push('Outdated copyright year')
   }

   // Check for phone number
   if (!/\+?\d{1,3}[-.\s]?\d{1,14}/.test(pageContent)) {
     issues.push('No phone number visible')
   }

   // Check for reviews/testimonials
   if (!pageContent.match(/review|testimonial|star|rating/i)) {
     issues.push('No testimonials/reviews section')
   }

   // Check page speed (basic)
   try {
     const metrics = await page.metrics()
     if (metrics.JSHeapUsedSize > 50000000) {
       // > 50MB
       issues.push('Page may be slow (high memory usage)')
     }
   } catch (e) {
     // Ignore metrics error
   }

   // Check content length
   const textLength = await page.evaluate(() => document.body.innerText.length)
   if (textLength < 300) {
     issues.push('Very thin content')
   }

   // Check for blog
   const hasRecognizableNav = pageContent.match(/blog|news|insights|resources/i)
   if (!hasRecognizableNav) {
     issues.push('No blog/resources section visible')
   }

   // Extract LinkedIn profile if available on the page
   const linkedInMatch = pageContent.match(/https?:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+\/?/i)
   let linkedInUrl = null
   if (linkedInMatch) {
     linkedInUrl = linkedInMatch[0]
   }

   return { issues, linkedInUrl }
 }

function extractServices(bodyText, pageContent) {
  const services = []
  const keywords = [
    'web design',
    'seo',
    'consulting',
    'marketing',
    'development',
    'hosting',
    'security',
    'analytics',
    'design',
    'branding',
    'social media',
    'email',
    'ecommerce',
    'mobile app',
  ]

  keywords.forEach(keyword => {
    if (pageContent.toLowerCase().includes(keyword)) {
      services.push(keyword.charAt(0).toUpperCase() + keyword.slice(1))
    }
  })

  return [...new Set(services)].slice(0, 8) // Max 8 unique services
}

function extractLocation(bodyText, pageContent) {
  const locationPatterns = [
    /located?\s+(?:in|at)\s+([^,.\n]+(?:,?\s*[^,.\n]+)?)/i,
    /headquarters?:?\s*([^,.\n]+(?:,?\s*[^,.\n]+)?)/i,
    /address:?\s*([^,.\n]+(?:,?\s*[^,.\n]+)?)/i,
  ]

  for (const pattern of locationPatterns) {
    const match = pageContent.match(pattern)
    if (match) {
      return match[1].trim().substring(0, 100)
    }
  }

  // Look for common location indicators in text
  const locationMatch = bodyText.match(/(?:New York|Los Angeles|Chicago|Houston|Phoenix|Philadelphia|San Antonio|San Diego|Dallas|Austin|Denver|Seattle|Portland|Boston|Miami|Atlanta|Minneapolis|Denver|Austin|Nashville|Memphis|Baltimore|Milwaukee|Albuquerque|Tucson|Sacramento|Long Beach|Kansas City|Mesa|Virginia Beach|Atlanta|New Orleans|Las Vegas|Cleveland|Plano|Saint Paul|Corpus Christi|Lexington|Chandler|Stockton)/i)

  return locationMatch ? locationMatch[0] : 'Not specified'
}

function generateSummary(title, services, bodyText) {
  if (!title && !services.length) {
    return 'Unable to determine business type'
  }

  const serviceList = services.slice(0, 3).join(', ')
  return `${title} offers ${serviceList || 'web services'}.`
}

export async function enrichLeadBatch(leads) {
  const enrichmentMap = {}

  for (const lead of leads) {
    if (lead.email_type === 'business' && lead.website) {
      try {
        const enrichment = await enrichLead(lead.email, lead.website)
        if (enrichment) {
          const leadId = (lead._id || lead.id).toString()
          enrichmentMap[leadId] = enrichment
        }
      } catch (err) {
        console.error(`Enrichment failed for ${lead.email}:`, err.message)
      }
    }
  }

  return enrichmentMap
}

export default {
  enrichLead,
  enrichLeadBatch,
}
