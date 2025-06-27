export {};

declare global {
  interface Performance {
    memory?: {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    };
  }

  interface Window {
    process: {
      env: {
        NODE_ENV: string;
      };
    };
  }
} 