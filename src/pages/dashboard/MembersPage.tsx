import { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, UserPlus, Mail, Phone, MoreHorizontal, ChevronLeft, ChevronRight, X, CreditCard, Edit, Trash, Loader2, Banknote, Dumbbell, ExternalLink, ToggleLeft, ToggleRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { httpsCallable } from 'firebase/functions';
import { functions, db } from '@/lib/firebase';
import { collection, onSnapshot, query, orderBy, where, addDoc, updateDoc, doc, deleteDoc, getDoc, getDocs, serverTimestamp, arrayUnion } from 'firebase/firestore';

// Type definitions
interface Member {
    id: string;
    name: string;
    dni: string;
    email: string;
    phone: string;
    plan: string;
    joinDate: string;
    membershipStartDate?: string;
    membershipStartDateInput?: string;
    status: 'active' | 'overdue' | 'inactive';
    avatarColor: string;
    amountPaid?: number;
    planPrice?: number;
    debt?: number;
    futureDebt?: number;
    futureDebtStartDate?: string;
    futureDebtPlan?: string;
    futureDebtPlanPrice?: number;
    expirationDate?: string;
    rawJoinDate?: any;
    expirationDateObj?: Date;
    membershipHistory?: MembershipPeriod[];
    adminNotes?: string;
    diet?: string;
}

interface MembershipPaymentRecord {
    amount: number;
    method: string;
    date: string;
    type: string;
}

interface MembershipPeriod {
    id: string;
    plan: string;
    startDate: string;
    endDate: string;
    planPrice: number;
    amountPaid: number;
    debt: number;
    status: 'active' | 'closed' | 'future';
    payments: MembershipPaymentRecord[];
    createdAt: string;
}

const PLAN_OPTIONS = [
    { name: 'Plan Interdiario', price: 50, days: 30 },
    { name: 'Plan Mensual', price: 70, days: 30 },
    { name: 'Plan Bimestral', price: 120, days: 60 },
    { name: 'Plan Trimestral', price: 150, days: 90 },
];

const formatLocalDateInput = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const parseLocalDateInput = (value?: string) => {
    if (!value) return null;
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;
    const date = new Date(year, month - 1, day);
    return isNaN(date.getTime()) ? null : date;
};

const normalizePlanName = (planName?: string) => {
    const normalized = String(planName || '').trim().toLowerCase();
    if (normalized.includes('interdiario')) return 'Plan Interdiario';
    if (normalized.includes('trimestral') || normalized.includes('3 meses') || normalized.includes('3 mes')) return 'Plan Trimestral';
    if (normalized.includes('bimestral') || normalized.includes('2 meses') || normalized.includes('2 mes')) return 'Plan Bimestral';
    if (normalized.includes('mensual') || normalized.includes('1 mes')) return 'Plan Mensual';
    return 'Plan Mensual';
};

const getPlanOption = (planName: string) => PLAN_OPTIONS.find(plan => plan.name === normalizePlanName(planName));

const getPlanPrice = (planName: string, fallback = 70) => getPlanOption(planName)?.price ?? fallback;

const getPlanDays = (planName: string) => getPlanOption(planName)?.days ?? 30;

const normalizeMembershipHistory = (history: any): MembershipPeriod[] => {
    return Array.isArray(history) ? history.map((item) => ({
        id: String(item.id || `${item.startDate || 'inicio'}_${item.endDate || 'fin'}`),
        plan: String(item.plan || 'Membresía'),
        startDate: String(item.startDate || ''),
        endDate: String(item.endDate || ''),
        planPrice: Number(item.planPrice) || 0,
        amountPaid: Number(item.amountPaid) || 0,
        debt: Math.max(0, Number(item.debt) || 0),
        status: (item.status === 'closed' || item.status === 'future') ? item.status : 'active',
        payments: Array.isArray(item.payments) ? item.payments.filter((payment: any) => Number(payment?.amount) > 0).map((payment: any) => ({
            amount: Number(payment.amount) || 0,
            method: String(payment.method || 'Efectivo'),
            date: String(payment.date || ''),
            type: String(payment.type || 'payment')
        })) : [],
        createdAt: String(item.createdAt || item.startDate || '')
    })) : [];
};

const buildLegacyMembershipPeriod = (member: Member, debt: number): MembershipPeriod => {
    const planPrice = Number(member.planPrice) || getPlanPrice(member.plan);
    const amountPaid = Math.max(0, planPrice - debt);
    return {
        id: `legacy_${member.id}_${member.membershipStartDateInput || Date.now()}`,
        plan: member.plan || 'Membresía',
        startDate: member.membershipStartDateInput || '',
        endDate: member.expirationDateObj ? formatLocalDateInput(member.expirationDateObj) : '',
        planPrice,
        amountPaid,
        debt,
        status: debt > 0 ? 'active' : 'closed',
        payments: [],
        createdAt: new Date().toISOString()
    };
};

const getMembershipStatus = (expirationDate: Date, storedStatus?: string): Member['status'] => {
    if (storedStatus === 'inactive') return 'inactive';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiration = new Date(expirationDate);
    expiration.setHours(0, 0, 0, 0);

    if (expiration >= today) return 'active';

    const daysOverdue = Math.floor((today.getTime() - expiration.getTime()) / (1000 * 60 * 60 * 24));
    return daysOverdue > 30 ? 'inactive' : 'overdue';
};

const TRAINING_TEMPLATES = [
    { value: '', label: 'Sin perfil' },
    { value: 'perdida_peso', label: '🔥 Pérdida de peso', objetivo: 'Pérdida de peso', nivel: 'Principiante', diasSemana: 3 },
    { value: 'ganancia_muscular', label: '💪 Ganancia muscular', objetivo: 'Ganancia muscular', nivel: 'Intermedio', diasSemana: 4 },
    { value: 'tonificacion', label: '✨ Tonificación', objetivo: 'Tonificación', nivel: 'Principiante', diasSemana: 3 },
    { value: 'resistencia', label: '🏃 Resistencia', objetivo: 'Resistencia', nivel: 'Avanzado', diasSemana: 5 },
];

// Stats Card Component
function StatsCard({ title, value, color }: { title: string; value: number; color: string }) {
    return (
        <Card className="bg-neutral-900 border-neutral-800">
            <CardContent className="p-6">
                <p className="text-gray-400 text-sm font-medium mb-1">{title}</p>
                <h3 className={cn("text-3xl font-bold", color)}>{value}</h3>
            </CardContent>
        </Card>
    );
}

// Member Modal Component (Create & Edit)
function MemberModal({
    member, // If provided, we are in Edit mode
    onClose,
    onSubmit
}: {
    member?: Member;
    onClose: () => void;
    onSubmit: (data: any) => void
}) {
    const [name, setName] = useState(member?.name || '');
    const [dni, setDni] = useState(member?.dni || '');
    const [email, setEmail] = useState(member?.email || '');
    const [phone, setPhone] = useState(member?.phone || '');
    const [plan, setPlan] = useState(normalizePlanName(member?.plan));
    const [status, setStatus] = useState<Member['status']>(member?.status || 'active');

    // Training profile
    const [showProfile, setShowProfile] = useState(!!(member as any)?.trainingProfile?.objetivo);
    const [trainingTemplate, setTrainingTemplate] = useState('');
    const [objetivo, setObjetivo] = useState((member as any)?.trainingProfile?.objetivo || '');
    const [nivel, setNivel] = useState((member as any)?.trainingProfile?.nivel || '');
    const [diasSemana, setDiasSemana] = useState((member as any)?.trainingProfile?.diasSemana?.toString() || '');
    const [limitaciones, setLimitaciones] = useState((member as any)?.trainingProfile?.limitaciones || '');
    const [notasTrainer, setNotasTrainer] = useState((member as any)?.trainingProfile?.notasTrainer || '');
    const [adminNotes, setAdminNotes] = useState(member?.adminNotes || '');
    const [diet, setDiet] = useState(member?.diet || '');

    // Payment fields
    const [planPrice, setPlanPrice] = useState(member?.planPrice?.toString() || '70');
    const [amountPaid, setAmountPaid] = useState(member?.amountPaid?.toString() || '70');

    // Join Date State (New)
    const [joinDate, setJoinDate] = useState(() => {
        if (member?.rawJoinDate?.toDate) {
            return formatLocalDateInput(member.rawJoinDate.toDate());
        } else if (member?.joinDate && member.joinDate !== 'Reciente') {
            // Try to parse '16 feb 2026' back to date? Tricky with locale. 
            // Better strictly use rawJoinDate if available, or Today.
            // If we are editing but no raw date (shouldn't happen), assume today or leave blank?
            // Let's assume Today for new, and safe fallback.
            return formatLocalDateInput(new Date());
        }
        return formatLocalDateInput(new Date());
    });

    const [membershipStartDate, setMembershipStartDate] = useState(() => {
        if (member?.membershipStartDateInput) return member.membershipStartDateInput;
        if (member?.rawJoinDate?.toDate) return formatLocalDateInput(member.rawJoinDate.toDate());
        return formatLocalDateInput(new Date());
    });

    const [expirationDate, setExpirationDate] = useState(() => {
        if (member?.expirationDateObj) {
            return formatLocalDateInput(member.expirationDateObj);
        }
        // Default: Next Month
        const d = new Date();
        d.setMonth(d.getMonth() + 1);
        return formatLocalDateInput(d);
    });
    const [expirationEditedManually, setExpirationEditedManually] = useState(false);

    // Update expiration date if plan changes (only if not editing an existing member initially to avoid overwrite, 
    // BUT user asked for auto-calc. Let's make it recalculate on plan change).
    // We need to differentiate "initial load" from "user changed plan".

    // Apply training template
    useEffect(() => {
        if (!trainingTemplate) return;
        const t = TRAINING_TEMPLATES.find(t => t.value === trainingTemplate);
        if (t && t.value) {
            setObjetivo(t.objetivo || '');
            setNivel(t.nivel || '');
            setDiasSemana(t.diasSemana?.toString() || '');
            setShowProfile(true);
        }
    }, [trainingTemplate]);

    // Auto-update expiration date based on plan and current membership start date.
    useEffect(() => {
        if (expirationEditedManually) return;
        if (!membershipStartDate || membershipStartDate.length < 10) return;
        const baseDate = parseLocalDateInput(membershipStartDate);
        if (!baseDate) return;

        const newDate = new Date(baseDate);
        newDate.setDate(newDate.getDate() + getPlanDays(plan));

        if (!isNaN(newDate.getTime())) {
            setExpirationDate(formatLocalDateInput(newDate));
        }
    }, [plan, membershipStartDate, expirationEditedManually]);

    // Update price based on plan selection
    useEffect(() => {
        setPlanPrice(getPlanPrice(plan).toString());
    }, [plan]);

    // Auto-update status based on expiration date
    useEffect(() => {
        if (!expirationDate || expirationDate.length < 10) return;
        const expDate = parseLocalDateInput(expirationDate);
        if (!expDate) return;
        if (status === 'inactive') return;
        setStatus(getMembershipStatus(expDate, status));
    }, [expirationDate, status]);

    const debt = Math.max(0, (parseFloat(planPrice) || 0) - (parseFloat(amountPaid) || 0));

    const handleSubmit = () => {
        if (!name || !phone) return;
        onSubmit({
            id: member?.id,
            name, dni, email, phone, plan, status,
            amountPaid: parseFloat(amountPaid) || 0,
            planPrice: parseFloat(planPrice) || 0,
            expirationDateStr: expirationDate,
            joinDateStr: joinDate,
            membershipStartDateStr: membershipStartDate,
            debt: debt,
            adminNotes,
            diet: diet,
            trainingProfile: objetivo ? { objetivo, nivel, diasSemana: parseInt(diasSemana) || 0, limitaciones, notasTrainer } : null
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div
                className="bg-neutral-900 rounded-xl w-full max-w-md border border-neutral-800 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-neutral-800">
                    <h2 className="text-xl font-bold text-white">{member ? 'Editar Miembro' : 'Nuevo Miembro'}</h2>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-neutral-800 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                {/* Form */}
                <div className="p-4 space-y-4">
                    {/* Name & DNI */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Nombre Completo</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Ana Eliazar"
                                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">DNI</label>
                            <input
                                type="text"
                                value={dni}
                                onChange={(e) => setDni(e.target.value)}
                                placeholder="12345678"
                                maxLength={8}
                                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors"
                            />
                        </div>
                    </div>

                    {/* Email & Phone */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Email</label>
                            <div className="relative">
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="ana@mail.com"
                                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg pl-3 pr-9 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors"
                                />
                                <Mail className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Teléfono</label>
                            <div className="relative">
                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    placeholder="5007008000"
                                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg pl-3 pr-9 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors"
                                />
                                <Phone className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                            </div>
                        </div>
                    </div>

                    {/* Plan & Status */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Plan</label>
                            <select
                                value={plan}
                                onChange={(e) => setPlan(e.target.value)}
                                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-green-500 transition-colors appearance-none"
                            >
                                {PLAN_OPTIONS.map(planOption => (
                                    <option key={planOption.name} value={planOption.name}>
                                        {planOption.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Estado</label>
                            <select
                                value={status}
                                onChange={(e) => setStatus(e.target.value as Member['status'])}
                                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-green-500 transition-colors appearance-none"
                            >
                                <option value="active">Activo</option>
                                <option value="overdue">Vencido</option>
                                <option value="inactive">Inactivo</option>
                            </select>
                        </div>
                    </div>

                </div>

                {/* Dates */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Ingreso al gimnasio</label>
                        <input
                            type="date"
                            value={joinDate}
                            onChange={(e) => setJoinDate(e.target.value)}
                            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-green-500 transition-colors"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Inicio de membresía</label>
                        <input
                            type="date"
                            value={membershipStartDate}
                            onChange={(e) => setMembershipStartDate(e.target.value)}
                            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-green-500 transition-colors"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Vencimiento</label>
                        <input
                            type="date"
                            value={expirationDate}
                            onChange={(e) => {
                                setExpirationEditedManually(true);
                                setExpirationDate(e.target.value);
                            }}
                            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-green-500 transition-colors"
                        />
                    </div>
                </div>

                {/* Payment Info (New for Partial Payments) */}
                <div className="grid grid-cols-2 gap-3 bg-neutral-800/50 p-3 rounded-lg border border-neutral-700/50">
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Costo Plan (S/)</label>
                        <input
                            type="number"
                            value={planPrice}
                            onChange={(e) => setPlanPrice(e.target.value)}
                            className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-2 py-1.5 text-white text-sm focus:outline-none focus:border-green-500"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Monto Pagado (S/)</label>
                        <input
                            type="number"
                            value={amountPaid}
                            onChange={(e) => setAmountPaid(e.target.value)}
                            className={cn(
                                "w-full bg-neutral-900 border border-neutral-700 rounded-md px-2 py-1.5 text-white text-sm focus:outline-none focus:border-green-500",
                                debt > 0 ? "border-red-500/50 focus:border-red-500" : "border-green-500/50"
                            )}
                        />
                    </div>
                    {debt > 0 && (
                        <div className="col-span-2 text-center bg-red-500/10 border border-red-500/20 rounded-md py-1">
                            <p className="text-xs text-red-500 font-bold">⚠️ Deuda Pendiente: S/ {debt.toFixed(2)}</p>
                        </div>
                    )}
                </div>

                {member?.membershipHistory && member.membershipHistory.length > 0 && (
                    <div className="space-y-2">
                        <p className="text-sm text-gray-400">Historial de membresías</p>
                        <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                            {[...member.membershipHistory].reverse().map((period) => (
                                <div key={period.id} className="rounded-lg border border-neutral-700 bg-neutral-800/40 p-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-semibold text-white">{period.plan}</p>
                                            <p className="text-xs text-gray-400">{period.startDate || 'Sin inicio'} - {period.endDate || 'Sin vencimiento'}</p>
                                        </div>
                                        <span className={cn(
                                            "rounded-full px-2 py-0.5 text-[10px] font-bold",
                                            period.debt > 0 ? "bg-red-500/15 text-red-400" : "bg-green-500/15 text-green-400"
                                        )}>
                                            {period.debt > 0 ? `Debe S/ ${period.debt.toFixed(2)}` : 'Pagado'}
                                        </span>
                                    </div>
                                    <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-gray-400">
                                        <span>Costo S/ {period.planPrice.toFixed(2)}</span>
                                        <span>Pagado S/ {period.amountPaid.toFixed(2)}</span>
                                        <span>{period.payments.length} pago{period.payments.length !== 1 ? 's' : ''}</span>
                                    </div>
                                    {period.payments.length > 0 && (
                                        <div className="mt-2 space-y-1 border-t border-neutral-700 pt-2">
                                            {period.payments.map((payment, index) => (
                                                <p key={`${period.id}-${index}`} className="text-[11px] text-gray-400">
                                                    S/ {payment.amount.toFixed(2)} - {payment.method} - {new Date(payment.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                </p>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="mt-3">
                    <label className="block text-sm text-gray-400 mb-2">Notas administrativas</label>
                    <textarea
                        value={adminNotes}
                        onChange={(e) => setAdminNotes(e.target.value)}
                        placeholder="Ej. Clienta antigua, dejar entrenar hasta viernes, paga por Yape..."
                        rows={2}
                        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                    />
                    <p className="mt-1 text-[11px] text-gray-500">Solo para uso interno. No se muestra al cliente.</p>
                </div>

                {/* Diet Section */}
                <div className="mt-3">
                    <label className="block text-sm text-gray-400 mb-2">Dieta Actual (Para Bot)</label>
                    <textarea
                        value={diet}
                        onChange={(e) => setDiet(e.target.value)}
                        placeholder="Pega aquí el texto de la dieta desde ChatGPT..."
                        rows={4}
                        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                    />
                </div>

                {/* Training Profile (optional) */}
                <div className="mt-3">
                    <button
                        type="button"
                        onClick={() => setShowProfile(!showProfile)}
                        className="flex items-center gap-2 text-sm text-gray-400 hover:text-green-400 transition-colors"
                    >
                        <span>{showProfile ? '▼' : '▶'}</span>
                        <span>Perfil de entrenamiento <span className="text-gray-500">(opcional)</span></span>
                    </button>

                    {showProfile && (
                        <div className="mt-3 space-y-3 bg-neutral-800/40 border border-neutral-700/50 rounded-lg p-3">
                            {/* Template selector */}
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Plantilla rápida</label>
                                <select
                                    value={trainingTemplate}
                                    onChange={(e) => setTrainingTemplate(e.target.value)}
                                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                                >
                                    {TRAINING_TEMPLATES.map(t => (
                                        <option key={t.value} value={t.value}>{t.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Objetivo</label>
                                    <input
                                        type="text"
                                        value={objetivo}
                                        onChange={(e) => setObjetivo(e.target.value)}
                                        placeholder="Pérdida de peso"
                                        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Nivel</label>
                                    <select
                                        value={nivel}
                                        onChange={(e) => setNivel(e.target.value)}
                                        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                                    >
                                        <option value="">Seleccionar</option>
                                        <option>Principiante</option>
                                        <option>Intermedio</option>
                                        <option>Avanzado</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Días/semana</label>
                                    <input
                                        type="number"
                                        min="1" max="7"
                                        value={diasSemana}
                                        onChange={(e) => setDiasSemana(e.target.value)}
                                        placeholder="3"
                                        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Limitaciones</label>
                                    <input
                                        type="text"
                                        value={limitaciones}
                                        onChange={(e) => setLimitaciones(e.target.value)}
                                        placeholder="Rodilla, lumbar..."
                                        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Notas del trainer</label>
                                <input
                                    type="text"
                                    value={notasTrainer}
                                    onChange={(e) => setNotasTrainer(e.target.value)}
                                    placeholder="Notas especiales..."
                                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Submit Button */}
                <Button
                    onClick={handleSubmit}
                    disabled={!name || !phone}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {member ? 'Guardar Cambios' : 'Crear Miembro'}
                </Button>
            </div>
        </div>
    );
}

// Payment Modal Component
function PaymentModal({
    member,
    onClose
}: {
    member: Member;
    onClose: () => void;
}) {
    const [selectedPlan, setSelectedPlan] = useState(normalizePlanName(member.plan));
    const [amount, setAmount] = useState(getPlanPrice(normalizePlanName(member.plan), member.planPrice || 70).toString());
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const planOption = getPlanOption(selectedPlan);
        if (planOption) setAmount(planOption.price.toString());
    }, [selectedPlan]);

    const handlePayment = async () => {
        setLoading(true);
        try {
            // Updated to use the new generateCulqiLink microservice if desired, 
            // but keeping Stripe for legacy compatibility if user still wants it here.
            // For consistency with the user request, we are primarily fixing the DISPLAY of members.
            // We will leave the Stripe logic here as it's a separate "Generate Payment" action from the dashboard side.

            const createStripeCheckout = httpsCallable(functions, 'createStripeCheckout');
            const result = await createStripeCheckout({
                planName: selectedPlan,
                price: parseFloat(amount),
                successUrl: window.location.origin + '/dashboard/members?payment_success=true',
                cancelUrl: window.location.origin + '/dashboard/members?payment_canceled=true',
            });

            const { url } = result.data as { url: string };
            if (url) {
                window.location.href = url; // Redirect to Stripe
            }
        } catch (error) {
            console.error("Error creating checkout session:", error);
            alert("Error al iniciar el pago. Por favor intenta de nuevo.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div
                className="bg-neutral-900 rounded-xl w-full max-w-md border border-neutral-800 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-neutral-800">
                    <h2 className="text-xl font-bold text-white">Generar Pago</h2>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-neutral-800 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">

                    {/* Member Info */}
                    <div className="flex items-center gap-3 bg-neutral-800/50 p-3 rounded-lg border border-neutral-800">
                        <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white", member.avatarColor)}>
                            {member.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                            <p className="text-white font-medium">{member.name}</p>
                            <p className="text-gray-400 text-xs">{member.email}</p>
                        </div>
                    </div>

                    {/* Plan Selection */}
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Concepto / Plan</label>
                        <select
                            value={selectedPlan}
                            onChange={(e) => setSelectedPlan(e.target.value)}
                            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-green-500 transition-colors appearance-none"
                        >
                            {PLAN_OPTIONS.map(planOption => (
                                <option key={planOption.name} value={planOption.name}>
                                    {planOption.name}
                                </option>
                            ))}
                            <option>Clase Individual</option>
                        </select>
                    </div>

                    {/* Amount Input */}
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Monto a Cobrar (PEN)</label>
                        <div className="relative">
                            <span className="absolute left-3 top-2.5 text-gray-400">S/</span>
                            <input
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg pl-8 pr-3 py-2.5 text-white font-bold text-lg focus:outline-none focus:border-green-500 transition-colors"
                            />
                        </div>
                    </div>

                    {/* Pay Button */}
                    <Button
                        onClick={handlePayment}
                        disabled={loading || !amount}
                        className="w-full bg-[#635BFF] hover:bg-[#5349E0] text-white font-medium py-3 rounded-lg flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
                    >
                        {loading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                <CreditCard className="w-5 h-5" />
                                Ir a Pagar con Stripe
                            </>
                        )}
                    </Button>

                    <p className="text-xs text-gray-500 text-center">
                        Serás redirigido a una página segura de Stripe para completar el pago.
                    </p>
                </div>
            </div>
        </div>
    );
}

// Cash Payment Modal Component
function CashPaymentModal({
    member,
    onClose,
    onSubmit
}: {
    member: Member;
    onClose: () => void;
    onSubmit: (amount: number, method: string, renewalData?: { plan: string; planPrice: number; startDate: Date }) => Promise<void>;
}) {
    const needsRenewal = member.status === 'overdue' || member.status === 'inactive';
    const debt = Math.max(0, Number(member.debt) || 0);
    const [amount, setAmount] = useState(debt > 0 ? debt.toString() : '');
    const [method, setMethod] = useState('efectivo');
    const [loading, setLoading] = useState(false);

    // Renewal fields
    const [isRenewing, setIsRenewing] = useState(needsRenewal && debt <= 0);
    const [selectedPlan, setSelectedPlan] = useState(() => {
        const match = PLAN_OPTIONS.find(p => p.name === member.plan);
        return match ? match.name : 'Plan Mensual';
    });
    const [startDateMode, setStartDateMode] = useState<'prev' | 'today' | 'custom'>('prev');
    const [customDate, setCustomDate] = useState(formatLocalDateInput(new Date()));
    const parsedAmount = parseFloat(amount);
    const normalizedAmount = isNaN(parsedAmount) ? 0 : parsedAmount;
    const isZeroRenewal = isRenewing && normalizedAmount === 0;
    const exceedsDebt = debt > 0 && !isRenewing && !isNaN(parsedAmount) && parsedAmount > debt;

    // Auto-update amount when plan changes (only on renewal)
    useEffect(() => {
        if (!isRenewing) return;
        const planOption = getPlanOption(selectedPlan);
        if (planOption) setAmount(planOption.price.toString());
    }, [selectedPlan, isRenewing]);

    const getStartDate = (): Date => {
        if (startDateMode === 'prev' && member.expirationDateObj) return member.expirationDateObj;
        if (startDateMode === 'custom') {
            return parseLocalDateInput(customDate) || new Date();
        }
        return new Date();
    };

    const previewEndDate = (() => {
        if (!isRenewing) return null;
        const planOption = getPlanOption(selectedPlan);
        const start = getStartDate();
        const end = new Date(start);
        end.setDate(end.getDate() + (planOption?.days ?? getPlanDays(selectedPlan)));
        return end.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
    })();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const parsed = parseFloat(amount);
        if (isNaN(parsed) || parsed < 0) return;
        if (!isRenewing && parsed <= 0) return;
        if (debt > 0 && !isRenewing && parsed > debt) return;
        setLoading(true);
        let renewalData = undefined;
        if (isRenewing) {
            const planOption = getPlanOption(selectedPlan);
            renewalData = {
                plan: selectedPlan,
                planPrice: planOption?.price || getPlanPrice(selectedPlan, member.planPrice || 70),
                startDate: getStartDate()
            };
        }
        try {
            await onSubmit(parsed, method, renewalData);
        } catch (error) {
            console.error("Error registering cash payment:", error);
            alert("No se pudo registrar el pago. Intenta nuevamente.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-sm p-6 space-y-5">
                <div className="flex justify-between items-center">
                    <h2 className="text-white font-semibold text-lg">Registrar Pago en Efectivo</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
                </div>
                <p className="text-gray-400 text-sm">Cliente: <span className="text-white font-medium">{member.name}</span></p>
                {debt > 0 && !isRenewing && (
                    <p className="text-yellow-400 text-sm">Deuda pendiente: <span className="font-semibold">S/ {debt.toFixed(2)}</span></p>
                )}

                {/* Renewal toggle */}
                <label className="flex items-center gap-2 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={isRenewing}
                        onChange={e => setIsRenewing(e.target.checked)}
                        className="accent-green-500 w-4 h-4"
                    />
                    <span className="text-sm text-gray-300">Renovar membresía</span>
                </label>

                {isRenewing && (
                    <div className="space-y-3 border border-neutral-700 rounded-lg p-3">
                        {/* Plan selector */}
                        <div>
                            <label className="text-gray-400 text-sm block mb-1">Plan</label>
                            <select
                                value={selectedPlan}
                                onChange={e => setSelectedPlan(e.target.value)}
                                className="w-full bg-neutral-800 border border-neutral-700 text-white rounded-md px-3 py-2 text-sm"
                            >
                                {PLAN_OPTIONS.map(p => (
                                    <option key={p.name} value={p.name}>{p.name} — S/ {p.price}</option>
                                ))}
                            </select>
                        </div>

                        {/* Start date options */}
                        <div>
                            <label className="text-gray-400 text-sm block mb-1">Fecha de inicio</label>
                            <div className="space-y-1.5">
                                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-300">
                                    <input type="radio" name="startDate" value="prev" checked={startDateMode === 'prev'} onChange={() => setStartDateMode('prev')} className="accent-green-500" />
                                    Desde vencimiento anterior ({member.expirationDate})
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-300">
                                    <input type="radio" name="startDate" value="today" checked={startDateMode === 'today'} onChange={() => setStartDateMode('today')} className="accent-green-500" />
                                    Desde hoy ({new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })})
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-300">
                                    <input type="radio" name="startDate" value="custom" checked={startDateMode === 'custom'} onChange={() => setStartDateMode('custom')} className="accent-green-500" />
                                    Personalizada
                                </label>
                                {startDateMode === 'custom' && (
                                    <input
                                        type="date"
                                        value={customDate}
                                        onChange={e => setCustomDate(e.target.value)}
                                        className="w-full bg-neutral-800 border border-neutral-700 text-white rounded-md px-3 py-2 text-sm mt-1"
                                    />
                                )}
                            </div>
                        </div>

                        {/* Preview */}
                        {previewEndDate && (
                            <p className="text-green-400 text-xs">Nuevo vencimiento: <span className="font-semibold">{previewEndDate}</span></p>
                        )}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="text-gray-400 text-sm block mb-1">Monto (S/)</label>
                        <Input
                            type="number"
                            step="0.01"
                            min="0"
                            max={debt > 0 && !isRenewing ? debt : undefined}
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                            className={cn(
                                "bg-neutral-800 text-white",
                                exceedsDebt ? "border-red-500 focus:border-red-500" : "border-neutral-700"
                            )}
                            placeholder="0.00"
                            required
                        />
                        {exceedsDebt && (
                            <p className="text-red-400 text-xs mt-1">
                                Para pagar solo la deuda, el monto máximo es S/ {debt.toFixed(2)}. Si deseas cobrar más, marca Renovar membresía.
                            </p>
                        )}
                    </div>
                    <div>
                        <label className="text-gray-400 text-sm block mb-1">Método de pago</label>
                        <select
                            value={method}
                            onChange={e => setMethod(e.target.value)}
                            className="w-full bg-neutral-800 border border-neutral-700 text-white rounded-md px-3 py-2 text-sm"
                        >
                            <option value="efectivo">Efectivo</option>
                            <option value="transferencia">Transferencia</option>
                            <option value="yape">Yape / Plin</option>
                        </select>
                    </div>
                    <Button type="submit" disabled={loading || exceedsDebt} className="w-full bg-green-600 hover:bg-green-700">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Banknote className="w-4 h-4 mr-2" />}
                        {isZeroRenewal ? 'Registrar renovación con deuda' : 'Registrar Pago'}
                    </Button>
                </form>
            </div>
        </div>
    );
}

// Actions Menu Component
// Routine Assignment type
interface RoutineAssignment {
    id: string;
    routineTitle: string;
    routineUrl: string;
    shareId: string;
    status: 'active' | 'inactive';
    createdAt: any;
}

// Routines Modal Component
function RoutinesModal({ member, onClose }: { member: Member; onClose: () => void }) {
    const [routines, setRoutines] = useState<RoutineAssignment[]>([]);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState<string | null>(null);
    const [selectedRoutineIds, setSelectedRoutineIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        const fetchRoutines = async () => {
            setLoading(true);
            try {
                const promises: Promise<any>[] = [];

                // Query by studentId (Firestore doc ID) — no orderBy to avoid composite index requirement
                promises.push(getDocs(query(
                    collection(db, 'studentRoutineAssignments'),
                    where('studentId', '==', member.id)
                )));

                // Query by phone (fallback: rutinas app may have used a different collection)
                if (member.phone) {
                    promises.push(getDocs(query(
                        collection(db, 'studentRoutineAssignments'),
                        where('studentPhone', '==', member.phone)
                    )));
                }

                const snaps = await Promise.all(promises);

                // Merge results deduplicating by doc id
                const seen = new Set<string>();
                const rows: RoutineAssignment[] = [];
                for (const snap of snaps) {
                    for (const d of snap.docs) {
                        if (seen.has(d.id)) continue;
                        seen.add(d.id);
                        rows.push({
                            id: d.id,
                            routineTitle: d.data().routineTitle ?? 'Sin título',
                            routineUrl: d.data().routineUrl ?? '',
                            shareId: d.data().shareId ?? '',
                            status: d.data().status ?? 'active',
                            createdAt: d.data().createdAt,
                        });
                    }
                }

                // Sort by createdAt desc
                rows.sort((a, b) => {
                    const ta = a.createdAt?.toDate?.()?.getTime() ?? 0;
                    const tb = b.createdAt?.toDate?.()?.getTime() ?? 0;
                    return tb - ta;
                });

                setRoutines(rows);
                setSelectedRoutineIds(new Set());
            } catch (e) {
                console.error('Error cargando rutinas:', e);
            } finally {
                setLoading(false);
            }
        };
        void fetchRoutines();
    }, [member.id]);

    const toggleStatus = async (routine: RoutineAssignment) => {
        const newStatus = routine.status === 'active' ? 'inactive' : 'active';
        setUpdating(routine.id);
        try {
            await updateDoc(doc(db, 'studentRoutineAssignments', routine.id), { status: newStatus });
            setRoutines(prev => prev.map(r => r.id === routine.id ? { ...r, status: newStatus } : r));
        } finally {
            setUpdating(null);
        }
    };

    const deleteRoutine = async (routine: RoutineAssignment) => {
        if (!confirm(`¿Eliminar la rutina "${routine.routineTitle}"?`)) return;
        setUpdating(routine.id);
        try {
            await deleteDoc(doc(db, 'studentRoutineAssignments', routine.id));
            setRoutines(prev => prev.filter(r => r.id !== routine.id));
            setSelectedRoutineIds(prev => {
                const next = new Set(prev);
                next.delete(routine.id);
                return next;
            });
        } finally {
            setUpdating(null);
        }
    };

    const activeCount = routines.filter(r => r.status === 'active').length;
    const selectedCount = selectedRoutineIds.size;
    const allSelected = routines.length > 0 && selectedCount === routines.length;

    const toggleSelectAll = () => {
        setSelectedRoutineIds(allSelected ? new Set() : new Set(routines.map(r => r.id)));
    };

    const toggleRoutineSelection = (routineId: string) => {
        setSelectedRoutineIds(prev => {
            const next = new Set(prev);
            if (next.has(routineId)) {
                next.delete(routineId);
            } else {
                next.add(routineId);
            }
            return next;
        });
    };

    const deleteSelectedRoutines = async () => {
        if (selectedCount === 0) return;
        if (!confirm(`¿Eliminar ${selectedCount} rutina${selectedCount !== 1 ? 's' : ''} seleccionada${selectedCount !== 1 ? 's' : ''} de ${member.name}?`)) return;

        setUpdating('bulk-delete');
        try {
            const idsToDelete = Array.from(selectedRoutineIds);
            await Promise.all(idsToDelete.map(id => deleteDoc(doc(db, 'studentRoutineAssignments', id))));
            setRoutines(prev => prev.filter(r => !selectedRoutineIds.has(r.id)));
            setSelectedRoutineIds(new Set());
        } finally {
            setUpdating(null);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-lg shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-neutral-800">
                    <div>
                        <h2 className="text-white font-bold text-lg flex items-center gap-2">
                            <Dumbbell className="w-5 h-5 text-yellow-400" />
                            Rutinas de {member.name}
                        </h2>
                        <p className="text-gray-500 text-xs mt-0.5">
                            {activeCount} activa{activeCount !== 1 ? 's' : ''} · {routines.length} total
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-5 max-h-[60vh] overflow-y-auto space-y-3">
                    {loading ? (
                        <div className="flex items-center justify-center py-10">
                            <Loader2 className="w-6 h-6 animate-spin text-yellow-400" />
                        </div>
                    ) : routines.length === 0 ? (
                        <p className="text-center text-gray-500 py-10 text-sm">
                            Este alumno no tiene rutinas asignadas aún.
                        </p>
                    ) : (
                        <>
                            <div className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-950/60 px-4 py-3">
                                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={allSelected}
                                        onChange={toggleSelectAll}
                                        disabled={updating !== null}
                                        className="h-4 w-4 rounded border-neutral-700 bg-neutral-900 accent-yellow-500"
                                    />
                                    Seleccionar todas
                                </label>
                                <Button
                                    type="button"
                                    onClick={deleteSelectedRoutines}
                                    disabled={selectedCount === 0 || updating !== null}
                                    className="h-8 bg-red-600 hover:bg-red-700 disabled:bg-neutral-800 disabled:text-gray-500"
                                >
                                    {updating === 'bulk-delete' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash className="w-4 h-4 mr-2" />}
                                    Eliminar seleccionadas
                                </Button>
                            </div>

                            {routines.map(routine => (
                            <div
                                key={routine.id}
                                className={cn(
                                    "rounded-lg border p-4 flex items-start justify-between gap-3 transition-opacity",
                                    routine.status === 'active'
                                        ? "border-yellow-500/30 bg-yellow-500/5"
                                        : "border-neutral-700 bg-neutral-800/50 opacity-60"
                                )}
                            >
                                <div className="flex items-start gap-3 flex-1 min-w-0">
                                    <input
                                        type="checkbox"
                                        checked={selectedRoutineIds.has(routine.id)}
                                        onChange={() => toggleRoutineSelection(routine.id)}
                                        disabled={updating !== null}
                                        aria-label={`Seleccionar ${routine.routineTitle}`}
                                        className="mt-1 h-4 w-4 rounded border-neutral-700 bg-neutral-900 accent-yellow-500 shrink-0"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={cn(
                                                "text-xs font-bold px-2 py-0.5 rounded-full",
                                                routine.status === 'active'
                                                    ? "bg-green-500/20 text-green-400"
                                                    : "bg-neutral-700 text-gray-500"
                                            )}>
                                                {routine.status === 'active' ? 'Activa' : 'Inactiva'}
                                            </span>
                                            <span className="text-gray-500 text-xs">
                                                {routine.createdAt?.toDate
                                                    ? routine.createdAt.toDate().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
                                                    : 'Reciente'}
                                            </span>
                                        </div>
                                        <p className="text-white text-sm font-medium truncate">{routine.routineTitle}</p>
                                        {routine.routineUrl && (
                                            <a
                                                href={routine.routineUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1 mt-1 truncate"
                                            >
                                                <ExternalLink className="w-3 h-3 shrink-0" />
                                                Ver rutina
                                            </a>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <button
                                        onClick={() => toggleStatus(routine)}
                                        disabled={updating !== null}
                                        title={routine.status === 'active' ? 'Desactivar' : 'Activar'}
                                        className="p-1.5 rounded-md hover:bg-neutral-700 transition-colors"
                                    >
                                        {updating === routine.id
                                            ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                                            : routine.status === 'active'
                                                ? <ToggleRight className="w-5 h-5 text-green-400" />
                                                : <ToggleLeft className="w-5 h-5 text-gray-500" />
                                        }
                                    </button>
                                    <button
                                        onClick={() => deleteRoutine(routine)}
                                        disabled={updating !== null}
                                        title="Eliminar"
                                        className="p-1.5 rounded-md hover:bg-neutral-700 transition-colors text-red-500 hover:text-red-400"
                                    >
                                        <Trash className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            ))}
                        </>
                    )}
                </div>

                <div className="p-4 border-t border-neutral-800">
                    <p className="text-gray-500 text-xs">
                        Solo las rutinas <span className="text-green-400 font-medium">activas</span> son entregadas por Sofía al alumno.
                    </p>
                </div>
            </div>
        </div>
    );
}

function MemberActionsMenu({
    member,
    onAction,
    isDeleting = false
}: {
    member: Member;
    onAction: (action: 'payment' | 'cashPayment' | 'edit' | 'delete' | 'routines', member: Member) => void;
    isDeleting?: boolean;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const handleClick = (action: 'payment' | 'cashPayment' | 'edit' | 'delete' | 'routines') => {
        onAction(action, member);
        setIsOpen(false);
    };

    return (
        <div className="relative" ref={menuRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="p-2 hover:bg-neutral-800 rounded-full text-gray-500 hover:text-white transition-colors"
            >
                <MoreHorizontal className="w-5 h-5" />
            </button>

            {isOpen && (
                <div className="absolute right-0 z-10 mt-1 w-52 rounded-lg bg-neutral-900 border border-neutral-800 shadow-lg py-1">
                    <button
                        onClick={() => handleClick('routines')}
                        className="w-full text-left px-3 py-2 text-sm text-yellow-400 hover:bg-neutral-800 flex items-center gap-2"
                    >
                        <Dumbbell className="w-4 h-4" />
                        Ver Rutinas
                    </button>
                    <button
                        onClick={() => handleClick('cashPayment')}
                        className="w-full text-left px-3 py-2 text-sm text-yellow-400 hover:bg-neutral-800 flex items-center gap-2"
                    >
                        <Banknote className="w-4 h-4" />
                        Registrar Pago Efectivo
                    </button>
                    <button
                        onClick={() => handleClick('payment')}
                        className="w-full text-left px-3 py-2 text-sm text-green-500 hover:bg-neutral-800 flex items-center gap-2"
                    >
                        <CreditCard className="w-4 h-4" />
                        Generar Pago (Stripe)
                    </button>
                    <button
                        onClick={() => handleClick('edit')}
                        className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-neutral-800 flex items-center gap-2"
                    >
                        <Edit className="w-4 h-4" />
                        Editar
                    </button>
                    <button
                        onClick={() => handleClick('delete')}
                        disabled={isDeleting}
                        className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-neutral-800 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash className="w-4 h-4" />}
                        {isDeleting ? 'Eliminando...' : 'Eliminar'}
                    </button>
                </div>
            )}
        </div>
    );
}

export function MembersPage() {
    const [members, setMembers] = useState<Member[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'overdue' | 'inactive'>('all');
    const [loading, setLoading] = useState(true);
    const [deletingMemberId, setDeletingMemberId] = useState<string | null>(null);

    // Modal State
    const [modalMode, setModalMode] = useState<'create' | 'edit' | 'none'>('none');
    const [selectedMember, setSelectedMember] = useState<Member | undefined>(undefined);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [showCashPaymentModal, setShowCashPaymentModal] = useState(false);
    const [showRoutinesModal, setShowRoutinesModal] = useState(false);

    // Real-time Firestore Subscription
    useEffect(() => {
        const q = query(collection(db, 'members'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedMembers: Member[] = snapshot.docs.map(doc => {
                const data = doc.data();
                // Calculate Expiration
                let expirationDate = 'Sin fecha';
                const created = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
                const planName = (data.plan || '').toLowerCase();

                let expDateObj = new Date(); // Default

                if (data.expirationDate?.toDate) {
                    // Use saved expiration date if available
                    expDateObj = data.expirationDate.toDate();
                } else {
                    // Fallback to calculation
                    expDateObj = new Date(created);
                    if (planName.includes('trimestral') || planName.includes('3 mes')) {
                        expDateObj.setMonth(expDateObj.getMonth() + 3);
                    } else if (planName.includes('mensual') || planName.includes('1 mes') || planName.includes('mes')) {
                        expDateObj.setMonth(expDateObj.getMonth() + 1);
                    } else {
                        expDateObj.setFullYear(expDateObj.getFullYear() + 1);
                    }
                }

                expirationDate = expDateObj.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
                const membershipStartDateObj = parseLocalDateInput(data.startDate) || created;
                const membershipStartDate = membershipStartDateObj.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });

                const storedStatus = data.status || 'active';
                const computedStatus = getMembershipStatus(expDateObj, storedStatus);

                return {
                    id: doc.id,
                    name: data.name || 'Sin Nombre',
                    dni: data.dni || '',
                    email: data.email || '',
                    phone: data.phone || '',
                    plan: data.plan || '',
                    joinDate: data.createdAt?.toDate().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) || 'Reciente',
                    membershipStartDate,
                    membershipStartDateInput: data.startDate || formatLocalDateInput(membershipStartDateObj),
                    status: computedStatus as Member['status'],
                    avatarColor: `bg-${['green', 'blue', 'purple', 'orange', 'pink'][Math.floor(Math.random() * 5)]}-600`,
                    amountPaid: data.amountPaid,
                    planPrice: data.planPrice,
                    debt: data.debt,
                    futureDebt: data.futureDebt,
                    futureDebtStartDate: data.futureDebtStartDate,
                    futureDebtPlan: data.futureDebtPlan,
                    futureDebtPlanPrice: data.futureDebtPlanPrice,
                    expirationDate,
                    expirationDateObj: expDateObj,
                    rawJoinDate: data.createdAt,
                    membershipHistory: normalizeMembershipHistory(data.membershipHistory),
                    adminNotes: data.adminNotes || '',
                    diet: data.diet || ''
                };
            });
            setMembers(fetchedMembers);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // Handlers
    const handleAction = (action: 'payment' | 'cashPayment' | 'edit' | 'delete' | 'routines', member: Member) => {
        if (action === 'routines') {
            setSelectedMember(member);
            setShowRoutinesModal(true);
        } else if (action === 'payment') {
            setSelectedMember(member);
            setShowPaymentModal(true);
        } else if (action === 'cashPayment') {
            setSelectedMember(member);
            setShowCashPaymentModal(true);
        } else if (action === 'edit') {
            setSelectedMember(member);
            setModalMode('edit');
        } else if (action === 'delete') {
            if (confirm(`¿Estás seguro de que quieres eliminar a ${member.name}?`)) {
                setDeletingMemberId(member.id);
                deleteDoc(doc(db, 'members', member.id))
                    .catch((error) => {
                        console.error("Error deleting member:", error);
                        alert("No se pudo eliminar el miembro. Intenta nuevamente.");
                    })
                    .finally(() => setDeletingMemberId(null));
            }
        }
    };

    const handleCashPayment = async (amount: number, method: string, renewalData?: { plan: string; planPrice: number; startDate: Date }) => {
        if (!selectedMember) return;
        const memberRef = doc(db, 'members', selectedMember.id);
        const memberSnap = await getDoc(memberRef);
        const currentMemberData = memberSnap.exists() ? memberSnap.data() : {};
        const currentHistory = normalizeMembershipHistory(currentMemberData.membershipHistory);
        const today = new Date();

        const methodMap: Record<string, string> = {
            efectivo: 'Efectivo',
            transferencia: 'Transferencia',
            yape: 'Yape / Plin'
        };

        let updateData: Record<string, any>;

        if (renewalData) {
            const newEndDate = new Date(renewalData.startDate);
            newEndDate.setDate(newEndDate.getDate() + getPlanDays(renewalData.plan));

            const startStr = formatLocalDateInput(renewalData.startDate);
            const endStr = formatLocalDateInput(newEndDate);
            const newDebt = Math.max(0, renewalData.planPrice - amount);
            const todayStart = new Date(today);
            todayStart.setHours(0, 0, 0, 0);
            const renewalStart = new Date(renewalData.startDate);
            renewalStart.setHours(0, 0, 0, 0);
            const isFutureRenewal = renewalStart > todayStart;
            const renewalPayment = amount > 0 ? [{
                amount,
                method,
                date: today.toISOString(),
                type: isFutureRenewal ? 'future_renewal_advance' : 'renewal_payment'
            }] : [];
            const nextHistory: MembershipPeriod[] = [
                ...currentHistory.map((period) => period.status === 'active' ? { ...period, status: 'closed' as const } : period),
                {
                    id: `membership_${selectedMember.id}_${startStr}_${Date.now()}`,
                    plan: renewalData.plan,
                    startDate: startStr,
                    endDate: endStr,
                    planPrice: renewalData.planPrice,
                    amountPaid: amount,
                    debt: newDebt,
                    status: isFutureRenewal ? 'future' : 'active',
                    payments: renewalPayment,
                    createdAt: today.toISOString()
                }
            ];

            updateData = {
                status: 'active',
                plan: renewalData.plan,
                planPrice: renewalData.planPrice,
                amountPaid: amount,
                debt: isFutureRenewal ? 0 : newDebt,
                futureDebt: isFutureRenewal ? newDebt : 0,
                futureDebtStartDate: isFutureRenewal ? startStr : '',
                futureDebtPlan: isFutureRenewal ? renewalData.plan : '',
                futureDebtPlanPrice: isFutureRenewal ? renewalData.planPrice : 0,
                startDate: startStr,
                endDate: endStr,
                expirationDate: newEndDate,
                membershipHistory: nextHistory,
                ...(amount > 0 ? {
                    payments: arrayUnion({
                        amount,
                        method,
                        date: today.toISOString(),
                        type: isFutureRenewal ? 'future_renewal_advance' : 'renewal_payment'
                    })
                } : {}),
                updatedAt: serverTimestamp()
            };
        } else {
            const prevPaid = selectedMember.amountPaid || 0;
            const pendingDebt = Math.max(0, Number(selectedMember.debt) || 0);
            if (pendingDebt > 0 && amount > pendingDebt) {
                alert(`El pago de deuda no puede superar S/ ${pendingDebt.toFixed(2)}. Para cobrar más, usa Renovar membresía.`);
                return;
            }
            const newTotalPaid = prevPaid + amount;
            const newDebt = Math.max(0, pendingDebt - amount);
            let nextHistory = currentHistory.length > 0 ? [...currentHistory] : [buildLegacyMembershipPeriod(selectedMember, pendingDebt)];
            const activeIndex = [...nextHistory].reverse().findIndex((period) => period.status === 'active' || period.status === 'future');
            const historyIndex = activeIndex >= 0 ? nextHistory.length - 1 - activeIndex : nextHistory.length - 1;
            const paymentRecord: MembershipPaymentRecord = {
                amount,
                method,
                date: today.toISOString(),
                type: 'debt_payment'
            };
            nextHistory = nextHistory.map((period, index) => {
                if (index !== historyIndex) return period;
                const nextAmountPaid = Number(period.amountPaid || 0) + amount;
                const nextDebt = Math.max(0, Number(period.debt || pendingDebt) - amount);
                return {
                    ...period,
                    amountPaid: nextAmountPaid,
                    debt: nextDebt,
                    status: nextDebt > 0 ? period.status : 'closed',
                    payments: [...(period.payments || []), paymentRecord]
                };
            });
            const previousFutureDebt = Math.max(0, Number(selectedMember.futureDebt) || 0);
            const futureDebtDate = selectedMember.futureDebtStartDate ? new Date(`${selectedMember.futureDebtStartDate}T00:00:00`) : null;
            const todayStart = new Date(today);
            todayStart.setHours(0, 0, 0, 0);
            const isExpiredFutureDebt = !!futureDebtDate && futureDebtDate <= todayStart;
            const nextFutureDebt = isExpiredFutureDebt ? Math.min(previousFutureDebt, newDebt) : previousFutureDebt;

            const expirationStart = selectedMember.expirationDateObj ? new Date(selectedMember.expirationDateObj) : null;
            expirationStart?.setHours(0, 0, 0, 0);
            const currentStatus = expirationStart ? getMembershipStatus(expirationStart, selectedMember.status) : 'active';

            updateData = {
                status: currentStatus,
                amountPaid: newTotalPaid,
                debt: newDebt,
                membershipHistory: nextHistory,
                futureDebt: nextFutureDebt,
                futureDebtStartDate: nextFutureDebt > 0 ? selectedMember.futureDebtStartDate || '' : '',
                futureDebtPlan: nextFutureDebt > 0 ? selectedMember.futureDebtPlan || '' : '',
                futureDebtPlanPrice: nextFutureDebt > 0 ? selectedMember.futureDebtPlanPrice || 0 : 0,
                payments: arrayUnion({
                    amount,
                    method,
                    date: today.toISOString(),
                    type: 'debt_payment',
                    concept: 'Pago de deuda'
                }),
                updatedAt: serverTimestamp()
            };
        }

        await updateDoc(memberRef, updateData);

        if (amount > 0) {
            await addDoc(collection(db, 'payments'), {
                memberName: selectedMember.name,
                memberId: selectedMember.id,
                concept: renewalData?.plan || 'Pago de deuda',
                amount,
                method: methodMap[method] || method,
                invoiceType: 'Boleta',
                paymentType: renewalData ? 'renewal_payment' : 'debt_payment',
                date: today,
                createdAt: serverTimestamp()
            });
        }

        setShowCashPaymentModal(false);
        setSelectedMember(undefined);
    };

    const handleCreateOrUpdateMember = async (data: any) => {
        try {
            // Fix Date Timezone Issue for Expiration
            const [y, m, d] = data.expirationDateStr ? data.expirationDateStr.split('-').map(Number) : [0, 0, 0];
            const expirationDateObj = data.expirationDateStr ? new Date(y, m - 1, d) : null;

            // Fix Date Timezone Issue for Join Date (createdAt)
            const [jy, jm, jd] = data.joinDateStr ? data.joinDateStr.split('-').map(Number) : [0, 0, 0];
            const joinDateObj = data.joinDateStr ? new Date(jy, jm - 1, jd) : new Date();
            const membershipStartDateStr = data.membershipStartDateStr || data.joinDateStr || '';
            const currentDebt = Math.max(0, Number(data.debt) || 0);
            const currentMembershipPeriod: MembershipPeriod = {
                id: `membership_${data.id || 'new'}_${membershipStartDateStr || Date.now()}`,
                plan: data.plan,
                startDate: membershipStartDateStr,
                endDate: data.expirationDateStr || '',
                planPrice: Number(data.planPrice) || 0,
                amountPaid: Number(data.amountPaid) || 0,
                debt: currentDebt,
                status: data.status === 'active' ? 'active' : 'closed',
                payments: [],
                createdAt: new Date().toISOString()
            };

            if (modalMode === 'create') {
                await addDoc(collection(db, 'members'), {
                    name: data.name,
                    dni: data.dni || '',
                    email: data.email,
                    phone: data.phone,
                    plan: data.plan,
                    status: data.status,
                    amountPaid: data.amountPaid,
                    planPrice: data.planPrice,
                    debt: data.debt || 0,
                    startDate: membershipStartDateStr,
                    endDate: data.expirationDateStr || '',
                    expirationDate: expirationDateObj,
                    createdAt: joinDateObj,
                    membershipHistory: [currentMembershipPeriod],
                    adminNotes: data.adminNotes || '',
                    diet: data.diet || '',
                    ...(data.trainingProfile ? { trainingProfile: data.trainingProfile } : {})
                });
            } else if (modalMode === 'edit' && data.id) {
                const memberRef = doc(db, 'members', data.id);
                const memberSnap = await getDoc(memberRef);
                const existingHistory = normalizeMembershipHistory(memberSnap.exists() ? memberSnap.data().membershipHistory : []);
                const matchingIndex = existingHistory.findIndex((period) => period.startDate === membershipStartDateStr && period.endDate === data.expirationDateStr);
                const nextHistory = existingHistory.length === 0
                    ? [currentMembershipPeriod]
                    : existingHistory.map((period, index) => {
                        if (index !== (matchingIndex >= 0 ? matchingIndex : existingHistory.length - 1)) return period;
                        return {
                            ...period,
                            plan: data.plan,
                            startDate: membershipStartDateStr,
                            endDate: data.expirationDateStr || '',
                            planPrice: Number(data.planPrice) || 0,
                            amountPaid: Number(data.amountPaid) || 0,
                            debt: currentDebt,
                            status: data.status === 'active' ? 'active' : period.status
                        };
                    });
                await updateDoc(memberRef, {
                    name: data.name,
                    dni: data.dni || '',
                    email: data.email,
                    phone: data.phone,
                    plan: data.plan,
                    status: data.status,
                    amountPaid: data.amountPaid,
                    planPrice: data.planPrice,
                    debt: data.debt || 0,
                    expirationDate: expirationDateObj,
                    startDate: membershipStartDateStr,
                    endDate: data.expirationDateStr,
                    createdAt: joinDateObj,
                    membershipHistory: nextHistory,
                    updatedAt: serverTimestamp(),
                    adminNotes: data.adminNotes || '',
                    diet: data.diet || '',
                    ...(data.trainingProfile ? { trainingProfile: data.trainingProfile } : {})
                });
            }

        } catch (error) {
            console.error("Error saving member:", error);
            alert("Error al guardar el miembro.");
        }
        setModalMode('none');
        setSelectedMember(undefined);
    };

    // Filter logic
    const filteredMembers = members.filter(member => {
        const matchesSearch = member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            member.dni.includes(searchTerm) ||
            member.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
            member.phone.includes(searchTerm);
        const matchesStatus = filterStatus === 'all' || member.status === filterStatus;
        return matchesSearch && matchesStatus;
    });

    // Counts
    const totalMembers = members.length;
    const activeMembers = members.filter(m => m.status === 'active').length;
    const overdueMembers = members.filter(m => m.status === 'overdue').length;
    const inactiveMembers = members.filter(m => m.status === 'inactive').length;

    if (loading) {
        return <div className="flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin text-green-500" /></div>;
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-white">Miembros</h1>
                    <p className="text-gray-400">Gestiona los miembros de tu gimnasio</p>
                </div>
                <Button
                    onClick={() => {
                        setSelectedMember(undefined);
                        setModalMode('create');
                    }}
                    className="bg-green-600 hover:bg-green-700"
                >
                    <UserPlus className="mr-2 h-4 w-4" /> Nuevo Miembro
                </Button>
            </div>

            {/* Filters & Search */}
            <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                <div className="relative w-full max-w-md">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
                    <Input
                        placeholder="Buscar por nombre, DNI, email o teléfono..."
                        className="pl-9 pr-10 bg-neutral-900 border-neutral-800 text-white placeholder-gray-500 rounded-lg h-11"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <Mail className="absolute right-3 top-3.5 h-4 w-4 text-green-500" />
                </div>

                <div className="flex flex-wrap gap-2">
                    {[
                        { id: 'all', label: 'Todos', color: 'bg-green-500 text-black', inactive: 'bg-neutral-800 text-gray-400 hover:text-white' },
                        { id: 'active', label: 'Activo', color: 'bg-green-500/20 text-green-500 border border-green-500/50', inactive: 'bg-neutral-800 text-gray-400 hover:text-white' },
                        { id: 'overdue', label: 'Vencido', color: 'bg-red-500/20 text-red-500 border border-red-500/50', inactive: 'bg-neutral-800 text-gray-400 hover:text-white' },
                        { id: 'inactive', label: 'Inactivo', color: 'bg-neutral-700 text-gray-200 border border-neutral-600', inactive: 'bg-neutral-800 text-gray-400 hover:text-white' },
                    ].map((filter) => (
                        <button
                            key={filter.id}
                            onClick={() => setFilterStatus(filter.id as any)}
                            className={cn(
                                "px-4 py-2 rounded-full text-sm font-medium transition-all",
                                filterStatus === filter.id ? filter.color : filter.inactive
                            )}
                        >
                            {filter.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Members Table */}
            <Card className="bg-neutral-900 border-neutral-800 overflow-hidden">
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-gray-400">
                            <thead className="bg-neutral-800/50 text-gray-400 border-b border-neutral-800">
                                <tr>
                                    <th className="px-6 py-4 font-medium">Nombre</th>
                                    <th className="px-6 py-4 font-medium">Contacto</th>
                                    <th className="px-6 py-4 font-medium">Plan</th>
                                    <th className="px-6 py-4 font-medium">Inicio de membresía</th>
                                    <th className="px-6 py-4 font-medium">Vencimiento</th>
                                    <th className="px-6 py-4 font-medium">Estado</th>
                                    <th className="px-6 py-4 font-medium text-right"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-800">
                                {filteredMembers.map((member) => (
                                    <tr key={member.id} className="hover:bg-neutral-800/30 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white", member.avatarColor)}>
                                                    {member.name.substring(0, 2).toUpperCase()}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-white font-medium">{member.name}</span>
                                                    {member.dni && (
                                                        <span className="text-gray-500 text-xs">DNI: {member.dni}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-2 text-gray-300">
                                                    <Phone className="w-3.5 h-3.5 text-green-500" />
                                                    {member.phone}
                                                </div>
                                                <div className="flex items-center gap-2 text-gray-500 text-xs">
                                                    <Mail className="w-3.5 h-3.5" />
                                                    {member.email}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-gray-300">
                                            {member.plan}
                                        </td>
                                        <td className="px-6 py-4 text-gray-300">
                                            {member.membershipStartDate || member.joinDate}
                                        </td>
                                        <td className="px-6 py-4 text-gray-300">
                                            {member.expirationDate}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={cn(
                                                "px-3 py-1 rounded-full text-xs font-medium border",
                                                member.status === 'active' ? "bg-green-500/10 text-green-500 border-green-500/20" :
                                                    member.status === 'overdue' ? "bg-red-500/10 text-red-500 border-red-500/20" :
                                                        "bg-neutral-700/40 text-gray-300 border-neutral-600"
                                            )}>
                                                {member.status === 'active' ? 'Activo' :
                                                    member.status === 'overdue' ? 'Vencido' : 'Inactivo'}
                                            </span>
                                            {(() => {
                                                const debt = Number(member.debt ?? Math.max(0, Number(member.planPrice || 0) - Number(member.amountPaid || 0)));
                                                const rawFutureDebt = Number(member.futureDebt || 0);
                                                const futureDebtDate = member.futureDebtStartDate ? new Date(`${member.futureDebtStartDate}T00:00:00`) : null;
                                                const todayStart = new Date();
                                                todayStart.setHours(0, 0, 0, 0);
                                                const isFutureDebtActuallyFuture = !!futureDebtDate && futureDebtDate > todayStart;
                                                const futureDebt = isFutureDebtActuallyFuture ? rawFutureDebt : 0;
                                                const unpaidFromPlan = Math.max(0, Number(member.planPrice || 0) - Number(member.amountPaid || 0));
                                                const expiredFutureDebt = rawFutureDebt > 0 && !isFutureDebtActuallyFuture && unpaidFromPlan > 0 ? rawFutureDebt : 0;
                                                const currentDebt = debt > 0 ? debt : expiredFutureDebt;
                                                return currentDebt > 0 || futureDebt > 0 ? (
                                                    <div className="mt-1 space-y-1">
                                                        {currentDebt > 0 && (
                                                        <span className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-full font-bold">
                                                            Debe: S/ {currentDebt.toFixed(2)}
                                                        </span>
                                                        )}
                                                        {futureDebt > 0 && (
                                                            <span className="block text-[10px] bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 px-2 py-0.5 rounded-full font-bold">
                                                                Futuro: S/ {futureDebt.toFixed(2)} desde {member.futureDebtStartDate || member.expirationDate}
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : null;
                                            })()}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <MemberActionsMenu
                                                member={member}
                                                onAction={handleAction}
                                                isDeleting={deletingMemberId === member.id}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination (Visual) */}
                    <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-800 text-sm text-gray-500">
                        <p>Mostrando {filteredMembers.length} de {filteredMembers.length} resultados</p>
                        <div className="flex gap-2">
                            <Button variant="outline" size="icon" className="h-8 w-8 border-neutral-700 bg-neutral-800 hover:bg-neutral-700 hover:text-white" disabled>
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button variant="outline" size="icon" className="h-8 w-8 border-neutral-700 bg-neutral-800 hover:bg-neutral-700 hover:text-white" disabled>
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatsCard title="Total Miembros" value={totalMembers} color="text-white" />
                <StatsCard title="Activos" value={activeMembers} color="text-green-500" />
                <StatsCard title="Vencidos" value={overdueMembers} color="text-red-500" />
                <StatsCard title="Inactivos" value={inactiveMembers} color="text-gray-400" />
            </div>

            {/* Create / Edit Member Modal */}
            {modalMode !== 'none' && (
                <MemberModal
                    member={selectedMember} // Pass selected member for editing
                    onClose={() => {
                        setModalMode('none');
                        setSelectedMember(undefined);
                    }}
                    onSubmit={handleCreateOrUpdateMember}
                />
            )}

            {/* Payment Modal */}
            {showPaymentModal && selectedMember && (
                <PaymentModal
                    member={selectedMember}
                    onClose={() => setShowPaymentModal(false)}
                />
            )}

            {/* Cash Payment Modal */}
            {showCashPaymentModal && selectedMember && (
                <CashPaymentModal
                    member={selectedMember}
                    onClose={() => { setShowCashPaymentModal(false); setSelectedMember(undefined); }}
                    onSubmit={handleCashPayment}
                />
            )}

            {/* Routines Modal */}
            {showRoutinesModal && selectedMember && (
                <RoutinesModal
                    member={selectedMember}
                    onClose={() => { setShowRoutinesModal(false); setSelectedMember(undefined); }}
                />
            )}
        </div>
    )
}
