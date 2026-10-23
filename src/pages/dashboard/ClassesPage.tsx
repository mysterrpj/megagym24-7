import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { addDays, format, parseISO, startOfDay, startOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { AlertTriangle, CalendarClock, ChevronLeft, ChevronRight, Clock3, MapPin, Plus, UserRound } from 'lucide-react';
import { db } from '@/lib/firebase';
import { ClassReservationDialog, type ReservationBooking, type ReservationMember } from '@/components/classes/ClassReservationDialog';
import { ClassAdminDialog, classDays, type AdminClass } from '@/components/classes/ClassAdminDialog';
import { Button } from '@/components/ui/button';

interface ClassDoc extends AdminClass { color: string }
type CalendarMode = 'proximos' | 'semana' | 'dia';

// Existing day values are 1=lunes; explicit dayIndex / weekday remains 0=lunes.
function normalizeClass(raw: Record<string, any>, id: string): ClassDoc {
    const indexedDay = raw.dayIndex ?? raw.weekday;
    const legacyDay = Number(raw.day ?? 1);
    const parsedDay = indexedDay !== undefined ? Number(indexedDay) : (legacyDay >= 1 && legacyDay <= 7 ? legacyDay - 1 : legacyDay);
    return {
        id, name: raw.name || 'Clase', instructor: raw.instructor || 'Por definir',
        day: Math.min(Math.max(Number.isFinite(parsedDay) ? parsedDay : 0, 0), 6),
        time: raw.time || (typeof raw.hour === 'number' ? `${String(raw.hour).padStart(2, '0')}:00` : '07:00'),
        duration: Number(raw.duration) || 60,
        // Keep the stored capacity as the edit baseline; never silently migrate legacy rooms.
        capacity: raw.capacity != null && Number.isFinite(Number(raw.capacity)) ? Number(raw.capacity) : 21,
        price: raw.price != null && Number.isFinite(Number(raw.price)) ? Number(raw.price) : 6,
        color: 'border-l-green-600', status: raw.status || 'active',
        publicBookingEnabled: raw.publicBookingEnabled === true,
        paymentInstructions: typeof raw.paymentInstructions === 'string' ? raw.paymentInstructions : '',
    };
}

const demoClasses: ClassDoc[] = [
    { id: 'demo-fullbody', name: 'FULLBODY · ejemplo', instructor: 'Coach demo', day: 0, time: '08:30', duration: 60, capacity: 21, price: 6, status: 'active', color: 'border-l-green-600', publicBookingEnabled: false },
    { id: 'demo-movilidad', name: 'Movilidad · ejemplo', instructor: 'Coach demo', day: 2, time: '18:00', duration: 45, capacity: 16, price: 0, status: 'active', color: 'border-l-green-600', publicBookingEnabled: false },
];

const isActiveBooking = (booking: ReservationBooking) => !['cancelled', 'canceled'].includes(booking.status ?? 'confirmed');
const isPendingPayment = (booking: ReservationBooking) => isActiveBooking(booking) && (!booking.paymentStatus || booking.paymentStatus === 'pending');
const weekdayIndex = (date: Date) => (date.getDay() + 6) % 7;

export function ClassesPage() {
    const today = useMemo(() => startOfDay(new Date()), []);
    const todayKey = format(today, 'yyyy-MM-dd');
    const [currentDate, setCurrentDate] = useState(today);
    const [calendarMode, setCalendarMode] = useState<CalendarMode>('proximos');
    const [selectedDate, setSelectedDate] = useState(todayKey);
    const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
    const [selectedOccurrenceDate, setSelectedOccurrenceDate] = useState('');
    const [focusedSpot, setFocusedSpot] = useState<number | null>(null);
    const [reservationEntry, setReservationEntry] = useState<'card' | 'queue' | null>(null);
    const [showReservations, setShowReservations] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [classDocs, setClassDocs] = useState<ClassDoc[]>([]);
    const [bookings, setBookings] = useState<ReservationBooking[]>([]);
    const [members, setMembers] = useState<ReservationMember[]>([]);
    const [loaded, setLoaded] = useState({ classes: false, bookings: false, members: false });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [usingDemoData, setUsingDemoData] = useState(false);
    const [showInactive, setShowInactive] = useState(false);
    const [retry, setRetry] = useState(0);

    useEffect(() => {
        setLoaded({ classes: false, bookings: false, members: false });
        setErrors({});
        const failure = (key: string) => () => setErrors((old) => ({ ...old, [key]: `No se pudieron cargar ${key === 'classes' ? 'las clases' : key === 'bookings' ? 'las reservas' : 'los miembros'}. Revisa tu conexión y permisos.` }));
        const success = (key: 'classes' | 'bookings' | 'members') => {
            setLoaded((old) => ({ ...old, [key]: true }));
            setErrors((old) => { const next = { ...old }; delete next[key]; return next; });
        };
        const stopClasses = onSnapshot(query(collection(db, 'classes')), (snapshot) => {
            setClassDocs(snapshot.docs.map((item) => normalizeClass(item.data(), item.id))); success('classes');
        }, failure('classes'));
        const stopBookings = onSnapshot(query(collection(db, 'bookings')), (snapshot) => {
            setBookings(snapshot.docs.map((item) => ({ ...item.data(), id: item.id } as ReservationBooking))); success('bookings');
        }, failure('bookings'));
        const stopMembers = onSnapshot(query(collection(db, 'members')), (snapshot) => {
            setMembers(snapshot.docs.map((item) => ({ id: item.id, name: item.data().name || 'Sin nombre', phone: item.data().phone || '' }))); success('members');
        }, failure('members'));
        return () => { stopClasses(); stopBookings(); stopMembers(); };
    }, [retry]);

    const rangeStart = calendarMode === 'proximos'
        ? startOfDay(currentDate)
        : startOfWeek(currentDate, { weekStartsOn: 1 });
    const visibleDays = useMemo(
        () => Array.from({ length: 7 }, (_, index) => addDays(rangeStart, index)),
        [rangeStart.getTime()]
    );
    const sourceClasses = usingDemoData ? demoClasses : classDocs;
    const classes = sourceClasses
        .filter((item) => showInactive || item.status !== 'inactive')
        .sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
    const activeClasses = classes.filter((item) => item.status === 'active');
    const selectedClass = sourceClasses.find((item) => item.id === selectedClassId);

    const occurrenceBookingsMap = useMemo(() => {
        const map = new Map<string, ReservationBooking[]>();
        bookings.filter((booking) => isActiveBooking(booking) && Boolean(booking.date)).forEach((booking) => {
            const key = `${booking.classId}_${booking.date}`;
            map.set(key, [...(map.get(key) ?? []), booking]);
        });
        return map;
    }, [bookings]);

    const pendingPayments = useMemo(() => bookings
        .filter((booking) => isPendingPayment(booking) && Boolean(booking.date))
        .map((booking) => ({ booking, classItem: classDocs.find((item) => item.id === booking.classId) }))
        .filter((item): item is { booking: ReservationBooking & { date: string }; classItem: ClassDoc } => Boolean(item.classItem && item.booking.date))
        .sort((a, b) => `${a.booking.date}T${a.classItem.time}`.localeCompare(`${b.booking.date}T${b.classItem.time}`)),
    [bookings, classDocs]);

    const legacyCount = bookings.filter((booking) => !booking.date && isActiveBooking(booking)).length;
    const getOccurrenceBookings = (item: ClassDoc, date: string) => usingDemoData ? [] : (occurrenceBookingsMap.get(`${item.id}_${date}`) ?? []);
    const visibleOccurrences = visibleDays.flatMap((day) => {
        const dateKey = format(day, 'yyyy-MM-dd');
        return activeClasses
            .filter((item) => item.day === weekdayIndex(day))
            .map((item) => ({ item, dateKey, bookings: getOccurrenceBookings(item, dateKey) }));
    });
    const totalCapacity = visibleOccurrences.reduce((sum, occurrence) => sum + Math.min(21, occurrence.item.capacity), 0);
    const totalBookings = visibleOccurrences.reduce((sum, occurrence) => sum + occurrence.bookings.length, 0);
    const pendingInRange = visibleOccurrences.reduce((sum, occurrence) => sum + occurrence.bookings.filter(isPendingPayment).length, 0);
    const nextActiveDate = visibleDays.find((day) =>
        format(day, 'yyyy-MM-dd') >= todayKey && activeClasses.some((item) => item.day === weekdayIndex(day))
    );
    const nextActiveDateKey = nextActiveDate ? format(nextActiveDate, 'yyyy-MM-dd') : '';
    const activeSelectedDate = visibleDays.some((day) => format(day, 'yyyy-MM-dd') === selectedDate)
        ? selectedDate
        : (nextActiveDateKey || format(visibleDays[0], 'yyyy-MM-dd'));
    const ready = usingDemoData || (loaded.classes && loaded.bookings && loaded.members && !Object.keys(errors).length);

    const closeEditor = () => {
        setSelectedClassId(null);
        setSelectedOccurrenceDate('');
        setFocusedSpot(null);
        setReservationEntry(null);
        setShowReservations(false);
    };
    const openClass = (item: ClassDoc, date: Date) => {
        setSelectedClassId(item.id);
        setSelectedOccurrenceDate(format(date, 'yyyy-MM-dd'));
        setFocusedSpot(null);
        setReservationEntry('card');
        setShowReservations(false);
    };
    const reviewPendingPayment = (booking: ReservationBooking, classItem: ClassDoc) => {
        if (!booking.date) return;
        setCurrentDate(parseISO(booking.date));
        setSelectedDate(booking.date);
        setSelectedClassId(classItem.id);
        setSelectedOccurrenceDate(booking.date);
        setFocusedSpot(Number(booking.spotNumber) || null);
        setReservationEntry('queue');
        setShowReservations(true);
    };
    const chooseMode = (mode: CalendarMode) => {
        setCalendarMode(mode);
        if (mode === 'proximos') {
            setCurrentDate(today);
            setSelectedDate(nextActiveDateKey || todayKey);
        } else if (mode === 'dia') {
            setSelectedDate(nextActiveDateKey || activeSelectedDate);
        }
    };
    const returnToToday = () => {
        setCalendarMode('proximos');
        setCurrentDate(today);
        setSelectedDate(nextActiveDateKey || todayKey);
    };

    const rangeLabel = `${format(visibleDays[0], 'd MMM', { locale: es })} – ${format(visibleDays[6], 'd MMM yyyy', { locale: es })}`;
    const statsLabel = calendarMode === 'proximos' ? 'próximos 7 días' : 'período';

    return <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
            <div><h1 className="text-3xl font-bold text-white">Clases</h1><p className="mt-1 text-sm text-neutral-400">Pagos pendientes, próximas clases y reservas por fecha en un mismo lugar.</p></div>
            <Button disabled={!ready || usingDemoData} onClick={() => setShowCreateModal(true)} className="bg-green-600 hover:bg-green-700"><Plus className="mr-2 h-4 w-4" />Nueva clase</Button>
        </div>

        {Object.keys(errors).length > 0 && <div role="alert" className="space-y-2 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">{Object.entries(errors).map(([key, message]) => <p key={key}>{message}</p>)}<p>No se muestran datos de demostración como sustituto de un error.</p><Button variant="outline" onClick={() => setRetry((value) => value + 1)}>Reintentar</Button></div>}
        {!ready && !Object.keys(errors).length && <p role="status" className="text-sm text-neutral-400">Cargando clases y reservas…</p>}
        {!usingDemoData && loaded.bookings && legacyCount > 0 && <div role="status" className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-300">Hay {legacyCount} reserva(s) antiguas sin fecha. No se incluyen en los mapas ni en los conteos por fecha. Revísalas manualmente antes de cambiar horarios; no se migran automáticamente.</div>}

        <div className="flex flex-wrap items-center gap-4 text-sm text-neutral-400">
            <label className="flex items-center gap-2"><input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} className="accent-green-600" />Mostrar inactivas</label>
            <Button variant="ghost" onClick={() => { closeEditor(); setUsingDemoData((old) => !old); }}>{usingDemoData ? 'Salir de demostración' : 'Ver demostración'}</Button>
            {usingDemoData && <span className="text-amber-300">Demostración explícita · solo lectura · sin reservas reales</span>}
        </div>

        {ready && <>
            {!usingDemoData && pendingPayments.length > 0 && (
                <section aria-labelledby="pending-payments-title" className="overflow-hidden rounded-xl border border-amber-400/25 bg-amber-400/[0.06]">
                    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-400/15 px-4 py-4 sm:px-5">
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-amber-400/10 p-2 text-amber-300"><AlertTriangle className="h-5 w-5" /></div>
                            <div>
                                <h2 id="pending-payments-title" className="font-semibold text-white">Pagos por verificar</h2>
                                <p className="text-xs text-neutral-400">Comprueba el código en Yape o Plin antes de confirmar.</p>
                            </div>
                        </div>
                        <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-200">{pendingPayments.length} pendiente{pendingPayments.length !== 1 ? 's' : ''}</span>
                    </header>
                    <div className="grid max-h-80 gap-3 overflow-y-auto p-4 lg:grid-cols-2">
                        {pendingPayments.map(({ booking, classItem }) => {
                            const member = members.find((item) => item.id === booking.memberId);
                            const name = booking.memberName || member?.name || 'Cliente';
                            return <article key={booking.id} className="rounded-lg border border-white/10 bg-neutral-900 p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate font-semibold text-white">{name}</p>
                                        <p className="mt-1 text-sm text-neutral-300">{classItem.name} · {classItem.time}</p>
                                    </div>
                                    <span className="rounded-md bg-amber-400/10 px-2 py-1 font-mono text-xs font-bold text-amber-200">{booking.operationCode || 'Sin código'}</span>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-neutral-400">
                                    <span className="flex items-center gap-1.5 capitalize"><CalendarClock className="h-3.5 w-3.5 text-amber-300" />{format(parseISO(booking.date), 'EEE d MMM', { locale: es })}</span>
                                    <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-amber-300" />Ubicación {String(booking.spotNumber || 0).padStart(2, '0')}</span>
                                    <span className="flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5" />{booking.paymentMethod || 'Método no indicado'}</span>
                                    <span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />S/ {Number(booking.amount || classItem.price || 0).toFixed(2)}</span>
                                </div>
                                <Button type="button" onClick={() => reviewPendingPayment(booking, classItem)} className="mt-4 w-full bg-amber-400 font-semibold text-neutral-950 hover:bg-amber-300">Revisar y confirmar</Button>
                            </article>;
                        })}
                    </div>
                </section>
            )}

            {!usingDemoData && pendingPayments.length === 0 && (
                <div className="flex items-center gap-3 rounded-lg border border-emerald-500/15 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />No hay pagos de clases pendientes de verificar.
                </div>
            )}

            {!classes.length && <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-6 text-neutral-400">No hay clases {showInactive ? 'registradas' : 'activas'}. Crea una clase o muestra las inactivas para reactivarlas.</div>}

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[
                [`Clases / ${statsLabel}`, visibleOccurrences.length],
                [`Reservas / ${statsLabel}`, totalBookings],
                ['Pagos pendientes', pendingInRange],
                ['Ocupación', `${totalCapacity ? Math.round(totalBookings / totalCapacity * 100) : 0}%`],
            ].map(([label, value]) => <div key={label} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4"><p className="text-xs text-neutral-400">{label}</p><p className={`mt-2 text-2xl font-semibold tabular-nums ${label === 'Pagos pendientes' && Number(value) > 0 ? 'text-amber-300' : 'text-white'}`}>{value}</p></div>)}</div>

            <section className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-800 p-4">
                    <div className="flex flex-wrap gap-1 rounded-md bg-neutral-950 p-1">
                        {([
                            ['proximos', 'Próximos 7 días'],
                            ['semana', 'Semana'],
                            ['dia', 'Día'],
                        ] as Array<[CalendarMode, string]>).map(([mode, label]) => <Button key={mode} variant="ghost" size="sm" aria-pressed={calendarMode === mode} className={calendarMode === mode ? 'bg-neutral-800 text-white' : 'text-neutral-400'} onClick={() => chooseMode(mode)}>{label}</Button>)}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={returnToToday} className="text-green-300">Hoy</Button>
                        <Button variant="ghost" size="icon" aria-label="Período anterior" onClick={() => setCurrentDate(addDays(currentDate, -7))}><ChevronLeft className="h-4 w-4" /></Button>
                        <span className="min-w-36 text-center text-sm text-neutral-300">{rangeLabel}</span>
                        <Button variant="ghost" size="icon" aria-label="Período siguiente" onClick={() => setCurrentDate(addDays(currentDate, 7))}><ChevronRight className="h-4 w-4" /></Button>
                    </div>
                </div>

                {calendarMode === 'dia' && <div className="flex gap-2 overflow-x-auto border-b border-neutral-800 p-4">{visibleDays.map((day) => {
                    const key = format(day, 'yyyy-MM-dd');
                    return <Button key={key} variant="ghost" aria-pressed={activeSelectedDate === key} onClick={() => setSelectedDate(key)} className={activeSelectedDate === key ? 'bg-green-700 text-white' : 'text-neutral-400'}>{classDays[weekdayIndex(day)].slice(0, 3)} {format(day, 'd')}</Button>;
                })}</div>}

                <div className="overflow-x-auto"><div className={calendarMode !== 'dia' ? 'grid min-w-[850px] grid-cols-7 gap-3 p-4' : 'p-4'}>
                    {visibleDays.map((day) => {
                        const dateKey = format(day, 'yyyy-MM-dd');
                        if (calendarMode === 'dia' && activeSelectedDate !== dateKey) return null;
                        const dayClasses = classes.filter((item) => item.day === weekdayIndex(day));
                        const isToday = dateKey === todayKey;
                        const isNextActive = dateKey === nextActiveDateKey && !isToday;
                        return <div key={dateKey} className="space-y-3">
                            <div className={`rounded-md border p-3 ${isToday ? 'border-green-500/30 bg-green-700/20 text-green-300' : isNextActive ? 'border-green-500/20 bg-green-500/10 text-green-200' : 'border-transparent bg-neutral-800/60 text-neutral-300'}`}>
                                <div className="flex items-center justify-between gap-2"><p className="text-xs">{classDays[weekdayIndex(day)]}</p>{isToday && <span className="text-[9px] font-bold uppercase tracking-wide">Hoy</span>}{isNextActive && <span className="text-[9px] font-bold uppercase tracking-wide">Próxima</span>}</div>
                                <p className="text-xl font-semibold tabular-nums">{format(day, 'd')}</p>
                            </div>
                            {dayClasses.length ? dayClasses.map((item) => {
                                const occurrence = getOccurrenceBookings(item, dateKey);
                                const pending = occurrence.filter(isPendingPayment).length;
                                const confirmed = occurrence.length - pending;
                                const capacity = Math.min(21, item.capacity);
                                const free = Math.max(0, capacity - occurrence.length);
                                return <button key={item.id} type="button" onClick={() => openClass(item, day)} className={`w-full rounded-md border border-neutral-700/50 border-l-2 ${pending > 0 ? 'border-l-amber-400 bg-amber-400/[0.06]' : 'border-l-green-600 bg-neutral-800/50'} p-3 text-left transition-colors hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-green-600`}>
                                    <div className="flex items-start justify-between gap-2"><p className="font-medium text-white">{item.name}</p>{pending > 0 && <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[9px] font-bold text-amber-200">{pending} pendiente{pending !== 1 ? 's' : ''}</span>}</div>
                                    <p className="mt-1 text-sm tabular-nums text-neutral-300">{item.time} · {item.duration} min</p>
                                    <p className="mt-1 text-xs text-neutral-400">{item.instructor}</p>
                                    <p className="mt-3 text-xs text-green-300">{free} libres · {confirmed} confirmada{confirmed !== 1 ? 's' : ''}</p>
                                    <p className="mt-1 text-[11px] text-neutral-500">{occurrence.length}/{capacity} reservadas · S/ {(item.price ?? 6).toFixed(2)}</p>
                                    {item.status !== 'active' && <p className="mt-2 text-xs text-amber-300">Inactiva · historial disponible</p>}
                                    <p className="mt-2 text-xs text-neutral-500">Detalles / reservas →</p>
                                </button>;
                            }) : <p className="py-6 text-center text-xs text-neutral-500">Sin clases</p>}
                        </div>;
                    })}
                </div></div>
            </section>
        </>}

        {selectedClass && selectedOccurrenceDate && ready && (showReservations
            ? <ClassReservationDialog
                key={`${selectedClass.id}-${selectedOccurrenceDate}-${focusedSpot || 'map'}`}
                classItem={selectedClass}
                occurrenceDate={selectedOccurrenceDate}
                bookings={usingDemoData ? [] : occurrenceBookingsMap.get(`${selectedClass.id}_${selectedOccurrenceDate}`) ?? []}
                members={usingDemoData ? [] : members}
                initialSpot={focusedSpot}
                backLabel={reservationEntry === 'queue' ? 'Cerrar' : '← Datos de clase'}
                readOnly={usingDemoData}
                onClose={() => {
                    if (reservationEntry === 'queue') closeEditor();
                    else { setShowReservations(false); setFocusedSpot(null); }
                }}
            />
            : <ClassAdminDialog key={selectedClass.id} classItem={selectedClass} occurrenceDate={selectedOccurrenceDate} readOnly={usingDemoData} onReservations={() => { setReservationEntry('card'); setShowReservations(true); }} onClose={closeEditor} />)}
        {showCreateModal && <ClassAdminDialog onClose={() => setShowCreateModal(false)} />}
    </div>;
}
