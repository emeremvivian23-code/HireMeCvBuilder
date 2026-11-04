'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface FormFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}

export function FormField({ label, required, error, children }: FormFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-semibold text-navy">
        {label}
        {required && <span className="ml-0.5 text-orange">*</span>}
      </Label>
      {children}
      {error && (
        <p className="text-xs font-medium text-red-500">{error}</p>
      )}
    </div>
  );
}

interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export function TextInput({ error, className, ...props }: TextInputProps) {
  return (
    <Input
      className={cn(
        'h-11 text-base',
        error && 'border-red-500 focus-visible:ring-red-500',
        className
      )}
      {...props}
    />
  );
}

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export function TextArea({ error, className, ...props }: TextAreaProps) {
  return (
    <Textarea
      className={cn(
        'text-base',
        error && 'border-red-500 focus-visible:ring-red-500',
        className
      )}
      {...props}
    />
  );
}
