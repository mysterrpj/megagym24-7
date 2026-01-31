import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, Plus, X, MoreHorizontal, Edit2, Trash2, Users } from 'lucide-react';
import { useState, KeyboardEvent } from 'react';

// Type definitions
interface Membership {
    id: string;
    name: string;
    price: number;
    duration: number;
    benefits: string[];
    activeMembers: number;
    status: 'active' | 'inactive';
}

// Sample memberships
const sampleMemberships: Membership[] = [
    {
        id: '1',
        name: 'Plan Mensual',
        price: 80,
        duration: 30,
        benefits: ['Acceso ilimitado', 'Uso de duchas', 'App Fit IA'],
        activeMembers: 45,
        status: 'active'
    },
    {
        id: '2',
        name: 'Plan Trimestral',
        price: 150,
        duration: 90,
        benefits: ['Acceso ilimitado', 'Uso de duchas', 'App Fit IA', 'Clases grupales', 'Nutriólogo'],
        activeMembers: 28,
        status: 'active'
    },
];

// Create Membership Modal Component
function CreateMembershipModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (membership: Omit<Membership, 'id' | 'activeMembers' | 'status'>) => void }) {
    const [name, setName] = useState('');
    const [price, setPrice] = useState(500);
    const [duration, setDuration] = useState(30);
    const [benefits, setBenefits] = useState<string[]>([]);
    const [benefitInput, setBenefitInput] = useState('');

    const handleAddBenefit = () => {
        if (benefitInput.trim() && !benefits.includes(benefitInput.trim())) {
            setBenefits([...benefits, benefitInput.trim()]);
            setBenefitInput('');
        }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddBenefit();
        }
    };

    const handleRemoveBenefit = (benefit: string) => {
        setBenefits(benefits.filter(b => b !== benefit));
    };

    const handleSubmit = () => {
        if (!name) return;
        onSubmit({ name, price, duration, benefits });
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
                    <h2 className="text-xl font-bold text-white">Nueva Membresía</h2>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-neutral-800 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                {/* Form */}
                <div className="p-4 space-y-4">
                    {/* Name */}
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Nombre del Plan</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Membresía Fit 2026"
                            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors"
                        />
                    </div>

                    {/* Price & Duration Row */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Precio (MXN)</label>
                            <input
                                type="number"
                                value={price}
                                onChange={(e) => setPrice(Number(e.target.value))}
                                min={1}
                                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-green-500 transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Duración (Días)</label>
                            <input
                                type="number"
                                value={duration}
                                onChange={(e) => setDuration(Number(e.target.value))}
                                min={1}
                                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-green-500 transition-colors"
                            />
                        </div>
                    </div>

                    {/* Benefits */}
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Beneficios</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={benefitInput}
                                onChange={(e) => setBenefitInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Agregar beneficio..."
                                className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors"
                            />
                            <button
                                onClick={handleAddBenefit}
                                className="p-2.5 bg-neutral-800 border border-neutral-700 rounded-lg hover:bg-neutral-700 transition-colors"
                            >
                                <Plus className="w-5 h-5 text-green-500" />
                            </button>
                        </div>
                        {benefits.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3">
                                {benefits.map((benefit, idx) => (
                                    <span key={idx} className="inline-flex items-center gap-1 bg-neutral-800 text-gray-300 px-3 py-1 rounded-full text-sm">
                                        {benefit}
                                        <button onClick={() => handleRemoveBenefit(benefit)} className="hover:text-white">
                                            <X className="w-3 h-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Submit Button */}
                    <Button
                        onClick={handleSubmit}
                        disabled={!name}
                        className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Crear Plan
                    </Button>
                </div>
            </div>
        </div>
    );
}

// Membership Card Component
function MembershipCard({ membership, onEdit, onDelete }: { membership: Membership; onEdit: () => void; onDelete: () => void }) {
    const [showMenu, setShowMenu] = useState(false);

    return (
        <Card className="bg-neutral-900 border-neutral-800 overflow-hidden">
            {/* Green Gradient Header */}
            <div className="h-20 bg-gradient-to-br from-green-600 to-green-800 relative">
                <div className="absolute inset-0 bg-black/20" />
            </div>

            <CardContent className="p-4 -mt-4 relative">
                {/* Badge */}
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-bold text-white">{membership.name}</h3>
                    <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-medium">
                        Activo
                    </span>
                </div>

                {/* Price */}
                <div className="mb-4">
                    <span className="text-2xl font-bold text-green-400">${membership.price}</span>
                    <span className="text-gray-400 text-sm"> / {membership.duration} días</span>
                </div>

                {/* Benefits */}
                <div className="space-y-2 mb-4">
                    {membership.benefits.map((benefit, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm text-gray-300">
                            <Check className="w-4 h-4 text-green-500 shrink-0" />
                            {benefit}
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-4 border-t border-neutral-800">
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                        <Users className="w-4 h-4" />
                        {membership.activeMembers} miembros activos
                    </div>
                    <div className="relative">
                        <button
                            onClick={() => setShowMenu(!showMenu)}
                            className="p-1 hover:bg-neutral-800 rounded transition-colors"
                        >
                            <MoreHorizontal className="w-5 h-5 text-gray-400" />
                        </button>
                        {showMenu && (
                            <>
                                <div className="fixed inset-0" onClick={() => setShowMenu(false)} />
                                <div className="absolute right-0 bottom-8 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl py-1 min-w-[140px] z-10">
                                    <button
                                        onClick={() => { onEdit(); setShowMenu(false); }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-neutral-700 transition-colors"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                        Editar plan
                                    </button>
                                    <button
                                        onClick={() => { onDelete(); setShowMenu(false); }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-neutral-700 transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        Eliminar
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

export function MembershipsPage() {
    const [memberships, setMemberships] = useState<Membership[]>(sampleMemberships);
    const [showCreateModal, setShowCreateModal] = useState(false);

    const handleAddMembership = (data: Omit<Membership, 'id' | 'activeMembers' | 'status'>) => {
        const newMembership: Membership = {
            id: Date.now().toString(),
            ...data,
            activeMembers: 0,
            status: 'active'
        };
        setMemberships(prev => [...prev, newMembership]);
    };

    const handleDeleteMembership = (id: string) => {
        if (confirm('¿Estás seguro de eliminar esta membresía?')) {
            setMemberships(prev => prev.filter(m => m.id !== id));
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-white">Membresías</h1>
                    <p className="text-gray-400">Gestiona los planes de tu gimnasio</p>
                </div>
                <Button onClick={() => setShowCreateModal(true)} className="bg-green-600 hover:bg-green-700">
                    <Plus className="mr-2 h-4 w-4" /> Nueva Membresía
                </Button>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
                {memberships.map((membership) => (
                    <MembershipCard
                        key={membership.id}
                        membership={membership}
                        onEdit={() => console.log('Edit:', membership.id)}
                        onDelete={() => handleDeleteMembership(membership.id)}
                    />
                ))}
            </div>

            {/* Create Membership Modal */}
            {showCreateModal && (
                <CreateMembershipModal
                    onClose={() => setShowCreateModal(false)}
                    onSubmit={handleAddMembership}
                />
            )}
        </div>
    )
}
