import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { browserLocalPersistence, browserSessionPersistence, setPersistence, signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useUserRole } from '@/lib/auth';

export function LoginPage() {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [rememberMe, setRememberMe] = useState(true);
    const { user, role, loading: restoringSession } = useUserRole();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            // Set persistence before signing in; Firebase manages tokens, never passwords.
            await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
            await signInWithEmailAndPassword(auth, email, password);
            // The restored auth state below redirects only after the role is resolved.
        } catch (err: unknown) {
            const code = (err as { code?: string }).code;
            if (code === 'auth/web-storage-unsupported' || code === 'auth/operation-not-supported-in-this-environment') {
                setError('El navegador no permite guardar la sesión. Habilita el almacenamiento del sitio e intenta de nuevo.');
            } else if (code === 'auth/network-request-failed') {
                setError('No se pudo conectar. Revisa tu conexión e intenta de nuevo.');
            } else {
                setError('No se pudo iniciar sesión. Revisa tus credenciales e intenta de nuevo.');
            }
        } finally {
            setLoading(false);
        }
    };

    // Wait for Firebase to restore the saved session before showing the login form.
    if (restoringSession || loading) {
        return <div className="flex items-center justify-center min-h-screen bg-black text-white" role="status">Restaurando sesión...</div>;
    }

    if (user) {
        return <Navigate to={role === 'admin' ? '/dashboard/messages' : '/member-dashboard'} replace />;
    }

    return (
        <div className="min-h-screen bg-black flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute w-[500px] h-[500px] bg-green-600/20 blur-[100px] rounded-full -top-20 -left-20 pointer-events-none" />
            <div className="absolute w-[500px] h-[500px] bg-emerald-900/10 blur-[100px] rounded-full bottom-0 right-0 pointer-events-none" />

            <Card className="w-full max-w-md bg-neutral-900 border-neutral-800 shadow-2xl relative z-10">
                <CardHeader className="text-center space-y-4 pb-2">
                    <div className="absolute top-4 left-4">
                        <Button variant="ghost" className="text-gray-400 hover:text-white" onClick={() => navigate('/')}>
                            ← Volver
                        </Button>
                    </div>
                    <div className="mx-auto w-12 h-12 bg-green-500 rounded-xl flex items-center justify-center mb-2">
                        <span className="font-bold text-white text-xl">IA</span>
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-white">Bienvenido de vuelta</h2>
                        <p className="text-gray-400 text-sm mt-1">Ingresa tus credenciales para continuar</p>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-gray-300">Correo electrónico</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="tu@email.com"
                                className="bg-neutral-800 border-neutral-700 text-white focus:border-green-500 transition-colors"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-gray-300">Contraseña</Label>
                            <Input
                                id="password"
                                type="password"
                                className="bg-neutral-800 border-neutral-700 text-white focus:border-green-500 transition-colors"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>

                        <div className="flex items-center justify-between text-sm">
                            <label className="flex items-center gap-2 text-gray-400 cursor-pointer">
                                <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="rounded border-gray-600 bg-neutral-800 text-green-500 focus:ring-green-500/20" />
                                Recordarme
                            </label>
                            <a href="#" className="text-green-500 hover:text-green-400 hover:underline">
                                ¿Olvidaste tu contraseña?
                            </a>
                        </div>

                        {error && <p className="text-red-500 text-sm">{error}</p>}

                        <Button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white h-11 text-base" disabled={loading}>
                            {loading ? 'Iniciando...' : 'Iniciar Sesión →'}
                        </Button>
                    </form>

                    <div className="text-center text-sm text-gray-500 pt-2 border-t border-neutral-800">
                        ¿No tienes una cuenta? <Link to="/register" className="text-green-500 hover:underline">Regístrate gratis</Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
