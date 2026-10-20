import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import MainLayout from "../../../components/layouts/mainLayout";
import PasswordInput from "../../../components/PasswordInput";
import { getFournisseurs, createFournisseur } from "../../../api/fournisseur.api";
import { getCommandes, createCommande, resendCommande, completeCommandePayment } from "../../../api/commande.api";
import { getProduits, createProduit } from "../../../api/produit.api";
import { getFactures, createFacture, downloadFacture } from "../../../api/facture.api";
import { getPaiements, createPaiement } from "../../../api/paiement.api";
import { getUtilisateurs, createUtilisateur } from "../../../api/utilisateur.api";
import { api } from "../../../api/axios";
import { formatAriary } from "../../../utils/currency";
import "./modelPage.css";

const entityMeta = {
  fournisseur: {
    title: 'Fournisseurs',
    subtitle: 'Relations commerciales et approvisionnements',
    tabs: [{ label: "Vue d'ensemble", to: '/dashboard/fournisseurs' }, { label: 'Produits', to: '/dashboard/produits' }, { label: 'Commandes', to: '/dashboard/commandes' }],
    primaryAction: 'Nouvelle relation',
    fetcher: getFournisseurs,
    creator: createFournisseur,
  },
  commande: {
    title: 'Commandes',
    subtitle: 'Suivi des achats et livraisons',
    tabs: [{ label: "Vue d'ensemble", to: '/dashboard/commandes' }, { label: 'Factures', to: '/dashboard/factures' }, { label: 'Paiements', to: '/dashboard/paiements' }],
    primaryAction: 'Nouvelle commande',
    fetcher: getCommandes,
    creator: createCommande,
  },
  utilisateur: {
    title: 'Utilisateurs',
    subtitle: 'Gestion des profils et accès',
    tabs: [{ label: "Vue d'ensemble", to: '/dashboard/utilisateurs' }],
    primaryAction: 'Ajouter un utilisateur',
    fetcher: getUtilisateurs,
    creator: createUtilisateur,
    adminOnly: true,
  },
  paiement: {
    title: 'Paiements',
    subtitle: 'Suivi financier et règlements',
    tabs: [{ label: 'Historique', to: '/dashboard/paiements' }, { label: 'Factures', to: '/dashboard/factures' }],
    primaryAction: null,
    fetcher: getPaiements,
    creator: createPaiement,
  },
  produit: {
    title: 'Produits',
    subtitle: 'Catalogue et gestion de stock',
    tabs: [{ label: "Vue d'ensemble", to: '/dashboard/produits' }, { label: 'Inventaire', to: '/dashboard/inventaire' }, { label: 'Fournisseurs', to: '/dashboard/fournisseurs' }, { label: 'Analyse', to: '/dashboard/analyse' }],
    primaryAction: null,
    fetcher: getProduits,
    creator: createProduit,
  },
  facture: {
    title: 'Factures',
    subtitle: 'Factures générées avec les commandes et suivi des échéances',
    tabs: [{ label: "Vue d'ensemble", to: '/dashboard/factures' }, { label: 'Commandes', to: '/dashboard/commandes' }, { label: 'Paiements', to: '/dashboard/paiements' }],
    primaryAction: null,
    fetcher: getFactures,
    creator: createFacture,
  },
};

const defaultRole = () => {
  const token = localStorage.getItem('access');
  if (!token) return 'achateur';
  try {
    const payload = JSON.parse(atob(token.split('.')[1] || ''));
    return payload.role || 'achateur';
  } catch {
    return 'achateur';
  }
};

function StatusPill({ value }) {
  const text = value || '—';
  const tone = text.toLowerCase().includes('actif') || text.toLowerCase().includes('livrée') || text.toLowerCase().includes('payée') || text.toLowerCase().includes('confirm') || text.toLowerCase().includes('complète')
    ? 'success'
    : text.toLowerCase().includes('en cours') || text.toLowerCase().includes('partielle') || text.toLowerCase().includes('à suivre') || text.toLowerCase().includes('en attente') || text.toLowerCase().includes('à payer')
      ? 'warn'
      : 'neutral';

  return <span className={`entity-status entity-status-${tone}`}>{text}</span>;
}

function formatCurrency(value) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? formatAriary(numeric) : value || '—';
}

const orderDateFormat = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function formatOrderDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : orderDateFormat.format(date);
}

function getSaveErrorMessage(error) {
  const data = error?.response?.data;
  if (typeof data === 'string') return data;
  if (data && typeof data === 'object') {
    const errors = Object.entries(data)
      .flatMap(([field, messages]) => {
        const label = field === 'email' ? 'E-mail' : field === 'non_field_errors' ? '' : field;
        return (Array.isArray(messages) ? messages : [messages])
          .filter((message) => typeof message === 'string')
          .map((message) => label ? `${label} : ${message}` : message);
      });
    if (errors.length) return errors.join(' ');
  }
  if (!error?.response) return 'Impossible de contacter le serveur. Vérifiez votre connexion puis réessayez.';
  return 'L’opération a échoué. Vérifiez les informations saisies puis réessayez.';
}

function createEmptyUserForm() {
  return {
    nomUtilisateur: '',
    prenomUtilisateur: '',
    email: '',
    telephone: '',
    password: '',
    role: 'achateur',
  };
}

function createEmptyRelationForm() {
  return {
    nomFournisseur: '',
    prenomFournisseur: '',
    raisonSociale: '',
    posteFournisseur: '',
    email: '',
    telephone: '',
    adresse: '',
  };
}

function createEmptyOrderForm() {
  return {
    fk_id_fournisseur: '',
    status: 'en_attente',
    panier: [],
  };
}

function createEmptyProductForm() {
  return {
    nomProduit: '',
    description: '',
    prixUnitaire: '',
    quantiteStock: '',
    fk_id_fournisseur: '',
  };
}

function createEmptyPaymentForm() {
  return {
    mode_paiement: 'Virement',
  };
}

function createEmptyInvoiceForm() {
  return { fk_id_commande: '', montant_total: '', date_echeance: '' };
}

const entityEndpoints = {
  fournisseur: ['fournisseurs', 'id_fournisseur'],
  commande: ['commandes', 'id_commande'],
  utilisateur: ['utilisateurs', 'id_utilisateur'],
  paiement: ['paiements', 'id_paiement'],
  produit: ['produits', 'id_produit'],
  facture: ['factures', 'id_facture'],
};

async function persistEntity(type, payload, record, creator) {
  if (!record) return creator(payload);
  const [endpoint, idField] = entityEndpoints[type];
  const response = await api.patch(`/${endpoint}/${record[idField]}/`, payload);
  return response.data;
}

export default function ModelPage({ entity = 'commande' }) {
  const meta = entityMeta[entity] || entityMeta.commande;
  const location = useLocation();
  const navigate = useNavigate();
  const handledPaymentNotificationRef = useRef(null);
  const [rows, setRows] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalType, setModalType] = useState(null);
  const [editingRecord, setEditingRecord] = useState(null);
  const [recordPendingDeletion, setRecordPendingDeletion] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productStockFilter, setProductStockFilter] = useState('all');
  const [actionError, setActionError] = useState('');
  const [form, setForm] = useState({});
  const [panier, setPanier] = useState([]);
  const [panierItemType, setPanierItemType] = useState('catalogue');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const [customItemName, setCustomItemName] = useState('');
  const [customItemPrice, setCustomItemPrice] = useState('');
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState(null);
  const [resendingOrderId, setResendingOrderId] = useState(null);
  const role = defaultRole();
  const isAdmin = role === 'Admin' || role === 'admin';

  const requestData = useMemo(() => {
    const base = { fournisseur: getFournisseurs, commande: getCommandes, produit: getProduits, facture: getFactures, paiement: getPaiements, utilisateur: getUtilisateurs };
    return base[entity] || getCommandes;
  }, [entity]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const data = await requestData();
        setRows(Array.isArray(data) ? data : []);
        if (entity === 'commande' || entity === 'produit' || entity === 'paiement' || entity === 'facture' || entity === 'fournisseur') {
          const fournisseurData = await getFournisseurs();
          setSuppliers(fournisseurData || []);
        }
        if (entity === 'commande' || entity === 'produit') {
          const produitData = await getProduits();
          setProducts(produitData || []);
        }
        if (entity === 'paiement' || entity === 'commande' || entity === 'facture') {
          const factureData = await getFactures();
          setInvoices(factureData || []);
        }
        if (entity === 'facture') {
          const orderData = await getCommandes();
          setOrders(orderData || []);
        }
      } catch (error) {
        setRows([]);
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [entity, requestData]);

  useEffect(() => {
    if (!recordPendingDeletion) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isDeleting) setRecordPendingDeletion(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [recordPendingDeletion, isDeleting]);

  const openModal = (type) => {
    setMessage('');
    setEditingRecord(null);
    setPaymentOrder(null);
    if (type === 'fournisseur') setForm(createEmptyRelationForm());
    if (type === 'commande') setForm(createEmptyOrderForm());
    if (type === 'produit') setForm(createEmptyProductForm());
    if (type === 'paiement') setForm(createEmptyPaymentForm());
    if (type === 'utilisateur') setForm(createEmptyUserForm());
    if (type === 'facture') setForm(createEmptyInvoiceForm());
    setPanier([]);
    setPanierItemType('catalogue');
    setSelectedProductId('');
    setSelectedQuantity(1);
    setCustomItemName('');
    setCustomItemPrice('');
    setModalType(type);
  };

  const openPaymentModal = useCallback((order) => {
    setMessage('');
    setEditingRecord(null);
    setPaymentOrder(order);
    setForm(createEmptyPaymentForm());
    setModalType('paiement');
  }, []);

  useEffect(() => {
    const orderId = location.state?.paymentOrderId;
    if (!orderId) {
      handledPaymentNotificationRef.current = null;
      return;
    }
    if (entity !== 'commande' || loading || handledPaymentNotificationRef.current === orderId) return;
    handledPaymentNotificationRef.current = orderId;
    const order = rows.find((item) => String(item.id_commande) === String(orderId));
    if (order && order.status === 'confirme') {
      window.setTimeout(() => openPaymentModal(order), 0);
    }
    navigate(location.pathname, { replace: true, state: null });
  }, [entity, loading, location.pathname, location.state, navigate, openPaymentModal, rows]);

  const openEditModal = (type, record) => {
    setMessage('');
    setEditingRecord(record);
    setPaymentOrder(null);
    if (type === 'fournisseur') setForm({
      nomFournisseur: record.nomFournisseur || '',
      prenomFournisseur: record.prenomFournisseur || '',
      raisonSociale: record.raisonSociale || '',
      posteFournisseur: record.posteFournisseur || '',
      email: record.email || '',
      telephone: record.telephone || '',
      adresse: record.adresse || '',
    });
    if (type === 'commande') setForm({
      fk_id_fournisseur: record.fk_id_fournisseur || '',
      status: record.status || 'en_attente',
    });
    if (type === 'produit') setForm({
      nomProduit: record.nomProduit || '',
      description: record.description || '',
      prixUnitaire: record.prixUnitaire || '',
      quantiteStock: record.quantiteStock || '',
      fk_id_fournisseur: record.fk_id_fournisseur || '',
    });
    if (type === 'paiement') setForm({
      fk_id_facture: record.fk_id_facture || '',
      montant: record.montant || '',
      mode_paiement: record.mode_paiement || 'Virement',
    });
    if (type === 'utilisateur') setForm({
      nomUtilisateur: record.nomUtilisateur || '',
      prenomUtilisateur: record.prenomUtilisateur || '',
      email: record.email || '',
      telephone: record.telephone || '',
      password: '',
      role: record.role || 'achateur',
    });
    if (type === 'facture') setForm({
      fk_id_commande: record.fk_id_commande || '',
      montant_total: record.montant_total || '',
      date_echeance: record.date_echeance ? String(record.date_echeance).slice(0, 10) : '',
    });
    setPanier([]);
    setPanierItemType('catalogue');
    setModalType(type);
  };

  const closeModal = () => {
    setModalType(null);
    setEditingRecord(null);
    setPaymentOrder(null);
    setForm({});
    setPanier([]);
    setPanierItemType('catalogue');
    setSelectedProductId('');
    setSelectedQuantity(1);
    setCustomItemName('');
    setCustomItemPrice('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const requiredFields = {
      fournisseur: ['nomFournisseur', 'prenomFournisseur', 'raisonSociale', 'email'],
      commande: ['fk_id_fournisseur'],
      produit: ['nomProduit', 'prixUnitaire', 'quantiteStock', 'fk_id_fournisseur'],
      paiement: paymentOrder ? ['mode_paiement'] : ['fk_id_facture', 'montant', 'mode_paiement'],
      utilisateur: ['nomUtilisateur', 'prenomUtilisateur', 'email', ...(!editingRecord ? ['password'] : [])],
      facture: ['fk_id_commande', 'montant_total'],
    }[modalType] || [];
    const missingField = requiredFields.find((field) => String(form[field] ?? '').trim() === '');
    if (missingField) {
      const fieldNames = {
        nomFournisseur: 'le nom',
        prenomFournisseur: 'le prénom',
        raisonSociale: 'la raison sociale',
        email: 'l’e-mail',
        fk_id_fournisseur: 'le fournisseur',
        nomProduit: 'le nom du produit',
        prixUnitaire: 'le prix unitaire',
        quantiteStock: 'la quantité en stock',
        fk_id_facture: 'la facture',
        montant: 'le montant',
        mode_paiement: 'le mode de paiement',
        nomUtilisateur: 'le nom',
        prenomUtilisateur: 'le prénom',
        password: 'le mot de passe',
        fk_id_commande: 'la commande',
        montant_total: 'le montant total',
      };
      setMessage(`Veuillez renseigner ${fieldNames[missingField] || 'tous les champs obligatoires'}.`);
      return;
    }
    setIsSaving(true);
    setMessage('');
    try {
      if (modalType === 'fournisseur') {
        await persistEntity('fournisseur', {
          nomFournisseur: form.nomFournisseur.trim(),
          prenomFournisseur: form.prenomFournisseur.trim(),
          raisonSociale: form.raisonSociale.trim(),
          posteFournisseur: form.posteFournisseur.trim(),
          email: form.email.trim(),
          telephone: form.telephone.trim(),
          adresse: form.adresse.trim(),
        }, editingRecord, createFournisseur);
      }

      if (modalType === 'commande') {
        if (!editingRecord && !panier.length) {
          setMessage('Ajoutez au moins un produit avant d’enregistrer la commande.');
          setIsSaving(false);
          return;
        }
        const savedOrder = await persistEntity('commande', {
          fk_id_fournisseur: Number(form.fk_id_fournisseur),
          ...(!editingRecord ? {
            panier: panier.map((item) => ({
              ...(item.id_produit
                ? { id_produit: Number(item.id_produit) }
                : { nom_produit: item.nomProduit, prix: Number(item.prix) }),
              quantite: Number(item.quantite),
            })),
          } : {}),
        }, editingRecord, createCommande);
        if (savedOrder.email_error) setActionError(savedOrder.email_error);
      }

      if (modalType === 'produit') {
        await persistEntity('produit', {
          nomProduit: form.nomProduit,
          description: form.description,
          prixUnitaire: Number(form.prixUnitaire),
          quantiteStock: Number(form.quantiteStock),
          fk_id_fournisseur: Number(form.fk_id_fournisseur),
        }, editingRecord, createProduit);
      }

      if (modalType === 'paiement') {
        if (paymentOrder) {
          const result = await completeCommandePayment(paymentOrder.id_commande, form.mode_paiement);
          setActionError(result.detail);
        } else {
          await persistEntity('paiement', {
            fk_id_facture: Number(form.fk_id_facture),
            montant: Number(form.montant),
            mode_paiement: form.mode_paiement,
          }, editingRecord, createPaiement);
        }
      }

      if (modalType === 'utilisateur') {
        const payload = {
          nomUtilisateur: form.nomUtilisateur,
          prenomUtilisateur: form.prenomUtilisateur,
          email: form.email,
          telephone: form.telephone,
          role: form.role,
        };
        if (form.password) payload.password = form.password;
        await persistEntity('utilisateur', payload, editingRecord, createUtilisateur);
      }

      if (modalType === 'facture') {
        await persistEntity('facture', {
          fk_id_commande: Number(form.fk_id_commande),
          montant_total: Number(form.montant_total),
          date_echeance: form.date_echeance || null,
        }, editingRecord, (payload) => api.post('/factures/', payload).then((response) => response.data));
      }

      const refreshed = await requestData();
      setRows(Array.isArray(refreshed) ? refreshed : []);
      if (paymentOrder) {
        setInvoices(await getFactures());
        setMessage('Paiement enregistré. La facture est disponible dans le tableau des factures.');
      }
      closeModal();
    } catch (error) {
      console.error(error);
      setMessage(getSaveErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleResendOrder = async (order) => {
    setResendingOrderId(order.id_commande);
    setActionError('');
    try {
      await resendCommande(order.id_commande);
      const refreshed = await getCommandes();
      setRows(Array.isArray(refreshed) ? refreshed : []);
    } catch (error) {
      setActionError(getSaveErrorMessage(error));
    } finally {
      setResendingOrderId(null);
    }
  };

  const handleInvoiceDownload = async (invoice) => {
    try {
      const file = await downloadFacture(invoice.id_facture);
      const objectUrl = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${invoice.reference_facture}.pdf`;
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setActionError(getSaveErrorMessage(error));
    }
  };

  const deleteRecord = async () => {
    if (!recordPendingDeletion) return;
    const [endpoint, idField] = entityEndpoints[entity];
    try {
      setActionError('');
      setIsDeleting(true);
      await api.delete(`/${endpoint}/${recordPendingDeletion[idField]}/`);
      setRecordPendingDeletion(null);
      const refreshed = await requestData();
      setRows(Array.isArray(refreshed) ? refreshed : []);
    } catch (error) {
      console.error(error);
      setActionError(getSaveErrorMessage(error));
    } finally {
      setIsDeleting(false);
    }
  };

  const addToPanier = () => {
    if (!Number.isFinite(Number(selectedQuantity)) || Number(selectedQuantity) <= 0) {
      setMessage('La quantité doit être supérieure à zéro.');
      return;
    }
    if (panierItemType === 'hors_catalogue') {
      const name = customItemName.trim();
      const price = Number(customItemPrice);
      if (!name) {
        setMessage('Saisissez le nom de l’article hors catalogue.');
        return;
      }
      if (!customItemPrice.trim() || !Number.isFinite(price) || price < 0) {
        setMessage('Saisissez un prix unitaire valide.');
        return;
      }
      setMessage('');
      setPanier((current) => [...current, {
        ligneLocale: `${Date.now()}-${current.length}`,
        nomProduit: name,
        quantite: Number(selectedQuantity),
        prix: price,
      }]);
      setCustomItemName('');
      setCustomItemPrice('');
      setSelectedQuantity(1);
      return;
    }
    if (!selectedProductId) {
      setMessage('Sélectionnez un produit à ajouter.');
      return;
    }
    const product = products.find((item) => String(item.id_produit) === String(selectedProductId));
    if (!product) {
      setMessage('Le produit sélectionné n’est plus disponible. Actualisez la page puis réessayez.');
      return;
    }
    setMessage('');
    setPanier((current) => {
      const already = current.find((item) => String(item.id_produit) === String(product.id_produit));
      if (already) {
        return current.map((item) => item.id_produit === product.id_produit ? { ...item, quantite: Number(item.quantite) + Number(selectedQuantity) } : item);
      }
      return [...current, { id_produit: product.id_produit, nomProduit: product.nomProduit, quantite: Number(selectedQuantity), prix: Number(product.prixUnitaire) }];
    });
    setSelectedQuantity(1);
    setSelectedProductId('');
  };

  const visibleRows = useMemo(() => {
    if (!rows.length) return [];
    if (entity === 'fournisseur') return rows.map((item) => ({
      id: item.id_fournisseur,
      record: item,
      nom: `${item.nomFournisseur} ${item.prenomFournisseur}`,
      type: item.raisonSociale,
      contact: item.cree_par ? `${item.cree_par.nomUtilisateur || 'Admin'}` : 'Administrateur',
      email: item.email,
      status: 'Actif',
    }));
    if (entity === 'commande') return rows.map((item) => {
      const supplierId = typeof item.fk_id_fournisseur === 'object'
        ? item.fk_id_fournisseur?.id_fournisseur
        : item.fk_id_fournisseur;
      const supplier = suppliers.find((entry) => String(entry.id_fournisseur) === String(supplierId));
      return {
        record: item,
        ref: item.reference,
        supplier: supplier
          ? `${supplier.nomFournisseur || ''} ${supplier.prenomFournisseur || ''}`.trim() || supplier.raisonSociale
          : typeof item.fk_id_fournisseur === 'object'
            ? `${item.fk_id_fournisseur?.nomFournisseur || ''} ${item.fk_id_fournisseur?.prenomFournisseur || ''}`.trim() || 'Fournisseur inconnu'
            : 'Fournisseur inconnu',
        date: formatOrderDate(item.dateCommande),
        total: formatCurrency(item.total || 0),
        status: item.email_status === 'failed'
          ? 'Échec de l’envoi'
          : ({
            en_attente: 'En attente',
            envoye: 'Envoyée',
            confirme: 'Confirmée',
            annulee: 'Refusée',
            livree: 'Livrée',
          }[item.status] || item.status || 'En attente'),
        articles: (item.lignes || []).map((line) => line.nom_produit).join(', '),
      };
    });
    if (entity === 'utilisateur') return rows.map((item) => ({
      record: item,
      nom: `${item.nomUtilisateur} ${item.prenomUtilisateur}`,
      role: item.role || 'achateur',
      email: item.email,
      phone: item.telephone || '—',
    }));
    if (entity === 'paiement') return rows.map((item) => ({
      record: item,
      ref: item.reference_paiement,
      amount: formatCurrency(item.montant),
      mode: item.mode_paiement,
      date: item.date_paiement || '—',
    }));
    if (entity === 'produit') return rows.map((item) => ({
      record: item,
      name: item.nomProduit,
      code: item.codeProduit,
      stock: Number(item.quantiteStock) || 0,
      price: formatCurrency(item.prixUnitaire),
      stockValue: formatCurrency((Number(item.quantiteStock) || 0) * (Number(item.prixUnitaire) || 0)),
      stockStatus: Number(item.quantiteStock) === 0 ? 'Rupture' : Number(item.quantiteStock) <= 5 ? 'À réapprovisionner' : 'Disponible',
      supplier: (() => {
        const supplierId = typeof item.fk_id_fournisseur === 'object'
          ? item.fk_id_fournisseur?.id_fournisseur
          : item.fk_id_fournisseur;
        const supplier = suppliers.find((entry) => String(entry.id_fournisseur) === String(supplierId));
        return supplier
          ? supplier.raisonSociale || `${supplier.prenomFournisseur || ''} ${supplier.nomFournisseur || ''}`.trim()
          : typeof item.fk_id_fournisseur === 'object'
            ? item.fk_id_fournisseur?.raisonSociale || `${item.fk_id_fournisseur?.prenomFournisseur || ''} ${item.fk_id_fournisseur?.nomFournisseur || ''}`.trim() || '—'
            : '—';
      })(),
    }));
    if (entity === 'facture') return rows.map((item) => ({
      record: item,
      ref: item.reference_facture,
      order: item.fk_id_commande || '—',
      amount: formatCurrency(item.montant_total),
      status: 'Payée',
    }));
    return rows;
  }, [entity, rows, suppliers]);

  const displayedRows = useMemo(() => {
    if (entity !== 'produit') return visibleRows;
    const query = productSearch.trim().toLocaleLowerCase('fr');
    return visibleRows.filter((row) => {
      const matchesSearch = !query || [row.name, row.code, row.supplier]
        .some((value) => String(value || '').toLocaleLowerCase('fr').includes(query));
      const matchesStock = productStockFilter === 'all'
        || (productStockFilter === 'low' && row.stock <= 5)
        || (productStockFilter === 'available' && row.stock > 5);
      return matchesSearch && matchesStock;
    });
  }, [entity, productSearch, productStockFilter, visibleRows]);

  const getDeletionLabel = (record) => {
    if (entity === 'produit') return record.nomProduit || 'ce produit';
    if (entity === 'fournisseur') return `${record.prenomFournisseur || ''} ${record.nomFournisseur || ''}`.trim() || record.raisonSociale || 'ce fournisseur';
    if (entity === 'commande') return record.reference || 'cette commande';
    if (entity === 'facture') return record.reference_facture || 'cette facture';
    if (entity === 'paiement') return record.reference_paiement || 'ce paiement';
    if (entity === 'utilisateur') return `${record.prenomUtilisateur || ''} ${record.nomUtilisateur || ''}`.trim() || record.email || 'cet utilisateur';
    return 'cet élément';
  };

  const renderRows = () => {
    if (!displayedRows.length && !loading) {
      const emptyMessage = entity === 'produit' && (productSearch || productStockFilter !== 'all')
        ? 'Aucun produit ne correspond à ces critères.'
        : 'Aucune donnée disponible.';
      return <tr><td colSpan={entity === 'produit' ? 7 : 7} className="entity-empty">{emptyMessage}</td></tr>;
    }

    const renderActions = (record) => (
      <td className="entity-row-actions">
        {entity === 'commande' && record.status === 'confirme' && (
          <button type="button" onClick={() => openPaymentModal(record)}>Payer</button>
        )}
        {entity === 'commande' && record.email_status === 'failed' && (
          <button
            type="button"
            onClick={() => handleResendOrder(record)}
            disabled={resendingOrderId === record.id_commande}
          >
            {resendingOrderId === record.id_commande ? 'Envoi…' : 'Renvoyer'}
          </button>
        )}
        {entity === 'facture' && (
          <button type="button" onClick={() => handleInvoiceDownload(record)}>Télécharger</button>
        )}
        <button type="button" onClick={() => openEditModal(entity, record)} disabled={entity === 'utilisateur' && !isAdmin}>Modifier</button>
        <button type="button" className="entity-delete-action" onClick={() => { setActionError(''); setRecordPendingDeletion(record); }} disabled={entity === 'utilisateur' && !isAdmin}>Supprimer</button>
      </td>
    );

    if (entity === 'fournisseur') {
      return displayedRows.map((row) => (
        <tr key={row.id}>
          <td>{row.nom}<small>{row.type}</small></td>
          <td>{row.contact}</td>
          <td>{row.email}</td>
          <td><StatusPill value={row.status} /></td>
          {renderActions(row.record)}
        </tr>
      ));
    }

    if (entity === 'commande') {
      return displayedRows.map((row, index) => (
        <tr key={`${row.ref}-${index}`}>
          <td>{row.ref}<small>{row.articles || 'Aucun article'}</small></td>
          <td>{row.supplier}</td>
          <td>{row.date}</td>
          <td>{row.total}</td>
          <td><StatusPill value={row.status} /></td>
          {renderActions(row.record)}
        </tr>
      ));
    }

    if (entity === 'utilisateur') {
      return displayedRows.map((row, index) => (
        <tr key={`${row.nom}-${index}`}>
          <td>{row.nom}</td>
          <td>{row.role}</td>
          <td>{row.email}</td>
          <td>{row.phone}</td>
          {renderActions(row.record)}
        </tr>
      ));
    }

    if (entity === 'paiement') {
      return displayedRows.map((row, index) => (
        <tr key={`${row.ref}-${index}`}>
          <td>{row.ref}</td>
          <td>{row.amount}</td>
          <td>{row.mode}</td>
          <td>{row.date}</td>
          {renderActions(row.record)}
        </tr>
      ));
    }

    if (entity === 'produit') {
      return displayedRows.map((row, index) => (
        <tr key={`${row.name}-${index}`}>
          <td>{row.name}<small>{row.code}</small></td>
          <td>{row.supplier}</td>
          <td>{row.price}</td>
          <td className="product-stock-quantity">{row.stock} <small>unités</small></td>
          <td>{row.stockValue}</td>
          <td><span className={`product-stock-status${row.stock === 0 ? ' is-empty' : row.stock <= 5 ? ' is-low' : ''}`}>{row.stockStatus}</span></td>
          {renderActions(row.record)}
        </tr>
      ));
    }

    if (entity === 'facture') {
      return displayedRows.map((row, index) => (
        <tr key={`${row.ref}-${index}`}>
          <td>{row.ref}</td>
          <td>{row.order}</td>
          <td>{row.amount}</td>
          <td><StatusPill value={row.status} /></td>
          {renderActions(row.record)}
        </tr>
      ));
    }

    return null;
  };

  const buttonLabel = meta.primaryAction;
  const adminDisabled = meta.adminOnly && !isAdmin;

  return (
    <MainLayout>
      <div className="entity-page">
        <section className="entity-header">
          <div>
            <p className="entity-kicker">MODÈLES DU PROJET</p>
            <h1>{meta.title}</h1>
            <p className="entity-subtitle">{meta.subtitle}</p>
          </div>
          {buttonLabel && <button
            className="entity-primary"
            type="button"
            disabled={adminDisabled}
            onClick={() => openModal(entity)}
            title={adminDisabled ? "Réservé à l'administrateur" : buttonLabel}
          >
            {buttonLabel}
          </button>}
        </section>

        <nav className="entity-tabs" aria-label={`Navigation ${meta.title}`}>
          {meta.tabs.map((tab) => (
            <NavLink key={tab.to} to={tab.to} end className={({ isActive }) => isActive ? 'is-active' : ''}>{tab.label}</NavLink>
          ))}
        </nav>

        <section className="entity-stats" aria-label="Statistiques du module">
          {[{ label: 'Total', value: visibleRows.length || 0, change: 'données actuelles' }, { label: 'État', value: 'Actif', change: 'stable' }, { label: 'Mise à jour', value: '24h', change: 'récente' }, { label: 'Audit', value: 'OK', change: 'sûr' }].map((stat) => (
            <article className="entity-stat" key={stat.label}>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
              <small>{stat.change}</small>
            </article>
          ))}
        </section>

        <section className="entity-panel">
          <div className="entity-panel-header">
            <h2>{meta.title}</h2>
            {entity === 'produit' ? (
              <label className="product-search">
                <span aria-hidden="true">⌕</span>
                <input type="search" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Nom, code ou fournisseur…" aria-label="Rechercher un produit" />
              </label>
            ) : <button type="button" className="entity-link-button">Exporter</button>}
          </div>
          {actionError && <p className="entity-alert" role="alert">{actionError}</p>}

          {entity === 'produit' && (
            <div className="product-stock-filters" role="group" aria-label="Filtrer les produits par état du stock">
              {[['all', `Tous (${rows.length})`], ['low', `À réapprovisionner (${rows.filter((item) => Number(item.quantiteStock) <= 5).length})`], ['available', 'Disponibles']].map(([value, label]) => (
                <button key={value} type="button" className={productStockFilter === value ? 'is-selected' : ''} aria-pressed={productStockFilter === value} onClick={() => setProductStockFilter(value)}>{label}</button>
              ))}
            </div>
          )}

          <div className="entity-table-wrap">
            <table className={`entity-table${entity === 'produit' ? ' product-entity-table' : ''}`}>
              <thead>
                <tr>
                  {entity === 'fournisseur' && <><th>Fournisseur</th><th>Contact</th><th>E-mail</th><th>État</th><th>Actions</th></>}
                  {entity === 'commande' && <><th>Référence</th><th>Fournisseur</th><th>Date</th><th>Montant</th><th>État</th><th>Actions</th></>}
                  {entity === 'utilisateur' && <><th>Utilisateur</th><th>Rôle</th><th>E-mail</th><th>Téléphone</th><th>Actions</th></>}
                  {entity === 'paiement' && <><th>Référence</th><th>Montant</th><th>Mode</th><th>Date</th><th>Actions</th></>}
                  {entity === 'produit' && <><th>Produit</th><th>Fournisseur</th><th>Prix unitaire</th><th>Quantité</th><th>Valeur du stock</th><th>État</th><th>Actions</th></>}
                  {entity === 'facture' && <><th>Référence</th><th>Commande</th><th>Montant</th><th>État</th><th>Actions</th></>}
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan="7" className="entity-empty">Chargement…</td></tr> : renderRows()}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {modalType && (
        <div className="entity-modal-backdrop" onClick={closeModal}>
          <div className="entity-modal" onClick={(event) => event.stopPropagation()}>
            <div className="entity-modal-header">
              <h3>{
                editingRecord ? `Modifier ${modalType}` :
                modalType === 'fournisseur' ? 'Nouvelle relation' :
                modalType === 'commande' ? 'Nouvelle commande' :
                modalType === 'produit' ? 'Ajouter un produit' :
                modalType === 'paiement' ? 'Nouveau paiement' :
                modalType === 'facture' ? 'Nouvelle facture' :
                'Ajouter un utilisateur'
              }</h3>
              <button type="button" className="entity-close" onClick={closeModal}>×</button>
            </div>

            <form onSubmit={handleSubmit} className="entity-form">
              {modalType === 'fournisseur' && (
                <>
                  <div className="entity-grid"><label><span>Nom</span><input name="nomFournisseur" autoComplete="family-name" maxLength={255} required value={form.nomFournisseur || ''} onChange={(e) => setForm({ ...form, nomFournisseur: e.target.value })} /></label><label><span>Prénom</span><input name="prenomFournisseur" autoComplete="given-name" maxLength={255} required value={form.prenomFournisseur || ''} onChange={(e) => setForm({ ...form, prenomFournisseur: e.target.value })} /></label></div>
                  <div className="entity-grid"><label><span>Raison sociale</span><input name="raisonSociale" maxLength={255} required value={form.raisonSociale || ''} onChange={(e) => setForm({ ...form, raisonSociale: e.target.value })} /></label><label><span>Poste</span><input name="posteFournisseur" maxLength={255} value={form.posteFournisseur || ''} onChange={(e) => setForm({ ...form, posteFournisseur: e.target.value })} /></label></div>
                  <div className="entity-grid"><label><span>E-mail</span><input name="email" type="email" autoComplete="email" maxLength={254} required value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label><label><span>Téléphone</span><input name="telephone" type="tel" autoComplete="tel" maxLength={20} value={form.telephone || ''} onChange={(e) => setForm({ ...form, telephone: e.target.value })} /></label></div>
                  <label><span>Adresse</span><textarea name="adresse" autoComplete="street-address" maxLength={255} value={form.adresse || ''} onChange={(e) => setForm({ ...form, adresse: e.target.value })} /></label>
                </>
              )}

              {modalType === 'commande' && (
                <>
                  <label><span>Fournisseur</span><select required value={form.fk_id_fournisseur || ''} onChange={(e) => setForm({ ...form, fk_id_fournisseur: e.target.value })}><option value="">Sélectionner</option>{suppliers.map((item) => <option key={item.id_fournisseur} value={item.id_fournisseur}>{item.nomFournisseur} {item.prenomFournisseur}</option>)}</select></label>
                  {!editingRecord && <p className="entity-form-hint">Référence automatique : CMD-date-numéro unique. Elle est attribuée à l’enregistrement et ne peut pas être dupliquée.</p>}
                  {!editingRecord && <p className="entity-form-hint">La facture sera générée automatiquement à partir des articles et de leurs prix.</p>}

                  {!editingRecord && (
                    <div className="entity-panier-box">
                      <div className="entity-panier-header">
                        <strong>Panier</strong>
                      </div>
                      <label className="entity-panier-type">
                        <span>Type d’article</span>
                        <select value={panierItemType} onChange={(event) => {
                          setPanierItemType(event.target.value);
                          setSelectedProductId('');
                          setCustomItemName('');
                          setCustomItemPrice('');
                        }}>
                          <option value="catalogue">Produit du catalogue</option>
                          <option value="hors_catalogue">Article hors catalogue</option>
                        </select>
                      </label>
                      <div className={`entity-panier-controls${panierItemType === 'hors_catalogue' ? ' is-custom' : ''}`}>
                        {panierItemType === 'catalogue' ? (
                          <select required={panier.length === 0} value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)}>
                            <option value="">Sélectionner un produit</option>
                            {products.map((product) => <option key={product.id_produit} value={product.id_produit}>{product.nomProduit}</option>)}
                          </select>
                        ) : (
                          <>
                            <input
                              aria-label="Nom de l’article hors catalogue"
                              maxLength={255}
                              placeholder="Nom de l’article"
                              required={panier.length === 0}
                              value={customItemName}
                              onChange={(event) => setCustomItemName(event.target.value)}
                            />
                            <input
                              aria-label="Prix unitaire de l’article hors catalogue"
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="Prix unitaire"
                              required={panier.length === 0}
                              value={customItemPrice}
                              onChange={(event) => setCustomItemPrice(event.target.value)}
                            />
                          </>
                        )}
                        <input aria-label="Quantité du produit" type="number" min="0.01" step="0.01" required value={selectedQuantity} onChange={(e) => setSelectedQuantity(e.target.value)} />
                        <button type="button" className="entity-inline-btn" onClick={addToPanier}>Ajouter</button>
                      </div>
                      {panierItemType === 'hors_catalogue' && <p className="entity-form-hint">Après confirmation du fournisseur, cet article sera ajouté au catalogue avec un stock initial de 0.</p>}
                      <div className="entity-panier-list">
                        {panier.length ? panier.map((item) => (
                          <div className="entity-panier-row" key={item.id_produit || item.ligneLocale}>
                            <span>{item.nomProduit}{item.id_produit ? '' : ' (hors catalogue)'}</span>
                            <strong>{item.quantite} x {formatCurrency(item.prix)}</strong>
                          </div>
                        )) : <span className="entity-empty-inline">Aucun produit ajouté.</span>}
                      </div>
                    </div>
                  )}
                </>
              )}

              {modalType === 'produit' && (
                <>
                  <div className="entity-grid"><label><span>Nom du produit</span><input required maxLength={255} value={form.nomProduit || ''} onChange={(e) => setForm({ ...form, nomProduit: e.target.value })} /></label><div><span>Code produit</span><p className="entity-form-hint">{editingRecord?.codeProduit || 'Généré automatiquement à l’enregistrement'}</p></div></div>
                  <div className="entity-grid"><label><span>Prix unitaire</span><input required type="number" min="0" step="0.01" value={form.prixUnitaire ?? ''} onChange={(e) => setForm({ ...form, prixUnitaire: e.target.value })} /></label><label><span>Stock</span><input required type="number" min="0" step="0.01" value={form.quantiteStock ?? ''} onChange={(e) => setForm({ ...form, quantiteStock: e.target.value })} /></label></div>
                  <div className="entity-grid"><label><span>Fournisseur</span><select required value={form.fk_id_fournisseur || ''} onChange={(e) => setForm({ ...form, fk_id_fournisseur: e.target.value })}><option value="">Sélectionner</option>{suppliers.map((item) => <option key={item.id_fournisseur} value={item.id_fournisseur}>{item.nomFournisseur} {item.prenomFournisseur}</option>)}</select></label></div>
                  <label><span>Description</span><textarea value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
                </>
              )}

              {modalType === 'paiement' && (
                <>
                  {paymentOrder && (
                    <div className="entity-panier-box">
                      <strong>Commande {paymentOrder.reference}</strong>
                      <p className="entity-form-hint">
                        Fournisseur : {(() => {
                          const id = typeof paymentOrder.fk_id_fournisseur === 'object'
                            ? paymentOrder.fk_id_fournisseur?.id_fournisseur
                            : paymentOrder.fk_id_fournisseur;
                          const supplier = suppliers.find((item) => String(item.id_fournisseur) === String(id));
                          return supplier
                            ? `${supplier.prenomFournisseur} ${supplier.nomFournisseur}`
                            : paymentOrder.fk_id_fournisseur?.raisonSociale || 'Fournisseur';
                        })()}
                      </p>
                      <div className="entity-panier-list">
                        {(paymentOrder.lignes || []).map((line) => (
                          <div className="entity-panier-row" key={line.id_ligne_commande}>
                            <span>{line.nom_produit} × {line.quantite}</span>
                            <strong>{formatCurrency(Number(line.prix) * Number(line.quantite))}</strong>
                          </div>
                        ))}
                      </div>
                      <p><strong>Total : {formatCurrency(paymentOrder.total)}</strong></p>
                    </div>
                  )}
                  {!paymentOrder && <div className="entity-grid"><label><span>Facture</span><select required value={form.fk_id_facture || ''} onChange={(e) => setForm({ ...form, fk_id_facture: e.target.value })}><option value="">Sélectionner</option>{invoices.map((item) => <option key={item.id_facture} value={item.id_facture}>{item.reference_facture}</option>)}</select></label><label><span>Montant</span><input required type="number" min="0.01" step="0.01" value={form.montant ?? ''} onChange={(e) => setForm({ ...form, montant: e.target.value })} /></label></div>}
                  <div className="entity-grid"><label><span>Mode de paiement</span><select required value={form.mode_paiement || 'Virement'} onChange={(e) => setForm({ ...form, mode_paiement: e.target.value })}><option>Virement</option><option>Carte bancaire</option><option>Prélèvement</option><option>Espèces</option></select></label>{!paymentOrder && <div><span>Référence paiement</span><p className="entity-form-hint">{editingRecord?.reference_paiement || 'Générée automatiquement à l’enregistrement'}</p></div>}</div>
                </>
              )}

              {modalType === 'utilisateur' && (
                <>
                  <div className="entity-grid"><label><span>Nom</span><input required name="nomUtilisateur" maxLength={255} value={form.nomUtilisateur || ''} onChange={(e) => setForm({ ...form, nomUtilisateur: e.target.value })} /></label><label><span>Prénom</span><input required name="prenomUtilisateur" maxLength={255} value={form.prenomUtilisateur || ''} onChange={(e) => setForm({ ...form, prenomUtilisateur: e.target.value })} /></label></div>
                  <div className="entity-grid"><label><span>E-mail</span><input required type="email" name="email" maxLength={254} value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label><label><span>Téléphone</span><input type="tel" maxLength={20} value={form.telephone || ''} onChange={(e) => setForm({ ...form, telephone: e.target.value })} /></label></div>
                  <div className="entity-grid">
                    <label>
                      <span>Mot de passe {editingRecord && '(laisser vide pour conserver)'}</span>
                      <PasswordInput
                        name="password"
                        autoComplete="new-password"
                        placeholder={editingRecord ? 'Nouveau mot de passe (facultatif)' : '8 caractères minimum'}
                        minLength={8}
                        required={!editingRecord}
                        value={form.password || ''}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                        inputClassName="entity-password-input"
                      />
                      {(!editingRecord || form.password) && (
                        <small className="password-requirements entity-password-requirements">
                          8 caractères minimum; évitez les mots de passe courants, uniquement numériques
                          ou trop proches des informations personnelles de l’utilisateur.
                        </small>
                      )}
                    </label>
                    <label><span>Rôle</span><select required value={form.role || 'achateur'} onChange={(e) => setForm({ ...form, role: e.target.value })} disabled={!isAdmin}><option value="Admin">Administrateur</option><option value="responsable">Responsable achats</option><option value="achateur">Acheteur</option></select></label>
                  </div>
                </>
              )}

              {modalType === 'facture' && (
                <>
                  <div className="entity-grid"><label><span>Commande</span><select required value={form.fk_id_commande || ''} onChange={(e) => setForm({ ...form, fk_id_commande: e.target.value })}><option value="">Sélectionner</option>{orders.filter((order) => !invoices.some((invoice) => String(invoice.fk_id_commande) === String(order.id_commande) && invoice.id_facture !== editingRecord?.id_facture)).map((item) => <option key={item.id_commande} value={item.id_commande}>{item.reference}</option>)}</select></label><label><span>Montant total (Ar)</span><input required type="number" min="0.01" step="0.01" value={form.montant_total ?? ''} onChange={(e) => setForm({ ...form, montant_total: e.target.value })} /></label></div>
                  <div className="entity-grid"><label><span>Date d’échéance</span><input type="date" value={form.date_echeance || ''} onChange={(e) => setForm({ ...form, date_echeance: e.target.value })} /></label><div><span>Référence facture</span><p className="entity-form-hint">{editingRecord?.reference_facture || 'Générée automatiquement à l’enregistrement'}</p></div></div>
                </>
              )}

              {message && <div className="entity-alert" role="alert">{message}</div>}

              <div className="entity-modal-actions">
                <button type="button" className="entity-secondary" onClick={closeModal} disabled={isSaving}>Annuler</button>
                <button type="submit" className="entity-submit" disabled={isSaving}>{isSaving ? 'Enregistrement…' : editingRecord ? 'Enregistrer les modifications' : 'Enregistrer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {recordPendingDeletion && createPortal(
        <div className="entity-modal-backdrop entity-confirm-backdrop" onClick={() => { if (!isDeleting) setRecordPendingDeletion(null); }}>
          <section className="entity-modal entity-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-confirm-title" aria-describedby="delete-confirm-description" onClick={(event) => event.stopPropagation()}>
            <div className="delete-confirm-icon" aria-hidden="true">!</div>
            <h3 id="delete-confirm-title">Confirmer la suppression</h3>
            <p id="delete-confirm-description">Voulez-vous supprimer définitivement <strong>{getDeletionLabel(recordPendingDeletion)}</strong> ? Cette action peut également supprimer des données associées.</p>
            {actionError && <p className="entity-alert" role="alert">{actionError}</p>}
            <div className="entity-modal-actions">
              <button type="button" className="entity-secondary" onClick={() => setRecordPendingDeletion(null)} disabled={isDeleting}>Annuler</button>
              <button type="button" className="entity-confirm-delete" onClick={deleteRecord} disabled={isDeleting}>{isDeleting ? 'Suppression…' : 'Supprimer définitivement'}</button>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </MainLayout>
  );
}
