'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '../lib/auth';
import {
  claimItem,
  deleteItem,
  giftItem,
  insertItem,
  unclaimItem,
  updateItem,
} from '../lib/items';

export type AddItemState = { error?: string } | undefined;
export type EditItemState = { error?: string } | undefined;

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function parsePrice(raw: FormDataEntryValue | null): number | null {
  if (raw === null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const cleaned = s.replace(/[^0-9.]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

async function fileToDataUrl(
  raw: FormDataEntryValue | null
): Promise<{ ok: true; dataUrl: string | null } | { ok: false; error: string }> {
  if (!(raw instanceof File) || raw.size === 0) return { ok: true, dataUrl: null };
  if (!ALLOWED_IMAGE_TYPES.includes(raw.type)) {
    return { ok: false, error: 'Image must be a jpeg, png, webp, or gif 📸' };
  }
  if (raw.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: 'Image is too big — keep it under 2MB please 🥺' };
  }
  const buf = Buffer.from(await raw.arrayBuffer());
  return { ok: true, dataUrl: `data:${raw.type};base64,${buf.toString('base64')}` };
}

export async function addItemAction(_prev: AddItemState, formData: FormData): Promise<AddItemState> {
  const user = await requireUser();

  const name = String(formData.get('name') ?? '').trim();
  const link = String(formData.get('link') ?? '').trim();
  const wantLevel = Number(formData.get('wantLevel') ?? 3);
  const price = parsePrice(formData.get('price'));

  if (!name) return { error: 'Give it a name!' };
  if (!link) return { error: 'A link helps a lot 🔗' };
  try {
    new URL(link);
  } catch {
    return { error: 'That link looks funny — make sure it starts with https://' };
  }
  if (!Number.isInteger(wantLevel) || wantLevel < 1 || wantLevel > 5) {
    return { error: 'Pick a want level (1–5)' };
  }

  const img = await fileToDataUrl(formData.get('image'));
  if (!img.ok) return { error: img.error };

  await insertItem({
    name,
    link,
    price,
    addedBy: user,
    wantLevel,
    imageUrl: img.dataUrl,
  });

  revalidatePath('/');
  redirect('/');
}

export async function editItemAction(
  itemId: number,
  _prev: EditItemState,
  formData: FormData
): Promise<EditItemState> {
  const user = await requireUser();
  if (!Number.isInteger(itemId)) return { error: 'Something went wrong.' };

  const name = String(formData.get('name') ?? '').trim();
  const link = String(formData.get('link') ?? '').trim();
  const wantLevel = Number(formData.get('wantLevel') ?? 3);
  const price = parsePrice(formData.get('price'));
  const clearImage = formData.get('clearImage') === '1';

  if (!name) return { error: 'Give it a name!' };
  if (!link) return { error: 'A link helps a lot 🔗' };
  try {
    new URL(link);
  } catch {
    return { error: 'That link looks funny — make sure it starts with https://' };
  }
  if (!Number.isInteger(wantLevel) || wantLevel < 1 || wantLevel > 5) {
    return { error: 'Pick a want level (1–5)' };
  }

  const img = await fileToDataUrl(formData.get('image'));
  if (!img.ok) return { error: img.error };

  await updateItem(itemId, user, {
    name,
    link,
    price,
    wantLevel,
    imageUrl: img.dataUrl,
    clearImage,
  });

  revalidatePath('/');
  redirect('/');
}

export async function claimItemAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (user !== 'Isaiah') return;
  const id = Number(formData.get('id'));
  if (!Number.isInteger(id)) return;
  await claimItem(id, user);
  revalidatePath('/');
}

export async function unclaimItemAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (user !== 'Isaiah') return;
  const id = Number(formData.get('id'));
  if (!Number.isInteger(id)) return;
  await unclaimItem(id, user);
  revalidatePath('/');
}

export async function giftItemAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (user !== 'Isaiah') return;
  const id = Number(formData.get('id'));
  if (!Number.isInteger(id)) return;
  await giftItem(id, user);
  revalidatePath('/');
  revalidatePath('/past-gifts');
}

export async function deleteItemAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = Number(formData.get('id'));
  if (!Number.isInteger(id)) return;
  await deleteItem(id, user);
  revalidatePath('/');
}
