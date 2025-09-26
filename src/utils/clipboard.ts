export const copyToClipboard = async (text: string, showNotification: (message: string, type?: 'success' | 'error' | 'info') => void) => {
    try {
        await navigator.clipboard.writeText(text);
        showNotification('Copied to clipboard!', 'info');
    } catch (err) {
        showNotification('Failed to copy text.', 'error');
    }
};
