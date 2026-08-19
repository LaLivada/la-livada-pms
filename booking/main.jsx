/* Punctul de intrare al aplicației de rezervări.
 *
 * Stă lângă index.html, nu în src/, fiindcă `root` al acestui build e
 * folderul booking/ — o referință relativă din HTML se rezolvă astfel
 * fără ambiguitate, în dev și în build deopotrivă.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../src/booking/App.jsx";

createRoot(document.getElementById("rezervari")).render(
  <StrictMode><App /></StrictMode>,
);
