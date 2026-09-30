import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import Layout from "./components/Layout";
import { AuthProvider } from "./lib/auth";
import { I18nProvider } from "./lib/i18n";
import { Spinner } from "./components/ui";
import Home from "./pages/Home";

const Assess = lazy(() => import("./pages/Assess"));
const Results = lazy(() => import("./pages/Results"));
const Source = lazy(() => import("./pages/Source"));
const Pack = lazy(() => import("./pages/Pack"));
const Work = lazy(() => import("./pages/Work"));
const Batches = lazy(() => import("./pages/Batches"));
const BatchDetail = lazy(() => import("./pages/BatchDetail"));
const PublicBatch = lazy(() => import("./pages/PublicBatch"));
const Shipments = lazy(() => import("./pages/Shipments"));
const Retail = lazy(() => import("./pages/Retail"));
const Complaints = lazy(() => import("./pages/Complaints"));
const Trials = lazy(() => import("./pages/Trials"));
const TrialDetail = lazy(() => import("./pages/TrialDetail"));
const Assistant = lazy(() => import("./pages/Assistant"));
const Library = lazy(() => import("./pages/Library"));
const Evidence = lazy(() => import("./pages/Evidence"));
const Login = lazy(() => import("./pages/Login"));

registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<div className="p-8"><Spinner label="Loading…" /></div>}>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="assess" element={<Assess />} />
                <Route path="results/:id" element={<Results />} />
                <Route path="source/:id" element={<Source />} />
                <Route path="pack/:id" element={<Pack />} />
                <Route path="work" element={<Work />} />
                <Route path="batches" element={<Batches />} />
                <Route path="batches/:id" element={<BatchDetail />} />
                <Route path="t/:token" element={<PublicBatch />} />
                <Route path="shipments" element={<Shipments />} />
                <Route path="retail" element={<Retail />} />
                <Route path="complaints" element={<Complaints />} />
                <Route path="trials" element={<Trials />} />
                <Route path="trials/:id" element={<TrialDetail />} />
                <Route path="assistant" element={<Assistant />} />
                <Route path="library" element={<Library />} />
                <Route path="evidence" element={<Evidence />} />
                <Route path="login" element={<Login />} />
                <Route path="*" element={<div className="card p-8 text-center"><h1 className="h1">Page not found</h1></div>} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </I18nProvider>
  </StrictMode>
);
