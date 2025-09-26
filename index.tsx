import React, { useState, useMemo, useEffect, useCallback, useRef, useContext, createContext } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { Search, AlertCircle, TrendingUp, Package, Truck, Calendar, Filter, Download, ChevronDown, ChevronUp, AlertTriangle, CheckCircle, Clock, DollarSign, Upload, FileText, RefreshCw, Save, BarChart, Users, ArrowUpDown, XCircle, Trash2, Loader, Copy, Wand2, Eye, Warehouse, LayoutGrid, ChevronRight, Files } from 'lucide-react';

// --- Error Boundary ---
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-background text-foreground p-4 text-center">
          <AlertTriangle className="w-16 h-16 text-error mb-4" />
          <h1 className="text-2xl font-bold mb-2">Something went wrong.</h1>
          <p className="text-foreground-muted mb-4">An unexpected error occurred. Please try refreshing the page.</p>
          <button onClick={() => window.location.reload()} className="action-button bg-primary hover:bg-primary-dark">
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Data Interfaces ---
interface FileInfo {
    name: string;
    count: number;
}
interface LotData {
    item: string;
    description: string;
    warehouse: string;
    location?: string;
    onHand: number;
    committed: number;
    available: number;
    vendor?: string;
}
interface ItemData {
    item: string;
    description?: string;
    unitCost?: number;
    primaryVendor?: string;
    category?: string;
    rpl?: string;
    vendorCode?: string;
}
interface UsageData {
    item: string;
    warehouse: string;
    monthlyAvg?: number;
    min?: number;
    max?: number;
}
interface POData {
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
interface SalesData {
    orderDate?: string;
    wantedDate?: string;
    warehouse?: string;
    order?: string;
    customerName?: string;
    item?: string;
    description?: string;
    qty?: number;
}
interface VendorData {
    vendorCode: string;
    vendorName: string;
}
interface MergedInventoryItem {
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
interface ReorderInfo {
    suggested: number;
    daysOfSupply: number;
    needsReorder: boolean;
    reorderPoint: number;
    targetStock: number;
}
interface VendorContact {
    role: string;
    name: string | null;
    email: string | null;
    phone: string | null;
}
interface VendorDetail {
    name: string;
    contacts: VendorContact[];
    notes: string[];
    freightInfo: string;
}

// --- App Constants ---
const PURCHASING_LOGIC_CONSTANTS = {
    DAYS_IN_MONTH: 30,
    SAFETY_STOCK_DAYS: 14, // How many days of supply to keep as safety
    TARGET_STOCK_MULTIPLIER: 1.5, // Target stock is X times reorder point
    OVERSTOCK_MONTHS_THRESHOLD: 6, // Items with more than this many months of supply are "overstock"
    LEAD_TIME_WARNING_DAYS: 21, // Warn if lead time exceeds this. Set higher than default.
    LONG_LEAD_TIME_SAFETY_FACTOR: 0.5, // Add 50% of lead time as additional safety days for long lead times
};

const UI_CONSTANTS = {
    ITEM_VIEW_ITEMS_PER_PAGE: 25,
    ORDER_VIEW_ITEMS_PER_PAGE: 15,
    SALES_VIEW_ITEMS_PER_PAGE: 15,
    VENDOR_DETAIL_TOP_N_ITEMS: 5,
};

const GEMINI_PROMPTS = {
    inventoryAnalysis: (inventory: MergedInventoryItem[], calculateReorderQty: (item: MergedInventoryItem) => ReorderInfo) => {
        const topValueItems = [...inventory].sort((a, b) => b.inventoryValue - a.inventoryValue).slice(0, 5);
        const lowSupplyItems = inventory.filter(i => calculateReorderQty(i).daysOfSupply < 15);
        const totalValue = inventory.reduce((sum, i) => sum + i.inventoryValue, 0);
        return `You are an expert inventory analyst for FSI. Analyze the following summary and provide a brief, actionable, bulleted analysis (3-4 points max). Highlight risks (low stock) or opportunities (overstock).\n\n- Total Items: ${new Set(inventory.map(i => i.item)).size}\n- Total Value: $${totalValue.toLocaleString()}\n- Top 5 Items by Value: ${topValueItems.map(i => `${i.item} ($${i.inventoryValue.toLocaleString()})`).join(', ')}\n- Critical Low Stock (<15 days): ${lowSupplyItems.length > 0 ? lowSupplyItems.map(i => i.item).join(', ') : 'None'}`;
    },
    reorderEmail: (vendor: string, items: MergedInventoryItem[], editedQuantities: { [key: string]: number }, calculateReorderQty: (item: MergedInventoryItem) => ReorderInfo) => {
        const itemsList = items.map(item => `- ${item.item} (${item.description}): Qty ${editedQuantities[item.id] ?? calculateReorderQty(item).suggested}`).join('\n');
        return `Act as a purchasing associate named Andrew Derrick from FSI. Write a professional, concise email to a vendor named ${vendor}. Ask for a formal quote and estimated lead time for the following list of items. Keep it friendly and to the point.\n\nItems:\n${itemsList}`;
    },
    generateDescription: (newPartNumber: string, partSegments: string[], basePartInfo?: MergedInventoryItem) => {
        const oldDesc = basePartInfo?.description || 'a standard hardware component';
        const newAttrsText = partSegments.map((seg, i) => `Segment ${i + 1}: ${seg}`).join(', ');
        return `You are an ERP data specialist for FSI. Your task is to create a new product description based on a template.
 The template description for a similar part is: "${oldDesc}"
 The new part has these attributes: ${newAttrsText}
 The new part number is: ${newPartNumber}
 
 Generate a new description that matches the style and format of the template, but incorporates the new attributes. Be concise and accurate, suitable for an ERP system. If the template description is generic, create a plausible description based on the new part number segments.`;
    },
    similarityCheck: (newPartNumber: string, partSegments: string[], inventory: MergedInventoryItem[]) => {
        const inventoryListPrompt = (() => {
            let list = '';
            for (const i of inventory) {
                const newItem = `"${i.item}": "${i.description}"\n`;
                if (list.length + newItem.length > 15000) break;
                list += newItem;
            }
            return list;
        })();
        return `You are an ERP data specialist for FSI. Your task is to find similar parts to prevent creating duplicates.
 A new part is being proposed:
 - New Part #: "${newPartNumber}"
 - New Attributes: Segments are [${partSegments.join(', ')}]
 
 Search the following inventory list and identify up to 3 existing parts that are the closest match. For each match, provide the part number and a brief explanation of why it's similar. Format the output as a simple list. If no good matches are found, say so.
 
 Inventory List (first 15000 chars):
 ${inventoryListPrompt}
 `;
    }
};

const VENDOR_LEAD_TIMES: { [key: string]: number } = {
    'STASTA': 21, // STAR STAINLESS
    'ELCIND': 35, // ELCO
    'FORFAS': 21, // FORD
    'EDSMAN': 10, // EDSON
    'DEFAULT': 14,
};

// BEST PRACTICE: For scalability, this large object should be externalized into a separate JSON file or served from an API endpoint.
const VENDOR_DETAILS: { [key: string]: VendorDetail } = {
    SIMSTR: { name: "SIMPSON STRONG-TIE CO INC", contacts: [ { role: "Main Rep", name: "Shane Smith", email: "shsmith@strongtie.com", phone: "205-913-6421" }, { role: "Customer Service", name: "Random person", email: null, phone: "(800) 999-5099" }, { role: "Large Order Email", name: null, email: "lpp24@strongtie.com", phone: null }, { role: "Sales", name: null, email: "salesdesk24@strongtie.com", phone: null } ], notes: [ "Shane is a great contact and loves to do deals when asked.", "Simpson is very quick all together up there with Star Stainless speeds if not better." ], freightInfo: "**($1,325)**" },
    ELCIND: { name: "BLACK & DECKER INC.", contacts: [ { role: "Main Rep", name: "Duane Baumler", email: "duane.baumler@sbdinc.com", phone: "319-429-3104" }, { role: "Customer Service Rep", name: "Mike", email: "icwestsouth@sbdinc.com", phone: "(860) 302-5304" }, { role: "Customer Service Powers", name: "Random person foreign", email: "ORDERS@POWERS.COM", phone: "800-524-3244" }, { role: "Customer Service SBD", name: "Random person foreign", email: "SBDORDERS@SBDINC.COM", phone: "800-524-3244" } ], notes: [ "If I need something from Mike within 30 min put HOT! in subject line. Need something at some point just send the email normal. Need something right away call.", "Duane is the main rep in charge of our account. He can help with pricing adjustments.", "Website used to check pricing and availability. Availability is not always 100% so you may need to call a rep." ], freightInfo: "**($1,500)**" },
    FRAINT: { name: "FRANKLIN INTERNATIONAL", contacts: [ { role: "Main Rep", name: "Rick Nicholas", email: "ricknicholasjr@franklininternational.com", phone: "610-960-4352" }, { role: "Sales Rep", name: "Tracy Hewlett", email: "tracyhewlett@franklininternational.com", phone: "800-877-4583" }, { role: "Customer Service Rep", name: "Tim Pugno", email: "TimPugno@FranklinInternational.com", phone: "614-445-1299" }, { role: "Customer Service", name: "Random person", email: "concustserv@franklininternational.com", phone: "800-877-4583" } ], notes: [ "Rick is the go to for any price changes or deals. He is also the lead rep in meetings.", "Tracy seems decent at solving most problems and is our main sales rep.", "Tim is a random rep that ended up being able to get me a OA right away and seems very helpful every call.", "Seems to be 2-3 days till they ship anything." ], freightInfo: "**(900 tubes or 75 cases)**" },
    TREMCO: { name: "TREMCO CPG INC", contacts: [ { role: "Sales Rep", name: "Diane Drobny", email: "ddrobny@tremcoinc.com", phone: "(216) 766-5551" }, { role: "Market Manager", name: "Jeff Parmelee", email: "jparmelee@tremcoinc.com", phone: "(330) 212-5551" }, { role: "Technical Sales Rep", name: "Tom Close", email: "TClose@tremcoinc.com", phone: "267.922.3597" } ], notes: [ "You must call Diane if you need a quick answer otherwise you may wait all day for a response.", "Tremco is phasing out the 626 and Vulkem will take its place 8-27-24." ], freightInfo: "**(N/A)**" },
    ITMINT: { name: "ITM-INTERNATIONAL TOOL MFG.", contacts: [ { role: "Sales", name: null, email: "SALES@ITMTOOLS.COM", phone: null }, { role: "Sales Rep", name: "Marilyn Rodriguez", email: null, phone: "(516) 738-0388" }, { role: "Sales Rep", name: "Chun Keat", email: "ckeat@itmtools.com", phone: "(516) 738-0388" }, { role: "Sales Rep", name: "Annette Kempadoo", email: "annette@itmtools.com", phone: "(516) 738-0388" } ], notes: ["All reps that we deal with are very quick and helpful when assistance is needed."], freightInfo: "**($750)**" },
    CONFAS: { name: "SFS INTEC, INC.", contacts: [ { role: "General Orders", name: null, email: "order-wyo@sfs.com", phone: null }, { role: "Sales Rep", name: "Sarah Etzel", email: "sarah.etzel@sfs.com", phone: "(563) 259-5214" }, { role: "Regional Rep", name: "Ted Mack", email: "ted.maack@sfs.com", phone: "(610) 451-8780" }, { role: "District Rep", name: "Greg Stephson", email: "greg.stephenson@sfs.com", phone: "(610) 816-9763" } ], notes: [ "Term bar is only in PA location in Reading.", "Sarah is one of the best reps I deal with on my day to day. Most of the time it is a few minutes to get an answer on something.", "Helps to have SFS part numbers in emails/PO's" ], freightInfo: "**($3,500)**" },
    AMESEA: { name: "AMERICAN SEALANTS INC.", contacts: [ { role: "Market Manager", name: "Brian Harruff", email: "bharruff@meridianadhesives.com", phone: "260.438.0318" }, { role: "Sales Rep", name: "Jennifer Ober", email: "jober@meridianadhesives.com", phone: "260-399-5051" }, { role: "Sales Rep", name: "Debbie Herschberger", email: "dherschberger@meridianadhesives.com", phone: "260-489-0728" } ], notes: [ "Very close with this companies management and are in the process of creating a private labeled product.", "Brian is a great contact and will do his best to get you anything you need.", "Get killed on the freight with these guys would love to get something in place." ], freightInfo: "**(N/A)**" },
    STASTA: { name: "STAR STAINLESS SCREW CO.", contacts: [ { role: "Sales Rep", name: "Jason Vanderhee", email: "jason.v@starstainless.com", phone: "(800) 631-3540" }, { role: "Sales Rep", name: "Barbara Bogerman", email: "bbogerman@starstainless.com", phone: null }, { role: "Sales Rep", name: "Kate Tolerico", email: "Ktolerico@starstainless.com", phone: null } ], notes: [ "Most things 18-8 will be ordered from here.", "Jason is very very quick at getting back to emails", "Barbara is a good back up when Jason is out she is just a lot slower." ], freightInfo: "**(5000 lbs)**" },
    PORFAS: { name: "BRIGHTON-BEST INTERNATIONAL, INC.", contacts: [ { role: "Regional Sales", name: "Michael White", email: "mwhite@brightonbest.com", phone: "732-484-2270" }, { role: "Regional Sales", name: "Gary Wilson", email: "gwilson@brightonbest.com", phone: null }, { role: "Sales Rep", name: "Deborah Pearson", email: "DPEARSON@BRIGHTONBEST.COM", phone: "800-935-2378" } ], notes: [ "Deborah is very good at finding anything that you need. Can also help with most pricing issues and freight.", "Michael is the head rep for our account here and you will need to contact him for anything really important." ], freightInfo: "**(Fasteners only: $1,600, Rods only: $2,400, Fasteners and Rod: $3,000, National PPD: $2,400)**" },
    NOVFAS: { name: "NOVA FASTENERS CO.", contacts: [ { role: "Sales Rep", name: "Jeff", email: "JEFFM75737@AOL.COM", phone: "(800) 874-7407" } ], notes: ["Jeff has always been really helpful even if that is him responding from his cell phone has well. Seems available 9 times out of 10."], freightInfo: "**($2,000)**" },
    SPI: { name: "SPI LLC", contacts: [ { role: "Sales Rep", name: "Kelly Rhoads", email: "krhoads@spi-co.com", phone: "856-541-5806" }, { role: "Sales Rep", name: "Xavier Runcie", email: "xruncie@spi-co.com", phone: "856-541-5806" }, { role: "Sales Rep", name: "Greg Viola", email: "gviola@spi-co.com", phone: "856-796-0742" } ], notes: ["SPI tends to keep good stock on many of the standard items that we buy from K-Flex good backup.", "Can deliver in SPI truck"], freightInfo: "**($750)**" },
    TEXTRU: { name: "TEX-TRUDE, LP", contacts: [ { role: "Sales Manager", name: "Linda Callas", email: "lcallas@tex-trude.com", phone: "713-481-3410" }, { role: "Shipping", name: "Amy Pendergrass", email: "apendergrass@tex-trude.com", phone: "713-481-3411" } ], notes: [ "Small shipments need to go Fed-EX they will not ship UPS.", "May be best to call Linda when in need of anything.", "Truckloads—35 cartons (not $35K)" ], freightInfo: "**(Prefer truckloads, no freight paid.)**" },
    PRISOU: { name: "PRIME SOURCE", contacts: [ { role: "Main Rep", name: "Tom Flemming", email: "flemingt@primesourcebp.com", phone: "(800) 488-5517" }, { role: "Inside Rep", name: "Alyssa Green", email: "greenal@primesourcebp.com", phone: "800-676-7777 EXT: 52010" } ], notes: [ "We as FSI does not do a ton of business with prime source. Typically either certain nails and drywall screws. Possibly 3M products but will need to two step.", "Both Tom and Alyssa are both very helpful at trying to get you there best answer.", "Also apart of net plus *." ], freightInfo: "**($750)**" },
    HAWFAS: { name: "HAWK FASTENER SERVICES, L.L.C.", contacts: [], notes: [], freightInfo: "**(N/A)**" },
    EDSMAN: { name: "EDSON MANUFACTURING INC", contacts: [], notes: [], freightInfo: "**($2,000)**" },
    PECCOR: { name: "PECORA CORPORATION", contacts: [], notes: [], freightInfo: "**($12,500)**" },
    CONPRO: { name: "DAP PRODUCTS INC.", contacts: [], notes: [], freightInfo: "**($5,000)**" },
    STAEXT: { name: "STAR EXTRUDED SHAPES, INC.", contacts: [], notes: [], freightInfo: "**(N/A)**" },
    FOMPRO: { name: "ICP ADHESIVES & SEALANTS INC", contacts: [], notes: [], freightInfo: "**(1 Pallet)**" },
    LELAND: { name: "LELAND INDUSTRIES, INC.", contacts: [], notes: [], freightInfo: "**(N/A)**" },
    KANCOR: { name: "KANEBRIDGE CORP.", contacts: [], notes: [], freightInfo: "**(N/A)**" },
    FORFAS: { name: "FORD FASTENERS, INC.", contacts: [], notes: [], freightInfo: "**($2,000)**" },
    MILTOO: { name: "MILWAUKEE ELECTRIC TOOL CORP", contacts: [], notes: [], freightInfo: "**($750)**" },
    TANTEC: { name: "TANGENT TECHNOLOGIES, LLC", contacts: [], notes: [], freightInfo: "**(N/A)**" },
    IOWPLA: { name: "PLASTIC RECYCLING OF IOWA FALLS INC", contacts: [], notes: [], freightInfo: "**(N/A)**" },
    CARCCW: { name: "CARLISLE CCW", contacts: [], notes: ["$35,000 truck load pricing"], freightInfo: "**(N/A)**" },
    EPSPLA: { name: "ENGINEERED PLASTICS SYSTEMS", contacts: [], notes: [], freightInfo: "**(N/A)**" },
    CLEFOR: { name: "CLEVELAND CITY FORGE", contacts: [], notes: [], freightInfo: "**(N/A)**" },
    STRSER: { name: "NEFCO CORPORATION", contacts: [], notes: ["Can deliver in NEFCO truck"], freightInfo: "**(N/A)**" },
    MFMBUI: { name: "MFM BUILDING PRODUCTS CORP.", contacts: [], notes: ["Prefer stock orders of 35K"], freightInfo: "**(1 pallet)**" },
    JLFOAM: { name: "J & K FOAM FABRICATING, INC.", contacts: [], notes: [], freightInfo: "**(N/A)**" },
    INTUSA: { name: "INTERCORP USA", contacts: [], notes: [], freightInfo: "**(N/A)**" },
    EJOFAS: { name: "EJOT FASTENING SYSTEMS LP", contacts: [], notes: [], freightInfo: "**($2,500)**" },
    GALIND: { name: "TRU-CUT", contacts: [], notes: [], freightInfo: "**($1,500)**" },
    PANAME: { name: "PAN AMERICAN SCREW LLC - 30", contacts: [], notes: [], freightInfo: "**(N/A)**" },
    TENRYU: { name: "TENRYU", contacts: [], notes: [], freightInfo: "**($750)**" },
    MANPRO: { name: "MANUS PRODUCTS", contacts: [], notes: [], freightInfo: "**(N/A)**" },
    EMPIND: { name: "EMPIRE INDUSTRIES", contacts: [], notes: [], freightInfo: "**($2,000)**" },
    SPETEC: { name: "SPECIFIED TECHNOLOGIES, INC.", contacts: [], notes: [], freightInfo: "**($5,000)**" },
    KFLEX: { name: "K-FLEX USA", contacts: [], notes: [], freightInfo: "**(30 cartons)**" },
    STEFAS: { name: "STELFAST INC.", contacts: [], notes: [], freightInfo: "**($1,500)**" }
};

// --- Data Sanitization & Mapping ---
const lotMapping = { item: ['Item', 'item'], description: ['Description', 'description'], warehouse: ['WH', 'wh', 'Warehouse'], location: ['Location', 'location'], onHand: ['On Hand', 'onHand'], committed: ['Committed', 'committed'], available: ['Available', 'available'], vendor: ['Vendor', 'vendor'], };
const itemsMapping = { item: ['Item', 'item'], description: ['Description', 'description'], unitCost: ['Unit Loaded Cost', 'Avg Cost', 'unitCost'], primaryVendor: ['Primary Vendor', 'primaryVendor'], category: ['Categories', 'Item Category', 'category'], rpl: ['RPL', 'rpl'], vendorCode: ['Vendor Code', 'vendorCode'] };
const usageMapping = { item: ['Item', 'item'], warehouse: ['WH', 'wh', 'Warehouse'], monthlyAvg: ['MO Avg', 'monthlyAvg'], min: ['Min', 'min'], max: ['Max', 'max'], };
const poMapping = { po: ['PO', 'po'], vendorName: ['Vendor Name', 'vendorName'], warehouse: ['WH', 'wh', 'Warehouse'], ordDate: ['Ord Date', 'ordDate'], shipDate: ['Ship Date', 'shipDate'], status: ['Status', 'status'], openTotal: ['Open Total', 'openTotal'], item: ['Item', 'item'], openQty: ['Open', 'open'], };
const salesMapping = { orderDate: ['Order Date'], wantedDate: ['Wanted Date'], warehouse: ['WH'], order: ['Order'], customerName: ['Customer Name'], item: ['Item'], description: ['Description'], qty: ['Qty'], };
const vendorsMapping = { vendorCode: ['Vendor Code', 'Vendor'], vendorName: ['Vendor Name', 'Name'], };
const allMappings: { [key: string]: any } = { lot: lotMapping, items: itemsMapping, usage: usageMapping, po: poMapping, sales: salesMapping, vendors: vendorsMapping };

const sanitizeRow = (row: any, mapping: any) => {
    const sanitized: { [key:string]: any } = {};
    for (const key in mapping) {
        const possibleHeaders = mapping[key];
        let value = null;
        for (const header of possibleHeaders) {
            if (row[header] !== undefined && row[header] !== null) {
                value = row[header];
                break;
            }
        }
        sanitized[key] = value;
    }
    return sanitized;
};

const sanitizeData = (data: any[], type: string) => {
    const mapping = allMappings[type];
    if (!mapping) return data;
    return data.map(row => {
        const sanitized = sanitizeRow(row, mapping);
        if (sanitized.item !== undefined && sanitized.item !== null) {
            sanitized.item = String(sanitized.item);
        }
        return sanitized;
    });
};

// --- Web Worker for Data Processing ---
const dataProcessorWorker = () => {
    self.onmessage = (event) => {
        const { lotData, itemsData, usageData, VENDOR_LEAD_TIMES, VENDOR_DETAILS } = event.data;

        if (!lotData || !usageData) {
            self.postMessage([]);
            return;
        }

        const vendorNameToCodeMap = new Map();
        for (const code in VENDOR_DETAILS) {
            vendorNameToCodeMap.set(VENDOR_DETAILS[code].name, code);
        }

        const itemsMap = new Map();
        itemsData.forEach((i: any) => itemsMap.set(String(i.item), i));

        const usageMap = new Map();
        usageData.forEach((u: any) => usageMap.set(`${String(u.item)}-${u.warehouse}`, u));

        const lotGroups = lotData.reduce((acc: any, lot: any) => {
            const key = `${String(lot.item)}-${lot.warehouse}`;
            if (!acc[key]) {
                acc[key] = { ...lot, onHand: 0, committed: 0, available: 0, locations: new Set() };
            }
            acc[key].onHand += parseFloat(String(lot.onHand ?? '0').replace(/,/g, '')) || 0;
            acc[key].committed += parseFloat(String(lot.committed ?? '0').replace(/,/g, '')) || 0;
            acc[key].available += parseFloat(String(lot.available ?? '0').replace(/,/g, '')) || 0;
            if (lot.location) acc[key].locations.add(lot.location);
            return acc;
        }, {});

        const merged = Object.values(lotGroups).map((lot: any) => {
            const itemDetails = itemsMap.get(String(lot.item)) || {};
            const usageDetails = usageMap.get(`${String(lot.item)}-${lot.warehouse}`) || {};
            
            const unitCost = itemDetails.unitCost || 0;
            const available = lot.available || 0;
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
                monthlyAvg: usageDetails.monthlyAvg || 0,
                min: usageDetails.min || 0,
                max: usageDetails.max || 0,
                leadTime: (vendorCode && VENDOR_LEAD_TIMES[vendorCode]) || VENDOR_LEAD_TIMES['DEFAULT'],
                rpl: itemDetails.rpl || '',
                category: itemDetails.category
            };
        });

        self.postMessage(merged);
    };
};

// --- Notification Context ---
type NotificationContextType = {
  showNotification: (message: string, type?: 'success' | 'error' | 'info') => void;
};
const NotificationContext = createContext<NotificationContextType | undefined>(undefined);
const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotification must be used within a NotificationProvider');
  return context;
};

// --- Custom Hook for Data Management ---
const useDataProcessor = () => {
    const { showNotification } = useNotification();
    const [allData, setAllData] = useState<{
        itemsData: ItemData[], lotData: LotData[], usageData: UsageData[], poData: POData[], salesData: SalesData[], vendorsData: VendorData[]
    }>({ itemsData: [], lotData: [], usageData: [], poData: [], salesData: [], vendorsData: [] });
    
    const [mergedInventory, setMergedInventory] = useState<MergedInventoryItem[]>([]);
    const [filesLoaded, setFilesLoaded] = useState<{ [key: string]: FileInfo }>({});
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingMessage, setProcessingMessage] = useState('Initializing...');
    const [papaLoaded, setPapaLoaded] = useState(!!(window as any).Papa);
    const hasLoadedFromLocalStorage = useRef(false);

    const workerRef = useRef<Worker | null>(null);

    useEffect(() => {
        // Initialize Papaparse
        if (!(window as any).Papa) {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.3.2/papaparse.min.js';
            script.async = true;
            script.onload = () => setPapaLoaded(true);
            script.onerror = () => showNotification('Error loading data parser. Please refresh.', 'error');
            document.body.appendChild(script);
        }

        // Initialize Web Worker
        const workerString = `(${dataProcessorWorker.toString()})()`;
        const workerBlob = new Blob([workerString], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(workerBlob);
        const worker = new Worker(workerUrl);
        workerRef.current = worker;

        worker.onmessage = (event) => {
            setMergedInventory(event.data);
            setIsProcessing(false);
            setProcessingMessage('');
        };

        return () => {
            worker.terminate();
            URL.revokeObjectURL(workerUrl);
        };
    }, [showNotification]); 
    
    useEffect(() => {
        if (hasLoadedFromLocalStorage.current) return;
        hasLoadedFromLocalStorage.current = true;

        setIsProcessing(true);
        setProcessingMessage('Checking for saved data...');
        try {
            const savedData = localStorage.getItem('fsiDashboardData');
            if (savedData) {
                const data = JSON.parse(savedData);
                setAllData({
                    itemsData: data.itemsData || [], lotData: data.lotData || [], usageData: data.usageData || [], poData: data.poData || [], salesData: data.salesData || [], vendorsData: data.vendorsData || []
                });
                setLastUpdated(data.lastUpdated);
                setFilesLoaded(data.filesLoaded || {});
                 if ((data.lotData || []).length > 0 && (data.usageData || []).length > 0) {
                    showNotification('Restored previous session data.', 'info');
                }
            }
        } catch (error) {
            showNotification('Could not load saved data. Clearing corrupted data.', 'error');
            localStorage.removeItem('fsiDashboardData');
        } finally {
            setIsProcessing(false);
            setProcessingMessage('');
        }
    }, []); // Runs only once on mount
    
    useEffect(() => {
        // Trigger worker when underlying data changes
        const { lotData, itemsData, usageData } = allData;
        if (lotData.length > 0 && usageData.length > 0) {
            setIsProcessing(true);
            setProcessingMessage('Processing data in the background...');
            workerRef.current?.postMessage({ lotData, itemsData, usageData, VENDOR_LEAD_TIMES, VENDOR_DETAILS });
        } else {
            setMergedInventory([]);
        }
    }, [allData.lotData, allData.itemsData, allData.usageData]);
    
    const saveData = useCallback(() => {
        setIsProcessing(true);
        setProcessingMessage('Saving session...');
        try {
            const dataToSave = { ...allData, lastUpdated, filesLoaded };
            localStorage.setItem('fsiDashboardData', JSON.stringify(dataToSave));
            showNotification('Session data saved successfully!');
        } catch (error) { showNotification('Error saving data.', 'error'); }
        setIsProcessing(false);
        setProcessingMessage('');
    }, [allData, lastUpdated, filesLoaded, showNotification]);

    const clearData = () => {
        setAllData({ itemsData: [], lotData: [], usageData: [], poData: [], salesData: [], vendorsData: [] });
        setLastUpdated(null);
        setFilesLoaded({});
        localStorage.removeItem('fsiDashboardData');
        showNotification('All data has been cleared.');
    };
    
    const handleFileUpload = (file: File, type: string) => {
        if (!papaLoaded) {
            showNotification('Data parser is not ready.', 'info');
            return;
        }
        setIsProcessing(true);
        setProcessingMessage(`Parsing ${file.name}...`);
        (window as any).Papa.parse(file, {
            header: true, dynamicTyping: true, skipEmptyLines: true,
            complete: (results: any) => {
                const sanitized = sanitizeData(results.data, type);
                const fileInfo = { name: file.name, count: results.data.length };
                setAllData(prev => ({ ...prev, [`${type}Data`]: sanitized }));
                setFilesLoaded((prev) => ({ ...prev, [type]: fileInfo }));
                setLastUpdated(new Date().toLocaleString());
                showNotification(`${file.name} (${results.data.length} rows) loaded.`);
                setIsProcessing(false);
                setProcessingMessage('');
            },
            error: (error: any) => {
                showNotification(`Error parsing ${file.name}: ${error.message}`, 'error');
                setIsProcessing(false);
                setProcessingMessage('');
            }
        });
    };

    const handleMassUpload = (files: FileList) => {
        if (!papaLoaded) {
            showNotification('Data parser is not ready.', 'info');
            return;
        }
        setIsProcessing(true);
        setProcessingMessage('Identifying and processing files...');
        const fileSignatures = {
            lot: [['On Hand', 'onHand'], ['Committed', 'committed'], ['Available', 'available']],
            items: [['Primary Vendor', 'primaryVendor'], ['Unit Loaded Cost', 'Avg Cost', 'unitCost']],
            usage: [['MO Avg', 'monthlyAvg'], ['Min', 'min'], ['Max', 'max']],
            po: [['PO', 'po'], ['Ord Date', 'ordDate']],
            sales: [['Wanted Date'], ['Customer Name']],
            vendors: [['Vendor Code', 'Vendor'], ['Vendor Name', 'Name']]
        };
    
        const newAllData: { [key: string]: any[] } = {};
        const newFilesLoaded: { [key: string]: FileInfo } = {};
        let identifiedCount = 0;
    
        const parsePromises = Array.from(files).map(file => new Promise<void>(resolve => {
            (window as any).Papa.parse(file, {
                header: true,
                preview: 1,
                complete: (results: any) => {
                    const headers = results.meta.fields || [];
                    const identifiedType = Object.keys(fileSignatures).find(type =>
                        (fileSignatures as any)[type].every((sigGroup: string[]) => sigGroup.some(h => headers.includes(h)))
                    );
    
                    if (identifiedType) {
                        // Re-parse the full file now that we know its type
                        (window as any).Papa.parse(file, {
                            header: true,
                            dynamicTyping: true,
                            skipEmptyLines: true,
                            complete: (fullResults: any) => {
                                const sanitized = sanitizeData(fullResults.data, identifiedType);
                                newAllData[`${identifiedType}Data`] = sanitized;
                                newFilesLoaded[identifiedType] = { name: file.name, count: fullResults.data.length };
                                identifiedCount++;
                                resolve();
                            },
                            error: (error: any) => {
                                showNotification(`Error parsing ${file.name}: ${error.message}`, 'error');
                                resolve(); // Resolve even on error to not block other files
                            }
                        });
                    } else {
                        resolve(); // Resolve for unidentified files
                    }
                },
                error: (error: any) => {
                     showNotification(`Error reading ${file.name}: ${error.message}`, 'error');
                     resolve(); // Resolve on error
                }
            });
        }));
    
        Promise.all(parsePromises).then(() => {
            if (identifiedCount > 0) {
                setAllData(prev => ({ ...prev, ...newAllData }));
                setFilesLoaded(prev => ({ ...prev, ...newFilesLoaded }));
                setLastUpdated(new Date().toLocaleString());
                showNotification(`Successfully identified and processed ${identifiedCount} of ${files.length} files.`);
            } else {
                showNotification('Could not identify any uploaded files. Please check headers.', 'error');
            }
            setIsProcessing(false);
            setProcessingMessage('');
        });
    };
    
    return {
        ...allData, mergedInventory, filesLoaded, lastUpdated, isProcessing, processingMessage, papaLoaded,
        saveData, clearData, handleFileUpload, handleMassUpload
    };
};

// --- Helper Hook for Sorting ---
const useSortableData = <T extends Record<string, any>>(items: T[], config: { key: keyof T; direction: 'ascending' | 'descending'; } | null = null) => {
    const [sortConfig, setSortConfig] = useState<{ key: keyof T; direction: 'ascending' | 'descending'; } | null>(config);

    const sortedItems = useMemo(() => {
        if (!items) return [];
        let sortableItems = [...items];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                const valA = a[sortConfig.key];
                const valB = b[sortConfig.key];
                if (valA < valB) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return sortableItems;
    }, [items, sortConfig]);

    const requestSort = (key: keyof T) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    return { items: sortedItems, requestSort, sortConfig };
};

// --- UI Components ---
const LoadingSpinner = ({ message }: { message: string }) => (
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

interface KpiData { totalValue: number; totalSkus: number; lowStockItems: number; openPOsCount: number; openPOValue: number; activeVendors: number; }
const KpiGrid = ({ kpis }: { kpis: KpiData }) => (
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

const TabButton = (props: { id: string, activeTab: string, setActiveTab: (id: string) => void, dataLoaded: boolean }) => {
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

const WarehouseSelector = ({ selected, onChange }: { selected: string, onChange: (value: string) => void }) => (
    <select value={selected} onChange={(e) => onChange(e.target.value)} aria-label="Select a warehouse to filter inventory" className="px-3 py-2 border border-border rounded-md text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary w-full">
        <option value="all">All Warehouses</option>
        <option value="PA">West Chester (PA)</option>
        <option value="TX">Corsicana (TX)</option>
        <option value="NE">La Vista (NE)</option>
    </select>
);

const SearchBar = ({ term, onSearch, tab }: { term: string, onSearch: (value: string) => void, tab: string }) => {
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

const FileUploadBox = (props: { type: string, title: string, description: string, icon: React.ElementType, onUpload: (file: File, type: string) => void, fileInfo: FileInfo, disabled: boolean }) => {
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

const UploadTab = ({ handleFileUpload, filesLoaded, papaLoaded, handleMassUpload }: { handleFileUpload: (file: File, type: string) => void, filesLoaded: { [key: string]: FileInfo }, papaLoaded: boolean, handleMassUpload: (files: FileList) => void }) => (
    <div className="max-w-6xl mx-auto">
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
            <div className="flex items-start">
                <AlertCircle className="w-5 h-5 text-blue-500 mr-3 mt-1 flex-shrink-0" />
                <div>
                    <p className="text-sm text-blue-800 dark:text-blue-300 font-medium mb-2">Instructions for Uploading FSI Files:</p>
                    <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1 list-disc list-inside">
                        <li><strong>Recommended:</strong> Use the "Upload Multiple Files" button to select all your CSVs at once.</li>
                        <li><strong>Required:</strong> You must upload at least the "Lot CSV" and "Usage Report" for the dashboard to work.</li>
                        <li><strong>For Best Results:</strong> Upload all available reports, especially the new "Vendors Report", for the most accurate data.</li>
                    </ul>
                </div>
            </div>
        </div>
        {!papaLoaded && (<div className="text-center p-4 text-yellow-800 bg-yellow-100 dark:text-yellow-300 dark:bg-yellow-900/20 rounded-md">Initializing data parser...</div>)}
        <div className="text-center mb-8">
            <input type="file" multiple accept=".csv" onChange={(e) => e.target.files && handleMassUpload(e.target.files)} id="mass-upload" className="hidden" disabled={!papaLoaded} />
            <label htmlFor="mass-upload" className={`inline-flex items-center gap-2 px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white ${!papaLoaded ? 'bg-gray-400 cursor-not-allowed' : 'bg-primary hover:bg-primary-dark cursor-pointer'}`}>
                <Files size={20} /> Upload Multiple Files (Recommended)
            </label>
            <p className="text-xs text-foreground-muted mt-2">Select all your CSV reports at once. The app will identify them automatically.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4">
            <FileUploadBox type="lot" title="Lot CSV" description="WH Inventory" icon={Package} onUpload={handleFileUpload} fileInfo={filesLoaded.lot} disabled={!papaLoaded} />
            <FileUploadBox type="usage" title="Usage Report" description="Monthly History" icon={BarChart} onUpload={handleFileUpload} fileInfo={filesLoaded.usage} disabled={!papaLoaded} />
            <FileUploadBox type="items" title="Items Report" description="Costs & Vendors" icon={FileText} onUpload={handleFileUpload} fileInfo={filesLoaded.items} disabled={!papaLoaded} />
            <FileUploadBox type="po" title="Purchasing History" description="Open & Closed POs" icon={Truck} onUpload={handleFileUpload} fileInfo={filesLoaded.po} disabled={!papaLoaded} />
            <FileUploadBox type="sales" title="Sales Orders" description="Open Sales Orders" icon={Users} onUpload={handleFileUpload} fileInfo={filesLoaded.sales} disabled={!papaLoaded} />
            <FileUploadBox type="vendors" title="Vendors Report" description="Vendor Codes & Names" icon={Users} onUpload={handleFileUpload} fileInfo={filesLoaded.vendors} disabled={!papaLoaded} />
        </div>
    </div>
);

const InventoryTab = ({ inventory, calculateReorderQty, callGeminiAPI }: { inventory: MergedInventoryItem[], calculateReorderQty: (item: MergedInventoryItem) => ReorderInfo, callGeminiAPI: (prompt: string) => Promise<string> }) => {
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
        const prompt = GEMINI_PROMPTS.inventoryAnalysis(inventory, calculateReorderQty);
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
                                        <td className="table-cell text-right">{isFinite(reorderInfo.daysOfSupply) ? reorderInfo.daysOfSupply : '∞'}</td>
                                        <td className={`table-cell text-center ${isLongLeadTime ? 'text-yellow-600 dark:text-yellow-400 font-semibold' : ''}`}>
                                            {isLongLeadTime && <AlertTriangle size={12} className="inline-block mr-1" />}
                                            {item.leadTime}
                                        </td>
                                        <td className="table-cell text-center"><StatusBadge reorderInfo={reorderInfo} item={item} /></td>
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

const SummaryRow = ({ label, value, color = 'text-foreground' }: { label: string, value: string | number, color?: string }) => (
    <div className="flex justify-between">
        <span className="text-foreground-muted">{label}</span>
        <span className={`font-medium ${color}`}>{value}</span>
    </div>
)

const parseFreightGoal = (freightInfo: string): number => {
    const freightInfoStr = String(freightInfo ?? '');
    if (!freightInfoStr) return 0;
    // More precise regex for currency/numbers, inside or outside parentheses
    const match = freightInfoStr.match(/\$?([\d,]+(?:\.\d{1,2})?)/);
    if (match && match[1]) {
        return parseFloat(match[1].replace(/,/g, ''));
    }
    return 0;
};

const FreightProgressBar = ({ value, goal }: { value: number, goal: number }) => {
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

const ReorderWorksheet = ({ inventory, searchTerm, calculateReorderQty, callGeminiAPI, copyToClipboard }: { inventory: MergedInventoryItem[], searchTerm: string, calculateReorderQty: (item: MergedInventoryItem) => ReorderInfo, callGeminiAPI: (prompt: string) => Promise<string>, copyToClipboard: (text: string) => void }) => {
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
        const prompt = GEMINI_PROMPTS.reorderEmail(vendor, items, editedQuantities, calculateReorderQty);
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
                const freightGoal = parseFreightGoal(freightInfo);

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

const OrdersTab = ({ orders, searchTerm }: { orders: POData[], searchTerm: string }) => {
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
                        {paginatedOrders.map(po => (
                            <tr key={po.po} className="hover:bg-surface">
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

const parseDateString = (dateString?: string): Date => {
    if (!dateString) return new Date(0); // Return epoch for invalid/missing dates
    // Handles MM/DD/YYYY format reliably
    const parts = dateString.split('/');
    if (parts.length === 3) {
        const [month, day, year] = parts.map(Number);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year > 1900) {
            return new Date(year, month - 1, day); // Month is 0-indexed
        }
    }
    // No longer using unreliable new Date(string) fallback.
    // If other formats are expected, they should be parsed explicitly here.
    return new Date(0);
};

const SalesOrdersTab = ({ salesData, searchTerm }: { salesData: SalesData[], searchTerm: string }) => {
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
                            const isLate = wantedDate < today && wantedDate.getTime() !== 0; // Check it's a valid date
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

interface VendorSummary { code: string; name: string; skuCount: number; inventoryValue: number; lowStockItems: number; }
const VendorsTab = ({ inventory, vendorsData, calculateReorderQty, searchTerm }: { inventory: MergedInventoryItem[], vendorsData: VendorData[], calculateReorderQty: (item: MergedInventoryItem) => ReorderInfo, searchTerm: string }) => {
    const [expandedVendor, setExpandedVendor] = useState<string | null>(null);

    const vendorsSummary: VendorSummary[] = useMemo(() => {
        const vendorMap: { [key: string]: any } = {};

        // Build vendor list ONLY from items that have inventory
        inventory.forEach(invItem => {
            const vendorCode = invItem.vendorCode;
            if (!vendorCode) return; // Skip items without a vendor code

            // If vendor is not in the map, initialize it
            if (!vendorMap[vendorCode]) {
                const vendorData = vendorsData.find(v => v.vendorCode === vendorCode);
                // Prioritize name from inventory, then vendor details, then vendor file, then fallback.
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

            // Aggregate data
            const vendor = vendorMap[vendorCode];
            vendor.inventoryValue += (invItem.inventoryValue || 0);
            vendor._managedSkus.add(invItem.item);

            // Tally low stock items, ensuring each unique item is only counted once per vendor
            if (calculateReorderQty(invItem).needsReorder && !vendor._lowStockSkus.has(invItem.item)) {
                vendor.lowStockItems++;
                vendor._lowStockSkus.add(invItem.item);
            }
        });

        // Process the aggregated data into the final format
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

const SalesSupportTab = ({ inventory, copyToClipboard, poData, callGeminiAPI }: { inventory: MergedInventoryItem[], copyToClipboard: (t: string) => void, poData: POData[], callGeminiAPI: (p: string) => Promise<string> }) => {
    const [paSearch, setPaSearch] = useState('');
    const [basePart, setBasePart] = useState('');
    const [partSegments, setPartSegments] = useState<string[]>([]);
    const [generatedDesc, setGeneratedDesc] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [newPartNumber, setNewPartNumber] = useState('');
    const [similarParts, setSimilarParts] = useState<string[]>([]);
    const [isChecking, setIsChecking] = useState(false);

    const paResults = useMemo(() => {
        if (!paSearch || paSearch.length < 3) return [];
        const search = paSearch.toUpperCase();
        const results: { [key: string]: any } = {};
        inventory.forEach(item => {
            if (String(item.item || '').toUpperCase().includes(search)) {
                if (!results[item.item]) { results[item.item] = { description: item.description, unitCost: item.unitCost, warehouses: {}, inbound: [] }; }
                results[item.item].warehouses[item.warehouse] = item.available;
            }
        });
        poData.forEach(line => { if (line.status === 'Open' && String(line.item || '').toUpperCase().includes(search) && results[line.item]) { results[line.item].inbound.push({ po: line.po, qty: line.openQty, shipDate: line.shipDate }); } });
        return Object.entries(results);
    }, [paSearch, inventory, poData]);

    const handleTemplateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.toUpperCase();
        setBasePart(value);
        if (value) { setPartSegments(value.split('-')); } else { setPartSegments([]); }
    };

    useEffect(() => { setNewPartNumber(partSegments.map(s => s.trim()).filter(Boolean).join('-')); }, [partSegments]);

    const handleSegmentChange = (index: number, value: string) => {
        const newSegments = [...partSegments];
        newSegments[index] = value.toUpperCase();
        setPartSegments(newSegments);
    };

    const handleGenerateDesc = async () => {
        if (!newPartNumber) return;
        setIsGenerating(true); setGeneratedDesc('');
        const basePartInfo = inventory.find(item => String(item.item || '').toUpperCase() === basePart.toUpperCase());
        const prompt = GEMINI_PROMPTS.generateDescription(newPartNumber, partSegments, basePartInfo);
        const result = await callGeminiAPI(prompt);
        setGeneratedDesc(result);
        setIsGenerating(false);
    };

    const handleSimilarityCheck = async () => {
        if (!newPartNumber) return;
        setIsChecking(true); setSimilarParts([]);
        const prompt = GEMINI_PROMPTS.similarityCheck(newPartNumber, partSegments, inventory);
        const result = await callGeminiAPI(prompt);
        setSimilarParts(result.split('\n').filter(line => line.trim().length > 0));
        setIsChecking(false);
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-4 border border-border rounded-lg bg-card">
                <h3 className="font-bold text-lg mb-2 flex items-center"><Search size={20} className="mr-2 text-blue-500" />Price & Availability Checker</h3>
                <p className="text-sm text-foreground-muted mb-4">Quickly check stock and inbound POs for Sales.</p>
                <input type="text" placeholder="Enter FSI Part #..." value={paSearch} onChange={e => setPaSearch(e.target.value)} className="w-full p-2 border border-border rounded-md bg-surface" />
                <div className="mt-4 space-y-3 max-h-[60vh] overflow-y-auto">
                    {paResults.map(([item, data]) => {
                        const customerPrice = ((data.unitCost || 0) * 1.4).toFixed(2);
                        const availabilityText = ['PA', 'TX', 'NE'].map(wh => `${wh}: ${data.warehouses[wh]?.toLocaleString() || 0} avail.`).join(' | ');
                        const inboundText = data.inbound.length > 0 ? `\nInbound: ${data.inbound.map((po: any) => `${po.qty} on PO ${po.po} (est. ${po.shipDate || 'TBD'})`).join(', ')}` : '';
                        const teamsMessage = `Part: ${item}\nDesc: ${data.description}\n${availabilityText}${inboundText}\nCustomer Price: ~$${customerPrice}/ea`;
                        return (
                            <div key={item} className="p-3 border border-border rounded-lg bg-surface">
                                <div className="flex justify-between items-start">
                                    <div className="text-sm">
                                        <p className="font-bold text-foreground">{item}</p><p className="text-foreground-muted">{data.description}</p>
                                        <div className="flex gap-4 mt-2 text-xs">{['PA', 'TX', 'NE'].map(wh => <p key={wh}><span className="font-bold">{wh}:</span> {data.warehouses[wh]?.toLocaleString() || <span className="text-gray-400">0</span>}</p>)}</div>
                                        {data.inbound.length > 0 && <div className="mt-2 text-xs text-blue-500"><p className="font-bold">Inbound on POs:</p>{data.inbound.map((po: any) => <p key={po.po}>- PO {po.po}: {po.qty} (Est Ship: {po.shipDate || 'TBD'})</p>)}</div>}
                                    </div>
                                    <button onClick={() => copyToClipboard(teamsMessage)} className="action-button bg-blue-600 hover:bg-blue-700 text-xs"><Copy size={14} /> Copy for Teams</button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            <div className="p-4 border border-border rounded-lg bg-card">
                <h3 className="font-bold text-lg mb-2 flex items-center"><Wand2 size={20} className="mr-2 text-purple-500" />Part Number Generator</h3>
                <p className="text-sm text-foreground-muted mb-4">Create a new part number and AI-generated description from any template.</p>
                <input type="text" placeholder="Enter any string as a template (e.g., F-SCREW-HEX-1-Z)..." value={basePart} onChange={handleTemplateChange} className="w-full p-2 border border-border rounded-md bg-surface" />
                {basePart && (
                    <div className="mt-4 space-y-3">
                         <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {partSegments.map((segment, index) => (<div key={index}><label className="text-xs text-foreground-muted capitalize">Segment {index + 1}</label><input type="text" value={segment} onChange={(e) => handleSegmentChange(index, e.target.value)} className="w-full p-2 border border-border rounded-md text-sm bg-surface font-mono" /></div>))}
                        </div>
                        <div className="p-2 border border-border rounded-md bg-yellow-50 dark:bg-yellow-900/20 text-center"><p className="text-xs text-yellow-800 dark:text-yellow-300">New Part Number</p><p className="font-mono font-bold text-lg">{newPartNumber}</p></div>
                        <button onClick={handleSimilarityCheck} disabled={isChecking || !newPartNumber} className="action-button bg-gray-500 hover:bg-gray-600 w-full disabled:opacity-50">{isChecking ? <Loader size={16} className="animate-spin" /> : ' '} Check for Similar Parts</button>
                        {similarParts.length > 0 && (<div className="p-2 border rounded-md bg-orange-50 dark:bg-orange-900/20 text-sm"><p className="font-bold mb-1">Similar Parts Found:</p><ul className="list-disc list-inside text-xs">{similarParts.map((line, i) => <li key={i}>{line}</li>)}</ul></div>)}
                        <button onClick={handleGenerateDesc} disabled={isGenerating || !newPartNumber} className="action-button bg-purple-600 hover:bg-purple-700 w-full disabled:opacity-50">{isGenerating ? <Loader size={16} className="animate-spin" /> : '✨'} Generate Description</button>
                        {generatedDesc && (<div className="p-2 border rounded-md bg-green-50 dark:bg-green-900/20"><textarea value={generatedDesc} readOnly className="w-full h-24 p-2 text-sm bg-transparent border-none focus:ring-0" /><button onClick={() => copyToClipboard(generatedDesc)} className="action-button bg-blue-600 hover:bg-blue-700 text-xs w-full"><Copy size={14} /> Copy Description</button></div>)}
                    </div>
                )}
            </div>
        </div>
    );
};

const DetailItem = ({ label, value, highlight = false }: { label: string, value: string | number, highlight?: boolean }) => (<div><p className="text-gray-500 dark:text-gray-400">{label}</p><p className={`font-medium ${highlight ? 'text-primary' : 'text-foreground'}`}>{value}</p></div>);

const StatusBadge = ({ reorderInfo, item }: { reorderInfo: ReorderInfo, item: MergedInventoryItem }) => {
    if (reorderInfo.needsReorder) return <span className="status-badge bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">Reorder</span>;
    if (item.available > (item.monthlyAvg || 0) * PURCHASING_LOGIC_CONSTANTS.OVERSTOCK_MONTHS_THRESHOLD) return <span className="status-badge bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">Overstock</span>;
    return <span className="status-badge bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">OK</span>;
};

const Pagination = ({ currentPage, totalPages, onPageChange, totalItems, itemsPerPage }: { currentPage: number, totalPages: number, onPageChange: (page: number) => void, totalItems: number, itemsPerPage: number }) => {
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

const Notification = (props: { message: string, type: string, onClose: () => void }) => {
    const { message, type, onClose } = props;
    const styles: { [key: string]: string } = { success: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300', error: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300', info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' };
    const icons: { [key: string]: React.ReactElement } = { success: <CheckCircle />, error: <AlertCircle />, info: <AlertCircle /> };
    return (
        <div role="status" aria-live="polite" className={`fixed bottom-5 right-5 z-50 flex items-center p-4 rounded-lg shadow-lg ${styles[type]}`}>
            <div className="mr-3">{icons[type]}</div>
            <div className="text-sm font-medium">{message}</div>
            <button onClick={onClose} className="ml-4 -mr-2 p-1.5 rounded-md hover:bg-white/50"><XCircle size={20} /></button>
        </div>
    );
};

// --- Main Dashboard Component ---
const FSIDashboard = () => {
    // UI State
    const [activeTab, setActiveTab] = useState('upload');
    const [selectedWarehouse, setSelectedWarehouse] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [initialRedirectDone, setInitialRedirectDone] = useState(false);
    
    const { showNotification } = useNotification();
    const { itemsData, lotData, usageData, poData, salesData, vendorsData, mergedInventory, filesLoaded, lastUpdated, isProcessing, processingMessage, papaLoaded, saveData, clearData, handleFileUpload, handleMassUpload } = useDataProcessor();

    const callGeminiAPI = async (prompt: string): Promise<string> => {
        try {
            // SECURITY BEST PRACTICE: In a production environment, this key should not be exposed on the client side.
            // An API request should be proxied through a secure backend server where the key is stored securely.
            if (!process.env.API_KEY) throw new Error("API_KEY environment variable not set.");
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const response: GenerateContentResponse = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
            return response.text ?? "";
        } catch (e: any) {
            const errorMessage = e.message || "An unexpected error occurred.";
            console.error("Gemini API Error:", e);
            showNotification(`API Error: ${errorMessage}`, 'error');
            return `Error: ${errorMessage}`;
        }
    };

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            showNotification('Copied to clipboard!', 'info');
        } catch (err) { showNotification('Failed to copy text.', 'error'); }
    };

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

    const calculateReorderQty = useCallback((item: MergedInventoryItem): ReorderInfo => {
        const { DAYS_IN_MONTH, SAFETY_STOCK_DAYS, TARGET_STOCK_MULTIPLIER, LONG_LEAD_TIME_SAFETY_FACTOR } = PURCHASING_LOGIC_CONSTANTS;
        const defaultLeadTime = VENDOR_LEAD_TIMES['DEFAULT'];
        const monthlyAvg = item.monthlyAvg || 0;
        const dailyAvg = monthlyAvg / DAYS_IN_MONTH;
        const leadTime = item.leadTime || defaultLeadTime;
        
        let effectiveSafetyStockDays = SAFETY_STOCK_DAYS;
        if (leadTime > defaultLeadTime) {
            const extraSafetyDays = Math.ceil(leadTime * LONG_LEAD_TIME_SAFETY_FACTOR);
            effectiveSafetyStockDays += extraSafetyDays;
        }
        
        // Prioritize ERP min/max levels for reorder point and target stock.
        const calculatedReorderPoint = dailyAvg * (leadTime + effectiveSafetyStockDays);
        const reorderPoint = item.min > 0 ? item.min : calculatedReorderPoint;

        const calculatedTargetStock = reorderPoint * TARGET_STOCK_MULTIPLIER;
        const targetStock = item.max > 0 ? item.max : calculatedTargetStock;

        const daysOfSupply = dailyAvg > 0 ? item.available / dailyAvg : Infinity;
        const needsReorder = item.available <= reorderPoint;
        
        let suggested = 0;
        if (needsReorder) {
            // Suggest a quantity to bring stock up to the target level.
            const qtyToReachTarget = targetStock - item.available;
            suggested = Math.max(0, Math.ceil(qtyToReachTarget));
        }

        return { reorderPoint, targetStock, daysOfSupply, needsReorder, suggested };
    }, []);

    const kpiData: KpiData = useMemo(() => {
        const uniqueSkus = new Set(mergedInventory.map(i => i.item));
        const lowStockItems = mergedInventory.filter(i => calculateReorderQty(i).needsReorder);
        const openPOs = poData.filter(p => p.status === 'Open');
        const uniqueOpenVendors = new Set(openPOs.map(p => p.vendorName));
        return {
            totalValue: mergedInventory.reduce((sum, item) => sum + item.inventoryValue, 0),
            totalSkus: uniqueSkus.size, lowStockItems: lowStockItems.length, openPOsCount: openPOs.length,
            openPOValue: openPOs.reduce((sum, po) => sum + (po.openTotal || 0), 0),
            activeVendors: uniqueOpenVendors.size
        };
    }, [mergedInventory, poData, calculateReorderQty]);

    const renderTabContent = () => {
        switch (activeTab) {
            case 'upload': return <UploadTab handleFileUpload={handleFileUpload} filesLoaded={filesLoaded} papaLoaded={papaLoaded} handleMassUpload={handleMassUpload} />;
            case 'inventory': return <InventoryTab inventory={searchedInventory} calculateReorderQty={calculateReorderQty} callGeminiAPI={callGeminiAPI} />;
            case 'reorder': return <ReorderWorksheet inventory={filteredInventory} searchTerm={searchTerm} calculateReorderQty={calculateReorderQty} callGeminiAPI={callGeminiAPI} copyToClipboard={copyToClipboard}/>;
            case 'orders': return <OrdersTab orders={poData} searchTerm={searchTerm} />;
            case 'sales': return <SalesOrdersTab salesData={salesData} searchTerm={searchTerm} />;
            case 'vendors': return <VendorsTab inventory={mergedInventory} vendorsData={vendorsData} calculateReorderQty={calculateReorderQty} searchTerm={searchTerm} />;
            case 'tools': return <SalesSupportTab inventory={mergedInventory} poData={poData} copyToClipboard={copyToClipboard} callGeminiAPI={callGeminiAPI}/>;
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

const NotificationProvider = ({ children }: { children: React.ReactNode }) => {
    const [notification, setNotification] = useState({ message: '', type: 'success', show: false });
    const showNotification = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
        setNotification({ message, type, show: true });
        setTimeout(() => setNotification(n => ({ ...n, show: false })), 4000);
    }, []);
    return (
        <NotificationContext.Provider value={{ showNotification }}>
            {children}
            {notification.show && <Notification message={notification.message} type={notification.type} onClose={() => setNotification({ ...notification, show: false })} />}
        </NotificationContext.Provider>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
    <React.StrictMode>
        <ErrorBoundary>
            <NotificationProvider>
                <FSIDashboard />
            </NotificationProvider>
        </ErrorBoundary>
    </React.StrictMode>
);