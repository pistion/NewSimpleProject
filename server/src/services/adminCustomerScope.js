/**
 * Shared ownership-scope helper for admin customer oversight.
 *
 * Historical rows may use the customer user id or the human client id as an
 * organization id. Both are included deliberately; callers should surface the
 * compatibility warning instead of silently choosing one owner token.
 */

export function resolveCustomerOwnershipScope(customer, discoveredOrganizationIds = []) {
  const userId = customer?.id ?? null;
  const clientId = customer?.clientId ?? null;
  const warnings = [];
  const organizationIds = [];

  for (const value of [userId, clientId, ...(discoveredOrganizationIds ?? [])]) {
    if (value && !organizationIds.includes(value)) organizationIds.push(value);
  }

  if (clientId && clientId !== userId) {
    warnings.push({
      section: 'ownership',
      code: 'COMPATIBILITY_CLIENT_ID_SCOPE',
      message: `Customer ${userId} also uses compatibility organization id ${clientId}.`,
    });
  }

  const realOrganizationIds = organizationIds.filter((id) => id !== userId && id !== clientId);
  if (realOrganizationIds.length > 1) {
    warnings.push({
      section: 'ownership',
      code: 'AMBIGUOUS_CUSTOMER_ORGANIZATIONS',
      message: `Customer ${userId} is linked to multiple organization ids: ${realOrganizationIds.join(', ')}.`,
    });
  }

  return { userId, clientId, organizationIds, warnings };
}

export function groupAmountsByCurrency(rows, {
  amountField = 'totalAmountCents',
  currencyField = 'currency',
} = {}) {
  const totals = new Map();
  for (const row of rows ?? []) {
    const currency = String(row?.[currencyField] || '').trim().toUpperCase();
    if (!currency) continue;
    totals.set(currency, (totals.get(currency) || 0) + Number(row?.[amountField] || 0));
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amountCents]) => ({ currency, amountCents }));
}
