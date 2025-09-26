import React from 'react';
import { Search, AlertCircle, TrendingUp, Package, Truck, Calendar, Filter, Download, ChevronDown, ChevronUp, AlertTriangle, CheckCircle, Clock, DollarSign, Upload, FileText, RefreshCw, Save, BarChart, Users, ArrowUpDown, XCircle, Trash2, Loader, Copy, Wand2, Eye, Warehouse, LayoutGrid, ChevronRight, Files } from 'lucide-react';
import type { FileInfo, KpiData, MergedInventoryItem, ReorderInfo } from '../domain/types';

export const LoadingSpinner = ({ message }: { message: string }) => (
    <div className="fixed inset-0 bg-white dark:bg-gray-900 bg-opacity-75 dark:bg-opacity-75 flex flex-col items-center justify-center z-50">
        <Loader className="w-12 h-12 text-primary animate-spin" />
        <p className="mt-4 text-lg text-foreground font-medium">{message}</p>
    </div>
);

const KpiCard = ({ title, value, icon: Icon, color }: { title: string, value: string | number, icon: React.ElementType, color: string }) => {
    const colors: { [key: string]: string } = { blue: 'text-blue-500', purple: 'text-purple-500', red: 'text-red-500', green: 'text-green-500', yellow: 'text-yellow-500', indigo: 'text-indigo-500' };
    return (
        <div className="bg-card rounded-lg shadow-sm p-4 flex items-center justify-between border border-border">
            <div>
                <p className="text-sm text-foreground-muted">{title}</p>
                <p className="text-xl font-bold text-foreground">{value}</p>
            </div>
            <Icon className={`w-8 h-8 ${colors[color]}`} />
        </div>
    );
};

export const KpiGrid = ({ kpis }: { kpis: KpiData }) => (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <KpiCard title="Inventory Value" value={`$${kpis.totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}`} icon={DollarSign} color="blue" />
        <KpiCard title="Total SKUs" value={kpis.totalSkus.toLocaleString()} icon={Package} color="purple" />
        <KpiCard title="Low Stock Items" value={kpis.lowStockItems} icon={AlertTriangle} color="red" />
        <KpiCard title="Open POs" value={kpis.openPOsCount} icon={FileText} color="green" />
        <KpiCard title="Open PO Value" value={`$${kpis.openPOValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}`} icon={DollarSign} color="yellow" />
        <KpiCard title="Active Vendors" value={kpis.activeVendors} icon={Users} color="indigo" />
    </div>
);

const getTabButtonClasses = (isActive: boolean, isDisabled: boolean): string => {
    const base = 'py-3 px-1 border-b-2 font-medium text-sm capitalize transition-colors';
    const activeClasses = 'border-primary text-primary';
    const inactiveClasses = 'border-transparent text-foreground-muted hover:text-foreground hover:border-gray-300 dark:hover:border-gray-600';
    const disabledClasses = 'opacity-50 cursor-not-allowed';
    return `${base} ${isActive ? activeClasses : inactiveClasses} ${isDisabled ? disabledClasses : ''}`;
};

export const TabButton = (props: { id: string, activeTab: string, setActiveTab: (id: string) => void, dataLoaded: boolean }) => {
    const { id, activeTab, setActiveTab, dataLoaded } = props;
    const labels: { [key: string]: string } = { upload: 'Upload Data', inventory: 'Inventory', reorder: 'Reorder Worksheet', orders: 'Open POs', sales: 'Sales Orders', vendors: 'Vendors', tools: 'Sales Support' };
    const disabled = !dataLoaded && id !== 'upload';
    const buttonClasses = getTabButtonClasses(activeTab === id, disabled);
    return (
        <button id={`tab-${id}`} role="tab" aria-controls={`panel-${id}`} aria-selected={activeTab === id} onClick={() => setActiveTab(id)} disabled={disabled} className={buttonClasses}>
            {labels[id]}
        </button>
    );
};

export const WarehouseSelector = ({ selected, onChange }: { selected: string, onChange: (value: string) => void }) => (
    <select value={selected} onChange={(e) => onChange(e.target.value)} aria-label="Select a warehouse to filter inventory" className="px-3 py-2 border border-border rounded-md text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary w-full">
        <option value="all">All Warehouses</option>
        <option value="PA">West Chester (PA)</option>
        <option value="TX">Corsicana (TX)</option>
        <option value="NE">La Vista (NE)</option>
    </select>
);

export const SearchBar = ({ term, onSearch, tab }: { term: string, onSearch: (value: string) => void, tab: string }) => {
    if (tab === 'tools') return null;
    let placeholder = "Search items, descriptions, vendors...";
    if (tab === 'orders') placeholder = "Search by PO#, Vendor...";
    if (tab === 'sales') placeholder = "Search by SO#, Customer, Item...";
    if (tab === 'vendors') placeholder = "Search by Vendor Name or Code...";

    return (
        <div className="mb-4 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input type="text" placeholder={placeholder} aria-label={placeholder} value={term} onChange={(e) => onSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-card text-foreground"
            />
        </div>
    );
};

export const FileUploadBox = (props: { type: string, title: string, description: string, icon: React.ElementType, onUpload: (file: File, type: string) => void, fileInfo?: FileInfo, disabled: boolean }) => {
    const { type, title, description, icon: Icon, onUpload, fileInfo, disabled } = props;
    return (
        <div className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${fileInfo ? 'border-green-400 bg-green-50 dark:border-green-700 dark:bg-green-900/20' : 'border-border'} ${!disabled && 'hover:border-primary'} ${disabled ? 'opacity-60' : ''}`}>
            <Icon className="mx-auto h-10 w-10 text-gray-400" />
            <p className="mt-2 text-sm font-medium text-foreground">{title}</p>
            <p className="mt-1 text-xs text-foreground-muted">{description}</p>
            <input type="file" accept=".csv" onChange={(e) => e.target.files && e.target.files[0] && onUpload(e.target.files[0], type)} className="hidden" id={`${type}-upload`} disabled={disabled} />
            <label htmlFor={`${type}-upload`} className={`mt-3 inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white ${disabled ? 'bg-gray-400 cursor-not-allowed' : 'bg-primary hover:bg-primary-dark cursor-pointer'}`}>
                <Upload className="w-4 h-4 mr-2" /> Choose File
            </label>
            {fileInfo && (<div className="mt-2 text-xs text-green-700 dark:text-green-400 truncate" title={fileInfo.name}>✓ {fileInfo.name} ({fileInfo.count})</div>)}
        </div>
    );
};

export const Pagination = ({ currentPage, totalPages, onPageChange, totalItems, itemsPerPage }: { currentPage: number, totalPages: number, onPageChange: (page: number) => void, totalItems: number, itemsPerPage: number }) => {
    if (totalPages <= 1) return null;
    const startItem = (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalItems);
    return (
        <div className="flex justify-between items-center mt-4 px-2 py-2">
            <p className="text-sm text-foreground-muted">Showing <span className="font-medium text-foreground">{startItem}</span> to <span className="font-medium text-foreground">{endItem}</span> of <span className="font-medium text-foreground">{totalItems}</span> results</p>
            <div className="flex items-center gap-2">
                <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} className="pagination-button" aria-label="Go to previous page">Previous</button>
                <span className="text-sm text-foreground-muted">Page {currentPage} of {totalPages}</span>
                <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages} className="pagination-button" aria-label="Go to next page">Next</button>
            </div>
        </div>
    );
};

export const DetailItem = ({ label, value, highlight = false }: { label: string, value: string | number, highlight?: boolean }) => (<div><p className="text-gray-500 dark:text-gray-400">{label}</p><p className={`font-medium ${highlight ? 'text-primary' : 'text-foreground'}`}>{value}</p></div>);

export const StatusBadge = ({ reorderInfo, item, overstockThreshold }: { reorderInfo: ReorderInfo, item: MergedInventoryItem, overstockThreshold: number }) => {
    if (reorderInfo.needsReorder) return <span className="status-badge bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">Reorder</span>;
    if (item.available > (item.monthlyAvg || 0) * overstockThreshold) return <span className="status-badge bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">Overstock</span>;
    return <span className="status-badge bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">OK</span>;
};

export const FreightProgressBar = ({ value, goal }: { value: number, goal: number }) => {
    if (goal <= 0) return null;
    const percentage = Math.min((value / goal) * 100, 100);
    let colorClass = 'bg-red-500';
    if (percentage >= 100) colorClass = 'bg-green-500';
    else if (percentage > 50) colorClass = 'bg-yellow-500';

    return (
        <div className="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700 mt-1" title={`${percentage.toFixed(0)}% to freight goal`}>
            <div className={`${colorClass} h-2 rounded-full`} style={{ width: `${percentage}%` }}></div>
        </div>
    );
};
