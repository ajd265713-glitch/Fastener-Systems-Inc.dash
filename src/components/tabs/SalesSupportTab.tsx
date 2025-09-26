import React, { useState, useMemo, useEffect } from 'react';
import { Search, Wand2, Copy, Loader } from 'lucide-react';
import type { MergedInventoryItem, POData } from '../../domain/types';
import { GEMINI_PROMPTS } from '../../services/gemini';

export const SalesSupportTab = ({ inventory, copyToClipboard, poData, callGeminiAPI }: { inventory: MergedInventoryItem[], copyToClipboard: (t: string) => void, poData: POData[], callGeminiAPI: (p: string) => Promise<string> }) => {
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
