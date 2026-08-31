import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { fetchConstraints, saveConstraints, EmployeeConstraints } from "../../api/constraints";
import { useLanguage } from "../../context/LanguageContext";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    employeeName?: string;
    onSave?: () => void;
}

export function ConstraintDialog({ open, onOpenChange, employeeName, onSave }: Props) {
    const { t } = useLanguage();
    const [loading, setLoading] = useState(false);
    const [noNight, setNoNight] = useState(false);
    const [onlyEarly, setOnlyEarly] = useState(false);
    const [maxWeekends, setMaxWeekends] = useState<string>("");

    useEffect(() => {
        if (open && employeeName) {
            setLoading(true);
            fetchConstraints().then(all => {
                const c = all[employeeName] || {};
                setNoNight(c.no_night || false);
                setOnlyEarly(c.only_early || false);
                setMaxWeekends(c.max_weekends !== undefined ? String(c.max_weekends) : "");
            }).finally(() => setLoading(false));
        }
    }, [open, employeeName]);

    const handleSave = async () => {
        if (!employeeName) return;
        setLoading(true);
        try {
            const c: EmployeeConstraints = {};
            if (noNight) c.no_night = true;
            if (onlyEarly) c.only_early = true;
            if (maxWeekends !== "") c.max_weekends = Number(maxWeekends);

            await saveConstraints(employeeName, c);
            onSave?.();
            onOpenChange(false);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{t("constraints.title")}: {employeeName}</DialogTitle>
                </DialogHeader>

                <div className="flex flex-col gap-6 py-4">
                    <div className="flex items-center justify-between">
                        <Label htmlFor="noNight">{t("constraints.noNight")}</Label>
                        <Switch id="noNight" checked={noNight} onCheckedChange={setNoNight} />
                    </div>

                    <div className="flex items-center justify-between">
                        <Label htmlFor="onlyEarly">{t("constraints.earlyOnly")}</Label>
                        <Switch id="onlyEarly" checked={onlyEarly} onCheckedChange={setOnlyEarly} />
                    </div>

                    <div className="flex items-center justify-between gap-4">
                        <Label htmlFor="maxWeekends" className="whitespace-nowrap">{t("constraints.maxWeekends")}</Label>
                        <Input
                            id="maxWeekends"
                            type="number"
                            className="w-24 text-right"
                            placeholder="-"
                            value={maxWeekends}
                            onChange={(e) => setMaxWeekends(e.target.value)}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
                    <Button onClick={handleSave} disabled={loading}>{t("common.save")}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
