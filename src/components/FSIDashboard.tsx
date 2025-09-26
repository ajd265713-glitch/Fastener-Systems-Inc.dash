import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Save, Trash2 } from 'lucide-react';

import { useDataProcessor } from '../hooks/useDataProcessor';
import { useNotification } from '../context/NotificationContext';
import { calculateReorderQty } from '../utils/calculations';
import { copyToClipboard as copyToClipboardUtil } from '../utils/clipboard';
import { callGeminiAPI, GEMINI_PROMPTS } from '../services/gemini';
import type { KpiData, MergedInventoryItem, ReorderInfo } from '../domain/types';

import { UploadTab } from './tabs/UploadTab';
import { InventoryTab } from './tabs/InventoryTab';
import { ReorderWorksheet } from './tabs/ReorderWorksheet';
import { OrdersTab } from './tabs/OrdersTab';
import { SalesOrdersTab } from './tabs/SalesOrdersTab';
import { VendorsTab } from './tabs/VendorsTab';
import { SalesSupportTab } from './tabs/SalesSupportTab';
import { LoadingSpinner, KpiGrid, TabButton, SearchBar, WarehouseSelector } from './ui';

export const FSIDashboard = () => {
    const [activeTab, setActiveTab] = useState('upload');
    const [selectedWarehouse, setSelectedWarehouse] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [initialRedirectDone, setInitialRedirectDone] = useState(false);
    
    const { showNotification } = useNotification();
    const { allData, mergedInventory, filesLoaded, lastUpdated, isProcessing, processingMessage, papaLoaded, saveData, clearData, handleFileUpload, handleMassUpload } = useDataProcessor();
    const { lotData, usageData, poData, salesData, vendorsData } = allData;

    const handleGeminiCall = async (prompt: string): Promise<string> => {
        const result = await callGeminiAPI(prompt);
        if (!result.success) {
            showNotification(result.data, 'error');
        }
        return result.data;
    };

    const copyToClipboard = useCallback((text: string) => {
        copyToClipboardUtil(text, showNotification);
    }, [showNotification]);

    const dataLoaded = lotData.length > 0 && usageData.length > 0;
    
    useEffect(() => {
        if (dataLoaded && !initialRedirectDone) {
            setActiveTab('inventory');
            setInitialRedirectDone(true);
        }
    }, [dataLoaded, initialRedirectDone]);

    const filteredInventory = useMemo(() => {
        if (selectedWarehouse === 'all') return mergedInventory;
        return mergedInventory.filter(i => i.warehouse === selectedWarehouse);
    }, [mergedInventory, selectedWarehouse]);

    const searchedInventory = useMemo(() => {
        if (!searchTerm) return filteredInventory;
        const search = searchTerm.toLowerCase();
        return filteredInventory.filter(item =>
            (item.item ?? '').toLowerCase().includes(search) ||
            (item.description ?? '').toLowerCase().includes(search) ||
            (item.vendor ?? '').toLowerCase().includes(search) ||
            (item.category ?? '').toLowerCase().includes(search)
        );
    }, [filteredInventory, searchTerm]);

    const kpiData: KpiData = useMemo(() => {
        const uniqueSkus = new Set(mergedInventory.map(i => i.item));
        const lowStockItems = mergedInventory.filter(i => calculateReorderQty(i).needsReorder);
        const openPOs = poData.filter(p => p.status === 'Open');
        const uniqueOpenVendors = new Set(openPOs.map(p => p.vendorName).filter(Boolean));
        return {
            totalValue: mergedInventory.reduce((sum, item) => sum + item.inventoryValue, 0),
            totalSkus: uniqueSkus.size, lowStockItems: lowStockItems.length, openPOsCount: openPOs.length,
            openPOValue: openPOs.reduce((sum, po) => sum + (po.openTotal || 0), 0),
            activeVendors: uniqueOpenVendors.size
        };
    }, [mergedInventory, poData]);

    const renderTabContent = () => {
        switch (activeTab) {
            case 'upload': return <UploadTab handleFileUpload={handleFileUpload} filesLoaded={filesLoaded} papaLoaded={papaLoaded} handleMassUpload={handleMassUpload} />;
            case 'inventory': return <InventoryTab inventory={searchedInventory} calculateReorderQty={calculateReorderQty} callGeminiAPI={handleGeminiCall} />;
            case 'reorder': return <ReorderWorksheet inventory={filteredInventory} searchTerm={searchTerm} calculateReorderQty={calculateReorderQty} callGeminiAPI={handleGeminiCall} copyToClipboard={copyToClipboard}/>;
            case 'orders': return <OrdersTab orders={poData} searchTerm={searchTerm} />;
            case 'sales': return <SalesOrdersTab salesData={salesData} searchTerm={searchTerm} />;
            case 'vendors': return <VendorsTab inventory={mergedInventory} vendorsData={vendorsData} calculateReorderQty={calculateReorderQty} searchTerm={searchTerm} />;
            case 'tools': return <SalesSupportTab inventory={mergedInventory} poData={poData} copyToClipboard={copyToClipboard} callGeminiAPI={handleGeminiCall}/>;
            default: return null;
        }
    };

    return (
        <div className="min-h-screen bg-background text-foreground">
            {isProcessing && <LoadingSpinner message={processingMessage} />}
            <header className="bg-card border-b border-border shadow-sm sticky top-0 z-30">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center py-4">
                        <h1 className="text-xl font-bold text-foreground">FSI Purchasing Dashboard</h1>
                        <div className="flex items-center gap-4">
                            {dataLoaded && <button onClick={saveData} className="action-button bg-blue-600 hover:bg-blue-700"><Save size={16} />Save Session</button>}
                            {dataLoaded && <button onClick={clearData} className="action-button bg-red-600 hover:bg-red-700"><Trash2 size={16} />Clear Data</button>}
                            <p className="text-xs text-foreground-muted">Last update: {lastUpdated || 'N/A'}</p>
                        </div>
                    </div>
                </div>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                        <TabButton id="upload" activeTab={activeTab} setActiveTab={setActiveTab} dataLoaded={true} />
                        <TabButton id="inventory" activeTab={activeTab} setActiveTab={setActiveTab} dataLoaded={dataLoaded} /><TabButton id="reorder" activeTab={activeTab} setActiveTab={setActiveTab} dataLoaded={dataLoaded} />
                        <TabButton id="orders" activeTab={activeTab} setActiveTab={setActiveTab} dataLoaded={dataLoaded} /><TabButton id="sales" activeTab={activeTab} setActiveTab={setActiveTab} dataLoaded={dataLoaded} />
                        <TabButton id="vendors" activeTab={activeTab} setActiveTab={setActiveTab} dataLoaded={dataLoaded} /><TabButton id="tools" activeTab={activeTab} setActiveTab={setActiveTab} dataLoaded={dataLoaded} />
                    </nav>
                </div>
            </header>
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {dataLoaded && <KpiGrid kpis={kpiData} />}
                <div className="grid grid-cols-4 gap-4 mb-4">
                    <div className="col-span-4 lg:col-span-3">{dataLoaded && <SearchBar term={searchTerm} onSearch={setSearchTerm} tab={activeTab} />}</div>
                    <div className="col-span-4 lg:col-span-1">{dataLoaded && activeTab !== 'orders' && activeTab !== 'sales' && activeTab !== 'vendors' && activeTab !== 'tools' && (<WarehouseSelector selected={selectedWarehouse} onChange={setSelectedWarehouse} />)}</div>
                </div>
                <div id={`panel-${activeTab}`} role="tabpanel" aria-labelledby={`tab-${activeTab}`}>{renderTabContent()}</div>
            </main>
        </div>
    );
};
