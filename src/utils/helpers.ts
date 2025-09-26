export const parseDateString = (dateString?: string): Date => {
    if (!dateString) return new Date(0);
    const parts = dateString.split('/');
    if (parts.length === 3) {
        const [month, day, year] = parts.map(Number);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year > 1900) {
            return new Date(year, month - 1, day);
        }
    }
    return new Date(0);
};

export const parseFreightGoal = (freightInfo: string): number => {
    const freightInfoStr = String(freightInfo ?? '');
    if (!freightInfoStr) return 0;
    const match = freightInfoStr.match(/\$?([\d,]+(?:\.\d{1,2})?)/);
    if (match && match[1]) {
        return parseFloat(match[1].replace(/,/g, ''));
    }
    return 0;
};
