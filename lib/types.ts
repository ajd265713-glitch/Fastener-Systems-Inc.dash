export interface FileInfo {
    name: string;
    count: number;
}

export interface LotData {
    item: string;
    description: string;
    warehouse: string;
    location?: string;
    onHand: number;
    committed: number;
    available: number;
    vendor?: string;
}

export interface ItemData {
    item: string;
    description?: string;
    unitCost?: number;
    primaryVendor?: string;
    category?: string;
    rpl?: string;
    vendorCode?: string;
}

export interface UsageData {
    item: string;
    warehouse: string;
    monthlyAvg?: number;
    min?: number;
    max?: number;
}

export interface POData {
    po: string;
    vendorName?: string;
    warehouse?: string;
    ordDate?: string;
    shipDate?: string;
    status?: string;
    openTotal?: number;
    item?: string;
    openQty?: number;
}

export interface SalesData {
    orderDate?: string;
    wantedDate?: string;
    warehouse?: string;
    order?: string;
    customerName?: string;
    item?: string;
    description?: string;
    qty?: number;
}

export interface VendorData {
    vendorCode: string;
    vendorName: string;
}

export interface MergedInventoryItem {
    id: string;
    item: string;
    warehouse: string;
    onHand: number;
    committed: number;
    available: number;
    locations: string[];
    description?: string;
    vendor?: string;
    unitCost: number;
    inventoryValue: number;
    monthlyAvg: number;
    min: number;
    max: number;
    leadTime: number;
    rpl: string;
    category?: string;
    vendorCode?: string;
}

export interface ReorderInfo {
    suggested: number;
    daysOfSupply: number;
    needsReorder: boolean;
    reorderPoint: number;
    targetStock: number;
}

export interface VendorContact {
    role: string;
    name: string | null;
    email: string | null;
    phone: string | null;
}

export interface VendorDetail {
    name: string;
    contacts: VendorContact[];
    notes: string[];
    freightInfo: string;
}

