"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "@/components/brand/icons";
import Avatar from "./Avatar";
import { removeAvatarAction, uploadAvatarAction, type AvatarResult } from "@/app/app/profil/actions";

const MAX_SIDE = 1024;

/** Förminskar bilden i webbläsaren innan den skickas, så att en stor mobilbild inte stoppas av storleksgränsen. */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("tom"))), "image/jpeg", 0.88));
}

export default function AvatarUploader({ name, url }: { name: string; url: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const done = (r: AvatarResult) => { if (r.ok) { setError(null); router.refresh(); } else setError(r.error); };

  function onPick(file: File | undefined) {
    if (!file) return;
    setError(null);
    start(async () => {
      try {
        const blob = await shrink(file);
        const fd = new FormData();
        fd.set("photo", new File([blob], "profil.jpg", { type: "image/jpeg" }));
        done(await uploadAvatarAction(fd));
      } catch {
        setError("Det gick inte att läsa bilden. Prova en annan.");
      }
    });
  }

  return (
    <div className="flex items-center gap-5">
      <Avatar name={name} url={url} size={88} />
      <div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending} onClick={() => input.current?.click()} className="inline-flex h-11 items-center gap-2 rounded-full border border-gray-300 bg-white px-5 text-[14px] font-medium text-ink hover:border-gray-500 disabled:opacity-50">
            <Camera size={17} />{pending ? "Sparar…" : url ? "Byt bild" : "Ladda upp bild"}
          </button>
          {url && <button type="button" disabled={pending} onClick={() => start(async () => done(await removeAvatarAction()))} className="h-11 rounded-full px-4 text-[14px] font-medium text-gray-600 hover:text-ink disabled:opacity-50">Ta bort</button>}
        </div>
        <p className="mt-2 text-[12px] text-gray-500">JPG, PNG eller WebP. Visas för dina kollegor i bolaget.</p>
        {error && <p role="alert" className="mt-2 text-[13px] text-rose-700">{error}</p>}
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
    </div>
  );
}
