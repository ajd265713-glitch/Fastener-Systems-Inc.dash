import React, { useState, useMemo, useEffect } from 'react';
import { Eye, Warehouse, LayoutGrid, Loader, ArrowUpDown, ChevronUp, ChevronDown, AlertTriangle } from 'lucide-react';
import type { MergedInventoryItem, ReorderInfo } from '../../domain/types';
import { PURCHASING_LOGIC_CONSTANTS, UI_CONSTANTS } from '../../domain/constants';
import { GEMINI_PROMPTS } from '../../services/gemini';
import { useSortableData } from '../../hooks/useSortableData';
import { Pagination, DetailItem, StatusBadge } from '../ui';

const ViewModeButton = ({ id, label, icon: Icon, active, setter }: { id: string, label: string, icon: React.ElementType, active: string, setter: (id: string) => void }) => (
    <button onClick={() => setter(id)} className={`px-3 py-1.5 text-sm font-medium flex items-center gap-2 rounded-md transition-colors ${active === id ? 'bg-card text-primary shadow-sm' : 'text-foreground-muted hover:bg-card-muted'}`}>
        <Icon size={16} /> {label}
    </button>
);

const QuickFilterButton = ({ id, label, active, setter }: { id: string, label: string, active: string, setter: (id: string) => void }) => (
    <button onClick={() => setter(id)} className={`px-3 py-1.5 text-xs font-semibold rounded-full ${active === id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground hover:bg-gray-300 dark:hover:bg-gray-600'}`}>
        {label}
    </button>
);

const StockLevelBar = ({ item, reorderInfo }: { item: MergedInventoryItem, reorderInfo: ReorderInfo }) => {
    const { reorderPoint, targetStock } = reorderInfo;
    const max = Math.max(item.available, targetStock, reorderPoint, item.max || 0) * 1.2;
    if (max === 0) return <div className="h-4 bg-gray-200 rounded-full" />;

    const availablePercent = (item.available / max) * 100;
    const reorderPercent = (reorderPoint / max) * 100;

    let color = 'bg-green-500';
    if (item.available <= reorderPoint) color = 'bg-red-500';
    else if (item.available <= reorderPoint * 1.25) color = 'bg-yellow-500';

    return (
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 relative" title={`Available: ${item.available}\nReorder Point: ${reorderPoint.toFixed(0)}`}>
            <div className={`h-4 rounded-full ${color}`} style={{ width: `${availablePercent}%` }}></div>
            <div className="absolute top-0 h-4 border-r-2 border-red-400" style={{ left: `${reorderPercent}%` }}></div>
        </div>
    );
};

const ItemView = ({ inventory, calculateReorderQty, callGeminiAPI }: { inventory: MergedInventoryItem[], calculateReorderQty: (item: MergedInventoryItem) => ReorderInfo, callGeminiAPI: (prompt: string) => Promise<string> }) => {
    const [currentPage, setCurrentPage] = useState(1);
    const [expandedRows, setExpandedRows] = useState(new Set<string>());
    const { items: sortedInventory, requestSort, sortConfig } = useSortableData(inventory);
    const [analysisResult, setAnalysisResult] = useState("");
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    useEffect(() => setCurrentPage(1), [inventory]);

    const handleAnalysis = async () => {
        setIsAnalyzing(true);
        setAnalysisResult("");
        const summary = {
          totalValue: inventory.reduce((sum, i) => sum + i.inventoryValue, 0),
          totalSkus: new Set(inventory.map(i => i.item)).size,
          topValueItems: [...inventory].sort((a, b) => b.inventoryValue - a.inventoryValue).slice(0, 5),
          lowSupplyItems: inventory.filter(i => calculateReorderQty(i).daysOfSupply < 15)
        };
        const prompt = GEMINI_PROMPTS.inventoryAnalysis(summary);
        const result = await callGeminiAPI(prompt);
        setAnalysisResult(result);
        setIsAnalyzing(false);
    };

    const paginatedInventory = sortedInventory.slice((currentPage - 1) * UI_CONSTANTS.ITEM_VIEW_ITEMS_PER_PAGE, currentPage * UI_CONSTANTS.ITEM_VIEW_ITEMS_PER_PAGE);
    const totalPages = Math.ceil(sortedInventory.length / UI_CONSTANTS.ITEM_VIEW_ITEMS_PER_PAGE);
    const toggleRowExpansion = (id: string) => {
        const newExpanded = new Set(expandedRows);
        if (newExpanded.has(id)) newExpanded.delete(id);
        else newExpanded.add(id);
        setExpandedRows(newExpanded);
    };

    const columns: { key: keyof MergedInventoryItem | 'stockLevel' | 'daysOfSupply' | 'status' | 'details'; label: string; sortable: boolean; classes?: string }[] = [
        { key: 'item', label: 'Item', sortable: true }, { key: 'description', label: 'Description', sortable: true }, { key: 'warehouse', label: 'WH', sortable: true, classes: "text-center" }, { key: 'available', label: 'Available', sortable: true, classes: "text-right" },
        { key: 'stockLevel', label: 'Stock Level', sortable: false }, { key: 'daysOfSupply', label: 'Days Supply', sortable: false, classes: "text-right" }, { key: 'leadTime', label: 'Lead Time (d)', sortable: true, classes: "text-center" },
        { key: 'status', label: 'Status', sortable: false, classes: "text-center" }, { key: 'details', label: 'Details', sortable: false, classes: "text-center" }
    ];

    if (inventory.length === 0) return <div className="text-center p-8 text-gray-500">No inventory data matches your search.</div>

    return (
        <div>
            <div className="flex justify-end mb-4">
                <button onClick={handleAnalysis} disabled={isAnalyzing} className="action-button bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300">
                    {isAnalyzing ? <Loader size={16} className="animate-spin" /> : '✨'} Analyze Current View
                </button>
            </div>
            {analysisResult && (
                <div className="mb-4 p-4 border border-border rounded-lg bg-surface">
                    <h4 className="font-bold text-foreground mb-2">Inventory Analysis ✨</h4>
                    <pre className="prose prose-sm max-w-none text-foreground-muted whitespace-pre-wrap font-sans">{analysisResult}</pre>
                </div>
            )}
            <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-sm">
                    <thead className="bg-card-muted">
                        <tr>
                            {columns.map(col => (
                                <th key={col.key} className={`table-header ${col.classes}`} aria-sort={col.sortable ? (sortConfig?.key === col.key ? sortConfig.direction : 'none') : undefined}>
                                    <div className={`flex items-center gap-1 ${col.classes?.includes('text-right') ? 'justify-end' : col.classes?.includes('text-center') ? 'justify-center' : ''}`}>
                                        {col.label}
                                        {col.sortable && <button onClick={() => requestSort(col.key as keyof MergedInventoryItem)} aria-label={`Sort by ${col.label} ${sortConfig?.key === col.key && sortConfig.direction === 'ascending' ? 'descending' : 'ascending'}`}><ArrowUpDown size={14} className="text-gray-400" /></button>}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {paginatedInventory.map(item => {
                            const reorderInfo = calculateReorderQty(item);
                            const isExpanded = expandedRows.has(item.id);
                            const isLongLeadTime = item.leadTime > PURCHASING_LOGIC_CONSTANTS.LEAD_TIME_WARNING_DAYS;
                            return (
                                <React.Fragment key={item.id}>
                                    <tr className="hover:bg-surface">
                                        <td className="table-cell font-medium text-foreground">{item.item}</td>
                                        <td className="table-cell max-w-xs truncate" title={item.description}>{item.description}</td>
                                        <td className="table-cell text-center">{item.warehouse}</td>
                                        <td className="table-cell text-right font-bold">{item.available?.toLocaleString()}</td>
                                        <td className="table-cell w-32"><StockLevelBar item={item} reorderInfo={reorderInfo} /></td>
                                        <td className="table-cell text-right">{isFinite(reorderInfo.daysOfSupply) ? reorderInfo.daysOfSupply.toFixed(0) : '∞'}</td>
                                        <td className={`table-cell text-center ${isLongLeadTime ? 'text-yellow-600 dark:text-yellow-400 font-semibold' : ''}`}>
                                            {isLongLeadTime && <AlertTriangle size={12} className="inline-block mr-1" />}
                                            {item.leadTime}
                                        </td>
                                        <td className="table-cell text-center"><StatusBadge reorderInfo={reorderInfo} item={item} overstockThreshold={PURCHASING_LOGIC_CONSTANTS.OVERSTOCK_MONTHS_THRESHOLD} /></td>
                                        <td className="table-cell text-center">
                                            <button onClick={() => toggleRowExpansion(item.id)} className="text-gray-400 hover:text-primary" aria-label={isExpanded ? 'Hide details' : 'Show details'} aria-expanded={isExpanded}>
                                                {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                            </button>
                                        </td>
                                    </tr>
                                    {isExpanded && (
                                        <tr>
                                            <td colSpan={columns.length} className="p-3 bg-blue-50 dark:bg-blue-900/10">
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-xs">
                                                    <DetailItem label="Vendor" value={item.vendor || 'N/A'} />
                                                    <DetailItem label="Location(s)" value={item.locations.join(', ') || 'N/A'} />
                                                    <DetailItem label="On Hand" value={item.onHand?.toLocaleString()} />
                                                    <DetailItem label="Committed" value={item.committed?.toLocaleString()} />
                                                    <DetailItem label="Reorder Point" value={reorderInfo.reorderPoint.toFixed(0)} highlight={true} />
                                                    <DetailItem label="Target Stock" value={reorderInfo.targetStock.toFixed(0)} highlight={true} />
                                                    <DetailItem label="Unit Cost" value={`$${item.unitCost?.toFixed(3)}`} />
                                                    <DetailItem label="Inv. Value" value={`$${item.inventoryValue?.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalItems={sortedInventory.length} itemsPerPage={UI_CONSTANTS.ITEM_VIEW_ITEMS_PER_PAGE} />
        </div>
    );
};

const SummaryRow = ({ label, value, color = 'text-foreground' }: { label: string, value: string | number, color?: string }) => (
    <div className="flex justify-between">
        <span className="text-foreground-muted">{label}</span>
        <span className={`font-medium ${color}`}>{value}</span>
    </div>
);

const WarehouseView = ({ inventory, calculateReorderQty }: { inventory: MergedInventoryItem[], calculateReorderQty: (item: MergedInventoryItem) => ReorderInfo }) => {
    const summary = useMemo(() => {
        const data: { [key: string]: any } = { PA: { value: 0, skus: 0, low: 0, over: 0 }, TX: { value: 0, skus: 0, low: 0, over: 0 }, NE: { value: 0, skus: 0, low: 0, over: 0 } };
        inventory.forEach(item => {
            if (!data[item.warehouse]) return;
            data[item.warehouse].value += item.inventoryValue;
            data[item.warehouse].skus += 1;
            if (calculateReorderQty(item).needsReorder) data[item.warehouse].low += 1;
            if (item.available > (item.monthlyAvg || 0) * PURCHASING_LOGIC_CONSTANTS.OVERSTOCK_MONTHS_THRESHOLD) data[item.warehouse].over += 1;
        });
        return Object.entries(data);
    }, [inventory, calculateReorderQty]);

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {summary.map(([wh, data]) => (
                <div key={wh} className="border border-border rounded-lg p-4 bg-card">
                    <h3 className="font-bold text-lg text-foreground">{wh === 'PA' ? 'West Chester (PA)' : wh === 'TX' ? 'Corsicana (TX)' : 'La Vista (NE)'}</h3>
                    <div className="mt-4 space-y-2 text-sm">
                        <SummaryRow label="Total Inventory Value" value={`$${data.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
                        <SummaryRow label="Unique SKUs" value={data.skus.toLocaleString()} />
                        <SummaryRow label="Low Stock Items" value={data.low.toLocaleString()} color="text-red-500" />
                        <SummaryRow label="Overstocked Items" value={data.over.toLocaleString()} color="text-yellow-500" />
                    </div>
                </div>
            ))}
        </div>
    );
};

const CategoryView = ({ inventory, calculateReorderQty }: { inventory: MergedInventoryItem[], calculateReorderQty: (item: MergedInventoryItem) => ReorderInfo }) => {
    const summary = useMemo(() => {
        const data: { [key: string]: any } = {};
        inventory.forEach(item => {
            const category = item.category || 'Uncategorized';
            if (!data[category]) data[category] = { value: 0, skus: 0, low: 0, over: 0, items: [] };
            data[category].value += item.inventoryValue;
            data[category].skus += 1;
            if (calculateReorderQty(item).needsReorder) data[category].low += 1;
            if (item.available > (item.monthlyAvg || 0) * PURCHASING_LOGIC_CONSTANTS.OVERSTOCK_MONTHS_THRESHOLD) data[category].over += 1;
            data[category].items.push(item.item);
        });
        return Object.entries(data).sort((a, b) => b[1].value - a[1].value);
    }, [inventory, calculateReorderQty]);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {summary.map(([cat, data]) => (
                <div key={cat} className="border border-border rounded-lg p-4 bg-card">
                    <h3 className="font-bold text-md truncate" title={cat}>{cat}</h3>
                    <div className="mt-4 space-y-2 text-sm">
                        <SummaryRow label="Total Inventory Value" value={`$${data.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
                        <SummaryRow label="Unique SKUs" value={data.skus.toLocaleString()} />
                        <SummaryRow label="Low Stock Items" value={data.low.toLocaleString()} color="text-red-500" />
                        <SummaryRow label="Overstocked Items" value={data.over.toLocaleString()} color="text-yellow-500" />
                    </div>
                </div>
            ))}
        </div>
    );
}

export const InventoryTab = ({ inventory, calculateReorderQty, callGeminiAPI }: { inventory: MergedInventoryItem[], calculateReorderQty: (item: MergedInventoryItem) => ReorderInfo, callGeminiAPI: (prompt: string) => Promise<string> }) => {
    const [viewMode, setViewMode] = useState('item'); // 'item', 'warehouse', 'category'
    const [quickFilter, setQuickFilter] = useState('all'); // 'all', 'low', 'over'

    const filteredInventory = useMemo(() => {
        if (quickFilter === 'all') return inventory;
        if (quickFilter === 'low') return inventory.filter(i => calculateReorderQty(i).needsReorder);
        if (quickFilter === 'over') return inventory.filter(i => i.available > (i.monthlyAvg || 0) * PURCHASING_LOGIC_CONSTANTS.OVERSTOCK_MONTHS_THRESHOLD);
        return inventory;
    }, [inventory, quickFilter, calculateReorderQty]);

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <div className="flex gap-1 bg-surface p-1 rounded-lg">
                    <ViewModeButton id="item" label="Item View" icon={Eye} active={viewMode} setter={setViewMode} />
                    <ViewModeButton id="warehouse" label="Warehouse View" icon={Warehouse} active={viewMode} setter={setViewMode} />
                    <ViewModeButton id="category" label="Category View" icon={LayoutGrid} active={viewMode} setter={setViewMode} />
                </div>
                <div className="flex gap-2">
                    <QuickFilterButton id="all" label="All Items" active={quickFilter} setter={setQuickFilter} />
                    <QuickFilterButton id="low" label="Low Stock" active={quickFilter} setter={setQuickFilter} />
                    <QuickFilterButton id="over" label="Overstock" active={quickFilter} setter={setQuickFilter} />
                </div>
            </div>
            {viewMode === 'item' && <ItemView inventory={filteredInventory} calculateReorderQty={calculateReorderQty} callGeminiAPI={callGeminiAPI} />}
            {viewMode === 'warehouse' && <WarehouseView inventory={inventory} calculateReorderQty={calculateReorderQty} />}
            {viewMode === 'category' && <CategoryView inventory={inventory} calculateReorderQty={calculateReorderQty} />}
        </div>
    );
};
