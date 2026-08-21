import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Building2, Save, Clock, Phone, Mail, MessageSquare, Mic } from 'lucide-react';
import { doc, getDoc, setDoc, collection, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export function SettingsPage() {
    const [config, setConfig] = useState({
        name: '',
        address: '',
        phone: '',
        email: '',
        whatsappNumber: '',
        timezone: 'America/Lima',
        openTime: '06:00',
        closeTime: '23:00'
    });
    const [loading, setLoading] = useState(false);

    const handleSeed = async () => {
        if (!confirm('¿Estás seguro? Esto creará datos de prueba.')) return;
        setLoading(true);
        try {
            const batch = writeBatch(db);

            // 1. Memberships
            const plans = [
                { name: "Plan Mensual", price: 70, duration: '1 Mes', features: ["Acceso total", "Duchas"], activeMembers: 12, color: 'border-neutral-700' },
                { name: "Plan Bimestral", price: 120, duration: '2 Meses', features: ["Acceso total", "Duchas"], activeMembers: 8, color: 'border-neutral-700' },
                { name: "Plan Trimestral", price: 150, duration: '3 Meses', features: ["Acceso total", "Duchas", "Promocion"], activeMembers: 5, color: 'border-green-500', badge: 'Promo' }
            ];

            for (const plan of plans) {
                const ref = doc(collection(db, 'memberships'));
                batch.set(ref, plan); // Use batch for atomic write if possible, or just standard adds
            }

            // 2. Members
            const members = [
                { name: 'Ana Martínez', phone: '+525512345678', plan: 'Plan Mensual', status: 'active', expiry: '2026-03-15', email: 'ana@test.com' },
                { name: 'Carlos López', phone: '+525587654321', plan: 'Plan Bimestral', status: 'pending', expiry: '2026-02-01', email: 'carlos@test.com' },
                { name: 'María García', phone: '+525511223344', plan: 'Plan Trimestral', status: 'expired', expiry: '2026-01-20', email: 'maria@test.com' },
            ];

            for (const member of members) {
                const ref = doc(collection(db, 'members'));
                batch.set(ref, member);
            }

            // 3. Classes
            const classes = [
                { name: 'CrossFit', instructor: 'Coach Alex', day: 1, hour: 7, duration: 1, capacity: 20 },
                { name: 'Yoga', instructor: 'Sarah', day: 1, hour: 9, duration: 1, capacity: 15 },
                { name: 'Spinning', instructor: 'Mike', day: 2, hour: 18, duration: 1, capacity: 25 },
            ];

            for (const c of classes) {
                const ref = doc(collection(db, 'classes'));
                batch.set(ref, c);
            }

            await batch.commit();
            alert('¡Datos de prueba creados exitosamente!');
        } catch (e) {
            console.error(e);
            alert('Error creando datos: ' + e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const loadConfig = async () => {
            const docRef = doc(db, 'config', 'gym');
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                setConfig(docSnap.data() as any);
            }
        };
        loadConfig();
    }, []);

    // --- Voz de Sofia: proveedor activo (Agora | Gemini | GPT-Realtime mini) ---
    const [voiceProvider, setVoiceProvider] = useState<'agora' | 'gemini' | 'gpt-realtime-mini'>('agora');
    const [voiceModel, setVoiceModel] = useState<string>('');
    const [voiceUpdatedAt, setVoiceUpdatedAt] = useState<string | null>(null);
    const [savingVoice, setSavingVoice] = useState(false);

    useEffect(() => {
        const loadVoice = async () => {
            try {
                const snap = await getDoc(doc(db, 'settings', 'voice'));
                if (snap.exists()) {
                    const data = snap.data() as any;
                    if (['agora', 'gemini', 'gpt-realtime-mini'].includes(data.provider)) {
                        setVoiceProvider(data.provider);
                    }
                    setVoiceModel(data.model || '');
                    setVoiceUpdatedAt(data.updatedAt || null);
                }
            } catch (e) {
                console.error('Error cargando settings/voice', e);
            }
        };
        loadVoice();
    }, []);

    const handleSetVoiceProvider = async (provider: 'agora' | 'gemini' | 'gpt-realtime-mini', model: string) => {
        setSavingVoice(true);
        try {
            await setDoc(
                doc(db, 'settings', 'voice'),
                {
                    provider,
                    model: model || null,
                    updatedAt: serverTimestamp(),
                    updatedBy: 'admin',
                },
                { merge: true },
            );
            setVoiceProvider(provider);
            setVoiceModel(model);
            setVoiceUpdatedAt(new Date().toLocaleString());
            alert('Voz de Sofia actualizada: ' + provider);
        } catch (e) {
            console.error(e);
            alert('Error guardando el proveedor de voz: ' + e);
        } finally {
            setSavingVoice(false);
        }
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            await setDoc(doc(db, 'config', 'gym'), config, { merge: true });
            alert('Configuración guardada');
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 max-w-2xl">
            <div>
                <h1 className="text-3xl font-bold text-white">Configuración</h1>
                <p className="text-gray-400">Personaliza la información de tu gimnasio</p>
            </div>

            <Card className="bg-neutral-900 border-neutral-800">
                <CardHeader>
                    <div className="flex items-center gap-2 text-green-500 mb-2">
                        <Building2 className="w-5 h-5" />
                        <h3 className="font-semibold">Información del Gimnasio</h3>
                    </div>
                    <CardTitle className="text-gray-400 text-sm font-normal">Datos básicos de tu negocio</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label className="text-gray-300">Nombre del Gimnasio</Label>
                        <Input
                            value={config.name}
                            onChange={e => setConfig({ ...config, name: e.target.value })}
                            className="bg-neutral-800 border-neutral-700 text-white"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-gray-300">Dirección</Label>
                        <Input
                            value={config.address}
                            onChange={e => setConfig({ ...config, address: e.target.value })}
                            className="bg-neutral-800 border-neutral-700 text-white"
                        />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-gray-300 flex items-center gap-2"><Phone className="w-4 h-4" /> Teléfono</Label>
                            <Input
                                value={config.phone}
                                onChange={e => setConfig({ ...config, phone: e.target.value })}
                                placeholder="+51 951 296 572"
                                className="bg-neutral-800 border-neutral-700 text-white"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-gray-300 flex items-center gap-2"><Mail className="w-4 h-4" /> Email</Label>
                            <Input
                                type="email"
                                value={config.email}
                                onChange={e => setConfig({ ...config, email: e.target.value })}
                                placeholder="contacto@megagym.pe"
                                className="bg-neutral-800 border-neutral-700 text-white"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="bg-neutral-900 border-neutral-800">
                <CardHeader>
                    <div className="flex items-center gap-2 text-green-500 mb-2">
                        <MessageSquare className="w-5 h-5" />
                        <h3 className="font-semibold">WhatsApp & Zona Horaria</h3>
                    </div>
                    <CardTitle className="text-gray-400 text-sm font-normal">Configuración para el asistente de IA</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label className="text-gray-300">Número de WhatsApp Business</Label>
                        <Input
                            value={config.whatsappNumber}
                            onChange={e => setConfig({ ...config, whatsappNumber: e.target.value })}
                            placeholder="+51 951 296 572"
                            className="bg-neutral-800 border-neutral-700 text-white"
                        />
                        <p className="text-xs text-gray-500">Este número recibirá los mensajes de tus clientes</p>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-gray-300">Zona Horaria</Label>
                        <Input
                            value={config.timezone}
                            onChange={e => setConfig({ ...config, timezone: e.target.value })}
                            className="bg-neutral-800 border-neutral-700 text-white"
                        />
                    </div>
                </CardContent>
            </Card>

            <Card className="bg-neutral-900 border-neutral-800">
                <CardHeader>
                    <div className="flex items-center gap-2 text-green-500 mb-2">
                        <Clock className="w-5 h-5" />
                        <h3 className="font-semibold">Horarios</h3>
                    </div>
                    <CardTitle className="text-gray-400 text-sm font-normal">Horarios de operación</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label className="text-gray-300">Hora de Apertura</Label>
                        <Input
                            type="time"
                            value={config.openTime}
                            onChange={e => setConfig({ ...config, openTime: e.target.value })}
                            className="bg-neutral-800 border-neutral-700 text-white"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-gray-300">Hora de Cierre</Label>
                        <Input
                            type="time"
                            value={config.closeTime}
                            onChange={e => setConfig({ ...config, closeTime: e.target.value })}
                            className="bg-neutral-800 border-neutral-700 text-white"
                        />
                    </div>
                </CardContent>
            </Card>

            <Card className="bg-neutral-900 border-neutral-800">
                <CardHeader>
                    <div className="flex items-center gap-2 text-green-500 mb-2">
                        <Mic className="w-5 h-5" />
                        <h3 className="font-semibold">Voz de Sofia</h3>
                    </div>
                    <CardTitle className="text-gray-400 text-sm font-normal">
                        Elige el proveedor de voz para las llamadas de los miembros
                        {voiceUpdatedAt ? ' - ultimo cambio: ' + voiceUpdatedAt : ''}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <button
                            type="button"
                            disabled={savingVoice}
                            onClick={() => handleSetVoiceProvider('agora', '')}
                            className={[
                                'rounded-lg border p-4 text-left transition',
                                voiceProvider === 'agora'
                                    ? 'border-green-500 bg-green-500/10'
                                    : 'border-neutral-700 bg-neutral-800/50 hover:border-neutral-500',
                            ].join(' ')}
                        >
                            <div className="font-semibold text-white">Agora + Gemini</div>
                            <div className="text-xs text-gray-400 mt-1">El sistema actual</div>
                        </button>
                        <button
                            type="button"
                            disabled={savingVoice}
                            onClick={() => handleSetVoiceProvider('gemini', 'gemini-3.1-flash-live-preview')}
                            className={[
                                'rounded-lg border p-4 text-left transition',
                                voiceProvider === 'gemini'
                                    ? 'border-green-500 bg-green-500/10'
                                    : 'border-neutral-700 bg-neutral-800/50 hover:border-neutral-500',
                            ].join(' ')}
                        >
                            <div className="font-semibold text-white">Gemini Live</div>
                            <div className="text-xs text-gray-400 mt-1">Directo, sin Agora. Con interrupcion</div>
                        </button>
                        <button
                            type="button"
                            disabled={savingVoice}
                            onClick={() => handleSetVoiceProvider('gpt-realtime-mini', 'gpt-realtime-mini')}
                            className={[
                                'rounded-lg border p-4 text-left transition',
                                voiceProvider === 'gpt-realtime-mini'
                                    ? 'border-green-500 bg-green-500/10'
                                    : 'border-neutral-700 bg-neutral-800/50 hover:border-neutral-500',
                            ].join(' ')}
                        >
                            <div className="font-semibold text-white">GPT-Realtime mini</div>
                            <div className="text-xs text-gray-400 mt-1">OpenAI directo (~3 cent/min)</div>
                        </button>
                    </div>
                    <p className="text-xs text-gray-500">
                        El cambio es inmediato: las llamadas nuevas usaran el proveedor elegido.
                        {voiceModel ? ' Modelo: ' + voiceModel : ''}
                    </p>
                </CardContent>
            </Card>

            <div className="flex justify-end">
                <Button onClick={handleSave} className="bg-green-600 hover:bg-green-700 min-w-[150px]">
                    {loading ? 'Guardando...' : (<><Save className="w-4 h-4 mr-2" /> Guardar Cambios</>)}
                </Button>
            </div>

            {/* Developer Tools */}
            <Card className="bg-neutral-900 border-red-900/30 mt-12">
                <CardHeader>
                    <div className="flex items-center gap-2 text-red-500 mb-2">
                        <h3 className="font-semibold">Zona de Peligro / Pruebas</h3>
                    </div>
                    <CardTitle className="text-gray-400 text-sm font-normal">Herramientas para desarrolladores</CardTitle>
                </CardHeader>
                <CardContent>
                    <Button
                        variant="destructive"
                        onClick={handleSeed}
                        className="w-full sm:w-auto"
                        disabled={loading}
                    >
                        🚨 Llenar Base de Datos con Datos de Prueba
                    </Button>
                    <p className="text-xs text-gray-500 mt-2">
                        Esto creará planes, miembros y clases de ejemplo. Úsalo solo si la base de datos está vacía.
                    </p>
                </CardContent>
            </Card>
        </div>
    )
}
