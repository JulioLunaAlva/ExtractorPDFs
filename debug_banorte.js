// Simulate the EXACT same extractLines + parseBanorte logic run in the browser
// to find out which of the 44 movements are being missed
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';

const MONTH_MAP = {
  'ENE':'01','FEB':'02','MAR':'03','ABR':'04','MAY':'05','JUN':'06',
  'JUL':'07','AGO':'08','SEP':'09','OCT':'10','NOV':'11','DIC':'12',
};

const parseAmount = (s) => {
  const clean = s.replace(/[$,\s]/g,'').trim();
  const v = parseFloat(clean);
  return isNaN(v) ? null : v;
};

const toISO = (day, monthCode, year) => {
  const mm = MONTH_MAP[monthCode.toUpperCase().substring(0, 3)];
  if (!mm) return null;
  return `${year}-${mm}-${String(day).padStart(2,'0')}`;
};

async function debugPDF(path) {
  const data = new Uint8Array(fs.readFileSync(path));
  const pdf = await pdfjs.getDocument({ data }).promise;
  
  const allLines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    
    const rowMap = {};
    content.items.forEach(item => {
      const y = Math.round(item.transform[5]);
      const x = Math.round(item.transform[4]);
      if (!rowMap[y]) rowMap[y] = [];
      rowMap[y].push({ x, str: item.str.trim() });
    });
    
    Object.entries(rowMap)
      .sort(([a], [b]) => Number(b) - Number(a))
      .forEach(([, items]) => {
        const line = items.sort((a, b) => a.x - b.x).map(i => i.str).filter(Boolean).join('  ');
        if (line.trim()) allLines.push(line.trim());
      });
  }

  console.log(`Total lines extracted: ${allLines.length}`);
  
  // Simulate parseBanorte
  const dateRE = /^(\d{1,2})\s{1,8}(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)\s{1,8}(.+)/i;
  const amountRE = /\$?([\d,]+\.\d{2})/g;
  const found = [];
  const missed = [];

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    const m = line.match(dateRE);
    if (!m) continue;

    const [, dd, mon, rest] = m;
    const isoDate = toISO(Number(dd), mon, '2024');
    if (!isoDate) continue;

    if (/^F\s+ec\s+ha|Detalle\s+de\s+tus|PAGINA\s+\d|D\s+e\s+p/i.test(rest)) {
      console.log(`SKIP (header): ${line.substring(0,80)}`);
      continue;
    }
    if (/SALDO ANTERIOR|SALDO INICIAL|BAL|PERIODO/i.test(rest) && !/\$/.test(rest)) {
      console.log(`SKIP (noise): ${line.substring(0,80)}`);
      continue;
    }

    let fullText = rest;
    let j = i + 1;
    while (j < allLines.length && j < i + 7) {
      const peek = allLines[j];
      if (/^\d{1,2}\s{1,8}(?:ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)\s/i.test(peek)) break;
      fullText += '  ' + peek;
      j++;
    }

    const normalized = fullText.replace(/\s{2,}/g, ' ').trim();
    const amounts = [...normalized.matchAll(amountRE)].map(a => parseAmount(a[1])).filter(v => v !== null && v > 0);
    
    if (amounts.length < 1) {
      missed.push({ line: line.substring(0, 100), reason: 'no amount found', normalized: normalized.substring(0,120) });
      continue;
    }

    found.push({ date: isoDate, amount: amounts[0], desc: normalized.substring(0,80) });
  }

  console.log(`\n=== FOUND: ${found.length} ===`);
  found.forEach(f => console.log(`  ${f.date}  $${f.amount}  ${f.desc}`));
  
  console.log(`\n=== MISSED (${missed.length}) ===`);
  missed.forEach(m => console.log(`  MISS [${m.reason}]: ${m.line}`));
  
  // Also dump ALL date-line matches so we can count manually
  console.log(`\n=== ALL DATE-PATTERN LINES ===`);
  allLines.forEach((l, i) => {
    if (dateRE.test(l)) console.log(`[${i}] ${l.substring(0,100)}`);
  });
}

const path = process.argv[2] || 'C:\\Users\\jluna\\Downloads\\esos\\2669236_NACIONAL_20241031 (1).pdf';
debugPDF(path).catch(console.error);
