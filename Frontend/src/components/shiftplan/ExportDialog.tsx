
import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/components/ui/utils";
import { format } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { CalendarIcon, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/context/LanguageContext";
import { api } from "@/api/api"; // Assuming api wrapper exists, or use fetch

interface ExportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    type: "SHIFTPLAN" | "CHANGES" | "WARNINGS_LEGACY" | null;
    currentYear: number;
    currentMonth: number; // 1-12
}

export function ExportDialog({ open, onOpenChange, type, currentYear, currentMonth }: ExportDialogProps) {
    const { language } = useLanguage();
    const isGerman = language === "de";
    const dateLocale = isGerman ? de : enUS;
    const [mode, setMode] = useState<"MONTH" | "RANGE">("MONTH");
    const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
    const [loading, setLoading] = useState(false);

    // Default range: First to Last of current month
    const defaultFrom = new Date(currentYear, currentMonth - 1, 1);
    const defaultTo = new Date(currentYear, currentMonth, 0);

    const handleExport = async () => {
        try {
            setLoading(true);

            let fromStr = "";
            let toStr = "";

            if (mode === "MONTH") {
                fromStr = format(defaultFrom, "yyyy-MM-dd");
                toStr = format(defaultTo, "yyyy-MM-dd");
            } else {
                if (!dateRange.from || !dateRange.to) {
                    toast.error(isGerman ? "Bitte Zeitraum wählen" : "Please select a date range");
                    setLoading(false);
                    return;
                }
                fromStr = format(dateRange.from, "yyyy-MM-dd");
                toStr = format(dateRange.to, "yyyy-MM-dd");
            }

            // Trigger Download
            // We need to use fetch to get blob
            let url = "";
            let filename = "";

            if (type === "SHIFTPLAN") {
                url = `/reports/shiftplan/export?from=${fromStr}&to=${toStr}`;
                filename = `${isGerman ? "Schichtplan" : "Shiftplan"}_${fromStr}_${toStr}.xlsx`;
            } else if (type === "CHANGES") {
                url = `/reports/changes/export?from=${fromStr}&to=${toStr}`;
                filename = `${isGerman ? "Aenderungen" : "Changes"}_${fromStr}_${toStr}.xlsx`;
            } else if (type === "WARNINGS_LEGACY") {
                toast.info(isGerman ? "Legacy-Export ausgewählt" : "Legacy export selected");
                setLoading(false);
                return;
            }

            const response = await api.get(url, {
                responseType: "blob",
            });

            // Axios returns data in response.data
            const blob = new Blob([response.data], { type: response.headers["content-type"] });
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = downloadUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();

            toast.success(isGerman ? "Download gestartet" : "Download started");
            onOpenChange(false);
        } catch (e) {
            console.error(e);
            toast.error(isGerman ? "Export fehlgeschlagen" : "Export failed");
        } finally {
            setLoading(false);
        }
    };

    const title = type === "SHIFTPLAN"
        ? (isGerman ? "Schichtplan exportieren" : "Export shift plan")
        : (isGerman ? "Änderungen exportieren" : "Export changes");

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <RadioGroup value={mode} onValueChange={(v) => setMode(v as any)}>

                        {/* OPTION 1: CURRENT MONTH */}
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="MONTH" id="r-month" />
                            <Label htmlFor="r-month">{isGerman ? "Aktueller Monat" : "Current month"} ({format(defaultFrom, "MMMM yyyy", { locale: dateLocale })})</Label>
                        </div>

                        {/* OPTION 2: DATE RANGE */}
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="RANGE" id="r-range" />
                            <Label htmlFor="r-range">{isGerman ? "Zeitraum wählen" : "Select date range"}</Label>
                        </div>
                    </RadioGroup>

                    {mode === "RANGE" && (
                        <div className="flex items-center gap-2 pl-6">
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className={cn(
                                            "w-[240px] justify-start text-left font-normal",
                                            !dateRange.from && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {dateRange.from ? (
                                            dateRange.to ? (
                                                <>
                                                    {format(dateRange.from, "P", { locale: dateLocale })} -{" "}
                                                    {format(dateRange.to, "P", { locale: dateLocale })}
                                                </>
                                            ) : (
                                                format(dateRange.from, "P", { locale: dateLocale })
                                            )
                                        ) : (
                                            <span>{isGerman ? "Wähle Datum" : "Select date"}</span>
                                        )}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        initialFocus
                                        mode="range"
                                        defaultMonth={dateRange.from || defaultFrom}
                                        selected={dateRange as any}
                                        onSelect={(range) => setDateRange(range || {})}
                                        numberOfMonths={2}
                                        locale={dateLocale}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>{isGerman ? "Abbrechen" : "Cancel"}</Button>
                    <Button onClick={handleExport} disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isGerman ? "Exportieren" : "Export"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
