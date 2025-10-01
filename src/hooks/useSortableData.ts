import { useState, useMemo } from 'react';

export const useSortableData = <T extends Record<string, any>>(items: T[], config: { key: keyof T; direction: 'ascending' | 'descending'; } | null = null) => {
    const [sortConfig, setSortConfig] = useState<{ key: keyof T; direction: 'ascending' | 'descending'; } | null>(config);

    const sortedItems = useMemo(() => {
        if (!items) return [];
        let sortableItems = [...items];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                const valA = a[sortConfig.key];
                const valB = b[sortConfig.key];

                if (typeof valA === 'string' && typeof valB === 'string') {
                    return sortConfig.direction === 'ascending' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                }
                
                if (valA < valB) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return sortableItems;
    }, [items, sortConfig]);

    // Fix: Changed `key` type from `keyof T` to `string` to avoid overly narrow type inference issues at the call site.
    // The key is then cast back to `keyof T` when setting state.
    const requestSort = (key: string) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key: key as keyof T, direction });
    };

    return { items: sortedItems, requestSort, sortConfig };
};
