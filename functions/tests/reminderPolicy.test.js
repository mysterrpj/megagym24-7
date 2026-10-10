const { test } = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../lib/reminderPolicy');

const today = '2026-10-09';
const member = (changes = {}) => ({
    status: 'active',
    phone: '+51999999999',
    startDate: '2026-09-11',
    endDate: '2026-11-09',
    debt: 0,
    ...changes
});

test('membership lifecycle is derived from the canonical Lima date', () => {
    assert.equal(policy.deriveMembershipLifecycleStatus(member({ endDate: today }), today), 'active');
    assert.equal(policy.deriveMembershipLifecycleStatus(member({ endDate: '2026-10-08' }), today), 'overdue');
    assert.equal(policy.deriveMembershipLifecycleStatus(member({ endDate: '2026-09-09' }), today), 'overdue');
    assert.equal(policy.deriveMembershipLifecycleStatus(member({ endDate: '2026-09-08' }), today), 'inactive');
});

test('explicit inactive and prospect states never receive automated membership reminders', () => {
    for (const status of ['inactive', 'prospect']) {
        const candidate = member({ status, endDate: '2026-10-12', debt: 50 });
        assert.equal(policy.canReceiveAutomatedMembershipReminder(candidate, today), false);
        assert.equal(policy.getUpcomingExpiryReminderStage(candidate, today), null);
        assert.equal(policy.getDebtReminderWeek(candidate, today), null);
    }
});

test('date-derived inactive member with stale active status receives no debt reminder', () => {
    const ruth = member({
        status: 'active',
        startDate: '2026-02-16',
        endDate: '2026-05-16',
        debt: 49
    });
    assert.equal(policy.deriveMembershipLifecycleStatus(ruth, today), 'inactive');
    assert.equal(policy.getDebtReminderWeek(ruth, today), null);
});

test('active and recently overdue debts keep the weekly cadence', () => {
    assert.equal(policy.getDebtReminderWeek(member({ debt: 20 }), today), 4);
    assert.equal(policy.getDebtReminderWeek(member({ debt: 20, startDate: '2026-09-12' }), today), null);
    assert.equal(policy.getDebtReminderWeek(member({ debt: 20, startDate: '2026-09-11', endDate: '2026-10-02' }), today), 4);
});

test('future memberships activate when their start date arrives', () => {
    assert.equal(policy.shouldActivateFutureMembership(member({ futureDebt: 70, futureDebtStartDate: '2026-10-10' }), today), false);
    assert.equal(policy.shouldActivateFutureMembership(member({ futureDebt: 70, futureDebtStartDate: today }), today), true);
    assert.equal(policy.shouldActivateFutureMembership(member({ futureDebt: 70, futureDebtStartDate: '2026-09-14' }), today), true);
    assert.equal(policy.shouldActivateFutureMembership(member({ futureDebt: 70, futureDebtStartDate: '' }), today), false);
});

test('upcoming and overdue stages are selected once per membership cycle', () => {
    assert.equal(policy.getUpcomingExpiryReminderStage(member({ endDate: '2026-10-12' }), today), 3);
    assert.equal(policy.getOverdueReminderStage(member({ endDate: '2026-10-08' }), today), 1);
    assert.equal(policy.getOverdueReminderStage(member({ endDate: '2026-10-02' }), today), 7);
    assert.equal(policy.getOverdueReminderStage(member({ endDate: '2026-10-01' }), today), null);
    assert.equal(
        policy.buildReminderDeliveryId('member/1', 'overdue', '2026-10-08', 1),
        'member_1__overdue__2026-10-08__1'
    );
});

test('date-only validation rejects malformed dates and reminder eligibility fails closed', () => {
    assert.equal(policy.diffDateOnlyDays('2026-02-28', '2026-03-01'), 1);
    for (const endDate of ['2026-02-30', '09/10/2026', '']) {
        const candidate = member({ endDate, debt: 20 });
        assert.equal(policy.diffDateOnlyDays(endDate, today), null);
        assert.equal(policy.deriveMembershipLifecycleStatus(candidate, today), 'unknown');
        assert.equal(policy.getDebtReminderWeek(candidate, today), null);
    }
});
