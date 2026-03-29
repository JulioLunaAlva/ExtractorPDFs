// Local simulation of parseBanorte to find the 10 missing movements
const fs = require('fs');

const raw = fs.readFileSync('pdf_dumps/2669236_NACIONAL_20241031 (1).pdf.txt', 'utf16le');

// Reconstruct "lines" the same way extractLines does: group by Y coordinate.
// Since we only have the debug dump (sorted top-to-bottom), let's re-split by \r\n
const rawLines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

const MONTH_MAP = {
  'ENE':'01','FEB':'02','MAR':'03','ABR':'04','APR':'04',
  'MAY':'05','JUN':'06','JUL':'07','AGO':'08','AUG':'08',
  'SEP':'09','OCT':'10','NOV':'11','DIC':'12','DEC':'12',
};

const dateRE = /^(\d{1,2})\s{1,8}(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)\s{1,8}(.+)/i;
const amountRE = /\$?([\d,]+\.\d{2})/g;

const parseAmount = (s) => {
  const clean = s.replace(/[$,\s]/g,'');
  const v = parseFloat(clean);
  return isNaN(v) ? null : v;
};

const found = [];
for (let i = 0; i < rawLines.length; i++) {
  const line = rawLines[i];
  const m = line.match(dateRE);
  if (!m) continue;
  const [, dd, mon, rest] = m;
  const mm = MONTH_MAP[mon.toUpperCase()];
  if (!mm) continue;
  const isoDate = `2024-${mm}-${String(dd).padStart(2,'0')}`;
  
  // Skip page headers
  if (/^F\s+ec\s+ha|Detalle\s+de\s+tus|PAGINA\s+\d|D\s+e\s+p|Dep.+Intereses/i.test(rest)) continue;
  if (/SALDO ANTERIOR|SALDO INICIAL|BAL|PERIODO/i.test(rest) && !/\$/.test(rest)) continue;

  // Build 7-line block
  let fullText = rest;
  let j = i + 1;
  while (j < rawLines.length && j < i + 7) {
    const peek = rawLines[j];
    if (/^\d{1,2}\s{1,8}(?:ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)\s/i.test(peek)) break;
    fullText += '  ' + peek;
    j++;
  }

  const normalized = fullText.replace(/\s{2,}/g,' ').trim();
  const amounts = [...normalized.matchAll(amountRE)].map(a => parseAmount(a[1])).filter(v => v !== null && v > 0);
  
  if (amounts.length < 1) {
    console.log(`MISS (no amount) LINE ${i}: ${line.substring(0,80)}`);
    continue;
  }

  found.push({ date: isoDate, line: line.substring(0,80), amount: amounts[0] });
}

console.log(`\nTotal found: ${found.length}`);
found.forEach(f => console.log(`  ${f.date}  $${f.amount}  ${f.line}`));

// Also print ALL lines with OCT pattern to see what we're missing
console.log('\n--- ALL LINES MATCHING DATE PATTERN (for manual counting) ---');
rawLines.forEach((l, i) => {
  if (dateRE.test(l)) {
    console.log(`[${i}] ${l.substring(0,100)}`);
  }
});
