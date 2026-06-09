// Rent-splitting math for shared apartments. Mirrors the in-app rent calculator:
// each tier is `step` cheaper than the one above it (primary bedroom > second
// bedroom > ... > living room). Kept dependency-free and pure so it can be reused
// by the calculator and the advanced floor-plan filter.

export const RENT_STEP = 200;

// 1 .. bedrooms + 1 occupants (e.g. 2B -> 1,2,3).
export function generateOccupantOptions(bedrooms: number): number[] {
  const safeBedrooms = Number.isFinite(bedrooms) ? Math.max(0, Math.floor(bedrooms)) : 0;
  const maxOccupants = Math.max(1, safeBedrooms + 1);
  return Array.from({ length: maxOccupants }, (_, index) => index + 1);
}

// Even split: every occupant pays the same.
export function calculateAverageSplit(totalPrice: number, occupants: number): number[] {
  if (!Number.isFinite(totalPrice) || occupants <= 0) return [];
  const per = Math.round(totalPrice / occupants);
  return Array.from({ length: occupants }, () => per);
}

// Weighted split: descending by `step`. Returns one price per occupant, highest
// (primary bedroom) first. Sum stays ~= totalPrice.
export function calculateWeightedSplit(totalPrice: number, occupants: number, step = RENT_STEP): number[] {
  if (!Number.isFinite(totalPrice) || occupants <= 0) return [];
  if (occupants === 1) return [Math.round(totalPrice)];
  const differenceTotal = step * ((occupants * (occupants - 1)) / 2);
  const base = Math.max(0, (totalPrice - differenceTotal) / occupants);
  return Array.from({ length: occupants }, (_, index) => Math.round(base + (occupants - 1 - index) * step));
}

// The per-person prices that fall within [minBudget, maxBudget].
export function getMatchedPrices(pricesPerPerson: number[], minBudget: number, maxBudget: number): number[] {
  return pricesPerPerson.filter(price => price >= minBudget && price <= maxBudget);
}
