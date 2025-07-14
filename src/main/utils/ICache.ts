export interface ICache<K,V> {
  get(key: K): V ;
  set(key: K, value: V): void;
  has(key: K): boolean;
  delete(key: K): void;
  startTTL(): void;

}