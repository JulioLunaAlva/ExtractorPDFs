# Statement Miner

A premium financial intelligence solution for extracting and visualizing bank movements from PDFs.

## Tech Stack
- **Backend:** Python (pdfplumber, pandas)
- **Frontend:** React, Vite, Tailwind CSS, Recharts, Framer Motion, Lucide React
- **Export:** XLSX

## Project Structure
- `scripts/extract_statements.py`: The heart of the extraction engine.
- `src/App.jsx`: The glassmorphic dashboard.
- `src/data/movements.json`: The extracted data store.
- `src/utils/ExcelExport.js`: Download utility.

## Setup & Usage

### 1. Extraction (Python)
Make sure you have the required libraries:
```bash
pip install pdfplumber pandas openpyxl
```
Run the extractor:
```bash
python scripts/extract_statements.py
```
This will read PDFs from `C:\Users\jluna\Downloads\esos` and update `src/data/movements.json`.

### 2. Dashboard (React)
Install dependencies:
```bash
npm install
```
Start the development server:
```bash
npm run dev
```

## Features
- **Auto-detection:** Supports BBVA, Scotiabank, Santander, Banorte, Mifel, and Inbursa.
- **Categorization:** Smart classification of expenses.
- **Insights:** Highlights major expenses automatically.
- **Export:** Full transaction list download to Excel.
