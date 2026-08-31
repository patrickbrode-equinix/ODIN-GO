
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExportDialog } from "./ExportDialog";
import { useLanguage } from "../../context/LanguageContext";

interface ExportMenuProps {
    currentYear: number;
    currentMonth: number;
    loading?: boolean;
    /** Pass `true` if the changelog table has data; hides "Änderungen" menu item when false */
    changelogExists?: boolean;
}

export function ExportMenu({ currentYear, currentMonth, loading, changelogExists }: ExportMenuProps) {
    const { t } = useLanguage();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [exportType, setExportType] = useState<"SHIFTPLAN" | "CHANGES" | null>(null);

    const openDialog = (type: "SHIFTPLAN" | "CHANGES") => {
        setExportType(type);
        setDialogOpen(true);
    };

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 pl-2 pr-2"
                        disabled={loading}
                        title={t("export.menu")}
                    >
                        <Download className="w-4 h-4" />
                        <span className="ml-1 hidden xl:inline">Export</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuLabel>{t("export.options")}</DropdownMenuLabel>
                    <DropdownMenuSeparator />

                    <DropdownMenuItem onClick={() => openDialog("SHIFTPLAN")}>
                        {t("export.shiftplanXlsx")}
                    </DropdownMenuItem>

                    {changelogExists && (
                        <DropdownMenuItem onClick={() => openDialog("CHANGES")}>
                            {t("export.changeLog")}
                        </DropdownMenuItem>
                    )}

                    {!changelogExists && (
                        <DropdownMenuItem disabled className="opacity-40 cursor-not-allowed" title={t("export.noChanges")}>
                            {t("export.changeLog")}
                        </DropdownMenuItem>
                    )}

                </DropdownMenuContent>
            </DropdownMenu>

            {exportType && (
                <ExportDialog
                    open={dialogOpen}
                    onOpenChange={setDialogOpen}
                    type={exportType}
                    currentYear={currentYear}
                    currentMonth={currentMonth}
                />
            )}
        </>
    );
}
