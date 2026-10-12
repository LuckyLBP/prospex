// Klientsäker: logotyperna ligger i den publika bucketen "supplier-logos" i Supabase Storage.
export const logoUrl = (path: string | null | undefined): string | null =>
  path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/supplier-logos/${path}` : null;
