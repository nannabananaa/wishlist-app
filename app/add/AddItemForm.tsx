'use client';

import { useActionState, useRef, useState } from 'react';
import { addItemAction, type AddItemState } from '../actions/items';
import { WANT_LEVELS } from '../lib/types';

const initialState: AddItemState = undefined;

export default function AddItemForm() {
  const [state, action, pending] = useActionState(addItemAction, initialState);

  const [link, setLink] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [wantLevel, setWantLevel] = useState(3);
  const [fetching, setFetching] = useState(false);
  const [fetchMsg, setFetchMsg] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  function onImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setImagePreview(null);
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setImagePreview(null);
      e.target.value = '';
      alert('that image is too big — keep it under 2MB 🥺');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImagePreview(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
  }

  function clearImage() {
    setImagePreview(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
  }

  async function tryFetchPrice() {
    if (!link.trim()) {
      setFetchMsg('paste a link first 🔗');
      return;
    }
    try {
      new URL(link);
    } catch {
      setFetchMsg('that link looks weird');
      return;
    }
    setFetching(true);
    setFetchMsg(null);
    try {
      const res = await fetch('/api/fetch-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: link }),
      });
      const data = (await res.json()) as { price: number | null; title: string | null };
      let updated = false;
      if (data.price !== null) {
        setPrice(String(data.price));
        updated = true;
      }
      if (data.title && !name.trim()) {
        setName(data.title);
        updated = true;
      }
      setFetchMsg(
        updated
          ? data.price !== null
            ? `found it! 💸 $${data.price}`
            : 'grabbed a name — pop in the price below'
          : "couldn't find a price — type it in below"
      );
    } catch {
      setFetchMsg('couldn\'t reach that site — fill it in manually 🥺');
    } finally {
      setFetching(false);
    }
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="text-sm font-medium text-ink-soft">
        🔗 link
        <div className="flex gap-2 mt-1">
          <input
            name="link"
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://amazon.com/..."
            required
            className="cute-input flex-1"
          />
          <button
            type="button"
            onClick={tryFetchPrice}
            disabled={fetching}
            className="cute-btn-soft whitespace-nowrap"
          >
            {fetching ? 'looking…' : '✨ auto-fill'}
          </button>
        </div>
        {fetchMsg ? <p className="text-xs text-ink-soft mt-1.5">{fetchMsg}</p> : null}
      </label>

      <label className="text-sm font-medium text-ink-soft">
        🏷️ what is it
        <input
          name="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="cute pink mug, fluffy slippers..."
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
            <button type="button" onClick={clearImage} className="cute-btn-ghost text-xs">
              remove
            </button>
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

      <button type="submit" disabled={pending} className="cute-btn mt-2">
        {pending ? 'adding…' : '🎀 add to wishlist'}
      </button>
    </form>
  );
}
