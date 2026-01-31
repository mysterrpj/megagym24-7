import { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { Navigate, Outlet } from 'react-router-dom';

// Hook to get the current user's role
export function useUserRole() {
    const [role, setRole] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<User | null>(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);
            if (currentUser) {
                // Hardcode admin for the main admin email for safety
                if (currentUser.email === 'admin@fitia.com' || currentUser.email === 'mysterrpj@gmail.com') {
                    setRole('admin');
                    setLoading(false);
                    return;
                }

                try {
                    const docRef = doc(db, 'members', currentUser.uid);
                    const docSnap = await getDoc(docRef);
                    if (docSnap.exists()) {
                        setRole(docSnap.data().role || 'user');
                    } else {
                        setRole('user');
                    }
                } catch (error) {
                    console.error("Error fetching role:", error);
                    setRole('user');
                }
            } else {
                setRole(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    return { role, loading, user };
}

// Protected Route Component
export function RequireAdmin() {
    const { role, loading, user } = useUserRole();

    if (loading) {
        return <div className="flex items-center justify-center h-screen bg-black text-white">Cargando...</div>;
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (role !== 'admin') {
        return <Navigate to="/member-dashboard" replace />;
    }

    return <Outlet />;
}

export function RequireAuth() {
    const { loading, user } = useUserRole();

    if (loading) {
        return <div className="flex items-center justify-center h-screen bg-black text-white">Cargando...</div>;
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    return <Outlet />;
}
