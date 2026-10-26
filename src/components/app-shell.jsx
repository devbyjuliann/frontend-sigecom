import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { CaretDown } from "@phosphor-icons/react/CaretDown";
import { CaretLeft } from "@phosphor-icons/react/CaretLeft";
import { House } from "@phosphor-icons/react/House";
import { List } from "@phosphor-icons/react/List";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { SignOut } from "@phosphor-icons/react/SignOut";
import { X } from "@phosphor-icons/react/X";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { toast } from "sonner";
import { Button } from "./ui/button.jsx";
import { useAuth } from "../auth/auth-context.jsx";

const navigation = [
  {
    label: "Inicio",
    path: "/inicio",
    permission: "dashboard.read",
    icon: House,
  },
];

const roleNames = {
  administrator: "Administrador",
  seller: "Vendedor",
  warehouse: "Bodega",
  auditor: "Auditor",
};

function Brand({ collapsed = false }) {
  return (
    <Link
      className="shell-brand"
      to="/inicio"
      aria-label="SIGECOM, ir a Inicio"
    >
      <span className="shell-brand__mark" aria-hidden="true">
        S
      </span>
      {!collapsed ? (
        <span className="shell-brand__name" translate="no">
          SIGECOM
        </span>
      ) : null}
    </Link>
  );
}

function SearchNavigation({ destinations, onNavigate }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es-CO");
    if (!normalized) return [];
    return destinations.filter((item) =>
      item.label.toLocaleLowerCase("es-CO").includes(normalized),
    );
  }, [destinations, query]);

  return (
    <div className="nav-search">
      <MagnifyingGlass size={18} aria-hidden="true" />
      <input
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "Enter" && matches[0]) {
            event.preventDefault();
            onNavigate(matches[0].path);
            setOpen(false);
            setQuery("");
          }
        }}
        aria-label="Buscar páginas disponibles"
        aria-expanded={open && Boolean(query.trim())}
        aria-controls="navigation-search-results"
        placeholder="Buscar una página…"
      />
      {open && query.trim() ? (
        <div
          className="search-results"
          id="navigation-search-results"
          role="listbox"
          aria-label="Páginas disponibles"
        >
          {matches.length ? (
            <ul>
              {matches.map((item) => (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    onClick={() => {
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p role="status">No hay páginas disponibles con ese nombre.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function SidebarContent({
  collapsed,
  onToggle,
  onNavigate,
  showCollapse = true,
}) {
  const { session } = useAuth();
  const destinations = navigation.filter((item) =>
    session.permissions.includes(item.permission),
  );

  return (
    <>
      <div className="sidebar-brand-row">
        <Brand collapsed={collapsed} />
        {showCollapse ? (
          <Button
            variant="ghost"
            className="sidebar-collapse"
            type="button"
            onClick={onToggle}
            aria-label={
              collapsed ? "Expandir menú lateral" : "Contraer menú lateral"
            }
            aria-expanded={!collapsed}
            title={
              collapsed ? "Expandir menú lateral" : "Contraer menú lateral"
            }
          >
            <CaretLeft size={18} aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      {!collapsed ? (
        <p className="sidebar-section-label">Navegación</p>
      ) : (
        <span className="sr-only">Navegación</span>
      )}
      <nav className="sidebar-nav" aria-label="Navegación principal">
        {destinations.map((item) => (
          <NavLink
            key={item.path}
            className={({ isActive }) =>
              `sidebar-link${isActive ? " sidebar-link--active" : ""}`
            }
            to={item.path}
            title={collapsed ? item.label : undefined}
            onClick={onNavigate}
          >
            <span className="sidebar-link__icon" aria-hidden="true">
              <item.icon size={19} weight="regular" />
            </span>
            {!collapsed ? (
              <span>{item.label}</span>
            ) : (
              <span className="sr-only">{item.label}</span>
            )}
          </NavLink>
        ))}
        {!destinations.length ? (
          <p className="sidebar-empty">
            No hay páginas habilitadas para tu rol.
          </p>
        ) : null}
      </nav>

      {!collapsed ? (
        <div className="sidebar-footer">
          <span className="sidebar-footer__dot" aria-hidden="true" />
          <span>Acceso seguro</span>
        </div>
      ) : null}
    </>
  );
}

function UserMenu() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const user = session.user;
  const displayName = user.displayName || user.email;

  async function handleLogout() {
    try {
      await logout();
      navigate("/ingresar", { replace: true });
    } catch {
      navigate("/ingresar", { replace: true });
      toast.error(
        "No se pudo confirmar el cierre de sesión. Comprueba la conexión.",
      );
    }
  }

  return (
    <div className="profile-menu-wrap">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            className="profile-trigger"
            type="button"
            aria-label={`Menú de usuario: ${displayName}`}
          >
            <span className="profile-avatar" aria-hidden="true">
              {displayName.slice(0, 1).toLocaleUpperCase("es-CO")}
            </span>
            <span className="profile-copy">
              <span className="profile-name">{displayName}</span>
              <span className="profile-role">
                {roleNames[user.role] || "Usuario"}
              </span>
            </span>
            <CaretDown size={16} aria-hidden="true" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="profile-dropdown"
            align="end"
            sideOffset={8}
          >
            <DropdownMenu.Label className="profile-dropdown__identity">
              <span>{displayName}</span>
              <small>{roleNames[user.role] || "Usuario"}</small>
            </DropdownMenu.Label>
            <DropdownMenu.Separator className="dropdown-separator" />
            <DropdownMenu.Item
              className="dropdown-item"
              onSelect={handleLogout}
            >
              <SignOut size={17} aria-hidden="true" />
              Cerrar sesión
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}

export default function AppShell() {
  const { session } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const destinations = navigation.filter((item) =>
    session.permissions.includes(item.permission),
  );
  const pageTitle =
    destinations.find((item) => item.path === location.pathname)?.label ||
    "SIGECOM";
  const sidebarWidth = collapsed ? 76 : 248;

  return (
    <>
      <a className="skip-link" href="#contenido-principal">
        Saltar al contenido
      </a>
      <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <div className="app-shell">
          <motion.aside
            className={`app-sidebar${collapsed ? " app-sidebar--collapsed" : ""}`}
            animate={{ width: sidebarWidth }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: 0.18, ease: "easeOut" }
            }
          >
            <SidebarContent
              collapsed={collapsed}
              onToggle={() => setCollapsed((value) => !value)}
            />
          </motion.aside>

          <Dialog.Portal>
            <Dialog.Overlay className="mobile-sidebar-overlay" />
            <Dialog.Content
              className="mobile-sidebar"
              aria-describedby={undefined}
            >
              <Dialog.Title className="sr-only">
                Menú de navegación
              </Dialog.Title>
              <div className="mobile-sidebar__close-row">
                <span />
                <Dialog.Close asChild>
                  <Button variant="ghost" aria-label="Cerrar menú">
                    <X size={20} aria-hidden="true" />
                  </Button>
                </Dialog.Close>
              </div>
              <SidebarContent
                collapsed={false}
                showCollapse={false}
                onToggle={() => setMobileOpen(false)}
                onNavigate={() => setMobileOpen(false)}
              />
            </Dialog.Content>
          </Dialog.Portal>

          <div className="shell-main">
            <header className="topbar">
              <div className="topbar-leading">
                <Dialog.Trigger asChild>
                  <Button
                    variant="ghost"
                    className="mobile-menu-trigger"
                    aria-label="Abrir menú"
                  >
                    <List size={21} aria-hidden="true" />
                  </Button>
                </Dialog.Trigger>
                <div className="topbar-heading">
                  <h1>{pageTitle}</h1>
                  <p>Comercializadora S.A.S.</p>
                </div>
              </div>
              <div className="topbar-tools">
                <SearchNavigation
                  destinations={destinations}
                  onNavigate={navigate}
                />
                <UserMenu />
              </div>
            </header>
            <main
              className="shell-content"
              id="contenido-principal"
              tabIndex={-1}
            >
              <Outlet />
            </main>
          </div>
        </div>
      </Dialog.Root>
    </>
  );
}
