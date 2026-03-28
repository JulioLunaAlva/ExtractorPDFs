import pdfplumber

try:
    with pdfplumber.open("C:/Users/jluna/Downloads/esos/000092748711011730 de Septiembre de 2024.pdf") as pdf:
        text = "".join(page.extract_text() for page in pdf.pages if page.extract_text()).lower()
        import re
        domains = set(re.findall(r'[a-z0-9-]+\.(?:com|mx)', text))
        print("DOMAINS:", domains)
        print("PHONES:", set(re.findall(r'800\s*\d{3}\s*\d{4}', text)))
except Exception as e:
    print(e)
