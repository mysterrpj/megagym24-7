import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, addDoc, updateDoc, doc } from 'firebase/firestore';

import { db } from '@/lib/firebase';


export function useMembers() {
    const [members, setMembers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const q = query(collection(db, 'members'), orderBy('name'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setMembers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const addMember = (data: any) => addDoc(collection(db, 'members'), data);
    const updateMember = (id: string, data: any) => updateDoc(doc(db, 'members', id), data);

    return { members, loading, addMember, updateMember };
}

export function useClasses() {
    const [classes, setClasses] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const q = query(collection(db, 'classes'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setClasses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const addClass = (data: any) => addDoc(collection(db, 'classes'), data);

    return { classes, loading, addClass };
}

export function useMemberships() {
    const [memberships, setMemberships] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Since memberships are few, we can just fetch once or listen
        const q = query(collection(db, 'memberships'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setMemberships(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    return { memberships, loading };
}
