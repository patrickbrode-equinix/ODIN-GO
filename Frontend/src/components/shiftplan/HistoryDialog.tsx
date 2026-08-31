import { useEffect, useState } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { fetchShiftHistory, ShiftChangeLog } from "../../api/history";
import { Badge } from "../ui/badge";
import { useLanguage, getLanguageLocale } from "../../context/LanguageContext";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    year?: number;
    month?: number;
    employeeName?: string;
}

export function HistoryDialog({ open, onOpenChange, year, month, employeeName }: Props) {
    const [logs, setLogs] = useState<ShiftChangeLog[]>([]);
    const [loading, setLoading] = useState(false);
    const { t, language } = useLanguage();

    useEffect(() => {
        if (open) {
            setLoading(true);
            fetchShiftHistory({ year, month, employee_name: employeeName, limit: 50 })
                .then(setLogs)
                .catch(err => console.error(err))
                .finally(() => setLoading(false));
        }
    }, [open, year, month, employeeName]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>{t("history.title")} {employeeName ? `- ${employeeName}` : ""}</DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-auto border rounded-md">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t("history.date")}</TableHead>
                                {!employeeName && <TableHead>{t("common.employee")}</TableHead>}
                                <TableHead>{t("history.old")}</TableHead>
                                <TableHead>{t("history.new")}</TableHead>
                                <TableHead>{t("history.changedBy")}</TableHead>
                                <TableHead>{t("history.timestamp")}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t("history.loading")}</TableCell>
                                </TableRow>
                            ) : logs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t("history.noChanges")}</TableCell>
                                </TableRow>
                            ) : (
                                logs.map((log) => (
                                    <TableRow key={log.id}>
                                        <TableCell>{format(new Date(log.date), "dd.MM.yyyy")}</TableCell>
                                        {!employeeName && <TableCell>{log.employee_name}</TableCell>}
                                        <TableCell>
                                            {log.old_value ? (
                                                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">{log.old_value}</Badge>
                                            ) : <span className="text-muted-foreground">-</span>}
                                        </TableCell>
                                        <TableCell>
                                            {log.new_value ? (
                                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">{log.new_value}</Badge>
                                            ) : <Badge variant="outline" className="text-muted-foreground">{t("history.deleted")}</Badge>}
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">{log.changed_by}</TableCell>
                                        <TableCell className="text-xs text-muted-foreground">
                                            {format(new Date(log.changed_at), "dd.MM. HH:mm", { locale: de })}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </DialogContent>
        </Dialog>
    );
}
