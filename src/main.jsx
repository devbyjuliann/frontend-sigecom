import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import App from "./App.jsx";
import { lockApplicationTitle } from "./config/document-title.js";
import "./index.css";

lockApplicationTitle(document);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
