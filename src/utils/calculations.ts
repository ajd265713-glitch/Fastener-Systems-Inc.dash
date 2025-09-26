import { PURCHASING_LOGIC_CONSTANTS, VENDOR_LEAD_TIMES } from '../domain/constants';
import type { MergedInventoryItem, ReorderInfo } from '../domain/types';

export const calculateReorderQty = (item: MergedInventoryItem): ReorderInfo => {
    const { DAYS_IN_MONTH, SAFETY_STOCK_DAYS, TARGET_STOCK_MULTIPLIER } = PURCHASING_LOGIC_CONSTANTS;
    const defaultLeadTime = VENDOR_LEAD_TIMES['DEFAULT'];
    const monthlyAvg = item.monthlyAvg || 0;
    const dailyAvg = monthlyAvg / DAYS_IN_MONTH;
    const leadTime = item.leadTime || defaultLeadTime;
    
    let effectiveSafetyStockDays = SAFETY_STOCK_DAYS;
    if (leadTime > defaultLeadTime) {
        const extraSafetyDays = Math.ceil(leadTime * PURCHASING_LOGIC_CONSTANTS.LONG_LEAD_TIME_SAFETY_FACTOR);
        effectiveSafetyStockDays += extraSafetyDays;
    }
    
    const calculatedReorderPoint = dailyAvg * (leadTime + effectiveSafetyStockDays);
    const reorderPoint = item.min > 0 ? item.min : calculatedReorderPoint;

    const calculatedTargetStock = reorderPoint * TARGET_STOCK_MULTIPLIER;
    const targetStock = item.max > 0 ? item.max : calculatedTargetStock;

    const daysOfSupply = dailyAvg > 0 ? item.available / dailyAvg : Infinity;
    const needsReorder = item.available <= reorderPoint;
    
    let suggested = 0;
    if (needsReorder) {
        const qtyToReachTarget = targetStock - item.available;
        suggested = Math.max(0, Math.ceil(qtyToReachTarget));
    }

    return { reorderPoint, targetStock, daysOfSupply, needsReorder, suggested };
};
