
export interface IPollingSystem {

  register(name: string, interval: number, callback: () => void): void;

  unregister(name: string): void;


}
