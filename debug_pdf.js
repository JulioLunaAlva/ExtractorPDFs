// Re-dump the Banorte PDF with NO line limit
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';

async function debugPDF(path) {
    const data = new Uint8Array(fs.readFileSync(path));
    const loadingTask = pdfjs.getDocument({ data });
    const pdf = await loadingTask.promise;
    console.log(`Páginas: ${pdf.numPages}`);

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        
        // Group by Y coordinate (visual rows)
        const rowMap = {};
        content.items.forEach(item => {
            const y = Math.round(item.transform[5]);
            const x = Math.round(item.transform[4]);
            if (!rowMap[y]) rowMap[y] = [];
            rowMap[y].push({ x, str: item.str.trim() });
        });
        
        const lines = Object.entries(rowMap)
            .sort(([a], [b]) => Number(b) - Number(a))
            .map(([, items]) => items.sort((a, b) => a.x - b.x).map(i => i.str).filter(Boolean).join('  '))
            .filter(l => l.trim());
        
        console.log(`--- PÁGINA ${i} ---`);
        lines.forEach(l => console.log(l));  // NO limit - print ALL lines
    }
}

const target = process.argv[2] || 'C:\\Users\\jluna\\Downloads\\esos\\2669236_NACIONAL_20241031 (1).pdf';
debugPDF(target).catch(console.error);
