import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function DashboardLayout() {
    return (
        <div className="flex min-h-screen bg-background">
            <Sidebar />
            <main className="flex-1 overflow-auto bg-neutral-950 relative">
                <div className="absolute top-2 right-4 text-[10px] text-neutral-700 font-mono pointer-events-none select-none z-50">
                    v1.0.1
                </div>
                <div className="p-8 max-w-7xl mx-auto">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
