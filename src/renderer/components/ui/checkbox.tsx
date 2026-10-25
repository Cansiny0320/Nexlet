import type { ComponentProps } from 'react';
import { Check } from 'lucide-react';

export function Checkbox({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <span className="checkbox-control">
      <input {...props} type="checkbox" data-slot="checkbox" className={className} />
      <Check size={12} strokeWidth={3} aria-hidden="true" />
    </span>
  );
}
