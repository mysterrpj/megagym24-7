import { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, UserPlus, Mail, Phone, MoreHorizontal, ChevronLeft, ChevronRight, X, CreditCard, Edit, Trash, Loader2, Banknote } from 'lucide-react';
import { cn } from '@/lib/utils';
import { httpsCallable } from 'firebase/functions';
import { functions, db } from '@/lib/firebase';
import { collection, onSnapshot, query, orderBy, addDoc, updateDoc, doc, deleteDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';

// Type definitions
interface Member {
    id: string;
    name: string;
    dni: string;
    email: string;
    phone: string;
    plan: string;
    joinDate: string;
    status: 'active' | 'pending' | 'overdue' | 'prospect';
    avatarColor: string;
    amountPaid?: number;
    planPrice?: number;
    expirationDate?: string;
    rawJoinDate?: any;
    expirationDateObj?: Date;
}

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
    const [plan, setPlan] = useState(member?.plan || 'Membresía Fit 2026');
    const [status, setStatus] = useState<'active' | 'pending' | 'prospect' | 'overdue'>(member?.status === 'overdue' ? 'overdue' : (member?.status || 'active'));

    // Payment fields
    const [planPrice, setPlanPrice] = useState(member?.planPrice?.toString() || '80');
    const [amountPaid, setAmountPaid] = useState(member?.amountPaid?.toString() || '80');

    // Join Date State (New)
    const [joinDate, setJoinDate] = useState(() => {
        if (member?.rawJoinDate?.toDate) {
            return member.rawJoinDate.toDate().toISOString().split('T')[0];
        } else if (member?.joinDate && member.joinDate !== 'Reciente') {
            // Try to parse '16 feb 2026' back to date? Tricky with locale. 
            // Better strictly use rawJoinDate if available, or Today.
            // If we are editing but no raw date (shouldn't happen), assume today or leave blank?
            // Let's assume Today for new, and safe fallback.
            return new Date().toISOString().split('T')[0];
        }
        return new Date().toISOString().split('T')[0];
    });

    const [expirationDate, setExpirationDate] = useState(() => {
        if (member?.expirationDateObj) {
            return member.expirationDateObj.toISOString().split('T')[0];
        }
        // Default: Next Month
        const d = new Date();
        d.setMonth(d.getMonth() + 1);
        return d.toISOString().split('T')[0];
    });

    // Update expiration date if plan changes (only if not editing an existing member initially to avoid overwrite, 
    // BUT user asked for auto-calc. Let's make it recalculate on plan change).
    // We need to differentiate "initial load" from "user changed plan".

    // Auto-update expiration date based on PLAN and JOIN DATE
    useEffect(() => {
        if (!joinDate || joinDate.length < 10) return;
        const [y, m, d] = joinDate.split('-').map(Number);
        if (!y || !m || !d) return;
        const baseDate = new Date(y, m - 1, d);
        if (isNaN(baseDate.getTime())) return;

        const newDate = new Date(baseDate);
        if (plan.includes('Trimestral')) newDate.setMonth(newDate.getMonth() + 3);
        else if (plan.includes('Mensual')) newDate.setMonth(newDate.getMonth() + 1);
        else newDate.setFullYear(newDate.getFullYear() + 1);

        if (!isNaN(newDate.getTime())) {
            setExpirationDate(newDate.toISOString().split('T')[0]);
        }
    }, [plan, joinDate]);

    // Update price based on plan selection
    useEffect(() => {
        if (!member) { // Only on create
            if (plan.includes('Trimestral')) setPlanPrice('150');
            else if (plan.includes('Mensual')) setPlanPrice('80');
            else setPlanPrice('80');
        }
    }, [plan, member]);

    // Auto-update status based on expiration date
    useEffect(() => {
        if (!expirationDate || expirationDate.length < 10) return;
        const [y, m, d] = expirationDate.split('-').map(Number);
        if (!y || !m || !d) return;
        const expDate = new Date(y, m - 1, d);
        if (isNaN(expDate.getTime())) return;
        expDate.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        setStatus(expDate < today ? 'overdue' : 'active');
    }, [expirationDate]);

    const debt = Math.max(0, (parseFloat(planPrice) || 0) - (parseFloat(amountPaid) || 0));

    const handleSubmit = () => {
        if (!name || !phone) return;
        onSubmit({
            id: member?.id, // Pass ID if editing
            name, dni, email, phone, plan, status,
            amountPaid: parseFloat(amountPaid) || 0,
            planPrice: parseFloat(planPrice) || 0,
            expirationDateStr: expirationDate, // Pass string 'YYYY-MM-DD'
            joinDateStr: joinDate, // Pass string 'YYYY-MM-DD'
            debt: debt
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
                                <option>Membresía Fit 2026</option>
                                <option>Plan Trimestral</option>
                                <option>Plan Mensual</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Estado</label>
                            <select
                                value={status}
                                onChange={(e) => setStatus(e.target.value as any)}
                                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-green-500 transition-colors appearance-none"
                            >
                                <option value="active">Activo</option>
                                <option value="pending">Pendiente</option>
                                <option value="prospect">Prospecto</option>
                                <option value="overdue">Vencido</option>
                            </select>
                        </div>
                    </div>

                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Fecha de Ingreso</label>
                        <input
                            type="date"
                            value={joinDate}
                            onChange={(e) => setJoinDate(e.target.value)}
                            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-green-500 transition-colors"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Fecha de Vencimiento</label>
                        <input
                            type="date"
                            value={expirationDate}
                            onChange={(e) => setExpirationDate(e.target.value)}
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
    const [selectedPlan, setSelectedPlan] = useState(member.plan);
    const [amount, setAmount] = useState('80'); // Default amount
    const [loading, setLoading] = useState(false);

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
                            <option>Membresía Fit 2026</option>
                            <option>Plan Trimestral</option>
                            <option>Plan Mensual</option>
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
    onSubmit: (amount: number, method: string) => void;
}) {
    const debt = Math.max(0, (member.planPrice || 0) - (member.amountPaid || 0));
    const [amount, setAmount] = useState(debt > 0 ? debt.toString() : '');
    const [method, setMethod] = useState('efectivo');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const parsed = parseFloat(amount);
        if (isNaN(parsed) || parsed <= 0) return;
        setLoading(true);
        await onSubmit(parsed, method);
        setLoading(false);
    };

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-sm p-6 space-y-5">
                <div className="flex justify-between items-center">
                    <h2 className="text-white font-semibold text-lg">Registrar Pago en Efectivo</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
                </div>
                <p className="text-gray-400 text-sm">Cliente: <span className="text-white font-medium">{member.name}</span></p>
                {debt > 0 && (
                    <p className="text-yellow-400 text-sm">Deuda pendiente: <span className="font-semibold">S/ {debt.toFixed(2)}</span></p>
                )}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="text-gray-400 text-sm block mb-1">Monto (S/)</label>
                        <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                            className="bg-neutral-800 border-neutral-700 text-white"
                            placeholder="0.00"
                            required
                        />
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
                    <Button type="submit" disabled={loading} className="w-full bg-green-600 hover:bg-green-700">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Banknote className="w-4 h-4 mr-2" />}
                        Registrar Pago
                    </Button>
                </form>
            </div>
        </div>
    );
}

// Actions Menu Component
function MemberActionsMenu({
    member,
    onAction
}: {
    member: Member;
    onAction: (action: 'payment' | 'cashPayment' | 'edit' | 'delete', member: Member) => void
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

    const handleClick = (action: 'payment' | 'cashPayment' | 'edit' | 'delete') => {
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
                        className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-neutral-800 flex items-center gap-2"
                    >
                        <Trash className="w-4 h-4" />
                        Eliminar
                    </button>
                </div>
            )}
        </div>
    );
}

export function MembersPage() {
    const [members, setMembers] = useState<Member[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'pending' | 'overdue' | 'prospect'>('all');
    const [loading, setLoading] = useState(true);

    // Modal State
    const [modalMode, setModalMode] = useState<'create' | 'edit' | 'none'>('none');
    const [selectedMember, setSelectedMember] = useState<Member | undefined>(undefined);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [showCashPaymentModal, setShowCashPaymentModal] = useState(false);

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

                // Si está activo pero ya venció, mostrar como vencido
                const now = new Date();
                const storedStatus = data.status || 'prospect';
                const computedStatus = (storedStatus === 'active' && expDateObj < now) ? 'overdue' : storedStatus;

                return {
                    id: doc.id,
                    name: data.name || 'Sin Nombre',
                    dni: data.dni || '',
                    email: data.email || '',
                    phone: data.phone || '',
                    plan: data.plan || '',
                    joinDate: data.createdAt?.toDate().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) || 'Reciente',
                    status: computedStatus as Member['status'],
                    avatarColor: `bg-${['green', 'blue', 'purple', 'orange', 'pink'][Math.floor(Math.random() * 5)]}-600`,
                    amountPaid: data.amountPaid,
                    planPrice: data.planPrice,
                    expirationDate,
                    expirationDateObj: expDateObj,
                    rawJoinDate: data.createdAt
                };
            });
            setMembers(fetchedMembers);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // Handlers
    const handleAction = (action: 'payment' | 'cashPayment' | 'edit' | 'delete', member: Member) => {
        if (action === 'payment') {
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
                deleteDoc(doc(db, 'members', member.id));
            }
        }
    };

    const handleCashPayment = async (amount: number, method: string) => {
        if (!selectedMember) return;
        const memberRef = doc(db, 'members', selectedMember.id);
        const today = new Date();
        const endDate = new Date();
        endDate.setMonth(today.getMonth() + 1);

        const planPrice = selectedMember.planPrice || 0;
        const prevPaid = selectedMember.amountPaid || 0;
        const newTotalPaid = prevPaid + amount;
        const newDebt = Math.max(0, planPrice - newTotalPaid);

        // Update member status and amountPaid (NO tocar fechas existentes)
        await updateDoc(memberRef, {
            status: 'active',
            amountPaid: newTotalPaid,
            debt: newDebt,
            payments: arrayUnion({ amount, method, date: today.toISOString() }),
            updatedAt: serverTimestamp()
        });

        // Add to `payments` collection so it appears in PaymentsPage
        const methodMap: Record<string, string> = {
            efectivo: 'Efectivo',
            transferencia: 'Transferencia',
            yape: 'Yape / Plin'
        };
        await addDoc(collection(db, 'payments'), {
            memberName: selectedMember.name,
            memberId: selectedMember.id,
            concept: selectedMember.plan || 'Membresía',
            amount,
            method: methodMap[method] || method,
            invoiceType: 'Boleta',
            date: today,
            createdAt: serverTimestamp()
        });

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
                    expirationDate: expirationDateObj, // Save Date
                    createdAt: joinDateObj // Save User Selected Date
                });
            } else if (modalMode === 'edit' && data.id) {
                await updateDoc(doc(db, 'members', data.id), {
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
                    startDate: data.joinDateStr,
                    endDate: data.expirationDateStr,
                    createdAt: joinDateObj,
                    updatedAt: serverTimestamp()
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
    const pendingMembers = members.filter(m => m.status === 'pending').length;
    const overdueMembers = members.filter(m => m.status === 'overdue').length;
    const prospectMembers = members.filter(m => m.status === 'prospect').length;

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
                        { id: 'pending', label: 'Pendiente', color: 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/50', inactive: 'bg-neutral-800 text-gray-400 hover:text-white' },
                        { id: 'prospect', label: 'Prospectos', color: 'bg-purple-500/20 text-purple-500 border border-purple-500/50', inactive: 'bg-neutral-800 text-gray-400 hover:text-white' },
                        { id: 'overdue', label: 'Vencido', color: 'bg-red-500/20 text-red-500 border border-red-500/50', inactive: 'bg-neutral-800 text-gray-400 hover:text-white' },
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
                                    <th className="px-6 py-4 font-medium">Ingreso</th>
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
                                            {member.joinDate}
                                        </td>
                                        <td className="px-6 py-4 text-gray-300">
                                            {member.expirationDate}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={cn(
                                                "px-3 py-1 rounded-full text-xs font-medium border",
                                                member.status === 'active' ? "bg-green-500/10 text-green-500 border-green-500/20" :
                                                    member.status === 'pending' ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" :
                                                        member.status === 'prospect' ? "bg-purple-500/10 text-purple-500 border-purple-500/20" :
                                                            "bg-red-500/10 text-red-500 border-red-500/20"
                                            )}>
                                                {member.status === 'active' ? 'Activo' :
                                                    member.status === 'pending' ? 'Pendiente' :
                                                        member.status === 'prospect' ? 'Prospecto' : 'Vencido'}
                                            </span>
                                            {(member.planPrice && member.amountPaid && member.planPrice > member.amountPaid) ? (
                                                <div className="mt-1">
                                                    <span className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-full font-bold">
                                                        Debe: S/ {(member.planPrice - member.amountPaid)}
                                                    </span>
                                                </div>
                                            ) : null}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <MemberActionsMenu
                                                member={member}
                                                onAction={handleAction}
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
                <StatsCard title="Prospectos" value={prospectMembers} color="text-purple-500" />
                <StatsCard title="Vencidos" value={pendingMembers + overdueMembers} color="text-red-500" />
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
        </div>
    )
}
