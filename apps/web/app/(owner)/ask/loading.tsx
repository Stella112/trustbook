export default function Loading() {
  return (
    <div className="mt-10 text-center">
      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-700" />
      <p className="mt-4 text-lg">Checking your book…</p>
      <p className="mt-1 text-sm text-stone-600">This can take up to 20 seconds.</p>
    </div>
  );
}
