import React from "react";
import ReactDOM from "react-dom/client";

/* Load order matters: data + primitives populate `window` before the
   screens and shell read them at module-eval time. */
import "./portal-data.js";        // window.CI_* mock data
import "./tweaks-panel.jsx";      // TweaksPanel + tweak controls
import "./portal-shared.jsx";     // shared UI primitives

import "./portal-brandolph.jsx";  // screens
import "./portal-discovery.jsx";
import "./portal-briefs.jsx";
import "./portal-craft.jsx";
import "./portal-team.jsx";
import "./portal-floater.jsx";
import "./portal-auth.jsx";        // mock auth + login screens

import { App } from "./portal-shell.jsx"; // router + sidebar + topbar

ReactDOM.createRoot(document.getElementById("app")).render(<App />);
