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
        
        const items = content.items.map(item => ({
            str: item.str,
            y: Math.round(item.transform[5]),
            x: Math.round(item.transform[4])
        }));
        
        items.sort((a, b) => b.y - a.y || a.x - b.x);
        
        const lines = [];
        let currentY = -1;
        let currentLine = "";
        
        for (const item of items) {
            if (Math.abs(item.y - currentY) > 4) {
                if (currentLine) lines.push(currentLine);
                currentLine = item.str;
                currentY = item.y;
            } else {
                currentLine += " " + item.str;
            }
        }
        if (currentLine) lines.push(currentLine);

        console.log(`--- PÁGINA ${i} ---`);
        lines.slice(0, 50).forEach(l => console.log(l));
    }
}

const target = process.argv[2] || 'C:\\Users\\jluna\\Downloads\\esos\\2669236_NACIONAL_20241031 (1).pdf';
debugPDF(target).catch(console.error);
