import { useState, useEffect, FormEvent } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Send, MoreVertical, Phone, Video, MessageSquare } from 'lucide-react';

import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, where, serverTimestamp } from 'firebase/firestore';
import { cn } from '@/lib/utils';

// Types
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

export function MessagesPage() {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');

    // 1. Listen for ALL messages to build conversation list (Simplified logic for Prototype)
    // In production, you'd have a separate 'conversations' collection updated via Cloud Functions
    useEffect(() => {
        const q = query(collection(db, 'messages'), orderBy('timestamp', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const tempMap = new Map<string, Conversation>();

            snapshot.docs.forEach(doc => {
                const data = doc.data() as Message;
                if (!tempMap.has(data.phone)) {
                    tempMap.set(data.phone, {
                        phone: data.phone,
                        lastMessage: data.content,
                        timestamp: data.timestamp,
                        name: `User ${data.phone.slice(-4)}` // Placeholder name
                    });
                }
            });
            setConversations(Array.from(tempMap.values()));
        });
        return () => unsubscribe();
    }, []);

    // 2. Listen for messages of SELECTED phone
    useEffect(() => {
        if (!selectedPhone) return;

        const q = query(
            collection(db, 'messages'),
            where('phone', '==', selectedPhone),
            orderBy('timestamp', 'asc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
            setMessages(msgs);
        });

        return () => unsubscribe();
    }, [selectedPhone]);

    const handleSendMessage = async (e: FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !selectedPhone) return;

        try {
            await addDoc(collection(db, 'messages'), {
                phone: selectedPhone,
                content: newMessage,
                direction: 'outbound',
                timestamp: serverTimestamp()
            });
            setNewMessage('');
        } catch (error) {
            console.error("Error sending message:", error);
        }
    };

    return (
        <div className="flex h-[calc(100vh-8rem)] gap-6">
            {/* Left Sidebar: Conversations */}
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
                                        {conv.timestamp?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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

            {/* Right Side: Chat Window */}
            <Card className="flex-1 flex flex-col bg-neutral-900 border-neutral-800 overflow-hidden text-white relative">
                {selectedPhone ? (
                    <>
                        {/* Chat Header */}
                        <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-900">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-green-500 to-emerald-700 flex items-center justify-center text-white font-bold">
                                    {selectedPhone.slice(-2)}
                                </div>
                                <div>
                                    <h3 className="font-bold">{selectedPhone}</h3>
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

                        {/* Messages Area */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-black/20">
                            {messages.map((msg) => (
                                <div
                                    key={msg.id}
                                    className={cn(
                                        "flex",
                                        msg.direction === 'outbound' ? "justify-end" : "justify-start"
                                    )}
                                >
                                    <div className={cn(
                                        "max-w-[70%] rounded-2xl p-3 px-4 text-sm leading-relaxed",
                                        msg.direction === 'outbound'
                                            ? "bg-green-600 text-white rounded-tr-sm" // Whatsapp User (Green)
                                            : "bg-neutral-800 text-white rounded-tl-sm"  // Response (Gray)
                                        // Wait, usually Outbound (Me) is right/green. Inbound (User) is left/gray. 
                                        // In this context, 'direction' in DB: 
                                        // inbound = from User to System.
                                        // outbound = from System to User.
                                        // So if I am the ADMIN looking at the dashboard:
                                        // User messages (inbound) should be LEFT (Gray/White).
                                        // System messages (outbound) should be RIGHT (Green).
                                    )}>
                                        <p>{msg.content}</p>
                                        <span className="text-[10px] opacity-70 block text-right mt-1">
                                            {msg.timestamp?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Input Area */}
                        <div className="p-4 bg-neutral-900 border-t border-neutral-800">
                            <form onSubmit={handleSendMessage} className="flex gap-2">
                                <Input
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    placeholder="Escribe un mensaje..."
                                    className="bg-neutral-800 border-0 focus-visible:ring-1 focus-visible:ring-green-500"
                                />
                                <Button type="submit" className="bg-green-600 hover:bg-green-700 w-12 h-12 rounded-lg p-0 flex items-center justify-center">
                                    <Send className="w-5 h-5" />
                                </Button>
                            </form>
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
    )
}
