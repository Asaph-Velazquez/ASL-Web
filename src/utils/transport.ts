export interface TransportOption {
  id?: string;
  vehicleType: 'car' | 'van' | 'bus';
  vehicleCount: number;
  totalCapacity: number;
  priceCents: number;
  description?: string;
}

export interface TransportVehicle {
  vehiclePlate: string;
  vehicleModel: string;
  vehicleColor?: string;
}

export interface TransportDetails {
  passengerCount?: number;
  transportProposals?: {
    revision: number;
    options: TransportOption[];
    publishedAt: string;
    publishedBy: string;
  };
  transportAcceptance?: {
    revision: number;
    optionId: string;
    option: TransportOption;
    acceptedAt: string;
  };
  transportResponse?: { vehicles?: TransportVehicle[] };
}

export function formatTransportPrice(cents: number): string {
  const amount = BigInt(cents);
  const fraction = String(amount % 100n).padStart(2, '0');
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })
    .formatToParts(amount / 100n)
    .map(part => part.type === 'fraction' ? fraction : part.value).join('') + ' MXN';
}

export function currentAcceptance(details?: TransportDetails) {
  const acceptance = details?.transportAcceptance;
  return acceptance && acceptance.revision === details?.transportProposals?.revision &&
    details.transportProposals.options.some(option => option.id === acceptance.optionId)
    ? acceptance : null;
}

export function validPassengerCount(count: unknown): count is number {
  return typeof count === 'number' && Number.isInteger(count) && count >= 1 && count <= 6;
}

const hasSafeCharacters = (value: string) => [...value].every(character =>
  character.charCodeAt(0) >= 32 && character !== '<' && character !== '>');

export function validOptions(options: TransportOption[], passengers: unknown) {
  return validPassengerCount(passengers) && options.length > 0 && options.length <= 20 && options.every(option =>
    ['car', 'van', 'bus'].includes(option.vehicleType) &&
    Number.isSafeInteger(option.vehicleCount) && option.vehicleCount > 0 && option.vehicleCount <= 100 &&
    Number.isSafeInteger(option.totalCapacity) && option.totalCapacity >= passengers &&
    option.totalCapacity >= option.vehicleCount && option.totalCapacity <= 10000 &&
    Number.isSafeInteger(option.priceCents) && option.priceCents >= 0 &&
    (option.description === undefined || (typeof option.description === 'string' &&
      option.description.trim().length > 0 && option.description.trim().length <= 240 &&
      hasSafeCharacters(option.description.trim()))));
}

export function parseTransportPrice(price: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(price)) return NaN;
  const [whole, fraction = ''] = price.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : NaN;
}

const validLabel = (value: string) => value.trim().length > 0 && value.trim().length <= 100 &&
  hasSafeCharacters(value.trim());

export function validVehicles(vehicles: TransportVehicle[], count: number): boolean {
  return Number.isSafeInteger(count) && count > 0 && count <= 100 && vehicles.length === count &&
    vehicles.every(vehicle => validLabel(vehicle.vehiclePlate) && validLabel(vehicle.vehicleModel) &&
      (!vehicle.vehicleColor?.trim() || validLabel(vehicle.vehicleColor))) &&
    new Set(vehicles.map(vehicle => vehicle.vehiclePlate.trim().toUpperCase())).size === count;
}

export function transportAcceptanceStatus(details: TransportDetails): string {
  if (currentAcceptance(details)) return 'Guest selection accepted';
  return (details.transportProposals?.revision ?? 0) > 1 || details.transportAcceptance
    ? 'New revision: pending guest reacceptance' : 'Pending guest acceptance';
}

export function transportResult(message: { type: string; payload?: unknown }, operationId: string): { ok: boolean; error?: string } | null {
  if (message.type !== 'TRANSPORT_RESULT' || !message.payload || typeof message.payload !== 'object') return null;
  const payload = message.payload as Record<string, unknown>;
  if (payload.operationId !== operationId || typeof payload.ok !== 'boolean') return null;
  return { ok: payload.ok, error: typeof payload.error === 'string' ? payload.error : undefined };
}
