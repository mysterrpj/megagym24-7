import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import {
    ArrowLeft,
    Check,
    Clock3,
    DoorOpen,
    Hash,
    Loader2,
    RefreshCw,
    Smartphone,
    UserRound,
    X,
} from 'lucide-react';
import { PublicReceipt, PublicSchedule, PublicSession, reservationCall, reservationError } from '@/lib/classReservations';

interface SavedReservation { bookingId: string; accessToken: string }

const field = 'h-11 w-full rounded-lg border border-neutral-300 bg-white px-10 text-sm text-neutral-950 placeholder:text-neutral-400 focus:border-lime-500 focus:outline-none focus:ring-2 focus:ring-lime-500/20';

const seatPlacement: Record<number, string> = {
    1: 'col-start-1 col-span-3 row-start-1', 2: 'col-start-10 col-span-3 row-start-1',
    3: 'col-start-1 col-span-3 row-start-2', 4: 'col-start-4 col-span-3 row-start-2', 5: 'col-start-7 col-span-3 row-start-2', 6: 'col-start-10 col-span-3 row-start-2',
    7: 'col-start-1 col-span-3 row-start-3', 8: 'col-start-4 col-span-3 row-start-3', 9: 'col-start-7 col-span-3 row-start-3', 10: 'col-start-10 col-span-3 row-start-3',
    11: 'col-start-2 col-span-3 row-start-4', 12: 'col-start-5 col-span-4 row-start-4', 13: 'col-start-9 col-span-3 row-start-4',
    14: 'col-start-1 col-span-3 row-start-5', 15: 'col-start-4 col-span-3 row-start-5', 16: 'col-start-7 col-span-3 row-start-5', 17: 'col-start-10 col-span-3 row-start-5',
    18: 'col-start-1 col-span-3 row-start-6', 19: 'col-start-4 col-span-3 row-start-6', 20: 'col-start-7 col-span-3 row-start-6', 21: 'col-start-10 col-span-3 row-start-6',
};

const limaDate = (value: string) => new Date(`${value}T12:00:00-05:00`);
const shortDay = (value: string) => limaDate(value).toLocaleDateString('es-PE', { weekday: 'short', timeZone: 'America/Lima' }).replace('.', '').toUpperCase();
const dayNumber = (value: string) => limaDate(value).toLocaleDateString('es-PE', { day: '2-digit', timeZone: 'America/Lima' });

function createRequestId() {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
    if (typeof globalThis.crypto?.getRandomValues === 'function') {
        const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
        return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    }
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
}

export function PublicClassReservationPage() {
    const { classId = '' } = useParams();
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const date = params.get('fecha') || '';
    const routeKey = `${classId}:${date}`;
    const storageKey = `gym-reservation:${routeKey}`;
    const [session, setSession] = useState<PublicSession | null>(null);
    const [schedule, setSchedule] = useState<PublicSchedule | null>(null);
    const [scheduleError, setScheduleError] = useState('');
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
    const [receiptOpen, setReceiptOpen] = useState(false);
    const [receiptLoading, setReceiptLoading] = useState(false);
    const [receiptError, setReceiptError] = useState('');
    const request = useRef({ payload: '', id: '' });
    const submitting = useRef(false);
    const sessionSequence = useRef(0);
    const scheduleSequence = useRef(0);
    const receiptSequence = useRef(0);
    const previousReceiptSignature = useRef('');
    const currentRouteKey = useRef(routeKey);
    currentRouteKey.current = routeKey;

    const refresh = useCallback(async () => {
        const sequence = ++sessionSequence.current;
        if (!classId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            setError('Este enlace no contiene una clase y fecha válidas. Solicita un nuevo enlace al gimnasio.');
            setLoading(false);
            return;
        }
        try {
            const result = await reservationCall<PublicSession>('getPublicClassSession', { classId, date });
            if (sequence !== sessionSequence.current) return;
            setSession(result);
            setSelected((spot) => result.seats.some((seat) => seat.spotNumber === spot && seat.status === 'available') ? spot : null);
            setError('');
        } catch (cause) {
            if (sequence === sessionSequence.current) setError(reservationError(cause));
        } finally {
            if (sequence === sessionSequence.current) setLoading(false);
        }
    }, [classId, date]);

    const refreshSchedule = useCallback(async () => {
        const sequence = ++scheduleSequence.current;
        try {
            const result = await reservationCall<PublicSchedule>('getPublicClassSchedule', {});
            if (sequence !== scheduleSequence.current) return;
            setSchedule(result);
            setScheduleError('');
        } catch (cause) {
            if (sequence === scheduleSequence.current) setScheduleError(reservationError(cause));
        }
    }, []);

    useEffect(() => {
        void refreshSchedule();
        const interval = window.setInterval(() => { if (!document.hidden) void refreshSchedule(); }, 30000);
        return () => { ++scheduleSequence.current; window.clearInterval(interval); };
    }, [refreshSchedule]);

    useEffect(() => {
        ++sessionSequence.current;
        ++receiptSequence.current;
        previousReceiptSignature.current = '';
        submitting.current = false;
        request.current = { payload: '', id: '' };
        setBusy(false);
        setSession(null); setSelected(null); setReceipt(null); setSaved(null); setReceiptOpen(false); setReceiptLoading(false); setReceiptError(''); setLoading(true);
        try {
            const raw = localStorage.getItem(storageKey);
            if (raw) {
                const item = JSON.parse(raw) as SavedReservation;
                if (typeof item.bookingId === 'string' && typeof item.accessToken === 'string') setSaved(item);
            }
        } catch { /* Storage is optional; never prevents booking. */ }
        void refresh();
        const interval = window.setInterval(() => { if (!document.hidden) void refresh(); }, 30000);
        return () => { ++sessionSequence.current; window.clearInterval(interval); };
    }, [refresh, storageKey]);

    const refreshReceipt = useCallback(async () => {
        if (!saved) return;
        const credentials = saved;
        const sequence = ++receiptSequence.current;
        setReceiptLoading(true);
        setReceiptError('');
        try {
            const nextReceipt = await reservationCall<PublicReceipt>('getPublicClassReservation', credentials);
            if (sequence !== receiptSequence.current) return;
            setReceipt(nextReceipt);
        } catch (cause) {
            if (sequence === receiptSequence.current) setReceiptError(reservationError(cause));
        } finally {
            if (sequence === receiptSequence.current) setReceiptLoading(false);
        }
    }, [saved]);

    useEffect(() => {
        ++receiptSequence.current;
        if (!saved) return;
        void refreshReceipt();
        const interval = window.setInterval(() => { if (!document.hidden) void refreshReceipt(); }, 30000);
        return () => { ++receiptSequence.current; window.clearInterval(interval); };
    }, [saved, refreshReceipt]);

    useEffect(() => {
        if (!receipt) return;
        const signature = `${receipt.bookingId}:${receipt.status}:${receipt.paymentStatus}`;
        if (previousReceiptSignature.current !== signature) {
            previousReceiptSignature.current = signature;
            setReceiptOpen(true);
        }
    }, [receipt]);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!selected || !session?.bookingOpen || !accepted || submitting.current) return;
        const mutationRoute = routeKey;
        submitting.current = true; setBusy(true); setError('');
        const data = { classId, date, spotNumber: selected, name: name.trim(), phone: phone.trim(), paymentMethod: method, operationCode: operationCode.trim() };
        const payload = JSON.stringify(data);
        try {
            if (request.current.payload !== payload) request.current = { payload, id: createRequestId() };
            const result = await reservationCall<SavedReservation>('createPublicClassReservation', { ...data, requestId: request.current.id });
            if (currentRouteKey.current !== mutationRoute) return;
            ++receiptSequence.current;
            previousReceiptSignature.current = '';
            setReceipt(null);
            setReceiptError('');
            setReceiptOpen(true);
            setSelected(null);
            setSaved(result);
            try { localStorage.setItem(storageKey, JSON.stringify({ bookingId: result.bookingId, accessToken: result.accessToken })); } catch { /* Receipt remains in memory. */ }
            await refresh();
        } catch (cause) {
            if (currentRouteKey.current === mutationRoute) setError(reservationError(cause));
        } finally {
            submitting.current = false;
            if (currentRouteKey.current === mutationRoute) setBusy(false);
        }
    };

    const cancel = async () => {
        if (!saved || busy || !window.confirm('¿Cancelar tu solicitud y liberar el lugar? Si ya pagaste, coordina la devolución con recepción.')) return;
        const mutationRoute = routeKey;
        const credentials = saved;
        setBusy(true); setReceiptError('');
        try {
            await reservationCall('cancelPublicClassReservation', credentials);
            if (currentRouteKey.current !== mutationRoute) return;
            request.current = { payload: '', id: '' };
            await refreshReceipt();
            if (currentRouteKey.current !== mutationRoute) return;
            await refresh();
        } catch (cause) {
            if (currentRouteKey.current === mutationRoute) setReceiptError(reservationError(cause));
        } finally {
            if (currentRouteKey.current === mutationRoute) setBusy(false);
        }
    };

    const selectSeat = (spotNumber: number) => {
        setError('');
        setSelected(spotNumber);
    };
    const showReceipt = () => {
        setReceiptOpen(true);
        void refreshReceipt();
    };
    const forgetReservation = () => {
        ++receiptSequence.current;
        try { localStorage.removeItem(storageKey); } catch { /* Local storage is optional. */ }
        previousReceiptSignature.current = '';
        request.current = { payload: '', id: '' };
        setSaved(null);
        setReceipt(null);
        setReceiptError('');
        setReceiptLoading(false);
        setReceiptOpen(false);
        setSelected(null);
    };

    const openSession = (nextClassId: string, nextDate: string) => {
        if (nextClassId === classId && nextDate === date) return;
        navigate(`/reservar/clase/${encodeURIComponent(nextClassId)}?fecha=${nextDate}`);
    };
    const openDay = (nextDate: string) => {
        const day = schedule?.days.find((item) => item.date === nextDate);
        const target = day?.classes.find((item) => item.bookingOpen) || day?.classes[0];
        if (target) openSession(target.id, nextDate);
    };

    const confirmed = receipt?.paymentStatus === 'paid' && receipt.status !== 'cancelled';
    const cancelled = receipt?.status === 'cancelled';
    const dateLabel = /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? new Date(`${date}T12:00:00-05:00`).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Lima' }) : date;
    const availableCount = session?.seats.filter((seat) => seat.status === 'available').length ?? 0;
    const sessionDays = schedule?.days.filter((day) => day.classes.length > 0) || [];
    const selectedDay = schedule?.days.find((day) => day.date === date);
    const paymentSheetOpen = Boolean(selected && session && (!saved || cancelled));

    if (loading) return (
        <main className="grid h-[100dvh] place-items-center bg-neutral-950 text-neutral-300">
            <div role="status" className="flex items-center gap-3 text-sm"><Loader2 className="h-5 w-5 animate-spin text-emerald-400" />Preparando el salón…</div>
        </main>
    );

    if (!session) return (
        <main className="grid h-[100dvh] place-items-center bg-neutral-950 px-5 text-neutral-200">
            <div className="max-w-sm text-center">
                <p role="alert" className="text-sm leading-6 text-rose-200">{error || 'No pudimos cargar esta clase.'}</p>
                <div className="mt-5 flex justify-center gap-3">
                    <button type="button" onClick={() => navigate('/reservar')} className="rounded-lg border border-white/15 px-4 py-2.5 text-sm">Buscar otra clase</button>
                    <button type="button" onClick={() => void refresh()} className="rounded-lg bg-emerald-400 px-4 py-2.5 text-sm font-bold text-neutral-950">Reintentar</button>
                </div>
            </div>
        </main>
    );

    return (
        <main lang="es" className="h-screen h-[100dvh] overflow-hidden bg-[#090a0b] text-neutral-100 [@media(max-height:700px)]:overflow-y-auto">
            <div className="mx-auto flex h-full w-full max-w-lg flex-col px-3 pb-[max(8px,env(safe-area-inset-bottom))] pt-[max(8px,env(safe-area-inset-top))] [@media(max-height:700px)]:h-[700px]">
                <header className="shrink-0">
                    <div className="flex h-8 items-center justify-between">
                        <button type="button" onClick={() => navigate('/')} aria-label="Salir de reservas" className="-ml-1 grid h-9 w-9 place-items-center rounded-full text-neutral-300 transition-colors hover:bg-white/5 hover:text-white focus:outline-none focus:ring-2 focus:ring-lime-300"><ArrowLeft className="h-5 w-5" /></button>
                        <p className="text-[11px] font-black uppercase tracking-[0.28em] text-lime-300">MegaGym</p>
                        <button type="button" aria-label="Actualizar disponibilidad" onClick={() => { void refresh(); void refreshSchedule(); }} className="-mr-1 grid h-9 w-9 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-white/5 hover:text-white focus:outline-none focus:ring-2 focus:ring-lime-300"><RefreshCw className="h-4 w-4" /></button>
                    </div>

                    <div className="flex items-end justify-between gap-4 pb-2 pt-1">
                        <div className="min-w-0">
                            <h1 className="truncate text-2xl font-black tracking-tight text-white">{session.classItem.name}</h1>
                            <p className="truncate text-sm text-neutral-400">{session.classItem.instructor} · {session.classItem.duration} min</p>
                        </div>
                        <span className="inline-flex shrink-0 rounded-lg bg-amber-300 px-3 py-2 text-base font-black tabular-nums text-neutral-950">S/ {session.classItem.price.toFixed(2)}</span>
                    </div>

                    {sessionDays.length > 0 && <nav aria-label="Elegir día" className="-mx-1 overflow-x-auto px-1 pb-2 [scrollbar-width:none]">
                        <div className="flex min-w-max gap-1.5">
                            {sessionDays.map((day) => {
                                const active = day.date === date;
                                return <button key={day.date} type="button" aria-pressed={active} onClick={() => openDay(day.date)} className={`flex h-10 min-w-14 items-center justify-center gap-1 rounded-lg border px-2 text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-lime-300 ${active ? 'border-lime-300 bg-lime-300 text-neutral-950' : 'border-white/15 bg-neutral-900 text-neutral-400'}`}><span>{shortDay(day.date)}</span><span className="tabular-nums">{dayNumber(day.date)}</span></button>;
                            })}
                        </div>
                    </nav>}

                    <div className="overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Elegir horario">
                        <div className="mx-auto flex min-h-9 w-max min-w-full items-center justify-center gap-2">
                            {(selectedDay?.classes || []).map((classItem) => {
                                const active = classItem.id === classId;
                                return <button key={classItem.id} type="button" onClick={() => openSession(classItem.id, date)} aria-pressed={active} className={`h-9 min-w-20 rounded-lg border px-3 text-sm font-black tabular-nums transition-colors focus:outline-none focus:ring-2 focus:ring-amber-300 ${active ? 'border-amber-300 bg-amber-300 text-neutral-950' : 'border-white/20 bg-neutral-800 text-white'}`}>{classItem.time}</button>;
                            })}
                            {!selectedDay && <span className="text-xs capitalize text-neutral-400">{dateLabel} · {session.classItem.time}</span>}
                        </div>
                    </div>
                    {scheduleError && <p className="pb-1 text-center text-[10px] text-amber-200">No se pudieron actualizar los otros horarios.</p>}
                </header>

                <section aria-labelledby="seat-map-title" className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#121411] px-3 pb-2 text-white">
                    <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-amber-300/60" />
                    <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-1 bg-amber-300/60" />
                    <div className="flex h-6 shrink-0 items-center justify-around border-b border-white/10 bg-neutral-950">
                        {[1, 2, 3, 4, 5].map((light) => <i key={light} className="h-1.5 w-1.5 rounded-full bg-amber-200 shadow-[0_0_8px_rgba(253,230,138,0.85)]" />)}
                    </div>
                    <h2 id="seat-map-title" className="sr-only">Plano de lugares frente a la tarima</h2>

                    <div className="grid min-h-0 flex-1 grid-cols-12 grid-rows-6 gap-x-2 gap-y-2.5 px-2 py-3">
                        <div className="col-start-4 col-span-6 row-start-1 flex h-10 self-center items-center justify-center border border-amber-200/70 bg-neutral-950 text-xs font-black uppercase tracking-[0.18em] text-amber-100 shadow-[0_6px_0_rgba(0,0,0,0.45)]">Tarima</div>
                        {session.seats.slice(0, 21).map((seat) => {
                            const available = seat.status === 'available';
                            const active = selected === seat.spotNumber;
                            const occupied = seat.status === 'pending' || seat.status === 'reserved';
                            return <button
                                key={seat.spotNumber}
                                type="button"
                                disabled={!available || !session.bookingOpen || busy || Boolean(saved && !cancelled)}
                                onClick={() => selectSeat(seat.spotNumber)}
                                aria-pressed={active}
                                aria-label={`Lugar ${seat.spotNumber}, ${available ? 'disponible' : occupied ? 'ocupado' : 'no habilitado'}`}
                                className={`${seatPlacement[seat.spotNumber] || ''} min-h-11 self-center rounded-lg border text-base font-black tabular-nums transition-all focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-2 focus:ring-offset-[#121411] ${active
                                    ? 'scale-105 border-amber-200 bg-amber-300 text-neutral-950 shadow-[0_0_14px_rgba(252,211,77,0.4)]'
                                    : available
                                        ? 'border-lime-200 bg-lime-300 text-lime-950 hover:bg-lime-200'
                                        : occupied
                                            ? 'border-neutral-400 bg-neutral-300 text-neutral-600'
                                            : 'border-neutral-700 bg-neutral-800 text-neutral-600'
                                } disabled:cursor-not-allowed`}
                            >{String(seat.spotNumber).padStart(2, '0')}</button>;
                        })}
                    </div>

                    <div className="shrink-0">
                        <div className="mx-auto flex h-7 w-36 items-center justify-center border border-white/10 bg-neutral-800 text-[10px] font-black uppercase tracking-widest text-neutral-300" style={{ clipPath: 'polygon(12% 0, 88% 0, 100% 100%, 0 100%)' }}><DoorOpen className="mr-1.5 h-3.5 w-3.5" />Entrada</div>
                        <div className="mt-2 flex items-center justify-center gap-4 text-[10px] font-medium text-neutral-300">
                            <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-sm bg-lime-300" />Disponible</span>
                            <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-sm bg-neutral-300" />Ocupado</span>
                            <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-sm bg-amber-300" />Seleccionado</span>
                        </div>
                    </div>
                </section>

                <footer className="flex h-9 shrink-0 items-center justify-between px-1 text-[11px] text-neutral-400">
                    {saved && !cancelled
                        ? <><span className="truncate">Lugar {String(receipt?.spotNumber || selected || 0).padStart(2, '0')} · {confirmed ? 'Confirmado' : 'Pago por verificar'}</span><button type="button" onClick={showReceipt} className="ml-3 min-h-9 shrink-0 font-bold text-lime-300">Ver estado</button></>
                        : !session.bookingOpen
                            ? <span className="font-semibold text-amber-300">Reservas cerradas para este horario</span>
                            : <><span>{availableCount} lugares disponibles</span><span>Elige uno para continuar</span></>}
                </footer>
            </div>

            {error && !paymentSheetOpen && (
                <div role="alert" className="fixed left-1/2 top-[max(12px,env(safe-area-inset-top))] z-[70] flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 items-start justify-between gap-3 rounded-lg border border-rose-400/30 bg-rose-950/95 px-3 py-2.5 text-xs text-rose-100 shadow-xl">
                    <span>{error}</span><button type="button" onClick={() => setError('')} aria-label="Cerrar aviso" className="-m-2 grid h-9 w-9 shrink-0 place-items-center rounded-full text-rose-300"><X className="h-4 w-4" /></button>
                </div>
            )}

            <Dialog.Root open={paymentSheetOpen} onOpenChange={(open) => { if (!open && !busy) setSelected(null); }}>
                <Dialog.Portal>
                    <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
                    <Dialog.Content
                        lang="es"
                        onOpenAutoFocus={(event) => event.preventDefault()}
                        onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}
                        onPointerDownOutside={(event) => { if (busy) event.preventDefault(); }}
                        className="fixed bottom-0 left-1/2 z-50 max-h-[calc(100dvh-12px)] w-[calc(100%-1rem)] max-w-md -translate-x-1/2 overflow-y-auto overscroll-contain rounded-t-3xl bg-neutral-100 px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-2 text-neutral-950 shadow-2xl focus:outline-none"
                    >
                        <div className="mx-auto mb-1 h-1 w-12 rounded-full bg-neutral-300" />
                        <div className="sticky top-0 z-10 -mx-1 flex items-start justify-between gap-3 bg-neutral-100 px-1 pb-2 pt-1">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Completa tu reserva</p>
                                <Dialog.Title className="text-xl font-black">Lugar {String(selected).padStart(2, '0')} <span className="text-neutral-400">·</span> S/ {session.classItem.price.toFixed(2)}</Dialog.Title>
                            </div>
                            <Dialog.Close disabled={busy} aria-label="Cerrar" className="grid h-10 w-10 place-items-center rounded-full text-neutral-600 hover:bg-neutral-200 disabled:opacity-40"><X className="h-5 w-5" /></Dialog.Close>
                        </div>
                        <Dialog.Description className="sr-only">Ingresa tus datos y el código de tu pago para solicitar el lugar seleccionado.</Dialog.Description>

                        <form onSubmit={submit} className="space-y-2.5">
                            <label className="relative block"><span className="sr-only">Nombre completo</span><UserRound className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-neutral-500" /><input autoComplete="name" required minLength={3} maxLength={100} placeholder="Nombre completo" value={name} onChange={(event) => setName(event.target.value)} className={field} /></label>
                            <label className="relative block"><span className="sr-only">Celular de Perú</span><Smartphone className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-neutral-500" /><input autoComplete="tel" inputMode="tel" required pattern="(?:\+?51[ -]?)?9[0-9 -]{8,12}" maxLength={16} placeholder="Celular de Perú" value={phone} onChange={(event) => setPhone(event.target.value)} className={field} /></label>

                            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs">
                                <div className="flex items-center justify-between gap-3"><p className="font-bold text-emerald-950">Paga S/ {session.classItem.price.toFixed(2)}</p><span className="shrink-0 text-[10px] font-semibold text-emerald-700">Verificación manual</span></div>
                                <p className="mt-1 whitespace-pre-wrap break-words text-emerald-800">{session.classItem.paymentInstructions}</p>
                                <p className="mt-1.5 text-[10px] leading-4 text-amber-800">Elegir un lugar no lo aparta. Se reserva al enviar; si otra persona se adelanta, no pagues dos veces.</p>
                            </div>

                            <fieldset><legend className="sr-only">Método de pago utilizado</legend><div className="grid grid-cols-2 gap-2">{(['Yape', 'Plin'] as const).map((value) => <label key={value} className={`flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border text-sm font-bold transition-colors focus-within:ring-2 focus-within:ring-emerald-500 focus-within:ring-offset-1 ${method === value ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-neutral-300 bg-white text-neutral-700'}`}><input type="radio" name="method" value={value} checked={method === value} onChange={() => setMethod(value)} className="sr-only" /><span className={`grid h-4 w-4 place-items-center rounded-full border ${method === value ? 'border-white' : 'border-neutral-400'}`}>{method === value && <i className="h-2 w-2 rounded-full bg-white" />}</span>{value}</label>)}</div></fieldset>

                            <label className="relative block"><span className="sr-only">Código de operación</span><Hash className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-neutral-500" /><input required minLength={4} maxLength={40} pattern="[A-Za-z0-9-]+" autoCapitalize="characters" autoComplete="off" placeholder="Código de operación" title="Usa solo letras, números y guiones" value={operationCode} onChange={(event) => setOperationCode(event.target.value)} className={field} /></label>

                            {error && <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

                            <label className="flex cursor-pointer items-start gap-2 text-[11px] leading-4 text-neutral-600"><input type="checkbox" required checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-600" /><span>Autorizo usar mis datos para gestionar esta reserva y entiendo que el pago será verificado por recepción.</span></label>

                            <button disabled={!selected || !session.bookingOpen || !accepted || busy} className="sticky bottom-0 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 text-sm font-black uppercase tracking-wide text-neutral-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Reservar lugar {String(selected).padStart(2, '0')}</button>
                        </form>
                    </Dialog.Content>
                </Dialog.Portal>
            </Dialog.Root>

            <Dialog.Root open={Boolean(saved && (!receipt || receiptOpen))} onOpenChange={(open) => { if (!open && receipt && !busy) setReceiptOpen(false); }}>
                <Dialog.Portal>
                    <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/75" />
                    <Dialog.Content
                        lang="es"
                        onEscapeKeyDown={(event) => { if (busy || !receipt) event.preventDefault(); }}
                        onPointerDownOutside={(event) => { if (busy || !receipt) event.preventDefault(); }}
                        className="fixed left-1/2 top-1/2 z-[60] max-h-[calc(100dvh-1rem)] w-[calc(100%-2.5rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-y-auto overscroll-contain rounded-2xl bg-white p-5 text-center text-neutral-950 shadow-2xl focus:outline-none"
                    >
                        {!receipt && !receiptError && <div role="status" className="flex items-center justify-center gap-3 py-4 text-sm font-semibold text-neutral-800"><Loader2 className="h-5 w-5 animate-spin text-emerald-500" />Consultando tu reserva…</div>}

                        {!receipt && receiptError && <>
                            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-rose-100 text-rose-600"><X className="h-7 w-7" /></div>
                            <Dialog.Title className="mt-3 text-xl font-black">No pudimos consultar la reserva</Dialog.Title>
                            <Dialog.Description className="mt-2 text-sm leading-5 text-neutral-600">{receiptError}</Dialog.Description>
                            <div className="mt-5 grid grid-cols-2 gap-2">
                                <button type="button" onClick={() => void refreshReceipt()} disabled={receiptLoading} className="h-11 rounded-lg bg-emerald-500 text-sm font-black text-neutral-950 disabled:opacity-50">Reintentar</button>
                                <button type="button" onClick={forgetReservation} disabled={receiptLoading} className="h-11 rounded-lg border border-neutral-300 text-sm font-bold text-neutral-700">Olvidar reserva</button>
                            </div>
                        </>}

                        {receipt && <>
                            <Dialog.Close disabled={busy} aria-label="Cerrar" className="ml-auto grid h-10 w-10 place-items-center rounded-full text-neutral-600 hover:bg-neutral-100 disabled:opacity-40"><X className="h-5 w-5" /></Dialog.Close>
                            <div className={`mx-auto grid h-14 w-14 place-items-center rounded-full ${cancelled ? 'bg-neutral-200 text-neutral-600' : confirmed ? 'bg-emerald-500 text-white' : 'bg-amber-100 text-amber-600'}`}>
                                {cancelled ? <X className="h-7 w-7" /> : confirmed ? <Check className="h-8 w-8" /> : <Clock3 className="h-7 w-7" />}
                            </div>
                            <Dialog.Title className="mt-3 text-xl font-black">{cancelled ? 'Solicitud cancelada' : confirmed ? 'Reserva confirmada' : 'Reserva recibida'}</Dialog.Title>
                            <Dialog.Description className="mt-2 text-sm text-neutral-600">{cancelled ? 'El lugar fue liberado.' : confirmed ? `Lugar ${String(receipt.spotNumber).padStart(2, '0')} confirmado. Te esperamos.` : `Lugar ${String(receipt.spotNumber).padStart(2, '0')} pendiente de verificación de pago.`}</Dialog.Description>
                            <p className="mt-2 text-xs font-medium text-neutral-600">{receipt.className} · {receipt.date} · {receipt.time} (hora de Perú)</p>
                            {!confirmed && !cancelled && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">Esta pantalla no confirma el pago. Recepción debe verificar el código de operación.</p>}
                            {receiptError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{receiptError}</p>}
                            <div className="mt-5 grid grid-cols-2 gap-2">
                                <button type="button" onClick={() => void refreshReceipt()} disabled={busy || receiptLoading} className="h-11 rounded-lg border border-neutral-300 text-sm font-bold text-neutral-700 disabled:opacity-50">{receiptLoading ? <Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 inline h-3.5 w-3.5" />}Actualizar</button>
                                <Dialog.Close disabled={busy} className="h-11 rounded-lg bg-emerald-500 text-sm font-black text-neutral-950 disabled:opacity-50">OK</Dialog.Close>
                            </div>
                            {!confirmed && !cancelled && <button type="button" onClick={() => void cancel()} disabled={busy} className="mt-3 min-h-9 text-xs font-semibold text-neutral-600 underline underline-offset-4 disabled:opacity-50">Cancelar solicitud</button>}
                        </>}
                    </Dialog.Content>
                </Dialog.Portal>
            </Dialog.Root>
        </main>
    );
}
