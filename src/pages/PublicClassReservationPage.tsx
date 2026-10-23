import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
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
import { PublicReceipt, PublicSession, reservationCall, reservationError } from '@/lib/classReservations';

interface SavedReservation { bookingId: string; accessToken: string }

const field = 'h-11 w-full rounded-lg border border-neutral-300 bg-white px-10 text-sm text-neutral-950 placeholder:text-neutral-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20';

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
    const [receiptOpen, setReceiptOpen] = useState(false);
    const [receiptLoading, setReceiptLoading] = useState(false);
    const [receiptError, setReceiptError] = useState('');
    const request = useRef({ payload: '', id: '' });
    const submitting = useRef(false);
    const sessionSequence = useRef(0);
    const receiptSequence = useRef(0);
    const previousReceiptSignature = useRef('');

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

    useEffect(() => {
        ++sessionSequence.current;
        ++receiptSequence.current;
        previousReceiptSignature.current = '';
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
        submitting.current = true; setBusy(true); setError('');
        const data = { classId, date, spotNumber: selected, name: name.trim(), phone: phone.trim(), paymentMethod: method, operationCode: operationCode.trim() };
        const payload = JSON.stringify(data);
        if (request.current.payload !== payload) request.current = { payload, id: crypto.randomUUID() };
        try {
            const result = await reservationCall<SavedReservation>('createPublicClassReservation', { ...data, requestId: request.current.id });
            ++receiptSequence.current;
            previousReceiptSignature.current = '';
            setReceipt(null);
            setReceiptError('');
            setReceiptOpen(true);
            setSelected(null);
            setSaved(result);
            try { localStorage.setItem(storageKey, JSON.stringify({ bookingId: result.bookingId, accessToken: result.accessToken })); } catch { /* Receipt remains in memory. */ }
            await refresh();
        } catch (cause) { setError(reservationError(cause)); }
        finally { submitting.current = false; setBusy(false); }
    };

    const cancel = async () => {
        if (!saved || busy || !window.confirm('¿Cancelar tu solicitud y liberar el lugar? Si ya pagaste, coordina la devolución con recepción.')) return;
        setBusy(true); setReceiptError('');
        try {
            await reservationCall('cancelPublicClassReservation', saved);
            request.current = { payload: '', id: '' };
            await refreshReceipt(); await refresh();
        } catch (cause) { setReceiptError(reservationError(cause)); }
        finally { setBusy(false); }
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

    const confirmed = receipt?.paymentStatus === 'paid' && receipt.status !== 'cancelled';
    const cancelled = receipt?.status === 'cancelled';
    const dateLabel = /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? new Date(`${date}T12:00:00-05:00`).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Lima' }) : date;
    const availableCount = session?.seats.filter((seat) => seat.status === 'available').length ?? 0;
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
                    <Link to="/reservar" className="rounded-lg border border-white/15 px-4 py-2.5 text-sm">Ver horarios</Link>
                    <button type="button" onClick={() => void refresh()} className="rounded-lg bg-emerald-400 px-4 py-2.5 text-sm font-bold text-neutral-950">Reintentar</button>
                </div>
            </div>
        </main>
    );

    return (
        <main lang="es" className="h-screen h-[100dvh] overflow-hidden bg-neutral-950 text-neutral-100 [@media(max-height:620px)]:overflow-y-auto">
            <div className="mx-auto flex h-full w-full max-w-md flex-col px-4 pb-[max(10px,env(safe-area-inset-bottom))] pt-[max(10px,env(safe-area-inset-top))] [@media(max-height:620px)]:h-[620px]">
                <header className="shrink-0">
                    <div className="flex h-9 items-center justify-between">
                        <Link to="/reservar" aria-label="Volver a horarios" className="-ml-2 grid h-9 w-9 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-white/5 hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-400"><ArrowLeft className="h-5 w-5" /></Link>
                        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-400">MegaGym</p>
                        <button type="button" aria-label="Actualizar disponibilidad" onClick={() => void refresh()} className="-mr-2 grid h-9 w-9 place-items-center rounded-full text-neutral-500 transition-colors hover:bg-white/5 hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-400"><RefreshCw className="h-4 w-4" /></button>
                    </div>

                    <div className="flex items-end justify-between gap-4 pb-3 pt-2">
                        <div className="min-w-0">
                            <p className="truncate text-[11px] capitalize text-neutral-400">{dateLabel} · hora de Perú</p>
                            <h1 className="truncate text-2xl font-black tracking-tight text-white">{session.classItem.name}</h1>
                            <p className="mt-0.5 truncate text-sm text-neutral-400">{session.classItem.instructor} · {session.classItem.duration} min</p>
                        </div>
                        <div className="shrink-0 text-right">
                            <span className="inline-flex rounded-full bg-emerald-400 px-3 py-1.5 text-sm font-black tabular-nums text-neutral-950">S/ {session.classItem.price.toFixed(2)}</span>
                            <p className="mt-1.5 text-sm font-bold tabular-nums text-white">{session.classItem.time}</p>
                        </div>
                    </div>
                </header>

                <section aria-labelledby="seat-map-title" className="flex min-h-0 flex-1 flex-col rounded-t-2xl bg-neutral-100 px-3 pb-2 pt-0 text-neutral-950">
                    <div className="-mx-3 flex h-9 shrink-0 items-center justify-center gap-2 rounded-t-2xl border-b border-neutral-300 bg-white text-xs font-extrabold uppercase tracking-wide">
                        <UserRound className="h-4 w-4" /><h2 id="seat-map-title">Instructora / Espejo</h2>
                    </div>

                    <div className="grid min-h-0 flex-1 grid-cols-5 grid-rows-4 gap-2 py-3">
                        {session.seats.map((seat) => {
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
                                className={`min-h-11 rounded-lg border text-base font-black tabular-nums transition-all focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-1 ${active
                                    ? 'scale-[1.03] border-emerald-700 bg-emerald-600 text-white shadow-sm'
                                    : available
                                        ? 'border-emerald-300 bg-emerald-100 text-emerald-950 hover:bg-emerald-200'
                                        : occupied
                                            ? 'border-neutral-300 bg-neutral-300 text-neutral-500'
                                            : 'border-neutral-200 bg-neutral-200 text-neutral-400'
                                } disabled:cursor-not-allowed`}
                            >{String(seat.spotNumber).padStart(2, '0')}</button>;
                        })}
                    </div>

                    <div className="shrink-0">
                        <div className="mx-auto flex h-7 w-44 items-center justify-center bg-neutral-300 text-[10px] font-black uppercase tracking-widest text-neutral-700" style={{ clipPath: 'polygon(12% 0, 88% 0, 100% 100%, 0 100%)' }}><DoorOpen className="mr-1.5 h-3.5 w-3.5" />Entrada</div>
                        <div className="mt-2 flex items-center justify-center gap-4 text-[10px] font-medium text-neutral-600">
                            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-emerald-200 ring-1 ring-emerald-300" />Disponible</span>
                            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-neutral-300" />Ocupado</span>
                            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-emerald-600" />Seleccionado</span>
                        </div>
                    </div>
                </section>

                <footer className="flex h-10 shrink-0 items-center justify-between px-1 text-[11px] text-neutral-400">
                    {saved && !cancelled
                        ? <><span className="truncate">Lugar {String(receipt?.spotNumber || selected || 0).padStart(2, '0')} · {confirmed ? 'Confirmado' : 'Pago por verificar'}</span><button type="button" onClick={showReceipt} className="ml-3 min-h-9 shrink-0 font-bold text-emerald-400">Ver estado</button></>
                        : !session.bookingOpen
                            ? <span className="font-semibold text-amber-300">Reservas cerradas para esta clase</span>
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
                        className="fixed left-1/2 top-1/2 z-[60] w-[calc(100%-2.5rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 text-center text-neutral-950 shadow-2xl focus:outline-none"
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
