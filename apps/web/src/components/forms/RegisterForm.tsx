import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { useAuth } from '../../hooks/useAuth';
import { toErrorMessage } from '../../utils/error';
import {
  PASSWORD_MIN_LENGTH,
  type RegisterFormValues,
  registerSchema,
} from '../../utils/validation';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { FormActions, FormError, FormField } from './FormField';

export interface RegisterFormProps {
  onSuccess?: () => void;
}

/** Account creation form. Mirrors the API's password length requirement. */
export function RegisterForm({ onSuccess }: RegisterFormProps) {
  const { register: createAccount } = useAuth();
  const [submitError, setSubmitError] = useState<string>();

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { displayName: '', email: '', password: '' },
  });

  const onSubmit = form.handleSubmit(async values => {
    setSubmitError(undefined);
    try {
      await createAccount(values);
      onSuccess?.();
    } catch (error: unknown) {
      setSubmitError(toErrorMessage(error, 'Registration failed. Please try again.'));
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={submitError} />

      <FormField form={form} name="displayName" label="Full name">
        {field => (
          <Input
            placeholder="John Doe"
            autoComplete="name"
            {...field}
            {...form.register('displayName')}
          />
        )}
      </FormField>

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

      <FormField
        form={form}
        name="password"
        label="Password"
        hint={`At least ${PASSWORD_MIN_LENGTH} characters`}
      >
        {field => (
          <Input
            type="password"
            autoComplete="new-password"
            placeholder="••••••••••••"
            {...field}
            {...form.register('password')}
          />
        )}
      </FormField>

      <FormActions>
        <Button type="submit" block loading={form.formState.isSubmitting}>
          Create account
        </Button>
      </FormActions>
    </form>
  );
}
