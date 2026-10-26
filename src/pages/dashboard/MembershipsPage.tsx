import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, X, MoreHorizontal, Edit2, Trash2, Users, Loader2 } from 'lucide-react';
import { useState, KeyboardEvent, useEffect } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

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

// Create Membership Modal Component
function CreateMembershipModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (membership: Omit<Membership, 'id' | 'activeMembers' | 'status'>) => Promise<void> }) {
    const [name, setName] = useState('');
    const [price, setPrice] = useState(70);
    const [duration, setDuration] = useState(30);
    const [benefits, setBenefits] = useState<string[]>([]);
    const [benefitInput, setBenefitInput] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

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

    const handleSubmit = async () => {
        if (!name) return;
        setIsSubmitting(true);
        try {
            await onSubmit({ name, price, duration, benefits });
            onClose();
        } catch (error) {
            console.error("Error creating membership:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-3 sm:items-center sm:p-4" onClick={onClose}>
            <div
                className="my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-900 shadow-2xl sm:max-h-[calc(100dvh-2rem)]"
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
                            placeholder="Plan Mensual"
                            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors"
                        />
                    </div>

                    {/* Price & Duration Row */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Precio (S/)</label>
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
                        disabled={!name || isSubmitting}
                        className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        Crear Plan
                    </Button>
                </div>
            </div>
        </div>
    );
}

// Compact membership row
function MembershipRow({ membership, onEdit, onDelete }: { membership: Membership; onEdit: () => void; onDelete: () => void }) {
    const [showMenu, setShowMenu] = useState(false);
    const isActive = membership.status !== 'inactive';

    return (
        <article className="relative grid min-h-[5.5rem] grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 transition-colors hover:bg-white/[0.025] sm:grid-cols-[5.5rem_minmax(12rem,1fr)_minmax(9rem,0.7fr)_auto] sm:px-4">
            <div className="min-w-0 border-r border-white/[0.07] pr-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600">Precio</p>
                <p className="mt-1 whitespace-nowrap text-lg font-bold tabular-nums text-green-400">S/ {membership.price}</p>
            </div>

            <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                    <h3 className="truncate text-sm font-bold uppercase tracking-wide text-white">{membership.name}</h3>
                    <span className={isActive
                        ? "shrink-0 rounded-full bg-green-500/10 px-1.5 py-0.5 text-[9px] font-bold text-green-400"
                        : "shrink-0 rounded-full bg-white/5 px-1.5 py-0.5 text-[9px] font-bold text-gray-400"
                    }>
                        {isActive ? 'Activo' : 'Inactivo'}
                    </span>
                </div>
                <p className="mt-1 text-xs text-gray-500">{membership.duration} días</p>
                {membership.benefits.length > 0 && (
                    <p className="mt-1 truncate text-[10px] text-gray-600">{membership.benefits.slice(0, 2).join(' · ')}</p>
                )}
            </div>

            <div className="hidden min-w-0 items-center gap-2 text-sm text-gray-400 sm:flex">
                <Users className="h-4 w-4 shrink-0 text-gray-600" />
                <span>{membership.activeMembers || 0} miembro{membership.activeMembers === 1 ? '' : 's'} activo{membership.activeMembers === 1 ? '' : 's'}</span>
            </div>

            <div className="flex items-center gap-1">
                <div className="flex items-center gap-1 text-[10px] text-gray-500 sm:hidden">
                    <Users className="h-3.5 w-3.5" />
                    <span className="tabular-nums">{membership.activeMembers || 0}</span>
                </div>
                <div className="relative">
                    <button
                        type="button"
                        aria-label={`Acciones de ${membership.name}`}
                        aria-expanded={showMenu}
                        onClick={() => setShowMenu(!showMenu)}
                        className="grid h-9 w-9 place-items-center rounded-lg text-gray-500 transition-colors hover:bg-neutral-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                        <MoreHorizontal className="h-5 w-5" />
                    </button>
                    {showMenu && (
                        <>
                            <button type="button" aria-label="Cerrar menú" className="fixed inset-0 z-40 bg-black/40 sm:bg-transparent" onClick={() => setShowMenu(false)} />
                            <div className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 rounded-xl border border-white/10 bg-neutral-900 p-1.5 shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-10 sm:w-40 sm:rounded-lg">
                                <button
                                    type="button"
                                    onClick={() => { onEdit(); setShowMenu(false); }}
                                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-gray-300 transition-colors hover:bg-neutral-800"
                                >
                                    <Edit2 className="h-4 w-4" />
                                    Editar plan
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { onDelete(); setShowMenu(false); }}
                                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-red-400 transition-colors hover:bg-neutral-800"
                                >
                                    <Trash2 className="h-4 w-4" />
                                    Eliminar
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <span className={isActive ? "absolute inset-y-2 left-0 w-0.5 rounded-full bg-green-500" : "absolute inset-y-2 left-0 w-0.5 rounded-full bg-gray-600"} />
        </article>
    );
}

export function MembershipsPage() {
    const [memberships, setMemberships] = useState<Membership[]>([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [loading, setLoading] = useState(true);

    // Fetch memberships from Firestore
    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, 'memberships'), (snapshot) => {
            const fetchedMemberships: Membership[] = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Membership));
            setMemberships(fetchedMemberships);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching memberships:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // NEW: Fetch active member counts
    const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});

    useEffect(() => {
        // Query only active members
        const q = query(collection(db, 'members'), where('status', '==', 'active'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const counts: Record<string, number> = {};

            snapshot.docs.forEach(doc => {
                const data = doc.data();
                const planName = data.plan; // This corresponds to membership.name

                // Debug log
                // console.log('Member found:', { id: doc.id, plan: planName });

                if (planName) {
                    // Count exact match
                    counts[planName] = (counts[planName] || 0) + 1;

                    // Count normalized match (uppercase, trimmed)
                    const normalized = planName.trim().toUpperCase();
                    if (normalized !== planName) {
                        counts[normalized] = (counts[normalized] || 0) + 1;
                    }
                }
            });

            console.log('Member Counts:', counts);
            setMemberCounts(counts);
        }, (error) => {
            console.error("Error fetching member counts:", error);
        });

        return () => unsubscribe();
    }, []);

    const handleAddMembership = async (data: Omit<Membership, 'id' | 'activeMembers' | 'status'>) => {
        try {
            await addDoc(collection(db, 'memberships'), {
                ...data,
                // Ensure price and duration are numbers
                price: Number(data.price),
                duration: Number(data.duration),
                activeMembers: 0,
                status: 'active',
                createdAt: serverTimestamp()
            });
        } catch (error) {
            console.error("Error adding membership:", error);
            alert("Error al crear la membresía");
            throw error;
        }
    };

    const handleDeleteMembership = async (id: string) => {
        if (confirm('¿Estás seguro de eliminar esta membresía?')) {
            try {
                await deleteDoc(doc(db, 'memberships', id));
            } catch (error) {
                console.error("Error deleting membership:", error);
                alert("Error al eliminar la membresía");
            }
        }
    };

    if (loading) {
        return <div className="flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin text-green-500" /></div>;
    }

    return (
        <div className="flex h-[calc(100dvh-6rem)] min-w-0 flex-col gap-3 sm:h-auto sm:min-h-0 sm:gap-4">
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                        <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">Membresías</h1>
                        <span className="text-xs font-medium text-gray-500">{memberships.length} planes</span>
                    </div>
                    <p className="hidden text-sm text-gray-400 sm:block">Precios, duración y miembros por plan</p>
                </div>
                <Button
                    onClick={() => setShowCreateModal(true)}
                    aria-label="Crear nueva membresía"
                    className="h-9 shrink-0 bg-green-600 px-3 text-sm font-semibold hover:bg-green-700"
                >
                    <Plus className="mr-1.5 h-4 w-4" /> Nuevo
                </Button>
            </div>

            {memberships.length === 0 ? (
                <div className="grid min-h-0 flex-1 place-items-center rounded-xl border border-white/10 bg-neutral-900/50 px-6 text-center">
                    <div>
                        <h3 className="text-lg font-semibold text-white">No hay membresías creadas</h3>
                        <p className="mt-2 text-sm text-gray-500">Crea tu primer plan para comenzar a recibir miembros.</p>
                        <Button onClick={() => setShowCreateModal(true)} variant="outline" className="mt-5 border-green-600 text-green-500 hover:bg-green-600 hover:text-white">
                            Crear primer plan
                        </Button>
                    </div>
                </div>
            ) : (
                <Card className="min-h-0 flex-1 overflow-hidden border-white/10 bg-neutral-900 sm:flex-none">
                    <CardContent className="h-full divide-y divide-white/[0.07] overflow-y-auto overscroll-contain p-0 sm:max-h-[calc(100dvh-12rem)]">
                        {[...memberships]
                            .sort((a, b) => {
                                const statusDifference = Number(a.status === 'inactive') - Number(b.status === 'inactive');
                                return statusDifference !== 0
                                    ? statusDifference
                                    : Number(a.duration || 0) - Number(b.duration || 0) || a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
                            })
                            .map((membership) => (
                                <MembershipRow
                                    key={membership.id}
                                    membership={{
                                        ...membership,
                                        activeMembers: (() => {
                                            const name = membership.name;
                                            const normalized = name.trim().toUpperCase();
                                            if (memberCounts[name]) return memberCounts[name];
                                            if (memberCounts[normalized]) return memberCounts[normalized];

                                            for (const key of Object.keys(memberCounts)) {
                                                if ((key.includes(normalized) || normalized.includes(key)) && key.length > 4 && normalized.length > 4) {
                                                    return memberCounts[key];
                                                }
                                                if (normalized === 'TRIMENSUAL' && key.includes('TRIMESTRAL')) return memberCounts[key];
                                                if (normalized === 'BIMENSUAL' && key.includes('BIMESTRAL')) return memberCounts[key];
                                                if (normalized === 'MENSUAL' && key.includes('MENSUAL')) return memberCounts[key];
                                            }
                                            return 0;
                                        })()
                                    }}
                                    onEdit={() => console.log('Edit:', membership.id)}
                                    onDelete={() => handleDeleteMembership(membership.id)}
                                />
                            ))}
                    </CardContent>
                </Card>
            )}

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
