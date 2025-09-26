export const PURCHASING_LOGIC_CONSTANTS = {
    DAYS_IN_MONTH: 30,
    SAFETY_STOCK_DAYS: 14, // How many days of supply to keep as safety
    TARGET_STOCK_MULTIPLIER: 1.5, // Target stock is X times reorder point
    OVERSTOCK_MONTHS_THRESHOLD: 6, // Items with more than this many months of supply are "overstock"
    LEAD_TIME_WARNING_DAYS: 21, // Warn if lead time exceeds this. Set higher than default.
    LONG_LEAD_TIME_SAFETY_FACTOR: 0.5, // Add 50% of lead time as additional safety days for long lead times
};

export const UI_CONSTANTS = {
    ITEM_VIEW_ITEMS_PER_PAGE: 25,
    ORDER_VIEW_ITEMS_PER_PAGE: 15,
    SALES_VIEW_ITEMS_PER_PAGE: 15,
    VENDOR_DETAIL_TOP_N_ITEMS: 5,
};

export const VENDOR_LEAD_TIMES: { [key: string]: number } = {
    'STASTA': 21, // STAR STAINLESS
    'ELCIND': 35, // ELCO
    'FORFAS': 21, // FORD
    'EDSMAN': 10, // EDSON
    'DEFAULT': 14,
};
