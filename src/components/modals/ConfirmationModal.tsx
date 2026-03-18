import { BsXLg } from 'react-icons/bs';

type ConfirmationVariant = 'primary' | 'warning' | 'danger';

interface ConfirmationModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmationVariant;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

const confirmButtonClass: Record<ConfirmationVariant, string> = {
  primary: 'bg-blue-600 hover:bg-blue-700',
  warning: 'bg-amber-600 hover:bg-amber-700',
  danger: 'bg-red-600 hover:bg-red-700',
};

function ConfirmationModal({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'primary',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmationModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[80] p-4">
      <div className="bg-auto-secondary rounded-xl shadow-xl border border-auto max-w-md w-full p-6">
        <div className="flex items-start justify-between gap-4 mb-3">
          <h3 className="text-lg font-bold text-auto-primary">{title}</h3>
          <button
            onClick={onCancel}
            disabled={loading}
            className="p-1 rounded-lg text-auto-secondary hover:text-auto-primary hover:bg-auto-tertiary disabled:opacity-40"
            aria-label="Cerrar modal de confirmacion"
          >
            <BsXLg className="w-3.5 h-3.5" />
          </button>
        </div>

        <p className="text-sm text-auto-secondary">{message}</p>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold border disabled:opacity-50"
            style={{ borderColor: 'var(--color-border)' }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 ${confirmButtonClass[variant]}`}
          >
            {loading ? 'Procesando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmationModal;