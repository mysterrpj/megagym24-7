import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useNavigate } from 'react-router-dom';
import { useUserRole } from '@/lib/auth';

export function MemberDashboard() {
    const navigate = useNavigate();
    const { user } = useUserRole();

    const handleLogout = async () => {
        await signOut(auth);
        navigate('/login');
    };

    return (
        <div className="min-h-screen bg-neutral-950 p-8">
            <div className="max-w-4xl mx-auto space-y-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-white">Hola, {user?.displayName || 'Miembro'}</h1>
                        <p className="text-gray-400">Bienvenido a tu panel de Fit IA</p>
                    </div>
                    <Button variant="outline" onClick={handleLogout} className="text-red-500 hover:text-red-400 border-neutral-800 bg-neutral-900">
                        Cerrar Sesión
                    </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="bg-neutral-900 border-neutral-800">
                        <CardHeader>
                            <CardTitle className="text-white">Mi Membresía</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="p-4 bg-green-500/10 rounded-lg border border-green-500/20 text-center">
                                <p className="text-green-500 font-medium">No tienes membresía activa</p>
                                <Button className="mt-4 w-full bg-green-600 hover:bg-green-700">Explorar Planes</Button>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-neutral-900 border-neutral-800">
                        <CardHeader>
                            <CardTitle className="text-white">Próximas Clases</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-gray-500 text-center py-8">No tienes clases reservadas.</p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
