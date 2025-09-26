import { VENDOR_LEAD_TIMES } from '../domain/constants';
import { VENDOR_DETAILS } from '../domain/vendorDetails';
import type { LotData, ItemData, UsageData } from '../domain/types';

const parseNumeric = (value: any): number => {
    if (value === null || value === undefined || value === '') return 0;
    const num = Number(String(value).replace(/,/g, ''));
    return isNaN(num) ? 0 : num;
};

// --- Data Validation Helpers ---
const hasRequiredField = (obj: any, field: string): boolean => {
    if (!obj) return false;
    const value = obj[field];
    if (value === undefined || value === null) return false;
    if (typeof value === 'string') {
        return value.trim() !== '';
    }
    return true;
};

const filterData = <T>(data: T[] | undefined, requiredFields: (keyof T)[]): T[] => {
    if (!Array.isArray(data)) return [];
    return data.filter((entry) => requiredFields.every((field) => hasRequiredField(entry, field as string)));
};


self.onmessage = (event: MessageEvent<{ lotData: LotData[], itemsData: ItemData[], usageData: UsageData[] }>) => {
    try {
        const { lotData, itemsData, usageData } = event.data;
        
        const validLots = filterData(lotData, ['item', 'warehouse']);
        const validItems = filterData(itemsData, ['item']);
        const validUsage = filterData(usageData, ['item', 'warehouse']);

        if (validLots.length === 0 || validUsage.length === 0) {
            self.postMessage({ type: 'success', payload: [] });
            return;
        }

        const vendorNameToCodeMap = new Map();
        if (VENDOR_DETAILS && typeof VENDOR_DETAILS === 'object') {
            for (const code in VENDOR_DETAILS) {
                const vendorDetail = (VENDOR_DETAILS as any)[code];
                if (vendorDetail && vendorDetail.name) {
                    vendorNameToCodeMap.set(vendorDetail.name, code);
                }
            }
        } else {
            console.error("Worker: VENDOR_DETAILS static data failed to load or is not an object.");
        }

        const itemsMap = new Map();
        validItems.forEach((i: any) => {
            if (i && i.item != null) {
                itemsMap.set(String(i.item), i);
            }
        });

        const usageMap = new Map();
        validUsage.forEach((u: any) => {
            if (u && u.item != null && u.warehouse != null) {
                usageMap.set(`${String(u.item)}-${u.warehouse}`, u);
            }
        });

        const lotGroups = new Map();
        for (const lot of validLots) {
            const key = `${String(lot.item)}-${lot.warehouse}`;
            
            if (!lotGroups.has(key)) {
                lotGroups.set(key, {
                    item: String(lot.item),
                    warehouse: lot.warehouse,
                    description: lot.description,
                    vendor: lot.vendor,
                    onHand: 0,
                    committed: 0,
                    available: 0,
                    locations: new Set(),
                });
            }

            const group = lotGroups.get(key);
            group.onHand += parseNumeric(lot.onHand);
            group.committed += parseNumeric(lot.committed);
            group.available += parseNumeric(lot.available);
            
            if (lot.location) {
                group.locations.add(lot.location);
            }

            // Accumulate description and vendor if they were initially null/undefined
            if (!group.description && lot.description) {
                group.description = lot.description;
            }
            if (!group.vendor && lot.vendor) {
                group.vendor = lot.vendor;
            }
        }

        const merged = Array.from(lotGroups.values()).map((lot: any) => {
            const itemDetails = itemsMap.get(String(lot.item)) || {};
            const usageDetails = usageMap.get(`${String(lot.item)}-${lot.warehouse}`) || {};
            
            const unitCost = parseNumeric(itemDetails.unitCost);
            const available = lot.available;
            const vendor = itemDetails.primaryVendor || lot.vendor || 'Unknown';
            const vendorCode = itemDetails.vendorCode || vendorNameToCodeMap.get(vendor);

            return {
                id: `${lot.item}-${lot.warehouse}`,
                item: String(lot.item),
                warehouse: lot.warehouse,
                onHand: lot.onHand,
                committed: lot.committed,
                available: available,
                locations: Array.from(lot.locations),
                description: lot.description || itemDetails.description,
                vendor,
                vendorCode,
                unitCost: unitCost,
                inventoryValue: available * unitCost,
                monthlyAvg: parseNumeric(usageDetails.monthlyAvg),
                min: parseNumeric(usageDetails.min),
                max: parseNumeric(usageDetails.max),
                leadTime: (vendorCode && VENDOR_LEAD_TIMES[vendorCode]) || VENDOR_LEAD_TIMES['DEFAULT'],
                rpl: itemDetails.rpl || '',
                category: itemDetails.category
            };
        });

        self.postMessage({ type: 'success', payload: merged });

    } catch(error: any) {
        self.postMessage({ type: 'error', message: error.message, stack: error.stack });
    }
};
