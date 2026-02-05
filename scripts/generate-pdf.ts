import puppeteer from 'puppeteer';
import { readFileSync } from 'fs';
import { join } from 'path';
import { marked } from 'marked';

const CSS = `
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 11pt;
  line-height: 1.5;
  color: #000;
  background: white;
  padding: 0.75in;
  max-width: 8.5in;
}

h1 {
  font-size: 24pt;
  font-weight: bold;
  margin-bottom: 6pt;
  margin-top: 0;
  page-break-after: avoid;
}

h2 {
  font-size: 16pt;
  font-weight: bold;
  margin-top: 24pt;
  margin-bottom: 12pt;
  page-break-after: avoid;
}

h3 {
  font-size: 13pt;
  font-weight: bold;
  margin-top: 18pt;
  margin-bottom: 9pt;
  page-break-after: avoid;
}

h4 {
  font-size: 12pt;
  font-weight: bold;
  margin-top: 12pt;
  margin-bottom: 6pt;
  page-break-after: avoid;
}

p {
  margin-bottom: 12pt;
  text-align: justify;
  orphans: 3;
  widows: 3;
}

/* Blockquote */
blockquote {
  font-style: italic;
  margin: 12pt 0 12pt 24pt;
}

blockquote p {
  text-align: left;
}

/* Code blocks */
pre {
  font-family: 'Courier New', Courier, monospace;
  font-size: 10pt;
  line-height: 1.4;
  margin: 12pt 0;
  padding: 6pt;
  border: 1pt solid #ccc;
  background: #f9f9f9;
  overflow-x: auto;
  page-break-inside: avoid;
  white-space: pre-wrap;
}

code {
  font-family: 'Courier New', Courier, monospace;
  font-size: 11pt;
}

pre code {
  background: none;
  padding: 0;
  font-size: 10pt;
}

/* Tables */
table {
  width: 100%;
  border-collapse: collapse;
  margin: 12pt 0;
  font-size: 11pt;
  page-break-inside: avoid;
}

th {
  text-align: left;
  font-weight: bold;
  padding: 6pt 8pt;
  border-bottom: 2pt solid #000;
}

td {
  padding: 6pt 8pt;
  border-bottom: 1pt solid #ccc;
  vertical-align: top;
}

/* Lists */
ul, ol {
  margin: 12pt 0;
  padding-left: 36pt;
}

li {
  margin-bottom: 6pt;
  orphans: 2;
  widows: 2;
}

/* Horizontal rule */
hr {
  border: none;
  border-top: 1pt solid #000;
  margin: 18pt 0;
}

/* Strong/Bold */
strong {
  font-weight: bold;
}

/* Links */
a {
  color: #000;
  text-decoration: underline;
}

/* Metadata */
.metadata {
  margin-bottom: 18pt;
  font-size: 11pt;
}

/* Page breaks */
@page {
  margin: 0.75in;
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
    displayHeaderFooter: false,
    margin: {
      top: '0.5in',
      right: '0.5in',
      bottom: '0.5in',
      left: '0.5in'
    }
  });

  console.log(`✅ PDF generated successfully: ${pdfPath}`);

  await browser.close();
  console.log('👋 Browser closed');
}

generatePDF().catch(console.error);
