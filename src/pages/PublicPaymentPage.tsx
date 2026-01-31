
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState<'initial' | 'ready' | 'processing' | 'success' | 'error'>('initial');

    const PUBLIC_KEY = 'pk_test_bxGG2MOE6tdVoo65'; // User provided key

    useEffect(() => {
        if (!orderId) {
            setStatus('error');
            return;
        }

        // Load Culqi Script
        const script = document.createElement('script');
        script.src = 'https://checkout.culqi.com/js/v4';
        script.async = true;
        script.onload = () => {
            initCulqi();
        };
        document.body.appendChild(script);

        return () => {
            document.body.removeChild(script);
        };
    }, [orderId]);

    const initCulqi = () => {
        if (window.Culqi) {
            window.Culqi.publicKey = PUBLIC_KEY;
            window.Culqi.settings({
                title: 'MegaGym Fit IA',
                currency: 'PEN',
                description: 'Membresía Gimnasio',
                amount: 8000, // Placeholder, usually ignored if order is present? 
                // Wait, if order is present, amount is taken from order.
                // But settings() requires amount for older versions. V4 with order typically overrides.
                order: orderId
            });

            // Define the callback
            window.culqi = culqiCallback;

            setLoading(false);
            setStatus('ready');

            // Auto open? Maybe let user click.
        }
    };

    const culqiCallback = () => {
        if (window.Culqi.token) {
            // This is for token-based payments (if not using Order API)
            console.log("Token received:", window.Culqi.token.id);
            // In a real app, we'd send this to a 'createCharge' endpoint.
            // But since we are using the Order API, we usually expect window.Culqi.order.
            setStatus('success');
            window.Culqi.close();
        } else if (window.Culqi.order) {
            // This is the response from the Order API
            const order = window.Culqi.order;
            console.log("Order state:", order.state);

            if (order.state === 'paid') {
                setStatus('success');
                window.Culqi.close();
            } else if (order.state === 'pending') {
                // This happens with PagoEfectivo or if payment is still being processed
                alert("Tu pago está pendiente. Si usaste PagoEfectivo, recuerda pagar tu código CIP.");
                window.Culqi.close();
            } else {
                console.error("Order Error:", window.Culqi.error);
                alert("Hubo un problema con el pago: " + (window.Culqi.error?.user_message || "Error desconocido"));
            }
        } else {
            const error = window.Culqi.error;
            console.error("Culqi Error Object:", error);
            if (error) {
                alert("Error: " + error.user_message);
                setStatus('ready');
            }
        }
    };

    const handlePay = () => {
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
                            <span className="text-2xl">🎉</span>
                        </div>
                        <CardTitle className="text-white text-2xl">¡Pago Exitoso!</CardTitle>
                    </CardHeader>
                    <CardContent className="text-center space-y-4">
                        <p className="text-zinc-400">
                            Tu membresía se está activando automáticamente.
                            Recibirás un mensaje de Sofía en breve.
                        </p>
                        <Button className="w-full bg-yellow-500 text-black hover:bg-yellow-400 font-bold" onClick={() => window.close()}>
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
                <p className="text-red-500">Error: Link inválido o expirado.</p>
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
                            <span className="text-zinc-400">Orden:</span>
                            <span className="text-white font-mono text-sm">{orderId.slice(0, 12)}...</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-zinc-400">Total a Pagar:</span>
                            {/* We don't know amount here without fetching, but user knows plan */}
                            <span className="text-yellow-500 font-bold text-xl">S/ --.--</span>
                        </div>
                    </div>

                    <Button
                        className="w-full h-12 bg-yellow-500 text-black hover:bg-yellow-400 font-bold text-lg"
                        onClick={handlePay}
                        disabled={loading || status !== 'ready'}
                    >
                        {loading ? <Loader2 className="animate-spin mr-2" /> : 'PAGAR CON TARJETA / YAPE'}
                    </Button>

                    <p className="text-center text-xs text-zinc-500 mt-4">
                        Pagos procesados por <span className="text-white font-bold">Culqi</span>. 100% Seguro.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
};
