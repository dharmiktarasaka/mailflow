import { utils } from 'xlsx'

/**
 * Lead processing and placeholder utility helpers
 */

/**
 * Detect column mappings from Excel headers and sample data
 */
export function detectColumns(headers, sampleRow = null, fullData = []) {
  const columnMap = {
    firstName: ['firstname', 'first_name', 'first name', 'name', 'first', 'f_name', 'fname', 'given_name', 'lead_name', 'lead name'],
    lastName: ['lastname', 'last_name', 'last name', 'last', 'surname', 'l_name', 'lname', 'family_name'],
    email: [
      'email', 'emailaddress', 'e-mail', 'email address', 'mail', 'email_address', 
      'contact email', 'e_mail', 'email_id', 'emailid', 'user email', 'mail id', 
      'mail_id', 'target email', 'emails', 'e-mail address', 'to', 'recipient', 'contact'
    ],
    company: ['company', 'companyname', 'company name', 'organization', 'company_name', 'company _name', 'comp_name', 'org', 'company_title'],
    website: ['website', 'url', 'domain', 'web', 'site', 'company website', 'web_url', 'website_url', 'link'],
    title: ['title', 'position', 'jobtitle', 'job title', 'role', 'designation', 'job_title'],
    notes: ['notes', 'description', 'note', 'details', 'comment', 'comments'],
    subject: ['subject of email', 'subjectofemail', 'email subject', 'subject line', 'subject'],
    message: ['message', 'content', 'body', 'emailcontent', 'mail content'],
    image: ['image', 'imageurl', 'attachment', 'photo', 'picture', 'img'],
    linkedinUrl: ['linkedin', 'linkedin url', 'linkedin profile', 'linkedinprofileurl', 'linkedin profile url', 'linkedin_url'],
    linkedinData: ['linkedin profile data', 'linkedinprofiledata', 'linkedin data', 'linkedin_data', 'profile data', 'profile_data', 'linkedin text', 'linkedin_text']
  }

  const detectedMap = {}

  // 1. Match variations against headers (exact or stripped of special characters)
  Object.entries(columnMap).forEach(([key, variations]) => {
    const found = headers.find(h => {
      if (!h) return false
      const hClean = h.toString().toLowerCase().replace(/[^a-z0-9]/g, '')
      return variations.some(v => hClean === v.toLowerCase().replace(/[^a-z0-9]/g, ''))
    })
    if (found) {
      detectedMap[key] = found
    }
  })

  // 2. Substring fallback for email in headers
  if (!detectedMap.email) {
    const emailHeader = headers.find(h => {
      if (!h) return false
      const hLower = h.toString().toLowerCase().trim()
      return hLower.includes('mail') || hLower.includes('email')
    })
    if (emailHeader) {
      detectedMap.email = emailHeader
    }
  }

  // 3. Scan rows for values matching email format
  if (!detectedMap.email && (sampleRow || (fullData && fullData.length > 0))) {
    const rowsToInspect = fullData && fullData.length > 0 ? fullData.slice(0, 20) : [sampleRow]
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    for (const h of headers) {
      if (!h) continue
      let emailMatchCount = 0
      for (const row of rowsToInspect) {
        if (!row) continue
        const val = (row[h] || '').toString().trim()
        if (emailRegex.test(val) || (val.includes('@') && val.includes('.'))) {
          emailMatchCount++
        }
      }
      if (emailMatchCount > 0) {
        detectedMap.email = h
        break
      }
    }
  }

  // 4. Guarantee detectedMap.email is ALWAYS set so upload never fails
  if (!detectedMap.email) {
    detectedMap.email = '__AUTO_GENERATED_EMAIL__'
  }

  return detectedMap
}

/**
 * Ensure each lead row has a valid email (uses detected column, finds `@` cell, or auto-generates)
 */
export function ensureLeadEmail(row, idx, detectedMap = {}) {
  if (detectedMap.email && detectedMap.email !== '__AUTO_GENERATED_EMAIL__' && row[detectedMap.email]) {
    const val = row[detectedMap.email].toString().trim().toLowerCase()
    if (val && val.includes('@')) return val
  }

  // Scan row values to see if any cell in row contains an email address
  for (const k of Object.keys(row)) {
    const val = (row[k] || '').toString().trim().toLowerCase()
    if (val && val.includes('@') && val.includes('.')) {
      return val
    }
  }

  // Auto-generate email based on first_name, last_name, company, website
  const fn = (detectedMap.firstName && row[detectedMap.firstName] ? row[detectedMap.firstName] : row.f_name || row.first_name || row.name || '').toString().toLowerCase().trim().replace(/[^a-z0-9]/g, '')
  const ln = (detectedMap.lastName && row[detectedMap.lastName] ? row[detectedMap.lastName] : row.l_name || row.last_name || '').toString().toLowerCase().trim().replace(/[^a-z0-9]/g, '')
  let comp = (detectedMap.company && row[detectedMap.company] ? row[detectedMap.company] : row.company_name || row.company || '').toString().toLowerCase().trim().replace(/[^a-z0-9]/g, '')
  let web = (detectedMap.website && row[detectedMap.website] ? row[detectedMap.website] : row.website || '').toString().toLowerCase().trim().replace(/[^a-z0-9]/g, '')

  if (web && web.includes('.')) {
    comp = web.replace(/^https?:\/\//, '').replace(/^www\./, '').split('.')[0].replace(/[^a-z0-9]/g, '')
  }

  const domain = comp ? `${comp}.com` : 'lead-mailflow.com'
  const prefix = fn ? (ln ? `${fn}.${ln}` : fn) : `lead_${idx + 1}`

  return `${prefix}@${domain}`
}

/**
 * Parse worksheet data intelligently, handling offset headers, title blocks, and column detection
 */
export function parseExcelSheetData(worksheet) {
  // 1. Try standard sheet_to_json
  let data = utils.sheet_to_json(worksheet)
  if (!data || !data.length) {
    return { data: [], headers: [], detected: {} }
  }

  let headers = Object.keys(data[0])
  let detected = detectColumns(headers, data[0], data)

  if (detected.email && detected.email !== '__AUTO_GENERATED_EMAIL__') {
    return { data, headers, detected }
  }

  // 2. Fallback: try raw array of arrays to handle title rows / offset headers
  const rawRows = utils.sheet_to_json(worksheet, { header: 1 })
  if (!rawRows || rawRows.length < 2) {
    return { data, headers, detected }
  }

  let headerRowIndex = -1

  for (let r = 0; r < Math.min(rawRows.length, 10); r++) {
    const row = rawRows[r]
    if (!Array.isArray(row)) continue

    for (let c = 0; c < row.length; c++) {
      const cellVal = (row[c] || '').toString().trim()
      const cellLower = cellVal.toLowerCase()

      if (cellLower.includes('mail') || cellLower.includes('email') || cellVal === 'f_name' || cellVal === 'L_name') {
        headerRowIndex = r
        break
      }
    }
    if (headerRowIndex !== -1) break
  }

  if (headerRowIndex !== -1) {
    const customHeaders = rawRows[headerRowIndex].map(h => (h || '').toString().trim())
    const customData = []

    for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
      const rowArr = rawRows[r]
      if (!Array.isArray(rowArr) || !rowArr.length) continue
      const rowObj = {}
      customHeaders.forEach((h, idx) => {
        if (h && rowArr[idx] !== undefined && rowArr[idx] !== null) {
          rowObj[h] = rowArr[idx]
        }
      })
      if (Object.keys(rowObj).length > 0) {
        customData.push(rowObj)
      }
    }

    if (customData.length > 0) {
      headers = customHeaders
      detected = detectColumns(headers, customData[0], customData)
      data = customData
    }
  }

  return { data, headers, detected }
}

/**
 * Replace placeholders in subject/body template with actual lead attributes & custom excel fields
 */
export function replaceLeadPlaceholders(text, lead) {
  if (!text || typeof text !== 'string') return text || ''
  if (!lead) return text

  // Field values mapping
  const fieldMap = {
    'first name': lead.first_name || '',
    'firstname': lead.first_name || '',
    'first_name': lead.first_name || '',
    'f_name': lead.first_name || '',
    'fname': lead.first_name || '',
    'last name': lead.last_name || '',
    'lastname': lead.last_name || '',
    'last_name': lead.last_name || '',
    'l_name': lead.last_name || '',
    'lname': lead.last_name || '',
    'company': lead.company || '',
    'companyname': lead.company || '',
    'company_name': lead.company || '',
    'company _name': lead.company || '',
    'website': lead.website || '',
    'domain': lead.website || '',
    'url': lead.website || '',
    'title': lead.title || '',
    'role': lead.title || '',
    'email': lead.email || '',
    'notes': lead.notes || '',
  }

  // Populate custom raw row fields from enrichment_data
  if (lead.enrichment_data) {
    try {
      const enrichment = typeof lead.enrichment_data === 'string' ? JSON.parse(lead.enrichment_data) : lead.enrichment_data
      if (enrichment?.raw_row) {
        Object.entries(enrichment.raw_row).forEach(([colKey, colVal]) => {
          if (colVal !== undefined && colVal !== null) {
            const valStr = colVal.toString().trim()
            fieldMap[colKey] = valStr
            fieldMap[colKey.toLowerCase()] = valStr
            fieldMap[colKey.toLowerCase().replace(/[^a-z0-9]/g, '')] = valStr
          }
        })
      }
    } catch (e) {}
  }

  // Replace [placeholder] or {{placeholder}}
  return text.replace(/(\[|\{\{)(.*?)(\]|\}\})/g, (match, openTag, key, closeTag) => {
    const rawKey = key.trim()
    const cleanKey = rawKey.toLowerCase().replace(/[^a-z0-9]/g, '')

    if (fieldMap[rawKey] !== undefined && fieldMap[rawKey] !== '') return fieldMap[rawKey]
    if (fieldMap[rawKey.toLowerCase()] !== undefined && fieldMap[rawKey.toLowerCase()] !== '') return fieldMap[rawKey.toLowerCase()]
    if (fieldMap[cleanKey] !== undefined && fieldMap[cleanKey] !== '') return fieldMap[cleanKey]

    return match
  })
}
