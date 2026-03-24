import { render } from "solid-js/web";
import { RouterProvider } from "@tanstack/solid-router";
import { router } from "./router";
import "./styles/theme.css";

const root = document.getElementById("app");
if (root) {
  render(() => <RouterProvider router={router} />, root);
}
