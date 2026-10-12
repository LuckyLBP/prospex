import { inputCls, labelCls } from "./ui";

/** Ett avsnitt i ett formulär: titel och förklaring till vänster, fält till höger. */
export function FormSection({ title, description, children, footer }: { title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <section className="grid grid-cols-1 gap-x-10 gap-y-4 rounded-3xl bg-white p-6 lg:grid-cols-[240px_1fr]">
      <div>
        <h2 className="text-[16px] font-semibold text-[#14161F]">{title}</h2>
        {description && <p className="mt-1 text-[13px] leading-relaxed text-gray-500">{description}</p>}
      </div>
      <div className="flex flex-col gap-4">
        {children}
        {footer && <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">{footer}</div>}
      </div>
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className={labelCls}>
      {label}
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-[12px] font-normal text-gray-400">{hint}</span>}
    </label>
  );
}

export const Input = (p: React.InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={`${inputCls} ${p.className ?? ""}`} />;
export const Textarea = (p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={`${inputCls} resize-y ${p.className ?? ""}`} />;

export function Checkbox({ label, ...p }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex items-center gap-2.5 text-[14px] text-gray-800">
      <input type="checkbox" {...p} className="h-4 w-4 accent-[#F26522]" />
      {label}
    </label>
  );
}
