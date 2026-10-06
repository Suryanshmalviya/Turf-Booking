import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { useAuth } from '../../hooks/useAuth';
import type { AuthUser } from '../../types/auth';
import { toErrorMessage } from '../../utils/error';
import { type LoginFormValues,loginSchema } from '../../utils/validation';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { FormActions, FormError, FormField } from './FormField';

export interface LoginFormProps {
  onSuccess?: (user: AuthUser) => void;
}

/** Credential form. Surfaces API rejections as a form-level error message. */
export function LoginForm({ onSuccess }: LoginFormProps) {
  const { login } = useAuth();
  const [submitError, setSubmitError] = useState<string>();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = form.handleSubmit(async values => {
    setSubmitError(undefined);
    try {
      const user = await login(values);
      onSuccess?.(user);
    } catch (error: unknown) {
      setSubmitError(toErrorMessage(error, 'Check your credentials and try again.'));
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={submitError} />

      <FormField form={form} name="email" label="Email address">
        {field => (
          <Input
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            {...field}
            {...form.register('email')}
          />
        )}
      </FormField>

      <FormField form={form} name="password" label="Password">
        {field => (
          <Input
            type="password"
            autoComplete="current-password"
            placeholder="••••••••••"
            {...field}
            {...form.register('password')}
          />
        )}
      </FormField>

      <FormActions>
        <Button type="submit" block loading={form.formState.isSubmitting}>
          Sign in
        </Button>
      </FormActions>
    </form>
  );
}