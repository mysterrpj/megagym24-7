import { useEffect, useMemo, useState } from 'react';
import {
    Check,
    CheckCircle2,
    Clock3,
    DoorOpen,
    Loader2,
    MessageCircle,
    Search,
    Trash2,
    UserRound,
    Users,
    X,
} from 'lucide-react';
import { reservationCall, reservationError } from '@/lib/classReservations';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

import { Button } from '@/components/ui/button';

export interface ReservationClass {
    id: string;
    name: string;
    instructor: string;
    time: string;
    duration: number;
    capacity: number;
    price?: number;
}

export interface ReservationMember {
    id: string;
    name: string;
    phone: string;
}

export interface ReservationBooking {
    id: string;
    memberId: string;
    classId: string;
    date?: string;
    spotNumber?: number;
    memberName?: string;
    phone?: string;
    status?: string;
    paymentStatus?: 'paid' | 'membership' | 'pending';
    paymentMethod?: string;
    amount?: number;
    checkedIn?: boolean;
    operationCode?: string;
    source?: string;
}

interface ClassReservationDialogProps {
    classItem: ReservationClass;
    occurrenceDate: string;
    bookings: ReservationBooking[];
    members: ReservationMember[];
    initialSpot?: number | null;
    backLabel?: string;
    readOnly?: boolean;
    onClose: () => void;
}

const ROOM_CAPACITY = 21;
const FOUR_SEAT_ROWS = [[3, 4, 5, 6], [7, 8, 9, 10], [14, 15, 16, 17], [18, 19, 20, 21]];

const paymentLabels: Record<string, string> = {
    paid: 'Pagado',
    membership: 'Incluido en membresía',
    pending: 'Pago pendiente',
};

const paymentBadgeClasses: Record<string, string> = {
    paid: 'bg-emerald-500/15 text-emerald-300',
    membership: 'bg-blue-500/15 text-blue-300',
    pending: 'bg-amber-500/15 text-amber-300',
};

function normalizePhone(phone: string) {
    const digits = phone.replace(/\D/g, '');
    if (!digits) return '';
    return digits.startsWith('51') ? digits : `51${digits}`;
}

function buildSeatAssignments(bookings: ReservationBooking[]) {
    const assignments = new Map<number, ReservationBooking>();
    bookings.filter((booking) => !['cancelled', 'canceled'].includes(booking.status || '')).forEach((booking) => {
        const spot = Number(booking.spotNumber);
        if (Number.isInteger(spot) && spot >= 1 && spot <= ROOM_CAPACITY && !assignments.has(spot)) {
            assignments.set(spot, booking);
        }
    });
    return assignments;
}

export function ClassReservationDialog({
    classItem,
    occurrenceDate,
    bookings,
    members,
    initialSpot = null,
    backLabel = '← Datos de clase',
    readOnly = false,
    onClose,
}: ClassReservationDialogProps) {
    const [selectedSpot, setSelectedSpot] = useState<number | null>(initialSpot);
    const [memberSearch, setMemberSearch] = useState('');
    const [selectedMemberId, setSelectedMemberId] = useState('');
    const [externalName, setExternalName] = useState('');
    const [externalPhone, setExternalPhone] = useState('');
    const [paymentStatus, setPaymentStatus] = useState<'paid' | 'membership' | 'pending'>('paid');
    const [paymentMethod, setPaymentMethod] = useState('Yape / Plin');
    const [amount, setAmount] = useState(String(classItem.price || 6));
    const [saving, setSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const effectiveCapacity = Math.min(ROOM_CAPACITY, Math.max(1, classItem.capacity || ROOM_CAPACITY));

    useEffect(() => {
        setSelectedSpot(initialSpot);
    }, [initialSpot, occurrenceDate, classItem.id]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !saving) onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, saving]);

    const relevantBookings = useMemo(
        () => bookings.filter((booking) =>
            booking.classId === classItem.id
            && !['cancelled', 'canceled'].includes(booking.status || '')
            && (!booking.date || booking.date === occurrenceDate)
        ),
        [bookings, classItem.id, occurrenceDate]
    );

    const seatAssignments = useMemo(() => buildSeatAssignments(relevantBookings), [relevantBookings]);
    const selectedBooking = selectedSpot ? seatAssignments.get(selectedSpot) : undefined;
    const selectedBookingMember = selectedBooking
        ? members.find((member) => member.id === selectedBooking.memberId)
        : undefined;
    const selectedBookingName = selectedBooking?.memberName || selectedBookingMember?.name || 'Alumna registrada';
    const selectedBookingPhone = selectedBooking?.phone || selectedBookingMember?.phone || '';
    const selectedMember = members.find((member) => member.id === selectedMemberId);
    const filteredMembers = members
        .filter((member) => {
            const query = memberSearch.trim().toLowerCase();
            if (!query) return true;
            return member.name.toLowerCase().includes(query) || member.phone.includes(query);
        })
        .slice(0, 7);

    const paidCount = relevantBookings.filter((booking) => booking.paymentStatus === 'paid' || booking.paymentStatus === 'membership').length;
    const pendingCount = relevantBookings.filter((booking) => !booking.paymentStatus || booking.paymentStatus === 'pending').length;
    const checkedInCount = relevantBookings.filter((booking) => booking.checkedIn).length;
    const displayDate = format(parseISO(occurrenceDate), "EEEE d 'de' MMMM", { locale: es });

    const resetForm = () => {
        setMemberSearch('');
        setSelectedMemberId('');
        setExternalName('');
        setExternalPhone('');
        setPaymentStatus('paid');
        setPaymentMethod('Yape / Plin');
        setAmount(String(classItem.price || 6));
        setErrorMessage('');
    };

    const handleSpotSelection = (spot: number) => {
        if (spot > effectiveCapacity && !seatAssignments.has(spot)) return;
        setSelectedSpot(spot);
        resetForm();
    };

    const handleSaveReservation = async () => {
        if (!selectedSpot || selectedSpot > effectiveCapacity || selectedBooking || saving || readOnly) return;

        const memberName = selectedMember?.name || externalName.trim();
        const phone = selectedMember?.phone || externalPhone.trim();
        if (!memberName || !phone) {
            setErrorMessage('Selecciona una alumna o completa su nombre y teléfono.');
            return;
        }

        const duplicateMember = relevantBookings.some((booking) =>
            selectedMemberId
                ? booking.memberId === selectedMemberId
                : normalizePhone(booking.phone || '') === normalizePhone(phone)
        );
        if (duplicateMember) {
            setErrorMessage('Esta alumna ya tiene una ubicación reservada en esta clase.');
            return;
        }

        setSaving(true);
        setErrorMessage('');
        try {
            await reservationCall('adminClassReservation', {
                action: 'create', classId: classItem.id, date: occurrenceDate,
                spotNumber: selectedSpot, memberId: selectedMember?.id || '',
                name: memberName, phone, paymentStatus,
                paymentMethod: paymentStatus === 'membership' ? 'Membresía' : paymentMethod,
                amount: paymentStatus === 'membership' ? 0 : Number(amount),
            });
            resetForm();
        } catch (error) {
            setErrorMessage(reservationError(error));
        } finally {
            setSaving(false);
        }
    };

    const handleUpdateBooking = async (booking: ReservationBooking, changes: Record<string, unknown>) => {
        if (readOnly || saving) return;
        setSaving(true);
        setErrorMessage('');
        try {
            if (changes.paymentStatus === 'paid' && !window.confirm('¿Verificaste el abono y el código de operación? Esta acción confirma el pago de la reserva.')) return;
            await reservationCall('adminClassReservation', {
                action: changes.paymentStatus === 'paid' ? 'confirm' : 'attendance',
                bookingId: booking.id,
                ...(typeof changes.checkedIn === 'boolean' ? { checkedIn: changes.checkedIn } : {}),
            });
        } catch (error) {
            console.error('Error updating class reservation:', error);
            setErrorMessage('No se pudo actualizar la reserva.');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteBooking = async (booking: ReservationBooking) => {
        if (readOnly || saving) return;
        if (!window.confirm(`¿Liberar la ubicación ${selectedSpot} de ${booking.memberName || 'esta alumna'}?`)) return;

        setSaving(true);
        setErrorMessage('');
        try {
            await reservationCall('adminClassReservation', { action: 'cancel', bookingId: booking.id });
            setSelectedSpot(null);
        } catch (error) {
            console.error('Error cancelling class reservation:', error);
            setErrorMessage('No se pudo cancelar la reserva.');
        } finally {
            setSaving(false);
        }
    };

    const sendWhatsAppConfirmation = (booking: ReservationBooking) => {
        const memberRecord = members.find((member) => member.id === booking.memberId);
        const phone = normalizePhone(booking.phone || memberRecord?.phone || '');
        if (!phone) return;
        const message = [
            booking.paymentStatus === 'paid' || booking.paymentStatus === 'membership' ? '✅ Reserva confirmada' : '⏳ Solicitud de reserva pendiente de verificar pago',
            `${classItem.name} — ${displayDate}`,
            `Hora: ${classItem.time}`,
            `Ubicación: ${String(selectedSpot).padStart(2, '0')}`,
            `Profesora: ${classItem.instructor}`,
            `Estado: ${paymentLabels[booking.paymentStatus || 'pending']}`,
            '',
            'Tu número queda reservado para ti. Preséntate 5 minutos antes.',
        ].join('\n');
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    };

    function renderSeat(spot: number) {
        const booking = seatAssignments.get(spot);
        const bookingMember = booking ? members.find((member) => member.id === booking.memberId) : undefined;
        const bookingName = booking?.memberName || bookingMember?.name || 'Reservado';
        const isSelected = selectedSpot === spot;
        const isPending = Boolean(booking && (!booking.paymentStatus || booking.paymentStatus === 'pending'));
        const isCheckedIn = booking?.checkedIn;
        const isBlocked = spot > effectiveCapacity && !booking;

        return <button
            type="button"
            key={spot}
            onClick={() => handleSpotSelection(spot)}
            disabled={isBlocked}
            className={`group relative aspect-square min-h-12 rounded-xl border text-center transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-neutral-950 ${
                isBlocked
                    ? 'cursor-not-allowed border-white/5 bg-neutral-900/40 text-neutral-700'
                    : isSelected
                        ? 'border-emerald-400 bg-emerald-400 text-neutral-950 shadow-[0_0_0_3px_rgba(52,211,153,0.12)]'
                        : isCheckedIn
                        ? 'border-blue-400/40 bg-blue-400/15 text-blue-200 hover:bg-blue-400/20'
                        : isPending
                            ? 'border-amber-400/40 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20'
                            : booking
                                ? 'border-rose-400/30 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20'
                                : 'border-white/10 bg-neutral-800/70 text-neutral-300 hover:border-emerald-400/50 hover:bg-emerald-400/10 hover:text-emerald-300'
            }`}
            title={isBlocked ? `Ubicación ${spot} fuera de la capacidad configurada` : booking ? `${bookingName} · ubicación ${spot}` : `Ubicación ${spot} disponible`}
        >
            <span className="block text-base font-black tabular-nums sm:text-lg">{String(spot).padStart(2, '0')}</span>
            <span className={`mt-0.5 hidden truncate px-1 text-[9px] font-medium sm:block ${isSelected ? 'text-neutral-800' : 'text-current opacity-70'}`}>
                {isBlocked ? 'Bloqueado' : booking ? bookingName.split(' ')[0] : 'Libre'}
            </span>
            {isCheckedIn && <Check className={`absolute right-1.5 top-1.5 h-3 w-3 ${isSelected ? 'text-neutral-950' : 'text-blue-300'}`} />}
        </button>;
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-6" onClick={() => { if (!saving) onClose(); }}>
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="class-reservation-title"
                className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <header className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-6">
                    <div>
                        <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
                            <span className="h-2 w-2 rounded-full bg-emerald-400" />
                            Plano de reservas
                        </div>
                        <h2 id="class-reservation-title" className="text-xl font-bold text-white sm:text-2xl">{classItem.name}</h2>
                        <p className="mt-1 text-sm capitalize text-neutral-400">
                            {displayDate} · {classItem.time} · {classItem.instructor}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-white/5 hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
                        aria-label={backLabel.replace('← ', '')}
                    >
                        <span className="text-xs">{backLabel}</span>
                    </button>
                </header>

                <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)] lg:overflow-hidden">
                    <section className="overflow-y-auto p-5 sm:p-6">
                        <div className="mb-5 grid grid-cols-3 gap-2">
                            <div className="rounded-xl border border-white/10 bg-neutral-950/50 p-3">
                                <p className="text-xs text-neutral-500">Reservadas</p>
                                <p className="mt-1 text-xl font-bold text-white">{relevantBookings.length}<span className="text-sm font-medium text-neutral-500">/{effectiveCapacity}</span></p>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-neutral-950/50 p-3">
                                <p className="text-xs text-neutral-500">Confirmadas</p>
                                <p className="mt-1 text-xl font-bold text-emerald-400">{paidCount}</p>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-neutral-950/50 p-3">
                                <p className="text-xs text-neutral-500">Asistieron</p>
                                <p className="mt-1 text-xl font-bold text-blue-400">{checkedInCount}</p>
                            </div>
                        </div>

                        <div className="mx-auto max-w-2xl rounded-2xl border border-white/10 bg-neutral-950/50 p-4 sm:p-6">
                            <div className="space-y-3 sm:space-y-4" aria-label="Mapa físico de 21 ubicaciones">
                                <div className="grid grid-cols-[minmax(0,1fr)_minmax(7rem,2fr)_minmax(0,1fr)] items-center gap-3 sm:gap-4">
                                    {renderSeat(1)}
                                    <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-2 py-2 text-center">
                                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400">Tarima</p>
                                        <p className="mt-0.5 text-[10px] text-neutral-400 sm:text-xs">Instructora · Espejo</p>
                                    </div>
                                    {renderSeat(2)}
                                </div>
                                {FOUR_SEAT_ROWS.slice(0, 2).map((row) => <div key={row[0]} className="grid grid-cols-4 gap-3 sm:gap-4">{row.map(renderSeat)}</div>)}
                                <div className="mx-auto grid w-3/4 grid-cols-3 gap-3 sm:gap-4">{[11, 12, 13].map(renderSeat)}</div>
                                {FOUR_SEAT_ROWS.slice(2).map((row) => <div key={row[0]} className="grid grid-cols-4 gap-3 sm:gap-4">{row.map(renderSeat)}</div>)}
                            </div>

                            <div className="mt-7 flex items-center justify-center gap-2 text-xs text-neutral-500">
                                <DoorOpen className="h-4 w-4" />
                                Entrada del salón
                            </div>
                        </div>

                        <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-neutral-400">
                            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm border border-white/15 bg-neutral-800" />Disponible</span>
                            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-rose-400/70" />Reservada</span>
                            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-amber-400/70" />Pago pendiente</span>
                            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-blue-400/70" />Ya llegó</span>
                            {effectiveCapacity < ROOM_CAPACITY && (
                                <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-neutral-800" />Bloqueada</span>
                            )}
                        </div>
                    </section>

                    <aside className="border-t border-white/10 bg-neutral-950/30 p-5 sm:p-6 lg:overflow-y-auto lg:border-l lg:border-t-0">
                        {!selectedSpot ? (
                            <div className="flex min-h-64 flex-col items-center justify-center text-center">
                                <div className="mb-4 rounded-2xl bg-emerald-400/10 p-4 text-emerald-400">
                                    <Users className="h-7 w-7" />
                                </div>
                                <h3 className="font-semibold text-white">Selecciona una ubicación</h3>
                                <p className="mt-2 max-w-xs text-sm leading-6 text-neutral-500">
                                    Elige un número libre para crear una reserva o uno ocupado para administrarlo.
                                </p>
                                {pendingCount > 0 && (
                                    <p className="mt-5 rounded-lg bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
                                        {pendingCount} pago{pendingCount !== 1 ? 's' : ''} pendiente{pendingCount !== 1 ? 's' : ''}
                                    </p>
                                )}
                            </div>
                        ) : selectedBooking ? (
                            <div className="space-y-5">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Ubicación reservada</p>
                                        <p className="mt-1 text-3xl font-black tabular-nums text-white">{String(selectedSpot).padStart(2, '0')}</p>
                                    </div>
                                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${paymentBadgeClasses[selectedBooking.paymentStatus || 'pending']}`}>
                                        {paymentLabels[selectedBooking.paymentStatus || 'pending']}
                                    </span>
                                </div>

                                <div className="rounded-xl border border-white/10 bg-neutral-900/80 p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-400/10 font-bold text-emerald-300">
                                            {selectedBookingName.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="truncate font-semibold text-white">{selectedBookingName}</p>
                                            <p className="text-sm text-neutral-500">{selectedBookingPhone || 'Sin teléfono'}</p>
                                        </div>
                                    </div>
                                    <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 text-sm">
                                        <div>
                                            <p className="text-xs text-neutral-500">Monto</p>
                                            <p className="mt-1 font-semibold text-white">S/ {Number(selectedBooking.amount || 0).toFixed(2)}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-neutral-500">Método</p>
                                            <p className="mt-1 font-semibold text-white">{selectedBooking.paymentMethod || 'No indicado'}</p>
                                        </div>
                                    </div>
                                </div>

                                {selectedBooking.operationCode && (
                                    <div className="rounded-lg border border-amber-400/20 bg-amber-400/10 p-3 text-sm">
                                        <p className="text-xs text-amber-200">Código de operación enviado por la alumna</p>
                                        <p className="mt-1 break-all font-mono font-bold text-white">{selectedBooking.operationCode}</p>
                                        <p className="mt-2 text-xs text-neutral-400">Verifica el abono real antes de confirmar. Este código no es prueba automática de pago.</p>
                                    </div>
                                )}
                                {readOnly && (
                                    <p className="rounded-lg border border-blue-400/20 bg-blue-400/10 p-3 text-xs leading-5 text-blue-200">
                                        Esta es una clase de demostración. Crea una clase real para guardar cambios.
                                    </p>
                                )}

                                <div className="space-y-2">
                                    <Button
                                        type="button"
                                        onClick={() => handleUpdateBooking(selectedBooking, { checkedIn: !selectedBooking.checkedIn })}
                                        disabled={readOnly || saving || selectedBooking.status !== 'confirmed' || !['paid', 'membership'].includes(selectedBooking.paymentStatus || '')}
                                        className={selectedBooking.checkedIn
                                            ? 'w-full border border-blue-400/25 bg-blue-400/10 text-blue-200 hover:bg-blue-400/15'
                                            : 'w-full bg-blue-600 text-white hover:bg-blue-500'}
                                    >
                                        <CheckCircle2 className="mr-2 h-4 w-4" />
                                        {selectedBooking.checkedIn ? 'Deshacer asistencia' : selectedBooking.status !== 'confirmed' ? 'Confirma el pago antes de marcar llegada' : 'Marcar llegada'}
                                    </Button>
                                    {(!selectedBooking.paymentStatus || selectedBooking.paymentStatus === 'pending') && (
                                        <Button
                                            type="button"
                                            onClick={() => handleUpdateBooking(selectedBooking, { paymentStatus: 'paid' })}
                                            disabled={readOnly || saving}
                                            className="w-full bg-emerald-600 text-white hover:bg-emerald-500"
                                        >
                                            <Check className="mr-2 h-4 w-4" /> Confirmar pago
                                        </Button>
                                    )}
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => sendWhatsAppConfirmation(selectedBooking)}
                                        disabled={!selectedBookingPhone}
                                        className="w-full border-white/10 bg-transparent text-neutral-200 hover:bg-white/5 hover:text-white"
                                    >
                                        <MessageCircle className="mr-2 h-4 w-4 text-emerald-400" /> Compartir estado por WhatsApp
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => handleDeleteBooking(selectedBooking)}
                                        disabled={readOnly || saving}
                                        className="w-full text-rose-400 hover:bg-rose-400/10 hover:text-rose-300"
                                    >
                                        <Trash2 className="mr-2 h-4 w-4" /> Cancelar y liberar lugar
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-5">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Nueva reserva</p>
                                    <div className="mt-1 flex items-end justify-between">
                                        <p className="text-3xl font-black tabular-nums text-white">Ubicación {String(selectedSpot).padStart(2, '0')}</p>
                                        <span className="mb-1 text-xs text-neutral-500">Disponible</span>
                                    </div>
                                </div>

                                {readOnly ? (
                                    <p className="rounded-lg border border-blue-400/20 bg-blue-400/10 p-3 text-xs leading-5 text-blue-200">
                                        Esta es una vista de demostración. Usa “Nueva clase” para crear un horario real y habilitar reservas.
                                    </p>
                                ) : (
                                    <>
                                        <div>
                                            <label className="mb-2 block text-sm font-medium text-neutral-300">Buscar alumna</label>
                                            <div className="relative">
                                                <Search className="absolute left-3 top-3 h-4 w-4 text-neutral-500" />
                                                <input
                                                    value={memberSearch}
                                                    onChange={(event) => {
                                                        setMemberSearch(event.target.value);
                                                        setSelectedMemberId('');
                                                    }}
                                                    placeholder="Nombre o teléfono"
                                                    className="w-full rounded-lg border border-white/10 bg-neutral-950 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none"
                                                />
                                            </div>
                                            {memberSearch && !selectedMember && (
                                                <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-white/10 bg-neutral-950 p-1">
                                                    {filteredMembers.map((member) => (
                                                        <button
                                                            type="button"
                                                            key={member.id}
                                                            onClick={() => {
                                                                setSelectedMemberId(member.id);
                                                                setMemberSearch(member.name);
                                                                setExternalName('');
                                                                setExternalPhone('');
                                                            }}
                                                            className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-white/5"
                                                        >
                                                            <span className="text-sm text-neutral-200">{member.name}</span>
                                                            <span className="text-xs text-neutral-600">{member.phone}</span>
                                                        </button>
                                                    ))}
                                                    {filteredMembers.length === 0 && (
                                                        <p className="px-3 py-3 text-xs text-neutral-500">No se encontraron miembros.</p>
                                                    )}
                                                </div>
                                            )}
                                            {selectedMember && (
                                                <div className="mt-2 flex items-center justify-between rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2">
                                                    <div>
                                                        <p className="text-sm font-medium text-emerald-100">{selectedMember.name}</p>
                                                        <p className="text-xs text-emerald-300/60">{selectedMember.phone}</p>
                                                    </div>
                                                    <button type="button" onClick={() => { setSelectedMemberId(''); setMemberSearch(''); }} className="text-emerald-300/70 hover:text-white">
                                                        <X className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {!selectedMember && (
                                            <div className="rounded-xl border border-white/10 bg-neutral-900/70 p-3">
                                                <div className="mb-3 flex items-center gap-2 text-xs text-neutral-500">
                                                    <UserRound className="h-4 w-4" /> Reserva para alumna no registrada
                                                </div>
                                                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                                                    <input
                                                        value={externalName}
                                                        onChange={(event) => setExternalName(event.target.value)}
                                                        placeholder="Nombre completo"
                                                        className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none"
                                                    />
                                                    <input
                                                        value={externalPhone}
                                                        onChange={(event) => setExternalPhone(event.target.value)}
                                                        placeholder="Teléfono"
                                                        inputMode="tel"
                                                        className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none"
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        <div>
                                            <label className="mb-2 block text-sm font-medium text-neutral-300">Estado del pago</label>
                                            <div className="grid grid-cols-3 gap-2">
                                                {([
                                                    ['paid', 'Pagado'],
                                                    ['membership', 'Membresía'],
                                                    ['pending', 'Pendiente'],
                                                ] as const).map(([value, label]) => (
                                                    <button
                                                        type="button"
                                                        key={value}
                                                        onClick={() => setPaymentStatus(value)}
                                                        className={`rounded-lg border px-2 py-2 text-xs font-semibold transition-colors ${paymentStatus === value
                                                            ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-200'
                                                            : 'border-white/10 bg-neutral-950 text-neutral-500 hover:text-neutral-300'}`}
                                                    >
                                                        {label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {paymentStatus !== 'membership' && (
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="mb-1.5 block text-xs text-neutral-500">Método</label>
                                                    <select
                                                        value={paymentMethod}
                                                        onChange={(event) => setPaymentMethod(event.target.value)}
                                                        className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                                                    >
                                                        <option>Yape / Plin</option>
                                                        <option>Efectivo</option>
                                                        <option>Tarjeta</option>
                                                        <option>Transferencia</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="mb-1.5 block text-xs text-neutral-500">Monto (S/)</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.50"
                                                        value={amount}
                                                        onChange={(event) => setAmount(event.target.value)}
                                                        className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm font-semibold text-white focus:border-emerald-500 focus:outline-none"
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {errorMessage && (
                                            <p className="rounded-lg border border-rose-400/20 bg-rose-400/10 p-3 text-xs text-rose-200">{errorMessage}</p>
                                        )}

                                        <Button
                                            type="button"
                                            onClick={handleSaveReservation}
                                            disabled={saving || (!selectedMember && (!externalName.trim() || !externalPhone.trim()))}
                                            className="w-full bg-emerald-600 py-2.5 font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                                            Confirmar ubicación {String(selectedSpot).padStart(2, '0')}
                                        </Button>
                                    </>
                                )}
                            </div>
                        )}

                        {errorMessage && selectedBooking && (
                            <p className="mt-4 rounded-lg border border-rose-400/20 bg-rose-400/10 p-3 text-xs text-rose-200">{errorMessage}</p>
                        )}
                    </aside>
                </div>

                <footer className="flex items-center justify-between border-t border-white/10 bg-neutral-950/50 px-5 py-3 text-xs text-neutral-500 sm:px-6">
                    <span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" /> Las ubicaciones son exclusivas para esta fecha.</span>
                    <span>{Math.max(0, effectiveCapacity - relevantBookings.length)} disponibles</span>
                </footer>
            </div>
        </div>
    );
}
