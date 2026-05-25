declare module "@theme/Layout" {
  import type { ComponentType, ReactNode } from "react";

  const Layout: ComponentType<{ title?: string; children?: ReactNode }>;
  export default Layout;
}

declare module "@docusaurus/Link" {
  import type { ComponentType, ReactNode } from "react";

  const Link: ComponentType<{ to?: string; href?: string; className?: string; children?: ReactNode }>;
  export default Link;
}

declare module "*.module.css" {
  const classes: Record<string, string>;
  export default classes;
}

interface Navigator {
  modelContext?: {
    registerTool?: (definition: {
      name: string;
      description?: string;
      inputSchema?: object;
      schema?: object;
      execute?: (args: unknown) => unknown | Promise<unknown>;
      handler?: (args: unknown) => unknown | Promise<unknown>;
    }) => Promise<unknown> | unknown;
  };
}

interface Window {
  __wikiTools?: Record<string, (...args: any[]) => Promise<unknown>>;
}
