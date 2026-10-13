import { ArrowRight } from "@/components/brand/icons";

const EASE = "ease-[cubic-bezier(0.25,0.1,0.25,1)]";

type Props = {
  label: string;
  className: string;
  circleClassName: string;
  arrowClassName?: string;
  onClick?: () => void;
  href?: string;
};

/** Pill button with duplicated-label text roll and a rotating arrow circle on hover. */
export default function RollButton({ label, className, circleClassName, arrowClassName = "", onClick, href }: Props) {
  const Tag = href ? "a" : "button";
  return (
    <Tag {...(href ? { href } : { onClick })} className={`group inline-flex items-center rounded-full font-medium ${className}`}>
      <span className="h-[20px] overflow-hidden">
        <span className={`flex flex-col transition-transform duration-500 ${EASE} group-hover:-translate-y-1/2`}>
          <span className="flex h-[20px] items-center whitespace-nowrap">{label}</span>
          <span className="flex h-[20px] items-center whitespace-nowrap">{label}</span>
        </span>
      </span>
      <span
        className={`ml-3 flex items-center justify-center rounded-full bg-white transition-transform duration-500 ${EASE} group-hover:-rotate-45 ${circleClassName}`}
      >
        <ArrowRight size={14} className={arrowClassName} />
      </span>
    </Tag>
  );
}
