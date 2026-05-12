// Stub for TanStack Start server-only modules in Capacitor/SPA builds.
export const useServerFn = (fn: unknown) => fn;
export const createServerFn = () => () => {};
export const createMiddleware = () => ({ server: () => ({}) });
export const getRequest = () => null;
export const json = (data: unknown) => data;
export const redirect = () => {};
export default {};
