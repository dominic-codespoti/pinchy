import { createRouter } from "@tanstack/react-router";

// Augment Register to include our router instance
declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createRouter>;
  }
}
