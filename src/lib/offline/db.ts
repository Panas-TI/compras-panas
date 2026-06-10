/**
 * IndexedDB wrapper pra fila de entregas pendentes de sincronização.
 *
 * Armazena a foto como Blob (mais eficiente que base64) + metadata.
 * Quando volta online, drena a fila enviando uma por uma pro /api/motorista/concluir.
 */

const DB_NAME = "compras-panas-offline";
const DB_VERSION = 1;
const STORE_PENDENTES = "entregas_pendentes";

export type EntregaPendente = {
  id: string; // gerado client-side (Date.now() + random)
  entregaId: string;
  codigo: string;
  fotoBlob: Blob;
  mediaType: string;
  gps: { lat: number; lng: number; precisao_metros: number } | null;
  criadoEm: number; // Date.now()
  tentativas: number;
  ultimoErro?: string;
};

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PENDENTES)) {
        const store = db.createObjectStore(STORE_PENDENTES, { keyPath: "id" });
        store.createIndex("criadoEm", "criadoEm");
      }
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}

function gerarId(): string {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

export async function adicionarPendente(
  pendente: Omit<EntregaPendente, "id" | "criadoEm" | "tentativas">
): Promise<string> {
  const db = await openDB();
  const id = gerarId();
  const item: EntregaPendente = {
    ...pendente,
    id,
    criadoEm: Date.now(),
    tentativas: 0,
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_PENDENTES, "readwrite");
    tx.objectStore(STORE_PENDENTES).add(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return id;
}

export async function listarPendentes(): Promise<EntregaPendente[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PENDENTES, "readonly");
    const req = tx.objectStore(STORE_PENDENTES).index("criadoEm").getAll();
    req.onsuccess = () => {
      db.close();
      resolve(req.result as EntregaPendente[]);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function contarPendentes(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PENDENTES, "readonly");
    const req = tx.objectStore(STORE_PENDENTES).count();
    req.onsuccess = () => {
      db.close();
      resolve(req.result);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function removerPendente(id: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_PENDENTES, "readwrite");
    tx.objectStore(STORE_PENDENTES).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function atualizarPendente(
  id: string,
  patch: Partial<Pick<EntregaPendente, "tentativas" | "ultimoErro">>
): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_PENDENTES, "readwrite");
    const store = tx.objectStore(STORE_PENDENTES);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const cur = getReq.result as EntregaPendente | undefined;
      if (!cur) {
        resolve();
        return;
      }
      store.put({ ...cur, ...patch });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** Helpers pra converter Blob ↔ base64 (pra enviar pro /api) */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
