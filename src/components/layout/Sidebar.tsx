import { NavLink, useNavigate } from 'react-router-dom';
import { MessageSquare, Users, CreditCard, Calendar, Settings, LayoutDashboard, LogOut } from 'lucide-react';
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
    { icon: Settings, label: 'Configuración', href: '/dashboard/settings' },
];

export function Sidebar() {
    const navigate = useNavigate();

    const handleLogout = async () => {
        try {
            await signOut(auth);
            navigate('/login');
        } catch (error) {
            console.error('Error signing out:', error);
        }
    };

    return (
        <aside className="w-64 bg-card border-r border-border flex flex-col h-screen sticky top-0">
            <div className="p-6">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                        <span className="font-bold text-white">IA</span>
                    </div>
                    <span className="text-xl font-bold text-white">Fit IA</span>
                </div>
            </div>

            <nav className="flex-1 px-4 py-4 space-y-1">
                {sidebarItems.map((item) => (
                    <NavLink
                        key={item.href}
                        to={item.href}
                        className={({ isActive }) =>
                            cn(
                                "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                                isActive
                                    ? "bg-green-500/10 text-green-500"
                                    : "text-muted-foreground hover:bg-accent hover:text-white"
                            )
                        }
                    >
                        <item.icon className="w-5 h-5" />
                        {item.label}
                    </NavLink>
                ))}
            </nav>

            <div className="p-4 border-t border-border">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-slate-700"></div>
                    <div>
                        <p className="text-sm font-medium text-white">Admin</p>
                        <p className="text-xs text-muted-foreground">admin@fitia.com</p>
                    </div>
                </div>
                <Button
                    variant="ghost"
                    className="w-full justify-start text-red-500 hover:text-red-400 hover:bg-red-500/10"
                    onClick={handleLogout}
                >
                    <LogOut className="w-5 h-5 mr-2" />
                    Cerrar Sesión
                </Button>
            </div>
        </aside>
    );
}
