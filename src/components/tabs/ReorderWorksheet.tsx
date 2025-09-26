import React, { useState, useMemo } from 'react';
import { Download, Loader, Copy, CheckCircle, TrendingUp } from 'lucide-react';

import type { MergedInventoryItem, ReorderInfo } from '../../domain/types';
import { VENDOR_DETAILS } from '../../domain/vendorDetails';
import { GEMINI_PROMPTS } from '../../services/gemini';
import { useNotification } from '../../context/NotificationContext';
import { parseFreightGoal } from '../../utils/helpers';
import { FreightProgressBar } from '../ui';

export const ReorderWorksheet = ({ inventory, searchTerm, calculateReorderQty, callGeminiAPI, copyToClipboard }: { inventory: MergedInventoryItem[], searchTerm: string, calculateReorderQty: (item: MergedInventoryItem) => ReorderInfo, callGeminiAPI: (prompt: string) => Promise<string>, copyToClipboard: (text: string) => void }) => {
    const { showNotification } = useNotification();
    const [editedQuantities, setEditedQuantities] = useState<{ [key: string]: number }>({});
    const [draftingVendor, setDraftingVendor] = useState<string | null>(null);
    const [emailDraft, setEmailDraft] = useState("");

    const reorderItems = useMemo(() => {
        const allReorderItems = inventory.filter(item => calculateReorderQty(item).needsReorder);
        if (!searchTerm) {
            return allReorderItems;
        }
        const search = searchTerm.toLowerCase();
        return allReorderItems.filter(item =>
            (item.item ?? '').toLowerCase().includes(search) ||
            (item.description ?? '').toLowerCase().includes(search) ||
            (item.vendor ?? '').toLowerCase().includes(search)
        );
    }, [inventory, searchTerm, calculateReorderQty]);

    const itemsByVendor = useMemo(() => {
        return reorderItems.reduce((acc: { [key: string]: MergedInventoryItem[] }, item) => {
            const vendor = item.vendor || 'Unknown Vendor';
            if (!acc[vendor]) acc[vendor] = [];
            acc[vendor].push(item);
            return acc;
        }, {});
    }, [reorderItems]);

    const handleDraftEmail = async (vendor: string, items: MergedInventoryItem[]) => {
        setDraftingVendor(vendor);
        setEmailDraft("");
        const itemsWithFinalQty = items.map(item => ({
            ...item,
            finalQty: editedQuantities[item.id] ?? calculateReorderQty(item).suggested
        }));
        const prompt = GEMINI_PROMPTS.reorderEmail(vendor, itemsWithFinalQty);
        const result = await callGeminiAPI(prompt);
        setEmailDraft(result);
        setDraftingVendor(null);
    };

    const handleQtyChange = (itemId: string, value: string) => setEditedQuantities(prev => ({ ...prev, [itemId]: parseInt(value, 10) || 0 }));

    const exportByVendor = (vendor: string, items: MergedInventoryItem[]) => {
        const dataToExport = items.map(item => {
            const reorderInfo = calculateReorderQty(item);
            const finalQty = editedQuantities[item.id] ?? reorderInfo.suggested;
            return { 'FSI Part #': item.item, 'Description': item.description, 'Warehouse': item.warehouse, 'Order Quantity': finalQty, 'Unit Cost': item.unitCost, 'Total Value': finalQty * (item.unitCost || 0) };
        });

        if (!(window as any).Papa) return;
        const csv = (window as any).Papa.unparse(dataToExport);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.setAttribute("href", URL.createObjectURL(blob));
        link.setAttribute("download", `PO_Suggestion_${vendor}_${new Date().toISOString().split('T')[0]}.csv`);
        link.click();
        showNotification(`Exported PO suggestion for ${vendor}.`);
    };

    if (reorderItems.length === 0) return <div className="text-center p-8 text-gray-500">No items need reordering based on current filters.</div>;

    return (
        <div className="space-y-6">
            {emailDraft && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40" onClick={() => setEmailDraft("")}>
                    <div className="bg-card rounded-lg shadow-xl p-6 w-full max-w-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold mb-4 text-foreground">✨Email Draft</h3>
                        <textarea className="w-full h-64 p-2 border border-border rounded-md font-mono text-sm bg-surface text-foreground" value={emailDraft} readOnly />
                        <div className="flex justify-end gap-2 mt-4">
                            <button onClick={() => copyToClipboard(emailDraft)} className="action-button bg-blue-600 hover:bg-blue-700"><Copy size={16} /> Copy</button>
                            <button onClick={() => setEmailDraft("")} className="action-button bg-gray-500 hover:bg-gray-600">Close</button>
                        </div>
                    </div>
                </div>
            )}
            {Object.entries(itemsByVendor).map(([vendor, items]: [string, MergedInventoryItem[]]) => {
                const totalValue = items.reduce((sum, item) => {
                    const finalQty = editedQuantities[item.id] ?? calculateReorderQty(item).suggested;
                    return sum + (finalQty * (item.unitCost || 0));
                }, 0);

                const vendorCode = items[0]?.vendorCode;
                const vendorDetails = vendorCode ? VENDOR_DETAILS[vendorCode] : null;
                const freightInfo = vendorDetails?.freightInfo;
                const freightGoal = parseFreightGoal(freightInfo || '');

                let freightHighlightClass = 'bg-card-muted';
                let freightIcon = null;
                if (freightGoal > 0) {
                    const percentage = totalValue / freightGoal;
                    if (percentage >= 1) {
                        freightHighlightClass = 'bg-green-50 dark:bg-green-900/20';
                        freightIcon = <CheckCircle size={18} className="text-green-500" />;
                    } else if (percentage >= 0.8) {
                        freightHighlightClass = 'bg-yellow-50 dark:bg-yellow-900/20';
                        freightIcon = <TrendingUp size={18} className="text-yellow-500" />;
                    }
                }

                return (
                    <div key={vendor} className="border border-border rounded-lg bg-card">
                        <div className={`${freightHighlightClass} p-3 flex flex-wrap justify-between items-center border-b border-border gap-4`}>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                {freightIcon}
                                <div>
                                    <h3 className="font-bold text-foreground">{vendor}</h3>
                                    <p className="text-sm text-foreground-muted">{items.length} items to reorder</p>
                                </div>
                            </div>
                            <div className="flex-grow grid grid-cols-2 gap-x-4 md:gap-x-8 items-center min-w-[300px]">
                                <div className="text-right"><p className={`font-bold text-lg ${totalValue >= freightGoal && freightGoal > 0 ? 'text-green-500' : 'text-foreground'}`}>${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p><p className="text-xs text-foreground-muted">Total Order Value</p></div>
                                {freightInfo && (<div className="text-right"><p className="font-semibold text-sm text-foreground-muted truncate" title={freightInfo}>{freightInfo}</p><p className="text-xs text-foreground-muted">Freight Goal</p><FreightProgressBar value={totalValue} goal={freightGoal} /></div>)}
                            </div>
                            <div className="flex gap-2 flex-shrink-0">
                                <button onClick={() => handleDraftEmail(vendor, items)} disabled={draftingVendor === vendor} className="action-button bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300"> {draftingVendor === vendor ? <Loader size={16} className="animate-spin" /> : '✨'} Draft Email </button>
                                <button onClick={() => exportByVendor(vendor, items)} className="action-button bg-green-600 hover:bg-green-700"><Download size={16} /> Export PO</button>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead><tr><th className="table-header">Item</th><th className="table-header">Description</th><th className="table-header text-center">WH</th><th className="table-header text-right">Available</th><th className="table-header text-right">Mo Avg</th><th className="table-header text-right">Suggested</th><th className="table-header text-center w-28">Final Qty</th></tr></thead>
                                <tbody className="divide-y divide-border">
                                    {items.map(item => {
                                        const reorderInfo = calculateReorderQty(item);
                                        return (
                                            <tr key={item.id} className="hover:bg-surface">
                                                <td className="table-cell font-medium text-foreground">{item.item}</td><td className="table-cell max-w-xs truncate">{item.description}</td><td className="table-cell text-center">{item.warehouse}</td>
                                                <td className="table-cell text-right">{item.available}</td><td className="table-cell text-right">{item.monthlyAvg?.toFixed(1)}</td><td className="table-cell text-right font-medium text-blue-500">{reorderInfo.suggested}</td>
                                                <td className="table-cell text-center"><input type="number" defaultValue={reorderInfo.suggested} onChange={(e) => handleQtyChange(item.id, e.target.value)} className="w-20 p-1 border border-border rounded-md text-center bg-card text-foreground" aria-label={`Final quantity for ${item.item}`} /></td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
