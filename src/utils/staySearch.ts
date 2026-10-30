interface SearchableStay {
  roomNumber: string;
  guestName: string | null;
  additionalGuests?: string[];
}

function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function searchStays<T extends SearchableStay>(stays: readonly T[], query: string): T[] {
  const term = normalizeSearch(query);
  return stays.filter(stay => !term || [stay.roomNumber, stay.guestName || '', ...(stay.additionalGuests || [])]
    .some(value => normalizeSearch(value).includes(term)));
}
