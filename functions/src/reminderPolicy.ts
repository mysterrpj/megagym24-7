export type MembershipLifecycleStatus = 'active' | 'overdue' | 'inactive' | 'prospect' | 'unknown';

export interface ReminderMember {
    status?: unknown;
    startDate?: unknown;
    endDate?: unknown;
    debt?: unknown;
    phone?: unknown;
    futureDebt?: unknown;
    futureDebtStartDate?: unknown;
}

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function dateOnlyEpoch(value: unknown): number | null {
    const match = DATE_ONLY_PATTERN.exec(String(value || ''));
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const epoch = Date.UTC(year, month - 1, day);
    const parsed = new Date(epoch);

    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
        return null;
    }
    return epoch;
}

export function diffDateOnlyDays(fromDate: unknown, toDate: unknown): number | null {
    const from = dateOnlyEpoch(fromDate);
    const to = dateOnlyEpoch(toDate);
    if (from === null || to === null) return null;
    return Math.round((to - from) / DAY_MS);
}

export function deriveMembershipLifecycleStatus(
    member: ReminderMember,
    today: string
): MembershipLifecycleStatus {
    const storedStatus = String(member.status || '').trim().toLowerCase();
    if (storedStatus === 'prospect') return 'prospect';
    if (storedStatus === 'inactive') return 'inactive';

    const daysOverdue = diffDateOnlyDays(member.endDate, today);
    // Automated reminders fail closed when the canonical membership date is absent or invalid.
    if (daysOverdue === null) return 'unknown';
    if (daysOverdue <= 0) return 'active';
    if (daysOverdue > 30) return 'inactive';
    return 'overdue';
}

export function canReceiveAutomatedMembershipReminder(member: ReminderMember, today: string): boolean {
    if (!String(member.phone || '').trim()) return false;
    const status = deriveMembershipLifecycleStatus(member, today);
    return status === 'active' || status === 'overdue';
}

export function getUpcomingExpiryReminderStage(member: ReminderMember, today: string): 3 | null {
    if (!canReceiveAutomatedMembershipReminder(member, today)) return null;
    return diffDateOnlyDays(today, member.endDate) === 3 ? 3 : null;
}

export function getOverdueReminderStage(member: ReminderMember, today: string): 1 | 7 | null {
    if (deriveMembershipLifecycleStatus(member, today) !== 'overdue') return null;
    if (Number(member.debt) > 0) return null;

    const daysOverdue = diffDateOnlyDays(member.endDate, today);
    if (daysOverdue === 1 || daysOverdue === 7) return daysOverdue;
    return null;
}

export function getDebtReminderWeek(member: ReminderMember, today: string): number | null {
    if (!canReceiveAutomatedMembershipReminder(member, today)) return null;
    if (!(Number(member.debt) > 0)) return null;

    const elapsedDays = diffDateOnlyDays(member.startDate, today);
    if (elapsedDays === null || elapsedDays <= 0 || elapsedDays % 7 !== 0) return null;
    return elapsedDays / 7;
}

export function shouldActivateFutureMembership(member: ReminderMember, today: string): boolean {
    const daysSinceStart = diffDateOnlyDays(member.futureDebtStartDate, today);
    return daysSinceStart !== null && daysSinceStart >= 0;
}

export function buildReminderDeliveryId(
    memberId: string,
    reminderType: string,
    membershipCycle: string,
    stage: string | number
): string {
    return [memberId, reminderType, membershipCycle, String(stage)]
        .map((part) => String(part || 'none').replace(/[^a-zA-Z0-9_-]/g, '_'))
        .join('__');
}
