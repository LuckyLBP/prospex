import { Briefcase, Layers, LibraryBig, type IconProps } from "@/components/brand/icons";

const ICONS = { Briefcase, Layers, LibraryBig } as const;

/** Kategorins ikon efter namnet som lagras i databasen. Okända namn ger en generell listikon. */
export default function CategoryIcon({ icon, ...props }: { icon: string | null | undefined } & IconProps) {
  const Icon = (icon && (ICONS as Record<string, typeof Briefcase>)[icon]) || LibraryBig;
  return <Icon {...props} />;
}
