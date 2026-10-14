/**
 *  Main
 *
 *  @author dev-Joy    2026-10-11
 *  @description
 *      - 화면 진입점. 공용 스타일을 올리고 AppLayout을 그린다.
 */

/**
 *  External imports
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

/**
 *  Internal imports
 */
import "@/components/ZBC.css";
import AppLayout from "@/pages/AppLayout";

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <AppLayout />
    </StrictMode>,
);
