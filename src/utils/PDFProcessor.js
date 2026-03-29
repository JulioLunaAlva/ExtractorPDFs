import * as pdfjs from 'pdfjs-dist';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// ─────────────────────────────────────────────────────────────────────────────
// SHARED UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_MAP = {
  'ENE':  '01', 'JAN': '01',
  'FEB':  '02',
  'MAR':  '03',
  'ABR':  '04', 'APR': '04',
  'MAY':  '05',
  'JUN':  '06',
  'JUL':  '07',
  'AGO':  '08', 'AUG': '08',
  'SEP':  '09',
  'OCT':  '10',
  'NOV':  '11',
  'DIC':  '12', 'DEC': '12',
};

const parseAmount = (s) => {
  if (!s) return null;
  const clean = s.replace(/[$,\s]/g, '').trim();
  const val = parseFloat(clean);
  return isNaN(val) ? null : val;
};

const getCategory = (description) => {
  const d = description.toUpperCase();
  if (/SPEI|TRANSFERENCIA|TRASPASO|INTERBANCARIA|ABONO/.test(d)) return 'Transferencia';
  if (/RESTAURANTE|STARBUCKS|COMIDA|EATS|RAPPI|MCDONALD|KFC|CAFE|VIPS|TOKS/.test(d)) return 'Alimentos';
  if (/WALMART|CHEDRAUI|SORIANA|COSTCO|SAM.?S|7.ELEVEN|OXXO|SUPERAMA|HEB|LA COMER|TIENDA/.test(d)) return 'Súper / Tienda';
  if (/GASOLINERA|COMBUST|PEMEX|SHELL|GASOL|BP|REPSOL/.test(d)) return 'Gasolina';
  if (/UBER|DIDI|TAXI|PEAJE|ESTACIONAM|CAPUFE|METRO|AEROLINEA|VOLARIS|AEROMEXICO|VIVA|VUELO/.test(d)) return 'Transporte';
  if (/NETFLIX|SPOTIFY|AMAZON|APPLE|GOOGLE|SAMSUNG|MERCADOLIBRE|TEMU|SHEIN|PRIME|DISNEY|HBO/.test(d)) return 'Servicios / Shopping';
  if (/FARMACIA|HOSPITAL|AXXA|METLIFE|DOCTOR|SIMILARES|GUADALAJARA|MEDICO|CLINICA/.test(d)) return 'Salud';
  if (/RETIRO ATM|CAJERO|EFECTIVO|DISPOSICION|CHEQUE/.test(d)) return 'Efectivo';
  if (/NOMINA|SUELDO|QUINCENA|HONORARIOS|AGUINALDO/.test(d)) return 'Ingreso Mensual';
  if (/COMISION|IVA.*COMIS|CARGO/.test(d)) return 'Cargos Bancarios';
  return 'Otros';
};

const toISO = (day, monthCode, year) => {
  const mm = MONTH_MAP[monthCode.toUpperCase().substring(0, 3)];
  if (!mm) return null;
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
};

const extractContextYear = (text) => {
  const matches = text.match(/\b(20\d{2})\b/g) || [];
  const freq = {};
  matches.forEach(y => { freq[y] = (freq[y] || 0) + 1; });
  return Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] || String(new Date().getFullYear());
};


// ─────────────────────────────────────────────────────────────────────────────
// TEXT EXTRACTION: returns sorted lines per page, joined
// ─────────────────────────────────────────────────────────────────────────────
const extractLines = async (pdf) => {
  const allLines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    
    // Group items by Y coordinate to reconstruct visual rows
    const rowMap = {};
    content.items.forEach(item => {
      const y = Math.round(item.transform[5]);
      const x = Math.round(item.transform[4]);
      if (!rowMap[y]) rowMap[y] = [];
      rowMap[y].push({ x, str: item.str.trim() });
    });
    
    Object.entries(rowMap)
      .sort(([a], [b]) => Number(b) - Number(a)) // top to bottom
      .forEach(([, items]) => {
        const line = items.sort((a, b) => a.x - b.x).map(i => i.str).filter(Boolean).join('  ');
        if (line.trim()) allLines.push(line.trim());
      });
  }
  return allLines;
};


// ─────────────────────────────────────────────────────────────────────────────
// SANTANDER PARSER
// FORMAT: date (DD-MMM-YYYY) | folio | description (multi-line) | deposit | withdrawal | balance
// ─────────────────────────────────────────────────────────────────────────────
const parseSantander = (lines, year) => {
  const movements = [];
  const dateRE = /^(\d{2})-(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)-(\d{4})\s+(\d+)\s+(.+)/i;
  const amountRE = /\d{1,3}(?:,\d{3})*\.\d{2}/g;
  
  let inTable = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (/FECHA.*FOLIO.*DESCRIPCION/i.test(line) || /SALDO FINAL DEL PERIODO ANTERIOR/i.test(line)) {
      inTable = true;
      continue;
    }
    if (/DETALLE.*INVERSION|INVERSION CRECIENTE/i.test(line)) inTable = false;
    if (!inTable) continue;
    
    const m = line.match(dateRE);
    if (!m) continue;
    
    const [, dd, mon, , , rest] = m;
    const isoDate = toISO(dd, mon, year !== '0000' ? year : m[3]);
    if (!isoDate) continue;
    
    // Collect multi-line description until next transaction or blank
    let descLines = [rest];
    let j = i + 1;
    while (j < lines.length && !/^\d{2}-(?:ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)-\d{4}/i.test(lines[j])) {
      const next = lines[j];
      if (/^[A-Z][A-Z\s,]+$/.test(next) || /^(RECIBIDO|DE LA CUENTA|DEL CLIENTE|CLAVE|REF|CONCEPTO|RFC)/i.test(next)) {
        descLines.push(next);
      } else {
        break;
      }
      j++;
    }
    
    const fullText = descLines.join(' ');
    const amounts = fullText.match(amountRE) || [];
    
    if (amounts.length >= 2) {
      // Format: DEPOSIT  WITHDRAWAL  BALANCE — if deposit column has a value, it's income
      // We need to parse the two amounts before balance
      const [a1] = amounts;
      
      // Santander places deposit in left col, withdrawal in right col
      // If the amount appears before another, and the description mentions ABONO/RETIRO we detect type
      let amount = parseAmount(a1);
      let type;
      if (/ABONO|DEPOSITO|RECIBIDO/.test(fullText.toUpperCase())) {
        type = 'Ingreso';
      } else if (/CARGO|RETIRO|PAGO.*A|TRASPASO/i.test(fullText.toUpperCase())) {
        type = 'Egreso';
      } else {
        type = 'Egreso';
      }

      if (amount && amount > 0) {
        movements.push({
          date: isoDate,
          description: descLines[0].trim().substring(0, 100),
          amount,
          type,
          category: getCategory(descLines[0]),
        });
      }
    } else if (amounts.length === 1) {
      // Just one, still capture it
      const amount = parseAmount(amounts[0]);
      if (amount && amount > 0) {
        const type = /ABONO|DEPOSITO|SPEI RECIBIDO/i.test(fullText) ? 'Ingreso' : 'Egreso';
        movements.push({
          date: isoDate,
          description: descLines[0].trim().substring(0, 100),
          amount,
          type,
          category: getCategory(descLines[0]),
        });
      }
    }
  }
  
  return movements;
};


// ─────────────────────────────────────────────────────────────────────────────
// MIFEL PARSER
// FORMAT: DD/MM/YYYY | reference | description | withdrawals | deposits | balance
// ─────────────────────────────────────────────────────────────────────────────
const parseMifel = (lines) => {
  const movements = [];
  // Date line: "04/09/2024   SMF783662-2   TRANSFERENCIA SPEI PAGO 11,778.64   52,823.10"
  const dateRE = /^(\d{2}\/\d{2}\/\d{4})\s+(\S+)\s+(.+)/;
  const amountRE = /(\d{1,3}(?:,\d{3})*\.\d{2})/g;
  let inTable = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/Fecha\s+Referencia\s+Descripci/i.test(line) || /Saldo inicial/i.test(line)) { inTable = true; continue; }
    if (!inTable) continue;
    
    const m = line.match(dateRE);
    if (!m) continue;
    
    const [, rawDate, , rest] = m;
    const [dd, mm, yyyy] = rawDate.split('/');
    const isoDate = `${yyyy}-${mm}-${dd}`;
    
    const amounts = rest.match(amountRE) || [];
    const descClean = rest.replace(amountRE, '').trim();
    
    // Collect extra description lines
    let desc = descClean;
    let j = i + 1;
    while (j < lines.length && !/^\d{2}\/\d{2}\/\d{4}/.test(lines[j])) {
      const next = lines[j].trim();
      if (next && !/^Saldo/i.test(next) && amounts.length === 0) {
        desc += ' ' + next;
      }
      j++;
    }
    
    if (amounts.length >= 2) {
      // Two amounts: [withdrawal/deposit, saldo] or [deposit, saldo]
      // If description has 'RETIRO', it's an egreso
      const a1 = parseAmount(amounts[0]);
      const type = /RETIRO|CARGO|CFE|AGUA|PAGO/i.test(desc) ? 'Egreso' : 'Ingreso';
      if (a1 && a1 > 0) {
        movements.push({ date: isoDate, description: desc.substring(0, 100), amount: a1, type, category: getCategory(desc) });
      }
    } else if (amounts.length === 1) {
      const a1 = parseAmount(amounts[0]);
      const type = /RETIRO|CARGO/i.test(desc) ? 'Egreso' : 'Ingreso';
      if (a1 && a1 > 0) {
        movements.push({ date: isoDate, description: desc.substring(0, 100), amount: a1, type, category: getCategory(desc) });
      }
    }
  }
  return movements;
};


// ─────────────────────────────────────────────────────────────────────────────
// BANORTE (SCOTIABANK) PARSER
// FORMAT: "DD   OCT   CONCEPT   REF   DEPOSIT   RETIRO   SALDO"
// Items spaced heavily. Strategy: reassemble by finding "DD   MON   " anchors
// ─────────────────────────────────────────────────────────────────────────────
const parseBanorte = (lines, year) => {
  const movements = [];
  // Banorte/Scotiabank: date as "DD   OCT" or "08   OCT" — possibly 1-6 spaces between tokens
  const dateRE = /^(\d{1,2})\s{1,8}(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)\s{1,8}(.+)/i;
  const amountRE = /\$?([\d,]+\.\d{2})/g;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(dateRE);
    if (!m) continue;
    
    const [, dd, mon, rest] = m;
    const isoDate = toISO(Number(dd), mon, year);
    if (!isoDate) continue;
    
    // Skip noise lines (page headers, column headers)
    if (/^F\s+ec\s+ha|Detalle\s+de\s+tus|PAGINA\s+\d|D\s+e\s+p/i.test(rest)) continue;
    if (/SALDO ANTERIOR|SALDO INICIAL|BAL|PERIODO/i.test(rest) && !/\$/.test(rest)) continue;
    
    // Build full text block — peek ahead up to 6 lines looking for amounts
    let fullText = rest;
    let j = i + 1;
    while (j < lines.length && j < i + 7) {
      const peek = lines[j];
      // Stop if next line is a new transaction date
      if (/^\d{1,2}\s{1,8}(?:ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)\s/i.test(peek)) break;
      fullText += '  ' + peek;
      j++;
    }

    // Normalize multi-spaces to single space for consistent matching
    const normalized = fullText.replace(/\s{2,}/g, ' ').trim();
    
    const amounts = [...normalized.matchAll(amountRE)].map(a => parseAmount(a[1])).filter(v => v !== null && v > 0);
    if (amounts.length < 1) continue;
    
    const amount = amounts[0];
    
    // Type detection on normalized text
    const upper = normalized.toUpperCase();
    let type = 'Egreso';
    if (/TRANSF INTERBANCARIA SPEI \d|SPEI RECIBIDO|DEPOSITO EFECTIVO|DEPOSITO/.test(upper)) type = 'Ingreso';
    if (/TRASPASOS A OTROS|SEL TRANSF|SWEB|IVA.*COMIS|COMISION.*SPEI/.test(upper)) type = 'Egreso';
    
    // Description — everything before the first dollar amount
    const firstAmtIdx = normalized.search(/\$[\d,]+\.\d{2}/);
    let desc = (firstAmtIdx > 0 ? normalized.substring(0, firstAmtIdx) : normalized).trim();
    // Strip leading reference numbers (16+ chars)
    desc = desc.replace(/^\d{10,}\s+/, '').trim().substring(0, 100);
    if (!desc || desc.length < 2) continue;
    
    movements.push({ date: isoDate, description: desc, amount, type, category: getCategory(desc) });
  }
  return movements;
};



// ─────────────────────────────────────────────────────────────────────────────
// INBURSA PARSER
// FORMAT: lines: "OCT." then "DD  REF  DEPOSITO SPEI DESCRIPTION  AMOUNT  SALDO"
// The month is on the line after the amount OR the day is on the same row as the month
// ─────────────────────────────────────────────────────────────────────────────
const parseInbursa = (lines, year) => {
  const movements = [];
  
  // Strategy: find lines with TWO amounts + MONTH + description
  const inbursaTxRE = /(\d{1,3}(?:,\d{3})*\.\d{2})\s+(\d{1,3}(?:,\d{3})*\.\d{2})\s+(\d{6,12})\s+(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)\.?\s*(.+)?/i;
  
  let currentMonth = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Update current month context in case of page headers
    const monthOnlyM = line.match(/^(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)\.?\s*BALANCE/i);
    if (monthOnlyM) { currentMonth = monthOnlyM[1]; continue; }
    
    const m = line.match(inbursaTxRE);
    if (!m) continue;
    
    const [, txnAmt, , , mon, descRaw] = m;
    
    // Day is on the NEXT line (or same line after description)
    // look for day on the next line
    const nextLine = lines[i + 1] || '';
    const dayMatch = nextLine.match(/^(\d{1,2})\s+(.+)/);
    const day = dayMatch ? parseInt(dayMatch[1]) : null;
    
    // Also try to get month from the context or from the line itself
    const useMon = mon || currentMonth;
    if (!useMon) continue;
    const isoDate = day ? toISO(day, useMon, year) : `${year}-${MONTH_MAP[useMon.toUpperCase().substring(0,3)] || '01'}-01`;
    if (!isoDate) continue;
    
    const cleanAmt = parseAmount(txnAmt);
    if (!cleanAmt || cleanAmt <= 0) continue;
    
    // Description from rest of line + day line
    let desc = (descRaw || '').trim();
    if (dayMatch) {
      desc = dayMatch[2].trim() + (desc ? ' ' + desc : '');
      i++; // consume the day line
    }
    // Peek ahead for more description (bank name, CLABE, etc.)
    let j = i + 1;
    while (j < lines.length && j < i + 3) {
      const peek = lines[j].trim();
      if (!peek || peek.match(/^\d{1,2}(?:\s+|$)/) || peek.match(/^\d{1,3}(?:,\d{3})*\.\d{2}/)) break;
      if (/^(FECHA|REFERENCIA|ESTADO DE CUENTA|PAGINA)/i.test(peek)) break;
      desc += ' ' + peek;
      j++;
    }
    i = j - 1;
    
    // Type: CARGO = Egreso, ABONO/DEPOSITO/SPEI = Ingreso
    const upper = desc.toUpperCase() + line.toUpperCase();
    const type = /CARGO|CHEQUE|RETIRO/.test(upper) ? 'Egreso' : 'Ingreso';
    
    movements.push({ date: isoDate, description: desc.substring(0, 100), amount: cleanAmt, type, category: getCategory(desc) });
  }
  return movements;
};


// ─────────────────────────────────────────────────────────────────────────────
// MULTIVA PARSER
// FORMAT: DD/MM/YYYY | REFERENCIA | DESCRIPCION | RETIROS | DEPOSITOS | SALDO
// Identical structure to Mifel but detected separately
// ─────────────────────────────────────────────────────────────────────────────
const parseMultiva = (lines) => {
  // Multiva uses same tabular format as Mifel: DD/MM/YYYY date prefix
  return parseMifel(lines);
};


// ─────────────────────────────────────────────────────────────────────────────
// BBVA PARSER
// FORMAT: DD/MON | DD/MON | COD DESCRIPCION | REFERENCIA | CARGOS | ABONOS | SALDO
// Dates appear as "02/SEP" or "02/SEP" in first column
// ─────────────────────────────────────────────────────────────────────────────
const parseBBVA = (lines, year) => {
  const movements = [];
  // BBVA date: "02/SEP" or "02/09/2024" or "02/SEP/2024"
  const dateRE = /^(\d{2})[/](ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC|\d{2})/i;
  const fullDateRE = /^(\d{2})[/](\d{2})[/](\d{4})/;
  const amountRE = /(\d{1,3}(?:,\d{3})*\.\d{2})/g;
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/FECHA.*DESCRIPCI|OPER.*LIQ.*COD/i.test(line)) { inTable = true; continue; }
    if (!inTable) continue;

    // Try full date first: DD/MM/YYYY
    let isoDate = null;
    const fullM = line.match(fullDateRE);
    const shortM = line.match(dateRE);

    if (fullM) {
      isoDate = `${fullM[3]}-${fullM[2]}-${fullM[1]}`;
    } else if (shortM) {
      const monOrNum = shortM[2];
      if (MONTH_MAP[monOrNum.toUpperCase()]) {
        isoDate = toISO(shortM[1], monOrNum, year);
      } else {
        isoDate = `${year}-${monOrNum}-${shortM[1]}`;
      }
    }
    if (!isoDate) continue;

    // Collect full text for this transaction (up to next date)
    let fullText = line;
    let j = i + 1;
    while (j < lines.length && !lines[j].match(dateRE) && !lines[j].match(fullDateRE) && j < i + 5) {
      fullText += ' ' + lines[j];
      j++;
    }

    const amounts = [...fullText.matchAll(amountRE)].map(a => parseAmount(a[1])).filter(v => v !== null && v > 0);
    if (amounts.length < 1) continue;

    const amount = amounts[0];
    if (amount < 1) continue;

    // Type detection
    const upper = fullText.toUpperCase();
    let type = 'Egreso';
    if (/SPEI RECIBIDO|T20 SPEI RECIB|DEPOSITO|ABONO/.test(upper)) type = 'Ingreso';
    if (/SPEI ENVIADO|CARGO|RETIRO|COMISION|IVA/.test(upper)) type = 'Egreso';

    // Description: strip the date token and amounts
    const firstAmtI = fullText.search(amountRE);
    const desc = (fullText.substring(line.match(dateRE)?.[0]?.length || 0, firstAmtI > 0 ? firstAmtI : 80)).trim().substring(0, 100);

    if (desc.length > 2 && !/SALDO|PAGINA|DETALLE/i.test(desc)) {
      movements.push({ date: isoDate, description: desc, amount, type, category: getCategory(desc) });
    }
  }
  return movements;
};


// ─────────────────────────────────────────────────────────────────────────────
// BANK DETECTION
// ─────────────────────────────────────────────────────────────────────────────
const detectBank = (text) => {
  const t = text.substring(0, 5000).toUpperCase();
  if (/SANTANDER/.test(t)) return 'Santander';
  if (/ENLACE GLOBAL PM|ASCENSO PM/.test(t)) return 'Banorte';
  if (/SCOTIABANK|SCOTIAB/.test(t)) return 'Scotiabank';
  if (/MIFEL|GRUPO FINANCIERO MIFEL/.test(t)) return 'Mifel';
  if (/BANCO INBURSA|INBURSA/.test(t)) return 'Inbursa';
  if (/CASH MANAGEMENT|BBVA MEXICO|BBVA BANCOMER/.test(t)) return 'BBVA';
  if (/MULTIVA|CUENTA EJE/.test(t)) return 'Multiva';
  if (/BANORTE/.test(t)) return 'Banorte';
  if (/BBVA/.test(t)) return 'BBVA';
  return 'Desconocido';
};


// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────
export const extractMovementsFromPDF = async (file) => {
  console.log(`[Motor V5] Procesando: ${file.name}`);
  const arrayBuffer = await file.arrayBuffer();

  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  
  const lines = await extractLines(pdf);
  const fullText = lines.join('\n');
  
  const bank = detectBank(fullText);
  const year = extractContextYear(fullText);
  
  console.log(`[Motor V5] Banco: ${bank} | Año: ${year} | Líneas: ${lines.length}`);
  
  let movements = [];
  
  switch (bank) {
    case 'Santander':
      movements = parseSantander(lines, year);
      break;
    case 'Mifel':
      movements = parseMifel(lines);
      break;
    case 'Multiva':
      movements = parseMultiva(lines);
      break;
    case 'BBVA':
      movements = parseBBVA(lines, year);
      break;
    case 'Banorte':
    case 'Scotiabank':
      movements = parseBanorte(lines, year);
      break;
    case 'Inbursa':
      movements = parseInbursa(lines, year);
      break;
    default:
      // Generic fallback
      movements = parseSantander(lines, year);
      if (movements.length < 3) movements = parseBanorte(lines, year);
      if (movements.length < 3) movements = parseInbursa(lines, year);
  }
  
  // Attach bank metadata
  movements = movements.map(m => ({ ...m, bank }));
  
  // Sort chronologically ascending
  movements.sort((a, b) => a.date.localeCompare(b.date));
  
  console.log(`[Motor V5] ${movements.length} movimientos extraídos de ${file.name}`);
  return movements;
};
