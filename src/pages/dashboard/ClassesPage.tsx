import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { addDays, format, startOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { db } from '@/lib/firebase';
import { ClassReservationDialog, type ReservationBooking, type ReservationMember } from '@/components/classes/ClassReservationDialog';
import { ClassAdminDialog, classDays, type AdminClass } from '@/components/classes/ClassAdminDialog';
import { Button } from '@/components/ui/button';

interface ClassDoc extends AdminClass { color: string }

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
        capacity: raw.capacity != null && Number.isFinite(Number(raw.capacity)) ? Number(raw.capacity) : 20,
        price: raw.price != null && Number.isFinite(Number(raw.price)) ? Number(raw.price) : 6,
        color: 'border-l-green-600', status: raw.status || 'active',
        publicBookingEnabled: raw.publicBookingEnabled === true,
        paymentInstructions: typeof raw.paymentInstructions === 'string' ? raw.paymentInstructions : '',
    };
}
const demoClasses: ClassDoc[] = [
    { id: 'demo-fullbody', name: 'FULLBODY · ejemplo', instructor: 'Coach demo', day: 0, time: '08:30', duration: 60, capacity: 20, price: 6, status: 'active', color: 'border-l-green-600', publicBookingEnabled: false },
    { id: 'demo-movilidad', name: 'Movilidad · ejemplo', instructor: 'Coach demo', day: 2, time: '18:00', duration: 45, capacity: 16, price: 0, status: 'active', color: 'border-l-green-600', publicBookingEnabled: false },
];

export function ClassesPage() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewMode, setViewMode] = useState<'semana' | 'dia'>('semana');
    const [selectedDay, setSelectedDay] = useState((new Date().getDay() + 6) % 7);
    const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
    const [selectedOccurrenceDate, setSelectedOccurrenceDate] = useState('');
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

    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
    const sourceClasses = usingDemoData ? demoClasses : classDocs;
    const classes = sourceClasses.filter((item) => showInactive || item.status !== 'inactive').sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
    const selectedClass = sourceClasses.find((item) => item.id === selectedClassId);
    const activeBooking = (booking: ReservationBooking) => !['cancelled', 'canceled'].includes(booking.status ?? 'confirmed');
    const occurrenceBookingsMap = useMemo(() => {
        const map = new Map<string, ReservationBooking[]>();
        bookings.filter((booking) => activeBooking(booking) && Boolean(booking.date)).forEach((booking) => {
            const key = `${booking.classId}_${booking.date}`;
            map.set(key, [...(map.get(key) ?? []), booking]);
        });
        return map;
    }, [bookings]);
    const legacyCount = bookings.filter((booking) => !booking.date && activeBooking(booking)).length;
    const count = (item: ClassDoc, date: string) => usingDemoData ? 0 : (occurrenceBookingsMap.get(`${item.id}_${date}`)?.length ?? 0);
    const currentClasses = classes.filter((item) => item.status === 'active');
    const totalCapacity = currentClasses.reduce((sum, item) => sum + Math.min(20, item.capacity), 0);
    const totalBookings = currentClasses.reduce((sum, item) => sum + count(item, format(weekDays[item.day], 'yyyy-MM-dd')), 0);
    const ready = usingDemoData || (loaded.classes && loaded.bookings && loaded.members && !Object.keys(errors).length);
    const closeEditor = () => { setSelectedClassId(null); setSelectedOccurrenceDate(''); setShowReservations(false); };
    const openClass = (item: ClassDoc, date: Date) => {
        setSelectedClassId(item.id); setSelectedOccurrenceDate(format(date, 'yyyy-MM-dd')); setShowReservations(false);
    };

    return <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
            <div><h1 className="text-3xl font-bold text-white">Clases</h1><p className="mt-1 text-sm text-neutral-400">Detalles, reservas por fecha y enlace público en un mismo lugar.</p></div>
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
            {!classes.length && <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-6 text-neutral-400">No hay clases {showInactive ? 'registradas' : 'activas'}. Crea una clase o muestra las inactivas para reactivarlas.</div>}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[
                ['Clases activas / semana', currentClasses.length], ['Reservas / semana', totalBookings], ['Lugares / semana', totalCapacity], ['Ocupación', `${totalCapacity ? Math.round(totalBookings / totalCapacity * 100) : 0}%`],
            ].map(([label, value]) => <div key={label} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4"><p className="text-xs text-neutral-400">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums text-white">{value}</p></div>)}</div>
            <section className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-800 p-4">
                    <div className="flex gap-1 rounded-md bg-neutral-950 p-1">{(['semana', 'dia'] as const).map((mode) => <Button key={mode} variant="ghost" size="sm" aria-pressed={viewMode === mode} className={viewMode === mode ? 'bg-neutral-800 text-white' : 'text-neutral-400'} onClick={() => setViewMode(mode)}>{mode === 'semana' ? 'Semana' : 'Día'}</Button>)}</div>
                    <div className="flex items-center gap-3"><Button variant="ghost" size="icon" aria-label="Semana anterior" onClick={() => setCurrentDate(addDays(currentDate, -7))}><ChevronLeft className="h-4 w-4" /></Button><span className="text-sm text-neutral-300">{format(weekStart, 'd MMM', { locale: es })} – {format(addDays(weekStart, 6), 'd MMM yyyy', { locale: es })}</span><Button variant="ghost" size="icon" aria-label="Semana siguiente" onClick={() => setCurrentDate(addDays(currentDate, 7))}><ChevronRight className="h-4 w-4" /></Button></div>
                </div>
                {viewMode === 'dia' && <div className="flex gap-2 overflow-x-auto p-4">{weekDays.map((day, index) => <Button key={index} variant="ghost" aria-pressed={selectedDay === index} onClick={() => setSelectedDay(index)} className={selectedDay === index ? 'bg-green-700 text-white' : 'text-neutral-400'}>{classDays[index].slice(0, 3)} {format(day, 'd')}</Button>)}</div>}
                <div className="overflow-x-auto"><div className={viewMode === 'semana' ? 'grid min-w-[850px] grid-cols-7 gap-3 p-4' : 'p-4'}>
                    {weekDays.map((day, index) => {
                        if (viewMode === 'dia' && selectedDay !== index) return null;
                        const dayClasses = classes.filter((item) => item.day === index);
                        const dateKey = format(day, 'yyyy-MM-dd');
                        return <div key={dateKey} className="space-y-3"><div className={`rounded-md p-3 ${dateKey === format(new Date(), 'yyyy-MM-dd') ? 'bg-green-700/20 text-green-300' : 'bg-neutral-800/60 text-neutral-300'}`}><p className="text-xs">{classDays[index]}</p><p className="text-xl font-semibold tabular-nums">{format(day, 'd')}</p></div>
                            {dayClasses.length ? dayClasses.map((item) => <button key={item.id} type="button" onClick={() => openClass(item, day)} className="w-full rounded-md border border-neutral-700/50 border-l-2 border-l-green-600 bg-neutral-800/50 p-3 text-left transition-colors hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-green-600"><p className="font-medium text-white">{item.name}</p><p className="mt-1 text-sm tabular-nums text-neutral-300">{item.time} · {item.duration} min</p><p className="mt-1 text-xs text-neutral-400">{item.instructor}</p><p className="mt-3 text-xs text-green-300">{count(item, dateKey)}/{Math.min(20, item.capacity)} lugares · S/ {(item.price ?? 6).toFixed(2)}</p>{item.status !== 'active' && <p className="mt-2 text-xs text-amber-300">Inactiva · historial disponible</p>}<p className="mt-2 text-xs text-neutral-500">Detalles / editar →</p></button>) : <p className="py-6 text-center text-xs text-neutral-500">Sin clases</p>}
                        </div>;
                    })}
                </div></div>
            </section>
        </>}
        {selectedClass && selectedOccurrenceDate && ready && (showReservations ? <ClassReservationDialog classItem={selectedClass} occurrenceDate={selectedOccurrenceDate} bookings={usingDemoData ? [] : occurrenceBookingsMap.get(`${selectedClass.id}_${selectedOccurrenceDate}`) ?? []} members={usingDemoData ? [] : members} readOnly={usingDemoData} onClose={() => setShowReservations(false)} /> : <ClassAdminDialog key={selectedClass.id} classItem={selectedClass} occurrenceDate={selectedOccurrenceDate} readOnly={usingDemoData} onReservations={() => setShowReservations(true)} onClose={closeEditor} />)}
        {showCreateModal && <ClassAdminDialog onClose={() => setShowCreateModal(false)} />}
    </div>;
}
