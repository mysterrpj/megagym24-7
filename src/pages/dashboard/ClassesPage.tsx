import { useState } from 'react';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Plus, CalendarDays, Ticket, TrendingUp, Users, X, Clock, Search } from 'lucide-react';
import { addDays, format, startOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { BarChart, Bar, XAxis, ResponsiveContainer, Cell } from 'recharts';

// Type definitions
interface ClassItem {
    day: number;
    name: string;
    time: string;
    instructor: string;
    capacity: number;
    enrolled: number;
    color: string;
    duration?: number;
}

interface Member {
    id: string;
    name: string;
    phone: string;
    initials: string;
    bgColor: string;
}

// Sample members for enrollment
const enrollmentMembers: Member[] = [
    { id: '1', name: 'Ana Eliazar', phone: '5007008000', initials: 'AE', bgColor: 'bg-green-600' },
    { id: '2', name: 'Carlos Ruiz', phone: '5512345678', initials: 'CR', bgColor: 'bg-blue-600' },
    { id: '3', name: 'Laura Mendez', phone: '5587654321', initials: 'LM', bgColor: 'bg-purple-600' },
    { id: '4', name: 'Roberto Sánchez', phone: '5544332211', initials: 'RS', bgColor: 'bg-orange-600' },
    { id: '5', name: 'María García', phone: '5523456789', initials: 'MG', bgColor: 'bg-pink-600' },
];

const occupancyData = [
    { name: 'Lun', value: 85, color: '#3b82f6' },
    { name: 'Mar', value: 92, color: '#22c55e' },
    { name: 'Mié', value: 78, color: '#22c55e' },
    { name: 'Jue', value: 88, color: '#3b82f6' },
    { name: 'Vie', value: 95, color: '#22c55e' },
    { name: 'Sáb', value: 72, color: '#22c55e' },
    { name: 'Dom', value: 45, color: '#3b82f6' },
];

// Sample classes data with types and colors
const sampleClasses: ClassItem[] = [
    // Monday (day 0)
    { day: 0, name: 'CrossFit', time: '07:00', instructor: 'Miguel Torres', capacity: 15, enrolled: 12, color: 'border-l-red-500', duration: 60 },
    { day: 0, name: 'Yoga', time: '08:30', instructor: 'Laura Mendez', capacity: 20, enrolled: 18, color: 'border-l-green-500', duration: 60 },
    { day: 0, name: 'Spinning', time: '18:00', instructor: 'Carlos Ruiz', capacity: 25, enrolled: 20, color: 'border-l-blue-500', duration: 45 },
    { day: 0, name: 'Funcional', time: '19:30', instructor: 'Ana García', capacity: 15, enrolled: 14, color: 'border-l-orange-500', duration: 45 },
    // Tuesday (day 1)
    { day: 1, name: 'HIIT', time: '07:00', instructor: 'Miguel Torres', capacity: 20, enrolled: 18, color: 'border-l-purple-500', duration: 45 },
    { day: 1, name: 'Pilates', time: '09:00', instructor: 'Laura Mendez', capacity: 15, enrolled: 12, color: 'border-l-pink-500', duration: 60 },
    { day: 1, name: 'Boxeo', time: '18:00', instructor: 'Roberto Sánchez', capacity: 12, enrolled: 10, color: 'border-l-yellow-500', duration: 60 },
    { day: 1, name: 'Zumba', time: '19:30', instructor: 'María López', capacity: 30, enrolled: 28, color: 'border-l-emerald-500', duration: 45 },
    // Wednesday (day 2)
    { day: 2, name: 'CrossFit', time: '07:00', instructor: 'Miguel Torres', capacity: 15, enrolled: 14, color: 'border-l-red-500', duration: 60 },
    { day: 2, name: 'Yoga', time: '08:30', instructor: 'Laura Mendez', capacity: 20, enrolled: 14, color: 'border-l-green-500', duration: 60 },
    { day: 2, name: 'Spinning', time: '18:00', instructor: 'Carlos Ruiz', capacity: 25, enrolled: 22, color: 'border-l-blue-500', duration: 45 },
    // Thursday (day 3)
    { day: 3, name: 'HIIT', time: '07:00', instructor: 'Miguel Torres', capacity: 20, enrolled: 18, color: 'border-l-purple-500', duration: 45 },
    { day: 3, name: 'Pilates', time: '09:00', instructor: 'Laura Mendez', capacity: 15, enrolled: 10, color: 'border-l-pink-500', duration: 60 },
    { day: 3, name: 'Funcional', time: '19:00', instructor: 'Ana García', capacity: 15, enrolled: 12, color: 'border-l-orange-500', duration: 45 },
    // Friday (day 4)
    { day: 4, name: 'CrossFit', time: '07:00', instructor: 'Miguel Torres', capacity: 15, enrolled: 14, color: 'border-l-red-500', duration: 60 },
    { day: 4, name: 'Yoga', time: '08:30', instructor: 'Laura Mendez', capacity: 20, enrolled: 16, color: 'border-l-green-500', duration: 60 },
    { day: 4, name: 'Zumba', time: '18:00', instructor: 'María López', capacity: 30, enrolled: 28, color: 'border-l-emerald-500', duration: 45 },
    { day: 4, name: 'Spinning', time: '19:00', instructor: 'Carlos Ruiz', capacity: 25, enrolled: 24, color: 'border-l-blue-500', duration: 45 },
    // Saturday (day 5)
    { day: 5, name: 'CrossFit', time: '09:00', instructor: 'Miguel Torres', capacity: 15, enrolled: 13, color: 'border-l-red-500', duration: 60 },
    { day: 5, name: 'Yoga', time: '10:30', instructor: 'Laura Mendez', capacity: 25, enrolled: 20, color: 'border-l-green-500', duration: 60 },
    // Sunday (day 6) - no classes
];

// Class color mapping
const classColorMap: { [key: string]: string } = {
    'CrossFit': 'bg-red-500',
    'Yoga': 'bg-green-500',
    'Spinning': 'bg-blue-500',
    'Funcional': 'bg-orange-500',
    'HIIT': 'bg-purple-500',
    'Pilates': 'bg-pink-500',
    'Boxeo': 'bg-yellow-500',
    'Zumba': 'bg-emerald-500',
};

// Class Detail Modal Component
function ClassDetailModal({ classItem, onClose, onEnroll }: { classItem: ClassItem; onClose: () => void; onEnroll: (member: Member) => void }) {
    const [view, setView] = useState<'details' | 'enroll'>('details');
    const [searchTerm, setSearchTerm] = useState('');

    // Derived state
    const occupancyPercent = Math.round((classItem.enrolled / classItem.capacity) * 100);
    const dotColor = classColorMap[classItem.name] || 'bg-gray-500';

    // Mock enrolled members (just for display, not persisted for now)
    const [enrolledMembers, setEnrolledMembers] = useState<Member[]>(
        enrollmentMembers.slice(0, Math.min(classItem.enrolled, enrollmentMembers.length))
    );

    const filteredEnrollmentMembers = enrollmentMembers.filter(m =>
        m.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleEnrollClick = (member: Member) => {
        setEnrolledMembers(prev => [...prev, member]);
        onEnroll(member);
        setView('details');
        setSearchTerm('');
    };

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div
                className="bg-neutral-900 rounded-xl w-full max-w-md border border-neutral-800 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-neutral-800">
                    <div className="flex items-center gap-2">
                        <span className={`w-3 h-3 rounded-full ${dotColor}`}></span>
                        <h2 className="text-xl font-bold text-white">{classItem.name}</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        {view === 'details' && (
                            <Button
                                onClick={() => setView('enroll')}
                                className="bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-700 h-8 text-xs"
                            >
                                Inscribir
                            </Button>
                        )}
                        <button
                            onClick={onClose}
                            className="p-1 hover:bg-neutral-800 rounded-full transition-colors"
                        >
                            <X className="w-5 h-5 text-gray-400" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-4">
                    {view === 'details' ? (
                        <div className="space-y-4">
                            {/* Instructor & Schedule Cards */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-neutral-800 rounded-lg p-3">
                                    <p className="text-xs text-gray-500 mb-1">Instructor</p>
                                    <p className="text-white font-medium">{classItem.instructor}</p>
                                </div>
                                <div className="bg-neutral-800 rounded-lg p-3">
                                    <p className="text-xs text-gray-500 mb-1">Horario</p>
                                    <div className="flex items-center gap-1 text-white font-medium">
                                        <Clock className="w-4 h-4 text-gray-400" />
                                        {classItem.time} ({classItem.duration || 60} min)
                                    </div>
                                </div>
                            </div>

                            {/* Cupos Section */}
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-gray-400">Cupos</span>
                                    <span className="text-white font-bold">{classItem.enrolled} / {classItem.capacity}</span>
                                </div>
                                <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-green-500 rounded-full transition-all"
                                        style={{ width: `${occupancyPercent}%` }}
                                    />
                                </div>
                            </div>

                            {/* Enrolled Members */}
                            <div>
                                <div className="flex items-center gap-2 mb-3">
                                    <Users className="w-4 h-4 text-gray-400" />
                                    <span className="text-gray-400 text-sm">Miembros Inscritos</span>
                                </div>
                                {enrolledMembers.length > 0 ? (
                                    <div className="space-y-2 max-h-48 overflow-y-auto">
                                        {enrolledMembers.map((member, idx) => (
                                            <div key={idx} className="flex items-center gap-3 py-2 border-b border-neutral-800 last:border-0">
                                                <div className={`w-8 h-8 rounded-full ${member.bgColor} flex items-center justify-center text-xs font-medium text-white`}>
                                                    {member.initials}
                                                </div>
                                                <div>
                                                    <p className="text-white text-sm">{member.name}</p>
                                                    <p className="text-gray-500 text-xs">{member.phone}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center text-gray-500 py-4 text-sm">
                                        No hay miembros inscritos aún
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        /* Enroll View */
                        <div className="space-y-4">
                            <p className="text-gray-400 text-sm">Seleccionar Miembro</p>

                            {/* Search Input */}
                            <div className="relative">
                                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
                                <input
                                    type="text"
                                    placeholder="Buscar por nombre..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg pl-9 pr-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors"
                                    autoFocus
                                />
                            </div>

                            {/* Members List */}
                            <div className="space-y-2 max-h-60 overflow-y-auto mt-2">
                                {filteredEnrollmentMembers.map((member) => (
                                    <div
                                        key={member.id}
                                        className="flex items-center justify-between p-3 rounded-lg bg-neutral-800 hover:bg-neutral-700 transition-colors cursor-pointer group"
                                        onClick={() => handleEnrollClick(member)}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-full ${member.bgColor} flex items-center justify-center text-xs font-medium text-white`}>
                                                {member.initials}
                                            </div>
                                            <span className="text-white text-sm">{member.name}</span>
                                        </div>
                                        <Plus className="w-4 h-4 text-green-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// List of instructors
const instructorsList = ['Miguel Torres', 'Laura Mendez', 'Carlos Ruiz', 'Ana García', 'Roberto Sánchez', 'María López'];

// Days of the week
const daysOfWeek = [
    { value: 0, label: 'Lunes' },
    { value: 1, label: 'Martes' },
    { value: 2, label: 'Miércoles' },
    { value: 3, label: 'Jueves' },
    { value: 4, label: 'Viernes' },
    { value: 5, label: 'Sábado' },
    { value: 6, label: 'Domingo' },
];

// Class types with colors
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

// Create Class Modal Component
function CreateClassModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (newClass: ClassItem) => void }) {
    const [className, setClassName] = useState('');
    const [instructor, setInstructor] = useState('');
    const [day, setDay] = useState(0);
    const [time, setTime] = useState('07:00');
    const [capacity, setCapacity] = useState(20);
    const [duration, setDuration] = useState(60);

    const handleSubmit = () => {
        if (!className || !instructor) return;

        const classType = classTypes.find(c => c.name === className);
        const newClass: ClassItem = {
            day,
            name: className,
            time,
            instructor,
            capacity,
            enrolled: 0,
            color: classType?.color || 'border-l-gray-500',
            duration,
        };
        onSubmit(newClass);
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
                    <h2 className="text-xl font-bold text-white">Crear Nueva Clase</h2>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-neutral-800 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                {/* Form */}
                <div className="p-4 space-y-4">
                    {/* Class Name */}
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Nombre de la Clase</label>
                        <select
                            value={className}
                            onChange={(e) => setClassName(e.target.value)}
                            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-green-500 transition-colors"
                        >
                            <option value="">Ej. CrossFit</option>
                            {classTypes.map((type) => (
                                <option key={type.name} value={type.name}>{type.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Instructor */}
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Instructor</label>
                        <select
                            value={instructor}
                            onChange={(e) => setInstructor(e.target.value)}
                            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-green-500 transition-colors"
                        >
                            <option value="">Nombre del coach</option>
                            {instructorsList.map((name) => (
                                <option key={name} value={name}>{name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Day & Time Row */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Día</label>
                            <select
                                value={day}
                                onChange={(e) => setDay(Number(e.target.value))}
                                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-green-500 transition-colors"
                            >
                                {daysOfWeek.map((d) => (
                                    <option key={d.value} value={d.value}>{d.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Hora</label>
                            <input
                                type="time"
                                value={time}
                                onChange={(e) => setTime(e.target.value)}
                                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-green-500 transition-colors"
                            />
                        </div>
                    </div>

                    {/* Capacity & Duration Row */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Capacidad</label>
                            <input
                                type="number"
                                value={capacity}
                                onChange={(e) => setCapacity(Number(e.target.value))}
                                min={1}
                                max={100}
                                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-green-500 transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Duración (min)</label>
                            <input
                                type="number"
                                value={duration}
                                onChange={(e) => setDuration(Number(e.target.value))}
                                min={15}
                                max={120}
                                step={15}
                                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-green-500 transition-colors"
                            />
                        </div>
                    </div>

                    {/* Submit Button */}
                    <Button
                        onClick={handleSubmit}
                        disabled={!className || !instructor}
                        className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Programar Clase
                    </Button>
                </div>
            </div>
        </div>
    );
}

// Circular Progress Component
function CircularProgress({ percentage }: { percentage: number }) {
    const circumference = 2 * Math.PI * 20;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;
    const color = percentage >= 80 ? '#22c55e' : percentage >= 50 ? '#eab308' : '#ef4444';

    return (
        <div className="relative w-14 h-14">
            <svg className="transform -rotate-90 w-14 h-14">
                <circle
                    cx="28"
                    cy="28"
                    r="20"
                    stroke="#404040"
                    strokeWidth="4"
                    fill="transparent"
                />
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

export function ClassesPage() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewMode, setViewMode] = useState<'semana' | 'dia'>('semana');
    const [selectedDay, setSelectedDay] = useState(0); // 0 = Monday
    const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [classes, setClasses] = useState<ClassItem[]>(sampleClasses);

    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday

    const weekDays = [...Array(7)].map((_, i) => addDays(weekStart, i));

    const handlePrevWeek = () => setCurrentDate(addDays(currentDate, -7));
    const handleNextWeek = () => setCurrentDate(addDays(currentDate, 7));

    const getClassesByDay = (dayIndex: number) => {
        return classes.filter(c => c.day === dayIndex);
    };

    const handleAddClass = (newClass: ClassItem) => {
        setClasses(prev => [...prev, newClass]);
    };

    const handleEnrollMember = (_member: Member) => {
        if (!selectedClass) return;

        // Update local state for selected class
        const updatedClass = { ...selectedClass, enrolled: selectedClass.enrolled + 1 };
        setSelectedClass(updatedClass);

        // Update main classes list
        setClasses(prevClasses => prevClasses.map(c =>
            (c.day === selectedClass.day && c.name === selectedClass.name && c.time === selectedClass.time)
                ? updatedClass
                : c
        ));
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-white">Clases</h1>
                    <p className="text-gray-400">Gestiona horarios y cupos</p>
                </div>
                <Button onClick={() => setShowCreateModal(true)} className="bg-green-600 hover:bg-green-700">
                    <Plus className="mr-2 h-4 w-4" /> Nueva Clase
                </Button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-neutral-900 border-neutral-800 p-4">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm text-gray-400">Clases/Semana</p>
                            <h3 className="text-2xl font-bold text-white mt-1">20</h3>
                        </div>
                        <div className="p-2 bg-green-500/10 rounded-lg text-green-500">
                            <CalendarDays className="w-5 h-5" />
                        </div>
                    </div>
                </Card>
                <Card className="bg-neutral-900 border-neutral-800 p-4">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm text-gray-400">Reservas</p>
                            <h3 className="text-2xl font-bold text-white mt-1">317</h3>
                        </div>
                        <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                            <Ticket className="w-5 h-5" />
                        </div>
                    </div>
                </Card>
                <Card className="bg-neutral-900 border-neutral-800 p-4">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm text-gray-400">Ocupación</p>
                            <h3 className="text-2xl font-bold text-green-500 mt-1">81%</h3>
                        </div>
                        <div className="p-2 bg-green-500/10 rounded-lg text-green-500">
                            <TrendingUp className="w-5 h-5" />
                        </div>
                    </div>
                </Card>
                <Card className="bg-neutral-900 border-neutral-800 p-4">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm text-gray-400">Capacidad</p>
                            <h3 className="text-2xl font-bold text-white mt-1">392</h3>
                        </div>
                        <div className="p-2 bg-purple-500/10 rounded-lg text-purple-500">
                            <Users className="w-5 h-5" />
                        </div>
                    </div>
                </Card>
            </div>

            {/* Occupancy Chart */}
            <Card className="bg-neutral-900 border-neutral-800">
                <CardHeader>
                    <CardTitle className="text-white text-lg">Ocupación por día</CardTitle>
                </CardHeader>
                <CardContent className="h-[120px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={occupancyData}>
                            <XAxis dataKey="name" stroke="#525252" fontSize={12} tickLine={false} axisLine={false} />
                            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                {occupancyData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            <Card className="bg-neutral-900 border-neutral-800">
                <CardHeader className="flex flex-row items-center justify-between border-b border-neutral-800 pb-4">
                    <div className="flex bg-neutral-800 p-1 rounded-lg">
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
                        <Button variant="outline" size="icon" onClick={handlePrevWeek} className="border-neutral-700 hover:bg-neutral-800 text-white h-8 w-8">
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-sm text-gray-400">
                            {format(weekStart, 'd MMM', { locale: es })} - {format(addDays(weekStart, 6), 'd MMM', { locale: es })}
                        </span>
                        <Button variant="outline" size="icon" onClick={handleNextWeek} className="border-neutral-700 hover:bg-neutral-800 text-white h-8 w-8">
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                    {viewMode === 'semana' ? (
                        /* WEEK VIEW */
                        <div className="min-w-[800px]">
                            {/* Header Days - Card Style */}
                            <div className="grid grid-cols-7 gap-2 p-4">
                                {weekDays.map((day, i) => {
                                    const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                                    return (
                                        <div
                                            key={i}
                                            className={`p-3 rounded-lg text-center ${isToday
                                                ? 'bg-green-600 text-white'
                                                : 'bg-neutral-800 text-gray-400'
                                                }`}
                                        >
                                            <p className="text-xs font-medium capitalize">{format(day, 'EEEE', { locale: es })}</p>
                                            <p className={`text-2xl font-bold ${isToday ? 'text-white' : 'text-white'}`}>
                                                {format(day, 'd')}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Classes by Day - Column Layout */}
                            <div className="grid grid-cols-7 gap-2 px-4 pb-4">
                                {weekDays.map((_day, i) => {
                                    const dayClasses = getClassesByDay(i);
                                    return (
                                        <div key={i} className="space-y-2">
                                            {dayClasses.length > 0 ? (
                                                dayClasses.map((classItem, idx) => (
                                                    <div
                                                        key={idx}
                                                        onClick={() => setSelectedClass(classItem)}
                                                        className={`bg-neutral-800 rounded-lg p-3 border-l-4 ${classItem.color} hover:bg-neutral-700 transition-colors cursor-pointer`}
                                                    >
                                                        <p className="font-semibold text-white text-sm">{classItem.name}</p>
                                                        <p className="text-xs text-gray-400">{classItem.time}</p>
                                                        <p className="text-xs text-gray-500 mt-1">{classItem.instructor}</p>
                                                        <span className="inline-block mt-2 text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">
                                                            {classItem.enrolled}/{classItem.capacity}
                                                        </span>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="text-center text-gray-500 text-sm py-8">
                                                    Sin clases
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        /* DAY VIEW */
                        <div className="p-4">
                            {/* Day Selector Tabs */}
                            <div className="flex gap-2 mb-6">
                                {weekDays.map((day, i) => {
                                    const isSelected = selectedDay === i;
                                    return (
                                        <button
                                            key={i}
                                            onClick={() => setSelectedDay(i)}
                                            className={`flex-1 py-2 px-3 rounded-lg text-center transition-colors ${isSelected
                                                ? 'bg-green-600 text-white'
                                                : 'bg-neutral-800 text-gray-400 hover:bg-neutral-700'
                                                }`}
                                        >
                                            <p className="text-xs font-medium capitalize">{format(day, 'EEE', { locale: es })}</p>
                                            <p className="text-lg font-bold">{format(day, 'd')}</p>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Classes List for Selected Day */}
                            <div className="space-y-3">
                                {getClassesByDay(selectedDay).length > 0 ? (
                                    getClassesByDay(selectedDay).map((classItem, idx) => {
                                        const occupancy = Math.round((classItem.enrolled / classItem.capacity) * 100);
                                        return (
                                            <div
                                                key={idx}
                                                onClick={() => setSelectedClass(classItem)}
                                                className="bg-neutral-800 rounded-lg p-4 flex items-center justify-between hover:bg-neutral-700 transition-colors cursor-pointer"
                                            >
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="font-semibold text-white">{classItem.name}</span>
                                                        <span className="text-xs bg-neutral-700 text-gray-300 px-2 py-0.5 rounded-full">
                                                            {classItem.enrolled}/{classItem.capacity}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-4 text-sm text-gray-400">
                                                        <span className="flex items-center gap-1">
                                                            <span className="text-gray-500">⏰</span>
                                                            {classItem.time} (60 min)
                                                        </span>
                                                        <span className="flex items-center gap-1">
                                                            <span className="text-gray-500">👤</span>
                                                            {classItem.instructor}
                                                        </span>
                                                    </div>
                                                </div>
                                                <CircularProgress percentage={occupancy} />
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="text-center text-gray-500 py-12">
                                        Sin clases para este día
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Class Detail Modal */}
            {selectedClass && (
                <ClassDetailModal
                    classItem={selectedClass}
                    onClose={() => setSelectedClass(null)}
                    onEnroll={handleEnrollMember}
                />
            )}

            {/* Create Class Modal */}
            {showCreateModal && (
                <CreateClassModal
                    onClose={() => setShowCreateModal(false)}
                    onSubmit={handleAddClass}
                />
            )}
        </div>
    )
}
