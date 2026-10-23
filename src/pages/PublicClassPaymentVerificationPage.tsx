import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Check, Clock3, Loader2, LockKeyhole, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { ClassPaymentVerification, reservationCall, reservationError } from '@/lib/classReservations';

export function PublicClassPaymentVerificationPage() {
    const { bookingId = '' } = useParams();
    const [params] = useSearchParams();
    const token = params.get('token') || '';
    const routeKey = `${bookingId}:${token}`;
    const currentRouteKey = useRef(routeKey);
    currentRouteKey.current = routeKey;
    const loadSequence = useRef(0);
    const [verification, setVerification] = useState<ClassPaymentVerification | null>(null);
    const [pin, setPin] = useState('');
    const [loading, setLoading] = useState(true);
    const [confirming, setConfirming] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        const sequence = ++loadSequence.current;
        setVerification(null);
        if (!bookingId || !/^[a-f0-9]{64}$/.test(token)) {
            setError('Este enlace de verificación no es válido. Solicita un nuevo aviso desde la reserva.');
            setLoading(false);
            return;
        }
        setLoading(true);
        setError('');
        try {
            const next = await reservationCall<ClassPaymentVerification>('getClassPaymentVerification', { bookingId, verifierToken: token });
            if (sequence === loadSequence.current) setVerification(next);
        } catch (cause) {
            if (sequence === loadSequence.current) setError(reservationError(cause));
        } finally {
            if (sequence === loadSequence.current) setLoading(false);
        }
    }, [bookingId, token, routeKey]);

    useEffect(() => { setConfirming(false); setPin(''); void load(); }, [load]);

    const confirm = async (event: React.FormEvent) => {
        event.preventDefault();
        if (confirming || verification?.bookingId !== bookingId || !/^\d{6}$/.test(pin)) return;
        const confirmationRoute = routeKey;
        setConfirming(true);
        setError('');
        try {
            await reservationCall('confirmClassPaymentByPin', { bookingId, verifierToken: token, pin });
            if (currentRouteKey.current !== confirmationRoute) return;
            setPin('');
            await load();
        } catch (cause) {
            if (currentRouteKey.current === confirmationRoute) setError(reservationError(cause));
        } finally {
            if (currentRouteKey.current === confirmationRoute) setConfirming(false);
        }
    };

    const displayedVerification = verification?.bookingId === bookingId ? verification : null;
    const cancelled = displayedVerification?.status === 'cancelled';
    const confirmed = displayedVerification?.status === 'confirmed' && displayedVerification.paymentStatus === 'paid';

    return <main lang="es" className="min-h-screen bg-neutral-950 px-4 py-6 text-neutral-950 sm:grid sm:place-items-center">
        <section className="mx-auto w-full max-w-md overflow-hidden rounded-2xl bg-neutral-100 shadow-2xl">
            <header className="border-b border-neutral-200 bg-white px-5 py-4 text-center">
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-700">MegaGym · verificación de pago</p>
            </header>

            {loading ? <div role="status" className="flex items-center justify-center gap-3 px-5 py-16 text-sm text-neutral-600"><Loader2 className="h-5 w-5 animate-spin text-emerald-600" />Consultando reserva…</div> : !displayedVerification ? <div className="px-5 py-12 text-center">
                <X className="mx-auto h-10 w-10 text-rose-500" />
                <h1 className="mt-4 text-xl font-black">No pudimos abrir la verificación</h1>
                <p role="alert" className="mt-2 text-sm leading-6 text-neutral-600">{error}</p>
                <button type="button" onClick={() => void load()} className="mt-5 inline-flex h-11 items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 text-sm font-bold"><RefreshCw className="h-4 w-4" />Reintentar</button>
            </div> : <>
                <div className="px-5 py-6 text-center">
                    <div className={`mx-auto grid h-14 w-14 place-items-center rounded-full ${cancelled ? 'bg-neutral-200 text-neutral-600' : confirmed ? 'bg-emerald-500 text-white' : 'bg-amber-100 text-amber-700'}`}>
                        {cancelled ? <X className="h-7 w-7" /> : confirmed ? <Check className="h-8 w-8" /> : <Clock3 className="h-7 w-7" />}
                    </div>
                    <h1 className="mt-3 text-2xl font-black">{cancelled ? 'Reserva cancelada' : confirmed ? 'Pago confirmado' : 'Comprueba el Yape'}</h1>
                    <p className="mt-1 text-sm text-neutral-600">{displayedVerification.collectorName ? `${displayedVerification.collectorName}, revisa el depósito antes de continuar.` : 'Revisa el depósito antes de continuar.'}</p>
                </div>

                <dl className="mx-5 divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white text-sm">
                    <div className="flex justify-between gap-4 px-4 py-3"><dt className="text-neutral-500">Cliente</dt><dd className="text-right font-bold">{displayedVerification.memberName}</dd></div>
                    <div className="flex justify-between gap-4 px-4 py-3"><dt className="text-neutral-500">Clase</dt><dd className="text-right font-bold">{displayedVerification.className} · {displayedVerification.time}</dd></div>
                    <div className="flex justify-between gap-4 px-4 py-3"><dt className="text-neutral-500">Fecha y lugar</dt><dd className="text-right font-bold">{displayedVerification.date} · {String(displayedVerification.spotNumber).padStart(2, '0')}</dd></div>
                    <div className="flex justify-between gap-4 px-4 py-3"><dt className="text-neutral-500">Pago declarado</dt><dd className="text-right font-bold">{displayedVerification.paymentMethod} · S/ {Number(displayedVerification.amount).toFixed(2)}</dd></div>
                    <div className="flex justify-between gap-4 px-4 py-3"><dt className="text-neutral-500">Operación</dt><dd className="font-mono text-base font-black text-amber-700">{displayedVerification.operationCode}</dd></div>
                </dl>

                {!confirmed && !cancelled && <form onSubmit={confirm} className="space-y-3 p-5">
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">El código informado no demuestra el pago. Confirma únicamente después de encontrar los S/ {Number(displayedVerification.amount).toFixed(2)} en tu Yape.</div>
                    <label className="block text-sm font-semibold text-neutral-700">PIN secreto de la persona encargada
                        <div className="relative"><LockKeyhole className="pointer-events-none absolute left-3 top-4 h-4 w-4 text-neutral-400" /><input autoFocus required type="password" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoComplete="current-password" placeholder="••••••" className="mt-1.5 h-12 w-full rounded-lg border border-neutral-300 bg-white pl-10 pr-3 font-mono text-lg tracking-[0.4em] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20" /></div>
                    </label>
                    {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
                    <button disabled={confirming || pin.length !== 6} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 font-black text-neutral-950 hover:bg-emerald-400 disabled:opacity-40">{confirming ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}Confirmé el pago en Yape</button>
                    <p className="text-center text-xs text-neutral-500">Si no encuentras el depósito, no confirmes. La reserva seguirá pendiente en el panel.</p>
                </form>}

                {(confirmed || cancelled) && <div className="p-5"><p className={`rounded-lg px-4 py-3 text-center text-sm font-semibold ${confirmed ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-200 text-neutral-700'}`}>{confirmed ? 'La reserva y el panel administrativo ya están actualizados.' : 'No se puede confirmar una reserva cancelada.'}</p></div>}
            </>}
        </section>
    </main>;
}
