import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Standard shadcn/ui helper — merges conditional class names (clsx) and
// resolves Tailwind class conflicts sensibly (tailwind-merge). Used by
// every component in components/ui/.
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
