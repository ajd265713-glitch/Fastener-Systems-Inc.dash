import { allMappings } from './mappings';

const sanitizeRow = (row: any, mapping: any) => {
    const sanitized: { [key:string]: any } = {};
    for (const key in mapping) {
        const possibleHeaders = mapping[key];
        let value = null;
        for (const header of possibleHeaders) {
            if (row[header] !== undefined && row[header] !== null) {
                value = row[header];
                break;
            }
        }
        sanitized[key] = value;
    }
    return sanitized;
};

export const sanitizeData = (data: any[], type: string) => {
    const mapping = allMappings[type];
    if (!mapping) return data;
    return data.map(row => {
        const sanitized = sanitizeRow(row, mapping);
        if (sanitized.item !== undefined && sanitized.item !== null) {
            sanitized.item = String(sanitized.item);
        }
        return sanitized;
    });
};
