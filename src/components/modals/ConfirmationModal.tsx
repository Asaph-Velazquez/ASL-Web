import { BsXLg } from 'react-icons/bs';
import Dialog from '@mui/material/Dialog';
import { useId } from 'react';

type ConfirmationVariant = 'primary' | 'warning' | 'danger';

interface ConfirmationModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmationVariant;
  loading?: boolean;
  hideCancel?: boolean;
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
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  loading = false,
  hideCancel = false,
  onConfirm,
  onCancel,
}: ConfirmationModalProps) {
  const titleId = useId();
  const messageId = useId();
  if (!open) return null;

  return (
    <Dialog open={open} onClose={() => { if (!loading) onCancel(); }} aria-labelledby={titleId} aria-describedby={messageId} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { backgroundColor: 'transparent', backgroundImage: 'none', borderRadius: '12px' } } }}>
      <div className="bg-auto-secondary rounded-xl shadow-xl border border-auto w-full p-6">
        <div className="flex items-start justify-between gap-4 mb-3">
          <h3 id={titleId} className="text-lg font-bold text-auto-primary">{title}</h3>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="p-1 rounded-lg text-auto-secondary hover:text-auto-primary hover:bg-auto-tertiary disabled:opacity-40"
            aria-label="Close confirmation modal"
          >
            <BsXLg className="w-3.5 h-3.5" />
          </button>
        </div>

        <p id={messageId} className="text-sm text-auto-secondary">{message}</p>

        <div className="flex gap-3 mt-6">
          {!hideCancel && <button
            type="button"
            autoFocus
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold border text-auto-primary disabled:opacity-50"
            style={{ borderColor: 'var(--color-border)' }}
          >
            {cancelLabel}
          </button>}
          <button
            type="button"
            autoFocus={hideCancel}
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 ${confirmButtonClass[variant]}`}
          >
            {loading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

export default ConfirmationModal;
