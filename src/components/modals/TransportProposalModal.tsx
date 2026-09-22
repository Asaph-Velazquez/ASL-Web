import { useState } from 'react';
import { currentAcceptance, formatTransportPrice, parseTransportPrice, validOptions, validVehicles } from '../../utils/transport';
import type { TransportDetails, TransportOption, TransportVehicle } from '../../utils/transport';

interface Props {
  mode: 'publish' | 'assign';
  details: TransportDetails;
  active: boolean;
  connected: boolean;
  loading: boolean;
  error: string;
  onClose: () => void;
  onPublish: (options: TransportOption[]) => void;
  onAssign: (revision: number, vehicles: TransportVehicle[]) => void;
}

type Draft = { vehicleType: TransportOption['vehicleType']; vehicleCount: string; totalCapacity: string; price: string; description: string };
const blankOption = (): Draft => ({ vehicleType: 'car', vehicleCount: '1', totalCapacity: '', price: '', description: '' });
const inputClass = 'w-full px-3 py-2 rounded-lg border border-auto bg-auto-tertiary text-auto-primary';

export default function TransportProposalModal({ mode, details, active, connected, loading, error, onClose, onPublish, onAssign }: Props) {
  const acceptance = currentAcceptance(details);
  const [options, setOptions] = useState<Draft[]>(() => details.transportProposals?.options.map(option => ({
    vehicleType: option.vehicleType, vehicleCount: String(option.vehicleCount),
    totalCapacity: String(option.totalCapacity), price: `${Math.floor(option.priceCents / 100)}.${String(option.priceCents % 100).padStart(2, '0')}`,
    description: option.description || '',
  })) || [blankOption()]);
  const [vehicles, setVehicles] = useState<TransportVehicle[]>(() => Array.from(
    { length: acceptance?.option.vehicleCount || 0 }, (_, index) => ({
      vehiclePlate: details.transportResponse?.vehicles?.[index]?.vehiclePlate || '',
      vehicleModel: details.transportResponse?.vehicles?.[index]?.vehicleModel || '',
      vehicleColor: details.transportResponse?.vehicles?.[index]?.vehicleColor || '',
    }),
  ));
  const parsed = options.map(option => ({
    vehicleType: option.vehicleType,
    vehicleCount: /^\d+$/.test(option.vehicleCount) ? Number(option.vehicleCount) : NaN,
    totalCapacity: /^\d+$/.test(option.totalCapacity) ? Number(option.totalCapacity) : NaN,
    priceCents: parseTransportPrice(option.price),
    ...(option.description.trim() ? { description: option.description.trim() } : {}),
  }));
  const valid = mode === 'publish' ? validOptions(parsed, details.passengerCount) :
    !!acceptance && validVehicles(vehicles, acceptance.option.vehicleCount);
  const blocked = loading || !active || !connected;

  return <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[90] p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="transport-proposal-title" className="bg-auto-secondary rounded-xl border border-auto shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
      <h3 id="transport-proposal-title" className="text-lg font-bold text-auto-primary">{mode === 'publish' ? 'Publish transport options' : 'Assign vehicles'}</h3>
      <p className="text-sm text-auto-secondary my-3">{mode === 'publish'
        ? `Passengers: ${details.passengerCount ?? 'unknown'}. Each option must cover the entire group (1-6 passengers). Enter the total price in MXN.`
        : acceptance ? `Accepted: ${acceptance.option.vehicleCount} ${acceptance.option.vehicleType}, ${formatTransportPrice(acceptance.option.priceCents)}. Price is locked.` : 'Waiting for the guest to accept the current revision.'}</p>
      {mode === 'publish' && details.transportProposals && <p className="text-sm text-amber-700 mb-3">Publishing a new revision requires guest acceptance again before vehicles can be assigned.</p>}
      {mode === 'publish' && <p className="text-sm text-auto-secondary mb-3">Add alternatives for the guest to compare. All options are sent together; the guest chooses one before vehicle assignment.</p>}
      <form onSubmit={event => {
        event.preventDefault();
        if (!valid || blocked) return;
        if (mode === 'publish') onPublish(parsed);
        else if (acceptance) onAssign(acceptance.revision, vehicles.map(vehicle => ({
          vehiclePlate: vehicle.vehiclePlate.trim(), vehicleModel: vehicle.vehicleModel.trim(),
          ...(vehicle.vehicleColor?.trim() ? { vehicleColor: vehicle.vehicleColor.trim() } : {}),
        })));
      }} className="space-y-4">
        <fieldset disabled={blocked} className="space-y-4 disabled:opacity-60">
          {mode === 'publish' ? <>
            {options.map((option, index) => <div key={index} className="border border-auto rounded-lg p-3 space-y-3">
              <div className="flex justify-between text-auto-primary"><strong>Option {index + 1}</strong><button type="button" disabled={options.length === 1} onClick={() => setOptions(options.filter((_, i) => i !== index))} className="disabled:opacity-40">Remove</button></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-auto-secondary">
                <label>Vehicle type<select className={inputClass} value={option.vehicleType} onChange={event => setOptions(options.map((row, i) => i === index ? { ...row, vehicleType: event.target.value as Draft['vehicleType'] } : row))}><option value="car">Car</option><option value="van">Van</option><option value="bus">Bus</option></select></label>
                {(['vehicleCount', 'totalCapacity', 'price'] as const).map(field => <label key={field}>{field === 'vehicleCount' ? 'Vehicle count' : field === 'totalCapacity' ? 'Total passenger capacity' : 'Total price (MXN)'}<input required className={inputClass} inputMode={field === 'price' ? 'decimal' : 'numeric'} value={option[field]} onChange={event => setOptions(options.map((row, i) => i === index ? { ...row, [field]: event.target.value } : row))} /></label>)}
              </div>
              <label className="block text-sm text-auto-secondary">Details for the guest (optional)
                <input className={inputClass} maxLength={240} value={option.description}
                  placeholder="Vehicle model, luggage space, accessibility or amenities"
                  onChange={event => setOptions(options.map((row, i) => i === index ? { ...row, description: event.target.value } : row))} />
              </label>
            </div>)}
            <button type="button" disabled={options.length >= 20} className="w-full border border-dashed border-auto rounded-lg py-3 text-auto-primary font-semibold disabled:opacity-40" onClick={() => setOptions([...options, blankOption()])}>+ Add another option ({options.length}/20)</button>
            {!valid && <p className="text-sm text-auto-secondary">Use 1-100 vehicles and whole capacity up to 10,000, covering all passengers and at least one seat per vehicle. Enter a nonnegative MXN price with at most two decimals.</p>}
          </> : vehicles.map((vehicle, index) => <div key={index} className="border border-auto rounded-lg p-3 space-y-2 text-auto-secondary">
            <strong>Vehicle {index + 1}</strong>
            {(['vehiclePlate', 'vehicleModel', 'vehicleColor'] as const).map(field => <label key={field} className="block text-sm">{field === 'vehiclePlate' ? 'Plate (unique)' : field === 'vehicleModel' ? 'Model' : 'Color (optional)'}<input className={inputClass} maxLength={100} required={field !== 'vehicleColor'} value={vehicle[field] || ''} onChange={event => setVehicles(vehicles.map((row, i) => i === index ? { ...row, [field]: event.target.value } : row))} /></label>)}
          </div>)}
          {mode === 'assign' && acceptance && !valid && <p className="text-sm text-auto-secondary">Each vehicle needs a unique plate and model. Labels allow up to 100 characters, without angle brackets or control characters.</p>}
        </fieldset>
        {!active && <p role="alert" className="text-red-600">This request is no longer pending or in progress.</p>}
        {!connected && <p role="alert" className="text-red-600">Disconnected. Reconnect before saving.</p>}
        {error && <p role="alert" className="text-red-600">{error}</p>}
        <div className="flex gap-3">
          <button type="button" disabled={loading} onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-auto text-auto-primary disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={!valid || blocked} className="flex-1 px-4 py-2 rounded-lg bg-green-600 text-white disabled:opacity-50">{loading ? 'Waiting for server...' : mode === 'publish' ? 'Publish options' : 'Save assignment'}</button>
        </div>
      </form>
    </section>
  </div>;
}
