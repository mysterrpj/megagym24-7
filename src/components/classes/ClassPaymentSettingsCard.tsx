import { useCallback, useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { CheckCircle2, KeyRound, Loader2, Pencil, WalletCards, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ClassPaymentSettings, reservationCall, reservationError } from '@/lib/classReservations';

const inputClass = 'mt-1.5 h-11 w-full rounded-lg border border-white/10 bg-neutral-950 px-3 text-sm text-white placeholder:text-neutral-600 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/15 disabled:opacity-50';

function displayPhone(value: string) {
    const digits = value.replace(/\D/g, '').replace(/^51/, '');
    return digits.length === 9 ? `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}` : value;
}

export function ClassPaymentSettingsCard() {
    const [settings, setSettings] = useState<ClassPaymentSettings | null>(null);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [savedMessage, setSavedMessage] = useState('');
    const [collectorName, setCollectorName] = useState('');
    const [yapePhone, setYapePhone] = useState('');
    const [sameNumber, setSameNumber] = useState(true);
    const [whatsappPhone, setWhatsappPhone] = useState('');
    const [pin, setPin] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            setSettings(await reservationCall<ClassPaymentSettings>('getClassPaymentSettings', {}));
        } catch (cause) {
            setError(reservationError(cause));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const openEditor = () => {
        setCollectorName(settings?.collectorName || '');
        setYapePhone(settings?.yapePhone || '');
        setSameNumber(settings?.configured ? settings.sameNumber : true);
        setWhatsappPhone(settings?.whatsappPhone || '');
        setPin('');
        setError('');
        setSavedMessage('');
        setOpen(true);
    };

    const save = async (event: React.FormEvent) => {
        event.preventDefault();
        if (saving) return;
        setSaving(true);
        setError('');
        setSavedMessage('');
        try {
            const next = await reservationCall<ClassPaymentSettings>('updateClassPaymentSettings', {
                collectorName: collectorName.trim(),
                yapePhone: yapePhone.trim(),
                whatsappPhone: sameNumber ? yapePhone.trim() : whatsappPhone.trim(),
                sameNumber,
                ...(pin ? { pin } : {}),
            });
            setSettings(next);
            setPin('');
            setSavedMessage('Responsable actualizado. Las reservas nuevas usarán estos datos.');
        } catch (cause) {
            setError(reservationError(cause));
        } finally {
            setSaving(false);
        }
    };

    return <>
        <section aria-labelledby="payment-owner-title" className="overflow-hidden rounded-xl border border-white/10 bg-neutral-900">
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
                <div className="flex min-w-0 items-center gap-3">
                    <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${settings?.configured ? 'bg-emerald-400/10 text-emerald-300' : 'bg-amber-400/10 text-amber-300'}`}><WalletCards className="h-5 w-5" /></div>
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500">Turno de cobro</p>
                        <h2 id="payment-owner-title" className="truncate font-semibold text-white">{loading ? 'Consultando responsable…' : settings?.configured ? settings.collectorName : 'Responsable sin configurar'}</h2>
                        {!loading && settings?.configured && <p className="mt-0.5 text-xs text-neutral-400">Yape {displayPhone(settings.yapePhone)} · WhatsApp {displayPhone(settings.whatsappPhone)}</p>}
                        {!loading && !settings?.configured && <p className="mt-0.5 text-xs text-amber-300">Configúralo antes de activar el aviso por WhatsApp.</p>}
                    </div>
                </div>
                <Button type="button" variant="outline" disabled={loading} onClick={openEditor} className="border-neutral-700"><Pencil className="mr-2 h-4 w-4" />{settings?.configured ? 'Cambiar responsable' : 'Configurar cobros'}</Button>
            </div>
            {error && !open && <p role="alert" className="border-t border-rose-400/15 bg-rose-400/5 px-4 py-2 text-xs text-rose-300">{error}</p>}
        </section>

        <Dialog.Root open={open} onOpenChange={(next) => { if (!saving) setOpen(next); }}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-black/75" />
                <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-1rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-white/10 bg-neutral-900 p-5 text-white shadow-2xl focus:outline-none sm:p-6">
                    <div className="flex items-start justify-between gap-4">
                        <div><Dialog.Title className="text-xl font-bold">Responsable de cobros</Dialog.Title><Dialog.Description className="mt-1 text-sm leading-5 text-neutral-400">Estos datos se guardan en cada reserva nueva. Las pendientes conservan al responsable anterior.</Dialog.Description></div>
                        <Dialog.Close disabled={saving} aria-label="Cerrar" className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-neutral-400 hover:bg-white/5"><X className="h-5 w-5" /></Dialog.Close>
                    </div>

                    <form onSubmit={save} className="mt-5 space-y-4">
                        <label className="block text-sm text-neutral-300">Nombre que verá el cliente<input required minLength={2} maxLength={100} autoComplete="name" value={collectorName} onChange={(event) => setCollectorName(event.target.value)} placeholder="Ej. Liz Pia" className={inputClass} /></label>
                        <label className="block text-sm text-neutral-300">Número que recibirá el Yape<input required inputMode="tel" autoComplete="tel" value={yapePhone} onChange={(event) => setYapePhone(event.target.value)} placeholder="999 999 999" className={inputClass} /></label>

                        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-neutral-950/50 p-3">
                            <input type="checkbox" checked={sameNumber} onChange={(event) => setSameNumber(event.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-500" />
                            <span><span className="block text-sm font-semibold text-white">Usar el mismo número para WhatsApp</span><span className="mt-0.5 block text-xs text-neutral-500">Recomendado cuando la misma persona recibe el Yape y verifica el pago.</span></span>
                        </label>

                        {!sameNumber && <label className="block text-sm text-neutral-300">WhatsApp del encargado<input required inputMode="tel" autoComplete="tel" value={whatsappPhone} onChange={(event) => setWhatsappPhone(event.target.value)} placeholder="999 999 999" className={inputClass} /></label>}

                        <label className="block text-sm text-neutral-300">PIN secreto de confirmación
                            <span className="ml-2 text-xs text-neutral-500">{settings?.hasPin ? 'Déjalo vacío para conservarlo' : 'Obligatorio la primera vez'}</span>
                            <div className="relative"><KeyRound className="pointer-events-none absolute left-3 top-4 h-4 w-4 text-neutral-500" /><input type="password" required={!settings?.hasPin} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoComplete="new-password" placeholder="6 dígitos" className={`${inputClass} pl-10 font-mono tracking-[0.35em]`} /></div>
                        </label>

                        <div className="rounded-lg border border-amber-400/15 bg-amber-400/5 px-3 py-2 text-xs leading-5 text-amber-200">Comparte el PIN únicamente con la persona encargada. El código de operación del cliente nunca confirma el pago por sí solo.</div>
                        {error && <p role="alert" className="rounded-lg bg-rose-400/10 px-3 py-2 text-sm text-rose-300">{error}</p>}
                        {savedMessage && <p role="status" className="flex items-center gap-2 rounded-lg bg-emerald-400/10 px-3 py-2 text-sm text-emerald-300"><CheckCircle2 className="h-4 w-4" />{savedMessage}</p>}
                        <button disabled={saving} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 font-bold text-neutral-950 hover:bg-emerald-400 disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Guardar responsable</button>
                    </form>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    </>;
}
