export default function LiveRoomPage(_props: {
  params: Promise<{ code: string }>;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="text-center">
        <h1 className="font-display text-2xl font-semibold text-[var(--foreground)]">
          Live Room
        </h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          Connecting to room...
        </p>
      </div>
    </div>
  );
}
