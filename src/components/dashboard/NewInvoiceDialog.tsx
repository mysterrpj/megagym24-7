import { useState, useEffect } from 'react';
import { X, Loader2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { collection, addDoc, serverTimestamp, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface NewInvoiceDialogProps {
    onClose: () => void;
    onSuccess: () => void;
}

interface Member {
    id: string;
    name: string;
    dni: string;
}

export function NewInvoiceDialog({ onClose, onSuccess }: NewInvoiceDialogProps) {
    const [loading, setLoading] = useState(false);
    const [members, setMembers] = useState<Member[]>([]);
    const [searchingMembers, setSearchingMembers] = useState(true);

    // Form State
    const [selectedMemberId, setSelectedMemberId] = useState('');
    const [type, setType] = useState<'Boleta' | 'Factura'>('Boleta');
    const [ruc, setRuc] = useState('');
    const [razonSocial, setRazonSocial] = useState('');
    const [concept, setConcept] = useState('');
    const [amount, setAmount] = useState('');
    const [method, setMethod] = useState('Efectivo');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

    // Fetch members for dropdown
    useEffect(() => {
        const fetchMembers = async () => {
            try {
                const q = query(collection(db, 'members'), orderBy('name'));
                const snapshot = await getDocs(q);
                const fetched: Member[] = snapshot.docs.map(doc => ({
                    id: doc.id,
                    name: doc.data().name || 'Sin Nombre',
                    dni: doc.data().dni || ''
                }));
                setMembers(fetched);
            } catch (error) {
                console.error("Error fetching members", error);
            } finally {
                setSearchingMembers(false);
            }
        };
        fetchMembers();
    }, []);

    const handleMemberSelect = (value: string) => {
        setSelectedMemberId(value);
        // Auto-fill concept based on plan if possible? For now manual.
        // If it was a real app, we might fetch the member's plan price.
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const memberName = members.find(m => m.id === selectedMemberId)?.name || 'Cliente Casual';

            await addDoc(collection(db, 'payments'), {
                invoiceType: type, // Boleta | Factura
                ruc: type === 'Factura' ? ruc : null,
                razonSocial: type === 'Factura' ? razonSocial : null,
                concept,
                amount: parseFloat(amount),
                method,
                date: new Date(date), // Store as Date object
                memberId: selectedMemberId || null,
                memberName: memberName,
                createdAt: serverTimestamp(),
                status: 'completed' // Manual payments are completed by definition
            });

            onSuccess();
            onClose();
        } catch (error) {
            console.error("Error creating invoice:", error);
            alert("Error al crear el comprobante");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div
                className="bg-neutral-900 rounded-xl w-full max-w-lg border border-neutral-800 shadow-2xl flex flex-col max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-neutral-800">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <FileText className="w-5 h-5 text-green-500" />
                        Nueva {type}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-neutral-800 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto custom-scrollbar">

                    {/* Document Type */}
                    <div className="grid grid-cols-2 gap-4">
                        <div
                            className={`border rounded-lg p-3 cursor-pointer transition-all ${type === 'Boleta' ? 'border-green-500 bg-green-500/10' : 'border-neutral-700 hover:border-neutral-600'}`}
                            onClick={() => setType('Boleta')}
                        >
                            <div className="font-semibold text-white">Boleta</div>
                            <div className="text-xs text-gray-400">Para consumidor final</div>
                        </div>
                        <div
                            className={`border rounded-lg p-3 cursor-pointer transition-all ${type === 'Factura' ? 'border-green-500 bg-green-500/10' : 'border-neutral-700 hover:border-neutral-600'}`}
                            onClick={() => setType('Factura')}
                        >
                            <div className="font-semibold text-white">Factura</div>
                            <div className="text-xs text-gray-400">Para empresas (RUC)</div>
                        </div>
                    </div>

                    {/* Member Selection */}
                    <div className="space-y-2">
                        <Label>Cliente / Miembro</Label>
                        <Select value={selectedMemberId} onValueChange={handleMemberSelect} disabled={searchingMembers}>
                            <SelectTrigger className="bg-neutral-800 border-neutral-700 text-white">
                                <SelectValue placeholder="Seleccionar miembro (Opcional)" />
                            </SelectTrigger>
                            <SelectContent className="bg-neutral-800 border-neutral-700 text-white max-h-60">
                                <SelectItem value="casual">-- Cliente Casual --</SelectItem>
                                {members.map(member => (
                                    <SelectItem key={member.id} value={member.id}>
                                        {member.name} {member.dni ? `(${member.dni})` : ''}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Factura Fields */}
                    {type === 'Factura' && (
                        <div className="grid grid-cols-2 gap-4 bg-neutral-800/50 p-3 rounded-lg border border-neutral-700/50">
                            <div className="space-y-2">
                                <Label>RUC</Label>
                                <Input
                                    value={ruc}
                                    onChange={e => setRuc(e.target.value)}
                                    className="bg-neutral-900 border-neutral-700 text-white"
                                    placeholder="20..."
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Razón Social</Label>
                                <Input
                                    value={razonSocial}
                                    onChange={e => setRazonSocial(e.target.value)}
                                    className="bg-neutral-900 border-neutral-700 text-white"
                                    placeholder="Empresa SAC"
                                    required
                                />
                            </div>
                        </div>
                    )}

                    {/* Transaction Details */}
                    <div className="space-y-2">
                        <Label>Concepto</Label>
                        <Input
                            value={concept}
                            onChange={e => setConcept(e.target.value)}
                            className="bg-neutral-800 border-neutral-700 text-white"
                            placeholder="Ej. Membresía Mensual, Botella de Agua..."
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Monto (S/)</Label>
                            <Input
                                type="number"
                                step="0.01"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                                className="bg-neutral-800 border-neutral-700 text-white font-bold"
                                placeholder="0.00"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Método de Pago</Label>
                            <Select value={method} onValueChange={setMethod}>
                                <SelectTrigger className="bg-neutral-800 border-neutral-700 text-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-neutral-800 border-neutral-700 text-white">
                                    <SelectItem value="Efectivo">Efectivo</SelectItem>
                                    <SelectItem value="Tarjeta">Tarjeta</SelectItem>
                                    <SelectItem value="Transferencia">Transferencia</SelectItem>
                                    <SelectItem value="Yape/Plin">Yape / Plin</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Fecha de Emisión</Label>
                        <Input
                            type="date"
                            value={date}
                            onChange={e => setDate(e.target.value)}
                            className="bg-neutral-800 border-neutral-700 text-white"
                        />
                    </div>

                    {/* Actions */}
                    <div className="pt-4 flex gap-3">
                        <Button type="button" variant="outline" onClick={onClose} className="flex-1 border-neutral-700 text-gray-300">
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={loading} className="flex-1 bg-green-600 hover:bg-green-700 text-white">
                            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            Generar {type}
                        </Button>
                    </div>

                </form>
            </div>
        </div>
    );
}
