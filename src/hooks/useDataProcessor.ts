import { useState, useEffect, useRef, useCallback } from 'react';
import { useNotification } from '../context/NotificationContext';
import { sanitizeData } from '../data-processing/sanitize';
import type { FileInfo, ItemData, LotData, UsageData, POData, SalesData, VendorData, MergedInventoryItem } from '../domain/types';

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
        try {
            // Use document.baseURI as a stable base for resolving the worker path.
            // This is generally more reliable than window.location.href or origin.
            const workerUrl = new URL('src/data-processing/worker.ts', document.baseURI);
            const worker = new Worker(workerUrl, { type: 'module' });
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
                    // Fallback for unexpected message format
                    console.warn("Worker sent an unexpected message format:", message);
                    setMergedInventory([]);
                }
                
                setIsProcessing(false);
                setProcessingMessage('');
            };
            
            worker.onerror = (err) => {
                // This will now catch script loading errors, while the onmessage handler catches runtime errors inside the worker
                console.error("Worker construction/loading error:", err);
                showNotification('Error loading background data processor.', 'error');
                setIsProcessing(false);
                setProcessingMessage('');
            };

            return () => {
                worker.terminate();
            };
        } catch(e) {
            console.error("Failed to construct worker:", e);
            showNotification('Could not start background worker.', 'error');
        }
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
        if (lotData.length > 0 && usageData.length > 0) {
            setIsProcessing(true);
            setProcessingMessage('Processing data in the background...');
            workerRef.current?.postMessage({ lotData, itemsData, usageData });
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
                                resolve();
                            }
                        });
                    } else {
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
        allData, mergedInventory, filesLoaded, lastUpdated, isProcessing, processingMessage, papaLoaded,
        saveData, clearData, handleFileUpload, handleMassUpload
    };
};