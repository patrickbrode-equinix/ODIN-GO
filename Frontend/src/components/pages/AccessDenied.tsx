import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";
import { ShieldAlert } from "lucide-react";

export default function AccessDenied() {
    const navigate = useNavigate();
    const { t } = useLanguage();

    return (
        <div className="relative flex h-screen items-center justify-center overflow-hidden bg-background">
            {/* Background effects */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(239,68,68,0.04),transparent_60%)]" />
            <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-[radial-gradient(circle,rgba(239,68,68,0.08),transparent_70%)] blur-[100px] animate-[pulse_8s_ease-in-out_infinite]" />
            <div className="pointer-events-none absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(79,70,229,0.06),transparent_70%)] blur-[90px] animate-[pulse_10s_ease-in-out_infinite_2s]" />

            <Card className="w-full max-w-md overflow-hidden rounded-[28px] border border-red-400/20 bg-background/90 backdrop-blur-2xl shadow-[0_40px_100px_rgba(0,0,0,0.3),0_0_64px_rgba(239,68,68,0.08),inset_0_1px_0_rgba(255,255,255,0.06)]">
                {/* Top neon edge - red */}
                <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent_5%,rgba(239,68,68,0.4)_20%,rgba(239,68,68,0.8)_50%,rgba(239,68,68,0.4)_80%,transparent_95%)] shadow-[0_0_16px_rgba(239,68,68,0.3)]" />

                <CardHeader className="text-center space-y-4 pt-8">
                    {/* Icon with glow */}
                    <div className="relative mx-auto">
                        <div className="absolute inset-0 -m-4 rounded-full bg-[radial-gradient(circle,rgba(239,68,68,0.15),transparent_70%)] blur-xl" />
                        <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-red-400/30 bg-red-500/10 shadow-[0_0_32px_rgba(239,68,68,0.15)]">
                            <ShieldAlert className="h-8 w-8 text-red-400 drop-shadow-[0_0_12px_rgba(239,68,68,0.8)]" />
                        </div>
                    </div>

                    <CardTitle
                        className="text-2xl font-black tracking-[0.1em] uppercase bg-gradient-to-r from-red-300 via-red-200 to-orange-200 bg-clip-text text-transparent"
                        style={{ filter: "drop-shadow(0 0 8px rgba(239,68,68,0.3))" }}
                    >
                        {t("accessDenied.title")}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6 pb-8">
                    <p className="text-sm text-muted-foreground text-center max-w-xs mx-auto">
                        {t("accessDenied.message")}
                    </p>
                    <Button
                        variant="outline"
                        onClick={() => navigate(-1)}
                        className="w-full h-12 rounded-xl border-red-400/20 hover:border-red-400/40 hover:bg-red-500/10 font-bold tracking-wide transition-all duration-300 hover:shadow-[0_0_24px_rgba(239,68,68,0.15)]"
                    >
                        {t("accessDenied.backButton")}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
