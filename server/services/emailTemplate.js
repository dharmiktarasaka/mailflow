export function escapeHtml(text) {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function bodyToHtml(text) {
  if (!text) return ''
  const escaped = escapeHtml(text)
  
  // Preserve exact spaces, tabs, and line breaks as typed by user
  const formatted = escaped
    .replace(/\r\n/g, '\n')
    .replace(/ {2,}/g, (match) => '&nbsp;'.repeat(match.length))
    .replace(/^ /gm, '&nbsp;')
    .replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;')
    .replace(/\n/g, '<br>')

  return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.65; color: #1e293b; white-space: pre-wrap; word-wrap: break-word;">${formatted}</div>`
}

export function buildEmailHtml(body, options = {}) {
  const {
    imageUrl = null,
    trackingPixel = '',
  } = options

  let contentHtml = bodyToHtml(body)

  if (imageUrl) {
    contentHtml += `<div style="margin-top: 20px; text-align: center;">
      <img src="${imageUrl}" alt="" style="max-width: 100%; height: auto; border-radius: 8px; display: block; margin: 0 auto;">
    </div>`
  }

  if (trackingPixel) {
    contentHtml += `<img src="${trackingPixel}" width="1" height="1" alt="" style="display: block; width: 1px; height: 1px; border: 0;" />`
  }

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Email</title>
  <!--[if mso]>
  <xml>
    <o:OfficeDocumentSettings>
      <o:AllowPNG/>
      <o:PixelsPerInch>96</o:PixelsPerInch>
    </o:OfficeDocumentSettings>
  </xml>
  <![endif]-->
  <style type="text/css">
    body, table, td, p, a, li, blockquote {
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    table, td {
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      -ms-interpolation-mode: bicubic;
      border: 0;
      height: auto;
      line-height: 100%;
      outline: none;
      text-decoration: none;
    }
    @media only screen and (max-width: 620px) {
      .email-wrapper { width: 100% !important; }
      .email-container { width: 100% !important; }
      .content-cell { padding: 24px 16px !important; }
    }
    @media only screen and (max-width: 480px) {
      .content-cell { padding: 20px 14px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; background-color: #f8fafc;" width="100%">
    <tr>
      <td align="center" style="padding: 28px 12px;">
        <!--[if mso]>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width: 600px;"><tr><td>
        <![endif]-->
        <table role="presentation" class="email-wrapper" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%;" width="600" align="center">
          <tr>
            <td class="content-cell" style="padding: 36px 32px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);">
              ${contentHtml}
            </td>
          </tr>
        </table>
        <!--[if mso]>
        </td></tr></table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`
}
