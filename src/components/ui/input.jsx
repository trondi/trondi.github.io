import * as React from 'react';

import { cn } from '@/lib/utils';
import { Label } from '@components/ui/label';

const Input = React.forwardRef(({ className, type, label, ...props }, ref) => {
  return (
    <div className={`flex flex-col`}>
      <div className={`mb-1 `}>
        <Label className={`mb-1 `}>{label}</Label>
      </div>
      <div className={`w-full`}>
        <input
          type={type}
          // className={cn(
          //   'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:border-none',
          //   className,
          // )}
          className={cn(
            'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed focus:outline-none focus:border-none disabled:text-black',
            className,
          )}
          ref={ref}
          {...props}
        />
      </div>
    </div>
  );
});
Input.displayName = 'Input';

export { Input };
