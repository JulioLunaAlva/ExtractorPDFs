import pdfplumber
import glob

pdf_files = glob.glob("C:/Users/jluna/Downloads/esos/*.pdf")

for pdf_path in pdf_files:
    try:
        with pdfplumber.open(pdf_path) as pdf:
            text = "".join(page.extract_text() for page in pdf.pages if page.extract_text()).upper()
            
            print(f"\n--- {pdf_path.split('/')[-1]} ---")
            for bank in ["BBVA", "BANORTE", "MIFEL", "SANTANDER", "SCOTIA", "INBURSA", "CASH MANAGEMENT", "ENLACE GLOBAL", "ASCENSO PM"]:
                if bank in text:
                    print(f"FOUND: {bank}")
    except Exception as e:
        pass
