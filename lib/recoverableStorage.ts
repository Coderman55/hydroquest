// AsyncStorage adapter that prevents a failed restore from being overwritten by
// a subsequent Zustand state update. Writes open only after the full persist
// pipeline (read, JSON parse, migration, and merge) reports success.
import type { StateStorage } from 'zustand/middleware';

export type RecoverableStorage = StateStorage & {
  openWrites: () => void;
  closeWrites: () => void;
};

export function createRecoverableStorage(storage: StateStorage): RecoverableStorage {
  let writesOpen = false;

  return {
    // Normalize synchronous adapter throws into rejected promises, so the
    // persist error callback always runs after store construction.
    getItem: async (name) => storage.getItem(name),
    setItem: (name, value) => (writesOpen ? storage.setItem(name, value) : undefined),
    removeItem: (name) => (writesOpen ? storage.removeItem(name) : undefined),
    openWrites: () => {
      writesOpen = true;
    },
    closeWrites: () => {
      writesOpen = false;
    },
  };
}
