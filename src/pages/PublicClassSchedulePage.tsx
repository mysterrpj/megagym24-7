import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { CalendarX2, Loader2, RefreshCw } from 'lucide-react';
import { PublicSchedule, reservationCall, reservationError } from '@/lib/classReservations';

function firstReservationUrl(schedule: PublicSchedule) {
    const sessions = schedule.days.flatMap((day) => day.classes.map((classItem) => ({ day, classItem })));
    const target = sessions.find(({ classItem }) => classItem.bookingOpen) || sessions[0];
    return target ? `/reservar/clase/${encodeURIComponent(target.classItem.id)}?fecha=${target.day.date}` : '';
}

export function PublicClassSchedulePage() {
    const [destination, setDestination] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const schedule = await reservationCall<PublicSchedule>('getPublicClassSchedule', {});
            setDestination(firstReservationUrl(schedule));
        } catch (cause) {
            setError(reservationError(cause));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    if (destination) return <Navigate to={destination} replace />;

    return (
        <main lang="es" className="grid min-h-screen place-items-center bg-neutral-950 px-5 text-neutral-200">
            {loading ? (
                <div role="status" className="flex items-center gap-3 text-sm"><Loader2 className="h-5 w-5 animate-spin text-lime-300" />Preparando el salón…</div>
            ) : (
                <section className="max-w-sm text-center">
                    <CalendarX2 className="mx-auto h-8 w-8 text-neutral-500" />
                    <h1 className="mt-4 text-xl font-black text-white">No hay clases para reservar</h1>
                    <p role={error ? 'alert' : undefined} className="mt-2 text-sm leading-6 text-neutral-400">{error || 'Recepción todavía no publicó horarios para los próximos días.'}</p>
                    <button type="button" onClick={() => void load()} className="mx-auto mt-5 flex h-11 items-center justify-center gap-2 rounded-lg bg-lime-300 px-5 text-sm font-black text-neutral-950"><RefreshCw className="h-4 w-4" />Actualizar</button>
                </section>
            )}
        </main>
    );
}
