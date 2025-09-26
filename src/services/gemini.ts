import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import type { MergedInventoryItem, ReorderInfo } from '../domain/types';

export const GEMINI_PROMPTS = {
    inventoryAnalysis: (summary: { totalValue: number; totalSkus: number; topValueItems: MergedInventoryItem[]; lowSupplyItems: MergedInventoryItem[] }) => {
        const { totalValue, totalSkus, topValueItems, lowSupplyItems } = summary;
        return `You are an expert inventory analyst for FSI. Analyze the following summary and provide a brief, actionable, bulleted analysis (3-4 points max). Highlight risks (low stock) or opportunities (overstock).\n\n- Total Items: ${totalSkus}\n- Total Value: $${totalValue.toLocaleString()}\n- Top 5 Items by Value: ${topValueItems.map(i => `${i.item} ($${i.inventoryValue.toLocaleString()})`).join(', ')}\n- Critical Low Stock (<15 days): ${lowSupplyItems.length > 0 ? lowSupplyItems.map(i => i.item).join(', ') : 'None'}`;
    },
    reorderEmail: (vendor: string, items: (MergedInventoryItem & { finalQty: number })[]) => {
        const itemsList = items.map(item => `- ${item.item} (${item.description}): Qty ${item.finalQty}`).join('\n');
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

export const callGeminiAPI = async (prompt: string): Promise<{ success: boolean; data: string; }> => {
    try {
        if (!process.env.API_KEY) {
            throw new Error("API_KEY environment variable not set.");
        }
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt
        });
        return { success: true, data: response.text ?? "" };
    } catch (e: any) {
        const errorMessage = e.message || "An unexpected error occurred.";
        console.error("Gemini API Error:", e);
        return { success: false, data: `API Error: ${errorMessage}` };
    }
};
