import { Link, NavLink } from "react-router-dom";

const navigation = [
    { to: "/dashboard", label: "Vue d'ensemble", icon: "▦" },
    { to: "/dashboard/commandes", label: "Commandes", icon: "▱" },
    { to: "/dashboard/fournisseurs", label: "Fournisseurs", icon: "♧" },
    { to: "/dashboard/produits", label: "Produits", icon: "◇" },
    { to: "/dashboard/inventaire", label: "Inventaire", icon: "▤" },
    { to: "/dashboard/analyse", label: "Analyse", icon: "◷" },
    { to: "/dashboard/factures", label: "Factures", icon: "▤" },
    { to: "/dashboard/paiements", label: "Paiements", icon: "Ar" },
];

export default function Sidebar({ open = false, collapsed = false, onClose, onToggleCollapse, onLogout }) {
    return (
        <>
            {open && <button className="dashboard-backdrop" type="button" aria-label="Fermer le menu" onClick={onClose} />}
            <aside className={`dashboard-sidebar${open ? " is-open" : ""}`} aria-label="Navigation principale">
                <div className="sidebar-brand-row">
                    <Link className="dashboard-brand" to="/dashboard" onClick={onClose} title="Atelier">
                        <span className="brand-mark" aria-hidden="true">a.</span>
                        <span className="brand-copy"><strong>atelier</strong><small>GESTION DE COMMANDE</small></span>
                    </Link>
                    <button
                        className="sidebar-collapse-toggle"
                        type="button"
                        onClick={onToggleCollapse}
                        aria-label={collapsed ? "Élargir le menu" : "Réduire le menu"}
                        aria-expanded={!collapsed}
                        title={collapsed ? "Élargir le menu" : "Réduire le menu"}
                    >
                        <span aria-hidden="true">{collapsed ? "›" : "‹"}</span>
                    </button>
                </div>
                <p className="sidebar-caption">MODÈLES DU PROJET</p>
                <nav className="sidebar-navigation">
                    {navigation.map((item) => (
                        <NavLink
                            className={({ isActive }) => `sidebar-link${isActive ? " is-active" : ""}`}
                            end={item.to === "/dashboard"}
                            to={item.to}
                            key={item.to + item.label}
                            onClick={onClose}
                            aria-label={item.label}
                            title={collapsed ? item.label : undefined}
                        >
                            <span className="sidebar-icon" aria-hidden="true">{item.icon}</span>
                            <span>{item.label}</span>
                            {item.count && <span className="sidebar-count">{item.count}</span>}
                        </NavLink>
                    ))}
                </nav>
                <div className="sidebar-bottom">
                    <div className="sidebar-help">
                        <span className="help-orb" aria-hidden="true">✳</span>
                        <strong>Tout est en ordre.</strong>
                        <span>Votre activité est à jour.</span>
                    </div>
                    <button className="sidebar-link sidebar-logout" type="button" onClick={onLogout} aria-label="Se déconnecter" title={collapsed ? "Se déconnecter" : undefined}>
                        <span className="sidebar-icon" aria-hidden="true">↗</span>
                        <span>Se déconnecter</span>
                    </button>
                    <div className="sidebar-version">ATELIER · VOTRE ESPACE DE GESTION</div>
                </div>
            </aside>
        </>
    );
}