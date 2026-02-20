
import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download, Plus, DollarSign, TrendingUp, TrendingDown, Calendar, Search, MoreVertical, CreditCard, FileText, Banknote, Landmark } from 'lucide-react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
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

            // Process Members (Auto)
            membersData.forEach((data, index) => {
                const amountPaid = Number(data.amountPaid) || 0;
                const debt = Number(data.debt) || 0;

                // Date handling
                let dateObj = new Date();
                if (data.activeSince) {
                    dateObj = new Date(data.activeSince);
                } else if (data.joinDate && data.joinDate !== 'Reciente') {
                    // Try to parse if string? formatted date is hard to parse back safely without locale.
                    // Fallback to createdAt
                    if (data.createdAt?.toDate) dateObj = data.createdAt.toDate();
                } else if (data.createdAt?.toDate) {
                    dateObj = data.createdAt.toDate();
                }

                total += amountPaid;
                if (debt > 0) pending += debt;
                if (dateObj >= thirtyDaysAgo) count30Days++;

                // Chart
                const monthName = dateObj.toLocaleString('es-ES', { month: 'short' });
                const displayMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
                if (monthlyRevenue.hasOwnProperty(displayMonth)) {
                    monthlyRevenue[displayMonth] += amountPaid;
                }

                // Add to transactions list
                allTransactions.push({
                    id: data.id,
                    invoice: `INV-MEM-${String(index + 1).padStart(3, '0')}`, // Prefix to distinguish
                    user: data.name || 'Usuario Desconocido',
                    plan: data.plan || 'Membresía',
                    amount: amountPaid,
                    date: dateObj.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }),
                    rawDate: dateObj,
                    method: 'Efectivo', // Default for members currently
                    status: debt > 0 ? 'Pendiente' : 'Pagado',
                    type: 'Boleta' // Default
                });
            });

            // Process Payments (Manual)
            paymentsData.forEach((doc) => {
                const data = doc.data;
                const amount = Number(data.amount) || 0;
                const dateObj = data.date?.toDate ? data.date.toDate() : (new Date(data.date || new Date()));

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
                    type: data.invoiceType || 'Boleta'
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
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-white">Pagos y Facturación</h1>
                    <p className="text-gray-400">Gestiona transacciones e historial financiero</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" className="border-neutral-700 text-gray-300">
                        <Download className="mr-2 h-4 w-4" /> Exportar
                    </Button>
                    <Button
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => setIsNewInvoiceOpen(true)}
                    >
                        <Plus className="mr-2 h-4 w-4" /> Nueva Factura
                    </Button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-neutral-900 border-neutral-800 p-4">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm text-gray-400">Total Recaudado</p>
                            <h3 className="text-2xl font-bold text-white mt-1">
                                ${stats.totalRecaudado.toLocaleString()}
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
                                ${stats.pendiente.toLocaleString()}
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
                            <p className="text-sm text-gray-400">Reembolsos</p>
                            <h3 className="text-2xl font-bold text-white mt-1">$0</h3>
                            <p className="text-xs text-gray-500 mt-1">No implementado</p>
                        </div>
                        <div className="p-2 bg-neutral-800 rounded-lg text-gray-400">
                            <TrendingDown className="w-5 h-5" />
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

            {/* Chart */}
            <Card className="bg-neutral-900 border-neutral-800">
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
                                formatter={(value: any) => [`$${Number(value).toLocaleString()}`, 'Ingresos']}
                            />
                            <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                                <LabelList
                                    dataKey="total"
                                    position="bottom"
                                    offset={20}
                                    formatter={(value: unknown) => `$${Number(value).toLocaleString()}`}
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

            {/* Transactions Table */}
            <Card className="bg-neutral-900 border-neutral-800">
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
                        <table className="w-full text-left text-sm text-gray-400">
                            <thead className="bg-neutral-800/50 text-gray-300">
                                <tr>
                                    <th className="px-6 py-4">Miembro</th>
                                    <th className="px-6 py-4">Plan</th>
                                    <th className="px-6 py-4">Monto</th>
                                    <th className="px-6 py-4">Fecha</th>
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
                                        <td className="px-6 py-4 font-bold text-white">${tx.amount}</td>
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
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-white">
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
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
        </div>
    )
}
