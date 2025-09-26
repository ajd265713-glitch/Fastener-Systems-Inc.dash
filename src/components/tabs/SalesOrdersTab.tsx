import React, { useState, useMemo, useEffect } from 'react';
import { ArrowUpDown } from 'lucide-react';
import type { SalesData } from '../../domain/types';
import { UI_CONSTANTS } from '../../domain/constants';
import { useSortableData } from '../../hooks/useSortableData';
import { parseDateString } from '../../utils/helpers';
import { Pagination } from '../ui';

export const SalesOrdersTab = ({ salesData, searchTerm }: { salesData: SalesData[], searchTerm: string }) => {
    const [currentPage, setCurrentPage] = useState(1);

    const filteredOrders = useMemo(() => {
        if (!salesData) return [];
        if (!searchTerm) return salesData;
        const search = searchTerm.toLowerCase();
        return salesData.filter(so =>
            so.order?.toString().toLowerCase().includes(search) ||
            so.customerName?.toString().toLowerCase().includes(search) ||
            so.item?.toString().toLowerCase().includes(search)
        );
    }, [salesData, searchTerm]);

    const { items: sortedOrders, requestSort, sortConfig } = useSortableData(filteredOrders, { key: 'wantedDate', direction: 'ascending' });
    useEffect(() => setCurrentPage(1), [filteredOrders]);

    const paginatedOrders = sortedOrders.slice((currentPage - 1) * UI_CONSTANTS.SALES_VIEW_ITEMS_PER_PAGE, currentPage * UI_CONSTANTS.SALES_VIEW_ITEMS_PER_PAGE);
    const totalPages = Math.ceil(sortedOrders.length / UI_CONSTANTS.SALES_VIEW_ITEMS_PER_PAGE);
    
    const columns: { key: keyof SalesData | 'status'; label: string; sortable: boolean; classes?: string }[] = [
        { key: 'status', label: 'Status', sortable: false, classes: "text-center" }, { key: 'wantedDate', label: 'Wanted Date', sortable: true }, { key: 'order', label: 'SO #', sortable: true },
        { key: 'customerName', label: 'Customer', sortable: true }, { key: 'item', label: 'Item', sortable: true }, { key: 'description', label: 'Description', sortable: true }, { key: 'qty', label: 'Qty', sortable: true, classes: 'text-right' },
    ];

    if (salesData.length === 0) return <div className="text-center p-8 text-gray-500">No Sales Order data uploaded.</div>
    if (filteredOrders.length === 0) return <div className="text-center p-8 text-gray-500">No sales orders match your search.</div>

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
                                        {col.sortable && <button onClick={() => requestSort(col.key as keyof SalesData)} aria-label={`Sort by ${col.label} ${sortConfig?.key === col.key && sortConfig.direction === 'ascending' ? 'descending' : 'ascending'}`}><ArrowUpDown size={14} className="text-gray-400" /></button>}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {paginatedOrders.map((order, index) => {
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            const wantedDate = parseDateString(order.wantedDate);
                            const isLate = wantedDate < today && wantedDate.getTime() !== 0;
                            return (
                                <tr key={`${order.order}-${order.item}-${index}`} className="hover:bg-surface">
                                    <td className="table-cell text-center">{isLate ? <span className="status-badge bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">LATE</span> : <span className="status-badge bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">On Time</span>}</td>
                                    <td className={`table-cell font-medium ${isLate ? 'text-red-600' : 'text-foreground'}`}>{order.wantedDate}</td>
                                    <td className="table-cell font-medium text-foreground">{order.order}</td><td className="table-cell max-w-xs truncate">{order.customerName}</td>
                                    <td className="table-cell">{order.item}</td><td className="table-cell max-w-xs truncate">{order.description}</td><td className="table-cell text-right">{order.qty}</td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalItems={sortedOrders.length} itemsPerPage={UI_CONSTANTS.SALES_VIEW_ITEMS_PER_PAGE} />
        </div>
    );
};
