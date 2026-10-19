import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { getProduits } from "../../api/produit.api";
import { DATA_MUTATED_EVENT } from "../../api/axios";
import { getAuthenticatedUser, SESSION_CHANGED_EVENT } from "../../features/auth/authSession";

const NOTIFICATIONS_STORAGE_KEY = "atelier:activity-notifications";

function readStoredNotifications() {
    try {
        const value = JSON.parse(window.localStorage.getItem(NOTIFICATIONS_STORAGE_KEY) || "[]");
        if (!Array.isArray(value)) return [];
        return value.filter((notification) => (
            notification
            && typeof notification.id === "string"
            && typeof notification.message === "string"
            && typeof notification.time === "string"
            && !Number.isNaN(Date.parse(notification.time))
        )).map((notification) => ({ ...notification, read: Boolean(notification.read) }));
    } catch {
        return [];
    }
}

function Icon({ name }) {
    const paths = {
        search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>,
        menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
        bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
        chevron: <path d="m7 10 5 5 5-5" />,
        moon: <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z" />,
        sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>,
    };
    return <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

const MPD_TABLES = [
    { id: "utilisateurs", x: 415, y: 20, title: "UTILISATEURS", fields: ["id_utilisateur · PK", "email · UNIQUE", "nomUtilisateur · prenomUtilisateur", "telephone · role"] },
    { id: "fournisseurs", x: 25, y: 225, title: "FOURNISSEURS", fields: ["id_fournisseur · PK", "nom · prénom · raisonSociale", "email · telephone · adresse", "cree_par · FK nullable"] },
    { id: "produits", x: 415, y: 225, title: "PRODUITS", fields: ["id_produit · PK · codeProduit UNIQUE", "nomProduit · description · prixUnitaire", "quantiteStock", "fk_id_fournisseur · FK · cree_par FK nullable"] },
    { id: "commandes", x: 805, y: 225, title: "COMMANDES", fields: ["id_commande · PK · reference UNIQUE", "dateCommande · status", "fk_id_fournisseur · FK", "cree_par · FK nullable"] },
    { id: "lignes", x: 415, y: 500, title: "LIGNES_COMMANDE", fields: ["id_ligne_commande · PK", "fk_id_commande · FK", "fk_id_produit · FK", "quantite · prix"] },
    { id: "factures", x: 805, y: 500, title: "FACTURES", fields: ["id_facture · PK · reference_facture UNIQUE", "fk_id_commande · FK · montant_total", "date_facture · date_echeance", "cree_par · FK nullable"] },
    { id: "paiements", x: 805, y: 700, title: "PAIEMENTS", fields: ["id_paiement · PK · reference_paiement UNIQUE", "fk_id_facture · FK · montant", "mode_paiement · date_paiement", "cree_par · FK nullable"] },
];

function AboutMpdDiagram() {
    return (
        <div className="about-mpd-viewport" role="group" aria-label="Diagramme du modèle physique des données">
            <svg className="about-mpd-diagram" viewBox="0 0 1120 860" role="img" aria-labelledby="about-mpd-title about-mpd-description">
                <title id="about-mpd-title">Diagramme des tables et relations</title>
                <desc id="about-mpd-description">Les relations relient fournisseurs, produits, commandes, lignes de commande, factures, paiements et utilisateurs créateurs. Les cardinalités sont indiquées aux extrémités des liens.</desc>
                <defs>
                    <marker id="about-mpd-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                        <path d="M0 0L8 4L0 8Z" />
                    </marker>
                </defs>
                <g className="about-mpd-links">
                    <path d="M470 148V175H170V225" className="is-optional" />
                    <path d="M560 148V225" className="is-optional" />
                    <path d="M650 148V175H950V225" className="is-optional" />
                    <path d="M700 100H1105V756" className="is-optional is-bus" />
                    <path d="M1105 566H1095" className="is-optional" />
                    <path d="M1105 756H1095" className="is-optional" />
                    <path d="M315 300H415" />
                    <path d="M170 375V430H950V375" />
                    <path d="M560 375V500" />
                    <path d="M805 330H740V465H560V500" />
                    <path d="M950 375V500" />
                    <path d="M950 632V700" />
                </g>
                <g className="about-mpd-cardinalities" aria-hidden="true">
                    <text x="445" y="165">0..N</text><text x="181" y="216">0..1</text>
                    <text x="572" y="165">0..N</text><text x="572" y="216">0..1</text>
                    <text x="665" y="165">0..N</text><text x="960" y="216">0..1</text>
                    <text x="710" y="92">0..N</text>
                    <text x="1078" y="552" textAnchor="end">0..1</text>
                    <text x="1078" y="742" textAnchor="end">0..1</text>
                    <text x="318" y="289">1</text><text x="390" y="289">0..N</text>
                    <text x="183" y="410">1</text><text x="927" y="410">0..N</text>
                    <text x="572" y="393">1</text><text x="572" y="491">0..N</text>
                    <text x="785" y="318">1</text><text x="576" y="454">0..N</text>
                    <text x="962" y="393">1</text><text x="962" y="491">0..N</text>
                    <text x="962" y="653">1</text><text x="962" y="691">0..N</text>
                </g>
                {MPD_TABLES.map((table) => (
                    <g className="about-mpd-entity" key={table.id} transform={`translate(${table.x} ${table.y})`}>
                        <rect width="290" height="150" rx="10" />
                        <path d="M0 38H290" className="about-mpd-divider" />
                        <text x="14" y="25" className="about-mpd-entity-title">{table.title}</text>
                        {table.fields.map((field, index) => (
                            <text x="14" y={60 + index * 20} className="about-mpd-field" key={field}>{field}</text>
                        ))}
                    </g>
                ))}
            </svg>
        </div>
    );
}

export default function Navbar({
    onMenuToggle,
    searchValue,
    onSearchChange,
    searchResults,
    searchLoading,
    searchError,
    darkMode,
    onToggleTheme,
}) {
    const [searchOpen, setSearchOpen] = useState(false);
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);
    const [aboutOpen, setAboutOpen] = useState(false);
    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [notificationsLoading, setNotificationsLoading] = useState(true);
    const [notificationsLoaded, setNotificationsLoaded] = useState(false);
    const [notificationsError, setNotificationsError] = useState("");
    const [activityNotifications, setActivityNotifications] = useState(readStoredNotifications);
    const [unreadOnly, setUnreadOnly] = useState(false);
    const [user, setUser] = useState(getAuthenticatedUser);
    const profileMenuRef = useRef(null);
    const aboutTriggerRef = useRef(null);
    const aboutDialogRef = useRef(null);
    const unreadCount = activityNotifications.filter((notification) => !notification.read).length;
    const visibleActivity = unreadOnly
        ? activityNotifications.filter((notification) => !notification.read)
        : activityNotifications;

    const fetchLowStockProducts = useCallback(async () => {
        const data = await getProduits();
        return (Array.isArray(data) ? data : [])
            .filter((product) => Number(product.quantiteStock) <= 5)
            .sort((first, second) => Number(first.quantiteStock) - Number(second.quantiteStock));
    }, []);

    useEffect(() => {
        const updateUser = () => setUser(getAuthenticatedUser());
        const onDataMutated = (event) => {
            const notification = {
                id: `${Date.now()}-${Math.random()}`,
                message: event.detail?.message || "Les données ont été mises à jour.",
                time: new Date().toISOString(),
                read: false,
            };
            setActivityNotifications((current) => [notification, ...current].slice(0, 20));
            setNotificationsLoaded(false);
            setNotificationsLoading(true);
            fetchLowStockProducts()
                .then((products) => {
                    setNotifications(products);
                    setNotificationsLoaded(true);
                    setNotificationsError("");
                })
                .catch(() => setNotificationsError("Impossible de charger les alertes de stock."))
                .finally(() => setNotificationsLoading(false));
        };
        window.addEventListener(SESSION_CHANGED_EVENT, updateUser);
        window.addEventListener(DATA_MUTATED_EVENT, onDataMutated);
        return () => {
            window.removeEventListener(SESSION_CHANGED_EVENT, updateUser);
            window.removeEventListener(DATA_MUTATED_EVENT, onDataMutated);
        };
    }, [fetchLowStockProducts]);

    useEffect(() => {
        const closeOnOutsideClick = (event) => {
            if (!profileMenuRef.current?.contains(event.target)) setProfileMenuOpen(false);
        };
        const closeOnEscape = (event) => {
            if (event.key === "Escape") {
                setAboutOpen(false);
                setProfileMenuOpen(false);
            }
        };
        document.addEventListener("pointerdown", closeOnOutsideClick);
        document.addEventListener("keydown", closeOnEscape);
        return () => {
            document.removeEventListener("pointerdown", closeOnOutsideClick);
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, []);

    useEffect(() => {
        if (!aboutOpen) return undefined;
        const trigger = aboutTriggerRef.current;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        aboutDialogRef.current?.focus();
        return () => {
            document.body.style.overflow = previousOverflow;
            trigger?.focus();
        };
    }, [aboutOpen]);

    useEffect(() => {
        try {
            window.localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(activityNotifications));
        } catch (error) {
            console.error("Impossible d’enregistrer l’état des notifications.", error);
        }
    }, [activityNotifications]);

    useEffect(() => {
        let active = true;
        fetchLowStockProducts()
            .then((products) => {
                if (!active) return;
                setNotifications(products);
                setNotificationsLoaded(true);
                setNotificationsError("");
            })
            .catch(() => {
                if (active) setNotificationsError("Impossible de charger les alertes de stock.");
            })
            .finally(() => {
                if (active) setNotificationsLoading(false);
            });
        return () => { active = false; };
    }, [fetchLowStockProducts]);

    const toggleNotifications = () => {
        setNotificationsOpen((isOpen) => !isOpen);
        if (!notificationsLoaded && !notificationsLoading) {
            setNotificationsLoading(true);
            fetchLowStockProducts()
                .then((products) => {
                    setNotifications(products);
                    setNotificationsLoaded(true);
                    setNotificationsError("");
                })
                .catch(() => setNotificationsError("Impossible de charger les alertes de stock."))
                .finally(() => setNotificationsLoading(false));
        }
    };

    const markNotificationRead = (notificationId) => {
        setActivityNotifications((current) => current.map((notification) =>
            notification.id === notificationId ? { ...notification, read: true } : notification));
    };
    const markAllNotificationsRead = () => {
        setActivityNotifications((current) => current.map((notification) => ({ ...notification, read: true })));
    };

    const hasSearchResults = searchResults.products.length || searchResults.orders.length;

    return (
        <header className="dashboard-navbar">
            <button className="icon-button menu-toggle" type="button" aria-label="Ouvrir le menu" onClick={onMenuToggle}><Icon name="menu" /></button>
            <div className="navbar-search-wrap">
            <label className="navbar-search">
                <Icon name="search" />
                <input
                    type="search"
                    placeholder="Rechercher une commande, un produit…"
                    aria-label="Rechercher dans les commandes et les produits"
                    aria-expanded={searchOpen && Boolean(searchValue.trim())}
                    aria-controls="navbar-search-results"
                    value={searchValue}
                    onFocus={() => setSearchOpen(true)}
                    onChange={(event) => onSearchChange(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Escape") setSearchOpen(false);
                    }}
                />
                <kbd>⌘ K</kbd>
            </label>
            {searchOpen && searchValue.trim() && (
                <div className="navbar-popover search-popover" id="navbar-search-results" role="status">
                    {searchLoading ? <p className="popover-message">Recherche en cours…</p> : null}
                    {searchError ? <p className="popover-message popover-error">{searchError}</p> : null}
                    {!searchLoading && !searchError && !hasSearchResults && <p className="popover-message">Aucun résultat pour « {searchValue.trim()} ».</p>}
                    {!searchLoading && !searchError && hasSearchResults && (
                        <>
                            {searchResults.orders.length > 0 && (
                                <section className="search-result-group">
                                    <span className="popover-heading">COMMANDES</span>
                                    {searchResults.orders.map((order) => (
                                        <Link key={order.id_commande} to="/dashboard/commandes" onClick={() => { setSearchOpen(false); onSearchChange(""); }}>
                                            <strong>{order.reference}</strong><span>{order.status}</span>
                                        </Link>
                                    ))}
                                </section>
                            )}
                            {searchResults.products.length > 0 && (
                                <section className="search-result-group">
                                    <span className="popover-heading">PRODUITS</span>
                                    {searchResults.products.map((product) => (
                                        <Link key={product.id_produit} to="/dashboard/inventaire" onClick={() => { setSearchOpen(false); onSearchChange(""); }}>
                                            <strong>{product.nomProduit}</strong><span>{product.codeProduit} · {product.quantiteStock} en stock</span>
                                        </Link>
                                    ))}
                                </section>
                            )}
                        </>
                    )}
                </div>
            )}
            </div>
            <div className="navbar-actions">
                <span className="navbar-date">{new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</span>
                <span className="navbar-divider" />
                <div className="navbar-notifications">
                    <button
                        className="icon-button notification-button"
                        type="button"
                        aria-label="Afficher les notifications"
                        aria-expanded={notificationsOpen}
                        onClick={toggleNotifications}
                    >
                        <Icon name="bell" />
                        {unreadCount > 0 && <span className="notification-dot" />}
                    </button>
                    {notificationsOpen && (
                        <section className="navbar-popover notifications-popover" aria-label="Notifications et alertes de stock">
                            <div className="popover-title">
                                <strong>Notifications</strong>
                                <span aria-label={`${unreadCount} notification(s) non lue(s)`}>{unreadCount} non lue(s)</span>
                            </div>
                            <div className="notification-controls">
                                <button type="button" aria-pressed={unreadOnly} onClick={() => setUnreadOnly((current) => !current)}>
                                    {unreadOnly ? "Afficher tout" : "Non lues uniquement"}
                                </button>
                                <button type="button" onClick={markAllNotificationsRead} disabled={!unreadCount}>Tout marquer comme vu</button>
                            </div>
                            {visibleActivity.map((notification) => (
                                <article className={`notification-item${notification.read ? " is-read" : " is-unread"}`} key={notification.id}>
                                    <span className="notification-stock" />
                                    <span className="notification-copy"><strong>{notification.message}</strong><small>{new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(notification.time))} · {notification.read ? "Vue" : "Non lue"}</small></span>
                                    {!notification.read && <button className="notification-read-button" type="button" onClick={() => markNotificationRead(notification.id)}>Marquer comme vue</button>}
                                </article>
                            ))}
                            {unreadOnly && !visibleActivity.length && <p className="popover-message">Aucune notification non lue.</p>}
                            {notifications.length > 0 && <div className="popover-heading">STOCK À SURVEILLER</div>}
                            {notificationsLoading && <p className="popover-message">Chargement des stocks…</p>}
                            {notificationsError && <p className="popover-message popover-error">{notificationsError}</p>}
                            {!notificationsLoading && !notificationsError && !notifications.length && !activityNotifications.length && <p className="popover-message">Aucune notification. Tout est à jour.</p>}
                            {!notificationsLoading && notifications.map((product) => (
                                <Link
                                    className="notification-item"
                                    key={product.id_produit}
                                    to="/dashboard/inventaire"
                                    onClick={() => setNotificationsOpen(false)}
                                >
                                    <span className={`notification-stock${Number(product.quantiteStock) === 0 ? " is-empty" : ""}`} />
                                    <span><strong>{product.nomProduit}</strong><small>{Number(product.quantiteStock) === 0 ? "Rupture de stock" : `${product.quantiteStock} unité(s) restante(s)`}</small></span>
                                </Link>
                            ))}
                        </section>
                    )}
                </div>
                <div className="navbar-profile-wrap" ref={profileMenuRef}>
                    <button
                        className="navbar-profile"
                        type="button"
                        aria-label={`Menu du profil ${user?.name || "utilisateur"}`}
                        aria-expanded={profileMenuOpen}
                        aria-controls="profile-menu"
                        onClick={() => setProfileMenuOpen((open) => !open)}
                    >
                        <span className="profile-avatar">{user?.name?.charAt(0)?.toUpperCase() || "U"}</span>
                        <span className="profile-copy"><strong>{user?.name || "Utilisateur"}</strong></span>
                        <Icon name="chevron" />
                    </button>
                    {profileMenuOpen && (
                        <section className="navbar-popover profile-menu" id="profile-menu" aria-label="Préférences du profil">
                            <div className="profile-menu-heading"><strong>{user?.name || "Utilisateur"}</strong><small>{user?.role || "Compte connecté"}</small></div>
                            <button className="theme-toggle-option" type="button" aria-pressed={darkMode} onClick={onToggleTheme}>
                                <span className="theme-option-icon"><Icon name={darkMode ? "sun" : "moon"} /></span>
                                <span><strong>{darkMode ? "Mode clair" : "Mode sombre"}</strong><small>{darkMode ? "Désactiver le thème sombre" : "Activer le thème sombre"}</small></span>
                                <span className={`theme-switch${darkMode ? " is-on" : ""}`} aria-hidden="true"><i /></span>
                            </button>
                            <button
                                ref={aboutTriggerRef}
                                className="theme-toggle-option about-menu-option"
                                type="button"
                                onClick={() => {
                                    setProfileMenuOpen(false);
                                    setAboutOpen(true);
                                }}
                            >
                                <span className="theme-option-icon about-info-icon" aria-hidden="true">i</span>
                                <span><strong>À propos</strong><small>Projet, MPD et confidentialité</small></span>
                                <span className="about-menu-arrow" aria-hidden="true">↗</span>
                            </button>
                        </section>
                    )}
                </div>
            </div>
            {aboutOpen && createPortal(
                <div className="about-modal-backdrop" onMouseDown={(event) => {
                    if (event.target === event.currentTarget) setAboutOpen(false);
                }}>
                    <section
                        className="about-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="about-modal-title"
                        tabIndex={-1}
                        ref={aboutDialogRef}
                        onMouseDown={(event) => event.stopPropagation()}
                    >
                        <header className="about-modal-header">
                            <div>
                                <p className="about-modal-kicker">GESTION DE COMMANDE</p>
                                <h2 id="about-modal-title">À propos du projet</h2>
                                <p>Application de gestion des fournisseurs, stocks et commandes.</p>
                            </div>
                            <button className="about-modal-close" type="button" aria-label="Fermer À propos" onClick={() => setAboutOpen(false)}>×</button>
                        </header>
                        <div className="about-modal-content">
                            <section className="about-section">
                                <h3>Identité de l’auteur</h3>
                                <dl className="about-identity">
                                    <div><dt>Nom</dt><dd>RAZAFINDRAIBE Jessy Roméo</dd></div>
                                    <div><dt>Formation</dt><dd>Étudiant en informatique de gestion</dd></div>
                                    <div><dt>Nationalité</dt><dd>Malagasy</dd></div>
                                </dl>
                            </section>

                            <section className="about-section">
                                <h3>MPD — Modèle physique des données</h3>
                                <p className="about-section-intro">PK : clé primaire, FK : clé étrangère. Chaque flèche part de la table référencée ; les cardinalités sont indiquées aux extrémités. Les liens en pointillés représentent les FK cree_par facultatives.</p>
                                <AboutMpdDiagram />
                            </section>

                            <section className="about-section">
                                <h3>Politique de confidentialité</h3>
                                <div className="about-policy">
                                    <h4>Données utilisées</h4>
                                    <p>Les informations de compte (nom, prénom, e-mail, téléphone et rôle) ainsi que les données métier saisies (fournisseurs, produits, commandes, factures et paiements) sont traitées pour fournir les fonctions de l’application.</p>
                                    <h4>Finalités et accès</h4>
                                    <p>Les données servent à gérer les achats, les stocks, les relations fournisseurs et les règlements. Les enregistrements métier sont associés au compte qui les crée et les API limitent leur consultation et leur modification à cet espace. Les administrateurs disposent des fonctions de gestion des comptes prévues par l’application.</p>
                                    <h4>Authentification et stockage local</h4>
                                    <p>L’accès aux données nécessite une authentification. Les jetons de session sont conservés dans le stockage local du navigateur pour maintenir la connexion. Les préférences d’interface et l’état des notifications d’activité sont également enregistrés localement sur cet appareil.</p>
                                    <h4>Conservation, sécurité et droits</h4>
                                    <p>Les données métier sont conservées dans la base de l’application selon le déploiement et les règles de l’établissement. Protégez vos identifiants et déconnectez-vous sur un appareil partagé. Pour demander l’accès, la rectification ou la suppression de données, contactez l’administrateur de l’application ou l’auteur du projet.</p>
                                    <p className="about-policy-note">Projet étudiant : cette notice décrit les traitements prévus par l’application et ne remplace pas les obligations de confidentialité de l’organisation qui l’héberge.</p>
                                </div>
                            </section>
                        </div>
                        <footer className="about-modal-footer">
                            <span>Gestion de commande · Projet académique</span>
                            <button type="button" className="about-modal-done" onClick={() => setAboutOpen(false)}>Fermer</button>
                        </footer>
                    </section>
                </div>,
                document.body,
            )}
        </header>
    );
}