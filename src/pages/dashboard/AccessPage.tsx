import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2, DoorOpen, CheckCircle2, XCircle } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

interface AccessLog {
    id: string;
    localDate?: string;
    localTime?: string;
    memberName?: string | null;
    phone?: string;
    allowed?: boolean;
    statusAtAccess?: string;
    reason?: string;
    intentText?: string;
    testMode?: boolean;
    createdAt?: any;
}

function todayLima(): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Lima',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    const parts = formatter.formatToParts(new Date());
    const year = parts.find((p) => p.type === 'year')?.value || '2000';
    const month = parts.find((p) => p.type === 'month')?.value || '01';
    const day = parts.find((p) => p.type === 'day')?.value || '01';
    return `${year}-${month}-${day}`;
}

const REASON_LABELS: Record<string, string> = {
    active_member: 'Miembro activo',
    overdue_grace_period: 'Vencido (margen)',
    overdue_restricted: 'Vencido (restringido)',
    inactive_member: 'Membresia inactiva',
    member_not_found: 'No encontrado',
    feature_disabled: 'Funcion apagada',
    test_number_only: 'Solo numero de prueba',
};

export function AccessPage() {
    const [date, setDate] = useState<string>(todayLima());
    const [logs, setLogs] = useState<AccessLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async (selected: string) => {
        setLoading(true);
        setError(null);
        try {
            const q = query(collection(db, 'accessLogs'), where('localDate', '==', selected));
            const snap = await getDocs(q);
            const items = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as AccessLog));
            items.sort((a, b) => {
                const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                return tb - ta;
            });
            setLogs(items);
        } catch (e: any) {
            console.error('Error cargando accesos:', e);
            setError(e?.message || 'Error cargando accesos');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load(date);
    }, [date, load]);

    const allowed = logs.filter((l) => l.allowed).length;
    const denied = logs.length - allowed;

    return (
        <div className="space-y-6 max-w-4xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-bold text-white">Accesos</h1>
                    <p className="text-gray-400">Ingresos registrados por WhatsApp</p>
                </div>
                <Input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-auto bg-neutral-800 border-neutral-700 text-white"
                />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="bg-neutral-900 border-neutral-800">
                    <CardContent className="p-5">
                        <p className="text-sm text-gray-400">Ingresos del dia</p>
                        <p className="text-3xl font-bold text-white">{logs.length}</p>
                    </CardContent>
                </Card>
                <Card className="bg-neutral-900 border-green-900/40">
                    <CardContent className="p-5">
                        <p className="text-sm text-gray-400 flex items-center gap-1">
                            <CheckCircle2 className="w-4 h-4 text-green-500" /> Permitidos
                        </p>
                        <p className="text-3xl font-bold text-green-500">{allowed}</p>
                    </CardContent>
                </Card>
                <Card className="bg-neutral-900 border-red-900/40">
                    <CardContent className="p-5">
                        <p className="text-sm text-gray-400 flex items-center gap-1">
                            <XCircle className="w-4 h-4 text-red-500" /> No permitidos
                        </p>
                        <p className="text-3xl font-bold text-red-500">{denied}</p>
                    </CardContent>
                </Card>
            </div>

            <Card className="bg-neutral-900 border-neutral-800">
                <CardHeader>
                    <div className="flex items-center gap-2 text-green-500 mb-2">
                        <DoorOpen className="w-5 h-5" />
                        <h3 className="font-semibold">Registro del {date}</h3>
                    </div>
                    <CardTitle className="text-gray-400 text-sm font-normal">Detalle de ingresos</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center gap-2 text-gray-400">
                            <Loader2 className="w-5 h-5 animate-spin" /> Cargando...
                        </div>
                    ) : error ? (
                        <p className="text-red-400">{error}</p>
                    ) : logs.length === 0 ? (
                        <p className="text-gray-500">No hay ingresos registrados para esta fecha.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-gray-400 border-b border-neutral-800">
                                        <th className="py-2 pr-4">Hora</th>
                                        <th className="py-2 pr-4">Cliente</th>
                                        <th className="py-2 pr-4">Telefono</th>
                                        <th className="py-2 pr-4">Estado</th>
                                        <th className="py-2 pr-4">Acceso</th>
                                        <th className="py-2">Motivo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.map((log) => (
                                        <tr key={log.id} className="border-b border-neutral-800/60 text-white">
                                            <td className="py-2 pr-4">{log.localTime || '—'}</td>
                                            <td className="py-2 pr-4">{log.memberName || '—'}</td>
                                            <td className="py-2 pr-4 text-gray-400">{log.phone || '—'}</td>
                                            <td className="py-2 pr-4 capitalize">{log.statusAtAccess || 'unknown'}</td>
                                            <td className="py-2 pr-4">
                                                {log.allowed ? (
                                                    <span className="text-green-500">Permitido</span>
                                                ) : (
                                                    <span className="text-red-500">No permitido</span>
                                                )}
                                            </td>
                                            <td className="py-2 text-gray-400">
                                                {REASON_LABELS[log.reason || ''] || log.reason || '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
