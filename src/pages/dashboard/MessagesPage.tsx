import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, MoreVertical, Phone, Video, MessageSquare } from 'lucide-react';

import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { cn } from '@/lib/utils';

interface Message {
    id: string;
    content: string;
    direction: 'inbound' | 'outbound';
    timestamp: any;
    phone: string;
}

interface Conversation {
    phone: string;
    lastMessage: string;
    timestamp: any;
    name?: string;
    unread?: number;
}

interface MemberRecord {
    name?: string;
    phone?: string;
}

function normalizePhone(phone: string) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '';
    return digits.slice(-9);
}

function getMessageDate(timestamp: any): Date | null {
    if (!timestamp) return null;
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    return Number.isNaN(date.getTime()) ? null : date;
}

function isSameDay(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear()
        && a.getMonth() === b.getMonth()
        && a.getDate() === b.getDate();
}

function formatConversationTime(timestamp: any) {
    const date = getMessageDate(timestamp);
    if (!date) return '';

    const now = new Date();
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);

    if (isSameDay(date, now)) {
        return date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
    }

    if (isSameDay(date, yesterday)) {
        return 'Ayer';
    }

    return date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
}

function formatMessageTime(timestamp: any) {
    const date = getMessageDate(timestamp);
    if (!date) return '';
    return date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

function formatDateSeparator(timestamp: any) {
    const date = getMessageDate(timestamp);
    if (!date) return '';

    const now = new Date();
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);

    if (isSameDay(date, now)) return 'Hoy';
    if (isSameDay(date, yesterday)) return 'Ayer';

    return date.toLocaleDateString('es-PE', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });
}

export function MessagesPage() {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [memberNames, setMemberNames] = useState<Record<string, string>>({});

    useEffect(() => {
        const q = query(collection(db, 'members'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const nextMemberNames: Record<string, string> = {};

            snapshot.docs.forEach((doc) => {
                const data = doc.data() as MemberRecord;
                const normalizedPhone = normalizePhone(data.phone || '');
                if (!normalizedPhone || !data.name) return;
                nextMemberNames[normalizedPhone] = data.name;
            });

            setMemberNames(nextMemberNames);
        });

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const q = query(collection(db, 'messages'), orderBy('timestamp', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const tempMap = new Map<string, Conversation>();

            snapshot.docs.forEach((doc) => {
                const data = doc.data() as Message;
                if (!tempMap.has(data.phone)) {
                    const normalizedPhone = normalizePhone(data.phone);
                    tempMap.set(data.phone, {
                        phone: data.phone,
                        lastMessage: data.content,
                        timestamp: data.timestamp,
                        name: memberNames[normalizedPhone] || `User ${data.phone.slice(-4)}`
                    });
                }
            });

            setConversations(Array.from(tempMap.values()));
        });

        return () => unsubscribe();
    }, [memberNames]);

    useEffect(() => {
        if (!selectedPhone) return;

        const normalizedSelectedPhone = normalizePhone(selectedPhone);
        const q = query(collection(db, 'messages'), orderBy('timestamp', 'asc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs
                .map((doc) => ({ id: doc.id, ...doc.data() } as Message))
                .filter((msg) => normalizePhone(msg.phone) === normalizedSelectedPhone);
            setMessages(msgs);
        });

        return () => unsubscribe();
    }, [selectedPhone]);

    const selectedConversation = conversations.find((conv) => conv.phone === selectedPhone);

    return (
        <div className="flex h-[calc(100vh-8rem)] gap-6">
            <Card className="w-1/3 flex flex-col bg-neutral-900 border-neutral-800 overflow-hidden">
                <div className="p-4 border-b border-neutral-800">
                    <h2 className="text-xl font-bold text-white mb-4">Mensajes</h2>
                    <div className="relative">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
                        <Input
                            placeholder="Buscar conversación..."
                            className="pl-9 bg-neutral-800 border-neutral-700 text-white"
                        />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {conversations.map((conv) => (
                        <div
                            key={conv.phone}
                            onClick={() => setSelectedPhone(conv.phone)}
                            className={cn(
                                "p-4 border-b border-neutral-800 cursor-pointer hover:bg-neutral-800/50 transition-colors flex gap-3",
                                selectedPhone === conv.phone ? "bg-neutral-800" : ""
                            )}
                        >
                            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-green-500 to-emerald-700 flex items-center justify-center text-white font-bold shrink-0">
                                {conv.phone.slice(-2)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-baseline mb-1">
                                    <h3 className="font-semibold text-white truncate">{conv.name || conv.phone}</h3>
                                    <span className="text-xs text-gray-500">
                                        {formatConversationTime(conv.timestamp)}
                                    </span>
                                </div>
                                <p className="text-sm text-gray-400 truncate">{conv.lastMessage}</p>
                            </div>
                        </div>
                    ))}
                    {conversations.length === 0 && (
                        <div className="p-8 text-center text-gray-500">
                            No hay conversaciones aún.
                        </div>
                    )}
                </div>
            </Card>

            <Card className="flex-1 flex flex-col bg-neutral-900 border-neutral-800 overflow-hidden text-white relative">
                {selectedPhone ? (
                    <>
                        <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-900">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-green-500 to-emerald-700 flex items-center justify-center text-white font-bold">
                                    {selectedPhone.slice(-2)}
                                </div>
                                <div>
                                    <h3 className="font-bold">{selectedConversation?.name || selectedPhone}</h3>
                                    <p className="text-xs text-gray-500">{selectedPhone}</p>
                                    <span className="text-xs text-green-500 flex items-center gap-1">
                                        <span className="w-2 h-2 rounded-full bg-green-500 inline-block animate-pulse"></span>
                                        En línea
                                    </span>
                                </div>
                            </div>
                            <div className="flex gap-2 text-gray-400">
                                <Button variant="ghost" size="icon" className="hover:text-white"><Phone className="w-5 h-5" /></Button>
                                <Button variant="ghost" size="icon" className="hover:text-white"><Video className="w-5 h-5" /></Button>
                                <Button variant="ghost" size="icon" className="hover:text-white"><MoreVertical className="w-5 h-5" /></Button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-black/20">
                            {messages.map((msg, index) => {
                                const previousMessage = messages[index - 1];
                                const currentDate = getMessageDate(msg.timestamp);
                                const previousDate = getMessageDate(previousMessage?.timestamp);
                                const showDateSeparator = currentDate && (!previousDate || !isSameDay(currentDate, previousDate));

                                return (
                                    <div key={msg.id}>
                                        {showDateSeparator && (
                                            <div className="flex justify-center my-3">
                                                <span className="rounded-full bg-neutral-800 px-3 py-1 text-xs font-medium text-gray-300 capitalize">
                                                    {formatDateSeparator(msg.timestamp)}
                                                </span>
                                            </div>
                                        )}
                                        <div
                                            className={cn(
                                                "flex",
                                                msg.direction === 'outbound' ? "justify-end" : "justify-start"
                                            )}
                                        >
                                            <div className={cn(
                                                "max-w-[70%] rounded-2xl p-3 px-4 text-sm leading-relaxed",
                                                msg.direction === 'outbound'
                                                    ? "bg-green-600 text-white rounded-tr-sm"
                                                    : "bg-neutral-800 text-white rounded-tl-sm"
                                            )}>
                                                <p>{msg.content}</p>
                                                <span className="text-[10px] opacity-70 block text-right mt-1">
                                                    {formatMessageTime(msg.timestamp)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="p-4 bg-neutral-900 border-t border-neutral-800">
                            <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-4 py-3 text-sm text-gray-400">
                                Este panel muestra el historial. Las respuestas al cliente se envian automaticamente desde el bot por WhatsApp.
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
                        <MessageSquare className="w-16 h-16 mb-4 opacity-20" />
                        <p>Selecciona una conversación para comenzar</p>
                    </div>
                )}
            </Card>
        </div>
    );
}
