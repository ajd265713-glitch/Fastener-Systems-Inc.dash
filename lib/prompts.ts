import { MergedInventoryItem, ReorderInfo } from './types';

type CalculateReorderQty = (item: MergedInventoryItem) => ReorderInfo;

type EditedQuantities = { [key: string]: number };

type GeminiPromptHelpers = {
    inventoryAnalysis: (
        inventory: MergedInventoryItem[],
        calculateReorderQty: CalculateReorderQty
    ) => string;
    reorderEmail: (
        vendor: string,
        items: MergedInventoryItem[],
        editedQuantities: EditedQuantities,
        calculateReorderQty: CalculateReorderQty
    ) => string;
    generateDescription: (
        newPartNumber: string,
        partSegments: string[],
        basePartInfo?: MergedInventoryItem
    ) => string;
    similarityCheck: (
        newPartNumber: string,
        partSegments: string[],
        inventory: MergedInventoryItem[]
    ) => string;
};

export const GEMINI_PROMPTS: GeminiPromptHelpers = {
    inventoryAnalysis: (inventory, calculateReorderQty) => {
        const topValueItems = [...inventory]
            .sort((a, b) => b.inventoryValue - a.inventoryValue)
            .slice(0, 5);
        const lowSupplyItems = inventory.filter(
            (item) => calculateReorderQty(item).daysOfSupply < 15
        );
        const totalValue = inventory.reduce((sum, item) => sum + item.inventoryValue, 0);

        return `You are an expert inventory analyst for FSI. Analyze the following summary and provide a brief, actionable, bulleted analysis (3-4 points max). Highlight risks (low stock) or opportunities (overstock).\n\n- Total Items: ${new Set(inventory.map((item) => item.item)).size}\n- Total Value: $${totalValue.toLocaleString()}\n- Top 5 Items by Value: ${topValueItems
            .map((item) => `${item.item} ($${item.inventoryValue.toLocaleString()})`)
            .join(', ')}\n- Critical Low Stock (<15 days): ${
            lowSupplyItems.length > 0 ? lowSupplyItems.map((item) => item.item).join(', ') : 'None'
        }`;
    },
    reorderEmail: (vendor, items, editedQuantities, calculateReorderQty) => {
        const itemsList = items
            .map((item) => {
                const quantity = editedQuantities[item.id] ?? calculateReorderQty(item).suggested;
                return `- ${item.item} (${item.description}): Qty ${quantity}`;
            })
            .join('\n');

        return `Act as a purchasing associate named Andrew Derrick from FSI. Write a professional, concise email to a vendor named ${vendor}. Ask for a formal quote and estimated lead time for the following list of items. Keep it friendly and to the point.\n\nItems:\n${itemsList}`;
    },
    generateDescription: (newPartNumber, partSegments, basePartInfo) => {
        const oldDesc = basePartInfo?.description || 'a standard hardware component';
        const newAttrsText = partSegments.map((segment, index) => `Segment ${index + 1}: ${segment}`).join(', ');

        return `You are an ERP data specialist for FSI. Your task is to create a new product description based on a template. The template description for a similar part is: "${oldDesc}" The new part has these attributes: ${newAttrsText} The new part number is: ${newPartNumber}\n\n Generate a new description that matches the style and format of the template, but incorporates the new attributes. Be concise and accurate, suitable for an ERP system. If the template description is generic, create a plausible description based on the new part number segments.`;
    },
    similarityCheck: (newPartNumber, partSegments, inventory) => {
        const inventoryListPrompt = (() => {
            let list = '';
            for (const item of inventory) {
                const newItem = `"${item.item}": "${item.description}"\n`;
                if (list.length + newItem.length > 15000) break;
                list += newItem;
            }
            return list;
        })();

        return `You are an ERP data specialist for FSI. Your task is to find similar parts to prevent creating duplicates. A new part is being proposed:\n - New Part #: "${newPartNumber}"\n - New Attributes: Segments are [${partSegments.join(', ')}]\n\n Search the following inventory list and identify up to 3 existing parts that are the closest match. For each match, provide the part number and a brief explanation of why it's similar. Format the output as a simple list. If no good matches are found, say so.\n\n Inventory List (first 15000 chars):\n ${inventoryListPrompt}\n `;
    },
};
