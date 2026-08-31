import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, Settings2, Zap, Users, MessageSquare, Monitor } from "lucide-react";
import { Button } from "../ui/button";
import {
    getFeatureToggles,
    updateFeatureToggle,
    FeatureToggles,
} from "../../api/dashboard";
import { usePersistentToggle } from "../../hooks/usePersistentToggle";

export function DashboardToggles({ noHeader }: { noHeader?: boolean }) {
    // If noHeader is true, we assume parent handles showing/hiding container.
    // So we just render the grid always (parent controls visibility of this component).
    const [isOpen, toggleOpen] = usePersistentToggle("dashboard.toggles.open", false);
    const [toggles, setToggles] = useState<FeatureToggles>({});

    useEffect(() => {
        getFeatureToggles().then(setToggles);
    }, []);

    const handleToggle = async (key: string) => {
        const newVal = !toggles[key];
        setToggles(prev => ({ ...prev, [key]: newVal }));
        // Optimistic update
        try {
            await updateFeatureToggle(key, newVal);
        } catch {
            // Revert on fail
            setToggles(prev => ({ ...prev, [key]: !newVal }));
        }
    };

    const ToggleBtn = ({ tKey, label, icon: Icon }: { tKey: string, label: string, icon: any }) => {
        const isOn = !!toggles[tKey];
        return (
            <Button
                variant={isOn ? "default" : "outline"}
                size="sm"
                onClick={() => handleToggle(tKey)}
                className={`justify-start ${isOn
                    ? "bg-green-600 hover:bg-green-700 border-none text-white"
                    : "bg-background border-dashed text-muted-foreground hover:bg-muted hover:text-red-400"
                    }`}
            >
                <Icon className={`w-3 h-3 mr-2 ${isOn ? "text-white" : ""}`} />
                {label}: {isOn ? "AN" : "AUS"}
            </Button>
        );
    };

    if (noHeader) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 animate-in fade-in slide-in-from-top-2">
                <ToggleBtn tKey="auto_assign" label="Auto-Assign" icon={Zap} />
                <ToggleBtn tKey="teams_tt" label="Teams: TT" icon={Users} />
                <ToggleBtn tKey="teams_update" label="Teams: Update" icon={MessageSquare} />
                <ToggleBtn tKey="teams_expedite" label="Teams: Expedite" icon={Zap} />
                <ToggleBtn tKey="teams_assign" label="Teams: Assign" icon={Users} />
                <ToggleBtn tKey="teams_info" label="Teams: Info" icon={MessageSquare} />
            </div>
        );
    }

    return (
        <div className="border border-border rounded-lg bg-card mb-4 overflow-hidden">
            <div
                className="flex items-center gap-2 p-3 cursor-pointer hover:bg-muted/50 transition-colors font-medium"
                onClick={toggleOpen}
            >
                {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                <Settings2 className="w-4 h-4 text-primary" />
                Einstellungen & Automationen
            </div>

            {isOpen && (
                <div className="p-3 border-t border-border bg-muted/10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 animate-in fade-in slide-in-from-top-2">
                    <ToggleBtn tKey="auto_assign" label="Auto-Assign" icon={Zap} />
                    <ToggleBtn tKey="teams_tt" label="Teams: TT" icon={Users} />
                    <ToggleBtn tKey="teams_update" label="Teams: Update" icon={MessageSquare} />
                    <ToggleBtn tKey="teams_expedite" label="Teams: Expedite" icon={Zap} />
                    <ToggleBtn tKey="teams_assign" label="Teams: Assign" icon={Users} />
                    <ToggleBtn tKey="teams_info" label="Teams: Info" icon={MessageSquare} />
                </div>
            )}
        </div>
    );
}
