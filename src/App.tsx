
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LandingPage } from '@/pages/LandingPage';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { MessagesPage } from '@/pages/dashboard/MessagesPage';
import { MembersPage } from '@/pages/dashboard/MembersPage';
import { PaymentsPage } from '@/pages/dashboard/PaymentsPage';
import { SettingsPage } from '@/pages/dashboard/SettingsPage';
import { ClassesPage } from '@/pages/dashboard/ClassesPage';
import { MembershipsPage } from '@/pages/dashboard/MembershipsPage';



import { RegisterPage } from '@/pages/RegisterPage';
import { PublicPaymentPage } from '@/pages/PublicPaymentPage';

import { RequireAdmin, RequireAuth } from '@/lib/auth';
import { MemberDashboard } from '@/pages/MemberDashboard';

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/pagar" element={<PublicPaymentPage />} />

                {/* Member Routes */}
                <Route element={<RequireAuth />}>
                    <Route path="/member-dashboard" element={<MemberDashboard />} />
                </Route>

                {/* Admin Routes */}
                <Route element={<RequireAdmin />}>
                    <Route path="/dashboard" element={<DashboardLayout />}>
                        <Route index element={<Navigate to="/dashboard/messages" replace />} />
                        <Route path="messages" element={<MessagesPage />} />
                        <Route path="members" element={<MembersPage />} />
                        <Route path="memberships" element={<MembershipsPage />} />
                        <Route path="classes" element={<ClassesPage />} />
                        <Route path="payments" element={<PaymentsPage />} />
                        <Route path="settings" element={<SettingsPage />} />
                    </Route>
                </Route>
            </Routes>
        </BrowserRouter>
    );
}

export default App;
