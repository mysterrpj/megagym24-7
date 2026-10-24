import { useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { MessageSquare, Users, CreditCard, Calendar, Settings, LayoutDashboard, LogOut, DoorOpen, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';

const sidebarItems = [
    { icon: MessageSquare, label: 'Mensajes', href: '/dashboard/messages' },
    { icon: Users, label: 'Miembros', href: '/dashboard/members' },
    { icon: CreditCard, label: 'Membresías', href: '/dashboard/memberships' },
    { icon: Calendar, label: 'Clases', href: '/dashboard/classes' },
    { icon: LayoutDashboard, label: 'Pagos', href: '/dashboard/payments' },
    { icon: DoorOpen, label: 'Accesos', href: '/dashboard/access' },
    { icon: Settings, label: 'Configuración', href: '/dashboard/settings' },
];

interface SidebarProps {
    open: boolean;
    onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
    const navigate = useNavigate();
    const closeButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (open) window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    }, [open]);

    const handleLogout = async () => {
        try {
            await signOut(auth);
            navigate('/login');
        } catch (error) {
            console.error('Error signing out:', error);
        }
    };

    return (
        <>
            <button
                type="button"
                aria-label="Cerrar menú"
                tabIndex={open ? 0 : -1}
                onClick={onClose}
                className={cn(
                    'fixed inset-0 z-40 bg-black/70 transition-opacity duration-200 lg:hidden',
                    open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
                )}
            />

            <aside
                id="admin-sidebar"
                aria-label="Navegación administrativa"
                className={cn(
                    'fixed inset-y-0 left-0 z-50 flex h-dvh w-[min(18rem,88vw)] flex-col border-r border-border bg-card shadow-2xl transition-transform duration-200 ease-out',
                    open ? 'visible translate-x-0' : 'invisible -translate-x-full',
                    'lg:visible lg:sticky lg:top-0 lg:z-20 lg:h-screen lg:w-64 lg:shrink-0 lg:translate-x-0 lg:shadow-none'
                )}
            >
                <div className="flex min-h-20 items-center justify-between gap-3 px-5 py-4 lg:px-6">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-500">
                            <span className="font-bold text-white">IA</span>
                        </div>
                        <div className="min-w-0">
                            <p className="truncate text-lg font-bold text-card-foreground">Fit IA</p>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-green-500">MegaGym</p>
                        </div>
                    </div>
                    <button
                        ref={closeButtonRef}
                        type="button"
                        aria-label="Cerrar menú de administración"
                        onClick={onClose}
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-green-500 lg:hidden"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-3">
                    {sidebarItems.map((item) => (
                        <NavLink
                            key={item.href}
                            to={item.href}
                            onClick={onClose}
                            className={({ isActive }) => cn(
                                'flex min-h-12 items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-green-500',
                                isActive
                                    ? 'bg-green-500/10 text-green-600 dark:text-green-500'
                                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                            )}
                        >
                            <item.icon className="h-5 w-5 shrink-0" />
                            {item.label}
                        </NavLink>
                    ))}
                </nav>

                <div className="border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                    <div className="mb-3 flex items-center gap-3 px-2">
                        <div className="h-10 w-10 shrink-0 rounded-full bg-slate-700" />
                        <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-card-foreground">Admin</p>
                            <p className="truncate text-xs text-muted-foreground">admin@fitia.com</p>
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        className="min-h-11 w-full justify-start text-red-500 hover:bg-red-500/10 hover:text-red-400"
                        onClick={handleLogout}
                    >
                        <LogOut className="mr-2 h-5 w-5" />
                        Cerrar sesión
                    </Button>
                </div>
            </aside>
        </>
    );
}
