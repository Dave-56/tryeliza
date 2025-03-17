import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from './App';
import './globals.css';  // or wherever your CSS variables are defined
import './index.css';    // your Tailwind imports

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App/>
  </StrictMode>,
);
