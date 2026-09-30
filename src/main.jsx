import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
// Fonts ship with the app so the board never depends on Google Fonts loading.
import "@fontsource/rubik/400.css";
import "@fontsource/rubik/500.css";
import "@fontsource/rubik/600.css";
import "@fontsource/rubik/700.css";
import "@fontsource/rubik/800.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/barlow-condensed/800.css";
import "./styles.css";

createRoot(document.getElementById("root")).render(<App />);
