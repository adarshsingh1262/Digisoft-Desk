import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { LoadingState } from '@/components/ui/states';

export const metadata: Metadata = { title: 'Choose a new password' };

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
