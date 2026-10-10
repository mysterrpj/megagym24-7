import { useRef, useState, type RefObject } from 'react';
import { addDoc, collection, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, where } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import * as Dialog from '@radix-ui/react-dialog';
import * as Select from '@radix-ui/react-select';

export interface AdminClass {
    id: string;
    name: string;
    instructor: string;
    day: number;
    time: string;
    duration: number;
    capacity: number;
    price?: number;
    status: string;
    publicBookingEnabled?: boolean;
    paymentInstructions?: string;
}
export const classDays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const inputStyle = 'mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-600 disabled:opacity-50';

function AdminSelect({ value, onChange, options, label, disabled }: { value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; label: string; disabled: boolean }) {
    return <Select.Root value={value} onValueChange={onChange} disabled={disabled}>
        <Select.Trigger aria-label={label} className={`${inputStyle} flex items-center justify-between text-left`}><Select.Value /><Select.Icon aria-hidden>▾</Select.Icon></Select.Trigger>
        <Select.Portal><Select.Content position="popper" className="z-[60] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-neutral-700 bg-neutral-800 p-1 text-sm text-white"><Select.Viewport>{options.map((option) => <Select.Item key={option.value} value={option.value} className="cursor-pointer rounded px-3 py-2 outline-none data-[highlighted]:bg-green-800 data-[state=checked]:text-green-300"><Select.ItemText>{option.label}</Select.ItemText></Select.Item>)}</Select.Viewport></Select.Content></Select.Portal>
    </Select.Root>;
}

export function ClassAdminDialog({ classItem: incomingClass, occurrenceDate, readOnly = false, onClose, onReservations }: {
    classItem?: AdminClass; occurrenceDate?: string; readOnly?: boolean; onClose: () => void; onReservations?: () => void;
}) {
    // Freeze the edit baseline: live snapshots must not silently overwrite another admin's edits.
    const [classItem] = useState(incomingClass);
    const [tab, setTab] = useState<'details' | 'share'>('details');
    const [name, setName] = useState(classItem?.name ?? '');
    const [instructor, setInstructor] = useState(classItem?.instructor ?? '');
    const [day, setDay] = useState(classItem?.day ?? 0);
    const [time, setTime] = useState(classItem?.time ?? '07:00');
    const [duration, setDuration] = useState(String(classItem?.duration ?? 60));
    const [capacity, setCapacity] = useState(String(classItem?.capacity ?? 20));
    const [price, setPrice] = useState(String(classItem?.price ?? 6));
    const [status, setStatus] = useState(classItem?.status ?? 'active');
    const [publicBookingEnabled, setPublicBookingEnabled] = useState(classItem?.publicBookingEnabled === true);
    const [paymentInstructions, setPaymentInstructions] = useState(classItem?.paymentInstructions ?? '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [copyMessage, setCopyMessage] = useState('');
    const scheduleLinkRef = useRef<HTMLInputElement>(null);
    const occurrenceLinkRef = useRef<HTMLInputElement>(null);
    const scheduleLink = `${window.location.origin}/reservar`;
    const occurrenceLink = classItem && occurrenceDate ? `${window.location.origin}/reservar/clase/${encodeURIComponent(classItem.id)}?fecha=${occurrenceDate}` : '';
    const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(window.location.hostname);
    const shareEnabled = !readOnly && classItem?.publicBookingEnabled === true && classItem.status === 'active';

    async function save() {
        setError('');
        if (!name.trim() || !instructor.trim()) return setError('Completa el nombre de la clase y el instructor.');
        if (!Number.isInteger(day) || day < 0 || day > 6 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return setError('Revisa el día y la hora.');
        if (!Number.isInteger(Number(capacity)) || Number(capacity) < 1 || Number(capacity) > 20) return setError('La capacidad debe ser un entero de 1 a 20.');
        if (!duration.trim() || !Number.isInteger(Number(duration)) || Number(duration) < 1 || Number(duration) > 1440) return setError('La duración debe ser de 1 a 1440 minutos.');
        if (!price.trim() || !Number.isFinite(Number(price)) || Number(price) < 0) return setError('El precio debe ser 0 o mayor.');
        if (paymentInstructions.trim().length > 2000 || (publicBookingEnabled && !paymentInstructions.trim())) return setError('Para reservas públicas, escribe instrucciones de pago manual (máximo 2000 caracteres). Para clases gratuitas, indica que no se requiere pago.');
        if (readOnly || saving) return;
        setSaving(true);
        try {
            const values = { name: name.trim(), instructor: instructor.trim(), dayIndex: day, time, duration: Number(duration), capacity: Number(capacity), price: Number(price), status, publicBookingEnabled, paymentInstructions: paymentInstructions.trim(), updatedAt: serverTimestamp() };
            if (!classItem) {
                await addDoc(collection(db, 'classes'), { ...values, color: 'border-l-green-500', createdAt: serverTimestamp() });
            } else {
                const reference = doc(db, 'classes', classItem.id);
                const before = await getDoc(reference);
                if (!before.exists()) throw new Error('La clase ya no existe.');
                const reservationVersion = before.data().reservationVersion ?? 0;
                const scheduleChanged = day !== classItem.day || time !== classItem.time || Number(duration) !== classItem.duration || Number(capacity) !== classItem.capacity || Number(price) !== (classItem.price ?? 6);
                if (scheduleChanged) {
                    const bookings = await getDocs(query(collection(db, 'bookings'), where('classId', '==', classItem.id)));
                    const today = format(new Date(), 'yyyy-MM-dd');
                    if (bookings.docs.some((booking) => {
                        const data = booking.data();
                        return !['cancelled', 'canceled'].includes(data.status) && (!data.date || data.date >= today);
                    })) throw new Error('Hay reservas futuras o sin fecha. No se puede cambiar día, hora, duración, capacidad ni precio. Conserva esta clase y crea otro horario; revisa las reservas sin fecha manualmente.');
                }
                await runTransaction(db, async (transaction) => {
                    const reference = doc(db, 'classes', classItem.id);
                    const snapshot = await transaction.get(reference);
                    if (!snapshot.exists()) throw new Error('La clase ya no existe. Cierra y actualiza la página.');
                    const current = snapshot.data();
                    if (scheduleChanged && (current.reservationVersion ?? 0) !== reservationVersion) throw new Error('Las reservas cambiaron durante la edición. Vuelve a guardar para comprobarlas de nuevo.');
                    const legacyDay = Number(current.day ?? 1);
                    const currentDay = Number(current.dayIndex ?? current.weekday ?? (legacyDay >= 1 && legacyDay <= 7 ? legacyDay - 1 : legacyDay));
                    const currentTime = current.time || (typeof current.hour === 'number' ? `${String(current.hour).padStart(2, '0')}:00` : '07:00');
                    if (currentDay !== classItem.day || currentTime !== classItem.time || Number(current.capacity ?? 20) !== classItem.capacity || Number(current.duration ?? 60) !== classItem.duration || (current.name || 'Clase') !== classItem.name || (current.instructor || 'Por definir') !== classItem.instructor || Number(current.price ?? 6) !== (classItem.price ?? 6) || (current.status || 'active') !== classItem.status || (current.publicBookingEnabled === true) !== (classItem.publicBookingEnabled === true) || (current.paymentInstructions || '') !== (classItem.paymentInstructions || '')) {
                        throw new Error('La clase cambió mientras la editabas. Cierra y vuelve a abrir para revisar los cambios.');
                    }
                    transaction.update(reference, values);
                });
            }
            onClose();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'No se pudo guardar. Revisa tu conexión y permisos.');
        } finally { setSaving(false); }
    }

    async function copyLink(value: string, inputRef: RefObject<HTMLInputElement>, label: string) {
        try {
            if (!navigator.clipboard) throw new Error('Clipboard unavailable');
            await navigator.clipboard.writeText(value);
            setCopyMessage(`${label} copiado.`);
        } catch {
            inputRef.current?.focus(); inputRef.current?.select();
            setCopyMessage('Copia el enlace seleccionado con Ctrl+C o mantén pulsado y elige Copiar.');
        }
    }

    return <Dialog.Root open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
        <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 space-y-4 overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-900 p-6 text-white">
            <div className="flex items-center justify-between gap-4"><Dialog.Title className="text-xl font-semibold">{classItem ? 'Administrar clase' : 'Nueva clase'}</Dialog.Title><Dialog.Close disabled={saving} className="rounded-md px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-800">Cerrar</Dialog.Close></div>
            <Dialog.Description className="sr-only">Edita los detalles de la clase, consulta sus reservas o comparte el enlace de reserva.</Dialog.Description>
            {classItem && <p className="text-sm text-neutral-400">{classItem.name} · {occurrenceDate} · {classItem.time}</p>}
            {classItem && <div className="flex flex-wrap gap-2 border-b border-neutral-800 pb-3" aria-label="Opciones de clase">
                <Button disabled={saving} variant="ghost" onClick={() => setTab('details')} aria-pressed={tab === 'details'} className={tab === 'details' ? 'bg-neutral-800' : ''}>Detalles / editar</Button>
                <Button disabled={saving} variant="ghost" onClick={onReservations}>Reservas / mapa</Button>
                <Button disabled={saving} variant="ghost" onClick={() => setTab('share')} aria-pressed={tab === 'share'} className={tab === 'share' ? 'bg-neutral-800' : ''}>Compartir</Button>
            </div>}
            {readOnly && <p className="text-sm text-amber-300">Vista de demostración: no se guardarán cambios ni se compartirán reservas.</p>}
            {classItem && classItem.capacity > 20 && <p role="status" className="text-sm text-amber-300">Esta clase conserva una capacidad antigua de {classItem.capacity}. Para guardar, elige entre 1 y 20 lugares. Solo se permite ajustar la capacidad si no hay reservas futuras o sin fecha; no se cambia automáticamente.</p>}
            {tab === 'details' ? <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
                <fieldset disabled={saving || readOnly} className="space-y-4 disabled:opacity-70">
                    <label className="block text-sm text-neutral-300">Nombre de la clase<input className={inputStyle} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required /></label>
                    <label className="block text-sm text-neutral-300">Instructor<input className={inputStyle} value={instructor} onChange={(e) => setInstructor(e.target.value)} maxLength={120} required /></label>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="text-sm text-neutral-300">Día<AdminSelect label="Día" disabled={saving || readOnly} value={String(day)} onChange={(value) => setDay(Number(value))} options={classDays.map((label, index) => ({ label, value: String(index) }))} /></div>
                        <label className="text-sm text-neutral-300">Hora<input type="time" className={inputStyle} value={time} onChange={(e) => setTime(e.target.value)} required /></label>
                        <label className="text-sm text-neutral-300">Duración (min)<input type="number" min="1" max="1440" className={inputStyle} value={duration} onChange={(e) => setDuration(e.target.value)} required /></label>
                        <label className="text-sm text-neutral-300">Lugares (1–20)<input type="number" min="1" max="20" className={inputStyle} value={capacity} onChange={(e) => setCapacity(e.target.value)} required /></label>
                        <label className="text-sm text-neutral-300">Precio (S/)<input type="number" min="0" step="0.01" className={inputStyle} value={price} onChange={(e) => setPrice(e.target.value)} required /></label>
                        <div className="text-sm text-neutral-300">Estado<AdminSelect label="Estado" disabled={saving || readOnly} value={status} onChange={setStatus} options={[{ value: 'active', label: 'Activa' }, { value: 'inactive', label: 'Inactiva' }]} /></div>
                    </div>
                    <p className="text-xs text-neutral-400">Desactiva en lugar de eliminar: las reservas se conservan. Con reservas futuras o sin fecha no se permite cambiar el horario, la capacidad ni el precio.</p>
                    <label className="flex items-center gap-3 text-sm text-neutral-300"><input type="checkbox" checked={publicBookingEnabled} onChange={(e) => setPublicBookingEnabled(e.target.checked)} className="accent-green-600" />Permitir reservas desde el enlace público</label>
                    <label className="block text-sm text-neutral-300">Instrucciones de pago manual<textarea className={inputStyle} rows={3} value={paymentInstructions} onChange={(e) => setPaymentInstructions(e.target.value)} maxLength={2000} placeholder="Yape / Plin: número y titular. Indica cómo enviar el comprobante para su revisión manual." /><span className="mt-1 block text-xs text-neutral-500">Visible al reservar. No se cobra ni verifica el pago automáticamente.</span></label>
                </fieldset>
                {error && <p role="alert" className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
                <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={saving} onClick={onClose}>Cerrar</Button><Button type="submit" disabled={saving || readOnly} className="bg-green-600 hover:bg-green-700">{saving ? 'Guardando…' : 'Guardar cambios'}</Button></div>
            </form> : <section className="space-y-4">
                <p className="text-sm text-neutral-300">Comparte una sola vez la agenda permanente. Los próximos 7 días, horarios y cupos se actualizan automáticamente.</p>
                {!shareEnabled && <p className="text-sm text-amber-300">Activa esta clase y habilita las reservas públicas en Detalles para que aparezca en la agenda.</p>}
                {local && <p className="rounded-md border border-amber-500/20 p-3 text-sm text-amber-300">Estos enlaces son locales: solo funcionan en esta máquina. Abre el sistema desde su dominio público para compartir con clientes.</p>}
                <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4">
                    <p className="text-sm font-semibold text-white">Agenda general · enlace permanente</p>
                    <p className="mt-1 text-xs leading-5 text-neutral-400">Recomendado para WhatsApp, Instagram y código QR. El cliente elige día, horario y luego su ubicación.</p>
                    <input ref={scheduleLinkRef} aria-label="Enlace permanente de horarios" readOnly value={scheduleLink} className={inputStyle} onFocus={(event) => event.target.select()} />
                    <div className="mt-3 flex flex-wrap gap-2">
                        <Button disabled={!shareEnabled} onClick={() => void copyLink(scheduleLink, scheduleLinkRef, 'Enlace permanente')} className="bg-green-600 hover:bg-green-700">Copiar enlace permanente</Button>
                        {shareEnabled && <a className="rounded-md border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800 focus:ring-2 focus:ring-green-600" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`Horarios y reservas de clases grupales MegaGym: ${scheduleLink}`)}`}>Abrir WhatsApp</a>}
                    </div>
                </div>
                <div className="rounded-lg border border-neutral-800 p-4">
                    <p className="text-sm font-semibold text-neutral-200">Enlace directo · solo {occurrenceDate}</p>
                    <p className="mt-1 text-xs text-neutral-500">Úsalo únicamente cuando quieras promocionar esta clase y fecha específicas.</p>
                    <input ref={occurrenceLinkRef} aria-label={`Enlace directo para ${occurrenceDate}`} readOnly value={occurrenceLink} className={inputStyle} onFocus={(event) => event.target.select()} />
                    <Button variant="outline" disabled={!shareEnabled} onClick={() => void copyLink(occurrenceLink, occurrenceLinkRef, 'Enlace directo')} className="mt-3 border-neutral-700">Copiar enlace directo</Button>
                </div>
                {copyMessage && <p role="status" className="text-sm text-green-300">{copyMessage}</p>}
            </section>}
        </Dialog.Content></Dialog.Portal>
    </Dialog.Root>;
}
