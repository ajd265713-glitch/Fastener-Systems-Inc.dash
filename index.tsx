import React from 'react';
import ReactDOM from 'react-dom/client';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { NotificationProvider } from './src/context/NotificationContext';
import { FSIDashboard } from './src/components/FSIDashboard';

// --- Error Boundary ---
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-background text-foreground p-4 text-center">
          <AlertTriangle className="w-16 h-16 text-error mb-4" />
          <h1 className="text-2xl font-bold mb-2">Something went wrong.</h1>
          <p className="text-foreground-muted mb-4">An unexpected error occurred. Please try refreshing the page.</p>
          <button onClick={() => window.location.reload()} className="action-button bg-primary hover:bg-primary-dark">
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}


const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
    <React.StrictMode>
        <ErrorBoundary>
            <NotificationProvider>
                <FSIDashboard />
            </NotificationProvider>
        </ErrorBoundary>
    </React.StrictMode>
);
