import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { router, AppProviders } from "@/app/router";
import "@/styles/global.css";

const rootEl = document.getElementById("root");
if (rootEl == null) throw new Error("Missing #root element");

createRoot(rootEl).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
