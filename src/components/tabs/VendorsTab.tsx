import React, { useState, useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import type { MergedInventoryItem, VendorData, ReorderInfo, VendorSummary } from '../../domain/types';
import { UI_CONSTANTS } from '../../domain/constants';
import { VENDOR_DETAILS } from '../../domain/vendorDetails';

const VendorDetailPanel = ({ vendorCode, inventory }: { vendorCode: string, inventory: MergedInventoryItem[] }) => {
    const details = VENDOR_DETAILS[vendorCode];
    const topItems = useMemo(() => {
        if (!vendorCode) return [];
        return inventory.filter(item => item.vendorCode === vendorCode).sort((a, b) => (b.inventoryValue || 0) - (a.inventoryValue || 0)).slice(0, UI_CONSTANTS.VENDOR_DETAIL_TOP_N_ITEMS);
    }, [vendorCode, inventory]);

    if (!details && topItems.length === 0) return <div className="p-4 text-sm text-foreground-muted">No additional details available for this vendor.</div>;

    return (
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
            <div className="md:col-span-1 space-y-4">
                <h4 className="font-bold text-foreground">Contact Info</h4>
                {details?.contacts?.length > 0 ? (<ul className="space-y-3">
                    {details.contacts.map((contact, index: number) => (
                        <li key={index}>
                            <p className="font-semibold text-foreground">{contact.name} {contact.role && <span className="text-xs font-normal text-foreground-muted">({contact.role})</span>}</p>
                            {contact.email && <a href={`mailto:${contact.email}`} className="text-primary hover:underline">{contact.email}</a>}
                            {contact.phone && <p className="text-foreground-muted">{contact.phone}</p>}
                        </li>))}
                </ul>) : <p className="text-foreground-muted">No contact info available.</p>}
            </div>
            <div className="md:col-span-1 space-y-4">
                <h4 className="font-bold text-foreground">Notes & Freight Info</h4>
                {details?.notes?.length > 0 && (<div><h5 className="font-semibold mb-1 text-foreground">Notes:</h5><ul className="list-disc list-inside space-y-1 text-foreground-muted">{details.notes.map((note, index: number) => <li key={index}>{note}</li>)}</ul></div>)}
                {details?.freightInfo && (<div><h5 className="font-semibold mb-1 text-foreground">Freight:</h5><p className="text-foreground-muted">{details.freightInfo}</p></div>)}
                {(!details?.notes || details.notes.length === 0) && !details?.freightInfo && (<p className="text-foreground-muted">No notes or freight info.</p>)}
            </div>
            <div className="md:col-span-1 space-y-4">
                 <h4 className="font-bold text-foreground">Top Purchased Items</h4>
                 {topItems.length > 0 ? (<ul className="space-y-2">{topItems.map(item => (<li key={item.id} className="flex justify-between"><span className="truncate pr-4" title={item.item}>{item.item}</span><span className="font-medium text-foreground-muted">${(item.inventoryValue || 0).toLocaleString()}</span></li>))}</ul>) : <p className="text-foreground-muted">No purchasing data available.</p>}
            </div>
        </div>
    );
};

export const VendorsTab = ({ inventory, vendorsData, calculateReorderQty, searchTerm }: { inventory: MergedInventoryItem[], vendorsData: VendorData[], calculateReorderQty: (item: MergedInventoryItem) => ReorderInfo, searchTerm: string }) => {
    const [expandedVendor, setExpandedVendor] = useState<string | null>(null);

    const vendorsSummary: VendorSummary[] = useMemo(() => {
        const vendorMap: { [key: string]: any } = {};

        inventory.forEach(invItem => {
            const vendorCode = invItem.vendorCode;
            if (!vendorCode) return; 

            if (!vendorMap[vendorCode]) {
                const vendorData = vendorsData.find(v => v.vendorCode === vendorCode);
                const name = invItem.vendor || VENDOR_DETAILS[vendorCode]?.name || vendorData?.vendorName || `Vendor ${vendorCode}`;
                vendorMap[vendorCode] = {
                    name,
                    code: vendorCode,
                    inventoryValue: 0,
                    lowStockItems: 0,
                    _lowStockSkus: new Set(),
                    _managedSkus: new Set()
                };
            }

            const vendor = vendorMap[vendorCode];
            vendor.inventoryValue += (invItem.inventoryValue || 0);
            vendor._managedSkus.add(invItem.item);

            if (calculateReorderQty(invItem).needsReorder && !vendor._lowStockSkus.has(invItem.item)) {
                vendor.lowStockItems++;
                vendor._lowStockSkus.add(invItem.item);
            }
        });

        let result = Object.values(vendorMap).map(vendor => {
            const { _lowStockSkus, _managedSkus, ...rest } = vendor;
            return {
                ...rest,
                skuCount: _managedSkus.size,
            };
        });

        if (searchTerm) {
            const searchLower = searchTerm.toLowerCase();
            result = result.filter(vendor => String(vendor.name || '').toLowerCase().includes(searchLower) || String(vendor.code || '').toLowerCase().includes(searchLower));
        }

        return result.sort((a, b) => b.inventoryValue - a.inventoryValue);
    }, [inventory, vendorsData, calculateReorderQty, searchTerm]);

    const toggleVendor = (vendorCode: string) => setExpandedVendor(prev => prev === vendorCode ? null : vendorCode);
    
    return (
        <div className="overflow-x-auto border border-border rounded-lg">
            <table className="w-full text-sm" aria-label="Vendors Summary">
                <thead className="bg-card-muted"><tr><th className="table-header w-12"><span className="sr-only">Expand</span></th><th className="table-header">Vendor</th><th className="table-header">Vendor Code</th><th className="table-header text-right">Inventory Value</th><th className="table-header text-right">Unique SKUs</th><th className="table-header text-right">Low Stock Items</th></tr></thead>
                <tbody className="divide-y divide-border">
                    {vendorsSummary.map(vendor => (
                        <React.Fragment key={vendor.code}>
                            <tr className="hover:bg-surface cursor-pointer" onClick={() => toggleVendor(vendor.code)} aria-expanded={expandedVendor === vendor.code} aria-controls={`vendor-details-${vendor.code}`}>
                                <td className="table-cell text-center"><ChevronRight className={`transition-transform ${expandedVendor === vendor.code ? 'rotate-90' : ''}`} size={16}/></td>
                                <td className="table-cell font-medium text-foreground">{vendor.name}</td><td className="table-cell text-foreground-muted">{vendor.code}</td>
                                <td className="table-cell text-right font-medium">${vendor.inventoryValue.toLocaleString(undefined, {maximumFractionDigits: 0})}</td><td className="table-cell text-right">{vendor.skuCount}</td>
                                <td className={`table-cell text-right font-bold ${vendor.lowStockItems > 0 ? 'text-red-500' : ''}`}>{vendor.lowStockItems}</td>
                            </tr>
                            {expandedVendor === vendor.code && ( <tr id={`vendor-details-${vendor.code}`}><td colSpan={6} className="p-0"><VendorDetailPanel vendorCode={vendor.code} inventory={inventory} /></td></tr> )}
                        </React.Fragment>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
