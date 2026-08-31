
import { useState, useEffect } from "react";
import {
    Cloud,
    Sun,
    CloudRain,
    CloudSnow,
    CloudLightning,
    CloudDrizzle,
    ThermometerSun,
    Snowflake,
    AlertTriangle,
    Loader2,
} from "lucide-react";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "./ui/popover";
import { useLanguage } from "../context/LanguageContext";

/* ------------------------------------------------ */
/* CONFIG & TYPES                                   */
/* ------------------------------------------------ */

const CFG = {
    lat: import.meta.env.VITE_WEATHER_LAT || "50.1109", // Frankfurt
    lon: import.meta.env.VITE_WEATHER_LON || "8.6821",
    name: import.meta.env.VITE_WEATHER_NAME || "Frankfurt",
};

type WeatherData = {
    current: {
        temperature: number;
        weatherCode: number;
    };
    daily: {
        time: string[];
        weatherCode: number[];
        tempMax: number[];
        tempMin: number[];
    };
};

/* ------------------------------------------------ */
/* HELPERS                                          */
/* ------------------------------------------------ */

// WMO Weather Codes (Open-Meteo)
function getWeatherIcon(code: number) {
    if (code === 0 || code === 1) return <Sun className="w-4 h-4 text-yellow-500" />;
    if (code === 2 || code === 3) return <Cloud className="w-4 h-4 text-gray-400" />;
    if ([45, 48].includes(code)) return <Cloud className="w-4 h-4 text-gray-500" />;
    if ([51, 53, 56, 61, 63, 66, 80, 81].includes(code)) return <CloudDrizzle className="w-4 h-4 text-blue-400" />;
    if ([55, 57, 65, 67, 82].includes(code)) return <CloudRain className="w-4 h-4 text-blue-500" />;
    if ([71, 73, 75, 77, 85, 86].includes(code)) return <CloudSnow className="w-4 h-4 text-cyan-200" />;
    if ([95, 96, 99].includes(code)) return <CloudLightning className="w-4 h-4 text-purple-500" />;
    return <Cloud className="w-4 h-4 text-gray-400" />;
}

function getDayName(dateStr: string, locale: string) {
    const date = new Date(dateStr);
    return date.toLocaleDateString(locale, { timeZone: 'Europe/Berlin', weekday: "short" });
}

/* ------------------------------------------------ */
/* COMPONENT                                        */
/* ------------------------------------------------ */

export function WeatherDisplay() {
    const { language } = useLanguage();
    const [data, setData] = useState<WeatherData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const isGerman = language === "de";
    const locale = isGerman ? "de-DE" : "en-GB";

    useEffect(() => {
        const fetchWeather = async () => {
            try {
                setLoading(true);
                const url = `https://api.open-meteo.com/v1/forecast?latitude=${CFG.lat}&longitude=${CFG.lon}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`;
                const res = await fetch(url);
                if (!res.ok) throw new Error("Weather fetch failed");
                const json = await res.json();

                setData({
                    current: {
                        temperature: json.current.temperature_2m,
                        weatherCode: json.current.weather_code,
                    },
                    daily: {
                        time: json.daily.time as string[],
                        weatherCode: json.daily.weather_code as number[],
                        tempMax: json.daily.temperature_2m_max as number[],
                        tempMin: json.daily.temperature_2m_min as number[],
                    },
                });
                setError(false);
            } catch (e) {
                console.error(e);
                setError(true);
            } finally {
                setLoading(false);
            }
        };

        fetchWeather();
        const interval = setInterval(fetchWeather, 600000); // 10 min
        return () => clearInterval(interval);
    }, []);

    if (error) {
        return (
            <div className="flex h-10 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.035] px-3 text-sm text-muted-foreground">
                <Cloud className="w-4 h-4" />
                <span>—</span>
            </div>
        );
    }

    if (loading && !data) {
        return (
            <div className="flex h-10 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.035] px-3 text-sm">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!data) return null;

    /* HAZARD LOGIC */
    const temp = data.current.temperature;
    const isIce = temp <= 0;
    const isHeat = temp >= 30;

    let badgeClass = "hover:bg-accent text-foreground";
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let hazardIcon = null;

    if (isIce) {
        badgeClass = "bg-cyan-950/30 text-cyan-200 border-cyan-800/50 hover:bg-cyan-900/40";
        hazardIcon = <Snowflake className="w-3.5 h-3.5 mr-1 animate-pulse" />;
    } else if (isHeat) {
        badgeClass = "bg-orange-950/30 text-orange-200 border-orange-800/50 hover:bg-orange-900/40";
        hazardIcon = <ThermometerSun className="w-3.5 h-3.5 mr-1 animate-pulse" />;
    }

    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    className={`flex h-10 items-center gap-2 whitespace-nowrap rounded-2xl border px-3 text-sm font-semibold tabular-nums transition-all ${badgeClass}`}
                >
                    {hazardIcon}
                    {getWeatherIcon(data.current.weatherCode)}
                    <span>{Math.round(temp)}°C</span>
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-3 grid gap-2 bg-card text-card-foreground border-border shadow-md">
                <div className="flex items-center justify-between pb-2 border-b border-border">
                    <span className="font-semibold text-sm">{CFG.name}</span>
                    <span className="text-xs text-muted-foreground">Open-Meteo</span>
                </div>
                <div className="grid gap-1">
                    {data.daily.time.slice(0, 5).map((t, i) => (
                        <div key={t} className="grid grid-cols-[30px_1fr_auto] items-center gap-2 text-sm py-1">
                            <span className="text-muted-foreground font-medium text-xs uppercase">{getDayName(t, locale)}</span>
                            <div className="flex justify-center">
                                {getWeatherIcon(data.daily.weatherCode[i])}
                            </div>
                            <div className="text-right text-muted-foreground text-xs">
                                <span className="text-foreground font-medium">{Math.round(data.daily.tempMax[i])}°</span>
                                <span className="mx-1">/</span>
                                <span>{Math.round(data.daily.tempMin[i])}°</span>
                            </div>
                        </div>
                    ))}
                </div>
                {(isIce || isHeat) && (
                    <div className={`mt-2 p-2 rounded text-xs flex items-center gap-2 ${isIce ? 'bg-cyan-500/10 text-cyan-200' : 'bg-orange-500/10 text-orange-200'}`}>
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>
                            {isIce
                                ? isGerman
                                    ? "Achtung: Glättegefahr möglich."
                                    : "Warning: icy conditions are possible."
                                : isGerman
                                    ? "Hitzewarnung: Hohe Temperaturen."
                                    : "Heat warning: high temperatures."}
                        </span>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}
