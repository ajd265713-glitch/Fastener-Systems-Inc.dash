import React from 'react';
import { AlertCircle, Package, BarChart, FileText, Truck, Users, Files, X, CheckCircle, AlertTriangle } from 'lucide-react';
import type { FileInfo } from '../../domain/types';
import { FileUploadBox } from '../ui';

type MassUploadSummaryProps = {
    summary: {
        processed: { type: string; file: FileInfo }[];
        unidentified: string[];
    } | null;
    onDismiss: () => void;
};

const MassUploadSummary = ({ summary, onDismiss }: MassUploadSummaryProps) => {
    if (!summary) return null;

    const { processed, unidentified } = summary;
    const total = processed.length + unidentified.length;

    const typeLabels: { [key: string]: string } = {
        lot: "Lot CSV",
        usage: "Usage Report",
        items: "Items Report",
        po: "Purchasing History",
        sales: "Sales Orders",
        vendors: "Vendors Report"
    };

    return (
        <div className="bg-card border border-border rounded-lg p-4 my-6" role="status">
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="text-lg font-bold text-foreground">Mass Upload Complete</h3>
                    <p className="text-sm text-foreground-muted">Processed {processed.length} of {total} files.</p>
                </div>
                <button onClick={onDismiss} aria-label="Dismiss summary" className="p-1 -mt-1 -mr-1 rounded-full text-foreground-muted hover:bg-surface hover:text-foreground">
                    <X size={20} />
                </button>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                    <h4 className="font-semibold text-green-600 dark:text-green-400 mb-2 flex items-center gap-2">
                        <CheckCircle size={16} /> Successfully Identified ({processed.length})
                    </h4>
                    {processed.length > 0 ? (
                        <ul className="space-y-1 max-h-48 overflow-y-auto pr-2">
                            {processed.map(({ type, file }) => (
                                <li key={file.name} className="flex items-center justify-between p-2 bg-surface rounded">
                                    <div>
                                        <p className="font-medium text-foreground">{typeLabels[type] || type}</p>
                                        <p className="text-xs text-foreground-muted truncate" title={file.name}>{file.name}</p>
                                    </div>
                                    <span className="text-xs font-mono bg-card-muted px-2 py-1 rounded">{file.count} rows</span>
                                </li>
                            ))}
                        </ul>
                    ) : <p className="text-xs text-foreground-muted p-2 bg-surface rounded">No files were successfully identified.</p>}
                </div>
                <div>
                    <h4 className="font-semibold text-yellow-600 dark:text-yellow-400 mb-2 flex items-center gap-2">
                        <AlertTriangle size={16} /> Unidentified Files ({unidentified.length})
                    </h4>
                    {unidentified.length > 0 ? (
                        <ul className="space-y-1 max-h-48 overflow-y-auto pr-2">
                            {unidentified.map(name => (
                                <li key={name} className="p-2 bg-surface rounded">
                                    <p className="font-medium text-foreground truncate" title={name}>{name}</p>
                                    <p className="text-xs text-foreground-muted">Could not determine file type from headers.</p>
                                </li>
                            ))}
                        </ul>
                    ) : <p className="text-xs text-foreground-muted p-2 bg-surface rounded">All files were identified successfully!</p>}
                </div>
            </div>
        </div>
    );
};


export const UploadTab = ({ handleFileUpload, filesLoaded, papaLoaded, handleMassUpload, massUploadSummary, clearMassUploadSummary }: { handleFileUpload: (file: File, type: string) => void, filesLoaded: { [key: string]: FileInfo | undefined }, papaLoaded: boolean, handleMassUpload: (files: FileList) => void, massUploadSummary: MassUploadSummaryProps['summary'], clearMassUploadSummary: () => void }) => (
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

        <MassUploadSummary summary={massUploadSummary} onDismiss={clearMassUploadSummary} />

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
