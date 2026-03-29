const fs = require('fs');

const files = [
  'pdf_dumps/000092748711011730 de Septiembre de 2024.pdf.txt',
  'pdf_dumps/00740812000104169077CH (2) SEPTIEMBRE 2024.pdf.txt',
  'pdf_dumps/65510301082-09112024.pdf.txt',
  'pdf_dumps/8001318971_20240430.pdf.txt',
];

files.forEach(f => {
  try {
    const txt = fs.readFileSync(f, 'utf16le').substring(0, 4000);
    console.log(`\n\n======= ${f} =======\n`);
    console.log(txt);
  } catch(e) { console.error(e.message); }
});
