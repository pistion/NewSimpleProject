export const TRIAL_HOURS = Number(process.env.DEPLOYMENT_TRIAL_HOURS || 12);
export const HOSTING_PERIOD_MONTHS = Number(process.env.HOSTING_PERIOD_MONTHS || 1);
export const RENEWAL_REMINDER_DAYS = Number(process.env.HOSTING_RENEWAL_REMINDER_DAYS || 5);
export const SUBSCRIPTION_CLEANUP_ACTION =
  process.env.SUBSCRIPTION_CLEANUP_ACTION || process.env.DEPLOYMENT_CLEANUP_ACTION || 'suspend';

export function addCalendarMonths(date, months = HOSTING_PERIOD_MONTHS) {
  const source = date instanceof Date ? date : new Date(date);
  const result = new Date(source.getTime());
  const originalDay = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + Number(months || 0));
  const daysInTargetMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(originalDay, daysInTargetMonth));
  return result;
}

export function computePaidPeriod(paidAt = new Date(), months = HOSTING_PERIOD_MONTHS) {
  const currentPeriodStart = paidAt instanceof Date ? paidAt : new Date(paidAt);
  const currentPeriodEnd = addCalendarMonths(currentPeriodStart, months);
  const renewalReminderAt = new Date(currentPeriodEnd.getTime() - RENEWAL_REMINDER_DAYS * 24 * 60 * 60 * 1000);
  return {
    currentPeriodStart,
    currentPeriodEnd,
    nextBillingAt: currentPeriodEnd,
    renewalReminderAt,
  };
}
