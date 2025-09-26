import React, { useState, useMemo, useEffect } from 'react';
import { ArrowUpDown } from 'lucide-react';
import type { POData } from '../../domain/types';
import { UI_CONSTANTS } from '../../domain/constants';
import { useSortableData } from '../../hooks/useSortableData';
import { Pagination } from '../ui';

export const OrdersTab = ({ orders, searchTerm }: { orders: POData[], searchTerm: string }) => {
    const [currentPage, setCurrentPage] = useState(1);
    const openOrders = useMemo(() => {
        const filtered = orders.filter(po => po.status === 'Open');
        if (!searchTerm) return filtered;
        const search = searchTerm.toLowerCase();
        return filtered.filter(po => po.po?.toString().toLowerCase().includes(search) || po.vendorName?.toLowerCase().includes(search));
    }, [orders, searchTerm]);

    const { items: sortedOrders, requestSort, sortConfig } = useSortableData(openOrders, { key: 'ordDate', direction: 'descending' });
    useEffect(() => setCurrentPage(1), [openOrders]);
    
    const paginatedOrders = sortedOrders.slice((currentPage - 1) * UI_CONSTANTS.ORDER_VIEW_ITEMS_PER_PAGE, currentPage * UI_CONSTANTS.ORDER_VIEW_ITEMS_PER_PAGE);
    const totalPages = Math.ceil(sortedOrders.length / UI_CONSTANTS.ORDER_VIEW_ITEMS_PER_PAGE);
    
    const columns: { key: keyof POData; label: string; sortable: boolean; classes?: string }[] = [
        { key: 'po', label: 'PO #', sortable: true }, { key: 'vendorName', label: 'Vendor', sortable: true }, { key: 'warehouse', label: 'WH', sortable: true }, { key: 'ordDate', label: 'Order Date', sortable: true },
        { key: 'shipDate', label: 'Ship Date', sortable: true }, { key: 'openTotal', label: 'Open Value', sortable: true, classes: 'text-right' }
    ];

    if (orders.length === 0) return <div className="text-center p-8 text-gray-500">No Purchase Order data uploaded.</div>
    if (openOrders.length === 0) return <div className="text-center p-8 text-gray-500">No open POs match your search.</div>

    return (
        <div>
            <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-sm">
                    <thead className="bg-card-muted">
                        <tr>
                            {columns.map(col => (
                                <th key={col.key} className={`table-header ${col.classes}`} aria-sort={col.sortable ? (sortConfig?.key === col.key ? sortConfig.direction : 'none') : undefined}>
                                    <div className={`flex items-center gap-1 ${col.classes?.includes('text-right') ? 'justify-end' : ''}`}>
                                        {col.label}
                                        {col.sortable && <button onClick={() => requestSort(col.key)} aria-label={`Sort by ${col.label} ${sortConfig?.key === col.key && sortConfig.direction === 'ascending' ? 'descending' : 'ascending'}`}><ArrowUpDown size={14} className="text-gray-400" /></button>}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {paginatedOrders.map((po, index) => (
                            <tr key={`${po.po}-${index}`} className="hover:bg-surface">
                                <td className="table-cell font-medium text-foreground">{po.po}</td><td className="table-cell max-w-xs truncate">{po.vendorName}</td><td className="table-cell">{po.warehouse}</td>
                                <td className="table-cell">{po.ordDate}</td><td className="table-cell">{po.shipDate || 'N/A'}</td><td className="table-cell text-right font-medium">${(po.openTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalItems={sortedOrders.length} itemsPerPage={UI_CONSTANTS.ORDER_VIEW_ITEMS_PER_PAGE} />
        </div>
    );
};
