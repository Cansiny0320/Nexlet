import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

// base-nova composition, with the existing Nexlet visual tokens and sizes.
const buttonVariants = cva(
  'inline-flex items-center justify-center focus-visible:outline-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: { default: 'bg-primary text-primary-foreground', ghost: 'bg-transparent' },
    },
    defaultVariants: { variant: 'ghost' },
  },
);
export function Button({
  className,
  variant,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant }), className)}
      {...props}
    />
  );
}
