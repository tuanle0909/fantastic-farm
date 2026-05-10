export {};

declare global {
    interface Window {
        onUnityClick: (msg: string) => void;
    }
}