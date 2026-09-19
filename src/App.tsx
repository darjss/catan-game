import { Title } from "@solidjs/meta";
import { Loading } from "solid-js";
// Typed client env, validated and baked in at build time (see env.ts).
import { env } from "virtual:env/client";
import { Router } from "./router";
import "./app.css";

export default function App() {
  return (
    <Router>
      {(props) => (
        <>
          <Title>{env.VITE_APP_NAME}</Title>
          <Loading fallback={<main class="game">Loading…</main>}>{props.children}</Loading>
        </>
      )}
    </Router>
  );
}
