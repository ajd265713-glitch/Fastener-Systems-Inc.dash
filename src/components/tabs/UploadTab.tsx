import React from 'react';
import { AlertCircle, Package, BarChart, FileText, Truck, Users, Files } from 'lucide-react';
import type { FileInfo } from '../../domain/types';
import { FileUploadBox } from '../ui';

export const UploadTab = ({ handleFileUpload, filesLoaded, papaLoaded, handleMassUpload }: { handleFileUpload: (file: File, type: string) => void, filesLoaded: { [key: string]: FileInfo | undefined }, papaLoaded: boolean, handleMassUpload: (files: FileList) => void }) => (
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
