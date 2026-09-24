import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { load, save, type StorageKey } from '../utils/storage';

/** useState that hydrates from and writes back to LocalStorage. */
export function usePersistentState<T>(key: StorageKey, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const fallback = typeof initial === 'function' ? (initial as () => T)() : initial;
    return load<T>(key, fallback);
  });
  useEffect(() => save(key, value), [key, value]);
  return [value, setValue];
}
