/**
 * Wrapper minimal sobre IndexedDB pra fila de bipadas offline.
 *
 * Schema:
 *   db: panas_entregas_offline (v1)
 *   store: pendentes — keyPath: id (autoIncrement)
 *     campos: { codigo: string, gps: GpsCapturado, ts: number, tentativas: number, ultimoErro?: string }
 */

export type GpsCapturado = {
  lat: number;
  lng: number;
  precisao_metros: number;
} | null;

export type Pendente = {
  id?: number;
  codigo: string;
  gps: GpsCapturado;
  ts: number;
  tentativas: number;
  ultimoErro?: string;
};

const DB_NAME = "panas_entregas_offline";
const DB_VERSION = 1;
const STORE = "pendentes";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function adicionarPendente(codigo: string, gps: GpsCapturado): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.add({
      codigo,
      gps,
      ts: Date.now(),
      tentativas: 0,
    } as Pendente);
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error);
  });
}

export async function listarPendentes(): Promise<Pendente[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result ?? []) as Pendente[]);
    req.onerror = () => reject(req.error);
  });
}

export async function contarPendentes(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function removerPendente(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function atualizarPendente(p: Pendente): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(p);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
