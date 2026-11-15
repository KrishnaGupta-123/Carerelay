export default function Loading() {
  return (
    <div aria-label="Loading your care space" className="animate-pulse space-y-6">
      <div className="h-8 w-72 rounded-lg bg-border" />
      <div className="h-24 rounded-xl bg-border/60" />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 rounded-xl bg-border/60" />
        ))}
      </div>
      <div className="h-96 rounded-xl bg-border/60" />
    </div>
  );
}
