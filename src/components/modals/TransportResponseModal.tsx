import { useEffect, useState } from 'react';
import { BsXLg } from 'react-icons/bs';

export interface TransportResponseFormValue {
  vehiclePlate: string;
  vehicleModel: string;
  transportCost: string;
}

interface TransportResponseModalProps {
  open: boolean;
  isTaxi: boolean;
  loading?: boolean;
  initialValue?: Partial<TransportResponseFormValue> | null;
  onClose: () => void;
  onSave: (value: TransportResponseFormValue) => void | Promise<void>;
}

const defaultForm: TransportResponseFormValue = {
  vehiclePlate: '',
  vehicleModel: '',
  transportCost: '',
};

export default function TransportResponseModal({
  open,
  isTaxi,
  loading = false,
  initialValue,
  onClose,
  onSave,
}: TransportResponseModalProps) {
  const [form, setForm] = useState<TransportResponseFormValue>(defaultForm);

  useEffect(() => {
    if (!open) return;
    setForm({
      vehiclePlate: initialValue?.vehiclePlate || '',
      vehicleModel: initialValue?.vehicleModel || '',
      transportCost: initialValue?.transportCost || '',
    });
  }, [initialValue, open]);

  if (!open) return null;

  const isValid =
    form.vehiclePlate.trim().length > 0 &&
    form.vehicleModel.trim().length > 0 &&
    (!isTaxi || form.transportCost.trim().length > 0);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValid || loading) return;
    await onSave({
      vehiclePlate: form.vehiclePlate.trim(),
      vehicleModel: form.vehicleModel.trim(),
      transportCost: form.transportCost.trim(),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[90] p-4">
      <div className="bg-auto-secondary rounded-xl shadow-xl border border-auto max-w-lg w-full p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-lg font-bold text-auto-primary">Transport details</h3>
            <p className="text-sm text-auto-secondary">
              Save the vehicle data that the guest should receive.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1 rounded-lg text-auto-secondary hover:text-auto-primary hover:bg-auto-tertiary disabled:opacity-40"
            aria-label="Close transport response modal"
          >
            <BsXLg className="w-3.5 h-3.5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-auto-secondary mb-2">
              Plates
            </label>
            <input
              value={form.vehiclePlate}
              onChange={(event) => setForm((prev) => ({ ...prev, vehiclePlate: event.target.value }))}
              className="w-full px-3 py-2.5 rounded-lg border border-auto bg-auto-tertiary text-sm text-auto-primary"
              placeholder="ABC-123-D"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-auto-secondary mb-2">
              Model
            </label>
            <input
              value={form.vehicleModel}
              onChange={(event) => setForm((prev) => ({ ...prev, vehicleModel: event.target.value }))}
              className="w-full px-3 py-2.5 rounded-lg border border-auto bg-auto-tertiary text-sm text-auto-primary"
              placeholder="Nissan Versa"
              disabled={loading}
            />
          </div>

          {isTaxi && (
            <div>
              <label className="block text-xs font-semibold text-auto-secondary mb-2">
                Cost
              </label>
              <input
                value={form.transportCost}
                onChange={(event) => setForm((prev) => ({ ...prev, transportCost: event.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg border border-auto bg-auto-tertiary text-sm text-auto-primary"
                placeholder="$250 MXN"
                disabled={loading}
              />
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold border disabled:opacity-50"
              style={{ borderColor: 'var(--color-border)' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid || loading}
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save details'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
