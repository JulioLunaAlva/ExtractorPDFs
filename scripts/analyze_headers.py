import pdfplumber
import glob
import os

pdf_dir = "C:/Users/jluna/Downloads/esos/*.pdf"
pdf_files = glob.glob(pdf_dir)

for pdf_path in pdf_files:
    try:
        with pdfplumber.open(pdf_path) as pdf:
            if len(pdf.pages) > 0:
                first_page = pdf.pages[0]
                text = first_page.extract_text()
                if text:
                    header = text[:500].replace('\n', ' ')
                    
                    bank = "UNKNOWN"
                    header_upper = header.upper()
                    if "BBVA" in header_upper: bank = "BBVA"
                    elif "MIFEL" in header_upper: bank = "Mifel"
                    elif "INBURSA" in header_upper or "BURSA" in header_upper: bank = "Inbursa"
                    elif "SANTANDER" in header_upper: bank = "Santander"
                    elif "BANORTE" in header_upper or "MERCANTIL DEL NORTE" in header_upper: bank = "Banorte"
                    elif "SCOTIA" in header_upper: bank = "Scotiabank"
                    
                    print(f"--- {os.path.basename(pdf_path)} ---")
                    print(f"DETECTED AS: {bank}")
                    print(f"HEADER: {header[:150]}...\n")
    except Exception as e:
        print(f"Failed to read {os.path.basename(pdf_path)}: {e}")
