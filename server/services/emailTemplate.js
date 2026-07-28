export function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function bodyToHtml(text) {
  const escaped = escapeHtml(text)
  const paragraphs = escaped.split(/\n{2,}/)
  return paragraphs
    .map(p => {
      const withBreaks = p.replace(/\n/g, '<br>').trim()
      if (!withBreaks) return ''
      return `<p style="margin: 0 0 16px 0; line-height: 1.7; font-size: 14px; color: #333333;">${withBreaks}</p>`
    })
    .filter(p => p)
    .join('')
}

export function buildEmailHtml(body, options = {}) {
  const {
    imageUrl = null,
    trackingPixel = '',
  } = options

  let contentHtml = bodyToHtml(body)

  if (imageUrl) {
    contentHtml += `<p style="margin: 0 0 16px 0; text-align: center;">
      <img src="${imageUrl}" alt="" style="max-width: 100%; height: auto; border-radius: 8px; display: block;">
    </p>`
  }

  if (trackingPixel) {
    contentHtml += `<img src="${trackingPixel}" width="1" height="1" alt="" style="display: block; width: 1px; height: 1px;">`
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
      .content-cell { padding: 20px 12px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f6f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; background-color: #f4f6f9;" width="100%">
    <tr>
      <td align="center" style="padding: 24px 10px;">
        <!--[if mso]>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width: 600px;"><tr><td>
        <![endif]-->
        <table role="presentation" class="email-wrapper" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%;" width="600" align="center">
          <tr>
            <td class="content-cell" style="padding: 32px 28px; background-color: #ffffff; border-radius: 8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
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
