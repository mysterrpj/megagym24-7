import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, Clock3, Dumbbell, Loader2, RefreshCw, Users } from 'lucide-react';
import { PublicSchedule, PublicScheduleClass, reservationCall, reservationError } from '@/lib/classReservations';

function limaDate(value: string) {
    return new Date(`${value}T12:00:00-05:00`);
}

function dayName(value: string, short = false) {
    return limaDate(value).toLocaleDateString('es-PE', {
        weekday: short ? 'short' : 'long',
        timeZone: 'America/Lima'
    }).replace('.', '');
}

function fullDate(value: string) {
    return limaDate(value).toLocaleDateString('es-PE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: 'America/Lima'
    });
}

function dateNumber(value: string) {
    return limaDate(value).toLocaleDateString('es-PE', { day: 'numeric', timeZone: 'America/Lima' });
}

function scheduleState(classItem: PublicScheduleClass) {
    if (classItem.bookingOpen && classItem.availableSpots <= 3) {
        return { label: classItem.availableSpots === 1 ? 'Último lugar' : `Últimos ${classItem.availableSpots} lugares`, tone: 'amber' as const };
    }
    if (classItem.bookingOpen) {
        return { label: `${classItem.availableSpots} lugares libres`, tone: 'green' as const };
    }
    if (classItem.availableSpots === 0) return { label: 'Clase completa', tone: 'muted' as const };
    return { label: 'Reservas cerradas', tone: 'muted' as const };
}

export function PublicClassSchedulePage() {
    const [schedule, setSchedule] = useState<PublicSchedule | null>(null);
    const [selectedDate, setSelectedDate] = useState('');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const refresh = useCallback(async (initial = false) => {
        if (initial) setLoading(true);
        else setRefreshing(true);
        try {
            const result = await reservationCall<PublicSchedule>('getPublicClassSchedule', {});
            setSchedule(result);
            setSelectedDate((current) => {
                if (result.days.some((day) => day.date === current)) return current;
                return result.days.find((day) => day.classes.some((classItem) => classItem.bookingOpen))?.date
                    || result.days.find((day) => day.classes.length > 0)?.date
                    || result.days[0]?.date
                    || '';
            });
            setLastUpdated(new Date());
            setError('');
        } catch (cause) {
            setError(reservationError(cause));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        void refresh(true);
        const interval = window.setInterval(() => {
            if (!document.hidden) void refresh();
        }, 30000);
        return () => window.clearInterval(interval);
    }, [refresh]);

    const selectedDay = schedule?.days.find((day) => day.date === selectedDate);
    const availableToday = selectedDay?.classes.filter((classItem) => classItem.bookingOpen).length || 0;

    return (
        <main className="min-h-screen bg-neutral-950 text-neutral-200">
            <div className="mx-auto max-w-5xl px-4 py-7 sm:px-6 sm:py-10">
                <header className="border-b border-white/10 pb-6">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-400">
                                <Dumbbell className="h-4 w-4" aria-hidden="true" />
                                MegaGym · Clases grupales
                            </div>
                            <h1 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl">Elige cuándo entrenar</h1>
                            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400 sm:text-base">
                                Consulta los próximos 7 días, revisa los cupos en vivo y reserva tu ubicación antes de llegar.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => void refresh()}
                            disabled={loading || refreshing}
                            aria-label="Actualizar horarios y disponibilidad"
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-neutral-900 text-neutral-400 transition-colors hover:border-white/20 hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-50"
                        >
                            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                    {lastUpdated && (
                        <p className="mt-4 text-xs text-neutral-500">
                            Cupos actualizados a las {lastUpdated.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                    )}
                </header>

                {loading && (
                    <div role="status" className="flex items-center gap-3 py-16 text-neutral-400">
                        <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
                        Cargando horarios y lugares disponibles…
                    </div>
                )}

                {error && !loading && (
                    <div role="alert" className="mt-6 rounded-xl border border-rose-400/25 bg-rose-400/10 p-4 text-sm text-rose-200">
                        <p>{error}</p>
                        <button type="button" onClick={() => void refresh()} className="mt-3 font-semibold underline underline-offset-4">Intentar nuevamente</button>
                    </div>
                )}

                {schedule && !loading && (
                    <>
                        <nav aria-label="Días disponibles" className="-mx-4 overflow-x-auto px-4 py-6 sm:mx-0 sm:px-0">
                            <div className="grid min-w-[620px] grid-cols-7 gap-2">
                                {schedule.days.map((day, index) => {
                                    const active = day.date === selectedDate;
                                    const openClasses = day.classes.filter((classItem) => classItem.bookingOpen).length;
                                    return (
                                        <button
                                            key={day.date}
                                            type="button"
                                            aria-pressed={active}
                                            onClick={() => setSelectedDate(day.date)}
                                            className={`min-h-20 rounded-lg border px-2 py-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400 ${active
                                                ? 'border-emerald-400/40 bg-emerald-400/15 text-white'
                                                : 'border-white/10 bg-neutral-900 text-neutral-400 hover:border-white/20 hover:bg-neutral-800'
                                            }`}
                                        >
                                            <span className={`block text-[11px] font-semibold uppercase tracking-wide ${active ? 'text-emerald-300' : 'text-neutral-500'}`}>
                                                {index === 0 ? 'Hoy' : dayName(day.date, true)}
                                            </span>
                                            <span className="mt-1 block text-xl font-bold tabular-nums">{dateNumber(day.date)}</span>
                                            <span className={`mt-1 block h-1.5 w-1.5 rounded-full ${openClasses > 0 ? 'bg-emerald-400' : 'bg-neutral-700'}`} aria-label={openClasses > 0 ? `${openClasses} clases con reservas` : 'Sin reservas disponibles'} />
                                        </button>
                                    );
                                })}
                            </div>
                        </nav>

                        <section aria-labelledby="selected-day-title" className="rounded-2xl border border-white/10 bg-neutral-900">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-6">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400">Agenda del día</p>
                                    <h2 id="selected-day-title" className="mt-1 text-xl font-bold capitalize text-white">{selectedDay ? fullDate(selectedDay.date) : 'Próximas clases'}</h2>
                                </div>
                                {selectedDay && selectedDay.classes.length > 0 && (
                                    <span className="rounded-full border border-white/10 bg-neutral-950 px-3 py-1 text-xs text-neutral-400">
                                        {availableToday} {availableToday === 1 ? 'horario disponible' : 'horarios disponibles'}
                                    </span>
                                )}
                            </div>

                            <div className="divide-y divide-white/10">
                                {selectedDay?.classes.map((classItem) => {
                                    const state = scheduleState(classItem);
                                    const reservationUrl = `/reservar/clase/${encodeURIComponent(classItem.id)}?fecha=${selectedDay.date}`;
                                    return (
                                        <article key={classItem.id} className="grid gap-4 p-4 sm:grid-cols-[96px_1fr_auto] sm:items-center sm:px-6 sm:py-5">
                                            <div className="rounded-lg border border-white/10 bg-neutral-950 px-3 py-3 text-center">
                                                <Clock3 className="mx-auto h-4 w-4 text-emerald-400" aria-hidden="true" />
                                                <p className="mt-1 text-lg font-bold tabular-nums text-white">{classItem.time}</p>
                                                <p className="text-[11px] text-neutral-500">{classItem.duration} min</p>
                                            </div>

                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h3 className="text-lg font-bold text-white">{classItem.name}</h3>
                                                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${state.tone === 'green'
                                                        ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
                                                        : state.tone === 'amber'
                                                            ? 'border-amber-400/25 bg-amber-400/10 text-amber-200'
                                                            : 'border-white/10 bg-neutral-800 text-neutral-400'
                                                    }`}>{state.label}</span>
                                                </div>
                                                <p className="mt-1 text-sm text-neutral-400">Con {classItem.instructor}</p>
                                                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-neutral-400">
                                                    <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{classItem.availableSpots} de {classItem.capacity} libres</span>
                                                    <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />S/ {classItem.price.toFixed(2)}</span>
                                                </div>
                                            </div>

                                            {classItem.bookingOpen ? (
                                                <Link
                                                    to={reservationUrl}
                                                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-400 px-4 py-3 text-sm font-bold text-neutral-950 transition-colors hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:ring-offset-2 focus:ring-offset-neutral-900"
                                                >
                                                    Elegir lugar <ArrowRight className="h-4 w-4" />
                                                </Link>
                                            ) : (
                                                <span className="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/10 bg-neutral-950 px-4 py-3 text-sm font-semibold text-neutral-600">
                                                    No disponible
                                                </span>
                                            )}
                                        </article>
                                    );
                                })}

                                {selectedDay && selectedDay.classes.length === 0 && (
                                    <div className="px-6 py-14 text-center">
                                        <CalendarDays className="mx-auto h-7 w-7 text-neutral-600" />
                                        <p className="mt-3 font-medium text-neutral-300">No hay clases públicas este día</p>
                                        <p className="mt-1 text-sm text-neutral-500">Elige otro día en la agenda para ver sus horarios.</p>
                                    </div>
                                )}
                            </div>
                        </section>

                        <footer className="py-6 text-center text-xs leading-5 text-neutral-500">
                            Los cupos se actualizan automáticamente. La reserva queda pendiente hasta que recepción verifique el pago.
                        </footer>
                    </>
                )}
            </div>
        </main>
    );
}
