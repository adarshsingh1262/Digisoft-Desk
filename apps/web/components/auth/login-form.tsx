'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@digisoft/shared';
import { ApiError } from '@/lib/api-client';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/stores/auth.store';
import { useHydrated } from '@/hooks/use-hydrated';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function LoginForm() {
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);
  const status = useAuthStore((state) => state.status);

  const hydrated = useHydrated();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/dashboard');
    }
  }, [status, router]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const session = await authService.login(values);
      setSession(session.user, session.accessToken);
      router.replace('/dashboard');
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'Unable to sign in. Please try again.';
      setError('root', { message });
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Use your agent account to access the workspace.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Email address" htmlFor="email" error={errors.email?.message} required>
            <Input type="email" autoComplete="email" autoFocus {...register('email')} />
          </Field>

          <Field label="Password" htmlFor="password" error={errors.password?.message} required>
            <Input type="password" autoComplete="current-password" {...register('password')} />
          </Field>

          <Field
            label="Organization address"
            htmlFor="organizationSlug"
            error={errors.organizationSlug?.message}
            hint="Only needed if your email is used in more than one organization."
          >
            <Input autoComplete="organization" {...register('organizationSlug')} />
          </Field>

          {errors.root ? (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errors.root.message}
            </p>
          ) : null}

          <Button type="submit" className="w-full" loading={isSubmitting} disabled={!hydrated}>
            Sign in
          </Button>
        </form>

        <div className="mt-4 flex items-center justify-between text-sm">
          <Link href="/forgot-password" className="text-muted-foreground hover:text-foreground">
            Forgot password?
          </Link>
          <Link href="/register" className="text-muted-foreground hover:text-foreground">
            Create an organization
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
