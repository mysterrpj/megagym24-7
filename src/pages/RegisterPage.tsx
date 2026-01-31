import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useNavigate, Link } from 'react-router-dom';
import { getAuth, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export function RegisterPage() {
    const navigate = useNavigate();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        if (password.length < 6) {
            setError('La contraseña debe tener al menos 6 caracteres.');
            setLoading(false);
            return;
        }

        try {
            const auth = getAuth();
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Update Profile Name
            await updateProfile(user, {
                displayName: name
            });

            // Create Member Document in Firestore
            await setDoc(doc(db, 'members', user.uid), {
                name: name,
                email: email,
                role: 'user', // Default role. Admin is manual.
                status: 'active',
                createdAt: new Date(),
                photoURL: user.photoURL || null
            });

            navigate('/member-dashboard'); // Redirect to member portal
        } catch (err: any) {
            console.error(err);
            if (err.code === 'auth/email-already-in-use') {
                setError('Este correo ya está registrado.');
            } else {
                setError('Error al registrarse. Intenta de nuevo.');
            }
        } finally {
            setLoading(false);
        }
    };

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
                        <h2 className="text-2xl font-bold text-white">Crear Cuenta</h2>
                        <p className="text-gray-400 text-sm mt-1">Únete a Fit IA hoy mismo</p>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                    <form onSubmit={handleRegister} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="name" className="text-gray-300">Nombre Completo</Label>
                            <Input
                                id="name"
                                type="text"
                                placeholder="Juan Pérez"
                                className="bg-neutral-800 border-neutral-700 text-white focus:border-green-500 transition-colors"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-gray-300">Correo electrónico</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="tu@email.com"
                                className="bg-neutral-800 border-neutral-700 text-white focus:border-green-500 transition-colors"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-gray-300">Contraseña</Label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="******"
                                className="bg-neutral-800 border-neutral-700 text-white focus:border-green-500 transition-colors"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>

                        {error && <p className="text-red-500 text-sm">{error}</p>}

                        <Button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white h-11 text-base" disabled={loading}>
                            {loading ? 'Registrando...' : 'Registrarse →'}
                        </Button>
                    </form>

                    <div className="text-center text-sm text-gray-500 pt-2 border-t border-neutral-800">
                        ¿Ya tienes una cuenta? <Link to="/login" className="text-green-500 hover:underline">Inicia Sesión</Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
