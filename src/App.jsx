import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area
} from 'recharts';
// Framer motion removed for standard rendering
import { 
  Download, Search, Filter, TrendingDown, TrendingUp, Loader2,
  Trash2, Calendar, Activity, PlusCircle, Briefcase, ArrowDownUp,
  PieChart as PieChartIcon, LayoutDashboard, LineChart as ChartIcon, Target, Wallet
} from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { exportToExcel } from './utils/ExcelExport';
import { extractMovementsFromPDF } from './utils/PDFProcessor';

const PIE_COLORS = ['#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#22c55e', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6'];
const CATEGORIES = ['Transferencia', 'Alimentos', 'Súper / Tienda', 'Gasolina', 'Transporte', 'Servicios / Shopping', 'Salud', 'Efectivo', 'Ingreso Mensual', 'Cargos Bancarios', 'Otros'];

const App = () => {
  const [movements, setMovements] = useState(() => {
    const saved = localStorage.getItem('miner_movements_v4');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [isParsing, setIsParsing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentTab, setCurrentTab] = useState('dashboard');
  const fileInputRef = useRef(null);
  
  // V4 Advanced Filters
  const [filterBank, setFilterBank] = useState('ALL');
  const [filterType, setFilterType] = useState('ALL');
  const [filterMinAmount] = useState('');
  const [filterMaxAmount] = useState('');
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });

  const [catMemory, setCatMemory] = useState(() => {
    const saved = localStorage.getItem('miner_cat_memory_v4');
    return saved ? JSON.parse(saved) : {};
  });

  const [budgets, setBudgets] = useState(() => {
    const saved = localStorage.getItem('miner_budgets_v4');
    return saved ? JSON.parse(saved) : {};
  });

  useEffect(() => { localStorage.setItem('miner_movements_v4', JSON.stringify(movements)); }, [movements]);
  useEffect(() => { localStorage.setItem('miner_cat_memory_v4', JSON.stringify(catMemory)); }, [catMemory]);
  useEffect(() => { localStorage.setItem('miner_budgets_v4', JSON.stringify(budgets)); }, [budgets]);

  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;
    setIsParsing(true);
    let allNewMovements = [];
    toast.info(`Iniciando Motor Analítico para ${files.length} archivos...`);

    for (const file of files) {
      try {
        const fileMovements = await extractMovementsFromPDF(file);
        if (fileMovements.length > 0) {
            allNewMovements = [...allNewMovements, ...fileMovements];
            toast.success(`${file.name}: Procesado con éxito.`);
        } else {
            toast.warning(`${file.name}: Sin movimientos reconocibles.`);
        }
      } catch (err) {
        toast.error(`Error procesando ${file.name}`);
        console.error(err);
      }
    }

    if (allNewMovements.length > 0) {
        setMovements(prev => {
          const combined = [...allNewMovements, ...prev];
          const seen = new Set();
          return combined.filter(m => {
            const key = `${m.date}-${m.description.substring(0,25)}-${m.amount}-${m.bank}`;
            if (seen.has(key)) return false;
            seen.add(key); return true;
          });
        });
    }
    setIsParsing(false);
    event.target.value = null; 
  };

  const processedData = useMemo(() => {
    return movements.map(m => ({
        ...m, category: catMemory[m.description] || m.category, amount: parseFloat(m.amount)
    }));
  }, [movements, catMemory]);

  const availableBanks = useMemo(() => Array.from(new Set(processedData.map(m => m.bank))), [processedData]);

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

    result.sort((a, b) => {
        if (sortConfig.key === 'date') {
            if (a.date < b.date) return sortConfig.direction === 'asc' ? -1 : 1;
            if (a.date > b.date) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        }
        if (sortConfig.key === 'amount') return sortConfig.direction === 'asc' ? a.amount - b.amount : b.amount - a.amount;
        return 0;
    });
    return result;
  }, [searchTerm, filterBank, filterType, filterMinAmount, filterMaxAmount, filterDateStart, filterDateEnd, processedData, sortConfig]);

  const analytics = useMemo(() => {
    let income = 0; let expenses = 0;
    let topExpense = { amount: 0, description: 'N/A', date: '' };
    let topIncome = { amount: 0, description: 'N/A', date: '' };
    const categoryTotals = {};
    const monthlyData = {};

    filteredData.forEach(m => {
        // Monthly trend datamining
        const monthKey = m.date.substring(0, 7); // YYYY-MM
        if (!monthlyData[monthKey]) monthlyData[monthKey] = { name: monthKey, Ingresos: 0, Egresos: 0 };

        if (m.type === 'Ingreso') {
            income += m.amount;
            monthlyData[monthKey].Ingresos += m.amount;
            if (m.amount > topIncome.amount) topIncome = m;
        } else {
            expenses += m.amount;
            monthlyData[monthKey].Egresos += m.amount;
            if (m.amount > topExpense.amount) topExpense = m;
            if (!categoryTotals[m.category]) categoryTotals[m.category] = 0;
            categoryTotals[m.category] += m.amount;
        }
    });

    const categoryData = Object.keys(categoryTotals)
        .map(cat => ({ name: cat, value: categoryTotals[cat] }))
        .sort((a, b) => b.value - a.value);

    // Sort monthly trend chronologically
    const trendData = Object.values(monthlyData).sort((a, b) => a.name.localeCompare(b.name));

    return { income, expenses, balance: income - expenses, count: filteredData.length, topExpense, topIncome, categoryData, categoryTotals, trendData };
  }, [filteredData]);

  const handleSort = (key) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));
  };

  const updateCategory = (description, newCat) => {
    setCatMemory(prev => ({ ...prev, [description]: newCat }));
    toast.success("Regla de categorización configurada");
  };

  const updateBudget = (cat, amount) => {
    setBudgets(prev => ({ ...prev, [cat]: amount }));
  };

  const clearHistory = () => {
    if (window.confirm('¿Confirmar purga total de la base de datos cronológica?')) {
      setMovements([]);
      toast.info("Matriz de datos reiniciada");
    }
  };

  const renderTopNav = () => (
    <header className="flex flex-col md:flex-row items-center justify-between gap-6 mb-8 pt-4">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-primary/20 border border-primary/40 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(59,130,246,0.5)]">
          <Activity className="w-6 h-6 text-primary-glow" />
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white drop-shadow-[0_2px_10px_rgba(255,255,255,0.2)]">
            STATEMENT <span className="text-primary-glow">MINER</span>
          </h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em]">Obsidian Analytics Engine</p>
        </div>
      </div>
      <div className="flex gap-2">
        {['dashboard', 'analytics', 'budget'].map(tab => (
          <button 
            key={tab} 
            onClick={() => setCurrentTab(tab)}
            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${currentTab === tab ? 'bg-primary text-white shadow-[0_0_15px_rgba(59,130,246,0.4)]' : 'bg-surface-elevated text-slate-400 hover:text-white hover:bg-surface-elevated/80 border border-border'}`}
          >
            {tab === 'dashboard' && <LayoutDashboard className="w-3 h-3 inline mr-2 mb-0.5" />}
            {tab === 'analytics' && <ChartIcon className="w-3 h-3 inline mr-2 mb-0.5" />}
            {tab === 'budget' && <Target className="w-3 h-3 inline mr-2 mb-0.5" />}
            {tab}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button onClick={() => fileInputRef.current?.click()} className="btn-primary" disabled={isParsing}>
          {isParsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
          Importar PDFs
        </button>
        <button onClick={() => exportToExcel(processedData)} className="btn-secondary" title="Exportar Matriz Excel" disabled={movements.length === 0}>
          <Download className="w-4 h-4" />
        </button>
        <button onClick={clearHistory} className="btn-ghost flex-shrink-0 text-danger hover:bg-danger/10 hover:text-danger" title="Borrar Extracción" disabled={isParsing}>
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </header>
  );

  const renderDashboardView = () => (
    <div className="space-y-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="panel p-8 col-span-1 md:col-span-6 relative overflow-hidden group">
          <div className="absolute -right-10 -top-10 w-40 h-40 bg-primary/10 rounded-full blur-3xl group-hover:bg-primary/20 transition-all duration-700"></div>
          <div className="relative z-10 flex flex-col justify-between h-full">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Balance del Periodo Filtrado</span>
              <div className="text-5xl font-black tracking-tighter mt-2 text-white drop-shadow-md">
                ${analytics.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="flex gap-8 mt-8 border-t border-border pt-6">
              <div>
                <div className="text-[10px] font-bold text-success uppercase tracking-[0.2em]">Ingresos</div>
                <div className="text-xl font-black text-white">+${analytics.income.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-white uppercase tracking-[0.2em]">Egresos</div>
                <div className="text-xl font-black text-slate-300">-${analytics.expenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="panel p-6 col-span-1 md:col-span-3 flex flex-col justify-between group">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4 text-white" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Gasto Mayor</span>
          </div>
          <div className="text-3xl font-black text-white">-${analytics.topExpense.amount.toLocaleString()}</div>
          <div className="mt-4 text-xs font-bold text-slate-300 uppercase truncate">{analytics.topExpense.description}</div>
          <div className="text-[9px] font-bold text-slate-500 tracking-widest mt-1 bg-surface py-1 rounded inline-block w-fit px-2 border border-border">{analytics.topExpense.date}</div>
        </div>

        <div className="panel p-6 col-span-1 md:col-span-3 flex flex-col justify-between group">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-success" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Ingreso Mayor</span>
          </div>
          <div className="text-3xl font-black text-success drop-shadow-[0_0_8px_rgba(34,197,94,0.4)]">+${analytics.topIncome.amount.toLocaleString()}</div>
          <div className="mt-4 text-xs font-bold text-slate-300 uppercase truncate">{analytics.topIncome.description}</div>
          <div className="text-[9px] font-bold text-slate-500 tracking-widest mt-1 bg-surface py-1 rounded inline-block w-fit px-2 border border-border">{analytics.topIncome.date}</div>
        </div>
      </div>

      {/* Advanced Filters */}
      <div className="panel p-5">
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex flex-col gap-2 min-w-[200px]">
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2"><Calendar className="w-3 h-3"/> Rango Dinámico</span>
            <div className="flex items-center gap-2">
              <input type="date" value={filterDateStart} onChange={(e) => setFilterDateStart(e.target.value)} className="input-minimal" />
              <input type="date" value={filterDateEnd} onChange={(e) => setFilterDateEnd(e.target.value)} className="input-minimal" />
            </div>
          </div>
          <div className="flex flex-col gap-2 flex-grow">
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2"><Filter className="w-3 h-3"/> Parametrización</span>
            <div className="flex gap-3">
              <select value={filterBank} onChange={(e) => setFilterBank(e.target.value)} className="input-minimal text-xs uppercase cursor-pointer">
                <option value="ALL">Total Instituciones</option>
                {availableBanks.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="input-minimal text-xs uppercase cursor-pointer">
                <option value="ALL">Flujo Completo</option>
                <option value="INGRESO">Ingresos</option>
                <option value="EGRESO">Egresos</option>
              </select>
              <div className="relative flex-grow min-w-[150px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input type="text" placeholder="BUSCAR..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="input-minimal pl-9 text-xs uppercase" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="panel overflow-hidden border border-border">
          <div className="p-4 bg-surface-elevated/50 border-b border-border flex justify-between items-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400"><Activity className="w-3 h-3 inline mr-1 shadow-primary-glow"/> {analytics.count} Movimientos</span>
              {filterDateStart || filterDateEnd ? <span className="text-[9px] font-bold bg-primary/20 text-primary-glow px-2 py-0.5 rounded border border-primary/30 uppercase tracking-widest">Filtros Activos</span> : null}
          </div>
          <div className="overflow-x-auto max-h-[600px] custom-scrollbar">
              <table className="w-full text-left border-collapse">
                  <thead className="bg-surface sticky top-0 z-10 shadow-md">
                      <tr className="text-slate-400 text-[10px] uppercase font-black tracking-[0.2em] border-b border-border">
                          <th className="px-6 py-4 cursor-pointer hover:text-white transition-colors whitespace-nowrap" onClick={() => handleSort('date')}>
                              <div className="flex items-center gap-2">Fecha ISO <ArrowDownUp className="w-3 h-3 opacity-50"/></div>
                          </th>
                          <th className="px-6 py-4 whitespace-nowrap">Banco</th>
                          <th className="px-6 py-4 w-full">Concepto</th>
                          <th className="px-6 py-4 whitespace-nowrap">Categoría</th>
                          <th className="px-6 py-4 text-right cursor-pointer hover:text-white transition-colors whitespace-nowrap" onClick={() => handleSort('amount')}>
                              <div className="flex items-center justify-end gap-2">Importe <ArrowDownUp className="w-3 h-3 opacity-50"/></div>
                          </th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-transparent">
                      {filteredData.map((m, i) => (
                          <tr key={i} className="hover:bg-surface-elevated/40 transition-colors group">
                              <td className="px-6 py-4">
                                  <span className="text-xs font-bold text-slate-300 font-mono bg-surface px-2 py-1 rounded border border-border block w-fit">{m.date}</span>
                              </td>
                              <td className="px-6 py-4">
                                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{m.bank}</span>
                              </td>
                              <td className="px-6 py-4">
                                  <div className="text-sm font-semibold text-slate-200 uppercase leading-snug">{m.description}</div>
                              </td>
                              <td className="px-6 py-4">
                                  <select 
                                      value={m.category} onChange={(e) => updateCategory(m.description, e.target.value)}
                                      className="text-[10px] font-black tracking-widest text-slate-400 bg-surface-elevated border border-border rounded hover:border-primary focus:ring-1 focus:ring-primary py-1.5 px-2 cursor-pointer transition-all w-full uppercase outline-none"
                                  >
                                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                  </select>
                              </td>
                              <td className={`px-6 py-4 text-right font-mono font-black text-sm whitespace-nowrap ${m.type === 'Ingreso' ? 'text-success drop-shadow-[0_0_5px_rgba(34,197,94,0.3)]' : 'text-slate-100'}`}>
                                  {m.type === 'Ingreso' ? '+' : '-'}${m.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                          </tr>
                      ))}
                      {filteredData.length === 0 && (
                        <tr><td colSpan="5" className="px-6 py-20 text-center text-slate-500 font-bold uppercase tracking-widest text-xs">No hay datos coincidentes</td></tr>
                      )}
                  </tbody>
              </table>
          </div>
      </div>
    </div>
  );

  const renderAnalyticsView = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="panel p-6 h-[400px] flex flex-col">
          <div className="flex items-center gap-2 mb-6">
            <PieChartIcon className="w-5 h-5 text-primary-glow" />
            <h3 className="text-sm font-bold text-white uppercase tracking-widest">Distribución de Gastos</h3>
          </div>
          <div className="flex-grow">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={analytics.categoryData.slice(0, 8)} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value" stroke="none">
                  {analytics.categoryData.map((entry, index) => <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                </Pie>
                <RechartsTooltip formatter={(value) => `$${value.toLocaleString()}`} contentStyle={{ backgroundColor: '#131b2e', borderColor: '#283044', borderRadius: '8px', color: '#fff', fontSize: '12px' }} itemStyle={{ color: '#fff' }} />
                <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: '10px', color: '#dae2fd', fontWeight: 'bold', textTransform: 'uppercase' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel p-6 h-[400px] flex flex-col">
          <div className="flex items-center gap-2 mb-6">
            <Activity className="w-5 h-5 text-success" />
            <h3 className="text-sm font-bold text-white uppercase tracking-widest">Flujo Mensual (Ingresos vs Egresos)</h3>
          </div>
          <div className="flex-grow">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analytics.trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorIngresos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorEgresos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#283044" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickMargin={10} axisLine={false} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={10} tickFormatter={(val) => `$${val/1000}k`} axisLine={false} tickLine={false} />
                <RechartsTooltip contentStyle={{ backgroundColor: '#131b2e', borderColor: '#283044', borderRadius: '8px', color: '#fff', fontSize: '12px' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '20px', fontWeight: 'bold' }} />
                <Area type="monotone" dataKey="Ingresos" stroke="#22c55e" strokeWidth={3} fillOpacity={1} fill="url(#colorIngresos)" />
                <Area type="monotone" dataKey="Egresos" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorEgresos)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );

  const renderBudgetView = () => (
    <div className="space-y-6">
      <div className="panel p-6 border-l-4 border-l-primary flex bg-surface-elevated/50 justify-between items-center">
        <div>
          <h2 className="text-lg font-black text-white uppercase tracking-widest mb-1 shadow-sm">Supervisión de Presupuestos</h2>
          <p className="text-xs font-medium text-slate-400">Establece límites para rastrear tus egresos de manera proactiva según los filtros actuales.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {CATEGORIES.filter(c => c !== 'Ingreso Mensual' && c !== 'Transferencia' && c !== 'Otros').map(cat => {
          const spent = analytics.categoryTotals[cat] || 0;
          const limit = budgets[cat] || 0;
          const percentage = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0;
          const isOver = spent > limit && limit > 0;

          return (
            <div key={cat} className="panel p-6 flex flex-col gap-4">
              <div className="flex justify-between items-start">
                <span className="text-sm font-bold uppercase tracking-widest text-slate-200">{cat}</span>
                <Wallet className={`w-5 h-5 ${isOver ? 'text-danger' : 'text-primary'}`} />
              </div>
              
              <div>
                <div className="flex justify-between text-xs mb-2">
                  <span className="font-bold text-slate-400">Gasto Actual</span>
                  <span className={`font-black ${isOver ? 'text-danger drop-shadow-md' : 'text-white'}`}>${spent.toLocaleString()}</span>
                </div>
                <div className="h-2 w-full bg-surface-elevated rounded-full overflow-hidden border border-border">
                  <div 
                    className={`h-full transition-all duration-1000 ${isOver ? 'bg-danger' : 'bg-gradient-to-r from-primary to-primary-glow'}`} 
                    style={{ width: `${percentage}%` }}
                  ></div>
                </div>
                {limit > 0 && <div className="text-[10px] font-bold text-right mt-1 text-slate-500 uppercase">{percentage.toFixed(0)}% de Límite</div>}
              </div>

              <div className="mt-auto border-t border-border pt-4">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1 block">Límite Mensual ($)</span>
                <div className="flex items-center gap-2">
                  <input 
                    type="number" 
                    value={budgets[cat] || ''}
                    placeholder="0.00"
                    onChange={(e) => updateBudget(cat, parseFloat(e.target.value) || 0)}
                    className="input-minimal text-xs py-1.5 font-mono"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen p-4 md:p-8 relative">
      <Toaster position="top-right" theme="dark" richColors />
      <input ref={fileInputRef} type="file" multiple accept=".pdf" className="hidden" onChange={handleFileUpload} disabled={isParsing} />
      
      {!movements.length && !isParsing ? (
        <div className="max-w-3xl mx-auto mt-20 panel p-12 text-center border-dashed border-2 bg-transparent relative overflow-hidden group">
            <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="w-20 h-20 bg-surface-container rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-[0_0_30px_rgba(59,130,246,0.2)] border border-primary/30 group-hover:scale-110 transition-transform">
                <LayoutDashboard className="w-10 h-10 text-primary-glow drop-shadow-[0_0_8px_rgba(96,165,250,0.8)]" />
            </div>
            <h2 className="text-3xl font-black text-white mb-4 tracking-tighter uppercase drop-shadow-md">Motor Obsidian Activado</h2>
            <p className="text-slate-400 text-sm mb-10 leading-relaxed max-w-lg mx-auto font-medium">
                Importa estados de BBVA, Inbursa o Scotiabank. El Motor extraerá la semántica y reconstruirá la cronología en una interfaz Premium de alto contraste.
            </p>
            <button onClick={() => fileInputRef.current?.click()} className="btn-primary mx-auto w-fit px-10 py-4 text-base shadow-xl" disabled={isParsing}>
                Ingresar Estados de Cuenta
            </button>
        </div>
      ) : (
        <div className="max-w-7xl mx-auto">
          {renderTopNav()}
          <div className="mt-6">
            {currentTab === 'dashboard' && React.cloneElement(renderDashboardView(), { key: 'dashboard' })}
            {currentTab === 'analytics' && React.cloneElement(renderAnalyticsView(), { key: 'analytics' })}
            {currentTab === 'budget' && React.cloneElement(renderBudgetView(), { key: 'budget' })}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
