
import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download, Plus, DollarSign, TrendingUp, TrendingDown, Calendar, Search, MoreVertical, CreditCard, FileText, Banknote, Landmark } from 'lucide-react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';

const data = [
    { name: 'Ago', total: 15200 },
    { name: 'Sep', total: 18500 },
    { name: 'Oct', total: 16800 },
    { name: 'Nov', total: 21000 },
    { name: 'Dic', total: 24500 },
    { name: 'Ene', total: 14191 },
];

const transactions = [
    { id: 1, invoice: 'INV-2025-001', user: 'María García', plan: 'Premium Mensual', amount: 799, date: '19 ene 2025', method: 'Tarjeta', status: 'Pagado' },
    { id: 2, invoice: 'INV-2025-002', user: 'Carlos López', plan: 'Básico Mensual', amount: 499, date: '18 ene 2025', method: 'Efectivo', status: 'Pendiente' },
    { id: 3, invoice: 'INV-2025-003', user: 'Ana Martínez', plan: 'Premium Trimestral', amount: 2099, date: '17 ene 2025', method: 'Transferencia', status: 'Pagado' },
];

export function PaymentsPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('Todos');
    const [activeTab, setActiveTab] = useState<'transacciones' | 'facturas'>('transacciones');

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
                    <Button className="bg-green-600 hover:bg-green-700">
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
                            <h3 className="text-2xl font-bold text-white mt-1">$10,895</h3>
                            <span className="text-xs text-red-500 flex items-center mt-1">
                                <TrendingDown className="w-3 h-3 mr-1" /> -4.2% vs mes anterior
                            </span>
                        </div>
                        <div className="p-2 bg-green-500/10 rounded-lg text-green-500">
                            <TrendingUp className="w-5 h-5" />
                        </div>
                    </div>
                </Card>
                <Card className="bg-neutral-900 border-neutral-800 p-4">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm text-gray-400">Pendiente</p>
                            <h3 className="text-2xl font-bold text-yellow-500 mt-1">$1,298</h3>
                            <p className="text-xs text-gray-500 mt-1">2 transacciones</p>
                        </div>
                        <div className="p-2 bg-yellow-500/10 rounded-lg text-yellow-500">
                            <DollarSign className="w-5 h-5" />
                        </div>
                    </div>
                </Card>
                <Card className="bg-neutral-900 border-neutral-800 p-4">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm text-gray-400">Reembolsos</p>
                            <h3 className="text-2xl font-bold text-white mt-1">$2,099</h3>
                            <p className="text-xs text-gray-500 mt-1">1 este mes</p>
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
                            <h3 className="text-2xl font-bold text-white mt-1">8</h3>
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
                        <BarChart data={data}>
                            <XAxis dataKey="name" stroke="#525252" fontSize={12} tickLine={false} axisLine={false} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#171717', border: '1px solid #262626' }}
                                itemStyle={{ color: '#fff' }}
                                cursor={{ fill: '#262626' }}
                            />
                            <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                                <LabelList
                                    dataKey="total"
                                    position="bottom"
                                    offset={20}
                                    formatter={(value: unknown) => `$${Number(value).toLocaleString()}`}
                                    style={{ fill: '#9ca3af', fontSize: 11 }}
                                />
                                {data.map((_entry, index) => (
                                    <Cell key={`cell-${index}`} fill={index === data.length - 1 ? '#22c55e' : '#3f3f46'} />
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
                                                {tx.user.split(' ').map(n => n[0]).join('')}
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
                </CardContent>
            </Card>
        </div>
    )
}
