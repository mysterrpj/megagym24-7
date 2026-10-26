
import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download, Plus, DollarSign, TrendingUp, Calendar, Search, MoreVertical, CreditCard, FileText, Banknote, Landmark, Receipt, Send } from 'lucide-react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { collection, query, orderBy, onSnapshot, doc, getDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import { NewInvoiceDialog } from '@/components/dashboard/NewInvoiceDialog';

interface Transaction {
    id: string;
    invoice: string;
    user: string;
    plan: string;
    amount: number;
    date: string; // Formatted date
    rawDate: Date; // For sorting
    method: string;
    status: 'Pagado' | 'Pendiente' | 'Reembolsado';
    type?: 'Boleta' | 'Factura';
    memberId?: string;
    phone?: string;
    orderId?: string;
    createdFrom?: 'member' | 'payment';
}

function toDate(value: any): Date {
    if (value?.toDate) return value.toDate();
    return new Date(value || new Date());
}

function amountKey(value: any): string {
    return (Number(value) || 0).toFixed(2);
}

function isSameRecordedPayment(memberPayment: any, paymentDoc: any): boolean {
    if (!paymentDoc.memberId) return false;
    if (amountKey(memberPayment.amount) !== amountKey(paymentDoc.amount)) return false;

    const memberDate = toDate(memberPayment.date);
    const docDate = toDate(paymentDoc.date || paymentDoc.createdAt);
    const timeDiffMs = Math.abs(memberDate.getTime() - docDate.getTime());

    // Cash payments created from MembersPage are written to both places using
    // the same timestamp. Keep one visible row so revenue is not double counted.
    return timeDiffMs <= 5 * 60 * 1000;
}

function formatVoucherText(tx: Transaction): string {
    const lines = [
        '---------------------',
        'MEGAGYM',
        'COMPROBANTE DE PAGO',
        '---------------------',
        `Cliente: ${tx.user}`,
        `Comprobante: ${tx.invoice}`,
        `Fecha: ${tx.date}`,
        `Concepto: ${tx.plan}`,
        `Metodo: ${tx.method}`,
        `Monto pagado: S/ ${tx.amount.toFixed(2)}`,
    ];

    if (tx.orderId) {
        lines.push(`Orden: ${tx.orderId}`);
    }

    lines.push('---------------------');
    lines.push('Gracias por entrenar con nosotros.');

    return lines.join('\n');
}

export function PaymentsPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('Todos');
    const [activeTab, setActiveTab] = useState<'transacciones' | 'facturas'>('transacciones');

    // State for real data
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [chartData, setChartData] = useState<{ name: string; total: number }[]>([]);
    const [stats, setStats] = useState({
        totalRecaudado: 0,
        pendiente: 0,
        reembolsos: 0, // We don't have this data yet, so 0
        transaccionesCount: 0,
        transaccionesLast30Days: 0
    });
    const [loading, setLoading] = useState(true);

    const [isNewInvoiceOpen, setIsNewInvoiceOpen] = useState(false);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [voucherTx, setVoucherTx] = useState<Transaction | null>(null);
    const [sendingVoucher, setSendingVoucher] = useState(false);

    const handleSendVoucher = async () => {
        if (!voucherTx?.phone) {
            alert('Este pago no tiene telefono registrado para reenviar por WhatsApp.');
            return;
        }

        try {
            setSendingVoucher(true);
            const sendManualWhatsAppMessage = httpsCallable(functions, 'sendManualWhatsAppMessage');
            await sendManualWhatsAppMessage({
                phone: voucherTx.phone,
                content: formatVoucherText(voucherTx)
            });
            alert('Voucher reenviado por WhatsApp.');
        } catch (error) {
            console.error('Error enviando voucher:', error);
            alert('No se pudo reenviar el voucher. Revisa la conexion o intenta nuevamente.');
        } finally {
            setSendingVoucher(false);
        }
    };

    const handleDeletePayment = async (txId: string) => {
        if (!confirm('¿Eliminar este pago? Esta acción no se puede deshacer.')) return;
        try {
            // txId format: "memberId-paymentIndex" for member payments, or plain doc id for manual payments
            const parts = txId.split('-');
            const lastPart = parts[parts.length - 1];
            const isIndex = !isNaN(Number(lastPart));

            if (isIndex) {
                const memberId = parts.slice(0, -1).join('-');
                const memberRef = doc(db, 'members', memberId);
                const memberSnap = await getDoc(memberRef);
                if (!memberSnap.exists()) return;
                const payments: any[] = memberSnap.data().payments || [];
                const idx = Number(lastPart);
                const newPayments = payments.filter((_: any, i: number) => i !== idx);
                await updateDoc(memberRef, { payments: newPayments, updatedAt: serverTimestamp() });
            } else {
                await deleteDoc(doc(db, 'payments', txId));
            }
            setOpenMenuId(null);
        } catch (e: any) {
            alert('Error al eliminar: ' + e.message);
        }
    };

    useEffect(() => {
        // Fetch members (Automatic Transactions)
        const qMembers = query(collection(db, 'members'), orderBy('createdAt', 'desc'));

        // Fetch manual payments (Manual Transactions)
        const qPayments = query(collection(db, 'payments'), orderBy('createdAt', 'desc'));

        // We need to listen to both. 
        // Note: nesting subscribers is a bit messy, allow independent updates?
        // Let's use a combined state approach or just two listeners updating the same list?
        // Better: Fetch both, combine, sort.
        // For simplicity in this "dashboard" view, we will just listen to both and merge on every update.

        let membersData: any[] = [];
        let paymentsData: any[] = [];

        const updateState = () => {
            let total = 0;
            let pending = 0;
            let count30Days = 0;
            const now = new Date();
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(now.getDate() - 30);

            const allTransactions: Transaction[] = [];
            const monthlyRevenue: Record<string, number> = {};

            // Initialize last 6 months for chart
            for (let i = 5; i >= 0; i--) {
                const d = new Date();
                d.setMonth(d.getMonth() - i);
                const displayMonth = d.toLocaleString('es-ES', { month: 'short' }).charAt(0).toUpperCase() + d.toLocaleString('es-ES', { month: 'short' }).slice(1);
                if (!monthlyRevenue[displayMonth]) monthlyRevenue[displayMonth] = 0;
            }

            // Process Members - one row per individual payment
            membersData.forEach((data) => {
                const payments: any[] = Array.isArray(data.payments) ? data.payments : [];

                if (payments.length > 0) {
                    // Show each payment individually
                    payments.forEach((pago: any, pIndex: number) => {
                        const isDuplicatedInPaymentsCollection = paymentsData.some((paymentDoc) => {
                            const paymentData = paymentDoc.data;
                            return paymentData.memberId === data.id && isSameRecordedPayment(pago, paymentData);
                        });

                        if (isDuplicatedInPaymentsCollection) return;

                        const amount = Number(pago.amount) || 0;
                        if (amount <= 0) return;
                        let dateObj = new Date();
                        if (pago.date) dateObj = new Date(pago.date);

                        total += amount;
                        if (dateObj >= thirtyDaysAgo) count30Days++;

                        const monthName = dateObj.toLocaleString('es-ES', { month: 'short' });
                        const displayMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
                        if (monthlyRevenue.hasOwnProperty(displayMonth)) {
                            monthlyRevenue[displayMonth] += amount;
                        }

                        allTransactions.push({
                            id: `${data.id}-${pIndex}`,
                            invoice: `PAG-${data.id.substring(0, 4).toUpperCase()}-${pIndex + 1}`,
                            user: data.name || 'Usuario Desconocido',
                            plan: data.plan || 'Membresía',
                            amount,
                            date: dateObj.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }),
                            rawDate: dateObj,
                            method: pago.method || 'Efectivo',
                            status: 'Pagado',
                            type: 'Boleta',
                            memberId: data.id,
                            phone: data.phone || '',
                            orderId: pago.orderId || pago.chargeId || '',
                            createdFrom: 'member'
                        });
                    });
                } else {
                    // Miembro sin array de pagos — usar amountPaid total como antes
                    const amountPaid = Number(data.amountPaid) || 0;
                    const debt = Number(data.debt) || 0;
                    if (amountPaid === 0) return;

                    let dateObj = new Date();
                    if (data.createdAt?.toDate) dateObj = data.createdAt.toDate();

                    total += amountPaid;
                    if (debt > 0) pending += debt;
                    if (dateObj >= thirtyDaysAgo) count30Days++;

                    const monthName = dateObj.toLocaleString('es-ES', { month: 'short' });
                    const displayMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
                    if (monthlyRevenue.hasOwnProperty(displayMonth)) {
                        monthlyRevenue[displayMonth] += amountPaid;
                    }

                    allTransactions.push({
                        id: data.id,
                        invoice: `PAG-${data.id.substring(0, 6).toUpperCase()}`,
                        user: data.name || 'Usuario Desconocido',
                        plan: data.plan || 'Membresía',
                        amount: amountPaid,
                        date: dateObj.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }),
                        rawDate: dateObj,
                        method: 'Efectivo',
                        status: debt > 0 ? 'Pendiente' : 'Pagado',
                        type: 'Boleta',
                        memberId: data.id,
                        phone: data.phone || '',
                        createdFrom: 'member'
                    });
                }
            });

            // Process Payments (Manual)
            paymentsData.forEach((doc) => {
                const data = doc.data;
                const amount = Number(data.amount) || 0;
                if (amount <= 0) return;
                const dateObj = data.date?.toDate ? data.date.toDate() : (new Date(data.date || new Date()));
                const linkedMember = data.memberId ? membersData.find((member) => member.id === data.memberId) : null;

                total += amount;
                // Manual payments are usually "paid" immediately, no debt tracking here yet.
                if (dateObj >= thirtyDaysAgo) count30Days++;

                // Chart
                const monthName = dateObj.toLocaleString('es-ES', { month: 'short' });
                const displayMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
                if (monthlyRevenue.hasOwnProperty(displayMonth)) {
                    monthlyRevenue[displayMonth] += amount;
                }

                allTransactions.push({
                    id: doc.id,
                    invoice: `${data.invoiceType === 'Factura' ? 'FAC' : 'BOL'}-${doc.id.substring(0, 6).toUpperCase()}`,
                    user: data.memberName || 'Cliente Casual',
                    plan: data.concept || 'Venta',
                    amount: amount,
                    date: dateObj.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }),
                    rawDate: dateObj,
                    method: data.method || 'Efectivo',
                    status: 'Pagado',
                    type: data.invoiceType || 'Boleta',
                    memberId: data.memberId || linkedMember?.id,
                    phone: data.phone || linkedMember?.phone || '',
                    orderId: data.orderId || data.chargeId || '',
                    createdFrom: 'payment'
                });
            });

            // Sort by date desc
            allTransactions.sort((a, b) => b.rawDate.getTime() - a.rawDate.getTime());

            setTransactions(allTransactions);
            setStats({
                totalRecaudado: total,
                pendiente: pending,
                reembolsos: 0,
                transaccionesCount: allTransactions.length,
                transaccionesLast30Days: count30Days
            });

            const newChartData = Object.entries(monthlyRevenue).map(([name, total]) => ({
                name,
                total
            }));
            setChartData(newChartData);
            setLoading(false);
        };

        const unsubMembers = onSnapshot(qMembers, (snapshot) => {
            membersData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            updateState();
        });

        const unsubPayments = onSnapshot(qPayments, (snapshot) => {
            paymentsData = snapshot.docs.map(d => ({ id: d.id, data: d.data() }));
            updateState();
        });

        return () => {
            unsubMembers();
            unsubPayments();
        };
    }, []);

    const filteredTransactions = transactions.filter(tx => {
        const matchesSearch = tx.user.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'Todos' || tx.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    return (
        <div className="flex h-[calc(100dvh-6rem)] min-w-0 flex-col gap-3 md:h-auto md:min-h-0 md:gap-6">
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                        <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">Pagos</h1>
                        <span className="text-xs font-medium text-gray-500">{stats.transaccionesLast30Days} últimos 30 días</span>
                    </div>
                    <p className="hidden text-sm text-gray-400 md:block">Transacciones, comprobantes e historial financiero</p>
                </div>
                <div className="flex shrink-0 gap-2">
                    <Button variant="outline" size="icon" disabled aria-label="Exportar pagos, próximamente" className="hidden h-9 w-9 border-neutral-700 text-gray-500 md:inline-flex">
                        <Download className="h-4 w-4" />
                    </Button>
                    <Button
                        className="h-9 bg-green-600 px-3 text-sm font-semibold hover:bg-green-700"
                        onClick={() => setIsNewInvoiceOpen(true)}
                    >
                        <Plus className="mr-1.5 h-4 w-4" /> Nuevo
                    </Button>
                </div>
            </div>

            {/* Compact mobile payments view */}
            <div className="flex min-h-0 flex-1 flex-col gap-2 md:hidden">
                <div className="grid grid-cols-3 divide-x divide-white/[0.07] rounded-lg border border-white/10 bg-neutral-900 px-1 py-2.5">
                    <div className="min-w-0 px-2 text-center">
                        <p className="truncate text-base font-bold tabular-nums text-green-400">S/ {stats.totalRecaudado.toLocaleString()}</p>
                        <p className="mt-0.5 text-[9px] text-gray-600">Recaudado</p>
                    </div>
                    <div className="min-w-0 px-2 text-center">
                        <p className={`truncate text-base font-bold tabular-nums ${stats.pendiente > 0 ? 'text-amber-400' : 'text-white'}`}>S/ {stats.pendiente.toLocaleString()}</p>
                        <p className="mt-0.5 text-[9px] text-gray-600">Pendiente</p>
                    </div>
                    <div className="min-w-0 px-2 text-center">
                        <p className="text-base font-bold tabular-nums text-white">{stats.transaccionesLast30Days}</p>
                        <p className="mt-0.5 text-[9px] text-gray-600">Pagos</p>
                    </div>
                </div>

                <div className="flex gap-2">
                    <div className="relative min-w-0 flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-600" />
                        <Input
                            aria-label="Buscar pagos por miembro"
                            placeholder="Buscar miembro"
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            className="h-9 rounded-lg border-white/10 bg-neutral-900 pl-9 text-xs text-white placeholder:text-gray-600"
                        />
                    </div>
                    <div className="grid shrink-0 grid-cols-3 rounded-lg border border-white/10 bg-neutral-900 p-0.5">
                        {['Todos', 'Pagado', 'Pendiente'].map((status) => (
                            <button
                                type="button"
                                key={status}
                                aria-pressed={statusFilter === status}
                                onClick={() => setStatusFilter(status)}
                                className={`rounded px-2 py-1 text-[9px] font-semibold transition-colors ${statusFilter === status ? 'bg-green-500 text-neutral-950' : 'text-gray-600'}`}
                            >
                                {status === 'Pendiente' ? 'Deuda' : status}
                            </button>
                        ))}
                    </div>
                </div>

                <Card className="min-h-0 flex-1 overflow-hidden border-white/10 bg-neutral-900">
                    <CardContent className="h-full divide-y divide-white/[0.07] overflow-y-auto overscroll-contain p-0">
                        {loading ? (
                            <div className="grid min-h-40 place-items-center text-sm text-gray-500">Cargando pagos…</div>
                        ) : filteredTransactions.length === 0 ? (
                            <div className="grid min-h-40 place-items-center px-6 text-center">
                                <div>
                                    <Receipt className="mx-auto h-6 w-6 text-gray-700" />
                                    <p className="mt-2 text-sm font-semibold text-gray-300">No hay pagos para mostrar</p>
                                    <p className="mt-1 text-xs text-gray-600">Cambia el filtro o realiza otra búsqueda.</p>
                                </div>
                            </div>
                        ) : filteredTransactions.map((tx) => (
                            <article key={tx.id} className="relative grid min-h-[4.75rem] grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 px-3 py-2.5 transition-colors hover:bg-white/[0.025]">
                                <span className={`absolute inset-y-2 left-0 w-0.5 rounded-full ${tx.status === 'Pagado' ? 'bg-green-500' : tx.status === 'Pendiente' ? 'bg-amber-400' : 'bg-gray-600'}`} />
                                <div className="min-w-0 pl-1">
                                    <div className="flex min-w-0 items-center gap-1.5">
                                        <p className="truncate text-sm font-semibold text-white">{tx.user}</p>
                                        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold ${tx.status === 'Pagado' ? 'bg-green-500/10 text-green-400' : tx.status === 'Pendiente' ? 'bg-amber-500/10 text-amber-300' : 'bg-white/5 text-gray-400'}`}>{tx.status}</span>
                                    </div>
                                    <p className="mt-0.5 truncate text-[11px] text-gray-500">{tx.plan} · {tx.method}</p>
                                    <p className="mt-0.5 truncate text-[9px] text-gray-600">{tx.date} · {tx.invoice}</p>
                                </div>
                                <p className="whitespace-nowrap text-sm font-bold tabular-nums text-white">S/ {tx.amount.toFixed(2)}</p>
                                <div className="relative">
                                    <button type="button" aria-label={`Acciones del pago de ${tx.user}`} aria-expanded={openMenuId === tx.id} onClick={() => setOpenMenuId(openMenuId === tx.id ? null : tx.id)} className="grid h-9 w-9 place-items-center rounded-lg text-gray-500 hover:bg-neutral-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-green-500">
                                        <MoreVertical className="h-4 w-4" />
                                    </button>
                                    {openMenuId === tx.id && (
                                        <>
                                            <button type="button" aria-label="Cerrar acciones" className="fixed inset-0 z-40 bg-black/40" onClick={() => setOpenMenuId(null)} />
                                            <div className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 rounded-xl border border-white/10 bg-neutral-900 p-1.5 shadow-2xl">
                                                <button type="button" onClick={() => { setVoucherTx(tx); setOpenMenuId(null); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-3 text-sm text-gray-200 hover:bg-neutral-800">
                                                    <Receipt className="h-4 w-4 text-green-400" /> Ver o reenviar voucher
                                                </button>
                                                <button type="button" onClick={() => handleDeletePayment(tx.id)} className="flex w-full items-center gap-2 rounded-lg px-3 py-3 text-sm text-red-400 hover:bg-neutral-800">
                                                    <MoreVertical className="h-4 w-4" /> Eliminar registro
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </article>
                        ))}
                    </CardContent>
                </Card>
            </div>

            {/* Desktop stats cards */}
            <div className="hidden grid-cols-1 gap-4 md:grid md:grid-cols-3">
                <Card className="bg-neutral-900 border-neutral-800 p-4">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm text-gray-400">Total Recaudado</p>
                            <h3 className="text-2xl font-bold text-white mt-1">
                                S/ {stats.totalRecaudado.toLocaleString()}
                            </h3>
                            <span className="text-xs text-green-500 flex items-center mt-1">
                                <TrendingUp className="w-3 h-3 mr-1" /> Calculado de miembros
                            </span>
                        </div>
                        <div className="p-2 bg-green-500/10 rounded-lg text-green-500">
                            <DollarSign className="w-5 h-5" />
                        </div>
                    </div>
                </Card>
                <Card className="bg-neutral-900 border-neutral-800 p-4">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm text-gray-400">Pendiente</p>
                            <h3 className="text-2xl font-bold text-yellow-500 mt-1">
                                S/ {stats.pendiente.toLocaleString()}
                            </h3>
                            <p className="text-xs text-gray-500 mt-1">Deuda acumulada</p>
                        </div>
                        <div className="p-2 bg-yellow-500/10 rounded-lg text-yellow-500">
                            <FileText className="w-5 h-5" />
                        </div>
                    </div>
                </Card>
                <Card className="bg-neutral-900 border-neutral-800 p-4">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm text-gray-400">Transacciones</p>
                            <h3 className="text-2xl font-bold text-white mt-1">{stats.transaccionesLast30Days}</h3>
                            <p className="text-xs text-gray-500 mt-1">Últimos 30 días</p>
                        </div>
                        <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                            <Calendar className="w-5 h-5" />
                        </div>
                    </div>
                </Card>
            </div>

            {/* Desktop chart */}
            <Card className="hidden bg-neutral-900 border-neutral-800 md:block">
                <CardHeader className="flex flex-row items-center justify-between pb-8">
                    <CardTitle className="text-white text-lg">Ingresos Mensuales</CardTitle>
                    <span className="text-xs bg-green-500/10 text-green-500 px-2 py-1 rounded-full">Últimos 6 meses</span>
                </CardHeader>
                <CardContent className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                            <XAxis dataKey="name" stroke="#525252" fontSize={12} tickLine={false} axisLine={false} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#171717', border: '1px solid #262626' }}
                                itemStyle={{ color: '#fff' }}
                                cursor={{ fill: '#262626' }}
                                formatter={(value: any) => [`S/ ${Number(value).toLocaleString()}`, 'Ingresos']}
                            />
                            <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                                <LabelList
                                    dataKey="total"
                                    position="bottom"
                                    offset={20}
                                    formatter={(value: unknown) => `S/ ${Number(value).toLocaleString()}`}
                                    style={{ fill: '#9ca3af', fontSize: 11 }}
                                />
                                {chartData.map((_entry, index) => (
                                    <Cell key={`cell-${index}`} fill={index === chartData.length - 1 ? '#22c55e' : '#3f3f46'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* Desktop transactions table */}
            <Card className="hidden bg-neutral-900 border-neutral-800 md:block">
                <CardHeader className="space-y-4">
                    {/* Tabs */}
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            variant={activeTab === 'transacciones' ? 'default' : 'outline'}
                            className={activeTab === 'transacciones'
                                ? 'bg-green-600 hover:bg-green-700 text-white'
                                : 'border-neutral-700 text-gray-400'}
                            onClick={() => setActiveTab('transacciones')}
                        >
                            <CreditCard className="w-4 h-4 mr-2" /> Transacciones
                        </Button>
                        <Button
                            size="sm"
                            variant={activeTab === 'facturas' ? 'default' : 'outline'}
                            className={activeTab === 'facturas'
                                ? 'bg-green-600 hover:bg-green-700 text-white'
                                : 'border-neutral-700 text-gray-400'}
                            onClick={() => setActiveTab('facturas')}
                        >
                            <FileText className="w-4 h-4 mr-2" /> Facturas
                        </Button>
                    </div>
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <Input
                                placeholder="Buscar por miembro..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="pl-10 bg-neutral-800 border-neutral-700 text-white placeholder:text-gray-500"
                            />
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            {['Todos', 'Pagado', 'Pendiente', 'Reembolsado'].map((status) => (
                                <Button
                                    key={status}
                                    size="sm"
                                    variant={statusFilter === status ? 'default' : 'outline'}
                                    className={statusFilter === status
                                        ? 'bg-green-600 hover:bg-green-700 text-white'
                                        : 'border-neutral-700 text-gray-400 hover:text-white'}
                                    onClick={() => setStatusFilter(status)}
                                >
                                    {status}
                                </Button>
                            ))}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="text-center py-12 text-gray-400">Cargando transacciones...</div>
                    ) : (
                        <div className="overflow-x-auto">
                        <table className="min-w-[56rem] w-full text-left text-sm text-gray-400">
                            <thead className="bg-neutral-800/50 text-gray-300">
                                <tr>
                                    <th className="px-6 py-4">Miembro</th>
                                    <th className="px-6 py-4">Plan</th>
                                    <th className="px-6 py-4">Monto</th>
                                    <th className="px-6 py-4">Fecha del movimiento</th>
                                    <th className="px-6 py-4">Método</th>
                                    <th className="px-6 py-4">Estado</th>
                                    <th className="px-6 py-4 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-800">
                                {filteredTransactions.map((tx) => (
                                    <tr key={tx.id} className="hover:bg-neutral-800/50">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-neutral-700 flex items-center justify-center text-xs font-medium text-white">
                                                    {tx.user.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div className="font-medium text-white">{tx.user}</div>
                                                    <div className="text-xs text-gray-500">{tx.invoice}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">{tx.plan}</td>
                                        <td className="px-6 py-4 font-bold text-white">S/ {tx.amount.toFixed(2)}</td>
                                        <td className="px-6 py-4">{tx.date}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                {tx.method === 'Tarjeta' && <CreditCard className="w-4 h-4 text-blue-400" />}
                                                {tx.method === 'Efectivo' && <Banknote className="w-4 h-4 text-green-400" />}
                                                {tx.method === 'Transferencia' && <Landmark className="w-4 h-4 text-purple-400" />}
                                                <span>{tx.method}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${tx.status === 'Pagado' ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500'
                                                }`}>
                                                {tx.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="relative inline-block">
                                                <Button
                                                    variant="ghost" size="icon"
                                                    className="h-8 w-8 text-gray-400 hover:text-white"
                                                    onClick={() => setOpenMenuId(openMenuId === tx.id ? null : tx.id)}
                                                >
                                                    <MoreVertical className="h-4 w-4" />
                                                </Button>
                                                {openMenuId === tx.id && (
                                                    <div className="absolute right-0 mt-1 w-56 bg-neutral-800 border border-neutral-700 rounded-md shadow-lg z-10">
                                                        <button
                                                            className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-neutral-700 rounded-t-md flex items-center gap-2"
                                                            onClick={() => {
                                                                setVoucherTx(tx);
                                                                setOpenMenuId(null);
                                                            }}
                                                        >
                                                            <Receipt className="h-4 w-4 text-green-400" />
                                                            Ver / reenviar voucher
                                                        </button>
                                                        <button
                                                            className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-neutral-700 rounded-b-md"
                                                            onClick={() => handleDeletePayment(tx.id)}
                                                        >
                                                            Eliminar
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        </div>
                    )}
                </CardContent>
            </Card>
            {isNewInvoiceOpen && (
                <NewInvoiceDialog
                    onClose={() => setIsNewInvoiceOpen(false)}
                    onSuccess={() => {
                        // Real-time listener handles update
                    }}
                />
            )}
            {voucherTx && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                    <div className="bg-neutral-900 border border-neutral-800 rounded-lg w-full max-w-md">
                        <div className="p-5 border-b border-neutral-800 flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-bold text-white">Voucher de pago</h2>
                                <p className="text-sm text-gray-400">{voucherTx.user}</p>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-gray-400 hover:text-white"
                                onClick={() => setVoucherTx(null)}
                            >
                                Cerrar
                            </Button>
                        </div>
                        <div className="p-5 space-y-4">
                            <pre className="whitespace-pre-wrap rounded-md border border-neutral-700 bg-neutral-950 p-4 text-sm text-gray-200 font-sans">
                                {formatVoucherText(voucherTx)}
                            </pre>
                            {!voucherTx.phone && (
                                <p className="text-sm text-yellow-400">
                                    Este pago no tiene telefono registrado. Puedes verlo, pero no reenviarlo por WhatsApp.
                                </p>
                            )}
                            <Button
                                className="w-full bg-green-600 hover:bg-green-700 text-white"
                                disabled={sendingVoucher || !voucherTx.phone}
                                onClick={handleSendVoucher}
                            >
                                <Send className="h-4 w-4 mr-2" />
                                {sendingVoucher ? 'Enviando...' : 'Reenviar por WhatsApp'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
