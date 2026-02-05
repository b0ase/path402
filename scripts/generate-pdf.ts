import puppeteer from 'puppeteer';
import { readFileSync } from 'fs';
import { join } from 'path';
import { marked } from 'marked';

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 11pt;
  line-height: 1.6;
  color: #18181b;
  background: white;
  padding: 48pt 60pt;
}

h1, h2, h3, h4, h5, h6 {
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: -0.02em;
  line-height: 1.1;
  margin-top: 0;
  page-break-after: avoid;
}

h1 {
  font-size: 32pt;
  margin-bottom: 12pt;
  border-bottom: 2pt solid #18181b;
  padding-bottom: 12pt;
}

h2 {
  font-size: 18pt;
  margin-top: 36pt;
  margin-bottom: 12pt;
  border-bottom: 1pt solid #e4e4e7;
  padding-bottom: 8pt;
  page-break-before: auto;
}

h3 {
  font-size: 10pt;
  margin-top: 18pt;
  margin-bottom: 8pt;
  color: #71717a;
  font-weight: 700;
  letter-spacing: 0.05em;
}

h4 {
  font-size: 9pt;
  margin-top: 12pt;
  margin-bottom: 6pt;
  color: #71717a;
  font-weight: 700;
  letter-spacing: 0.05em;
}

p {
  margin-bottom: 12pt;
  orphans: 3;
  widows: 3;
}

/* Metadata box */
.metadata {
  display: flex;
  gap: 24pt;
  font-family: 'JetBrains Mono', monospace;
  font-size: 9pt;
  color: #71717a;
  margin-bottom: 24pt;
  padding-bottom: 12pt;
  border-bottom: 1pt solid #e4e4e7;
}

/* Blockquote */
blockquote {
  font-size: 13pt;
  font-weight: 500;
  color: #3f3f46;
  margin: 18pt 0;
  padding-left: 18pt;
  border-left: 3pt solid #18181b;
}

/* Code blocks */
pre {
  background: #fafafa;
  border: 1pt solid #e4e4e7;
  padding: 12pt;
  margin: 12pt 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 8.5pt;
  line-height: 1.5;
  overflow-x: auto;
  page-break-inside: avoid;
}

code {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9pt;
  background: #f4f4f5;
  padding: 2pt 4pt;
  border-radius: 0;
}

pre code {
  background: none;
  padding: 0;
}

/* Tables */
table {
  width: 100%;
  border-collapse: collapse;
  margin: 18pt 0;
  font-size: 9pt;
  page-break-inside: avoid;
}

thead {
  background: #fafafa;
  border-bottom: 2pt solid #e4e4e7;
}

th {
  text-align: left;
  font-weight: 700;
  text-transform: uppercase;
  font-size: 8pt;
  letter-spacing: 0.05em;
  padding: 8pt 12pt;
  color: #71717a;
}

td {
  padding: 8pt 12pt;
  border-bottom: 1pt solid #f4f4f5;
}

tbody tr:nth-child(even) {
  background: #fafafa;
}

/* Lists */
ul, ol {
  margin: 12pt 0;
  padding-left: 24pt;
}

li {
  margin-bottom: 6pt;
  orphans: 2;
  widows: 2;
}

/* Horizontal rule */
hr {
  border: none;
  border-top: 1pt solid #e4e4e7;
  margin: 24pt 0;
}

/* Strong/Bold */
strong {
  font-weight: 700;
  color: #18181b;
}

/* Links */
a {
  color: #18181b;
  text-decoration: none;
  border-bottom: 1pt solid #e4e4e7;
}

/* Highlighted boxes */
.box {
  background: #fafafa;
  border: 1pt solid #e4e4e7;
  padding: 12pt;
  margin: 12pt 0;
  page-break-inside: avoid;
}

.warning {
  background: #fffbeb;
  border-left: 3pt solid #f59e0b;
  padding: 12pt;
  margin: 12pt 0;
  page-break-inside: avoid;
}

.warning h3 {
  color: #b45309;
  margin-top: 0;
}

.warning p {
  color: #78350f;
  margin-bottom: 6pt;
}

.warning p:last-child {
  margin-bottom: 0;
}

/* Page breaks */
.page-break {
  page-break-after: always;
}

/* Header/Footer for print */
@page {
  margin: 48pt 60pt;
  @top-right {
    content: "$402 Protocol Specification v3.0.0";
    font-family: 'JetBrains Mono', monospace;
    font-size: 8pt;
    color: #71717a;
  }
  @bottom-right {
    content: counter(page);
    font-family: 'JetBrains Mono', monospace;
    font-size: 8pt;
    color: #71717a;
  }
}

/* Ensure proper page breaks */
section {
  page-break-inside: avoid;
}
`;

async function generatePDF() {
    console.log('🚀 Starting PDF generation...');

    // Read markdown file
    const mdPath = join(process.cwd(), 'docs/PROTOCOL_SPEC.md');
    const mdContent = readFileSync(mdPath, 'utf-8');

    console.log('📄 Markdown file loaded');

    // Convert markdown to HTML
    let html = await marked(mdContent);

    // Post-process HTML to add special styling
    html = html
        // Wrap version and status in metadata div
        .replace(
            /(<blockquote>\s*<p>.*?<\/p>\s*<\/blockquote>)\s*(<p><strong>Version<\/strong>:.*?<\/p>\s*<p><strong>Status<\/strong>:.*?<\/p>\s*<p><strong>Reference Implementation<\/strong>:.*?<\/p>)/s,
            (match, quote, meta) => {
                const version = meta.match(/<strong>Version<\/strong>:\s*(.*?)<\/p>/)?.[1] || '';
                const status = meta.match(/<strong>Status<\/strong>:\s*(.*?)<\/p>/)?.[1] || '';
                return `${quote}<div class="metadata"><span>Version: ${version}</span><span>Status: ${status}</span></div>`;
            }
        )
        // Add warning class to legal compliance section
        .replace(
            /<h3>Corporate Register vs Token Ownership<\/h3>\s*(<p>.*?<\/p>\s*<p>.*?<\/p>)/s,
            '<div class="warning"><h3>Corporate Register vs Token Ownership</h3>$1</div>'
        );

    const fullHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>$402 Protocol Specification</title>
  <style>${CSS}</style>
</head>
<body>
  ${html}
</body>
</html>
`;

    console.log('✨ HTML generated');

    // Launch Puppeteer
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    console.log('🌐 Browser launched');

    const page = await browser.newPage();
    await page.setContent(fullHTML, { waitUntil: 'networkidle0' });

    console.log('📝 Content loaded in browser');

    // Generate PDF
    const pdfPath = join(process.cwd(), '402_protocol_spec.pdf');
    await page.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: `
      <div style="width: 100%; font-size: 8pt; font-family: 'JetBrains Mono', monospace; color: #71717a; padding: 0 60pt; display: flex; justify-content: space-between;">
        <span style="flex: 1;">$402 Protocol Specification v3.0.0</span>
        <span class="pageNumber"></span>
      </div>
    `,
        margin: {
            top: '0.67in',
            right: '0.83in',
            bottom: '0.67in',
            left: '0.83in'
        }
    });

    console.log(`✅ PDF generated successfully: ${pdfPath}`);

    await browser.close();
    console.log('👋 Browser closed');
}

generatePDF().catch(console.error);
