'use client';

import Link from 'next/link';
import { useActionState, useRef, useState } from 'react';
import { editItemAction, type EditItemState } from '../../actions/items';
import { WANT_LEVELS, type WishlistItem } from '../../lib/types';

const initialState: EditItemState = undefined;

export default function EditItemForm({ item }: { item: WishlistItem }) {
  const boundAction = editItemAction.bind(null, item.id);
  const [state, action, pending] = useActionState(boundAction, initialState);

  const [link, setLink] = useState(item.link);
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(item.price !== null ? String(item.price) : '');
  const [wantLevel, setWantLevel] = useState(item.wantLevel);
  const [imagePreview, setImagePreview] = useState<string | null>(item.imageUrl);
  const [clearImage, setClearImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  function onImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      e.target.value = '';
      alert('that image is too big — keep it under 2MB 🥺');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview(typeof reader.result === 'string' ? reader.result : null);
      setClearImage(false);
    };
    reader.readAsDataURL(file);
  }

  function removeImage() {
    setImagePreview(null);
    setClearImage(true);
    if (imageInputRef.current) imageInputRef.current.value = '';
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="clearImage" value={clearImage ? '1' : '0'} />

      <label className="text-sm font-medium text-ink-soft">
        🔗 link
        <input
          name="link"
          type="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          required
          className="cute-input mt-1"
        />
      </label>

      <label className="text-sm font-medium text-ink-soft">
        🏷️ what is it
        <input
          name="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="cute-input mt-1"
        />
      </label>

      <div className="text-sm font-medium text-ink-soft">
        📸 photo — optional
        <input
          ref={imageInputRef}
          name="image"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={onImageChange}
          className={
            imagePreview
              ? 'hidden'
              : 'cute-input mt-1 text-xs file:mr-3 file:px-3 file:py-1 file:rounded-full file:border-0 file:bg-pink-100 file:text-pink-deep file:font-medium hover:file:bg-pink-200'
          }
        />
        {imagePreview ? (
          <div className="mt-1.5 flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagePreview}
              alt="preview"
              className="w-24 h-24 object-cover rounded-xl border border-pink-100"
            />
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="cute-btn-ghost text-xs"
              >
                replace
              </button>
              <button type="button" onClick={removeImage} className="cute-btn-ghost text-xs">
                remove
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <label className="text-sm font-medium text-ink-soft">
        💸 price (USD) — optional
        <input
          name="price"
          type="text"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="29.99"
          className="cute-input mt-1"
        />
      </label>

      <fieldset className="text-sm font-medium text-ink-soft">
        <legend className="mb-1.5">how badly do you want it</legend>
        <input type="hidden" name="wantLevel" value={wantLevel} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {WANT_LEVELS.map((lvl) => {
            const active = wantLevel === lvl.value;
            return (
              <button
                type="button"
                key={lvl.value}
                onClick={() => setWantLevel(lvl.value)}
                className="cute-btn-soft flex items-center gap-2 justify-start text-left"
                style={
                  active
                    ? { background: 'var(--pink)', color: 'white', borderColor: 'var(--pink)' }
                    : undefined
                }
              >
                <span className="text-lg">{lvl.emoji}</span>
                <span className="flex-1">{lvl.label}</span>
                <span className="text-xs opacity-70">{lvl.value}/5</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {state?.error ? (
        <p className="text-sm text-pink-deep px-3 py-2 rounded-lg" style={{ background: '#fff0f6', border: '1px solid #ffd6e5' }}>
          {state.error}
        </p>
      ) : null}

      <div className="flex gap-2 mt-2">
        <Link href="/" className="cute-btn-ghost flex-1 text-center">cancel</Link>
        <button type="submit" disabled={pending} className="cute-btn flex-1">
          {pending ? 'saving…' : '💾 save'}
        </button>
      </div>
    </form>
  );
}
