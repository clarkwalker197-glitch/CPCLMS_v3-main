declare module "next-pwa" {
  type PWAConfig = {
    dest?: string;
    register?: boolean;
    skipWaiting?: boolean;
    disable?: boolean;
    runtimeCaching?: Array<{
      urlPattern: (context: { url: URL; request: Request }) => boolean;
      handler: string;
      options?: Record<string, unknown>;
    }>;
    [key: string]: unknown;
  };

  function withPWA(config: PWAConfig): (nextConfig: unknown) => unknown;
  export default withPWA;
}

declare module "@ducanh2912/next-pwa" {
  type PWAConfig = {
    dest?: string;
    register?: boolean;
    skipWaiting?: boolean;
    disable?: boolean;
    runtimeCaching?: Array<{
      urlPattern: (context: { url: URL; request: Request }) => boolean;
      handler: string;
      options?: Record<string, unknown>;
    }>;
    [key: string]: unknown;
  };

  function withPWA(config: PWAConfig): (nextConfig: unknown) => unknown;
  export default withPWA;
}
