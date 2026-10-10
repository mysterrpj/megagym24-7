import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock3, DoorOpen, Loader2, RefreshCw } from 'lucide-react';
import { PublicReceipt, PublicSession, reservationCall, reservationError } from '@/lib/classReservations';

const field = 'w-full rounded-lg border border-white/15 bg-neutral-950 px-3 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-400';
interface SavedReservation { bookingId: string; accessToken: string }

export function PublicClassReservationPage() {
    const { classId = '' } = useParams();
    const [params] = useSearchParams();
    const date = params.get('fecha') || '';
    const storageKey = `gym-reservation:${classId}:${date}`;
    const [session, setSession] = useState<PublicSession | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [selected, setSelected] = useState<number | null>(null);
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [method, setMethod] = useState<'Yape' | 'Plin'>('Yape');
    const [operationCode, setOperationCode] = useState('');
    const [accepted, setAccepted] = useState(false);
    const [saved, setSaved] = useState<SavedReservation | null>(null);
    const [receipt, setReceipt] = useState<PublicReceipt | null>(null);
    const request = useRef({ payload: '', id: '' });
    const submitting = useRef(false);

    const refresh = useCallback(async () => {
        if (!classId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            setError('Este enlace no contiene una clase y fecha válidas. Solicita un nuevo enlace al gimnasio.');
            setLoading(false);
            return;
        }
        try {
            const result = await reservationCall<PublicSession>('getPublicClassSession', { classId, date });
            setSession(result);
            setSelected((spot) => result.seats.some((seat) => seat.spotNumber === spot && seat.status === 'available') ? spot : null);
            setError('');
        } catch (cause) { setError(reservationError(cause)); }
        finally { setLoading(false); }
    }, [classId, date]);

    useEffect(() => {
        setSession(null); setSelected(null); setReceipt(null); setSaved(null); setLoading(true);
        try {
            const raw = localStorage.getItem(storageKey);
            if (raw) {
                const item = JSON.parse(raw) as SavedReservation;
                if (typeof item.bookingId === 'string' && typeof item.accessToken === 'string') setSaved(item);
            }
        } catch { /* Storage is optional; never prevents booking. */ }
        void refresh();
        const interval = window.setInterval(() => { if (!document.hidden) void refresh(); }, 30000);
        return () => window.clearInterval(interval);
    }, [refresh, storageKey]);

    const refreshReceipt = useCallback(async () => {
        if (!saved) return;
        try {
            setReceipt(await reservationCall<PublicReceipt>('getPublicClassReservation', saved));
        } catch (cause) { setError(reservationError(cause)); }
    }, [saved]);
    useEffect(() => {
        void refreshReceipt();
        if (!saved) return;
        const interval = window.setInterval(() => { if (!document.hidden) void refreshReceipt(); }, 30000);
        return () => window.clearInterval(interval);
    }, [saved, refreshReceipt]);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!selected || !session?.bookingOpen || !accepted || submitting.current) return;
        submitting.current = true; setBusy(true); setError('');
        const data = { classId, date, spotNumber: selected, name: name.trim(), phone: phone.trim(), paymentMethod: method, operationCode: operationCode.trim() };
        const payload = JSON.stringify(data);
        if (request.current.payload !== payload) request.current = { payload, id: crypto.randomUUID() };
        try {
            const result = await reservationCall<SavedReservation>('createPublicClassReservation', { ...data, requestId: request.current.id });
            setSaved(result);
            try { localStorage.setItem(storageKey, JSON.stringify({ bookingId: result.bookingId, accessToken: result.accessToken })); } catch { /* Receipt remains in memory. */ }
            await refresh();
        } catch (cause) { setError(reservationError(cause)); }
        finally { submitting.current = false; setBusy(false); }
    };

    const cancel = async () => {
        if (!saved || busy || !window.confirm('¿Cancelar tu solicitud y liberar el lugar? Si ya pagaste, coordina la devolución con recepción.')) return;
        setBusy(true); setError('');
        try {
            await reservationCall('cancelPublicClassReservation', saved);
            await refreshReceipt(); await refresh();
        } catch (cause) { setError(reservationError(cause)); }
        finally { setBusy(false); }
    };

    const confirmed = receipt?.paymentStatus === 'paid' && receipt.status !== 'cancelled';
    const cancelled = receipt?.status === 'cancelled';
    const dateLabel = /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? new Date(`${date}T12:00:00-05:00`).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Lima' }) : date;

    return (
        <main className="min-h-screen bg-neutral-950 px-4 py-8 text-neutral-200 sm:py-12">
            <div className="mx-auto max-w-4xl space-y-6">
                <header>
                    <Link to="/reservar" className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-neutral-400 transition-colors hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                        <ArrowLeft className="h-4 w-4" /> Volver a horarios
                    </Link>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">MegaGym · Clases grupales</p>
                    <h1 className="mt-3 text-3xl font-bold text-white">Reserva tu lugar</h1>
                    <p className="mt-2 text-neutral-400">Elige tu ubicación antes de llegar. Sin crear una cuenta.</p>
                </header>
                {loading && <p role="status" className="flex items-center gap-2 py-8"><Loader2 className="h-5 w-5 animate-spin" /> Cargando clase…</p>}
                {error && <div role="alert" className="rounded-xl border border-rose-400/25 bg-rose-400/10 p-4 text-sm text-rose-200">{error}<button onClick={() => void refresh()} className="ml-3 underline">Reintentar</button></div>}
                {saved && !receipt && <p role="status" className="rounded-xl border border-amber-400/25 p-4">Tu solicitud está guardada. Consultando su estado… <button onClick={() => void refreshReceipt()} className="underline">Consultar</button></p>}
                {receipt && (
                    <section aria-live="polite" className={`space-y-3 rounded-2xl border p-5 ${confirmed ? 'border-emerald-400/30 bg-emerald-400/10' : 'border-amber-400/30 bg-amber-400/10'}`}>
                        <div className="flex items-center gap-2 font-bold text-white">{confirmed ? <CheckCircle2 /> : <Clock3 />}{cancelled ? 'Solicitud cancelada' : confirmed ? '¡Tu lugar está confirmado!' : 'Solicitud recibida · pago por verificar'}</div>
                        <p>{receipt.className} · {receipt.date} · {receipt.time}</p>
                        <p className="text-2xl font-bold tabular-nums">Ubicación {String(receipt.spotNumber).padStart(2, '0')}</p>
                        <p className="text-sm">{cancelled ? 'El lugar fue liberado. Para devoluciones, comunícate con recepción.' : confirmed ? 'Recepción verificó tu pago. Presenta esta pantalla al llegar.' : 'Tu lugar está apartado mientras recepción verifica el código de operación. Esta pantalla todavía no acredita un pago confirmado.'}</p>
                        <p className="text-xs text-neutral-400">Conserva esta pestaña y utiliza el mismo navegador para consultar tu reserva. No compartas los datos privados de acceso.</p>
                        <div className="flex flex-wrap gap-3">
                            <button onClick={() => void refreshReceipt()} disabled={busy} className="rounded-lg border border-white/20 px-3 py-2 text-sm">Actualizar estado</button>
                            {!confirmed && !cancelled && <button onClick={() => void cancel()} disabled={busy} className="rounded-lg border border-white/20 px-3 py-2 text-sm">Cancelar solicitud</button>}
                        </div>
                    </section>
                )}
                {session && <>
                    <section className="rounded-xl border border-white/10 bg-neutral-900 p-5">
                        <h2 className="text-xl font-bold text-white">{session.classItem.name}</h2>
                        <p className="mt-1 capitalize text-neutral-300">{dateLabel} · {session.classItem.time} (hora de Perú)</p>
                        <p className="mt-1 text-sm text-neutral-400">{session.classItem.instructor} · {session.classItem.duration} min · S/ {session.classItem.price.toFixed(2)}</p>
                    </section>
                    {!session.bookingOpen && <p className="rounded-xl border border-amber-400/20 p-4 text-amber-200">Las reservas para esta clase están cerradas. Contacta a recepción.</p>}
                    <div className="grid items-start gap-6 md:grid-cols-2">
                        <section className="rounded-2xl border border-white/10 bg-neutral-900 p-4 sm:p-5">
                            <h2 className="mb-4 font-semibold text-white">1. Elige tu ubicación</h2>
                            <div className="mb-6 rounded-lg border border-emerald-400/20 bg-emerald-400/10 py-3 text-center text-xs font-bold uppercase tracking-widest text-emerald-300">Instructora · Espejo</div>
                            <div className="grid grid-cols-5 gap-2">
                                {session.seats.map((seat) => {
                                    const available = seat.status === 'available';
                                    const active = selected === seat.spotNumber;
                                    return <button key={seat.spotNumber} disabled={!available || !session.bookingOpen || busy || Boolean(saved && !cancelled)} onClick={() => setSelected(seat.spotNumber)} aria-pressed={active} aria-label={`Ubicación ${seat.spotNumber}, ${available ? 'libre' : seat.status === 'blocked' ? 'no habilitada' : 'ocupada'}`} className={`aspect-square min-h-12 rounded-lg border font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-300 ${active ? 'border-emerald-400 bg-emerald-400 text-neutral-950' : available ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/20' : 'border-white/5 bg-neutral-800 text-neutral-500'} disabled:cursor-not-allowed`}>
                                        {String(seat.spotNumber).padStart(2, '0')}<span className="block text-[9px] font-normal">{active ? 'Tu lugar' : available ? 'Libre' : seat.status === 'blocked' ? 'Cerrado' : 'Ocupado'}</span>
                                    </button>;
                                })}
                            </div>
                            <p className="mt-5 flex items-center justify-center gap-2 text-xs text-neutral-500"><DoorOpen className="h-4 w-4" /> Entrada del salón</p>
                            <button type="button" onClick={() => void refresh()} className="mt-4 flex items-center gap-2 text-xs text-neutral-400"><RefreshCw className="h-3 w-3" /> Actualizar disponibilidad</button>
                        </section>
                        {(!saved || cancelled) && <form onSubmit={submit} className="space-y-4 rounded-2xl border border-white/10 bg-neutral-900 p-5">
                            <h2 className="font-semibold text-white">2. Tus datos y comprobante</h2>
                            <p className="text-sm text-emerald-300">{selected ? `Ubicación ${String(selected).padStart(2, '0')} seleccionada` : 'Primero selecciona un lugar libre.'}</p>
                            <label className="block text-sm">Nombre completo<input autoComplete="name" required minLength={3} maxLength={100} value={name} onChange={(e) => setName(e.target.value)} className={`${field} mt-1`} /></label>
                            <label className="block text-sm">Celular de Perú<input autoComplete="tel" inputMode="tel" required pattern="(?:\+?51[ -]?)?9[0-9 -]{8,12}" maxLength={16} placeholder="987654321" value={phone} onChange={(e) => setPhone(e.target.value)} className={`${field} mt-1`} /></label>
                            <div className="rounded-lg border border-white/10 bg-neutral-950 p-3 text-sm"><p className="mb-1 font-semibold text-white">Indicaciones de pago · S/ {session.classItem.price.toFixed(2)}</p><p className="whitespace-pre-wrap text-neutral-300">{session.classItem.paymentInstructions}</p><p className="mt-2 text-xs text-amber-200">Seleccionar no bloquea el lugar. Se aparta al enviar la solicitud. Si alguien lo reserva antes, elige otro o coordina con recepción; no pagues dos veces.</p></div>
                            <fieldset><legend className="mb-2 text-sm">Método utilizado</legend><div className="flex gap-3">{(['Yape', 'Plin'] as const).map((value) => <label key={value} className="flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2"><input type="radio" name="method" checked={method === value} onChange={() => setMethod(value)} />{value}</label>)}</div></fieldset>
                            <label className="block text-sm">Código de operación<input required minLength={3} maxLength={60} value={operationCode} onChange={(e) => setOperationCode(e.target.value)} className={`${field} mt-1`} /><span className="mt-1 block text-xs text-neutral-400">Escribe el código del comprobante. Recepción verificará el pago manualmente.</span></label>
                            <label className="flex items-start gap-2 text-xs leading-5 text-neutral-400"><input type="checkbox" required checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1" />Autorizo usar mi nombre y celular para gestionar esta reserva. Entiendo que el pago queda pendiente de verificación.</label>
                            <button disabled={!selected || !session.bookingOpen || !accepted || busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-3 font-bold text-neutral-950 hover:bg-emerald-400 disabled:opacity-40">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Enviar solicitud de reserva</button>
                        </form>}
                    </div>
                </>}
                <p className="text-center text-xs text-neutral-500">Solo recepción puede confirmar pagos. No se muestran datos de otras alumnas.</p>
            </div>
        </main>
    );
}
