import * as pdfjs from 'pdfjs-dist';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

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

const extractYearContext = (rawText) => {
    const textChunk = rawText.substring(0, 5000);
    const yearMatches = textChunk.match(/\b(20[1-3][0-9])\b/g);
    if (yearMatches && yearMatches.length > 0) {
        const counts = {};
        let maxYear = yearMatches[0];
        let maxCount = 0;
        yearMatches.forEach(y => {
            counts[y] = (counts[y] || 0) + 1;
            if (counts[y] > maxCount) { maxCount = counts[y]; maxYear = y; }
        });
        return maxYear;
    }
    return new Date().getFullYear().toString();
};

const normalizeDateToISO = (rawDateStr, contextYear) => {
    let str = rawDateStr.toUpperCase().replace(/\./g, '').trim(); 
    const monthMap = { 'ENE': '01', 'JAN': '01', 'FEB': '02', 'MAR': '03', 'ABR': '04', 'APR': '04', 'MAY': '05', 'JUN': '06', 'JUL': '07', 'AGO': '08', 'AUG': '08', 'SEP': '09', 'OCT': '10', 'NOV': '11', 'DIC': '12', 'DEC': '12' };

    const fullDateMatch = str.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
    if (fullDateMatch) return `${fullDateMatch[3]}-${fullDateMatch[2]}-${fullDateMatch[1]}`;

    const shortDateMatch = str.match(/^(\d{2})[/-](\d{2})[/-](\d{2})$/);
    if (shortDateMatch) return `20${shortDateMatch[3]}-${shortDateMatch[2]}-${shortDateMatch[1]}`;

    const monthWordMatch = str.match(/([A-Z]{3,4})/);
    const dayMatch = str.match(/(\d{1,2})/);
    if (monthWordMatch && dayMatch) {
        let monthCode = monthWordMatch[1].substring(0, 3);
        let mm = monthMap[monthCode];
        if (!mm) return null; 
        let dd = dayMatch[1].padStart(2, '0');
        return `${contextYear}-${mm}-${dd}`;
    }
    return null; 
};

// Robust Block Parser
const parseUniversalBlocks = (rawText, contextYear, detectedBank) => {
    const movements = [];
    // Matches DD/MM/YYYY, DD-MMM-YY, 08 OCT, OCT 02, etc. (Includes new Inbursa/Banorte/Mifel formats)
    const dateRegex = /(([A-Z]{3,4}\.?\s\d{1,2})|(\d{1,2}\s[A-Z]{3,4}\.?)|(\d{1,2}[/-]\d{2}[/-]\d{2,4})|(\d{1,2}\s[A-Z]{3}\s\d{4}))/gi;
    const amountRegex = /-?\$?[\d,]+\.\d{2}/g;

    let match;
    const occurrences = [];
    while ((match = dateRegex.exec(rawText)) !== null) {
        occurrences.push({ date: match[0], index: match.index });
    }

    // Process each block of text between two dates
    for (let j = 0; j < occurrences.length; j++) {
        const start = occurrences[j].index;
        // Limit the block length to max 500 chars to avoid spanning too far if next date is missed
        const nextIndex = occurrences[j+1] ? occurrences[j+1].index : rawText.length;
        const end = Math.min(nextIndex, start + 500); 
        const segment = rawText.substring(start, end).replace(/\n/g, ' ');

        const amountMatches = segment.match(amountRegex);
        if (amountMatches && amountMatches.length > 0) {
            // Usually the first or second amount in a block is the primary transaction amount.
            // Some banks put balance as the last amount. We take the first valid non-zero amount.
            let amountVal = 0;
            let amountText = "";
            for (const amt of amountMatches) {
                const parsed = parseAmount(amt);
                if (parsed !== 0) {
                    amountVal = parsed;
                    amountText = amt;
                    break;
                }
            }

            if (amountVal !== 0) {
                const rawDate = occurrences[j].date;
                const isoDate = normalizeDateToISO(rawDate, contextYear);
                if (!isoDate) continue; 
                
                // Clean description
                let desc = segment
                    .replace(rawDate, '')
                    .replace(amountText, '')
                    .replace(amountRegex, '') // Remove all other numbers formatted as money
                    .replace(/\s\s+/g, ' ')
                    .trim();
                
                // Noise filtering
                if (/RESUMEN|ESTADO DE CUENTA|SALDO|PAGINA|PERIODI|CUENTA|RENDIMIENTOS|GAT|I\.S\.R|TOTAL/i.test(desc)) continue;

                if (desc.length > 3) {
                    let type = "Ingreso";
                    // Heuristics for determining type if not naturally negative
                    if (amountVal < 0 || 
                        segment.toUpperCase().includes("RETIRO") || 
                        segment.toUpperCase().includes("CARGO") || 
                        segment.toUpperCase().includes("COMISION") ||
                        // Banorte and Mifel often represent expenses as positive but placed in a 'retiros' column (hard to parse in 1D text).
                        // We assume most things are expenses unless they contain "DEPOSITO", "ABONO", "RECIBIDO".
                        // Wait, a better logic for Banorte/Mifel where it's 1D: if it lacks "DEPOSITO" or "PAGO RECIBIDO", it's likely an expense.
                        (!segment.toUpperCase().includes("DEPOSITO") && !segment.toUpperCase().includes("ABONO") && !segment.toUpperCase().includes("RECIBIDO") && detectedBank !== "BBVA")
                    ) {
                        type = "Egreso";
                    }
                    
                    // Specific fix for BBVA which nicely denotes income with specific keywords usually, but we can rely on standard negative checks if possible.
                    if (detectedBank === "BBVA" && !segment.toUpperCase().includes("DEPOSITO") && !segment.toUpperCase().includes("ABONO")) {
                        type = "Egreso";
                    }

                    // Special overrides for explicit positive words
                    if (/DEPOSITO|ABONO|PAGO RECIBIDO|NOMINA/.test(segment.toUpperCase())) {
                        type = "Ingreso";
                    }

                    movements.push({
                        date: isoDate,
                        description: desc.slice(0, 100),
                        amount: Math.abs(amountVal),
                        type: type,
                        category: getCategory(desc)
                    });
                }
            }
        }
    }

    // Deduplication
    const unique = [];
    const seen = new Set();
    movements.forEach(m => {
        const key = `${m.date}-${m.amount}-${m.description.substring(0, 15)}`;
        if (!seen.has(key)) {
            unique.push(m);
            seen.add(key);
        }
    });

    return unique;
};

export const extractMovementsFromPDF = async (file) => {
    console.log(`[V4 Block Engine] Inicializado: ${file.name}`);
    const arrayBuffer = await file.arrayBuffer();
    
    try {
        const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        
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
            
            // Sort top-to-bottom, then left-to-right to preserve visual order as text
            items.sort((a, b) => b.y - a.y || a.x - b.x);
            rawTextString += " " + items.map(it => it.str).join('  ');
        }

        const headerText = rawTextString.substring(0, 4000).toUpperCase();

        if (headerText.includes("MULTIVA")) detectedBank = "Multiva";
        else if (headerText.includes("ASCENSO PM") || headerText.includes("ENLACE GLOBAL") || headerText.includes("BANORTE")) detectedBank = "Banorte";
        else if (headerText.includes("CASH MANAGEMENT M.N.") || headerText.includes("BBVA")) detectedBank = "BBVA";
        else if (headerText.includes("MIFEL") || headerText.includes("BANCAMIFEL")) detectedBank = "Mifel";
        else if (headerText.includes("INBURSA") || headerText.includes("BURSA")) detectedBank = "Inbursa";
        else if (headerText.includes("SANTANDER") || headerText.includes("BANCO SANTANDER")) detectedBank = "Santander";
        else if (headerText.includes("SCOTIABANK") || headerText.includes("SCOTIA")) detectedBank = "Scotiabank";

        const contextYear = extractYearContext(rawTextString);
        console.log(`[Block Engine] Banco: ${detectedBank} | Año: ${contextYear}`);

        // Unified powerful block parser for ALL banks
        let movements = parseUniversalBlocks(rawTextString, contextYear, detectedBank);

        movements = movements.map(m => ({ ...m, bank: detectedBank }));

        movements.sort((a, b) => {
            const dateA = new Date(a.date);
            const dateB = new Date(b.date);
            if (!isNaN(dateA) && !isNaN(dateB)) {
                return dateB - dateA;
            }
            return 0;
        });

        console.log(`[Block Engine] ${movements.length} movimientos procesados.`);
        return movements;

    } catch (err) {
        console.error("Error crítico Block Engine:", err);
        throw err;
    }
};
