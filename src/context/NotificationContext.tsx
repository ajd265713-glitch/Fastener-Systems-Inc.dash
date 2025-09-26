import React, { useState, useCallback, useContext, createContext, ReactNode } from 'react';
import { CheckCircle, AlertCircle, XCircle } from 'lucide-react';

// --- Notification Component ---
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


// --- Notification Context & Provider ---
type NotificationContextType = {
  showNotification: (message: string, type?: 'success' | 'error' | 'info') => void;
};
const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotification must be used within a NotificationProvider');
  return context;
};

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
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
