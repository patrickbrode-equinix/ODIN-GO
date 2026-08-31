import { api } from "./api";

export interface Report {
    id: number;
    type: string;
    params: any;
    created_at: string;
}

export async function generateReport(year: number, month: number): Promise<{ success: true, reportId: number }> {
    const res = await api.post("/reports/generate", { year, month });
    return res.data;
}

export function getReportDownloadUrl(reportId: number) {
    // We can't use api.get for download directly if we want browser handling (though blob is possible)
    // Simpler: use the token? 
    // Actually, `api` uses interceptors for token. 
    // If we use window.open, we lose the Auth Header.
    // Solution: Fetch as Blob via axios, then create object URL.
    return `/api/reports/${reportId}/download`;
}

export async function downloadReport(reportId: number) {
    const res = await api.get(`/reports/${reportId}/download`, { responseType: 'blob' });

    // Extract filename from header
    const disposition = res.headers['content-disposition'];
    let filename = `report_${reportId}.csv`;
    if (disposition && disposition.indexOf('attachment') !== -1) {
        const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
        const matches = filenameRegex.exec(disposition);
        if (matches != null && matches[1]) {
            filename = matches[1].replace(/['"]/g, '');
        }
    }

    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.parentNode?.removeChild(link);
}
