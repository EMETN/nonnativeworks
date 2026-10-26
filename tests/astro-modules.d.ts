// tsc can't resolve .astro imports (only Astro's language server can), so tests need this shim.
declare module '*.astro' {
    const Component: import('astro/runtime/server/index.js').AstroComponentFactory;
    export default Component;
}
