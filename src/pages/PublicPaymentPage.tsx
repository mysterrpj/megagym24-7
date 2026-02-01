
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

declare global {
    interface Window {
        Culqi: any;
        culqi: () => void;
    }
}

export const PublicPaymentPage = () => {
    const [searchParams] = useSearchParams();
    const orderId = searchParams.get('orderId');
    const phone = searchParams.get('phone') || '';
    const plan = searchParams.get('plan') || 'Plan 1 Mes';
    const amount = parseInt(searchParams.get('amount') || '8000');

    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [status, setStatus] = useState<'initial' | 'ready' | 'processing' | 'success' | 'error'>('initial');
    const [email, setEmail] = useState('');
    const [errorMessage, setErrorMessage] = useState('');

    const PUBLIC_KEY = 'pk_test_bxGG2MOE6tdVoo65';

    useEffect(() => {
        if (!orderId) {
            setStatus('error');
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://checkout.culqi.com/js/v4';
        script.async = true;
        script.onload = () => {
            initCulqi();
        };
        document.body.appendChild(script);

        return () => {
            if (document.body.contains(script)) {
                document.body.removeChild(script);
            }
        };
    }, [orderId]);

    const initCulqi = () => {
        if (window.Culqi) {
            window.Culqi.publicKey = PUBLIC_KEY;
            window.Culqi.settings({
                title: 'MegaGym Fit IA',
                currency: 'PEN',
                description: plan,
                amount: amount,
                order: orderId
            });

            window.culqi = culqiCallback;

            setLoading(false);
            setStatus('ready');
        }
    };

    const culqiCallback = async () => {
        if (window.Culqi.token) {
            // Token received - need to create charge on backend
            console.log("Token received:", window.Culqi.token.id);
            setProcessing(true);
            setStatus('processing');
            window.Culqi.close();

            try {
                const response = await fetch('https://us-central1-fit-ia-megagym.cloudfunctions.net/createCulqiCharge', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        token: window.Culqi.token.id,
                        email: email || window.Culqi.token.email,
                        amount: amount,
                        orderId: orderId,
                        phone: phone,
                        planName: plan
                    })
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    setStatus('success');
                } else {
                    setErrorMessage(result.error || 'Error al procesar el pago');
                    setStatus('ready');
                }
            } catch (error: any) {
                console.error("Charge error:", error);
                setErrorMessage('Error de conexión. Intenta de nuevo.');
                setStatus('ready');
            } finally {
                setProcessing(false);
            }

        } else if (window.Culqi.order) {
            // Order API response
            const order = window.Culqi.order;
            console.log("Order state:", order.state);

            if (order.state === 'paid') {
                setStatus('success');
                window.Culqi.close();
            } else if (order.state === 'pending') {
                alert("Tu pago está pendiente. Si usaste PagoEfectivo, recuerda pagar tu código CIP.");
                window.Culqi.close();
            } else {
                setErrorMessage(window.Culqi.error?.user_message || "Error en el pago");
                setStatus('ready');
            }
        } else if (window.Culqi.error) {
            console.error("Culqi Error:", window.Culqi.error);
            setErrorMessage(window.Culqi.error.user_message || "Error desconocido");
            setStatus('ready');
        }
    };

    const handlePay = () => {
        if (!email) {
            setErrorMessage('Por favor ingresa tu correo electrónico');
            return;
        }
        setErrorMessage('');
        if (window.Culqi) {
            window.Culqi.open();
        }
    };

    if (status === 'success') {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center p-4">
                <Card className="w-full max-w-md bg-zinc-900 border-yellow-500/20">
                    <CardHeader className="text-center">
                        <div className="mx-auto w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mb-4">
                            <span className="text-4xl">✓</span>
                        </div>
                        <CardTitle className="text-white text-2xl">¡Pago Exitoso!</CardTitle>
                    </CardHeader>
                    <CardContent className="text-center space-y-4">
                        <p className="text-zinc-400">
                            Tu membresía <span className="text-yellow-500 font-bold">{plan}</span> ha sido activada.
                        </p>
                        <p className="text-zinc-500 text-sm">
                            Ya puedes disfrutar de todos los beneficios del gimnasio.
                        </p>
                        <Button
                            className="w-full bg-yellow-500 text-black hover:bg-yellow-400 font-bold"
                            onClick={() => window.close()}
                        >
                            Cerrar
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!orderId || status === 'error') {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center p-4">
                <Card className="w-full max-w-md bg-zinc-900 border-red-500/20">
                    <CardContent className="text-center py-8">
                        <p className="text-red-500">Error: Link inválido o expirado.</p>
                        <p className="text-zinc-500 text-sm mt-2">Por favor solicita un nuevo enlace de pago.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black flex items-center justify-center p-4 bg-[url('/gym-bg-overlay.jpg')] bg-cover bg-center">
            <div className="absolute inset-0 bg-black/80"></div>
            <Card className="relative w-full max-w-md bg-zinc-900/90 border-zinc-800 backdrop-blur">
                <CardHeader className="text-center">
                    <CardTitle className="text-white text-3xl font-bold tracking-tighter">
                        <span className="text-yellow-500">MEGA</span>GYM
                    </CardTitle>
                    <p className="text-zinc-400 mt-2">Finalizar Inscripción</p>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-zinc-400">Plan:</span>
                            <span className="text-white font-semibold">{plan}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-zinc-400">Total a Pagar:</span>
                            <span className="text-yellow-500 font-bold text-xl">S/ {(amount / 100).toFixed(2)}</span>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="email" className="text-zinc-400">Correo electrónico</Label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="tu@email.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="bg-zinc-800 border-zinc-700 text-white"
                        />
                    </div>

                    {errorMessage && (
                        <p className="text-red-500 text-sm text-center">{errorMessage}</p>
                    )}

                    <Button
                        className="w-full h-12 bg-yellow-500 text-black hover:bg-yellow-400 font-bold text-lg"
                        onClick={handlePay}
                        disabled={loading || processing || status !== 'ready'}
                    >
                        {loading ? (
                            <><Loader2 className="animate-spin mr-2 h-5 w-5" /> Cargando...</>
                        ) : processing ? (
                            <><Loader2 className="animate-spin mr-2 h-5 w-5" /> Procesando pago...</>
                        ) : (
                            'PAGAR CON TARJETA / YAPE'
                        )}
                    </Button>

                    <p className="text-center text-xs text-zinc-500 mt-4">
                        Pagos procesados por <span className="text-white font-bold">Culqi</span>. 100% Seguro.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
};
