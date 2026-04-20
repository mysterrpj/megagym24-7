import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { addDays, format, startOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { BarChart, Bar, XAxis, ResponsiveContainer, Cell } from 'recharts';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Plus, Search, Ticket, TrendingUp, Users, X } from 'lucide-react';

import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type ViewMode = 'semana' | 'dia';

interface ClassDoc {
    id: string;
    name: string;
    instructor: string;
    day: number;
    time: string;
    duration: number;
    capacity: number;
    price?: number;
    color: string;
    status: string;
    createdAt?: any;
}

interface BookingDoc {
    id: string;
    memberId: string;
    classId: string;
    date?: string;
    status?: string;
}

interface MemberDoc {
    id: string;
    name: string;
    phone: string;
}

interface ClassWithBookings extends ClassDoc {
    enrolled: number;
    enrolledMembers: MemberDoc[];
}

interface DemoClassSeed extends Omit<ClassDoc, 'createdAt'> {
    enrolledMemberIds: string[];
}

const daysOfWeek = [
    { value: 0, label: 'Lunes' },
    { value: 1, label: 'Martes' },
    { value: 2, label: 'Miércoles' },
    { value: 3, label: 'Jueves' },
    { value: 4, label: 'Viernes' },
    { value: 5, label: 'Sábado' },
    { value: 6, label: 'Domingo' },
];

const classTypes = [
    { name: 'CrossFit', color: 'border-l-red-500' },
    { name: 'Yoga', color: 'border-l-green-500' },
    { name: 'Spinning', color: 'border-l-blue-500' },
    { name: 'Funcional', color: 'border-l-orange-500' },
    { name: 'HIIT', color: 'border-l-purple-500' },
    { name: 'Pilates', color: 'border-l-pink-500' },
    { name: 'Boxeo', color: 'border-l-yellow-500' },
    { name: 'Zumba', color: 'border-l-emerald-500' },
];

const classColorMap: Record<string, string> = {
    CrossFit: 'bg-red-500',
    Yoga: 'bg-green-500',
    Spinning: 'bg-blue-500',
    Funcional: 'bg-orange-500',
    HIIT: 'bg-purple-500',
    Pilates: 'bg-pink-500',
    Boxeo: 'bg-yellow-500',
    Zumba: 'bg-emerald-500',
};

const demoMembers: MemberDoc[] = [
    { id: 'demo-m1', name: 'Damaris Calderon', phone: '+51962869142' },
    { id: 'demo-m2', name: 'Liz Nonalaya', phone: '+51908777226' },
    { id: 'demo-m3', name: 'Ruth Adalia', phone: '+51968595396' },
    { id: 'demo-m4', name: 'Fiorela Espinoza', phone: '+51930156003' },
    { id: 'demo-m5', name: 'Rosa Condori', phone: '+51994196360' },
    { id: 'demo-m6', name: 'Julio Arrieta', phone: '+51913291581' },
    { id: 'demo-m7', name: 'Maribel Gorpa', phone: '+51970605776' },
    { id: 'demo-m8', name: 'Gladys Medina', phone: '+51907505900' },
    { id: 'demo-m9', name: 'Jose Sanchez', phone: '+51912536711' },
    { id: 'demo-m10', name: 'Johana Choqquemaqui', phone: '+51987353666' },
    { id: 'demo-m11', name: 'Carlos Pacherres', phone: '+51945031539' },
    { id: 'demo-m12', name: 'Manuel Pizarro', phone: '+51991845638' },
    { id: 'demo-m13', name: 'Brenda Rojas', phone: '+51975678120' },
    { id: 'demo-m14', name: 'Kevin Salazar', phone: '+51967433211' },
    { id: 'demo-m15', name: 'Paola Rivera', phone: '+51987412345' },
    { id: 'demo-m16', name: 'Sandra Huaman', phone: '+51999881234' },
    { id: 'demo-m17', name: 'Anthony Quispe', phone: '+51941234567' },
    { id: 'demo-m18', name: 'Cielo Torres', phone: '+51955443322' },
];

const demoClassesSeed: DemoClassSeed[] = [
    { id: 'demo-c1', name: 'Clase Grupal', instructor: 'LIZ PIA', day: 0, time: '06:30', duration: 50, capacity: 18, price: 6, color: 'border-l-emerald-500', status: 'active', enrolledMemberIds: ['demo-m1', 'demo-m2', 'demo-m3', 'demo-m4', 'demo-m5', 'demo-m6', 'demo-m7', 'demo-m8', 'demo-m9', 'demo-m10', 'demo-m11', 'demo-m12'] },
    { id: 'demo-c2', name: 'Clase Grupal', instructor: 'LIZ PIA', day: 0, time: '08:30', duration: 60, capacity: 22, price: 6, color: 'border-l-green-500', status: 'active', enrolledMemberIds: ['demo-m1', 'demo-m2', 'demo-m3', 'demo-m4', 'demo-m5', 'demo-m6', 'demo-m7', 'demo-m8', 'demo-m9', 'demo-m10', 'demo-m11', 'demo-m12', 'demo-m13', 'demo-m14', 'demo-m15', 'demo-m16', 'demo-m17'] },
    { id: 'demo-c3', name: 'Funcional Express', instructor: 'Marisol Vega', day: 0, time: '18:30', duration: 45, capacity: 16, price: 6, color: 'border-l-orange-500', status: 'active', enrolledMemberIds: ['demo-m3', 'demo-m4', 'demo-m5', 'demo-m6', 'demo-m7', 'demo-m8', 'demo-m9', 'demo-m10', 'demo-m11'] },
    { id: 'demo-c4', name: 'Clase Grupal', instructor: 'LIZ PIA', day: 0, time: '20:00', duration: 60, capacity: 22, price: 6, color: 'border-l-green-500', status: 'active', enrolledMemberIds: ['demo-m1', 'demo-m2', 'demo-m3', 'demo-m4', 'demo-m5', 'demo-m6', 'demo-m7', 'demo-m8', 'demo-m9', 'demo-m10', 'demo-m11', 'demo-m12', 'demo-m13', 'demo-m14', 'demo-m15', 'demo-m16', 'demo-m18'] },
    { id: 'demo-c5', name: 'Clase Grupal', instructor: 'LIZ PIA', day: 1, time: '06:30', duration: 50, capacity: 18, price: 6, color: 'border-l-emerald-500', status: 'active', enrolledMemberIds: ['demo-m2', 'demo-m3', 'demo-m4', 'demo-m5', 'demo-m6', 'demo-m7', 'demo-m8', 'demo-m9', 'demo-m10', 'demo-m11', 'demo-m12'] },
    { id: 'demo-c6', name: 'Clase Grupal', instructor: 'LIZ PIA', day: 1, time: '08:30', duration: 60, capacity: 22, price: 6, color: 'border-l-green-500', status: 'active', enrolledMemberIds: ['demo-m1', 'demo-m2', 'demo-m3', 'demo-m4', 'demo-m5', 'demo-m6', 'demo-m7', 'demo-m8', 'demo-m9', 'demo-m10', 'demo-m11', 'demo-m12', 'demo-m13', 'demo-m14', 'demo-m15', 'demo-m16'] },
    { id: 'demo-c7', name: 'Baile Fit', instructor: 'Karla Ramos', day: 1, time: '19:00', duration: 50, capacity: 20, price: 6, color: 'border-l-pink-500', status: 'active', enrolledMemberIds: ['demo-m4', 'demo-m5', 'demo-m6', 'demo-m7', 'demo-m8', 'demo-m12', 'demo-m13', 'demo-m14', 'demo-m15', 'demo-m16', 'demo-m17'] },
    { id: 'demo-c8', name: 'Clase Grupal', instructor: 'LIZ PIA', day: 1, time: '20:00', duration: 60, capacity: 22, price: 6, color: 'border-l-green-500', status: 'active', enrolledMemberIds: ['demo-m1', 'demo-m2', 'demo-m3', 'demo-m4', 'demo-m5', 'demo-m6', 'demo-m7', 'demo-m8', 'demo-m9', 'demo-m10', 'demo-m11', 'demo-m12', 'demo-m13', 'demo-m14', 'demo-m18'] },
    { id: 'demo-c9', name: 'Clase Grupal', instructor: 'LIZ PIA', day: 2, time: '07:00', duration: 50, capacity: 18, price: 6, color: 'border-l-emerald-500', status: 'active', enrolledMemberIds: ['demo-m1', 'demo-m2', 'demo-m5', 'demo-m6', 'demo-m7', 'demo-m8', 'demo-m9', 'demo-m10', 'demo-m11', 'demo-m12'] },
    { id: 'demo-c10', name: 'Clase Grupal', instructor: 'LIZ PIA', day: 2, time: '08:30', duration: 60, capacity: 22, price: 6, color: 'border-l-green-500', status: 'active', enrolledMemberIds: ['demo-m1', 'demo-m2', 'demo-m3', 'demo-m4', 'demo-m5', 'demo-m6', 'demo-m7', 'demo-m8', 'demo-m9', 'demo-m10', 'demo-m11', 'demo-m12', 'demo-m13', 'demo-m14', 'demo-m15', 'demo-m16', 'demo-m17', 'demo-m18'] },
    { id: 'demo-c11', name: 'Pilates Suave', instructor: 'Ana Lucia', day: 2, time: '18:00', duration: 45, capacity: 14, price: 6, color: 'border-l-blue-500', status: 'active', enrolledMemberIds: ['demo-m3', 'demo-m4', 'demo-m5', 'demo-m8', 'demo-m9', 'demo-m10', 'demo-m15', 'demo-m16'] },
    { id: 'demo-c12', name: 'Clase Grupal', instructor: 'LIZ PIA', day: 2, time: '20:00', duration: 60, capacity: 22, price: 6, color: 'border-l-green-500', status: 'active', enrolledMemberIds: ['demo-m1', 'demo-m2', 'demo-m3', 'demo-m4', 'demo-m5', 'demo-m6', 'demo-m7', 'demo-m8', 'demo-m9', 'demo-m10', 'demo-m11', 'demo-m12', 'demo-m13', 'demo-m14', 'demo-m15'] },
    { id: 'demo-c13', name: 'Clase Grupal', instructor: 'LIZ PIA', day: 3, time: '06:30', duration: 50, capacity: 18, price: 6, color: 'border-l-emerald-500', status: 'active', enrolledMemberIds: ['demo-m2', 'demo-m3', 'demo-m4', 'demo-m5', 'demo-m6', 'demo-m7', 'demo-m8', 'demo-m9', 'demo-m10', 'demo-m11'] },
    { id: 'demo-c14', name: 'Clase Grupal', instructor: 'LIZ PIA', day: 3, time: '08:30', duration: 60, capacity: 22, price: 6, color: 'border-l-green-500', status: 'active', enrolledMemberIds: ['demo-m1', 'demo-m2', 'demo-m3', 'demo-m4', 'demo-m5', 'demo-m6', 'demo-m7', 'demo-m8', 'demo-m9', 'demo-m10', 'demo-m11', 'demo-m12', 'demo-m13', 'demo-m14', 'demo-m15', 'demo-m16', 'demo-m17'] },
    { id: 'demo-c15', name: 'Full Body', instructor: 'Pedro Soria', day: 3, time: '19:00', duration: 45, capacity: 16, price: 6, color: 'border-l-purple-500', status: 'active', enrolledMemberIds: ['demo-m4', 'demo-m5', 'demo-m6', 'demo-m7', 'demo-m8', 'demo-m9', 'demo-m12', 'demo-m13', 'demo-m16'] },
    { id: 'demo-c16', name: 'Clase Grupal', instructor: 'LIZ PIA', day: 3, time: '20:00', duration: 60, capacity: 22, price: 6, color: 'border-l-green-500', status: 'active', enrolledMemberIds: ['demo-m1', 'demo-m2', 'demo-m3', 'demo-m4', 'demo-m5', 'demo-m6', 'demo-m7', 'demo-m8', 'demo-m9', 'demo-m10', 'demo-m11', 'demo-m12', 'demo-m13', 'demo-m14', 'demo-m15', 'demo-m18'] },
    { id: 'demo-c17', name: 'Clase Grupal', instructor: 'LIZ PIA', day: 4, time: '07:00', duration: 50, capacity: 18, price: 6, color: 'border-l-emerald-500', status: 'active', enrolledMemberIds: ['demo-m1', 'demo-m3', 'demo-m4', 'demo-m5', 'demo-m6', 'demo-m7', 'demo-m8', 'demo-m9', 'demo-m10'] },
    { id: 'demo-c18', name: 'Clase Grupal', instructor: 'LIZ PIA', day: 4, time: '08:30', duration: 60, capacity: 22, price: 6, color: 'border-l-green-500', status: 'active', enrolledMemberIds: ['demo-m1', 'demo-m2', 'demo-m3', 'demo-m4', 'demo-m5', 'demo-m6', 'demo-m7', 'demo-m8', 'demo-m9', 'demo-m10', 'demo-m11', 'demo-m12', 'demo-m13', 'demo-m14', 'demo-m15', 'demo-m16', 'demo-m18'] },
    { id: 'demo-c19', name: 'Core & Gluteos', instructor: 'Marisol Vega', day: 4, time: '18:30', duration: 45, capacity: 16, price: 6, color: 'border-l-orange-500', status: 'active', enrolledMemberIds: ['demo-m2', 'demo-m3', 'demo-m5', 'demo-m6', 'demo-m8', 'demo-m9', 'demo-m11', 'demo-m14', 'demo-m17', 'demo-m18'] },
    { id: 'demo-c20', name: 'Clase Grupal', instructor: 'LIZ PIA', day: 4, time: '20:00', duration: 60, capacity: 22, price: 6, color: 'border-l-green-500', status: 'active', enrolledMemberIds: ['demo-m1', 'demo-m2', 'demo-m3', 'demo-m4', 'demo-m5', 'demo-m6', 'demo-m7', 'demo-m8', 'demo-m9', 'demo-m10', 'demo-m11', 'demo-m12', 'demo-m13', 'demo-m15'] },
    { id: 'demo-c21', name: 'Clase Grupal Sábado', instructor: 'LIZ PIA', day: 5, time: '09:00', duration: 60, capacity: 18, price: 6, color: 'border-l-green-500', status: 'active', enrolledMemberIds: ['demo-m1', 'demo-m2', 'demo-m3', 'demo-m4', 'demo-m5', 'demo-m6', 'demo-m7', 'demo-m8', 'demo-m9', 'demo-m10', 'demo-m11'] },
    { id: 'demo-c22', name: 'Estiramiento Activo', instructor: 'Ana Lucia', day: 5, time: '10:30', duration: 40, capacity: 12, price: 6, color: 'border-l-blue-500', status: 'active', enrolledMemberIds: ['demo-m4', 'demo-m5', 'demo-m6', 'demo-m12', 'demo-m13', 'demo-m16'] },
];

function normalizeClass(raw: any, id: string): ClassDoc {
    const rawDay = Number(raw.day ?? 0);
    const normalizedDay = rawDay >= 1 && rawDay <= 7 ? rawDay - 1 : Math.min(Math.max(rawDay, 0), 6);
    const rawHour = raw.hour;
    const time = raw.time || (typeof rawHour === 'number' ? `${String(rawHour).padStart(2, '0')}:00` : '07:00');

    return {
        id,
        name: raw.name || 'Clase',
        instructor: raw.instructor || 'Por definir',
        day: normalizedDay,
        time,
        duration: Number(raw.duration) || 60,
        capacity: Math.max(1, Number(raw.capacity) || 20),
        price: Number(raw.price) || 6,
        color: raw.color || classTypes.find((item) => item.name === raw.name)?.color || 'border-l-gray-500',
        status: raw.status || 'active',
        createdAt: raw.createdAt,
    };
}

function CircularProgress({ percentage }: { percentage: number }) {
    const circumference = 2 * Math.PI * 20;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;
    const color = percentage >= 80 ? '#22c55e' : percentage >= 50 ? '#eab308' : '#ef4444';

    return (
        <div className="relative h-14 w-14">
            <svg className="h-14 w-14 -rotate-90 transform">
                <circle cx="28" cy="28" r="20" stroke="#404040" strokeWidth="4" fill="transparent" />
                <circle
                    cx="28"
                    cy="28"
                    r="20"
                    stroke={color}
                    strokeWidth="4"
                    fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">
                {percentage}%
            </span>
        </div>
    );
}

function CreateClassModal({ onClose }: { onClose: () => void }) {
    const [className, setClassName] = useState('');
    const [instructor, setInstructor] = useState('');
    const [day, setDay] = useState(0);
    const [time, setTime] = useState('07:00');
    const [capacity, setCapacity] = useState(20);
    const [duration, setDuration] = useState(60);
    const [saving, setSaving] = useState(false);

    const handleSubmit = async () => {
        if (!className || !instructor) return;

        const classType = classTypes.find((item) => item.name === className);
        setSaving(true);
        try {
            await addDoc(collection(db, 'classes'), {
                name: className,
                instructor,
                day,
                time,
                duration,
                capacity,
                color: classType?.color || 'border-l-gray-500',
                status: 'active',
                createdAt: serverTimestamp(),
            });
            onClose();
        } catch (error) {
            console.error('Error creating class:', error);
            alert('No se pudo crear la clase.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
            <div
                className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-900 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-neutral-800 p-4">
                    <h2 className="text-xl font-bold text-white">Crear Nueva Clase</h2>
                    <button onClick={onClose} className="rounded-full p-1 transition-colors hover:bg-neutral-800">
                        <X className="h-5 w-5 text-gray-400" />
                    </button>
                </div>

                <div className="space-y-4 p-4">
                    <div>
                        <label className="mb-2 block text-sm text-gray-400">Nombre de la Clase</label>
                        <select
                            value={className}
                            onChange={(e) => setClassName(e.target.value)}
                            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-white transition-colors focus:border-green-500 focus:outline-none"
                        >
                            <option value="">Ej. CrossFit</option>
                            {classTypes.map((type) => (
                                <option key={type.name} value={type.name}>{type.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="mb-2 block text-sm text-gray-400">Instructor</label>
                        <input
                            value={instructor}
                            onChange={(e) => setInstructor(e.target.value)}
                            placeholder="Nombre del coach"
                            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-white transition-colors focus:border-green-500 focus:outline-none"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="mb-2 block text-sm text-gray-400">Día</label>
                            <select
                                value={day}
                                onChange={(e) => setDay(Number(e.target.value))}
                                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-white transition-colors focus:border-green-500 focus:outline-none"
                            >
                                {daysOfWeek.map((item) => (
                                    <option key={item.value} value={item.value}>{item.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="mb-2 block text-sm text-gray-400">Hora</label>
                            <input
                                type="time"
                                value={time}
                                onChange={(e) => setTime(e.target.value)}
                                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-white transition-colors focus:border-green-500 focus:outline-none"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="mb-2 block text-sm text-gray-400">Capacidad</label>
                            <input
                                type="number"
                                min={1}
                                max={100}
                                value={capacity}
                                onChange={(e) => setCapacity(Number(e.target.value))}
                                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-white transition-colors focus:border-green-500 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="mb-2 block text-sm text-gray-400">Duración (min)</label>
                            <input
                                type="number"
                                min={15}
                                max={180}
                                step={15}
                                value={duration}
                                onChange={(e) => setDuration(Number(e.target.value))}
                                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-white transition-colors focus:border-green-500 focus:outline-none"
                            />
                        </div>
                    </div>

                    <Button
                        onClick={handleSubmit}
                        disabled={saving || !className || !instructor}
                        className="w-full bg-green-600 py-2.5 font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {saving ? 'Guardando...' : 'Programar Clase'}
                    </Button>
                </div>
            </div>
        </div>
    );
}

function ClassDetailModal({
    classItem,
    members,
    readOnly,
    onClose,
}: {
    classItem: ClassWithBookings;
    members: MemberDoc[];
    readOnly: boolean;
    onClose: () => void;
}) {
    const [view, setView] = useState<'details' | 'enroll'>('details');
    const [searchTerm, setSearchTerm] = useState('');
    const [saving, setSaving] = useState(false);

    const enrolledMemberIds = new Set(classItem.enrolledMembers.map((member) => member.id));
    const availableMembers = members.filter((member) => !enrolledMemberIds.has(member.id));
    const filteredMembers = availableMembers.filter((member) =>
        member.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const occupancyPercent = classItem.capacity > 0 ? Math.round((classItem.enrolled / classItem.capacity) * 100) : 0;
    const dotColor = classColorMap[classItem.name] || 'bg-gray-500';
    const isFull = classItem.enrolled >= classItem.capacity;

    const handleEnroll = async (member: MemberDoc) => {
        if (readOnly || isFull || saving) return;

        setSaving(true);
        try {
            await addDoc(collection(db, 'bookings'), {
                memberId: member.id,
                classId: classItem.id,
                status: 'confirmed',
                created_at: serverTimestamp(),
            });
            setSearchTerm('');
            setView('details');
        } catch (error) {
            console.error('Error enrolling member:', error);
            alert('No se pudo inscribir al miembro.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
            <div
                className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-900 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-neutral-800 p-4">
                    <div className="flex items-center gap-2">
                        <span className={`h-3 w-3 rounded-full ${dotColor}`}></span>
                        <h2 className="text-xl font-bold text-white">{classItem.name}</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        {view === 'details' && (
                            <Button
                                onClick={() => setView('enroll')}
                                disabled={isFull || readOnly}
                                className="h-8 border border-neutral-700 bg-neutral-800 text-xs text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {readOnly ? 'Solo vista demo' : isFull ? 'Clase llena' : 'Inscribir'}
                            </Button>
                        )}
                        <button onClick={onClose} className="rounded-full p-1 transition-colors hover:bg-neutral-800">
                            <X className="h-5 w-5 text-gray-400" />
                        </button>
                    </div>
                </div>

                <div className="p-4">
                    {view === 'details' ? (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="rounded-lg bg-neutral-800 p-3">
                                    <p className="mb-1 text-xs text-gray-500">Instructor</p>
                                    <p className="font-medium text-white">{classItem.instructor}</p>
                                </div>
                                <div className="rounded-lg bg-neutral-800 p-3">
                                    <p className="mb-1 text-xs text-gray-500">Horario</p>
                                    <div className="flex items-center gap-1 font-medium text-white">
                                        <Clock className="h-4 w-4 text-gray-400" />
                                        {classItem.time} ({classItem.duration} min)
                                    </div>
                                </div>
                                <div className="rounded-lg bg-neutral-800 p-3">
                                    <p className="mb-1 text-xs text-gray-500">Precio</p>
                                    <p className="font-medium text-white">S/ {Number(classItem.price || 6).toFixed(2)}</p>
                                </div>
                            </div>

                            <div>
                                <div className="mb-2 flex items-center justify-between">
                                    <span className="text-gray-400">Cupos</span>
                                    <span className="font-bold text-white">{classItem.enrolled} / {classItem.capacity}</span>
                                </div>
                                <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
                                    <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${Math.min(occupancyPercent, 100)}%` }} />
                                </div>
                            </div>

                            <div>
                                <div className="mb-3 flex items-center gap-2">
                                    <Users className="h-4 w-4 text-gray-400" />
                                    <span className="text-sm text-gray-400">Miembros Inscritos</span>
                                </div>
                                {classItem.enrolledMembers.length > 0 ? (
                                    <div className="max-h-48 space-y-2 overflow-y-auto">
                                        {classItem.enrolledMembers.map((member) => (
                                            <div key={member.id} className="border-b border-neutral-800 py-2 last:border-0">
                                                <p className="text-sm text-white">{member.name}</p>
                                                <p className="text-xs text-gray-500">{member.phone || 'Sin teléfono'}</p>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="py-4 text-center text-sm text-gray-500">
                                        No hay miembros inscritos aún.
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <p className="text-sm text-gray-400">Seleccionar Miembro</p>
                            <div className="relative">
                                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
                                <input
                                    type="text"
                                    placeholder="Buscar por nombre..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 py-2.5 pl-9 pr-4 text-white placeholder-gray-500 transition-colors focus:border-green-500 focus:outline-none"
                                    autoFocus
                                />
                            </div>
                            <div className="mt-2 max-h-60 space-y-2 overflow-y-auto">
                                {filteredMembers.map((member) => (
                                    <div
                                        key={member.id}
                                        onClick={() => handleEnroll(member)}
                                        className="group flex cursor-pointer items-center justify-between rounded-lg bg-neutral-800 p-3 transition-colors hover:bg-neutral-700"
                                    >
                                        <div>
                                            <span className="text-sm text-white">{member.name}</span>
                                            <p className="text-xs text-gray-500">{member.phone || 'Sin teléfono'}</p>
                                        </div>
                                        <Plus className="h-4 w-4 text-green-500 opacity-0 transition-opacity group-hover:opacity-100" />
                                    </div>
                                ))}
                                {filteredMembers.length === 0 && (
                                    <div className="py-4 text-center text-sm text-gray-500">
                                        No hay miembros disponibles para esta clase.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export function ClassesPage() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewMode, setViewMode] = useState<ViewMode>('semana');
    const [selectedDay, setSelectedDay] = useState(0);
    const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [classDocs, setClassDocs] = useState<ClassDoc[]>([]);
    const [bookings, setBookings] = useState<BookingDoc[]>([]);
    const [members, setMembers] = useState<MemberDoc[]>([]);
    const usingDemoData = classDocs.length === 0;

    useEffect(() => {
        const unsubscribeClasses = onSnapshot(query(collection(db, 'classes')), (snapshot) => {
            const nextClasses = snapshot.docs.map((doc) => normalizeClass(doc.data(), doc.id));
            setClassDocs(nextClasses);
        });

        const unsubscribeBookings = onSnapshot(query(collection(db, 'bookings')), (snapshot) => {
            const nextBookings = snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<BookingDoc, 'id'>) }));
            setBookings(nextBookings);
        });

        const unsubscribeMembers = onSnapshot(query(collection(db, 'members'), orderBy('name')), (snapshot) => {
            const nextMembers = snapshot.docs.map((doc) => {
                const data = doc.data();
                return {
                    id: doc.id,
                    name: data.name || 'Sin nombre',
                    phone: data.phone || '',
                };
            });
            setMembers(nextMembers);
        });

        return () => {
            unsubscribeClasses();
            unsubscribeBookings();
            unsubscribeMembers();
        };
    }, []);

    const classes = useMemo<ClassWithBookings[]>(() => {
        if (usingDemoData) {
            const demoMemberMap = new Map(demoMembers.map((member) => [member.id, member]));
            return demoClassesSeed.map((classDoc) => ({
                ...classDoc,
                enrolled: classDoc.enrolledMemberIds.length,
                enrolledMembers: classDoc.enrolledMemberIds
                    .map((memberId) => demoMemberMap.get(memberId))
                    .filter(Boolean) as MemberDoc[],
            }));
        }

        const memberMap = new Map(members.map((member) => [member.id, member]));
        return classDocs
            .filter((classDoc) => classDoc.status !== 'inactive')
            .map((classDoc) => {
                const confirmedBookings = bookings.filter((booking) =>
                    booking.classId === classDoc.id && (booking.status || 'confirmed') !== 'cancelled'
                );
                const enrolledMembers = confirmedBookings
                    .map((booking) => memberMap.get(booking.memberId))
                    .filter(Boolean) as MemberDoc[];

                return {
                    ...classDoc,
                    enrolled: confirmedBookings.length,
                    enrolledMembers,
                };
            })
            .sort((a, b) => {
                if (a.day !== b.day) return a.day - b.day;
                return a.time.localeCompare(b.time);
            });
    }, [bookings, classDocs, members, usingDemoData]);

    const selectedClass = classes.find((item) => item.id === selectedClassId) || null;
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const weekDays = [...Array(7)].map((_, index) => addDays(weekStart, index));

    const occupancyData = useMemo(() => {
        return weekDays.map((day, index) => {
            const dayClasses = classes.filter((classItem) => classItem.day === index);
            const totalCapacity = dayClasses.reduce((sum, classItem) => sum + classItem.capacity, 0);
            const totalEnrolled = dayClasses.reduce((sum, classItem) => sum + classItem.enrolled, 0);
            const value = totalCapacity > 0 ? Math.round((totalEnrolled / totalCapacity) * 100) : 0;

            return {
                name: format(day, 'EEE', { locale: es }).replace('.', ''),
                value,
                color: value >= 80 ? '#22c55e' : '#3b82f6',
            };
        });
    }, [classes, weekDays]);

    const stats = useMemo(() => {
        const totalClasses = classes.length;
        const totalBookings = classes.reduce((sum, classItem) => sum + classItem.enrolled, 0);
        const totalCapacity = classes.reduce((sum, classItem) => sum + classItem.capacity, 0);
        const totalEnrolled = classes.reduce((sum, classItem) => sum + classItem.enrolled, 0);
        const occupancy = totalCapacity > 0 ? Math.round((totalEnrolled / totalCapacity) * 100) : 0;

        return { totalClasses, totalBookings, totalCapacity, occupancy };
    }, [classes]);

    const getClassesByDay = (dayIndex: number) => classes.filter((classItem) => classItem.day === dayIndex);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white">Clases</h1>
                    <p className="text-gray-400">
                        {usingDemoData
                            ? 'Mostrando una vista demo coherente mientras cargas tus clases reales.'
                            : 'Gestiona horarios y cupos'}
                    </p>
                </div>
                <Button onClick={() => setShowCreateModal(true)} className="bg-green-600 hover:bg-green-700">
                    <Plus className="mr-2 h-4 w-4" /> Nueva Clase
                </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <Card className="border-neutral-800 bg-neutral-900 p-4">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-sm text-gray-400">Clases/Semana</p>
                            <h3 className="mt-1 text-2xl font-bold text-white">{stats.totalClasses}</h3>
                        </div>
                        <div className="rounded-lg bg-green-500/10 p-2 text-green-500">
                            <CalendarDays className="h-5 w-5" />
                        </div>
                    </div>
                </Card>
                <Card className="border-neutral-800 bg-neutral-900 p-4">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-sm text-gray-400">Reservas</p>
                            <h3 className="mt-1 text-2xl font-bold text-white">{stats.totalBookings}</h3>
                        </div>
                        <div className="rounded-lg bg-blue-500/10 p-2 text-blue-500">
                            <Ticket className="h-5 w-5" />
                        </div>
                    </div>
                </Card>
                <Card className="border-neutral-800 bg-neutral-900 p-4">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-sm text-gray-400">Ocupación</p>
                            <h3 className="mt-1 text-2xl font-bold text-green-500">{stats.occupancy}%</h3>
                        </div>
                        <div className="rounded-lg bg-green-500/10 p-2 text-green-500">
                            <TrendingUp className="h-5 w-5" />
                        </div>
                    </div>
                </Card>
                <Card className="border-neutral-800 bg-neutral-900 p-4">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-sm text-gray-400">Capacidad</p>
                            <h3 className="mt-1 text-2xl font-bold text-white">{stats.totalCapacity}</h3>
                        </div>
                        <div className="rounded-lg bg-purple-500/10 p-2 text-purple-500">
                            <Users className="h-5 w-5" />
                        </div>
                    </div>
                </Card>
            </div>

            <Card className="border-neutral-800 bg-neutral-900">
                <CardHeader>
                    <CardTitle className="text-lg text-white">Ocupación por día</CardTitle>
                </CardHeader>
                <CardContent className="h-[120px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={occupancyData}>
                            <XAxis dataKey="name" stroke="#525252" fontSize={12} tickLine={false} axisLine={false} />
                            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                {occupancyData.map((entry, index) => (
                                    <Cell key={index} fill={entry.color} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            <Card className="border-neutral-800 bg-neutral-900">
                <CardHeader className="flex flex-row items-center justify-between border-b border-neutral-800 pb-4">
                    <div className="flex rounded-lg bg-neutral-800 p-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewMode('semana')}
                            className={viewMode === 'semana' ? 'bg-neutral-700 text-white shadow-sm' : 'text-gray-400 hover:text-white'}
                        >
                            Semana
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewMode('dia')}
                            className={viewMode === 'dia' ? 'bg-green-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'}
                        >
                            Día
                        </Button>
                    </div>
                    <div className="flex items-center gap-4">
                        <Button variant="outline" size="icon" onClick={() => setCurrentDate(addDays(currentDate, -7))} className="h-8 w-8 border-neutral-700 text-white hover:bg-neutral-800">
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-sm text-gray-400">
                            {format(weekStart, 'd MMM', { locale: es })} - {format(addDays(weekStart, 6), 'd MMM', { locale: es })}
                        </span>
                        <Button variant="outline" size="icon" onClick={() => setCurrentDate(addDays(currentDate, 7))} className="h-8 w-8 border-neutral-700 text-white hover:bg-neutral-800">
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="overflow-x-auto p-0">
                    {viewMode === 'semana' ? (
                        <div className="min-w-[800px]">
                            <div className="grid grid-cols-7 gap-2 p-4">
                                {weekDays.map((day, index) => {
                                    const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                                    return (
                                        <div
                                            key={index}
                                            className={`rounded-lg p-3 text-center ${isToday ? 'bg-green-600 text-white' : 'bg-neutral-800 text-gray-400'}`}
                                        >
                                            <p className="text-xs font-medium capitalize">{format(day, 'EEEE', { locale: es })}</p>
                                            <p className="text-2xl font-bold text-white">{format(day, 'd')}</p>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="grid grid-cols-7 gap-2 px-4 pb-4">
                                {weekDays.map((_, index) => {
                                    const dayClasses = getClassesByDay(index);
                                    return (
                                        <div key={index} className="space-y-2">
                                            {dayClasses.length > 0 ? dayClasses.map((classItem) => (
                                                <div
                                                    key={classItem.id}
                                                    onClick={() => setSelectedClassId(classItem.id)}
                                                    className={`cursor-pointer rounded-lg border-l-4 bg-neutral-800 p-3 transition-colors hover:bg-neutral-700 ${classItem.color}`}
                                                >
                                                    <p className="text-sm font-semibold text-white">{classItem.name}</p>
                                                    <p className="text-xs text-gray-400">{classItem.time}</p>
                                                    <p className="mt-1 text-xs text-gray-500">{classItem.instructor}</p>
                                                    <span className="mt-2 inline-block rounded-full bg-yellow-500/20 px-2 py-0.5 text-xs text-yellow-400">
                                                        {classItem.enrolled}/{classItem.capacity}
                                                    </span>
                                                </div>
                                            )) : (
                                                <div className="py-8 text-center text-sm text-gray-500">Sin clases</div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        <div className="p-4">
                            <div className="mb-6 flex gap-2">
                                {weekDays.map((day, index) => {
                                    const isSelected = selectedDay === index;
                                    return (
                                        <button
                                            key={index}
                                            onClick={() => setSelectedDay(index)}
                                            className={`flex-1 rounded-lg px-3 py-2 text-center transition-colors ${isSelected ? 'bg-green-600 text-white' : 'bg-neutral-800 text-gray-400 hover:bg-neutral-700'}`}
                                        >
                                            <p className="text-xs font-medium capitalize">{format(day, 'EEE', { locale: es })}</p>
                                            <p className="text-lg font-bold">{format(day, 'd')}</p>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="space-y-3">
                                {getClassesByDay(selectedDay).length > 0 ? getClassesByDay(selectedDay).map((classItem) => {
                                    const occupancy = classItem.capacity > 0 ? Math.round((classItem.enrolled / classItem.capacity) * 100) : 0;
                                    return (
                                        <div
                                            key={classItem.id}
                                            onClick={() => setSelectedClassId(classItem.id)}
                                            className="flex cursor-pointer items-center justify-between rounded-lg bg-neutral-800 p-4 transition-colors hover:bg-neutral-700"
                                        >
                                            <div className="flex-1">
                                                <div className="mb-1 flex items-center gap-2">
                                                    <span className="font-semibold text-white">{classItem.name}</span>
                                                    <span className="rounded-full bg-neutral-700 px-2 py-0.5 text-xs text-gray-300">
                                                        {classItem.enrolled}/{classItem.capacity}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-4 text-sm text-gray-400">
                                                    <span>{classItem.time} ({classItem.duration} min)</span>
                                                    <span>{classItem.instructor}</span>
                                                </div>
                                            </div>
                                            <CircularProgress percentage={occupancy} />
                                        </div>
                                    );
                                }) : (
                                    <div className="py-12 text-center text-gray-500">Sin clases para este día</div>
                                )}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {selectedClass && (
                <ClassDetailModal
                    classItem={selectedClass}
                    members={usingDemoData ? demoMembers : members}
                    readOnly={usingDemoData}
                    onClose={() => setSelectedClassId(null)}
                />
            )}

            {showCreateModal && <CreateClassModal onClose={() => setShowCreateModal(false)} />}
        </div>
    );
}
