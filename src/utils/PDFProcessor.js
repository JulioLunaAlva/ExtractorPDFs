import * as pdfjs from 'pdfjs-dist';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// --- V4 CORE UTILS ---

const parseAmount = (amountStr) => {
    if (!amountStr) return 0.0;
    let cleanStr = amountStr.replace(/[$\s,]/g, '').trim();
    if (cleanStr.startsWith('(') && cleanStr.endsWith(')')) return -parseFloat(cleanStr.slice(1, -1));
    return parseFloat(cleanStr) || 0.0;
};

const getCategory = (description) => {
    const desc = description.toUpperCase();
    if (/SPEI|TRANSFERENCIA|TRASPASO|PAGO RECIBIDO|INTERBANCARI/.test(desc)) return "Transferencia";
    if (/RESTAURANTE|VIPS|TOKS|STARBUCKS|COMIDA|UBER EATS|RAPPI|MC DONALDS|KFC|CAFE/.test(desc)) return "Alimentos";
    if (/SUPER|WALMART|CHEDRAUI|SORIANA|COSTCO|SAM'S|7-ELEVEN|OXXO|SUPERAMA|HEB|LA COMER|MARKET|CASH/.test(desc)) return "Súper / Tienda";
    if (/GASOLINERA|COMBUSTIBLE|PEMEX|SHELL|GASOL|BP|REPSOL|GULF/.test(desc)) return "Gasolina";
    if (/UBER|DIDI|TAXI|PEAJE|ESTACIONAMIENTO|CAPUFE|METRO|CARGO TAG|AEROLINEA|VOLLARIS|AEROMEXICO|VIVA|VUELO/.test(desc)) return "Transporte";
    if (/NETFLIX|SPOTIFY|AMAZON|APPLE|GOOGLE|SAMSUNG|MERCADO LIBRE|TEMU|SHEIN|PRIME|DISNEY|HBO|XBOX|PLAYSTATION/.test(desc)) return "Servicios / Shopping";
    if (/FARMACIA|HOSPITAL|AXXA|METLIFE|DOCTOR|SIMILARES|GUADALAJARA|MEDICO|CLINICA/.test(desc)) return "Salud";
    if (/RETIRO ATM|RETIRO CAJERO|EFECTIVO|DISPOSICION/.test(desc)) return "Efectivo";
    if (/NOMINA|PAGO DE SUELDO|SUELDO|QUINCENA|HONORARIOS|AGUINALDO/.test(desc)) return "Ingreso Mensual";
    if (/SEGURO|COMISION|MENSUALIDAD|ANUALIDAD|INTERES|IVA|MANTENIMIENTO|IMPUESTO/.test(desc)) return "Cargos Bancarios";
    return "Otros";
};

// --- V4 ABSOLUTE CHRONOLOGY ENGINE ---

const extractYearContext = (rawText) => {
    // Look for explicit 4-digit years in the first few thousand characters
    const textChunk = rawText.substring(0, 5000);
    const yearMatches = textChunk.match(/\b(20[1-3][0-9])\b/g);
    
    if (yearMatches && yearMatches.length > 0) {
        // Find the most frequent year
        const counts = {};
        let maxYear = yearMatches[0];
        let maxCount = 0;
        yearMatches.forEach(y => {
            counts[y] = (counts[y] || 0) + 1;
            if (counts[y] > maxCount) {
                maxCount = counts[y];
                maxYear = y;
            }
        });
        return maxYear;
    }
    return new Date().getFullYear().toString(); // Fallback to current year
};

const normalizeDateToISO = (rawDateStr, contextYear) => {
    let str = rawDateStr.toUpperCase().replace(/\./g, '').trim(); // Remove dots (e.g., OCT. -> OCT)
    
    const monthMap = {
        'ENE': '01', 'JAN': '01',
        'FEB': '02',
        'MAR': '03',
        'ABR': '04', 'APR': '04',
        'MAY': '05',
        'JUN': '06',
        'JUL': '07',
        'AGO': '08', 'AUG': '08',
        'SEP': '09',
        'OCT': '10',
        'NOV': '11',
        'DIC': '12', 'DEC': '12'
    };

    // Format 1: DD/MM/YYYY or DD-MM-YYYY
    const fullDateMatch = str.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
    if (fullDateMatch) return `${fullDateMatch[3]}-${fullDateMatch[2]}-${fullDateMatch[1]}`;

    // Format 2: DD/MM/YY or DD-MM-YY
    const shortDateMatch = str.match(/^(\d{2})[/-](\d{2})[/-](\d{2})$/);
    if (shortDateMatch) return `20${shortDateMatch[3]}-${shortDateMatch[2]}-${shortDateMatch[1]}`;

    // Format 3: DD MMM (08 OCT) or MMM DD (OCT 31)
    const monthWordMatch = str.match(/([A-Z]{3,4})/);
    const dayMatch = str.match(/(\d{1,2})/);
    
    if (monthWordMatch && dayMatch) {
        let monthCode = monthWordMatch[1].substring(0, 3);
        let mm = monthMap[monthCode];
        
        // If we can't map the month word, return null (invalid date)
        if (!mm) return null; 

        let dd = dayMatch[1].padStart(2, '0');
        return `${contextYear}-${mm}-${dd}`;
    }

    return null; // Ultimate fallback: no valid date parsed
};

// --- BANK STRATEGIES (Updated for V4 Context) ---

const parseBBVA = (lines, contextYear) => {
    const movements = [];
    for (const line of lines) {
        const dateMatch = line.match(/^(\d{1,2}\s[A-Z]{3})\s/i);
        if (dateMatch) {
            const rawDate = dateMatch[1];
            const isoDate = normalizeDateToISO(rawDate, contextYear);
            if (!isoDate) continue;
            
            const amounts = line.match(/-?\$?[\d,]+\.\d{2}/g);
            if (amounts && amounts.length >= 1) {
                const amountText = amounts[0];
                const amountVal = parseAmount(amountText);
                
                if (amountVal !== 0) {
                    let desc = line.replace(rawDate, '').replace(amountText, '');
                    desc = desc.replace(/-?\$?[\d,]+\.\d{2}/g, '').replace(/SEL\s+|TRASPASOS A OTROS BANCOS \(SPEI\)/gi, '').trim();

                    if (desc.length > 3) {
                        movements.push({
                            date: isoDate,
                            description: desc.slice(0, 90),
                            amount: Math.abs(amountVal),
                            type: amountVal < 0 || line.toUpperCase().includes("RETIRO") || line.toUpperCase().includes("COMISION") ? "Egreso" : "Ingreso",
                            category: getCategory(desc)
                        });
                    }
                }
            }
        }
    }
    return movements;
};

const parseScotiabank = (rawText, contextYear) => {
    const movements = [];
    const dateRegex = /(([A-Z]{3,4}\.?\s\d{1,2})|(\d{1,2}\s[A-Z]{3,4}\.?)|(\d{1,2}[/-]([A-Z]{3,4}|\d{2})([/-]\d{2,4})?))/gi;
    const amountRegex = /-?\$?[\d,]+\.\d{2}/g;

    let match;
    const occurrences = [];
    while ((match = dateRegex.exec(rawText)) !== null) {
        occurrences.push({ date: match[0], index: match.index });
    }

    for (let j = 0; j < occurrences.length; j++) {
        const start = occurrences[j].index;
        const end = occurrences[j+1] ? occurrences[j+1].index : rawText.length;
        const segment = rawText.substring(start, end);

        const amountMatches = segment.match(amountRegex);
        if (amountMatches && amountMatches.length > 0) {
            const amountText = amountMatches[0];
            const amountVal = parseAmount(amountText);

            if (amountVal !== 0) {
                const rawDate = occurrences[j].date;
                const isoDate = normalizeDateToISO(rawDate, contextYear);
                if (!isoDate) continue; // Skip invalid dates
                
                let desc = segment.replace(rawDate, '').replace(amountText, '').replace(/\s\s+/g, ' ').trim();
                
                if (/RESUMEN|ESTADO|SALDO|PAGINA|PERIODI|CUENTA|COMISIONES/i.test(desc)) continue;

                if (desc.length > 3) {
                    movements.push({
                        date: isoDate,
                        description: desc.slice(0, 100),
                        amount: Math.abs(amountVal),
                        type: amountVal < 0 || segment.toUpperCase().includes("RETIRO") || segment.toUpperCase().includes("CARGO") ? "Egreso" : "Ingreso",
                        category: getCategory(desc)
                    });
                }
            }
        }
    }

    const unique = [];
    const seen = new Set();
    movements.forEach(m => {
        const key = `${m.date}-${m.amount}-${m.description.substring(0, 10)}`;
        if (!seen.has(key)) {
            unique.push(m);
            seen.add(key);
        }
    });
    return unique;
};

const parseInbursa = (lines, contextYear) => {
    const movements = [];
    for (const line of lines) {
        const dateMatch = line.match(/([A-Z]{3}\.\s\d{2})/i); 
        if (dateMatch) {
            const rawDate = dateMatch[1];
            const isoDate = normalizeDateToISO(rawDate, contextYear);
            if (!isoDate) continue;
            
            const amounts = line.match(/-?\$?[\d,]+\.\d{2}/g);
            if (amounts && amounts.length >= 1) {
                const amountText = amounts[0];
                const amountVal = parseAmount(amountText);
                
                if (amountVal !== 0) {
                    let desc = line.replace(rawDate, '').replace(amountText, '').replace(/-?\$?[\d,]+\.\d{2}/g, '').trim();

                    if (desc.length > 3) {
                        movements.push({
                            date: isoDate,
                            description: desc.slice(0, 90),
                            amount: Math.abs(amountVal),
                            type: amountVal < 0 || line.toUpperCase().includes("RETIRO") || line.toUpperCase().includes("CARGO") || line.toUpperCase().includes("COMISION") ? "Egreso" : "Ingreso",
                            category: getCategory(desc)
                        });
                    }
                }
            }
        }
    }
    return movements;
};

const parseUniversal = (lines, contextYear) => {
    const movements = [];
    for (const line of lines) {
        const dateMatch = line.match(/(([A-Z]{3,4}\.?\s\d{1,2})|(\d{1,2}\s[A-Z]{3,4}\.?)|(\d{1,2}[/-]\d{2,4})|(\d{1,2}[/-][A-Z]{3}[/-]\d{2,4}))/i);
        if (dateMatch) {
            const rawDate = dateMatch[0];
            const isoDate = normalizeDateToISO(rawDate, contextYear);
            if (!isoDate) continue;
            
            const amounts = line.match(/-?\$?[\d,]+\.\d{2}/g);
            if (amounts && amounts.length >= 1) {
                const amountText = amounts[0];
                const amountVal = parseAmount(amountText);
                
                if (amountVal !== 0) {
                    let desc = line.replace(rawDate, '').replace(amountText, '').replace(/-?\$?[\d,]+\.\d{2}/g, '').trim();
                    if (desc.length > 3 && !/RESUMEN|ESTADO|SALDO|PAGINA/i.test(desc)) {
                        movements.push({
                            date: isoDate,
                            description: desc.slice(0, 90),
                            amount: Math.abs(amountVal),
                            type: amountVal < 0 || line.toUpperCase().includes("RETIRO") || line.toUpperCase().includes("CARGO") ? "Egreso" : "Ingreso",
                            category: getCategory(desc)
                        });
                    }
                }
            }
        }
    }
    return movements;
};

// --- MAIN ENGINE CONTEXT V4 ---

export const extractMovementsFromPDF = async (file) => {
    console.log(`[V4 Chronology Engine] Inicializado: ${file.name}`);
    const arrayBuffer = await file.arrayBuffer();
    
    try {
        const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        
        let allLines = [];
        let rawTextString = "";
        let detectedBank = "Unknown";

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            
            const items = content.items.map(item => ({
                str: item.str,
                y: Math.round(item.transform[5]),
                x: Math.round(item.transform[4])
            }));
            
            items.sort((a, b) => b.y - a.y || a.x - b.x);
            rawTextString += " " + items.map(it => it.str).join(' ');

            const pageLines = [];
            let currentY = -1;
            let currentLine = "";
            
            for (const item of items) {
                if (Math.abs(item.y - currentY) > 4) {
                    if (currentLine) pageLines.push(currentLine);
                    currentLine = item.str;
                    currentY = item.y;
                } else {
                    currentLine += (item.x - (currentLine.length * 4) > 10 ? "  " : " ") + item.str;
                }
            }
            if (currentLine) pageLines.push(currentLine);
            allLines = allLines.concat(pageLines);
        }

        const headerText = allLines.slice(0, 40).join(' ').toUpperCase();
        const fullText = headerText + rawTextString.substring(0, 3000).toUpperCase();

        // Level 1: Precise Product Name & Domain Heuristics (Full Text Scan)
        if (fullText.includes("MULTIVA")) detectedBank = "Multiva";
        else if (fullText.includes("ASCENSO PM") || fullText.includes("ENLACE GLOBAL") || fullText.includes("ENLACE NEGOCIOS") || fullText.includes("MERCANTIL DEL NORTE")) detectedBank = "Banorte";
        else if (fullText.includes("CASH MANAGEMENT M.N.")) detectedBank = "BBVA";
        
        // Level 2: Strict Header Keyword Heuristics
        else if (headerText.includes("BBVA")) detectedBank = "BBVA";
        else if (headerText.includes("MIFEL") || fullText.includes("BANCAMIFEL")) detectedBank = "Mifel";
        else if (headerText.includes("INBURSA") || headerText.includes("BURSA")) detectedBank = "Inbursa";
        else if (headerText.includes("SANTANDER") || headerText.includes("BANCO SANTANDER")) detectedBank = "Santander";
        else if (headerText.includes("BANORTE")) detectedBank = "Banorte";
        else if (headerText.includes("SCOTIABANK") || headerText.includes("SCOTIA") || headerText.includes("GLOBAL BANKING")) detectedBank = "Scotiabank";

        // V4: Determine Year Context
        const contextYear = extractYearContext(rawTextString);
        console.log(`[V4 Engine] Banco: ${detectedBank} | Contexto Año: ${contextYear}`);

        let movements = [];
        if (detectedBank === "BBVA") movements = parseBBVA(allLines, contextYear);
        else if (detectedBank === "Scotiabank") movements = parseScotiabank(rawTextString, contextYear);
        else if (detectedBank === "Inbursa") movements = parseInbursa(allLines, contextYear);
        else movements = parseUniversal(allLines, contextYear);

        movements = movements.map(m => ({ ...m, bank: detectedBank }));

        // V4: Final chronological descending sort internally
        movements.sort((a, b) => {
            const dateA = new Date(a.date);
            const dateB = new Date(b.date);
            if (!isNaN(dateA) && !isNaN(dateB)) {
                return dateB - dateA; // Newest first
            }
            return 0;
        });

        console.log(`[V4 Engine] ${movements.length} movimientos procesados en formato ISO.`);
        return movements;

    } catch (err) {
        console.error("Error crítico V4 Engine:", err);
        throw err;
    }
};
