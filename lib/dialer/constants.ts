// Delas mellan server och klient -- ingen "server-only" här, till skillnad
// från query.ts. dialer.tsx (klient) behöver samma fönsterstorlek som
// serversidan använder för sin första hämtning, annars vet den inte när den
// närmar sig kanten av vad den redan har.
export const QUEUE_LIMIT = 500;
export const WINDOW_SIZE = 12;
