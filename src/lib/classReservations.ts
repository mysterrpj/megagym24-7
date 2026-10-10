import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export interface PublicScheduleClass {
    id: string;
    name: string;
    instructor: string;
    time: string;
    duration: number;
    capacity: number;
    price: number;
    availableSpots: number;
    bookingOpen: boolean;
}
export interface PublicSchedule {
    days: Array<{ date: string; classes: PublicScheduleClass[] }>;
}
export interface PublicSession {
    classItem: { id: string; name: string; instructor: string; time: string; duration: number; capacity: number; price: number; paymentInstructions: string };
    date: string;
    seats: { spotNumber: number; status: 'available' | 'pending' | 'reserved' | 'blocked' }[];
    bookingOpen: boolean;
}
export interface PublicReceipt {
    bookingId: string;
    status: string;
    paymentStatus: string;
    spotNumber: number;
    date: string;
    className: string;
    time: string;
}

export async function reservationCall<T>(name: string, data: unknown): Promise<T> {
    const result = await httpsCallable<unknown, T>(functions, name)(data);
    return result.data;
}

// The backend is the single source of truth for wording: it already answers in Spanish
// through its own translation table. This only replaces transport-level failures, where
// the SDK hands us a bare code word instead of a sentence a gym client could read.
const bareCodes = /^(internal|unknown|unavailable|deadline-exceeded|not-found|permission-denied|already-exists|resource-exhausted|invalid-argument|failed-precondition|cancelled|aborted|out-of-range|unauthenticated|data-loss|failed to fetch|network|load failed|network-request-failed|ok)$/i;

export function reservationError(error: unknown): string {
    const raw = (error instanceof Error ? error.message : '').trim();
    if (raw && !bareCodes.test(raw)) return raw;
    return 'No pudimos conectar con el servicio de reservas. Revisa tu conexión e inténtalo otra vez o consulta en recepción.';
}
