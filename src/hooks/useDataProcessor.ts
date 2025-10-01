import { useState, useEffect, useRef, useCallback } from 'react';
import { useNotification } from '../context/NotificationContext';
import { sanitizeData } from '../data-processing/sanitize';
import type { FileInfo, ItemData, LotData, UsageData, POData, SalesData, VendorData, MergedInventoryItem } from '../domain/types';
import { VENDOR_LEAD_TIMES } from '../domain/constants';
import { VENDOR_DETAILS } from '../domain/vendorDetails';

// The entire worker logic is now encapsulated here. It has no external imports.
const dataProcessorWorker = () => {
    const parseNumeric = (value: any): number => {
        if (value === null || value === undefined || value === '') return 0;
        const num = Number(String(value).replace(/,/g, ''));
        return isNaN(num) ? 0 : num;
    };

    const hasRequiredField = (obj: any, field: string): boolean => {
        if (!obj) return false;
        const value = obj[field];
        if (value === undefined || value === null) return false;
        if (typeof value === 'string') {
            return value.trim() !== '';
        }
        return true;
    };

    const filterData = <T>(data: T[] | undefined, requiredFields: string[]): T[] => {
        if (!Array.isArray(data)) return [];
        return data.filter((entry) => requiredFields.every((field) => hasRequiredField(entry, field as string)));
    };

    self.onmessage = (event: MessageEvent<{ lotData: LotData[], itemsData: ItemData[], usageData: UsageData[], VENDOR_LEAD_TIMES: any, VENDOR_DETAILS: any }>) => {
        try {
            const { lotData, itemsData, usageData, VENDOR_LEAD_TIMES, VENDOR_DETAILS } = event.data;
            
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
};


export const useDataProcessor = () => {
    const { showNotification } = useNotification();
    const [allData, setAllData] = useState<{
        itemsData: ItemData[], lotData: LotData[], usageData: UsageData[], poData: POData[], salesData: SalesData[], vendorsData: VendorData[]
    }>({ itemsData: [], lotData: [], usageData: [], poData: [], salesData: [], vendorsData: [] });
    
    const [mergedInventory, setMergedInventory] = useState<MergedInventoryItem[]>([]);
    const [filesLoaded, setFilesLoaded] = useState<{ [key: string]: FileInfo }>({});
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingMessage, setProcessingMessage] = useState('Initializing...');
    const [massUploadSummary, setMassUploadSummary] = useState<{ processed: { type: string; file: FileInfo }[], unidentified: string[] } | null>(null);
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

        // Initialize Web Worker from a self-contained Blob to prevent all loading errors.
        const workerString = `const workerCode = ${dataProcessorWorker.toString()}; workerCode();`;
        const workerBlob = new Blob([workerString], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(workerBlob);
        const worker = new Worker(workerUrl);
        workerRef.current = worker;

        worker.onmessage = (event) => {
            const message = event.data;

            if (message?.type === 'error') {
                console.error("Worker Error:", message.message, message.stack);
                const errorMessage = message.message || 'An unknown error occurred while processing data.';
                showNotification(`Data processing error: ${errorMessage}`, 'error');
                setMergedInventory([]);
            } else if (message?.type === 'success') {
                const payload = Array.isArray(message.payload) ? message.payload : [];
                setMergedInventory(payload);
            } else {
                console.warn("Worker sent an unexpected message format:", message);
                setMergedInventory([]);
            }
            
            setIsProcessing(false);
            setProcessingMessage('');
        };
        
        worker.onerror = (err) => {
            console.error("Critical Worker Error:", err);
            showNotification('A critical error occurred in the background processor.', 'error');
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
    }, []);
    
    useEffect(() => {
        const { lotData, itemsData, usageData } = allData;
        if (lotData.length > 0 && usageData.length > 0 && workerRef.current) {
            setIsProcessing(true);
            setProcessingMessage('Processing data in the background...');
            workerRef.current.postMessage({ lotData, itemsData, usageData, VENDOR_LEAD_TIMES, VENDOR_DETAILS });
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
        setMassUploadSummary(null);

        const fileSignatures = {
            po:      { required: [['PO', 'po']], optional: [['Ord Date', 'ordDate'], ['Open Total', 'openTotal'], ['Open', 'open']], minOptional: 1 },
            sales:   { required: [['Customer Name'], ['Order']], optional: [['Wanted Date']], minOptional: 0 },
            lot:     { required: [['On Hand', 'onHand'], ['Available', 'available']], optional: [['Committed', 'committed']], minOptional: 0 },
            items:   { required: [['Unit Loaded Cost', 'Avg Cost', 'unitCost']], optional: [['Primary Vendor', 'primaryVendor'], ['Item Category', 'category']], minOptional: 1 },
            usage:   { required: [['MO Avg', 'monthlyAvg']], optional: [['Min', 'min'], ['Max', 'max']], minOptional: 0 },
            vendors: { required: [['Vendor Code', 'Vendor'], ['Vendor Name', 'Name']], optional: [], minOptional: 0 }
        };

        const parseResults = {
            newAllData: {} as { [key: string]: any[] },
            newFilesLoaded: {} as { [key: string]: FileInfo },
            processed: [] as { type: string; file: FileInfo }[],
            unidentified: [] as string[]
        };

        const parsePromises = Array.from(files).map(file => new Promise<void>(resolve => {
            (window as any).Papa.parse(file, {
                header: true,
                preview: 1,
                complete: (results: any) => {
                    const headers = results.meta.fields || [];
                    
                    let bestMatch = { type: null as string | null, score: 0 };

                    for (const type in fileSignatures) {
                        const sigs = (fileSignatures as any)[type];
                        const headersMatch = (group: string[]) => group.some(h => headers.includes(h));

                        const requiredMet = sigs.required.every(headersMatch);
                        if (!requiredMet) continue;

                        const optionalMetCount = sigs.optional.reduce((count: number, group: string[]) => count + (headersMatch(group) ? 1 : 0), 0);
                        if (optionalMetCount < sigs.minOptional) continue;
                        
                        const score = sigs.required.length + optionalMetCount;

                        if (score > bestMatch.score) {
                            bestMatch = { type, score };
                        }
                    }

                    const identifiedType = bestMatch.type;

                    if (identifiedType) {
                        (window as any).Papa.parse(file, {
                            header: true,
                            dynamicTyping: true,
                            skipEmptyLines: true,
                            complete: (fullResults: any) => {
                                const sanitized = sanitizeData(fullResults.data, identifiedType);
                                const fileInfo = { name: file.name, count: fullResults.data.length };

                                parseResults.newAllData[`${identifiedType}Data`] = sanitized;
                                parseResults.newFilesLoaded[identifiedType] = fileInfo;
                                parseResults.processed.push({ type: identifiedType, file: fileInfo });
                                resolve();
                            },
                            error: (error: any) => {
                                showNotification(`Error parsing ${file.name}: ${error.message}`, 'error');
                                resolve();
                            }
                        });
                    } else {
                        parseResults.unidentified.push(file.name);
                        resolve();
                    }
                },
                error: (error: any) => {
                     showNotification(`Error reading ${file.name}: ${error.message}`, 'error');
                     resolve();
                }
            });
        }));

        Promise.all(parsePromises).then(() => {
            if (parseResults.processed.length > 0) {
                setAllData(prev => ({ ...prev, ...parseResults.newAllData }));
                setFilesLoaded(prev => ({ ...prev, ...parseResults.newFilesLoaded }));
                setLastUpdated(new Date().toLocaleString());
            }

            if (parseResults.processed.length > 0 || parseResults.unidentified.length > 0) {
                setMassUploadSummary({
                    processed: parseResults.processed,
                    unidentified: parseResults.unidentified
                });
            } else {
                showNotification('Could not identify any uploaded files. Please check headers.', 'error');
            }
            
            setIsProcessing(false);
            setProcessingMessage('');
        });
    };
    
    const clearMassUploadSummary = useCallback(() => setMassUploadSummary(null), []);

    return {
        allData, mergedInventory, filesLoaded, lastUpdated, isProcessing, processingMessage, papaLoaded, massUploadSummary,
        saveData, clearData, handleFileUpload, handleMassUpload, clearMassUploadSummary
    };
};
