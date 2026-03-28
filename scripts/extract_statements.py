import pdfplumber
import os
import json
import re
from datetime import datetime

def parse_amount(amount_str):
    if not amount_str: return 0.0
    clean_str = amount_str.replace('$', '').replace(',', '').strip()
    try:
        if clean_str.startswith('(') and clean_str.endswith(')'):
            return -float(clean_str[1:-1])
        return float(clean_str)
    except ValueError:
        return 0.0

def get_category(description):
    desc = description.upper()
    if any(k in desc for k in ["SPEI", "TRANSFERENCIA", "TRASPASO", "PAGO RECIBIDO"]):
        return "Transferencia"
    if any(k in desc for k in ["RESTAURANTE", "VIPS", "TOKS", "STARBUCKS", "COMIDA", "UBER EATS", "RAPPY", "MC DONALDS", "KFC"]):
        return "Alimentos"
    if any(k in desc for k in ["SUPER", "WALMART", "CHEDRAUI", "SORIANA", "COSTCO", "SAM'S", "7-ELEVEN", "OXXO", "SUPERAMA", "HEB"]):
        return "Súper / Tienda"
    if any(k in desc for k in ["GASOLINERA", "COMBUSTIBLE", "PEMEX", "SHELL", "GASOL", "BP", "REPSOL"]):
        return "Gasolina"
    if any(k in desc for k in ["UBER", "DIDI", "TAXI", "PEAJE", "ESTACIONAMIENTO", "CAPUFE", "METRO", "CARGO TAG"]):
        return "Transporte"
    if any(k in desc for k in ["NETFLIX", "SPOTIFY", "AMAZON", "APPLE", "GOOGLE", "SAMSUNG", "MERCADO LIBRE", "TEMU", "SHEIN"]):
        return "Servicios / Shopping"
    if any(k in desc for k in ["FARMACIA", "HOSPITAL", "AXXA", "METLIFE", "DOCTOR", "SIMILARES", "GUADALAJARA"]):
        return "Salud"
    if any(k in desc for k in ["RETIRO ATM", "RETIRO CAJERO", "EFECTIVO"]):
        return "Efectivo"
    if any(k in desc for k in ["NOMINA", "PAGO DE SUELDO", "SUELDO", "QUINCENA"]):
        return "Nómina"
    return "Otros"

def process_all_pdfs(folder_path):
    all_movements = []
    files = [f for f in os.listdir(folder_path) if f.lower().endswith('.pdf')]
    
    for filename in files:
        full_path = os.path.join(folder_path, filename)
        print(f"Processing: {filename}")
        try:
            with pdfplumber.open(full_path) as pdf:
                bank = "Unknown"
                first_page_text = pdf.pages[0].extract_text().upper()
                if "BBVA" in first_page_text: bank = "BBVA"
                elif "MIFEL" in first_page_text: bank = "Mifel"
                elif "INBURSA" in first_page_text: bank = "Inbursa"
                elif "SANTANDER" in first_page_text: bank = "Santander"
                elif "BANORTE" in first_page_text: bank = "Banorte"
                elif "SCOTIABANK" in first_page_text: bank = "Scotiabank"

                for page in pdf.pages:
                    tables = page.extract_tables()
                    for table in tables:
                        for row in table:
                            if not row: continue
                            date_found = False
                            amt = 0.0
                            for cell in row:
                                cell_str = str(cell)
                                # Try common date patterns
                                if re.search(r'\d{2}[/-]\w{2,3}[/-]?\d{0,4}', cell_str):
                                    date_found = cell_str
                                    break
                            if date_found:
                                # Look for amount
                                for cell in row:
                                    if cell and re.search(r'^-?[\d,]+\.\d{2}$', str(cell)):
                                        amt = parse_amount(str(cell))
                                        break
                                desc = " ".join([str(c) for c in row if c and str(c) != date_found and str(c) != str(amt)])
                                if amt != 0:
                                    all_movements.append({
                                        "date": date_found,
                                        "description": desc.strip()[:100],
                                        "amount": abs(amt),
                                        "type": "Egreso" if amt < 0 else "Ingreso",
                                        "bank": bank,
                                        "category": get_category(desc)
                                    })
        except Exception as e:
            print(f"Error processing {filename}: {e}")
                                
    return all_movements

if __name__ == "__main__":
    folder = r"C:\Users\jluna\Downloads\esos"
    data = process_all_pdfs(folder)
    
    unique_data = []
    seen = set()
    for m in data:
        key = (m['date'], m['description'], m['amount'])
        if key not in seen:
            unique_data.append(m)
            seen.add(key)

    output_path = r"C:\Users\jluna\.gemini\antigravity\scratch\statement-miner\src\data\movements.json"
    dirs = os.path.dirname(output_path)
    if not os.path.exists(dirs):
        os.makedirs(dirs)
        
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(unique_data, f, indent=2, ensure_ascii=False)
    
    print(f"Extraction complete! Found {len(unique_data)} movements in {output_path}")
