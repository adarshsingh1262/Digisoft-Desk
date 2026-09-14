export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <main id="main" className="w-full max-w-md">
        <div className="mb-6 text-center">
          <p className="text-lg font-semibold tracking-tight">Digisoft360 Help Desk</p>
          <p className="text-sm text-muted-foreground">Customer support platform</p>
        </div>
        {children}
      </main>
    </div>
  );
}
