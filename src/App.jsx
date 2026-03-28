import React, { useState, useMemo, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { 
  Building2, 
  FileText, 
  Download, 
  Search,
  Filter,
  TrendingDown,
  TrendingUp,
  Loader2,
  Trash2,
  Calendar,
  Activity,
  PlusCircle,
  Briefcase,
  ArrowDownUp,
  AlertOctagon,
  PieChart as PieChartIcon
} from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { exportToExcel } from './utils/ExcelExport';
import { extractMovementsFromPDF } from './utils/PDFProcessor';

const PIE_COLORS = ['#0f172a', '#334155', '#475569', '#64748b', '#94a3b8', '#cbd5e1', '#10b981', '#3b82f6', '#f59e0b', '#ef4444'];

const App = () => {
  const [movements, setMovements] = useState(() => {
    const saved = localStorage.getItem('miner_movements_v4');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [isParsing, setIsParsing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // V4 Advanced Filters
  const [filterBank, setFilterBank] = useState('ALL');
  const [filterType, setFilterType] = useState('ALL');
  const [filterMinAmount, setFilterMinAmount] = useState('');
  const [filterMaxAmount, setFilterMaxAmount] = useState('');
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');

  // V4 Sorting State
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });

  const [catMemory, setCatMemory] = useState(() => {
    const saved = localStorage.getItem('miner_cat_memory_v4');
    return saved ? JSON.parse(saved) : {};
  });

  useEffect(() => {
    localStorage.setItem('miner_movements_v4', JSON.stringify(movements));
  }, [movements]);

  useEffect(() => {
    localStorage.setItem('miner_cat_memory_v4', JSON.stringify(catMemory));
  }, [catMemory]);

  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    setIsParsing(true);
    let allNewMovements = [];

    toast.info(`Iniciando Motor Analítico V4 para ${files.length} archivos...`);

    for (const file of files) {
      try {
        const fileMovements = await extractMovementsFromPDF(file);
        if (fileMovements.length > 0) {
            allNewMovements = [...allNewMovements, ...fileMovements];
            toast.success(`${file.name}: Fechas normalizadas al estándar ISO.`);
        } else {
            toast.warning(`${file.name}: Sin movimientos reconocibles.`);
        }
      } catch (error) {
        toast.error(`Error de matriz V4 en ${file.name}`);
      }
    }

    if (allNewMovements.length > 0) {
        setMovements(prev => {
          const combined = [...allNewMovements, ...prev];
          const seen = new Set();
          return combined.filter(m => {
            const key = `${m.date}-${m.description.substring(0,25)}-${m.amount}-${m.bank}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        });
    }

    setIsParsing(false);
    event.target.value = null; 
  };

  const processedData = useMemo(() => {
    return movements.map(m => ({
        ...m,
        category: catMemory[m.description] || m.category,
        amount: parseFloat(m.amount)
    }));
  }, [movements, catMemory]);

  const availableBanks = useMemo(() => Array.from(new Set(processedData.map(m => m.bank))), [processedData]);

  // V4 Filter Engine
  const filteredData = useMemo(() => {
    let result = processedData.filter(m => {
      const textMatch = m.description.toLowerCase().includes(searchTerm.toLowerCase()) || m.category.toLowerCase().includes(searchTerm.toLowerCase());
      const bankMatch = filterBank === 'ALL' || m.bank === filterBank;
      const typeMatch = filterType === 'ALL' || m.type.toUpperCase() === filterType.toUpperCase();
      
      const minVal = filterMinAmount === '' ? 0 : parseFloat(filterMinAmount);
      const maxVal = filterMaxAmount === '' ? Infinity : parseFloat(filterMaxAmount);
      const amountMatch = m.amount >= minVal && m.amount <= maxVal;

      const dateStartMatch = filterDateStart === '' || m.date >= filterDateStart;
      const dateEndMatch = filterDateEnd === '' || m.date <= filterDateEnd;

      return textMatch && bankMatch && typeMatch && amountMatch && dateStartMatch && dateEndMatch;
    });

    // Semantic Sorting
    result.sort((a, b) => {
        if (sortConfig.key === 'date') {
            if (a.date < b.date) return sortConfig.direction === 'asc' ? -1 : 1;
            if (a.date > b.date) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        }
        if (sortConfig.key === 'amount') {
            return sortConfig.direction === 'asc' ? a.amount - b.amount : b.amount - a.amount;
        }
        return 0;
    });

    return result;
  }, [searchTerm, filterBank, filterType, filterMinAmount, filterMaxAmount, filterDateStart, filterDateEnd, processedData, sortConfig]);

  // V4 Deep Analytics (Operates strictly on FILTERED data subset)
  const analytics = useMemo(() => {
    let income = 0; let expenses = 0;
    let topExpense = { amount: 0, description: 'N/A', date: '' };
    let topIncome = { amount: 0, description: 'N/A', date: '' };
    const categoryTotals = {};

    filteredData.forEach(m => {
        if (m.type === 'Ingreso') {
            income += m.amount;
            if (m.amount > topIncome.amount) topIncome = m;
        } else {
            expenses += m.amount;
            if (m.amount > topExpense.amount) topExpense = m;
            
            // Build Category Distribution (Expenses Only)
            if (!categoryTotals[m.category]) categoryTotals[m.category] = 0;
            categoryTotals[m.category] += m.amount;
        }
    });

    const categoryData = Object.keys(categoryTotals)
        .map(cat => ({ name: cat, value: categoryTotals[cat] }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8); // Top 8 categories for pie chart

    return { 
        income, expenses, 
        balance: income - expenses, 
        count: filteredData.length,
        topExpense, topIncome,
        categoryData
    };
  }, [filteredData]);

  const bankTotals = useMemo(() => {
    const banks = {};
    processedData.forEach(m => {
        if (!banks[m.bank]) banks[m.bank] = { name: m.bank, totalOut: 0, totalIn: 0 };
        if (m.type === 'Ingreso') banks[m.bank].totalIn += m.amount;
        else banks[m.bank].totalOut += m.amount;
    });
    return Object.values(banks);
  }, [processedData]);

  const handleSort = (key) => {
    setSortConfig(prev => ({
        key,
        direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const updateCategory = (description, newCat) => {
    setCatMemory(prev => ({ ...prev, [description]: newCat }));
    toast.success("Regla de categorización global guardada");
  };

  const clearHistory = () => {
    if (window.confirm('¿Confirmar purga total de la base de datos cronológica?')) {
      setMovements([]);
      toast.info("Matriz de datos reiniciada");
    }
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] p-4 md:p-8 font-sans">
        <Toaster position="top-right" richColors />
      
      {/* V4 Header */}
      <header className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-6 mb-10 pb-6 border-b border-[hsl(var(--border))]">
          <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-slate-900 rounded-lg flex items-center justify-center shadow-lg shadow-slate-900/10">
                  <Activity className="w-7 h-7 text-white" />
              </div>
              <div>
                  <h1 className="text-2xl font-black tracking-tight text-slate-900">EXTRACTOR BANCARIO <span className="text-emerald-600">V4</span></h1>
                  <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Cronología Absoluta & Análisis Profundo</span>
                  </div>
              </div>
          </div>

          <div className="flex items-center gap-3 w-full xl:w-auto overflow-x-auto pb-2 xl:pb-0">
              <label className="btn-primary shrink-0 cursor-pointer shadow-md">
                  {isParsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
                  Importar Estados
                  <input type="file" multiple accept=".pdf" className="hidden" onChange={handleFileUpload} disabled={isParsing} />
              </label>
              
              <button onClick={() => exportToExcel(processedData)} className="btn-secondary shrink-0" title="Descargar Matriz Excel" disabled={movements.length === 0}>
                  <Download className="w-4 h-4" /> Exportar a Excel
              </button>

              <button onClick={clearHistory} className="btn-ghost shrink-0 text-rose-600 hover:bg-rose-50" title="Purgar Sistema">
                  <Trash2 className="w-4 h-4" /> Limpiar
              </button>
          </div>
      </header>

      {!movements.length && !isParsing ? (
        <div className="max-w-3xl mx-auto mt-20">
            <div className="panel p-20 text-center border-dashed border-2 border-slate-300 bg-slate-50/50">
                <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-sm border border-slate-200">
                    <Calendar className="w-8 h-8 text-slate-500" />
                </div>
                <h2 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">Estandarización ISO Activada</h2>
                <p className="text-slate-500 text-sm mb-10 leading-relaxed max-w-lg mx-auto font-medium">
                    Importa estados de BBVA, Inbursa o Scotiabank sin importar las fechas o el formato (ej. OCT 31, 31/10/24). El Motor V4 los organizará cronológicamente de forma milimétrica.
                </p>
                <label className="btn-primary mx-auto w-fit cursor-pointer px-10 py-4 text-base shadow-xl">
                    Comenzar Análisis V4
                    <input type="file" multiple accept=".pdf" className="hidden" onChange={handleFileUpload} />
                </label>
            </div>
        </div>
      ) : (
        <div className="space-y-6">
            
            {/* V4 Deep Analytics Bento */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                
                {/* Master Balance */}
                <div className="panel p-8 col-span-1 md:col-span-5 bg-slate-900 text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-10">
                        <Briefcase className="w-32 h-32" />
                    </div>
                    <div className="relative z-10 flex flex-col h-full justify-between">
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Balance del Periodo Filtrado</span>
                            </div>
                            <div className="text-5xl font-black tracking-tighter mb-8">
                                ${analytics.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 border-t border-slate-800 pt-6">
                            <div>
                                <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-[0.2em] mb-1">Total Ingresos</div>
                                <div className="text-lg font-black text-slate-100">+${analytics.income.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                            </div>
                            <div>
                                <div className="text-[10px] text-rose-400 font-bold uppercase tracking-[0.2em] mb-1">Total Egresos</div>
                                <div className="text-lg font-black text-slate-100">-${analytics.expenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Top Expenses/Incomes */}
                <div className="panel p-6 col-span-1 md:col-span-3 flex flex-col gap-6 justify-between bg-white border border-slate-200">
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <TrendingDown className="w-4 h-4 text-rose-500" />
                            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Gasto Mayor</span>
                        </div>
                        <div className="text-2xl font-black text-slate-900 tracking-tight">-${analytics.topExpense.amount.toLocaleString()}</div>
                        <div className="text-xs font-bold uppercase text-slate-500 mt-1 truncate">{analytics.topExpense.description}</div>
                        <div className="text-[9px] font-bold uppercase text-slate-500 tracking-widest mt-1 bg-slate-50 w-fit px-2 py-0.5 rounded">{analytics.topExpense.date}</div>
                    </div>
                    <div className="border-t border-slate-100 pt-4">
                        <div className="flex items-center gap-2 mb-3">
                            <TrendingUp className="w-4 h-4 text-emerald-500" />
                            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Ingreso Mayor</span>
                        </div>
                        <div className="text-xl font-black text-slate-900 tracking-tight">+${analytics.topIncome.amount.toLocaleString()}</div>
                        <div className="text-xs font-bold uppercase text-slate-500 mt-1 truncate">{analytics.topIncome.description}</div>
                    </div>
                </div>

                {/* Vertical Category Pie */}
                <div className="panel p-6 col-span-1 md:col-span-4 bg-white border border-slate-200">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Distribución Funcional de Gastos</span>
                        <PieChartIcon className="w-4 h-4 text-slate-300" />
                    </div>
                    {analytics.categoryData.length > 0 ? (
                        <div className="h-[200px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={analytics.categoryData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value" stroke="none">
                                        {analytics.categoryData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value) => `$${value.toLocaleString()}`} contentStyle={{ borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                    <Legend verticalAlign="middle" align="right" layout="vertical" iconType="circle" wrapperStyle={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="h-full flex items-center justify-center text-xs font-bold text-slate-500 uppercase tracking-widest">
                            No hay gastos en el periodo
                        </div>
                    )}
                </div>
            </div>

            {/* Advanced Filters V4 Bar */}
            <div className="panel p-4 lg:p-6 bg-white border-slate-200 shadow-sm">
                <div className="flex flex-col lg:flex-row gap-6">
                    {/* Dates Column */}
                    <div className="flex flex-col gap-2 min-w-[200px]">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1"><Calendar className="w-3 h-3"/> Filtro Cronológico Absoluto</span>
                        <div className="flex items-center gap-2">
                            <input 
                                type="date" 
                                value={filterDateStart}
                                onChange={(e) => setFilterDateStart(e.target.value)}
                                className="bg-slate-50 border border-slate-200 rounded text-xs font-bold uppercase text-slate-700 py-1.5 px-2 focus:ring-1 focus:ring-slate-900 w-full"
                            />
                            <span className="text-xs text-slate-300 font-black">-</span>
                            <input 
                                type="date" 
                                value={filterDateEnd}
                                onChange={(e) => setFilterDateEnd(e.target.value)}
                                className="bg-slate-50 border border-slate-200 rounded text-xs font-bold uppercase text-slate-700 py-1.5 px-2 focus:ring-1 focus:ring-slate-900 w-full"
                            />
                        </div>
                    </div>

                    {/* Entities Column */}
                    <div className="flex flex-col gap-2 flex-grow">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1"><Filter className="w-3 h-3"/> Entidad y Tipología</span>
                        <div className="flex flex-wrap items-center gap-3">
                            <select value={filterBank} onChange={(e) => setFilterBank(e.target.value)} className="bg-slate-50 border border-slate-200 rounded text-xs font-bold uppercase text-slate-700 py-2 px-3 focus:ring-1 focus:ring-slate-900">
                                <option value="ALL">Total Instituciones</option>
                                {availableBanks.map(b => <option key={b} value={b}>{b}</option>)}
                            </select>

                            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="bg-slate-50 border border-slate-200 rounded text-xs font-bold uppercase text-slate-700 py-2 px-3 focus:ring-1 focus:ring-slate-900">
                                <option value="ALL">Flujo Completo</option>
                                <option value="INGRESO">Inflows (Ingresos)</option>
                                <option value="EGRESO">Outflows (Egresos)</option>
                            </select>
                            
                            <div className="relative flex-grow min-w-[180px]">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
                                <input 
                                    type="text" 
                                    placeholder="BUSCAR PATRÓN..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="bg-slate-50 border border-slate-200 rounded text-xs font-bold uppercase placeholder:text-slate-300 w-full pl-8 pr-3 py-2 focus:ring-1 focus:ring-slate-900"
                                />
                            </div>
                        </div>
                    </div>
                    
                    {/* Amounts Column */}
                    <div className="flex flex-col gap-2 min-w-[200px]">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1"><Activity className="w-3 h-3"/> Rango de Capital</span>
                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded px-2">
                            <span className="text-[10px] font-black text-slate-500">MIN$</span>
                            <input 
                                type="number" 
                                value={filterMinAmount}
                                onChange={(e) => setFilterMinAmount(e.target.value)}
                                className="bg-transparent border-none w-full text-xs font-bold focus:ring-0 p-0 py-1.5 text-slate-700"
                            />
                            <div className="w-px h-4 bg-slate-200"></div>
                            <span className="text-[10px] font-black text-slate-500">MAX$</span>
                            <input 
                                type="number" 
                                value={filterMaxAmount}
                                onChange={(e) => setFilterMaxAmount(e.target.value)}
                                className="bg-transparent border-none w-full text-xs font-bold focus:ring-0 p-0 py-1.5 text-slate-700"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Reconciliation Data Table */}
            <div className="panel overflow-hidden border border-slate-200">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{analytics.count} Resultados Cronológicos</span>
                    {filterDateStart || filterDateEnd ? (
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded uppercase tracking-wider">Filtro de Fecha Activo</span>
                    ) : null}
                </div>
                <div className="overflow-x-auto max-h-[800px] custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-white sticky top-0 z-10 shadow-sm ring-1 ring-slate-100">
                            <tr className="text-slate-500 text-[10px] uppercase font-black tracking-[0.2em]">
                                <th className="px-6 py-4 cursor-pointer hover:bg-slate-50 transition-colors whitespace-nowrap" onClick={() => handleSort('date')}>
                                    <div className="flex items-center gap-2">ISO_Date <ArrowDownUp className="w-3 h-3"/></div>
                                </th>
                                <th className="px-6 py-4 whitespace-nowrap">Institution</th>
                                <th className="px-6 py-4 w-full">Concepto_Operativo</th>
                                <th className="px-6 py-4 whitespace-nowrap">Macro_Categoría</th>
                                <th className="px-6 py-4 text-right cursor-pointer hover:bg-slate-50 transition-colors whitespace-nowrap" onClick={() => handleSort('amount')}>
                                    <div className="flex items-center justify-end gap-2">Importe <ArrowDownUp className="w-3 h-3"/></div>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {filteredData.map((m, i) => (
                                <tr key={i} className="hover:bg-slate-50 transition-colors group">
                                    <td className="px-6 py-5">
                                        <span className="text-xs font-black text-slate-900 font-mono uppercase bg-slate-100 px-2 py-1 rounded shadow-sm border border-slate-200">{m.date}</span>
                                    </td>
                                    <td className="px-6 py-5">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-[11px] font-black text-slate-700 uppercase tracking-widest">{m.bank}</span>
                                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Core_Bank</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-5">
                                        <div className="text-xs font-bold text-slate-800 uppercase leading-snug">
                                            {m.description}
                                        </div>
                                    </td>
                                    <td className="px-6 py-5">
                                        <select 
                                            value={m.category}
                                            onChange={(e) => updateCategory(m.description, e.target.value)}
                                            className="text-[10px] font-black tracking-widest text-slate-500 bg-transparent border border-transparent rounded hover:border-slate-300 focus:border-slate-500 focus:ring-0 py-1 cursor-pointer transition-colors w-full uppercase"
                                        >
                                            {['Transferencia', 'Alimentos', 'Súper / Tienda', 'Gasolina', 'Transporte', 'Servicios / Shopping', 'Salud', 'Efectivo', 'Ingreso Mensual', 'Cargos Bancarios', 'Otros'].map(c => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className={`px-6 py-5 text-right font-mono font-black text-sm whitespace-nowrap ${m.type === 'Ingreso' ? 'text-emerald-600' : 'text-slate-900'}`}>
                                        <div className="flex items-center justify-end gap-1.5">
                                            {m.type === 'Ingreso' ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <TrendingDown className="w-4 h-4 text-slate-300" />}
                                            {m.type === 'Ingreso' ? '+' : '-'}${m.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

        </div>
      )}
    </div>
  );
};

export default App;
