import { useEffect, useRef, useState } from 'react';
import { Menu } from 'lucide-react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function DashboardLayout() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const location = useLocation();
    const menuButtonRef = useRef<HTMLButtonElement>(null);
    const wasSidebarOpen = useRef(false);

    useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

    useEffect(() => {
        if (wasSidebarOpen.current && !sidebarOpen) menuButtonRef.current?.focus();
        wasSidebarOpen.current = sidebarOpen;
    }, [sidebarOpen]);

    useEffect(() => {
        if (!sidebarOpen) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setSidebarOpen(false);
        };
        window.addEventListener('keydown', closeOnEscape);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', closeOnEscape);
        };
    }, [sidebarOpen]);

    return (
        <div className="flex min-h-screen min-w-0 bg-background">
            <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            <main className="relative min-h-screen min-w-0 flex-1 overflow-x-hidden bg-neutral-950">
                <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-white/10 bg-neutral-950/95 px-3 backdrop-blur lg:hidden">
                    <button
                        ref={menuButtonRef}
                        type="button"
                        aria-label="Abrir menú de administración"
                        aria-controls="admin-sidebar"
                        aria-expanded={sidebarOpen}
                        onClick={() => setSidebarOpen(true)}
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/10 bg-neutral-900 text-white transition-colors hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                        <Menu className="h-5 w-5" />
                    </button>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-white">Panel administrativo</p>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-green-500">MegaGym</p>
                    </div>
                    <span className="ml-auto font-mono text-[9px] text-neutral-600">v1.0.1</span>
                </header>

                <div className="pointer-events-none absolute right-4 top-2 z-20 hidden select-none font-mono text-[10px] text-neutral-700 lg:block">v1.0.1</div>
                <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-6 lg:p-8">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
