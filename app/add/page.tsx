import Header from '../components/Header';
import { requireUser } from '../lib/auth';
import AddItemForm from './AddItemForm';

export default async function AddPage() {
  const user = await requireUser();

  return (
    <>
      <Header user={user} active="add" />
      <main className="flex-1 max-w-xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <h1 className="font-display text-3xl sm:text-4xl font-bold mb-2">
          new wish ✨
        </h1>
        <p className="text-ink-soft text-sm mb-6">
          paste the link and we&apos;ll try to grab the price for you
        </p>

        <div className="cute-card p-6 sm:p-8">
          <AddItemForm />
        </div>
      </main>
    </>
  );
}
