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
                        <CardContent className="space-y-4">
                            <div className="p-4 bg-yellow-500/10 rounded-lg border border-yellow-500/20 text-center mb-6">
                                <p className="text-yellow-500 font-medium">No tienes membresía activa</p>
                                <p className="text-sm text-gray-400 mt-1">Elige un plan para comenzar</p>
                            </div>

                            <div className="grid grid-cols-1 gap-3">
                                {[
                                    { name: '1 Mes', price: 80, label: 'Mensual' },
                                    { name: '2 Meses', price: 120, label: 'Bimestral (Ahorra S/ 40)' },
                                    { name: '3 Meses', price: 150, label: 'Trimestral (Ahorra S/ 90)' }
                                ].map((plan) => (
                                    <div key={plan.name} className="flex items-center justify-between p-3 bg-neutral-800 rounded-lg border border-neutral-700">
                                        <div>
                                            <p className="font-bold text-white text-sm">{plan.label}</p>
                                            <p className="text-yellow-500 font-bold">S/ {plan.price}.00</p>
                                        </div>
                                        <Button
                                            size="sm"
                                            className="bg-yellow-500 text-black hover:bg-yellow-400 font-bold"
                                            onClick={async () => {
                                                try {
                                                    const { httpsCallable } = await import('firebase/functions');
                                                    const { functions } = await import('@/lib/firebase');
                                                    const createCheckout = httpsCallable(functions, 'createCulqiCheckout');

                                                    // Show loading state if possible (simple alert for now or implement loading state)
                                                    const res: any = await createCheckout({
                                                        planName: plan.name,
                                                        price: plan.price
                                                    });

                                                    if (res.data.orderId) {
                                                        window.location.href = `/pagar?orderId=${res.data.orderId}`;
                                                    }
                                                } catch (error) {
                                                    console.error("Payment Error:", error);
                                                    alert("Error al iniciar pago. Intenta de nuevo.");
                                                }
                                            }}
                                        >
                                            Pagar
                                        </Button>
                                    </div>
                                ))}
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
