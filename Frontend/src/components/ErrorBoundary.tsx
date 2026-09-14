import React, { Component, ErrorInfo, ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./ui/button"; // Adjust path if needed

type ErrorBoundaryLanguage = "de" | "en";

const ERROR_COPY: Record<ErrorBoundaryLanguage, { title: string; description: string; reload: string; close: string }> = {
    de: {
        title: "Ein unerwarteter Fehler ist aufgetreten",
        description: "Die Anwendung konnte nicht geladen werden. Bitte versuche es erneut oder kontaktiere den Support, falls das Problem bestehen bleibt.",
        reload: "Seite neu laden",
        close: "ODIN GO schließen",
    },
    en: {
        title: "An unexpected error occurred",
        description: "The application could not be loaded. Please try again or contact support if the problem persists.",
        reload: "Reload page",
        close: "Close ODIN GO",
    },
};

function getErrorBoundaryLanguage(): ErrorBoundaryLanguage {
    if (typeof window === "undefined") return "de";
    const stored = window.localStorage.getItem("odin.language");
    return stored === "en" ? "en" : "de";
}

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    private handleReload = () => {
        window.location.reload();
    };

    private handleClose = () => {
        if (window.parent !== window) {
            window.parent.postMessage({ type: "ODIN_GO_CLOSE" }, "*");
            return;
        }

        // A standalone page cannot reliably close its own browser tab. Return
        // to the previous page instead, without forcing another app reload.
        if (window.history.length > 1) window.history.back();
    };

    public render() {
        if (this.state.hasError) {
            const copy = ERROR_COPY[getErrorBoundaryLanguage()];

            return (
                <div className="relative flex min-h-screen flex-col items-center justify-center space-y-6 bg-background p-6 text-center text-foreground">
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={this.handleClose}
                        className="absolute right-5 top-5"
                        title={copy.close}
                        aria-label={copy.close}
                    >
                        <X />
                    </Button>
                    <img
                        src="/odin-assets/odin-unavailable.png"
                        alt={copy.title}
                        className="w-full max-w-2xl rounded-2xl border border-border object-cover shadow-2xl"
                    />
                    <div className="space-y-2">
                        <h1 className="text-2xl font-bold text-red-500">
                            {copy.title}
                        </h1>
                        <p className="text-muted-foreground max-w-md mx-auto">
                            {copy.description}
                        </p>
                    </div>

                    <div className="p-4 bg-muted/30 rounded-lg border border-border max-w-lg w-full overflow-x-auto text-left">
                        <code className="text-xs text-red-400">
                            {this.state.error?.toString()}
                        </code>
                    </div>

                    <Button onClick={this.handleReload}>{copy.reload}</Button>
                </div>
            );
        }

        return this.props.children;
    }
}
