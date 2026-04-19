/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

declare module '*.svg?raw' {
  const content: string;
  export default content;
}

declare namespace App {
  interface Locals {
    user?: import('@supabase/supabase-js').User;
  }
}
