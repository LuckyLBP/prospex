import { Briefcase, Layers, LibraryBig, type LucideProps } from "lucide-react";

const ICONS = { Briefcase, Layers, LibraryBig } as const;

/** Kategorins ikon efter namnet som lagras i databasen. Okända namn ger en generell listikon. */
export default function CategoryIcon({ icon, ...props }: { icon: string | null | undefined } & LucideProps) {
  const Icon = (icon && (ICONS as Record<string, typeof Briefcase>)[icon]) || LibraryBig;
  return <Icon {...props} />;
}
