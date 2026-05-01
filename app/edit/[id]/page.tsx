import { notFound, redirect } from 'next/navigation';
import Header from '../../components/Header';
import { requireUser } from '../../lib/auth';
import { getItem } from '../../lib/items';
import EditItemForm from './EditItemForm';

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const itemId = Number(id);
  if (!Number.isInteger(itemId)) notFound();

  const item = await getItem(itemId);
  if (!item) notFound();
  if (item.addedBy !== user) redirect('/');
  if (item.status === 'gifted') redirect('/');

  return (
    <>
      <Header user={user} active="home" />
      <main className="flex-1 max-w-xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <h1 className="font-display text-3xl sm:text-4xl font-bold mb-2">
          edit wish ✏️
        </h1>
        <p className="text-ink-soft text-sm mb-6">
          tweak the details or swap the photo
        </p>

        <div className="cute-card p-6 sm:p-8">
          <EditItemForm item={item} />
        </div>
      </main>
    </>
  );
}
