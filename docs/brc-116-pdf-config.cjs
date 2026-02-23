const path = require('path');

module.exports = {
  stylesheet: [path.join(__dirname, 'pdf-style.css')],
  marked_options: {
    headerIds: false,
    smartypants: true,
  },
  pdf_options: {
    format: 'A4',
    margin: {
      top: '25mm',
      bottom: '25mm',
      left: '20mm',
      right: '20mm',
    },
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: `
      <div style="font-family: 'Inter', sans-serif; font-size: 8px; color: #888; margin-left: 20mm; width: 100%;">
        <span style="float: left;">BRC-116: Proof-of-Indexing Hash-to-Mint Tokens</span>
        <span style="float: right; margin-right: 20mm;">DRAFT — February 2026</span>
      </div>
    `,
    footerTemplate: `
      <div style="font-family: 'Inter', sans-serif; font-size: 8px; color: #888; width: 100%; text-align: center;">
        <span class="pageNumber"></span> / <span class="totalPages"></span>
      </div>
    `,
  },
};
