import { useEffect, useState } from "react";
import "./index.css";

export default function App() {
  const [connection, setConnection] = useState({
    status: "loading",
    service: "",
  });

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/v1/health", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("La API no está disponible.");
        return response.json();
      })
      .then((data) =>
        setConnection({ status: data.status, service: data.service }),
      )
      .catch((error) => {
        if (error.name !== "AbortError")
          setConnection({ status: "error", service: "" });
      });

    return () => controller.abort();
  }, []);

  const apiMessage = {
    loading: "Comprobando la conexión con la API…",
    ok: "Frontend y backend se comunican correctamente.",
    error:
      "No se pudo conectar con la API. Comprueba que el backend esté iniciado.",
  }[connection.status];

  return (
    <main className="shell">
      <section className="service-panel" aria-labelledby="service-title">
        <div className="brand-mark" aria-hidden="true">
          S
        </div>
        <p className="eyebrow">Comercializadora S.A.S.</p>
        <h1 id="service-title">SIGECOM</h1>
        <p className="subtitle">Sistema de Gestión Comercial</p>
        <div
          className={`connection connection--${connection.status}`}
          role="status"
          aria-live="polite"
        >
          <span className="connection__indicator" aria-hidden="true" />
          <span>{apiMessage}</span>
        </div>
        {connection.service && (
          <p className="service-name">Servicio: {connection.service}</p>
        )}
      </section>
    </main>
  );
}
